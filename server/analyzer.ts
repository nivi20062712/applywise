import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs';
import mammoth from 'mammoth';
import {
  identifySkills,
  calculateReadinessScore,
  cleanHtmlText,
  buildEnhancedSevenDayPlan,
  buildSkillLearningLinks,
  EnhancedSprintDay,
  scoreProofStrength,
} from '../src/utils/skillMatcher';
import {
  normalizeSkillName,
  validateResumeOutput,
  buildFallbackResumeStudioOutput,
  ResumeGenerationInput,
} from '../src/utils/evidenceModel';
import type {
  ModelRegistryEntry,
  InferenceCallRecord,
  AIProviderStatus,
  ProofTaskBrief,
  CareerCoachResponse,
  InterviewQuestionItem,
  RewrittenBulletItem,
  SalaryBenchmarkData,
  ProofAuditResult,
  AnswerEvaluationResult,
  AICopilotResponse,
  ResumeStudioOutput,
  GitHubAIReviewResult,
  JdExtractionOutput,
  JdGapAnalysisResult,
} from '../src/types';

// ============================================================================
// ENVIRONMENT VARIABLE API KEY READERS (NEVER HARDCODE KEYS)
// ============================================================================

export function getNvidiaApiKey(): string {
  const envKey = (process.env.NVIDIA_API_KEY || '').trim();
  if (envKey && envKey !== 'MY_NVIDIA_API_KEY' && envKey.length > 10) {
    return envKey;
  }
  return '';
}

export function getNebiusApiKey(): string {
  const envKey = (process.env.NEBIUS_API_KEY || '').trim();
  if (envKey && envKey !== 'MY_NEBIUS_API_KEY' && envKey.length > 10) {
    return envKey;
  }
  return '';
}

export function getGeminiApiKey(): string {
  const envKey = (process.env.GEMINI_API_KEY || '').trim();
  if (envKey && envKey !== 'MY_GEMINI_API_KEY' && envKey.length > 10) {
    return envKey;
  }
  return '';
}

export const NVIDIA_NIM_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
export const NEBIUS_ENDPOINT = 'https://api.tokenfactory.nebius.com/v1/chat/completions';

// ============================================================================
// SINGLE CONFIGURABLE MODELS REGISTRY
// ============================================================================

export const BASE_MODELS: ModelRegistryEntry[] = [
  {
    id: (process.env.NEMOTRON_FAST_MODEL || 'nvidia/nemotron-3-nano-omni').trim(),
    label: 'NVIDIA Nemotron 3 Nano Omni (Nebius Token Factory · Fast)',
    shortLabel: 'Nemotron 3 Nano Omni',
    provider: 'nebius',
    providerName: 'Nebius Token Factory',
    speedTier: 'fast',
  },
  {
    id: (process.env.NEMOTRON_ULTRA_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b').trim(),
    label: 'NVIDIA Nemotron 3 Ultra 550B (Nebius Token Factory · Deep Reasoning)',
    shortLabel: 'Nemotron 3 Ultra 550B',
    provider: 'nebius',
    providerName: 'Nebius Token Factory',
    speedTier: 'deep',
  },
  {
    id: 'nvidia/nemotron-3.5-lightning-30b-a3b',
    label: 'NVIDIA Nemotron 3.5 Lightning 30B (NVIDIA NIM)',
    shortLabel: 'Nemotron 3.5 Lightning',
    provider: 'nvidia',
    providerName: 'NVIDIA NIM',
    speedTier: 'fast',
  },
  {
    id: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash (Fallback & Vision OCR)',
    shortLabel: 'Gemini 3 Flash',
    provider: 'gemini',
    providerName: 'Google Gemini',
    speedTier: 'fast',
  },
];

export function getModelsRegistry(): ModelRegistryEntry[] {
  const customNvidiaModel = (process.env.NVIDIA_MODEL || '').trim();
  if (
    customNvidiaModel &&
    customNvidiaModel !== 'MY_NVIDIA_MODEL' &&
    !BASE_MODELS.some((m) => m.id === customNvidiaModel)
  ) {
    return [
      {
        id: customNvidiaModel,
        label: `NVIDIA NIM (${customNvidiaModel})`,
        shortLabel: customNvidiaModel.split('/').pop() || customNvidiaModel,
        provider: 'nvidia',
        providerName: 'NVIDIA NIM',
        speedTier: 'fast',
      },
      ...BASE_MODELS,
    ];
  }
  return BASE_MODELS;
}

export const MODELS = getModelsRegistry();

// ============================================================================
// REAL TELEMETRY & INFERENCE CALL LOG (NO FAKE TELEMETRY)
// ============================================================================

const recentInferenceCalls: InferenceCallRecord[] = [];
let lastMeasuredLatencyMs: number | null = null;
let lastActiveProviderName: string | null = null;
let lastActiveModelId: string | null = null;

export function recordInferenceCall(entry: {
  endpoint: string;
  provider: string;
  model: string;
  latencyMs: number;
  status: 'live' | 'fallback';
  note?: string;
}): void {
  const safeLatency = Math.max(1, Math.round(entry.latencyMs));
  lastMeasuredLatencyMs = safeLatency;
  lastActiveProviderName = entry.provider;
  lastActiveModelId = entry.model;

  recentInferenceCalls.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    endpoint: entry.endpoint,
    provider: entry.provider,
    model: entry.model,
    latencyMs: safeLatency,
    status: entry.status,
    note: entry.note,
  });

  if (recentInferenceCalls.length > 20) {
    recentInferenceCalls.length = 20;
  }
}

export function getAIProviderStatus(preferredModelId?: string): AIProviderStatus {
  const nvidiaConfigured = Boolean(getNvidiaApiKey());
  const nebiusConfigured = Boolean(getNebiusApiKey());
  const geminiConfigured = Boolean(getGeminiApiKey());
  const anyKeyConfigured = nvidiaConfigured || nebiusConfigured || geminiConfigured;
  const models = getModelsRegistry();

  let defaultModel = models[0].id;
  let activeProvider = 'Built-in Analysis (No API Key Set)';

  if (nvidiaConfigured) {
    activeProvider = 'NVIDIA NIM';
    defaultModel = models.find((m) => m.provider === 'nvidia')?.id || models[0].id;
  } else if (nebiusConfigured) {
    activeProvider = 'Nebius AI Studio';
    defaultModel = models.find((m) => m.provider === 'nebius')?.id || models[2].id;
  } else if (geminiConfigured) {
    activeProvider = 'Google Gemini';
    defaultModel = models.find((m) => m.provider === 'gemini')?.id || 'gemini-3-flash-preview';
  } else {
    defaultModel = 'deterministic-fallback';
  }

  if (preferredModelId) {
    const matchedModel = models.find((m) => m.id === preferredModelId);
    if (matchedModel) {
      const isChosenConfigured =
        (matchedModel.provider === 'nvidia' && nvidiaConfigured) ||
        (matchedModel.provider === 'nebius' && nebiusConfigured) ||
        (matchedModel.provider === 'gemini' && geminiConfigured);
      if (isChosenConfigured) {
        defaultModel = matchedModel.id;
        activeProvider = matchedModel.providerName;
      }
    }
  }

  return {
    nvidiaConfigured,
    nebiusConfigured,
    geminiConfigured,
    anyKeyConfigured,
    activeProvider: lastActiveProviderName && anyKeyConfigured ? lastActiveProviderName : activeProvider,
    activeModel: lastActiveModelId && anyKeyConfigured ? lastActiveModelId : defaultModel,
    primaryModel: defaultModel,
    fallbackModel: 'meta-llama/Llama-3.3-70B-Instruct',
    lastLatencyMs: lastMeasuredLatencyMs,
    models,
    recentCalls: recentInferenceCalls,
    hackathonTrack: 'Nebius x NVIDIA Hackathon',
  };
}

// ============================================================================
// ROBUST JSON PARSING & VALIDATION (STRIP FENCES & THINK TAGS)
// ============================================================================

export function stripReasoningAndFences(rawContent: string): string {
  if (!rawContent || typeof rawContent !== 'string') return '';
  return rawContent
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1')
    .replace(/^```(?:json)?\s*|\s*```$/gi, '')
    .trim();
}

export function parseAndValidateModelJson<T>(
  rawContent: string,
  validator: (data: unknown) => data is T
): T | null {
  const cleaned = stripReasoningAndFences(rawContent);
  if (!cleaned) return null;

  // Attempt 1: direct parse if it starts with { or [
  try {
    const direct = JSON.parse(cleaned);
    if (validator(direct)) return direct;
  } catch {
    // Continue to substring extraction
  }

  // Attempt 2: extract outermost JSON object {...}
  const objStart = cleaned.indexOf('{');
  const objEnd = cleaned.lastIndexOf('}');
  if (objStart !== -1 && objEnd > objStart) {
    try {
      const sub = JSON.parse(cleaned.slice(objStart, objEnd + 1));
      if (validator(sub)) return sub;
    } catch {
      // Invalid JSON object
    }
  }

  return null;
}

export function extractFirstJsonObject<T = unknown>(rawContent: string): T | null {
  const cleaned = stripReasoningAndFences(rawContent);
  if (!cleaned) return null;
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const objStart = cleaned.indexOf('{');
    const objEnd = cleaned.lastIndexOf('}');
    if (objStart !== -1 && objEnd > objStart) {
      try {
        return JSON.parse(cleaned.slice(objStart, objEnd + 1)) as T;
      } catch {
        return null;
      }
    }
  }
  return null;
}

export interface AnalysisOutput {
  readinessScore: number;
  scoreBreakdown: {
    skillMatch: number;
    evidenceStrength: number;
    experienceRelevance: number;
  };
  summary: string;
  matchedSkills: Array<{
    skill: string;
    importance: 'high' | 'medium' | 'low';
    evidenceFound: Array<{
      type: string;
      title: string;
      strength: 'strong' | 'moderate' | 'weak';
    }>;
  }>;
  missingSkills: Array<{
    skill: string;
    importance: 'high' | 'medium' | 'low';
    reason: string;
    recommendedProof: string;
  }>;
  unprovenSkills: Array<{
    skill: string;
    reason: string;
    howToStrengthenEvidence: string;
  }>;
  sevenDayPlan: EnhancedSprintDay[];
  resumeSuggestions: string[];
  tailoredResumeBullets: string[];
  coverLetter: string;
  interviewQuestions: string[];
  nextSteps: string[];
  aiProvider?: string;
  aiModel?: string;
  aiLatencyMs?: number;
  isFallback?: boolean;
}

export function validateAnalysis(data: unknown): data is AnalysisOutput {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  const sb = d.scoreBreakdown as Record<string, unknown> | undefined;
  return (
    typeof d.readinessScore === 'number' &&
    d.readinessScore >= 0 &&
    d.readinessScore <= 100 &&
    Boolean(sb) &&
    typeof sb?.skillMatch === 'number' &&
    Array.isArray(d.matchedSkills) &&
    Array.isArray(d.missingSkills) &&
    Array.isArray(d.unprovenSkills) &&
    Array.isArray(d.sevenDayPlan)
  );
}

// ============================================================================
// UNIFIED AI CALLER WITH 18s TIMEOUT, RETRY-ONCE ON INVALID JSON & FALLBACK
// ============================================================================

interface ProviderOrderItem {
  provider: 'nvidia' | 'nebius' | 'gemini';
  providerName: string;
  model: string;
  apiKey: string;
  endpointUrl?: string;
}

function buildProviderAttemptChain(requestedModelId?: string): ProviderOrderItem[] {
  const nvidiaKey = getNvidiaApiKey();
  const nebiusKey = getNebiusApiKey();
  const geminiKey = getGeminiApiKey();
  const models = getModelsRegistry();
  const chain: ProviderOrderItem[] = [];

  // 1. Honor explicit user-selected model first if its provider key is configured
  if (requestedModelId) {
    const chosen = models.find((m) => m.id === requestedModelId);
    if (chosen) {
      if (chosen.provider === 'nvidia' && nvidiaKey) {
        chain.push({
          provider: 'nvidia',
          providerName: 'NVIDIA NIM',
          model: chosen.id,
          apiKey: nvidiaKey,
          endpointUrl: NVIDIA_NIM_ENDPOINT,
        });
      } else if (chosen.provider === 'nebius' && nebiusKey) {
        chain.push({
          provider: 'nebius',
          providerName: 'Nebius AI Studio',
          model: chosen.id,
          apiKey: nebiusKey,
          endpointUrl: NEBIUS_ENDPOINT,
        });
      } else if (chosen.provider === 'gemini' && geminiKey) {
        chain.push({
          provider: 'gemini',
          providerName: 'Google Gemini',
          model: chosen.id,
          apiKey: geminiKey,
        });
      }
    }
  }

  // 2. Primary Provider: NVIDIA NIM
  if (nvidiaKey) {
    for (const m of models.filter((x) => x.provider === 'nvidia')) {
      if (!chain.some((c) => c.model === m.id)) {
        chain.push({
          provider: 'nvidia',
          providerName: 'NVIDIA NIM',
          model: m.id,
          apiKey: nvidiaKey,
          endpointUrl: NVIDIA_NIM_ENDPOINT,
        });
      }
    }
  }

  // 3. Secondary Provider: Nebius AI Studio
  if (nebiusKey) {
    for (const m of models.filter((x) => x.provider === 'nebius')) {
      if (!chain.some((c) => c.model === m.id)) {
        chain.push({
          provider: 'nebius',
          providerName: 'Nebius AI Studio',
          model: m.id,
          apiKey: nebiusKey,
          endpointUrl: NEBIUS_ENDPOINT,
        });
      }
    }
  }

  // 4. Tertiary Fallback Provider: Gemini
  if (geminiKey) {
    for (const m of models.filter((x) => x.provider === 'gemini')) {
      if (!chain.some((c) => c.model === m.id)) {
        chain.push({
          provider: 'gemini',
          providerName: 'Google Gemini',
          model: m.id,
          apiKey: geminiKey,
        });
      }
    }
  }

  return chain;
}

async function fetchRawCompletionFromProvider(
  item: ProviderOrderItem,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 2200,
  timeoutMs: number = 16000
): Promise<string | null> {
  if (item.provider === 'nvidia' || item.provider === 'nebius') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(item.endpointUrl || NVIDIA_NIM_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${item.apiKey}`,
        },
        body: JSON.stringify({
          model: item.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
          max_tokens: maxTokens,
          chat_template_kwargs: { enable_thinking: false },
        }),
        signal: controller.signal,
      });

      if (!response.ok) return null;
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return data?.choices?.[0]?.message?.content || null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  if (item.provider === 'gemini') {
    try {
      const ai = new GoogleGenAI({
        apiKey: item.apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      const result = await Promise.race<string | null>([
        (async () => {
          const response = await ai.models.generateContent({
            model: item.model,
            contents: `${systemPrompt}\n\n${userPrompt}`,
            config: {
              responseMimeType: 'application/json',
              temperature: 0.2,
            },
          });
          return response.text || null;
        })(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
      ]);
      return result;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Executes an AI JSON request across configured providers, retrying ONCE if a model returns invalid JSON.
 */
async function callStructuredAIWithRetry<T>(params: {
  endpointName: string;
  systemPrompt: string;
  userPrompt: string;
  validator: (data: unknown) => data is T;
  requestedModelId?: string;
  maxTokens?: number;
}): Promise<{
  data: T;
  provider: string;
  model: string;
  latencyMs: number;
} | null> {
  const chain = buildProviderAttemptChain(params.requestedModelId);

  for (const item of chain) {
    const t0 = Date.now();
    // Attempt 1
    const raw1 = await fetchRawCompletionFromProvider(
      item,
      params.systemPrompt,
      params.userPrompt,
      params.maxTokens || 2000,
      14000
    );

    if (raw1) {
      const parsed1 = parseAndValidateModelJson(raw1, params.validator);
      if (parsed1) {
        const latencyMs = Math.max(1, Date.now() - t0);
        recordInferenceCall({
          endpoint: params.endpointName,
          provider: item.providerName,
          model: item.model,
          latencyMs,
          status: 'live',
        });
        return {
          data: parsed1,
          provider: item.providerName,
          model: item.model,
          latencyMs,
        };
      }

      // Retry ONCE on invalid JSON shape
      const repairPrompt = `${params.userPrompt}\n\nIMPORTANT: Your previous response could not be parsed as valid JSON matching the required schema. Output ONLY a single valid JSON object with no markdown fences and no extra commentary.`;
      const raw2 = await fetchRawCompletionFromProvider(
        item,
        params.systemPrompt,
        repairPrompt,
        params.maxTokens || 2000,
        8000
      );
      if (raw2) {
        const parsed2 = parseAndValidateModelJson(raw2, params.validator);
        if (parsed2) {
          const latencyMs = Math.max(1, Date.now() - t0);
          recordInferenceCall({
            endpoint: params.endpointName,
            provider: item.providerName,
            model: item.model,
            latencyMs,
            status: 'live',
            note: 'Validated on JSON retry',
          });
          return {
            data: parsed2,
            provider: item.providerName,
            model: item.model,
            latencyMs,
          };
        }
      }
    }
  }

  return null;
}

// ============================================================================
// DOCUMENT & OCR TEXT EXTRACTION (Under 4MB limit, fast timeouts)
// ============================================================================

export async function extractDocumentText(
  filePath: string,
  mimeType: string,
  originalName: string,
  candidateHint: string = ''
): Promise<{ text: string; source: string; ocrConfidence: number }> {
  const buffer = fs.readFileSync(filePath);
  return extractDocumentTextFromBuffer(buffer, mimeType, originalName, candidateHint);
}

export async function extractDocumentTextFromBuffer(
  buffer: Buffer,
  mimeType: string,
  originalName: string,
  _candidateHint: string = ''
): Promise<{ text: string; source: string; ocrConfidence: number }> {
  const lowerName = (originalName || 'resume.pdf').toLowerCase();

  // 1. Plain Text / Markdown / CSV / JSON / RTF / HTML
  if (
    mimeType === 'text/plain' ||
    mimeType === 'text/markdown' ||
    mimeType === 'text/csv' ||
    mimeType === 'text/html' ||
    lowerName.endsWith('.txt') ||
    lowerName.endsWith('.md') ||
    lowerName.endsWith('.csv') ||
    lowerName.endsWith('.json') ||
    lowerName.endsWith('.rtf') ||
    lowerName.endsWith('.html')
  ) {
    const raw = buffer.toString('utf8');
    const cleaned = lowerName.endsWith('.html') ? cleanHtmlText(raw) : raw.trim();
    if (cleaned.length > 0) {
      return { text: cleaned.slice(0, 50000), source: 'Text Document', ocrConfidence: 99 };
    }
  }

  // 2. Word DOCX (preserve line breaks so header/candidate name lines remain intact)
  if (
    mimeType.includes('wordprocessingml') ||
    mimeType.includes('msword') ||
    lowerName.endsWith('.docx') ||
    lowerName.endsWith('.doc')
  ) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      if (result.value && result.value.trim().length >= 8) {
        const normalizedDocx = result.value
          .replace(/\r\n/g, '\n')
          .replace(/[ \t]+/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        return {
          text: normalizedDocx.slice(0, 50000),
          source: 'DOCX Document',
          ocrConfidence: 98,
        };
      }
    } catch {
      // Fall through to stream parser
    }
  }

  // 3. PDF Native Extraction (with 3500ms timeout guard)
  const isPdf = mimeType === 'application/pdf' || lowerName.endsWith('.pdf');
  if (isPdf) {
    try {
      const pdfText = await Promise.race<string>([
        (async () => {
          const pdfMod: Record<string, unknown> = (await import('pdf-parse')) as Record<
            string,
            unknown
          >;
          if (typeof pdfMod.PDFParse === 'function') {
            const ParserClass = pdfMod.PDFParse as new (opts: { data: Buffer }) => {
              getText: () => Promise<{ text?: string }>;
              destroy?: () => Promise<void>;
            };
            const parser = new ParserClass({ data: buffer });
            try {
              const out = await parser.getText();
              return out?.text ? String(out.text).trim() : '';
            } finally {
              await parser.destroy?.().catch?.(() => {});
            }
          } else {
            const fn = (pdfMod.default || pdfMod) as (buf: Buffer) => Promise<{ text?: string }>;
            if (typeof fn === 'function') {
              const out = await fn(buffer);
              return out?.text ? String(out.text).trim() : '';
            }
          }
          return '';
        })(),
        new Promise<string>((resolve) => setTimeout(() => resolve(''), 3500)),
      ]);

      if (pdfText && cleanHtmlText(pdfText).length >= 50) {
        const normalizedPdf = pdfText
          .replace(/\r\n/g, '\n')
          .replace(/[ \t]+/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        return { text: normalizedPdf.slice(0, 50000), source: 'PDF Text Layer', ocrConfidence: 96 };
      }
    } catch {
      // Fall through to Vision OCR
    }
  }

  // 4. NVIDIA NIM Vision-Language OCR for Images
  const isImage =
    mimeType.startsWith('image/') ||
    lowerName.endsWith('.jpg') ||
    lowerName.endsWith('.jpeg') ||
    lowerName.endsWith('.png') ||
    lowerName.endsWith('.webp');

  const nvidiaKey = getNvidiaApiKey();
  if (nvidiaKey && isImage && buffer.length < 4 * 1024 * 1024) {
    const t0 = Date.now();
    try {
      const resolvedMime = lowerName.endsWith('.png')
        ? 'image/png'
        : lowerName.endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg';
      const dataUri = `data:${resolvedMime};base64,${buffer.toString('base64')}`;
      const vlRes = await fetch(NVIDIA_NIM_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${nvidiaKey}`,
        },
        body: JSON.stringify({
          model: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Extract all readable text, skills, certifications, and project bullets from this document image accurately. Output plain text only.',
                },
                {
                  type: 'image_url',
                  image_url: { url: dataUri },
                },
              ],
            },
          ],
          max_tokens: 900,
          chat_template_kwargs: { enable_thinking: false },
        }),
        signal: AbortSignal.timeout(6500),
      });

      if (vlRes.ok) {
        const vlData = (await vlRes.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const extracted = String(vlData?.choices?.[0]?.message?.content || '').trim();
        if (extracted.length >= 15) {
          recordInferenceCall({
            endpoint: 'OCR / Vision',
            provider: 'NVIDIA NIM',
            model: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
            latencyMs: Date.now() - t0,
            status: 'live',
          });
          return {
            text: extracted.slice(0, 50000),
            source: 'NVIDIA Nemotron-VL 120B OCR',
            ocrConfidence: extracted.length >= 100 ? 90 : 52,
          };
        }
      }
    } catch {
      // Fall through to Gemini Vision
    }
  }

  // 5. Gemini Multimodal Extraction for Images & Scanned PDFs
  const geminiKey = getGeminiApiKey();
  if (geminiKey && (isImage || isPdf) && buffer.length < 4 * 1024 * 1024) {
    const t0 = Date.now();
    try {
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      const resolvedMime = isPdf
        ? 'application/pdf'
        : lowerName.endsWith('.png')
        ? 'image/png'
        : lowerName.endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg';

      const extracted = await Promise.race<string>([
        (async () => {
          const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [
              {
                inlineData: {
                  data: buffer.toString('base64'),
                  mimeType: resolvedMime,
                },
              },
              'Extract all readable text from this résumé, certificate, or document accurately. Preserve line breaks, the candidate or certificate recipient full name on its own line, headings, skills, education, and project bullets. Output plain text only.',
            ],
          });
          return (response.text || '').trim();
        })(),
        new Promise<string>((resolve) => setTimeout(() => resolve(''), 7500)),
      ]);

      if (extracted.length >= 20) {
        recordInferenceCall({
          endpoint: 'OCR / Vision',
          provider: 'Google Gemini',
          model: 'gemini-3-flash-preview',
          latencyMs: Date.now() - t0,
          status: 'live',
        });
        return {
          text: extracted.slice(0, 50000),
          source: isImage ? 'Gemini Vision OCR' : 'Gemini PDF OCR',
          ocrConfidence: extracted.length >= 100 ? 92 : 52,
        };
      }
    } catch {
      // Fall through to local stream parser
    }
  }

  // 6. Deterministic Binary Text Stream Extractor (NEVER fabricate content from filename or profile!)
  const rawAscii = buffer
    .toString('latin1')
    .replace(/[^\x20-\x7E\n\r]/g, ' ')
    .replace(/\b[A-Za-z0-9+/=]{30,}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const meaningfulTokens = (rawAscii.match(/[A-Za-z][A-Za-z0-9+#.\-/]{2,}/g) || []).filter(
    (w) =>
      !/^(obj|endobj|stream|endstream|xref|trailer|startxref|Font|Type|Page|Pages|Catalog|Filter|FlateDecode|Length|Width|Height|BitsPerComponent|ColorSpace|DeviceRGB|Adobe|JFIF|Exif|PNG|IHDR|IDAT|IEND)$/i.test(
        w
      )
  );

  if (meaningfulTokens.length >= 20 && !isImage) {
    const reconstructed = meaningfulTokens.slice(0, 600).join(' ');
    return {
      text: reconstructed,
      source: isPdf ? 'PDF Stream Parser' : 'Document Stream Parser',
      ocrConfidence: 82,
    };
  }

  // Unreadable image or binary without text layer -> return actual sparse tokens and low OCR confidence
  const sparseText = meaningfulTokens.slice(0, 30).join(' ');
  return {
    text: sparseText,
    source: isImage ? 'Local Image OCR Reader' : 'Local Document Reader',
    ocrConfidence: isImage ? 35 : 42,
  };
}

// ============================================================================
// FULL READINESS ANALYSIS (AI + DETERMINISTIC FALLBACK)
// ============================================================================

export function buildDeterministicAnalysis(
  resumeText: string,
  jobDescription: string,
  evidence: Array<{ skill: string; type: string; title: string; url?: string; attachment_name?: string }>,
  candidateName: string = 'Candidate',
  candidateRoleTitle: string = 'Software Engineer'
): AnalysisOutput {
  const jobSkills = identifySkills(jobDescription);
  const effectiveJobSkills = jobSkills.length
    ? jobSkills
    : ['React', 'JavaScript', 'HTML/CSS', 'Git', 'TypeScript', 'Unit Testing'];
  const resumeSkills = identifySkills(resumeText);

  const matchedSkills: AnalysisOutput['matchedSkills'] = [];
  const missingSkills: AnalysisOutput['missingSkills'] = [];
  const unprovenSkills: AnalysisOutput['unprovenSkills'] = [];

  for (const skill of effectiveJobSkills) {
    const hasEvidence = evidence.filter((e) => e.skill.toLowerCase() === skill.toLowerCase());
    const mentionedInResume = resumeSkills.some((s) => s.toLowerCase() === skill.toLowerCase());

    if (hasEvidence.length > 0) {
      matchedSkills.push({
        skill,
        importance: ['React', 'TypeScript', 'Python', 'SQL', 'Java', 'C++'].includes(skill)
          ? 'high'
          : 'medium',
        evidenceFound: hasEvidence.map((e) => ({
          type: e.type,
          title: e.title,
          strength: scoreProofStrength(e),
        })),
      });
    } else if (mentionedInResume) {
      unprovenSkills.push({
        skill,
        reason: `Claimed in your résumé text, but lacks an attached repository link, certificate file, or verified project in your evidence portfolio.`,
        howToStrengthenEvidence: `Link a GitHub repository, live deployment URL, or certificate demonstrating ${skill} in the Skill Evidence Drawer.`,
      });
      matchedSkills.push({
        skill,
        importance: 'medium',
        evidenceFound: [
          {
            type: 'self-declared',
            title: `Mentioned in résumé (self-declared)`,
            strength: 'weak',
          },
        ],
      });
    } else {
      missingSkills.push({
        skill,
        importance: ['TypeScript', 'React', 'Node.js', 'SQL', 'Unit Testing', 'Java'].includes(skill)
          ? 'high'
          : 'medium',
        reason: `Required by this role, but not yet present in your résumé or attached evidence records.`,
        recommendedProof: `Complete the 2-hour proof task for ${skill} and attach your repository or live URL.`,
      });
    }
  }

  const scores = calculateReadinessScore({
    matchedCount: matchedSkills.length,
    totalRequired: effectiveJobSkills.length,
    verifiedEvidenceCount: evidence.length,
  });

  const primaryRoleMatch = /([^\n]{2,60})\s+(?:at|@)\s+([^\n]{2,50})/i.exec(jobDescription);
  const roleName = primaryRoleMatch
    ? primaryRoleMatch[1].trim()
    : candidateRoleTitle || 'Software Engineer';
  const companyName = primaryRoleMatch ? primaryRoleMatch[2].trim() : 'the hiring organization';

  const sevenDayPlan = buildEnhancedSevenDayPlan(
    roleName,
    missingSkills.map((m) => m.skill),
    unprovenSkills.map((u) => u.skill)
  );

  const verifiedMatched = matchedSkills.filter((m) =>
    m.evidenceFound.some(
      (ev) =>
        ev.type !== 'self-declared' &&
        !/mentioned in r[eé]sum[eé]/i.test(ev.title || '')
    )
  );
  const selfDeclaredMatched = matchedSkills.filter((m) =>
    m.evidenceFound.every(
      (ev) =>
        ev.type === 'self-declared' ||
        /mentioned in r[eé]sum[eé]/i.test(ev.title || '')
    )
  );

  const verifiedTemplates = [
    (skill: string, proofTitle: string) =>
      `Architected ${skill} workflows in "${proofTitle}", reducing p95 response latency by [X%] across [N] core endpoints.`,
    (skill: string, proofTitle: string) =>
      `Built and deployed "${proofTitle}" using ${skill}, maintaining [X%] automated test coverage across production modules.`,
    (skill: string, proofTitle: string) =>
      `Implemented modular ${skill} architecture for "${proofTitle}", supporting [N]+ concurrent requests and streamlined delivery.`,
    (skill: string, proofTitle: string) =>
      `Delivered production-ready ${skill} components in "${proofTitle}", cutting manual verification overhead by [X%].`,
    (skill: string, proofTitle: string) =>
      `Designed fault-tolerant ${skill} pipelines within "${proofTitle}", improving release stability across [N] iterations.`,
  ];

  const selfDeclaredTemplates = [
    (skill: string) =>
      `Familiar with ${skill} for feature implementation and collaborative code reviews.`,
    (skill: string) =>
      `Familiar with ${skill} fundamentals, applying standard patterns in development workflows.`,
    (skill: string) =>
      `Working knowledge of ${skill} for building and debugging modular application components.`,
  ];

  const tailoredResumeBullets: string[] = [
    ...verifiedMatched.map((m, idx) => {
      const validProof = m.evidenceFound.find(
        (ev) =>
          ev.type !== 'self-declared' &&
          !/mentioned in r[eé]sum[eé]/i.test(ev.title || '')
      );
      const proofTitle = validProof?.title || `${m.skill} Project`;
      const fn = verifiedTemplates[idx % verifiedTemplates.length];
      return fn(m.skill, proofTitle);
    }),
    ...selfDeclaredMatched.slice(0, 3).map((m, idx) => {
      const fn = selfDeclaredTemplates[idx % selfDeclaredTemplates.length];
      return fn(m.skill);
    }),
  ];

  if (tailoredResumeBullets.length === 0) {
    tailoredResumeBullets.push(
      `Attach a project repository or certificate in your Proof Vault to generate evidence-backed bullets for ${roleName}.`
    );
  }

  const verifiedSkillNames = verifiedMatched.map((m) => m.skill);
  const verifiedProjectTitles = Array.from(
    new Set(
      verifiedMatched
        .map(
          (m) =>
            m.evidenceFound.find(
              (ev) =>
                ev.type !== 'self-declared' &&
                !/mentioned in r[eé]sum[eé]/i.test(ev.title || '')
            )?.title
        )
        .filter(Boolean)
    )
  );

  const coverLetter =
    verifiedSkillNames.length > 0
      ? `Dear Hiring Team at ${companyName},\n\nI am writing to apply for the ${roleName} position. Through my attached project work—including ${verifiedProjectTitles
          .slice(0, 2)
          .join(' and ')}—I have verified hands-on experience in ${verifiedSkillNames.join(
          ', '
        )}.\n\nEvery technical claim in this application is linked directly to source repositories or credentials in my portfolio so your team can inspect my code and architecture firsthand.\n\nThank you for your time and consideration.\n\nSincerely,\n${
          candidateName || 'Candidate'
        }`
      : `Dear Hiring Team at ${companyName},\n\nI am writing to express my interest in the ${roleName} position. I am currently assembling my project artifacts and repository links so that every technical skill I present is backed by inspectable work.\n\nThank you for your time and consideration.\n\nSincerely,\n${
          candidateName || 'Candidate'
        }`;

  const resumeSuggestions = [
    verifiedSkillNames.length > 0
      ? `Lead your Projects section with ${verifiedSkillNames
          .slice(0, 3)
          .join(', ')} where you have attached proof.`
      : `Attach at least one GitHub repository or certificate so your top skills can be marked as verified.`,
    unprovenSkills.length > 0
      ? `Add a repository link or certificate for ${unprovenSkills
          .slice(0, 2)
          .map((s) => s.skill)
          .join(' and ')} to upgrade them from self-declared to verified.`
      : `Replace [X%] and [N] placeholders in your bullets with measured figures from your projects.`,
    missingSkills.length > 0
      ? `Keep ${missingSkills
          .slice(0, 2)
          .map((s) => s.skill)
          .join(' and ')} out of your résumé claims until you complete their sprint tasks.`
      : `Include clickable links to your repositories beside each project bullet.`,
  ];

  const interviewQuestions = [
    `Can you walk us through the architecture and key technical trade-offs in your ${
      verifiedSkillNames[0] || matchedSkills[0]?.skill || 'primary'
    } implementation?`,
    `How do you handle edge cases, testing, and error recovery when working with ${
      verifiedSkillNames[1] || matchedSkills[1]?.skill || 'production services'
    }?`,
    `How would you approach building and validating a feature using ${
      unprovenSkills[0]?.skill || missingSkills[0]?.skill || 'our core stack'
    } during your first 30 days?`,
  ];

  const summary =
    verifiedSkillNames.length > 0
      ? `You have verified proof for ${verifiedSkillNames.length} required ${
          verifiedSkillNames.length === 1 ? 'skill' : 'skills'
        } (${verifiedSkillNames.slice(0, 3).join(', ')}) for ${roleName} at ${companyName}. ${
          unprovenSkills.length > 0
            ? `Add proof for ${unprovenSkills[0].skill} next to raise your readiness score.`
            : missingSkills.length > 0
            ? `Complete the sprint task for ${missingSkills[0].skill} to close your remaining gap.`
            : `Your core skill requirements are backed by attached proof.`
        }`
      : `Your current readiness for ${roleName} at ${companyName} is ${scores.score}%. Add proof for ${
          unprovenSkills[0]?.skill || missingSkills[0]?.skill || 'your top skill'
        } to convert self-declared claims into evidence.`;

  return {
    readinessScore: scores.score,
    scoreBreakdown: {
      skillMatch: scores.skillMatch,
      evidenceStrength: scores.evidenceStrength,
      experienceRelevance: scores.experienceRelevance,
    },
    summary,
    matchedSkills,
    missingSkills,
    unprovenSkills,
    sevenDayPlan,
    resumeSuggestions,
    tailoredResumeBullets,
    coverLetter,
    interviewQuestions,
    nextSteps: [
      unprovenSkills.length > 0
        ? `Add proof for ${unprovenSkills[0].skill} in Skills or Proof Vault.`
        : `Review your verified skill bullets in Résumé Studio.`,
      `Complete your next unfinished day in the 7-day Roadmap sprint.`,
      `Match your verified skills against open roles in Jobs.`,
    ],
    aiProvider: 'Built-in Analysis (Deterministic)',
    aiModel: 'deterministic-engine',
    aiLatencyMs: 2,
    isFallback: true,
  };
}

function buildAnalysisPrompt(
  resumeText: string,
  jobDescription: string,
  evidence: unknown[],
  candidateName: string,
  candidateRoleTitle: string
): string {
  return `Analyze the candidate's résumé (${candidateName}, Target Role: ${candidateRoleTitle}) and evidence against the target job description.
CRITICAL RULES:
- Never fabricate achievements, companies, certifications, or statistics.
- For resume bullets, use placeholders like [X%] or [N] where the candidate must insert their own real metrics.
- If a skill is required by the job but absent from résumé/evidence, classify it as "missingSkills".
- If a skill is in the résumé but lacks independent proof (project, repository, cert), classify it as "unprovenSkills".
- Only classify as "matchedSkills" when verified evidence or clear résumé statements exist.

Return strictly valid JSON (no markdown code fences or commentary) matching this schema:
{
  "readinessScore": number (0-100),
  "scoreBreakdown": { "skillMatch": number, "evidenceStrength": number, "experienceRelevance": number },
  "summary": string,
  "matchedSkills": [{ "skill": string, "importance": "high"|"medium"|"low", "evidenceFound": [{ "type": string, "title": string, "strength": "strong"|"moderate"|"weak" }] }],
  "missingSkills": [{ "skill": string, "importance": "high"|"medium"|"low", "reason": string, "recommendedProof": string }],
  "unprovenSkills": [{ "skill": string, "reason": string, "howToStrengthenEvidence": string }],
  "sevenDayPlan": [{ "day": number, "phase": string, "focusSkill": string, "task": string, "expectedProof": string, "proofType": "GitHub Repo"|"Live Demo"|"Certificate"|"Test Suite"|"Architecture Doc" }],
  "resumeSuggestions": [string],
  "tailoredResumeBullets": [string],
  "coverLetter": string,
  "interviewQuestions": [string],
  "nextSteps": [string]
}

Candidate Résumé:
${resumeText}

Job Description:
${jobDescription}

Verified Evidence Portfolio:
${JSON.stringify(evidence, null, 2)}`;
}

function enrichParsedAnalysis(
  parsed: AnalysisOutput,
  fallbackResult: AnalysisOutput,
  jobDescription: string,
  candidateRoleTitle: string,
  aiProvider: string,
  aiModel: string,
  latencyMs: number
): AnalysisOutput {
  const primaryRoleMatch = /([^\n]{2,60})\s+(?:at|@)\s+([^\n]{2,50})/i.exec(jobDescription);
  const roleName = primaryRoleMatch
    ? primaryRoleMatch[1].trim()
    : candidateRoleTitle || 'Software Engineer';

  parsed.sevenDayPlan = (
    parsed.sevenDayPlan?.length === 7 ? parsed.sevenDayPlan : fallbackResult.sevenDayPlan
  ).map((item: Partial<EnhancedSprintDay>, idx: number) => {
    const fallbackDay = fallbackResult.sevenDayPlan[idx] || fallbackResult.sevenDayPlan[0];
    const focusSkill = item.focusSkill || fallbackDay.focusSkill || 'Software Engineering';
    return {
      day: item.day || idx + 1,
      phase: item.phase || fallbackDay.phase,
      focusSkill,
      task: item.task || fallbackDay.task,
      expectedProof: item.expectedProof || fallbackDay.expectedProof,
      proofType: item.proofType || fallbackDay.proofType,
      resources: buildSkillLearningLinks(focusSkill, roleName),
    };
  });

  parsed.aiProvider = aiProvider;
  parsed.aiModel = aiModel;
  parsed.aiLatencyMs = latencyMs;
  parsed.isFallback = false;
  return parsed;
}

export async function runAIAnalysis(
  resumeText: string,
  jobDescription: string,
  evidence: Array<{ skill: string; type: string; title: string; url?: string; attachment_name?: string }>,
  candidateName: string = 'Candidate',
  candidateRoleTitle: string = 'Software Engineer',
  requestedModelId?: string
): Promise<AnalysisOutput> {
  const t0 = Date.now();
  const fallbackResult = buildDeterministicAnalysis(
    resumeText,
    jobDescription,
    evidence,
    candidateName,
    candidateRoleTitle
  );

  const prompt = buildAnalysisPrompt(
    resumeText,
    jobDescription,
    evidence,
    candidateName,
    candidateRoleTitle
  );

  const aiResult = await callStructuredAIWithRetry<AnalysisOutput>({
    endpointName: 'POST /api/analyze',
    systemPrompt:
      'You are an evidence-based technical career readiness analyzer. Respond ONLY with a valid JSON object matching the requested schema.',
    userPrompt: prompt,
    validator: validateAnalysis,
    requestedModelId,
    maxTokens: 2400,
  });

  if (aiResult) {
    return enrichParsedAnalysis(
      aiResult.data,
      fallbackResult,
      jobDescription,
      candidateRoleTitle,
      aiResult.provider,
      aiResult.model,
      aiResult.latencyMs
    );
  }

  const fallbackLatency = Math.max(1, Date.now() - t0);
  const anyConfigured =
    Boolean(getNvidiaApiKey()) || Boolean(getNebiusApiKey()) || Boolean(getGeminiApiKey());
  recordInferenceCall({
    endpoint: 'POST /api/analyze',
    provider: anyConfigured
      ? 'Built-in Analysis (Provider Fallback)'
      : 'Built-in Analysis (No API Key Set)',
    model: 'deterministic-engine',
    latencyMs: fallbackLatency,
    status: 'fallback',
    note: anyConfigured ? 'Provider timeout or unavailable' : 'No external API key configured',
  });

  return {
    ...fallbackResult,
    aiProvider: anyConfigured
      ? 'Built-in Analysis (Provider Fallback)'
      : 'Built-in Analysis (No API Key Set)',
    aiModel: 'deterministic-engine',
    aiLatencyMs: fallbackLatency,
    isFallback: true,
  };
}

// ============================================================================
// PRIORITY 3: SLIDE-OVER SKILL DRAWER -> 2-HOUR PROOF TASK GENERATOR
// ============================================================================

interface ProofTaskRaw {
  title: string;
  estimatedTime: string;
  goal: string;
  steps: string[];
  acceptanceChecklist: string[];
  recommendedProofToLink: string;
}

export function validateProofTask(data: unknown): data is ProofTaskRaw {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.title === 'string' &&
    d.title.length > 3 &&
    typeof d.goal === 'string' &&
    Array.isArray(d.steps) &&
    d.steps.length >= 2 &&
    Array.isArray(d.acceptanceChecklist) &&
    d.acceptanceChecklist.length >= 2 &&
    typeof d.recommendedProofToLink === 'string'
  );
}

export function buildDeterministicProofTask(
  skill: string,
  targetRole: string,
  latencyMs: number = 2,
  providerLabel: string = 'Built-in Analysis (No API Key Set)'
): ProofTaskBrief {
  const cleanSkill = (skill || 'TypeScript').trim();
  const cleanRole = (targetRole || 'Full Stack Engineer').trim();

  return {
    skill: cleanSkill,
    targetRole: cleanRole,
    title: `${cleanSkill} Production Micro-Deliverable for ${cleanRole}`,
    estimatedTime: '2 hours',
    goal: `Build a focused, self-contained ${cleanSkill} implementation that proves real-world engineering competence for ${cleanRole} interviews.`,
    steps: [
      `Initialize a clean repository with a concise README explaining the problem statement and ${cleanSkill} architecture.`,
      `Implement the core ${cleanSkill} module with input validation, structured error handling, and clean types.`,
      `Write 3 deterministic unit or integration tests verifying happy-path and edge-case behavior.`,
      `Publish the code to GitHub (or deploy a live preview link) and paste the URL into your ApplyWise Proof Vault.`,
    ],
    acceptanceChecklist: [
      `Public GitHub repository or live deployment URL is accessible without login walls.`,
      `Includes at least 3 passing automated test assertions demonstrating ${cleanSkill}.`,
      `README documents setup commands, architectural trade-offs, and sample output.`,
    ],
    recommendedProofToLink: `GitHub repository URL (Strong proof) containing the ${cleanSkill} source code, README, and test runner output.`,
    provider: providerLabel,
    model: 'deterministic-template',
    latencyMs,
    isFallback: true,
  };
}

export async function generateProofTask(params: {
  skill: string;
  targetRole: string;
  currentTier?: string;
  modelId?: string;
}): Promise<ProofTaskBrief> {
  const t0 = Date.now();
  const cleanSkill = (params.skill || 'TypeScript').trim();
  const cleanRole = (params.targetRole || 'Software Engineer').trim();

  const userPrompt = `Design a practical 2-hour mini-project proof task for a candidate targeting "${cleanRole}" who needs to prove hands-on proficiency in "${cleanSkill}" (current proof status: ${
    params.currentTier || 'unverified'
  }).
Return ONLY a valid JSON object matching this exact schema:
{
  "title": "short specific project title",
  "estimatedTime": "2 hours",
  "goal": "1-2 sentence objective",
  "steps": ["step 1 (30m)", "step 2 (45m)", "step 3 (30m)", "step 4 (15m)"],
  "acceptanceChecklist": ["criterion 1", "criterion 2", "criterion 3"],
  "recommendedProofToLink": "specific GitHub repo or live link artifact to attach as Strong proof"
}`;

  const aiRes = await callStructuredAIWithRetry<ProofTaskRaw>({
    endpointName: 'POST /api/proof-task',
    systemPrompt:
      'You are a staff engineering interviewer creating 2-hour verifiable technical proof tasks. Output strictly valid JSON.',
    userPrompt,
    validator: validateProofTask,
    requestedModelId: params.modelId,
    maxTokens: 900,
  });

  if (aiRes) {
    return {
      skill: cleanSkill,
      targetRole: cleanRole,
      title: aiRes.data.title,
      estimatedTime: aiRes.data.estimatedTime || '2 hours',
      goal: aiRes.data.goal,
      steps: aiRes.data.steps.slice(0, 5),
      acceptanceChecklist: aiRes.data.acceptanceChecklist.slice(0, 5),
      recommendedProofToLink: aiRes.data.recommendedProofToLink,
      provider: aiRes.provider,
      model: aiRes.model,
      latencyMs: aiRes.latencyMs,
      isFallback: false,
    };
  }

  const elapsed = Math.max(1, Date.now() - t0);
  const anyConfigured =
    Boolean(getNvidiaApiKey()) || Boolean(getNebiusApiKey()) || Boolean(getGeminiApiKey());
  const providerLabel = anyConfigured
    ? 'Built-in Template (Provider Fallback)'
    : 'Built-in Template (No API Key Set)';

  recordInferenceCall({
    endpoint: 'POST /api/proof-task',
    provider: providerLabel,
    model: 'deterministic-template',
    latencyMs: elapsed,
    status: 'fallback',
  });

  return buildDeterministicProofTask(cleanSkill, cleanRole, elapsed, providerLabel);
}

// ============================================================================
// PRIORITY 5: TABBED AI CAREER COACH (INTERVIEW / ATS BULLETS / SALARY)
// ============================================================================

function validateInterviewPayload(
  data: unknown
): data is { interviewQuestions: InterviewQuestionItem[] } {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.interviewQuestions) || d.interviewQuestions.length < 2) return false;
  return d.interviewQuestions.every(
    (q: unknown) =>
      Boolean(q) &&
      typeof q === 'object' &&
      typeof (q as InterviewQuestionItem).question === 'string' &&
      typeof (q as InterviewQuestionItem).modelAnswerHint === 'string'
  );
}

function validateBulletsPayload(
  data: unknown
): data is { rewrittenBullets: RewrittenBulletItem[] } {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.rewrittenBullets) || d.rewrittenBullets.length < 1) return false;
  return d.rewrittenBullets.every(
    (b: unknown) =>
      Boolean(b) &&
      typeof b === 'object' &&
      typeof (b as RewrittenBulletItem).rewrittenBullet === 'string'
  );
}

function validateSalaryPayload(
  data: unknown
): data is { salaryBenchmark: SalaryBenchmarkData } {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  const sb = d.salaryBenchmark as SalaryBenchmarkData | undefined;
  return (
    Boolean(sb) &&
    Array.isArray(sb?.indiaRanges) &&
    sb.indiaRanges.length >= 2 &&
    Array.isArray(sb?.globalRemoteRanges) &&
    sb.globalRemoteRanges.length >= 2
  );
}

export async function runCareerCoachTab(params: {
  tab: 'interview' | 'bullets' | 'salary';
  candidateName: string;
  targetRole: string;
  skills: string;
  weakSkills: string[];
  sampleDuty?: string;
  modelId?: string;
}): Promise<CareerCoachResponse> {
  const t0 = Date.now();
  const role = (params.targetRole || 'Full-Stack Software Engineer').trim();
  const weakList =
    params.weakSkills && params.weakSkills.length > 0
      ? params.weakSkills.slice(0, 4)
      : ['System Design', 'Unit Testing', 'Cloud Deployment'];

  if (params.tab === 'interview') {
    const prompt = `Generate 3 tough, specific technical interview questions for a candidate targeting "${role}" whose current unverified/weak-spot skills are: ${weakList.join(
      ', '
    )} (existing skills: ${params.skills || 'React, TypeScript, SQL'}).
Return ONLY a valid JSON object matching this schema:
{
  "interviewQuestions": [
    {
      "question": "detailed technical scenario question",
      "whyAsked": "what engineering failure mode or concept this tests",
      "modelAnswerHint": "concrete architectural points and trade-offs to mention in the answer",
      "targetSkill": "skill name"
    }
  ]
}`;

    const aiRes = await callStructuredAIWithRetry<{ interviewQuestions: InterviewQuestionItem[] }>({
      endpointName: 'POST /api/career-coach (interview)',
      systemPrompt:
        'You are a principal technical interviewer. Generate 3 rigorous scenario-based questions with actionable answer hints in valid JSON.',
      userPrompt: prompt,
      validator: validateInterviewPayload,
      requestedModelId: params.modelId,
      maxTokens: 1200,
    });

    if (aiRes) {
      return {
        tab: 'interview',
        interviewQuestions: aiRes.data.interviewQuestions.slice(0, 3),
        provider: aiRes.provider,
        model: aiRes.model,
        latencyMs: aiRes.latencyMs,
        isFallback: false,
      };
    }

    const elapsed = Math.max(1, Date.now() - t0);
    const anyConfigured =
      Boolean(getNvidiaApiKey()) || Boolean(getNebiusApiKey()) || Boolean(getGeminiApiKey());
    const providerLabel = anyConfigured
      ? 'Built-in Analysis (Provider Fallback)'
      : 'Built-in Analysis (No API Key Set)';

    recordInferenceCall({
      endpoint: 'POST /api/career-coach (interview)',
      provider: providerLabel,
      model: 'deterministic-coach',
      latencyMs: elapsed,
      status: 'fallback',
    });

    return {
      tab: 'interview',
      interviewQuestions: [
        {
          targetSkill: weakList[0] || 'System Design',
          question: `When designing a ${role} service using ${
            weakList[0] || 'System Design'
          }, how do you prevent cascading failures under a 10x traffic spike?`,
          whyAsked: `Probes practical resilience patterns rather than textbook definitions in ${
            weakList[0] || 'distributed systems'
          }.`,
          modelAnswerHint: `Discuss bounded queues, circuit breakers, idempotency keys, and graceful degradation with concrete trade-offs.`,
        },
        {
          targetSkill: weakList[1] || 'Unit Testing',
          question: `How do you structure automated tests for ${
            weakList[1] || 'asynchronous APIs'
          } so flaky external dependencies never block CI deployments?`,
          whyAsked: `Verifies whether your ${
            weakList[1] || 'testing'
          } knowledge is backed by real CI/CD habits.`,
          modelAnswerHint: `Explain dependency injection, deterministic contract mocks at network boundaries, and fast in-memory fixtures.`,
        },
        {
          targetSkill: weakList[2] || 'SQL & Data Modeling',
          question: `Walk through how you diagnose and fix a slow query or state bottleneck in ${
            weakList[2] || 'production'
          } without causing downtime.`,
          whyAsked: `Tests debugging methodology and production operational maturity for ${role}.`,
          modelAnswerHint: `Cover query execution plans (EXPLAIN ANALYZE), composite indexing, pagination cursors, and staged rollout.`,
        },
      ],
      provider: providerLabel,
      model: 'deterministic-coach',
      latencyMs: elapsed,
      isFallback: true,
    };
  }

  if (params.tab === 'bullets') {
    const rawDuty = (
      params.sampleDuty ||
      `Built web application features and APIs for ${role} using ${
        params.skills || 'React, TypeScript, and SQL'
      }.`
    ).trim();

    const prompt = `Rewrite the following plain resume duty into 3 high-impact ATS resume bullets for a "${role}" candidate:
Plain duty: "${rawDuty}"
CRITICAL ETHICAL RULE: NEVER invent or fabricate numbers or percentages. Always insert explicit bracketed placeholders like [X%], [N ms], or [M users] where the candidate must fill in their own real measured metrics.
Return ONLY a valid JSON object matching this schema:
{
  "rewrittenBullets": [
    {
      "originalConcept": "short label (e.g. Performance & Scale)",
      "rewrittenBullet": "Action verb + technical implementation + measurable outcome with [X%] / [N] placeholders",
      "placeholdersToFill": ["[X%] latency reduction", "[N] daily requests"]
    }
  ]
}`;

    const aiRes = await callStructuredAIWithRetry<{ rewrittenBullets: RewrittenBulletItem[] }>({
      endpointName: 'POST /api/career-coach (bullets)',
      systemPrompt:
        'You are an ethical ATS resume coach. Rewrite plain duties into impact statements using bracketed placeholders like [X%] instead of fabricated numbers. Output valid JSON.',
      userPrompt: prompt,
      validator: validateBulletsPayload,
      requestedModelId: params.modelId,
      maxTokens: 1000,
    });

    if (aiRes) {
      return {
        tab: 'bullets',
        rewrittenBullets: aiRes.data.rewrittenBullets.slice(0, 3),
        provider: aiRes.provider,
        model: aiRes.model,
        latencyMs: aiRes.latencyMs,
        isFallback: false,
      };
    }

    const elapsed = Math.max(1, Date.now() - t0);
    const anyConfigured =
      Boolean(getNvidiaApiKey()) || Boolean(getNebiusApiKey()) || Boolean(getGeminiApiKey());
    const providerLabel = anyConfigured
      ? 'Built-in Analysis (Provider Fallback)'
      : 'Built-in Analysis (No API Key Set)';

    recordInferenceCall({
      endpoint: 'POST /api/career-coach (bullets)',
      provider: providerLabel,
      model: 'deterministic-coach',
      latencyMs: elapsed,
      status: 'fallback',
    });

    return {
      tab: 'bullets',
      rewrittenBullets: [
        {
          originalConcept: 'Architecture & Delivery',
          rewrittenBullet: `Architected and shipped ${rawDuty.replace(
            /\.$/,
            ''
          )}, reducing p95 response latency by [X%] across [N] production endpoints.`,
          placeholdersToFill: ['[X%] measured latency improvement', '[N] endpoints or modules'],
        },
        {
          originalConcept: 'Reliability & Testing',
          rewrittenBullet: `Hardened ${role} workflows with automated unit and integration tests, increasing test coverage from [X%] to [Y%] and preventing [N] regression defects.`,
          placeholdersToFill: ['[X%] baseline coverage', '[Y%] new coverage', '[N] defects caught'],
        },
        {
          originalConcept: 'Business & User Impact',
          rewrittenBullet: `Collaborated across engineering and product to deliver verifiable ${
            params.skills.split(',')[0] || 'full-stack'
          } capabilities serving [M] active users with [X%] uptime.`,
          placeholdersToFill: ['[M] active users or internal teams', '[X%] measured SLA/uptime'],
        },
      ],
      provider: providerLabel,
      model: 'deterministic-coach',
      latencyMs: elapsed,
      isFallback: true,
    };
  }

  // Tab 3: Salary & Level Benchmarking
  const salaryPrompt = `Provide indicative salary and level benchmarks for "${role}" in India (INR LPA) and Global Remote (USD/year), plus the closest Indian Government / PSU equivalent pay level (7th CPC / IDA).
Label clearly as indicative estimates, not live data.
Return ONLY valid JSON matching:
{
  "salaryBenchmark": {
    "targetRole": "${role}",
    "disclaimer": "Indicative estimate based on historical engineering bands, not live market data.",
    "indiaRanges": [
      { "level": "Entry / SDE-1 (0–2 yrs)", "rangeInr": "₹8L – ₹18L LPA", "notes": "Product & Tier-1 IT" },
      { "level": "Mid / SDE-2 (2–5 yrs)", "rangeInr": "₹18L – ₹38L LPA", "notes": "Requires verified system & repo proof" },
      { "level": "Senior / SDE-3 (5+ yrs)", "rangeInr": "₹38L – ₹72L+ LPA", "notes": "Architecture & ownership scope" }
    ],
    "globalRemoteRanges": [
      { "level": "Mid-Level Remote Engineer", "rangeUsd": "$65,000 – $110,000 / yr", "notes": "Async distributed teams" },
      { "level": "Senior Remote Engineer", "rangeUsd": "$110,000 – $165,000 / yr", "notes": "High autonomy & strong GitHub proof" }
    ],
    "govComparison": {
      "cadre": "NIC Scientist-'B' / ISRO SC / UPSC Class-I Tech",
      "payLevel": "7th CPC Level 10 (₹56,100 – ₹1,77,500 basic · ~₹14L–₹18L gross CTC)",
      "allowancesNote": "Includes DA, HRA, TA, medical, and central government tenure security."
    }
  }
}`;

  const aiSalary = await callStructuredAIWithRetry<{ salaryBenchmark: SalaryBenchmarkData }>({
    endpointName: 'POST /api/career-coach (salary)',
    systemPrompt:
      'You are a compensation benchmarking analyst. Return structured indicative salary bands in valid JSON.',
    userPrompt: salaryPrompt,
    validator: validateSalaryPayload,
    requestedModelId: params.modelId,
    maxTokens: 900,
  });

  if (aiSalary) {
    return {
      tab: 'salary',
      salaryBenchmark: {
        ...aiSalary.data.salaryBenchmark,
        disclaimer:
          'Indicative estimate, not live data. Ranges reflect typical bands for verified technical profiles.',
      },
      provider: aiSalary.provider,
      model: aiSalary.model,
      latencyMs: aiSalary.latencyMs,
      isFallback: false,
    };
  }

  const elapsed = Math.max(1, Date.now() - t0);
  const anyConfigured =
    Boolean(getNvidiaApiKey()) || Boolean(getNebiusApiKey()) || Boolean(getGeminiApiKey());
  const providerLabel = anyConfigured
    ? 'Built-in Benchmark (Provider Fallback)'
    : 'Built-in Benchmark (No API Key Set)';

  recordInferenceCall({
    endpoint: 'POST /api/career-coach (salary)',
    provider: providerLabel,
    model: 'deterministic-benchmark',
    latencyMs: elapsed,
    status: 'fallback',
  });

  return {
    tab: 'salary',
    salaryBenchmark: {
      targetRole: role,
      disclaimer:
        'Indicative estimate, not live data. Figures represent typical engineering & 7th CPC bands for planning.',
      indiaRanges: [
        {
          level: 'Entry / SDE-1 (0–2 yrs)',
          rangeInr: '₹8.5L – ₹18.0L LPA',
          notes: 'Enterprise product & high-growth startups (Bengaluru / Hyderabad / Pune)',
        },
        {
          level: 'Mid-Level / SDE-2 (2–5 yrs)',
          rangeInr: '₹18.0L – ₹36.0L LPA',
          notes: 'Strong premium for verified GitHub repos, Docker/Cloud, and system design proof',
        },
        {
          level: 'Senior / Staff Track (5+ yrs)',
          rangeInr: '₹36.0L – ₹68.0L+ LPA',
          notes: 'Includes base + ESOP/RSU across global capability centers (Google, Microsoft, Zoho)',
        },
      ],
      globalRemoteRanges: [
        {
          level: 'Mid-Level Global Remote',
          rangeUsd: '$65,000 – $105,000 / yr',
          notes: 'Distributed SaaS & AI infrastructure teams hiring internationally',
        },
        {
          level: 'Senior Global Remote',
          rangeUsd: '$110,000 – $160,000 / yr',
          notes: 'Requires strong public proof of work, async communication, and production ownership',
        },
      ],
      govComparison: {
        cadre: 'UPSC Class-I / NIC Scientist-"B" / DRDO & ISRO Scientist-"C"',
        payLevel: '7th CPC Pay Level 10 (₹56,100 – ₹1,77,500 Basic · ~₹14.5L–₹18.5L Gross)',
        allowancesNote:
          'Indicative 7th Central Pay Commission scale plus Dearness Allowance (DA), HRA, Transport, and NPS.',
      },
    },
    provider: providerLabel,
    model: 'deterministic-benchmark',
    latencyMs: elapsed,
    isFallback: true,
  };
}

// Legacy single-note helper kept for backward compatibility
export interface CoachInsightResult {
  author: string;
  handle: string;
  target: string;
  comment: string;
  provider: string;
  model: string;
  latencyMs: number;
  isFallback: boolean;
}

export async function runNvidiaCoachInsight(params: {
  candidateName: string;
  targetRole: string;
  skills: string;
  evidenceCount: number;
  mode?: 'evidence' | 'interview' | 'bullet';
  modelId?: string;
}): Promise<CoachInsightResult> {
  const mode = params.mode || 'evidence';
  const coachRes = await runCareerCoachTab({
    tab: mode === 'interview' ? 'interview' : mode === 'bullet' ? 'bullets' : 'interview',
    candidateName: params.candidateName,
    targetRole: params.targetRole,
    skills: params.skills,
    weakSkills: ['System Design', 'Unit Testing'],
    modelId: params.modelId,
  });

  const comment =
    mode === 'bullet' && coachRes.rewrittenBullets?.[0]
      ? coachRes.rewrittenBullets[0].rewrittenBullet
      : coachRes.interviewQuestions?.[0]
      ? `${coachRes.interviewQuestions[0].question} — Hint: ${coachRes.interviewQuestions[0].modelAnswerHint}`
      : `Attach 1 public GitHub repository and 1 automated test suite for ${params.targetRole} to upgrade your proof strength to Strong.`;

  return {
    author: coachRes.provider,
    handle: coachRes.model,
    target: `${params.targetRole} Readiness`,
    comment,
    provider: coachRes.provider,
    model: coachRes.model,
    latencyMs: coachRes.latencyMs,
    isFallback: coachRes.isFallback,
  };
}

// ============================================================================
// INTERACTIVE AI FEATURE 1: AI PROOF AUDITOR (README / CODE / PROJECT SNIPPET)
// ============================================================================

function validateProofAuditPayload(data: unknown): data is {
  credibilityScore: number;
  strengthTier: 'strong' | 'moderate' | 'weak';
  verdictSummary: string;
  detectedSignals: string[];
  missingElements: string[];
  suggestedBullet: string;
} {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.credibilityScore === 'number' &&
    typeof obj.verdictSummary === 'string' &&
    Array.isArray(obj.detectedSignals) &&
    Array.isArray(obj.missingElements) &&
    typeof obj.suggestedBullet === 'string'
  );
}

export async function auditProofSnippet(params: {
  skill: string;
  targetRole: string;
  proofTitle: string;
  proofUrl?: string;
  proofText: string;
  modelId?: string;
}): Promise<ProofAuditResult> {
  const t0 = Date.now();
  const cleanSkill = (params.skill || 'TypeScript').trim();
  const cleanRole = (params.targetRole || 'Software Engineer').trim();
  const cleanTitle = (params.proofTitle || `${cleanSkill} Implementation`).trim();
  const textSnippet = (params.proofText || '').trim();
  const urlLower = (params.proofUrl || '').toLowerCase();

  const prompt = `Audit the following candidate proof artifact for the skill "${cleanSkill}" targeting "${cleanRole}".
Artifact Title: "${cleanTitle}"
Artifact URL: "${params.proofUrl || 'not provided'}"
Artifact Content / README Excerpt:
"""
${textSnippet.slice(0, 1800)}
"""
Evaluate how credible this proof is to a technical hiring manager. Address the user in the second person ("you/your"). Never fabricate metrics—use [X%] or [N] placeholders in suggestedBullet.
Return ONLY valid JSON matching:
{
  "credibilityScore": 84,
  "strengthTier": "strong",
  "verdictSummary": "1-2 sentences in second person explaining why this artifact is strong/moderate/weak proof of ${cleanSkill}",
  "detectedSignals": ["signal 1", "signal 2", "signal 3"],
  "missingElements": ["missing item 1", "missing item 2"],
  "suggestedBullet": "Action verb + ${cleanSkill} implementation in \\"${cleanTitle}\\" + [X%] / [N] placeholder outcome"
}`;

  const aiRes = await callStructuredAIWithRetry<{
    credibilityScore: number;
    strengthTier: 'strong' | 'moderate' | 'weak';
    verdictSummary: string;
    detectedSignals: string[];
    missingElements: string[];
    suggestedBullet: string;
  }>({
    endpointName: 'POST /api/audit-proof',
    systemPrompt:
      'You are a staff engineering interviewer auditing candidate proof artifacts. Speak in second person ("you/your") and output valid JSON only.',
    userPrompt: prompt,
    validator: validateProofAuditPayload,
    requestedModelId: params.modelId,
    maxTokens: 900,
  });

  if (aiRes) {
    const tier: 'strong' | 'moderate' | 'weak' =
      aiRes.data.credibilityScore >= 78
        ? 'strong'
        : aiRes.data.credibilityScore >= 52
        ? 'moderate'
        : 'weak';
    return {
      skill: cleanSkill,
      targetRole: cleanRole,
      credibilityScore: Math.max(15, Math.min(98, Math.round(aiRes.data.credibilityScore))),
      strengthTier: tier,
      verdictSummary: aiRes.data.verdictSummary,
      detectedSignals: aiRes.data.detectedSignals.slice(0, 4),
      missingElements: aiRes.data.missingElements.slice(0, 3),
      suggestedBullet: aiRes.data.suggestedBullet,
      provider: aiRes.provider,
      model: aiRes.model,
      latencyMs: aiRes.latencyMs,
      isFallback: false,
    };
  }

  // Deterministic engineering signal analysis
  const lower = `${cleanTitle} ${textSnippet} ${urlLower}`.toLowerCase();
  const signals: string[] = [];
  const missing: string[] = [];

  if (urlLower.includes('github.com') || urlLower.includes('gitlab.com') || lower.includes('repo')) {
    signals.push('Public source repository reference');
  } else {
    missing.push('Add a public GitHub or GitLab repository URL');
  }

  if (/(test|vitest|jest|playwright|assert|coverage|ci\/cd|actions)/i.test(lower)) {
    signals.push('Automated testing & verification signals');
  } else {
    missing.push(`Include unit or integration test output for your ${cleanSkill} module`);
  }

  if (/(api|schema|latency|docker|deploy|architecture|async|cache|index|component)/i.test(lower)) {
    signals.push(`Concrete ${cleanSkill} architecture & implementation details`);
  } else {
    missing.push('Document architectural trade-offs and setup instructions in README');
  }

  const detectedSkills = identifySkills(`${cleanTitle} ${textSnippet}`);
  if (detectedSkills.length > 0) {
    signals.push(`Verified stack keywords (${detectedSkills.slice(0, 4).join(', ')})`);
  }

  const baseScore =
    42 +
    (urlLower.startsWith('http') ? 22 : 0) +
    Math.min(24, signals.length * 8) +
    (textSnippet.length > 120 ? 8 : 0);
  const credibilityScore = Math.min(94, Math.max(32, baseScore));
  const strengthTier: 'strong' | 'moderate' | 'weak' =
    credibilityScore >= 76 ? 'strong' : credibilityScore >= 55 ? 'moderate' : 'weak';

  const elapsed = Math.max(1, Date.now() - t0);
  const anyConfigured =
    Boolean(getNvidiaApiKey()) || Boolean(getNebiusApiKey()) || Boolean(getGeminiApiKey());
  const providerLabel = anyConfigured
    ? 'Built-in Proof Auditor (Provider Fallback)'
    : 'Built-in Proof Auditor (No API Key Set)';

  recordInferenceCall({
    endpoint: 'POST /api/audit-proof',
    provider: providerLabel,
    model: 'deterministic-auditor',
    latencyMs: elapsed,
    status: 'fallback',
  });

  return {
    skill: cleanSkill,
    targetRole: cleanRole,
    credibilityScore,
    strengthTier,
    verdictSummary:
      strengthTier === 'strong'
        ? `Your "${cleanTitle}" artifact provides strong, inspectable evidence of ${cleanSkill} for ${cleanRole} roles.`
        : strengthTier === 'moderate'
        ? `Your "${cleanTitle}" summary shows practical ${cleanSkill} usage, and adding a direct repo link or test output will upgrade it to Strong.`
        : `This entry is currently a high-level claim. Link a repository or add concrete implementation notes to verify ${cleanSkill}.`,
    detectedSignals:
      signals.length > 0 ? signals : [`Mentions ${cleanSkill} in project scope`],
    missingElements:
      missing.length > 0
        ? missing
        : ['Add measured latency or test coverage figures to your README'],
    suggestedBullet: `Engineered ${cleanSkill} workflows in "${cleanTitle}", improving reliability by [X%] across [N] core scenarios.`,
    provider: providerLabel,
    model: 'deterministic-auditor',
    latencyMs: elapsed,
    isFallback: true,
  };
}

// ============================================================================
// INTERACTIVE AI FEATURE 2: AI MOCK INTERVIEW ANSWER EVALUATOR
// ============================================================================

function validateAnswerEvalPayload(data: unknown): data is {
  scoreOutOf10: number;
  verdict: string;
  strengths: string[];
  missingProofAngle: string;
  improvedStarAnswer: string;
} {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.scoreOutOf10 === 'number' &&
    typeof obj.verdict === 'string' &&
    Array.isArray(obj.strengths) &&
    typeof obj.missingProofAngle === 'string' &&
    typeof obj.improvedStarAnswer === 'string'
  );
}

export async function evaluateInterviewAnswer(params: {
  question: string;
  targetSkill: string;
  targetRole: string;
  userAnswer: string;
  verifiedProofs: string[];
  modelId?: string;
}): Promise<AnswerEvaluationResult> {
  const t0 = Date.now();
  const cleanSkill = (params.targetSkill || 'System Design').trim();
  const cleanRole = (params.targetRole || 'Software Engineer').trim();
  const answer = (params.userAnswer || '').trim();
  const proofsList =
    params.verifiedProofs && params.verifiedProofs.length > 0
      ? params.verifiedProofs.join(', ')
      : 'your attached portfolio projects';

  const prompt = `Evaluate the candidate's technical interview response for a "${cleanRole}" role.
Question (${cleanSkill}): "${params.question}"
Candidate's Draft Answer:
"""
${answer.slice(0, 1500)}
"""
Candidate's Verified Portfolio Proofs: ${proofsList}

Speak directly to the candidate in the second person ("you/your"). Never invent fake metrics—use [X%] or [N] placeholders in improvedStarAnswer.
Return ONLY valid JSON matching:
{
  "scoreOutOf10": 8,
  "verdict": "1-sentence direct assessment in second person",
  "strengths": ["strength 1", "strength 2"],
  "missingProofAngle": "how you can anchor this answer to your verified proof (${proofsList}) or what trade-off to add",
  "improvedStarAnswer": "Polished 3-4 sentence STAR response referencing your real work and using [X%] / [N] metric placeholders"
}`;

  const aiRes = await callStructuredAIWithRetry<{
    scoreOutOf10: number;
    verdict: string;
    strengths: string[];
    missingProofAngle: string;
    improvedStarAnswer: string;
  }>({
    endpointName: 'POST /api/evaluate-answer',
    systemPrompt:
      'You are a supportive principal engineering interviewer. Critique candidate answers in second person ("you/your") and return valid JSON.',
    userPrompt: prompt,
    validator: validateAnswerEvalPayload,
    requestedModelId: params.modelId,
    maxTokens: 900,
  });

  if (aiRes) {
    return {
      question: params.question,
      targetSkill: cleanSkill,
      scoreOutOf10: Math.max(1, Math.min(10, Math.round(aiRes.data.scoreOutOf10))),
      verdict: aiRes.data.verdict,
      strengths: aiRes.data.strengths.slice(0, 3),
      missingProofAngle: aiRes.data.missingProofAngle,
      improvedStarAnswer: aiRes.data.improvedStarAnswer,
      provider: aiRes.provider,
      model: aiRes.model,
      latencyMs: aiRes.latencyMs,
      isFallback: false,
    };
  }

  const wordCount = answer.split(/\s+/).filter(Boolean).length;
  const mentionsTradeoff = /(trade-off|latency|scale|test|cache|index|retry|error|boundary|queue)/i.test(
    answer
  );
  const mentionsProject = /(built|implemented|designed|project|repo|service|pipeline)/i.test(answer);
  const score = Math.min(
    9,
    Math.max(4, 5 + (wordCount >= 25 ? 2 : 0) + (mentionsTradeoff ? 1 : 0) + (mentionsProject ? 1 : 0))
  );

  const elapsed = Math.max(1, Date.now() - t0);
  const anyConfigured =
    Boolean(getNvidiaApiKey()) || Boolean(getNebiusApiKey()) || Boolean(getGeminiApiKey());
  const providerLabel = anyConfigured
    ? 'Built-in Interview Coach (Provider Fallback)'
    : 'Built-in Interview Coach (No API Key Set)';

  recordInferenceCall({
    endpoint: 'POST /api/evaluate-answer',
    provider: providerLabel,
    model: 'deterministic-eval',
    latencyMs: elapsed,
    status: 'fallback',
  });

  return {
    question: params.question,
    targetSkill: cleanSkill,
    scoreOutOf10: score,
    verdict:
      score >= 8
        ? `Your answer covers practical ${cleanSkill} trade-offs clearly; anchoring it to a specific commit or test metric will make it unforgettable.`
        : `You have a solid starting direction on ${cleanSkill}, and adding concrete failure modes plus a reference to ${proofsList} will elevate your response.`,
    strengths: [
      mentionsTradeoff
        ? `Addresses operational ${cleanSkill} trade-offs rather than purely theoretical definitions`
        : `Directly addresses the core ${cleanSkill} scenario`,
      mentionsProject
        ? 'Grounds the explanation in hands-on implementation experience'
        : 'Clear, structured communication under interview constraints',
    ],
    missingProofAngle: `Explicitly cite ${proofsList} and mention how you validated edge cases under load.`,
    improvedStarAnswer: `In my recent work (${proofsList}), we needed to ensure ${cleanSkill} reliability under peak load. I designed a modular boundary with deterministic validation and automated regression checks, which reduced failure rates by [X%] across [N] endpoints while keeping p95 latency predictable.`,
    provider: providerLabel,
    model: 'deterministic-eval',
    latencyMs: elapsed,
    isFallback: true,
  };
}

// ============================================================================
// INTERACTIVE AI FEATURE 3: CONTEXT-AWARE AI CAREER COPILOT
// ============================================================================

function validateCopilotPayload(data: unknown): data is {
  reply: string;
  actionItems: string[];
  recommendedSkillToProve?: string;
  suggestedPage?: 'skills' | 'roadmap' | 'offers' | 'attachments' | 'resume' | 'applications';
} {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return typeof obj.reply === 'string' && Array.isArray(obj.actionItems);
}

export async function runAICareerCopilot(params: {
  prompt: string;
  targetRole: string;
  readinessScore: number;
  verifiedSkills: string[];
  unprovenSkills: string[];
  missingSkills: string[];
  viewerMode?: 'student' | 'jobseeker';
  modelId?: string;
}): Promise<AICopilotResponse> {
  const t0 = Date.now();
  const userQuestion = (params.prompt || 'How do I increase my readiness score fastest?').trim();
  const cleanRole = (params.targetRole || 'Senior Full-Stack Engineer').trim();
  const verified = params.verifiedSkills || [];
  const unproven = params.unprovenSkills || [];
  const missing = params.missingSkills || [];

  const prompt = `You are ApplyWise's evidence-first AI Career Copilot.
Candidate Context:
- Viewer Mode: ${params.viewerMode || 'jobseeker'}
- Target Role: "${cleanRole}"
- Current Readiness Score: ${params.readinessScore}%
- Verified Skills (backed by proof): ${verified.join(', ') || 'None yet'}
- Unproven Skills (claimed on résumé, need proof): ${unproven.join(', ') || 'None'}
- Missing Skills (required by role, not yet proven): ${missing.join(', ') || 'None'}

User Question: "${userQuestion}"

Rules:
- Speak in the second person ("you/your").
- Prioritize attaching real proof (GitHub repo, deployed link, certificate) over generic advice.
- Never claim an unproven or missing skill is "verified".
Return ONLY valid JSON matching:
{
  "reply": "Clear, concise 2-4 sentence coaching response in second person tailored to the user's exact verified/unproven/missing skills",
  "actionItems": ["concrete step 1", "concrete step 2", "concrete step 3"],
  "recommendedSkillToProve": "${unproven[0] || missing[0] || verified[0] || 'TypeScript'}",
  "suggestedPage": "skills"
}`;

  const aiRes = await callStructuredAIWithRetry<{
    reply: string;
    actionItems: string[];
    recommendedSkillToProve?: string;
    suggestedPage?: 'skills' | 'roadmap' | 'offers' | 'attachments' | 'resume' | 'applications';
  }>({
    endpointName: 'POST /api/ai-copilot',
    systemPrompt:
      'You are an evidence-first career readiness copilot. Speak in second person ("you/your") and output valid JSON only.',
    userPrompt: prompt,
    validator: validateCopilotPayload,
    requestedModelId: params.modelId,
    maxTokens: 900,
  });

  if (aiRes) {
    const validPages = ['skills', 'roadmap', 'offers', 'attachments', 'resume', 'applications'];
    const safePage = validPages.includes(String(aiRes.data.suggestedPage))
      ? aiRes.data.suggestedPage
      : 'skills';
    return {
      reply: aiRes.data.reply,
      actionItems: aiRes.data.actionItems.slice(0, 4),
      recommendedSkillToProve:
        aiRes.data.recommendedSkillToProve || unproven[0] || missing[0] || 'TypeScript',
      suggestedPage: safePage,
      provider: aiRes.provider,
      model: aiRes.model,
      latencyMs: aiRes.latencyMs,
      isFallback: false,
    };
  }

  console.error('[POST /api/ai-copilot] All LLM providers failed for copilot request.');
  throw new Error('AI is unavailable, retry');
}

// ============================================================================
// PART 1: RESUME STUDIO WORDING GENERATOR + CODE VALIDATOR + 1-RETRY + FALLBACK
// ============================================================================

function isResumeStudioShape(data: unknown): data is ResumeStudioOutput {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    Array.isArray(obj.bullets) &&
    typeof obj.skillsLine === 'string' &&
    typeof obj.coverLetter === 'string'
  );
}

export async function generateResumeStudioContent(
  input: ResumeGenerationInput,
  requestedModelId?: string
): Promise<ResumeStudioOutput> {
  const t0 = Date.now();
  const fallback = buildFallbackResumeStudioOutput(input);

  // If zero verified skills, return the clean validated fallback immediately (no bullets, clean skillsLine & coverLetter)
  const chain = buildProviderAttemptChain(requestedModelId);
  if (chain.length === 0) {
    return fallback;
  }

  const systemPrompt = `You are ApplyWise's evidence-strict Résumé Studio generator.
Rules:
1. For each verified skill in verifiedSkills, produce ONE achievement bullet that names the linked evidence title or repo, starting with a DIFFERENT strong action verb each time (never repeat the same first two words across any two bullets). Use [X%] or [N] placeholders for metrics.
2. Never put declared skills in achievement bullets. Place declared skills in "skillsLine" formatted as "Familiar with X, Y, Z" (never describe declared skills as "developed" or "verified").
3. Never mention missing skills in bullets. In "coverLetter", only claim verified skills. If sprintSkillsInProgress is non-empty and sprintInProgress is true, you may add one sentence stating the candidate is "currently building" those sprint skills.
4. NEVER output internal status strings like "(Mentioned in résumé (self-declared))", "self-declared", "Mentioned in", or "unverified".
Return ONLY valid JSON: { "bullets": [{ "skillId": string, "evidenceId": number|string, "text": string }], "skillsLine": string, "coverLetter": string }`;

  const baseUserPrompt = `Generate Résumé Studio JSON for:
Candidate: ${input.candidateName || 'Candidate'}
Target Role: ${input.targetRole}
Target Company: ${input.companyName || (input as any).targetCompany || 'the hiring organization'}
Sprint In Progress: ${Boolean(input.sprintInProgress)}
Sprint Skills In Progress: ${JSON.stringify(input.sprintSkills || (input as any).sprintSkillsInProgress || [])}

Verified Skills (with valid evidence):
${JSON.stringify(input.verifiedSkills, null, 2)}

Declared Skills (no proof attached — put ONLY in skillsLine as "Familiar with ..."):
${JSON.stringify(input.declaredSkills)}`;

  for (const item of chain) {
    // Attempt 1
    const raw1 = await fetchRawCompletionFromProvider(item, systemPrompt, baseUserPrompt, 1600, 12000);
    if (raw1) {
      const parsed1 = parseAndValidateModelJson(raw1, isResumeStudioShape);
      if (parsed1) {
        const check1 = validateResumeOutput(parsed1, input);
        if (check1.valid) {
          recordInferenceCall({
            endpoint: 'POST /api/resume-studio/generate',
            provider: item.providerName,
            model: item.model,
            latencyMs: Date.now() - t0,
            status: 'live',
          });
          return parsed1;
        }

        // Code validator failed -> Regenerate ONCE with the exact error list!
        const retryPrompt = `${baseUserPrompt}\n\nVALIDATION FAILED ON PREVIOUS ATTEMPT. Fix ALL of these errors and return corrected JSON:\n- ${check1.errors.join(
          '\n- '
        )}`;
        const raw2 = await fetchRawCompletionFromProvider(item, systemPrompt, retryPrompt, 1600, 10000);
        if (raw2) {
          const parsed2 = parseAndValidateModelJson(raw2, isResumeStudioShape);
          if (parsed2) {
            const check2 = validateResumeOutput(parsed2, input);
            if (check2.valid) {
              recordInferenceCall({
                endpoint: 'POST /api/resume-studio/generate',
                provider: item.providerName,
                model: item.model,
                latencyMs: Date.now() - t0,
                status: 'live',
                note: 'Passed code validator on retry',
              });
              return parsed2;
            }
          }
        }
      }
    }
  }

  recordInferenceCall({
    endpoint: 'POST /api/resume-studio/generate',
    provider: 'Built-in Validated Template',
    model: 'deterministic-resume-studio',
    latencyMs: Math.max(1, Date.now() - t0),
    status: 'fallback',
  });
  return fallback;
}

// ============================================================================
// PART 2: OPTIONAL AI GITHUB REPO REVIEW (ADVICE ONLY — NEVER CHANGES STATUS)
// ============================================================================

function isGitHubReviewShape(data: unknown): data is GitHubAIReviewResult {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.summary === 'string' &&
    Array.isArray(obj.strengths) &&
    Array.isArray(obj.gaps) &&
    Array.isArray(obj.credibleSkills) &&
    Array.isArray(obj.suggestedFixes)
  );
}

export async function reviewGitHubRepoWithAI(params: {
  owner: string;
  repo: string;
  description?: string;
  readmeText: string;
  treePaths: string[];
  languages: Record<string, number>;
  detectedSkills: string[];
  requestedModelId?: string;
}): Promise<GitHubAIReviewResult> {
  const t0 = Date.now();
  const keyFiles = params.treePaths.slice(0, 60);
  const langNames = Object.keys(params.languages || {});

  const userPrompt = `Review this GitHub repository as technical portfolio evidence.
Repository: ${params.owner}/${params.repo}
Description: ${params.description || 'None'}
Languages: ${langNames.join(', ') || 'None'}
Key File Tree Paths (first 60):
${keyFiles.join('\n')}

README Excerpt:
"""
${(params.readmeText || '').slice(0, 2000)}
"""

Return ONLY valid JSON matching:
{
  "summary": "1-2 sentence constructive review in second person ('you/your')",
  "strengths": ["strength 1", "strength 2"],
  "gaps": ["gap 1", "gap 2"],
  "credibleSkills": ["Skill 1", "Skill 2"],
  "suggestedFixes": ["concrete improvement 1", "concrete improvement 2"]
}`;

  const aiRes = await callStructuredAIWithRetry<GitHubAIReviewResult>({
    endpointName: 'POST /api/github/review',
    systemPrompt:
      'You are a staff engineer reviewing a candidate GitHub repository. Provide constructive advice in second person ("you/your"). Output valid JSON only.',
    userPrompt,
    validator: isGitHubReviewShape,
    requestedModelId: params.requestedModelId,
    maxTokens: 900,
  });

  if (aiRes) {
    return {
      summary: aiRes.data.summary,
      strengths: aiRes.data.strengths.slice(0, 4),
      gaps: aiRes.data.gaps.slice(0, 4),
      credibleSkills: aiRes.data.credibleSkills.slice(0, 6),
      suggestedFixes: aiRes.data.suggestedFixes.slice(0, 4),
    };
  }

  // Deterministic engineering review based on README, file tree, and languages
  const hasTests = keyFiles.some((p) => /(test|spec|__tests__|vitest|jest|pytest|playwright)/i.test(p));
  const hasCi = keyFiles.some((p) => /\.github\/workflows\//i.test(p));
  const hasDocker = keyFiles.some((p) => /dockerfile|docker-compose/i.test(p));
  const hasReadme = (params.readmeText || '').trim().length > 120;

  const strengths: string[] = [];
  const gaps: string[] = [];
  const suggestedFixes: string[] = [];

  if (langNames.length > 0) {
    strengths.push(`Clear language breakdown (${langNames.slice(0, 4).join(', ')}) matching modern stack conventions.`);
  }
  if (hasTests) {
    strengths.push('Includes automated test files in the repository tree.');
  } else {
    gaps.push('No automated unit or integration test suite detected in the file tree.');
    suggestedFixes.push('Add at least 3 unit or integration tests (e.g., Vitest, Jest, or Pytest) so reviewers can verify behavior.');
  }
  if (hasCi) {
    strengths.push('Includes GitHub Actions CI/CD workflow configuration.');
  } else {
    gaps.push('No `.github/workflows` CI pipeline detected.');
    suggestedFixes.push('Add a `.github/workflows/ci.yml` workflow to run your linter and tests on push.');
  }
  if (hasDocker) {
    strengths.push('Containerized setup via Dockerfile / docker-compose.');
  }
  if (hasReadme) {
    strengths.push('Includes a detailed README documenting the project.');
  } else {
    gaps.push('README is brief or missing architecture and setup instructions.');
    suggestedFixes.push('Expand README.md with setup steps, system architecture notes, and sample output.');
  }

  recordInferenceCall({
    endpoint: 'POST /api/github/review',
    provider: 'Built-in Repo Reviewer',
    model: 'deterministic-repo-review',
    latencyMs: Math.max(1, Date.now() - t0),
    status: 'fallback',
  });

  return {
    summary: `Your repository ${params.owner}/${params.repo} shows hands-on code in ${
      langNames.slice(0, 3).join(', ') || 'software development'
    }. ${
      hasTests && hasReadme
        ? 'The combination of documentation and test files makes this credible portfolio proof.'
        : 'Adding automated tests and architecture notes in the README will make this repository stand out to technical reviewers.'
    }`,
    strengths: strengths.length > 0 ? strengths : ['Public source code structure is inspectable.'],
    gaps: gaps.length > 0 ? gaps : ['Could include benchmark or latency numbers in README.'],
    credibleSkills:
      params.detectedSkills.length > 0 ? params.detectedSkills : langNames.slice(0, 4),
    suggestedFixes:
      suggestedFixes.length > 0
        ? suggestedFixes
        : ['Pin a live demo URL or architecture diagram at the top of your README.md.'],
  };
}

// ============================================================================
// PART 3: JD-TO-PROFILE GAP ANALYSIS (AI EXTRACTION + AI EXPLANATION)
// ============================================================================

function isJdExtractionShape(data: unknown): data is JdExtractionOutput {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.roleTitle === 'string' &&
    Array.isArray(obj.mustHave) &&
    Array.isArray(obj.niceToHave)
  );
}

function extractSentenceQuoteForSkill(jdText: string, skill: string): string {
  const sentences = jdText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);

  const lowerSkill = skill.toLowerCase();
  const matched = sentences.find((s) => s.toLowerCase().includes(lowerSkill));
  if (matched) {
    return matched.length > 160 ? matched.slice(0, 157) + '...' : matched;
  }
  return `Required proficiency in ${skill} for core engineering deliverables.`;
}

export function buildDeterministicJdExtraction(
  jdText: string,
  roleHint?: string,
  companyHint?: string
): JdExtractionOutput {
  const cleanJd = jdText.trim();
  const knownSkills = identifySkills(cleanJd);

  // Also detect capitalized technical tokens that might be unknown skills (e.g. GraphQL, Kubernetes, Go, Rust, Terraform, Kafka, Next.js)
  const extraTechRegex =
    /\b(GraphQL|Kubernetes|Terraform|Kafka|RabbitMQ|Next\.js|Vue\.js|Angular|Svelte|Golang|Rust|FastAPI|Django|Spring Boot|Tailwind|Playwright|Prisma|Supabase|Firebase)\b/gi;
  const unknownMatches = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = extraTechRegex.exec(cleanJd)) !== null) {
    const canonical = normalizeSkillName(m[1]).canonical;
    if (!knownSkills.some((k) => k.toLowerCase() === canonical.toLowerCase())) {
      unknownMatches.add(canonical);
    }
  }

  const allSkills = [...knownSkills, ...Array.from(unknownMatches)];

  // Split into mustHave (core / important) and niceToHave based on surrounding context in JD
  const mustHave: JdExtractionOutput['mustHave'] = [];
  const niceToHave: JdExtractionOutput['niceToHave'] = [];

  allSkills.forEach((skill, idx) => {
    const quote = extractSentenceQuoteForSkill(cleanJd, skill);
    const isNiceToHave = /(nice to have|bonus|plus|preferred|good to have|familiarity with|beneficial)/i.test(
      quote
    );
    if (isNiceToHave && idx >= 2) {
      niceToHave.push({
        skill: normalizeSkillName(skill).canonical,
        quote,
      });
    } else {
      mustHave.push({
        skill: normalizeSkillName(skill).canonical,
        importance: idx < 4 ? 'core' : 'important',
        quote,
      });
    }
  });

  // Extract seniority
  let seniority = 'Mid-Level';
  if (/\b(senior|sr\.?|staff|principal|lead)\b/i.test(cleanJd)) seniority = 'Senior';
  else if (/\b(junior|jr\.?|entry[-\s]level|intern|graduate|fresher)\b/i.test(cleanJd))
    seniority = 'Junior / Entry-Level';

  // Extract experience required
  const expMatch = /(\d+\+?\s*(?:to|-)\s*\d+\s*years|\d+\+?\s*years)/i.exec(cleanJd);
  const experienceRequired = expMatch ? `${expMatch[1]} of experience` : '2+ years or equivalent proof';

  // Extract responsibilities
  const bulletLines = cleanJd
    .split(/\n+/)
    .map((l) => l.replace(/^[\s•\-*]+/, '').trim())
    .filter((l) => l.length > 25 && l.length < 180);

  const responsibilities =
    bulletLines.slice(0, 4).length > 0
      ? bulletLines.slice(0, 4)
      : [
          `Design, build, and maintain production features using ${
            allSkills.slice(0, 3).join(', ') || 'the core stack'
          }.`,
          'Write automated tests, participate in code reviews, and ensure high service reliability.',
        ];

  const softSkills: string[] = [];
  if (/communicat/i.test(cleanJd)) softSkills.push('Technical Communication');
  if (/collaborat|cross-functional|team/i.test(cleanJd)) softSkills.push('Cross-Functional Collaboration');
  if (/ownership|autonom/i.test(cleanJd)) softSkills.push('End-to-End Ownership');
  if (softSkills.length === 0) softSkills.push('Problem Solving', 'Code Review Collaboration');

  const redFlags: string[] = [];
  if (/unpaid|24\/7|rockstar|ninja|wear many hats without/i.test(cleanJd)) {
    redFlags.push('Mentions high-pressure or ambiguous scope expectations.');
  }

  const headerMatch = /([^\n]{3,60})\s+(?:at|@)\s+([^\n]{2,50})/i.exec(cleanJd);
  const inferredRole =
    (roleHint && roleHint.trim()) ||
    (headerMatch ? headerMatch[1].trim() : '') ||
    'Software Engineer';

  return {
    roleTitle: inferredRole,
    company: companyHint?.trim() || (headerMatch ? headerMatch[2].trim() : undefined),
    seniority,
    mustHave,
    niceToHave,
    responsibilities,
    softSkills,
    experienceRequired,
    redFlags,
  };
}

export async function extractJdRequirementsWithAI(params: {
  jdText: string;
  roleHint?: string;
  companyHint?: string;
  requestedModelId?: string;
}): Promise<{
  extraction: JdExtractionOutput;
  aiParseFailed: boolean;
  provider: string;
  model: string;
  latencyMs: number;
}> {
  const t0 = Date.now();
  const fallback = buildDeterministicJdExtraction(
    params.jdText,
    params.roleHint,
    params.companyHint
  );

  const chain = buildProviderAttemptChain(params.requestedModelId);
  if (chain.length === 0) {
    return {
      extraction: fallback,
      aiParseFailed: false,
      provider: 'Built-in JD Extractor',
      model: 'deterministic-jd-extractor',
      latencyMs: Math.max(1, Date.now() - t0),
    };
  }

  const userPrompt = `Extract the structured requirements from this Job Description.
Role Hint: "${params.roleHint || ''}"
Company Hint: "${params.companyHint || ''}"
Job Description:
"""
${params.jdText.slice(0, 4500)}
"""

Return ONLY valid JSON matching this exact structure:
{
  "roleTitle": "string",
  "seniority": "Junior | Mid-Level | Senior | Lead",
  "mustHave": [
    { "skill": "React", "importance": "core", "quote": "exact quote from the JD requiring this skill" }
  ],
  "niceToHave": [
    { "skill": "Docker", "importance": "nice-to-have", "quote": "exact quote from the JD" }
  ],
  "responsibilities": ["responsibility 1", "responsibility 2"],
  "softSkills": ["soft skill 1"],
  "experienceRequired": "e.g. 3+ years",
  "redFlags": []
}`;

  const aiRes = await callStructuredAIWithRetry<JdExtractionOutput>({
    endpointName: 'POST /api/jd-analyze (extract)',
    systemPrompt:
      'You are a precise technical job description parser. Extract technical skills, importance weights, and direct quotes from the JD in valid JSON.',
    userPrompt,
    validator: isJdExtractionShape,
    requestedModelId: params.requestedModelId,
    maxTokens: 1600,
  });

  if (aiRes) {
    const normalizedMustHave = (aiRes.data.mustHave || []).map((item) => ({
      skill: normalizeSkillName(item.skill).canonical,
      importance: (item.importance === 'core' ? 'core' : 'important') as 'core' | 'important',
      quote: item.quote || extractSentenceQuoteForSkill(params.jdText, item.skill),
    }));
    const normalizedNiceToHave = (aiRes.data.niceToHave || []).map((item) => ({
      skill: normalizeSkillName(item.skill).canonical,
      quote: item.quote || extractSentenceQuoteForSkill(params.jdText, item.skill),
    }));

    return {
      extraction: {
        roleTitle: params.roleHint?.trim() || aiRes.data.roleTitle || fallback.roleTitle,
        company: params.companyHint?.trim() || aiRes.data.company || fallback.company,
        seniority: aiRes.data.seniority || fallback.seniority,
        mustHave: normalizedMustHave.length > 0 ? normalizedMustHave : fallback.mustHave,
        niceToHave: normalizedNiceToHave,
        responsibilities: Array.isArray(aiRes.data.responsibilities)
          ? aiRes.data.responsibilities.slice(0, 5)
          : fallback.responsibilities,
        softSkills: Array.isArray(aiRes.data.softSkills)
          ? aiRes.data.softSkills.slice(0, 5)
          : fallback.softSkills,
        experienceRequired: aiRes.data.experienceRequired || fallback.experienceRequired,
        redFlags: Array.isArray(aiRes.data.redFlags) ? aiRes.data.redFlags : [],
      },
      aiParseFailed: false,
      provider: aiRes.provider,
      model: aiRes.model,
      latencyMs: aiRes.latencyMs,
    };
  }

  return {
    extraction: fallback,
    aiParseFailed: true,
    provider: 'Built-in JD Extractor (Fallback)',
    model: 'deterministic-jd-extractor',
    latencyMs: Math.max(1, Date.now() - t0),
  };
}

interface JdExplanationShape {
  summary: string;
  strategy: 'apply now' | 'apply after proving X and Y' | 'build skills first';
  strategyLabel: string;
  effortBySkill?: Record<string, 'low' | 'medium' | 'high'>;
}

function isJdExplanationShape(data: unknown): data is JdExplanationShape {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return typeof obj.summary === 'string' && typeof obj.strategyLabel === 'string';
}

export async function explainJdGapWithAI(params: {
  gapAnalysis: JdGapAnalysisResult;
  requestedModelId?: string;
}): Promise<JdExplanationShape> {
  const gap = params.gapAnalysis;
  const fallback: JdExplanationShape = {
    summary: gap.aiSummary || gap.verdictOneLiner || 'Review matched skills against target role.',
    strategy: gap.applicationStrategy || 'apply now',
    strategyLabel: gap.strategyLabel || 'Ready to Apply',
    effortBySkill: Object.fromEntries(
      gap.whatToDoFirst.map((w) => [w.skill, w.estimatedEffort || 'medium'])
    ),
  };

  const chain = buildProviderAttemptChain(params.requestedModelId);
  if (chain.length === 0) {
    return fallback;
  }

  const userPrompt = `Explain this candidate's JD-to-Profile Gap Analysis in plain language (second person "you/your").
CRITICAL: Do NOT change the score (${gap.score}%) and do NOT invent any skills not listed below.
Role: ${gap.roleTitle} at ${gap.company}
Computed Score: ${gap.score}%
Verified Skills ("You can prove"): ${gap.youCanProve.map((s) => s.skill).join(', ') || 'None'}
Declared Skills ("Needs proof"): ${gap.needsProof.map((s) => s.skill).join(', ') || 'None'}
Missing Skills ("Gaps"): ${gap.gaps.map((s) => s.skill).join(', ') || 'None'}
Top 3 Highest-Impact Skills to Prove First: ${gap.whatToDoFirst.map((s) => s.skill).join(', ') || 'None'}

Return ONLY valid JSON:
{
  "summary": "2-3 sentence plain-language summary of the gap",
  "strategy": "apply now" | "apply after proving X and Y" | "build skills first",
  "strategyLabel": "e.g. Apply after proving TypeScript and Docker",
  "effortBySkill": { "SkillName": "low" | "medium" | "high" }
}`;

  const aiRes = await callStructuredAIWithRetry<JdExplanationShape>({
    endpointName: 'POST /api/jd-analyze (explain)',
    systemPrompt:
      'You are an evidence-first career advisor explaining a computed JD gap analysis. Never alter the score or invent skills. Output valid JSON.',
    userPrompt,
    validator: isJdExplanationShape,
    requestedModelId: params.requestedModelId,
    maxTokens: 700,
  });

  if (aiRes) {
    const validStrategies = ['apply now', 'apply after proving X and Y', 'build skills first'];
    const safeStrategy = validStrategies.includes(aiRes.data.strategy)
      ? aiRes.data.strategy
      : fallback.strategy;
    return {
      summary: aiRes.data.summary,
      strategy: safeStrategy,
      strategyLabel: aiRes.data.strategyLabel || fallback.strategyLabel,
      effortBySkill: aiRes.data.effortBySkill || fallback.effortBySkill,
    };
  }

  return fallback;
}

// ============================================================================
// PART 4: UPLOAD CHECK AI CLASSIFICATION & ENTITY EXTRACTION
// ============================================================================

export interface UploadAIClassificationShape {
  type:
    | 'resume'
    | 'certificate'
    | 'project_evidence'
    | 'marksheet'
    | 'id_document'
    | 'job_description'
    | 'non_document_photo'
    | 'other';
  confidence: number;
  reasons: string[];
  extractedPersonName?: string;
  issuer?: string;
  courseTitle?: string;
  issueDate?: string;
  credentialId?: string;
}

function isUploadAIClassificationShape(data: unknown): data is UploadAIClassificationShape {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  const validTypes = [
    'resume',
    'certificate',
    'project_evidence',
    'marksheet',
    'id_document',
    'job_description',
    'non_document_photo',
    'other',
  ];
  return (
    typeof d.type === 'string' &&
    validTypes.includes(d.type) &&
    typeof d.confidence === 'number' &&
    Array.isArray(d.reasons)
  );
}

/**
 * Inspects PNG / JPEG / WebP binary headers to extract image dimensions and EXIF rotation.
 */
export function inspectImageBufferMetadata(buffer: Buffer): {
  width?: number;
  height?: number;
  exifOrientation?: number;
  wasRotated?: boolean;
} {
  if (!buffer || buffer.length < 24) return {};

  // PNG: 89 50 4E 47 0D 0A 1A 0A + IHDR
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height, exifOrientation: 1, wasRotated: false };
  }

  // JPEG / JFIF: FF D8
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    let width: number | undefined;
    let height: number | undefined;
    let exifOrientation = 1;

    while (offset + 4 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buffer[offset + 1];
      offset += 2;

      if (marker === 0xd8 || marker === 0xd9) continue;
      if (offset + 2 > buffer.length) break;
      const segLen = buffer.readUInt16BE(offset);
      if (segLen < 2 || offset + segLen > buffer.length) break;

      // APP1 EXIF
      if (marker === 0xe1 && segLen >= 10) {
        const exifHeader = buffer.toString('ascii', offset + 2, offset + 6);
        if (exifHeader === 'Exif') {
          const tiffStart = offset + 8;
          if (tiffStart + 8 <= buffer.length) {
            const littleEndian = buffer.readUInt16BE(tiffStart) === 0x4949;
            const ifdOffset = littleEndian
              ? buffer.readUInt32LE(tiffStart + 4)
              : buffer.readUInt32BE(tiffStart + 4);
            const ifdStart = tiffStart + ifdOffset;
            if (ifdStart + 2 <= buffer.length) {
              const entries = littleEndian
                ? buffer.readUInt16LE(ifdStart)
                : buffer.readUInt16BE(ifdStart);
              for (let i = 0; i < entries; i++) {
                const entryPos = ifdStart + 2 + i * 12;
                if (entryPos + 12 > buffer.length) break;
                const tag = littleEndian
                  ? buffer.readUInt16LE(entryPos)
                  : buffer.readUInt16BE(entryPos);
                if (tag === 0x0112) {
                  exifOrientation = littleEndian
                    ? buffer.readUInt16LE(entryPos + 8)
                    : buffer.readUInt16BE(entryPos + 8);
                  break;
                }
              }
            }
          }
        }
      }

      // SOF0 / SOF2 dimensions
      if ((marker === 0xc0 || marker === 0xc2) && offset + 7 <= buffer.length) {
        height = buffer.readUInt16BE(offset + 3);
        width = buffer.readUInt16BE(offset + 5);
      }

      offset += segLen;
    }

    return {
      width,
      height,
      exifOrientation,
      wasRotated: exifOrientation > 1,
    };
  }

  return {};
}

export interface VisionDocumentFallbackResult {
  documentType: UploadAIClassificationShape['type'];
  personName: string;
  text: string;
  confidence: number;
  failureReason?: 'blurry' | 'rotated' | 'too_small' | 'not_a_document';
  source: string;
}

/**
 * Vision model fallback (Nemotron-VL / Gemini) when OCR confidence is still < 60% after preprocessing retry.
 * Reads the document image and returns JSON { documentType, personName, text }.
 */
export async function runVisionModelDocumentFallback(params: {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}): Promise<VisionDocumentFallbackResult | null> {
  const { buffer, mimeType, filename } = params;
  if (!buffer || buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
    return null;
  }

  const lowerName = (filename || '').toLowerCase();
  const resolvedMime = lowerName.endsWith('.png') || mimeType === 'image/png'
    ? 'image/png'
    : lowerName.endsWith('.webp') || mimeType === 'image/webp'
    ? 'image/webp'
    : 'image/jpeg';

  const visionPrompt = `Read this uploaded image carefully and return ONLY valid JSON with the following exact shape:
{
  "documentType": "resume" | "certificate" | "project_evidence" | "marksheet" | "id_document" | "job_description" | "non_document_photo" | "other",
  "personName": "Full name of the candidate or certificate recipient if visible, else empty string",
  "text": "All readable text from the document. If this is a selfie, object photo, or non-document image with no document text, set documentType to 'non_document_photo' and text to ''",
  "confidence": 0.0 to 1.0,
  "failureReason": "blurry" | "rotated" | "too_small" | "not_a_document" | ""
}`;

  const parseVisionJson = (
    rawOutput: string,
    sourceLabel: string
  ): VisionDocumentFallbackResult | null => {
    const parsed = extractFirstJsonObject<Record<string, unknown>>(rawOutput);
    if (!parsed || typeof parsed !== 'object') return null;

    const rawType = String(parsed.documentType || 'other').toLowerCase();
    const validTypes: UploadAIClassificationShape['type'][] = [
      'resume',
      'certificate',
      'project_evidence',
      'marksheet',
      'id_document',
      'job_description',
      'non_document_photo',
      'other',
    ];
    const documentType: UploadAIClassificationShape['type'] = validTypes.includes(
      rawType as UploadAIClassificationShape['type']
    )
      ? (rawType as UploadAIClassificationShape['type'])
      : 'other';

    const personName = typeof parsed.personName === 'string' ? parsed.personName.trim() : '';
    const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
    const confidence =
      typeof parsed.confidence === 'number' && !Number.isNaN(parsed.confidence)
        ? Math.max(0, Math.min(1, parsed.confidence))
        : text.length >= 100
        ? 0.85
        : 0.35;

    const rawReason = String(parsed.failureReason || '').toLowerCase();
    const failureReason =
      rawReason === 'blurry' ||
      rawReason === 'rotated' ||
      rawReason === 'too_small' ||
      rawReason === 'not_a_document'
        ? rawReason
        : documentType === 'non_document_photo'
        ? 'not_a_document'
        : undefined;

    return {
      documentType,
      personName,
      text,
      confidence,
      failureReason,
      source: sourceLabel,
    };
  };

  // 1. Try NVIDIA Nemotron-VL
  const nvidiaKey = getNvidiaApiKey();
  if (nvidiaKey) {
    const t0 = Date.now();
    try {
      const dataUri = `data:${resolvedMime};base64,${buffer.toString('base64')}`;
      const vlRes = await fetch(NVIDIA_NIM_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${nvidiaKey}`,
        },
        body: JSON.stringify({
          model: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: visionPrompt },
                { type: 'image_url', image_url: { url: dataUri } },
              ],
            },
          ],
          max_tokens: 1100,
          chat_template_kwargs: { enable_thinking: false },
        }),
        signal: AbortSignal.timeout(7000),
      });

      if (vlRes.ok) {
        const vlData = (await vlRes.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = String(vlData?.choices?.[0]?.message?.content || '').trim();
        const parsed = parseVisionJson(content, 'NVIDIA Nemotron-VL Vision Fallback');
        if (parsed) {
          recordInferenceCall({
            endpoint: 'Vision Fallback JSON',
            provider: 'NVIDIA NIM',
            model: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
            latencyMs: Date.now() - t0,
            status: 'live',
          });
          return parsed;
        }
      }
    } catch {
      // Fall through to Gemini Vision
    }
  }

  // 2. Try Google Gemini Vision (gemini-3-flash-preview)
  const geminiKey = getGeminiApiKey();
  if (geminiKey) {
    const t0 = Date.now();
    try {
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      const response = await Promise.race([
        ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [
            {
              inlineData: {
                data: buffer.toString('base64'),
                mimeType: resolvedMime,
              },
            },
            visionPrompt,
          ],
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 7500)),
      ]);

      if (response && response.text) {
        const parsed = parseVisionJson(response.text.trim(), 'Gemini Vision Fallback');
        if (parsed) {
          recordInferenceCall({
            endpoint: 'Vision Fallback JSON',
            provider: 'Google Gemini',
            model: 'gemini-3-flash-preview',
            latencyMs: Date.now() - t0,
            status: 'live',
          });
          return parsed;
        }
      }
    } catch {
      // Return null if Vision fallback unavailable
    }
  }

  return null;
}

export async function classifyUploadDocumentWithAI(params: {
  extractedText: string;
  requestedModelId?: string;
}): Promise<UploadAIClassificationShape | undefined> {
  const clean = String(params.extractedText || '').trim();
  if (clean.length < 100) return undefined;

  const chain = buildProviderAttemptChain(params.requestedModelId);
  if (chain.length === 0) {
    return undefined;
  }

  const userPrompt = `Classify the following document text strictly from its content (ignore any filename claims) and extract key entities.
Allowed document types: "resume" | "certificate" | "project_evidence" | "marksheet" | "id_document" | "job_description" | "other".
Rules of thumb:
- A résumé has sections like education, experience, skills, projects, and contact details.
- A certificate has an issuer, recipient name, course title, date, and often a credential ID or URL.
- Project evidence has project architecture, README, test results, or code content.
- A marksheet has semester grades, subject codes, SGPA/CGPA, or marks obtained.
- An id_document has government ID fields (Aadhaar, PAN, Passport, Driver's License).
- A job_description has hiring criteria ("About the role", "Responsibilities", "We are looking for").

Document Content:
${clean.slice(0, 4000)}

Return ONLY valid JSON:
{
  "type": "resume" | "certificate" | "project_evidence" | "marksheet" | "id_document" | "job_description" | "other",
  "confidence": 0.92,
  "reasons": ["reason 1", "reason 2"],
  "extractedPersonName": "Exact full name of the candidate or certificate recipient written in the document text (never guess; empty string if none)",
  "issuer": "Certificate issuer if applicable",
  "courseTitle": "Course title if applicable",
  "issueDate": "YYYY-MM-DD if applicable",
  "credentialId": "Credential ID if applicable"
}`;

  const aiRes = await callStructuredAIWithRetry<UploadAIClassificationShape>({
    endpointName: 'POST /api/upload-check',
    systemPrompt:
      'You are a strict document classifier and entity extractor. Decide document type exclusively from content. Respond with valid JSON only.',
    userPrompt,
    validator: isUploadAIClassificationShape,
    requestedModelId: params.requestedModelId,
    maxTokens: 500,
  });

  if (aiRes) {
    return aiRes.data;
  }
  return undefined;
}



