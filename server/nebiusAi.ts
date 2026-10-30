import OpenAI from 'openai';
import { db } from './db';
import { recordInferenceCall } from './analyzer';
import { isTavilyConfigured, tavilySearch } from './tavily';
import {
  buildCloseTheGapStructured,
  buildFastestSkillsStructured,
  buildHonestResumePhrasingStructured,
  buildHonestRewriteStructured,
  buildProofVaultContext,
  buildProofVaultSystemPrompt,
  buildRoleComparisonStructured,
  buildUnifiedCopilotSystemPrompt,
  buildWeekendProjectStructured,
  buildWhyThisScoreStructured,
  DEFAULT_NEMOTRON_FAST_MODEL,
  DEFAULT_NEMOTRON_ULTRA_MODEL,
  NEBIUS_TOKEN_FACTORY_BASE_URL,
  resolveCopilotModelRoute,
  routeQuestionModelTier,
} from '../src/utils/copilotEngine';
import {
  AnalysisData,
  AttachmentItem,
  CopilotApiResponse,
  CopilotChatTurnInput,
  CopilotStructuredResponse,
  CopilotStructuredTask,
  CopilotVaultPayload,
  EvidenceItem,
  Profile,
  ProofVaultContext,
} from '../src/types';

export interface NebiusConfigState {
  baseURL: string;
  apiKeyConfigured: boolean;
  ultraModelId: string;
  fastModelId: string;
  startupChecked: boolean;
  ultraModelAvailable: boolean;
  fastModelAvailable: boolean;
  availableModelsSample: string[];
  startupWarning: string | null;
}

const NVIDIA_COMPATIBLE_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const FALLBACK_FAST_NEMOTRON_ID = 'nvidia/nemotron-3.5-lightning-30b-a3b';

function resolveEffectiveApiKey(): string {
  return (process.env.NEBIUS_API_KEY || process.env.NVIDIA_API_KEY || '').trim();
}

function resolveEffectiveBaseUrl(apiKey: string): string {
  const configuredBaseUrl = (
    process.env.NEBIUS_BASE_URL || NEBIUS_TOKEN_FACTORY_BASE_URL
  ).trim();
  // If the configured key is an NVIDIA NIM key (nvapi-...) and baseURL points to tokenfactory.nebius.com,
  // route to the OpenAI-compatible NVIDIA NIM endpoint so authentication succeeds.
  if (
    apiKey.startsWith('nvapi-') &&
    configuredBaseUrl.includes('tokenfactory.nebius.com')
  ) {
    return NVIDIA_COMPATIBLE_BASE_URL;
  }
  return configuredBaseUrl;
}

const configState: NebiusConfigState = {
  baseURL: resolveEffectiveBaseUrl(resolveEffectiveApiKey()),
  apiKeyConfigured: Boolean(resolveEffectiveApiKey()),
  ultraModelId: (process.env.NEMOTRON_ULTRA_MODEL || DEFAULT_NEMOTRON_ULTRA_MODEL).trim(),
  fastModelId: (process.env.NEMOTRON_FAST_MODEL || DEFAULT_NEMOTRON_FAST_MODEL).trim(),
  startupChecked: false,
  ultraModelAvailable: true,
  fastModelAvailable: true,
  availableModelsSample: [],
  startupWarning: null,
};

export function getNebiusConfigState(): NebiusConfigState {
  const apiKey = resolveEffectiveApiKey();
  configState.baseURL = resolveEffectiveBaseUrl(apiKey);
  configState.apiKeyConfigured = Boolean(apiKey);

  const envUltra = (process.env.NEMOTRON_ULTRA_MODEL || DEFAULT_NEMOTRON_ULTRA_MODEL).trim();
  const envFast = (process.env.NEMOTRON_FAST_MODEL || DEFAULT_NEMOTRON_FAST_MODEL).trim();

  if (!configState.startupChecked) {
    configState.ultraModelId = envUltra;
    configState.fastModelId =
      apiKey.startsWith('nvapi-') && envFast === 'nvidia/nemotron-3-nano-omni'
        ? FALLBACK_FAST_NEMOTRON_ID
        : envFast;
  }

  return { ...configState };
}

function createNebiusClient(timeoutMs = 20000): OpenAI | null {
  const apiKey = resolveEffectiveApiKey();
  if (!apiKey) return null;
  const baseURL = resolveEffectiveBaseUrl(apiKey);
  return new OpenAI({
    baseURL,
    apiKey,
    timeout: timeoutMs,
    maxRetries: 0,
  });
}

/**
 * On startup, call GET /v1/models once, log whether each configured model ID exists,
 * and fall back to an available fast Nemotron model with a clear warning if one is missing.
 */
export async function verifyNebiusModelsOnStartup(): Promise<NebiusConfigState> {
  const state = getNebiusConfigState();
  if (configState.startupChecked) return state;
  configState.startupChecked = true;

  const client = createNebiusClient(10000);
  if (!client) {
    configState.startupWarning = 'NEBIUS_API_KEY is not set in environment.';
    console.warn(`[Nebius Token Factory] WARNING: ${configState.startupWarning}`);
    return getNebiusConfigState();
  }

  try {
    const listResp = await client.models.list();
    const modelIds = new Set<string>();
    for (const m of listResp.data || []) {
      if (m && typeof m.id === 'string') {
        modelIds.add(m.id);
      }
    }

    configState.availableModelsSample = Array.from(modelIds).slice(0, 15);
    const configuredUltra = (
      process.env.NEMOTRON_ULTRA_MODEL || DEFAULT_NEMOTRON_ULTRA_MODEL
    ).trim();
    const configuredFast = (
      process.env.NEMOTRON_FAST_MODEL || DEFAULT_NEMOTRON_FAST_MODEL
    ).trim();

    const hasUltra = modelIds.has(configuredUltra);
    const hasFast = modelIds.has(configuredFast);

    configState.ultraModelAvailable = hasUltra;
    configState.fastModelAvailable = hasFast;

    console.log(
      `[Nebius Token Factory] GET /v1/models check complete (${modelIds.size} models listed on ${state.baseURL}).`
    );
    console.log(
      `[Nebius Token Factory] NEMOTRON_ULTRA_MODEL (${configuredUltra}): ${
        hasUltra ? 'FOUND' : 'MISSING'
      }`
    );
    console.log(
      `[Nebius Token Factory] NEMOTRON_FAST_MODEL (${configuredFast}): ${
        hasFast ? 'FOUND' : 'MISSING'
      }`
    );

    if (!hasFast && modelIds.size > 0) {
      const preferredFast = modelIds.has(FALLBACK_FAST_NEMOTRON_ID)
        ? FALLBACK_FAST_NEMOTRON_ID
        : Array.from(modelIds).find((id) => id.toLowerCase().includes('nemotron')) ||
          Array.from(modelIds)[0];
      configState.startupWarning = `Configured NEMOTRON_FAST_MODEL "${configuredFast}" was not found in GET /v1/models; using available fast model "${preferredFast}".`;
      configState.fastModelId = preferredFast;
      configState.fastModelAvailable = true;
      console.warn(`[Nebius Token Factory] WARNING: ${configState.startupWarning}`);
    } else {
      configState.fastModelId = configuredFast;
    }

    if (!hasUltra) {
      configState.startupWarning = `Configured NEMOTRON_ULTRA_MODEL "${configuredUltra}" was not found in GET /v1/models; falling back to fast model "${configState.fastModelId}".`;
      console.warn(`[Nebius Token Factory] WARNING: ${configState.startupWarning}`);
    } else {
      configState.ultraModelId = configuredUltra;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    configState.startupWarning = `GET /v1/models check failed (${msg}).`;
    console.error(`[Nebius Token Factory] ERROR during startup check:`, msg);
  }

  return getNebiusConfigState();
}

// Per-user rate limiting (30 requests per 60 seconds window)
interface RateLimitBucket {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateLimitBucket>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;

export function checkUserAiRateLimit(userKey: string): {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const key = userKey || 'anon';
  const bucket = rateLimitStore.get(key) || { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);

  if (bucket.timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    const oldest = bucket.timestamps[0] || now;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((RATE_LIMIT_WINDOW_MS - (now - oldest)) / 1000)
    );
    rateLimitStore.set(key, bucket);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
    };
  }

  bucket.timestamps.push(now);
  rateLimitStore.set(key, bucket);
  return {
    allowed: true,
    remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - bucket.timestamps.length),
    retryAfterSeconds: 0,
  };
}

/**
 * Load the logged-in user's real data from SQLite and build the ProofVaultContext.
 */
export function loadUserProofVaultFromDb(params: {
  userId: number;
  viewerModeOverride?: string;
  targetRoleOverride?: string;
}): {
  vault: ProofVaultContext;
  latestAnalysisRow: { id: number; data: string } | null;
} {
  const { userId, viewerModeOverride, targetRoleOverride } = params;

  const profileRow = db
    .prepare('SELECT * FROM profile WHERE user_id = ?')
    .get(userId) as Profile | undefined;

  const rawEvidenceRows = db
    .prepare('SELECT * FROM evidence WHERE user_id = ? ORDER BY id DESC')
    .all(userId) as Array<Record<string, any>>;

  const evidence: EvidenceItem[] = rawEvidenceRows.map((row) => {
    let parsedDetails: Record<string, unknown> = {};
    const rawDetails = row.details || row.details_json;
    if (typeof rawDetails === 'string' && rawDetails.trim()) {
      try {
        parsedDetails = JSON.parse(rawDetails);
      } catch {
        parsedDetails = {};
      }
    }
    return {
      id: row.id,
      user_id: row.user_id,
      skillId: row.skill_id || row.skill,
      skill: row.skill,
      type: row.type,
      title: row.title,
      url: row.url || '',
      status: row.status || 'valid',
      reason: row.reason || '',
      addedAt: row.added_at || '',
      details: parsedDetails,
      attachment_name: row.attachment_name || '',
      extracted_summary: row.extracted_summary || '',
    };
  });

  const attachments = db
    .prepare('SELECT * FROM attachments WHERE user_id = ? ORDER BY id DESC')
    .all(userId) as AttachmentItem[];

  const latestAnalysisRow = db
    .prepare('SELECT id, data FROM analyses WHERE user_id = ? ORDER BY id DESC LIMIT 1')
    .get(userId) as { id: number; data: string } | undefined;

  let latestAnalysis: AnalysisData | null = null;
  if (latestAnalysisRow?.data) {
    try {
      latestAnalysis = JSON.parse(latestAnalysisRow.data) as AnalysisData;
    } catch {
      latestAnalysis = null;
    }
  }

  const vault = buildProofVaultContext({
    profile: profileRow || null,
    evidence,
    attachments,
    analysis: latestAnalysis,
    viewerMode: viewerModeOverride || profileRow?.role || 'jobseeker',
    targetRoleOverride,
  });

  return {
    vault,
    latestAnalysisRow: latestAnalysisRow || null,
  };
}

/**
 * Helper: call Nebius Token Factory chat completion with timeout + 1 retry.
 * Throws on failure — never returns a canned answer.
 */
async function callNebiusWithRetry(params: {
  modelId: string;
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<{ content: string; modelUsed: string; latencyMs: number }> {
  const state = getNebiusConfigState();
  const client = createNebiusClient(params.timeoutMs || 20000);
  if (!client) {
    const err = new Error('NEBIUS_API_KEY is not configured on the server.');
    console.error('[Nebius AI Error]', err.message);
    throw err;
  }

  const modelsToTry = [params.modelId];
  if (params.modelId !== state.fastModelId) {
    modelsToTry.push(state.fastModelId);
  } else if (state.ultraModelAvailable && state.ultraModelId !== params.modelId) {
    modelsToTry.push(state.ultraModelId);
  }

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < modelsToTry.length; attempt++) {
    const modelToUse = modelsToTry[attempt];
    const startMs = Date.now();
    try {
      const requestBody: Record<string, unknown> = {
        model: modelToUse,
        messages: [
          { role: 'system', content: params.systemPrompt },
          ...params.messages,
        ],
        temperature: params.temperature ?? 0.6,
        max_tokens: params.maxTokens ?? 700,
        chat_template_kwargs: { enable_thinking: false },
      };
      if (params.jsonMode) {
        requestBody.response_format = { type: 'json_object' };
      }

      const completion = await (client.chat.completions.create as any)(requestBody);
      const msg = completion.choices?.[0]?.message;
      const content = (msg?.content || '').trim();
      if (content) {
        return {
          content,
          modelUsed: modelToUse,
          latencyMs: Date.now() - startMs,
        };
      }
      throw new Error(`Empty response content from model ${modelToUse}`);
    } catch (err) {
      lastErr = err;
      console.error(
        `[Nebius AI] Attempt ${attempt + 1} failed on model ${modelToUse}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  const errMsg =
    lastErr instanceof Error ? lastErr.message : 'Unknown LLM error';
  console.error('[Nebius AI] All LLM attempts failed:', errMsg);
  throw new Error('AI is unavailable, retry');
}

/**
 * Execute structured JSON AI features via POST /api/ai/structured
 */
export async function executeNebiusStructuredTask(params: {
  userId: number;
  task: CopilotStructuredTask;
  viewerMode?: string;
  targetRole?: string;
  payload?: Record<string, any>;
}): Promise<CopilotStructuredResponse> {
  const startMs = Date.now();
  const state = getNebiusConfigState();
  const { vault, latestAnalysisRow } = loadUserProofVaultFromDb({
    userId: params.userId,
    viewerModeOverride: params.viewerMode,
    targetRoleOverride: params.targetRole || params.payload?.targetRole,
  });

  const route = resolveCopilotModelRoute({
    task: params.task,
    fastModelId: state.fastModelId,
    ultraModelId: state.ultraModelId,
    ultraModelAvailable: state.ultraModelAvailable,
  });

  const systemPrompt = buildProofVaultSystemPrompt(vault);

  let structuredData: any;
  let userPromptForAi = '';

  switch (params.task) {
    case 'chip_fastest_skills': {
      const baseline = buildFastestSkillsStructured(vault);
      structuredData = baseline;
      userPromptForAi = `Return JSON matching {"headline": string, "currentReadinessScore": number, "projectedCombinedScore": number, "cards": [{"skill": string, "currentStatus": "self-declared" | "missing", "why": string, "estimatedScoreGain": number, "projectedScore": number, "fastestProofToAdd": string, "suggestedDeliverable": string, "estimatedTime": string}]} for the top 2 skills that will raise the user's readiness score the fastest. Use only skills from the Proof Vault.`;
      break;
    }
    case 'chip_weekend_project': {
      const baseline = buildWeekendProjectStructured(vault);
      structuredData = baseline;
      userPromptForAi = `Return JSON matching {"projectTitle": string, "targetSkills": string[], "overview": string, "hourByHourPlan": [{"hour": string, "title": string, "tasks": string[], "output": string}], "deliverables": string[], "exactProofArtifact": {"type": "GitHub Repository", "suggestedRepoName": string, "mustIncludeFiles": string[], "howToVerifyInApplyWise": string}} for a 2-hour weekend project that proves the user's top unproven skills.`;
      break;
    }
    case 'chip_compare_roles': {
      const baseline = buildRoleComparisonStructured(vault);
      structuredData = baseline;
      userPromptForAi = `Return JSON comparing the user's readiness for Enterprise Product vs UPSC / NIC Scientist-B matching {"enterpriseRole": {"roleName": string, "trackType": "Enterprise Product", "readinessScore": number, "verifiedMatches": string[], "keyGaps": string[], "selectionFocus": string, "concreteNextStep": string}, "governmentRole": {"roleName": string, "trackType": "UPSC / NIC Scientist-B", "readinessScore": number, "verifiedMatches": string[], "keyGaps": string[], "selectionFocus": string, "concreteNextStep": string}, "comparisonVerdict": string, "fastestPathRecommendation": string}.`;
      break;
    }
    case 'chip_honest_resume': {
      const baseline = buildHonestResumePhrasingStructured(vault);
      structuredData = baseline;
      userPromptForAi = `Return JSON matching {"policySummary": string, "combinedSkillsLine": string, "items": [{"skill": string, "status": "self-declared", "honestBullet": string, "skillsLineWording": string, "whyHonest": string, "avoidOverclaiming": string}]} showing how to phrase the user's self-declared skills honestly on their résumé without overclaiming.`;
      break;
    }
    case 'honest_rewrite': {
      const bulletText = String(params.payload?.bulletText || '').trim();
      const skillHint = String(params.payload?.skill || '').trim();
      const baseline = buildHonestRewriteStructured(vault, bulletText, skillHint);
      structuredData = baseline;
      userPromptForAi = `Rewrite this résumé bullet to be stronger without adding unverifiable claims: "${bulletText}". Skill hint: "${skillHint}". Return JSON matching {"originalBullet": string, "rewrittenBullet": string, "skill": string, "claimRisk": "low" | "medium" | "high", "claimRiskReason": string, "removedUnverifiableClaims": string[], "groundedProofUsed": string | null}.`;
      break;
    }
    case 'why_this_score': {
      const baseline = buildWhyThisScoreStructured(vault, {
        roleTitle: params.payload?.roleTitle,
        company: params.payload?.company,
        score: params.payload?.score,
      });
      structuredData = baseline;
      userPromptForAi = `Explain the user's ${baseline.score}% job match score for ${baseline.roleTitle} at ${baseline.company}. Return JSON matching {"roleTitle": string, "company": string, "score": number, "explanationSummary": string, "topMatchingSkills": [{"skill": string, "status": "verified" | "self-declared", "evidenceUsed": string, "scoreContribution": string}], "topMissingSkills": [{"skill": string, "gapType": "missing" | "needs proof", "whyCritical": string, "proofTask": string, "estimatedScoreGain": number}]}.`;
      break;
    }
    case 'close_the_gap': {
      const baseline = buildCloseTheGapStructured(vault, true);
      structuredData = baseline;
      userPromptForAi = `Generate a personalized 7-day proof plan to close the user's top skill gaps for ${vault.targetRole}. Return JSON matching {"targetRole": string, "currentScore": number, "projectedScore": number, "summary": string, "days": [{"day": number, "skill": string, "title": string, "task": string, "proofArtifact": string, "estimatedMinutes": number}], "savedToAccount": true}.`;
      break;
    }
  }

  let isFallback = false;
  let actualModelUsed = route.modelId;

  const liveRes = await callNebiusWithRetry({
    modelId: route.modelId,
    systemPrompt,
    messages: [{ role: 'user', content: userPromptForAi }],
    jsonMode: true,
    temperature: 0.3,
    maxTokens: 1100,
    timeoutMs: route.tier === 'ultra' ? 20000 : 14000,
  });

  if (liveRes?.content) {
    try {
      const cleaned = liveRes.content
        .replace(/^```json\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      const parsed = JSON.parse(cleaned);
      if (parsed && typeof parsed === 'object') {
        structuredData = { ...structuredData, ...parsed };
        actualModelUsed = liveRes.modelUsed;
      }
    } catch {
      // Keep schema-validated structure if JSON parse fails
    }
  }

  if (params.task === 'close_the_gap' && structuredData?.days) {
    try {
      const sprintTasks = (structuredData.days as Array<any>).map((d, i) => ({
        day: d.day || i + 1,
        phase: d.day <= 3 ? 'Core Proof Build' : d.day <= 5 ? 'Testing & CI' : 'Verification',
        focusSkill: d.skill,
        skill: d.skill,
        task: d.task,
        expectedProof: d.proofArtifact,
        deliverable: d.proofArtifact,
      }));

      if (latestAnalysisRow) {
        const parsedAnalysis = JSON.parse(latestAnalysisRow.data) as AnalysisData;
        parsedAnalysis.sevenDayPlan = sprintTasks;
        db.prepare('UPDATE analyses SET data = ? WHERE id = ?').run(
          JSON.stringify(parsedAnalysis),
          latestAnalysisRow.id
        );
      } else {
        const newAnalysis: AnalysisData = {
          jobTitle: vault.targetRole,
          company: vault.targetCompany,
          readinessScore: vault.readinessScore,
          scoreBreakdown: {
            skillMatch: vault.readinessScore,
            evidenceStrength: vault.summaryCounts.verified * 20,
            experienceRelevance: 70,
          },
          summary: structuredData.summary,
          matchedSkills: [],
          missingSkills: [],
          unprovenSkills: [],
          sevenDayPlan: sprintTasks,
          resumeSuggestions: [],
          tailoredResumeBullets: [],
          coverLetter: '',
          interviewQuestions: [],
          nextSteps: [],
        };
        db.prepare(
          'INSERT INTO analyses (user_id, job_title, company, job_description, data) VALUES (?, ?, ?, ?, ?)'
        ).run(
          params.userId,
          vault.targetRole,
          vault.targetCompany,
          `7-Day Close the Gap Plan for ${vault.targetRole}`,
          JSON.stringify(newAnalysis)
        );
      }
      structuredData.savedToAccount = true;
    } catch (e) {
      console.warn('Could not persist 7-day plan to analyses table:', e);
    }
  }

  const latencyMs = Date.now() - startMs;
  recordInferenceCall({
    endpoint: `/api/ai/structured (${params.task})`,
    provider: 'Nebius Token Factory',
    model: actualModelUsed,
    latencyMs,
    status: 'live',
    note: `${route.tierLabel} · Grounded in Proof Vault`,
  });

  return {
    task: params.task,
    data: structuredData,
    groundedInProofVault: true,
    modelTier: route.tier,
    modelTierLabel: route.tierLabel,
    modelId: actualModelUsed,
    provider: 'Nebius Token Factory',
    latencyMs,
    isFallback,
    proofVaultSummary: {
      role: vault.role,
      targetRole: vault.targetRole,
      readinessScore: vault.readinessScore,
      verifiedCount: vault.summaryCounts.verified,
      selfDeclaredCount: vault.summaryCounts.selfDeclared,
      missingCount: vault.summaryCounts.missing,
    },
  };
}

/**
 * Step 2 & Step 3: Stream real LLM chat responses via SSE (`POST /api/ai/chat`)
 * Accepts the full conversation history (`messages`), keeps the last ~10 messages in context,
 * routes between NEMOTRON_FAST_MODEL and NEMOTRON_ULTRA_MODEL, and NEVER returns a canned answer.
 */
export async function streamNebiusChatResponse(params: {
  userId: number;
  messages: CopilotChatTurnInput[];
  viewerMode?: string;
  targetRole?: string;
  vaultOverride?: CopilotVaultPayload;
  webSearch?: boolean;
  onMeta: (meta: {
    groundedInProofVault: boolean;
    modelTier: 'fast' | 'ultra';
    modelTierLabel: 'Fast' | 'Deep reasoning';
    modelId: string;
    provider: string;
    proofVaultSummary: {
      role: 'student' | 'job seeker';
      targetRole: string;
      readinessScore: number;
      verifiedCount: number;
      selfDeclaredCount: number;
      missingCount: number;
    };
    sources?: Array<{ title: string; url: string }>;
    webSearched?: boolean;
  }) => void;
  onToken: (delta: string) => void;
  onDone: (summary: {
    fullText: string;
    modelTier: 'fast' | 'ultra';
    modelTierLabel: 'Fast' | 'Deep reasoning';
    modelId: string;
    latencyMs: number;
    isFallback: boolean;
  }) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const startMs = Date.now();
  const state = getNebiusConfigState();
  const { vault } = loadUserProofVaultFromDb({
    userId: params.userId,
    viewerModeOverride: params.viewerMode,
    targetRoleOverride: params.targetRole,
  });

  // Normalize conversation history and keep the last 10 messages so follow-ups work
  const validMessages = (params.messages || [])
    .filter(
      (m) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.trim().length > 0
    )
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content.trim(),
    }))
    .slice(-10);

  if (validMessages.length === 0) {
    throw new Error('Please provide at least one message.');
  }

  const lastUserMessage =
    [...validMessages].reverse().find((m) => m.role === 'user')?.content ||
    validMessages[validMessages.length - 1].content;

  const WEB_KEYWORDS = [
    'salary',
    'pay',
    'demand',
    'trending',
    'latest',
    'hiring',
    'openings',
    'company',
    'companies',
    '2026',
    'certification worth',
    'interview process',
    'frameworks comparison',
    'tools comparison',
    'what do employers want',
    'market',
  ];
  const asksForWeb = Boolean(
    params.webSearch ||
      WEB_KEYWORDS.some((kw) => lastUserMessage.toLowerCase().includes(kw))
  );

  let webSources: Array<{ title: string; url: string }> = [];
  let webContextAddendum = '';
  let webSearchedSuccess = false;

  if (asksForWeb && isTavilyConfigured()) {
    try {
      const searchRole = params.targetRole || vault.targetRole || 'Software Engineer';
      const webQuery = `${lastUserMessage} ${searchRole}`.slice(0, 200);
      const searchRes = await tavilySearch({
        query: webQuery,
        maxResults: 4,
        topic: 'general',
        includeAnswer: true,
      });

      if (searchRes && searchRes.results && searchRes.results.length > 0) {
        webSources = searchRes.results.slice(0, 4).map((r) => ({
          title: r.title,
          url: r.url,
        }));
        webSearchedSuccess = true;
        const formatted = searchRes.results
          .slice(0, 4)
          .map(
            (r, i) =>
              `[${i + 1}] ${r.title} (${r.url})\n${(r.content || '').slice(0, 320)}`
          )
          .join('\n\n');

        webContextAddendum = `\n\n### LIVE WEB CONTEXT (Real-Time Search via Tavily):
${searchRes.answer ? `Tavily Answer: ${searchRes.answer}\n\n` : ''}${formatted}

RULES FOR LIVE WEB CONTEXT:
1. Cite sources directly as [1], [2], etc., when referencing live market facts, salaries, or openings.
2. Prefer live web context for market and employer demand, and prefer the candidate's Proof Vault for their verified vs unproven skills.
3. NEVER present web claims as the candidate's own verified skills.`;
      }
    } catch (tavilyErr) {
      console.warn(
        '[Nebius AI Chat] Live web search fallback:',
        tavilyErr instanceof Error ? tavilyErr.message : tavilyErr
      );
      webContextAddendum = '\n\nNote: Live web search unavailable for this query.';
    }
  }

  const baseRoute = routeQuestionModelTier(lastUserMessage, {
    fastModelId: state.fastModelId,
    ultraModelId: state.ultraModelId,
    ultraModelAvailable: state.ultraModelAvailable,
  });

  // Choose the Ultra model when web context is used
  const route = webSearchedSuccess
    ? {
        tier: 'ultra' as const,
        tierLabel: 'Deep reasoning' as const,
        modelId: state.ultraModelAvailable ? state.ultraModelId : state.fastModelId,
      }
    : baseRoute;

  const baseSystemPrompt = params.vaultOverride
    ? buildUnifiedCopilotSystemPrompt({
        targetRole: params.targetRole || vault.targetRole,
        mode: params.viewerMode || vault.role,
        vault: params.vaultOverride,
      })
    : buildProofVaultSystemPrompt(vault);

  const systemPrompt = `${baseSystemPrompt}${webContextAddendum}`;

  const client = createNebiusClient(route.tier === 'ultra' ? 28000 : 20000);
  if (!client) {
    console.error('[Nebius AI Chat] Missing NEBIUS_API_KEY in server environment.');
    throw new Error('AI is unavailable, retry');
  }

  const modelsToTry = [route.modelId];
  if (route.modelId !== state.fastModelId) {
    modelsToTry.push(state.fastModelId);
  } else if (state.ultraModelAvailable && state.ultraModelId !== route.modelId) {
    modelsToTry.push(state.ultraModelId);
  }

  // Send SSE meta event before tokens
  params.onMeta({
    groundedInProofVault: true,
    modelTier: route.tier,
    modelTierLabel: route.tierLabel,
    modelId: route.modelId,
    provider: 'Nebius Token Factory',
    proofVaultSummary: {
      role: vault.role,
      targetRole: vault.targetRole,
      readinessScore: vault.readinessScore,
      verifiedCount: vault.summaryCounts.verified,
      selfDeclaredCount: vault.summaryCounts.selfDeclared,
      missingCount: vault.summaryCounts.missing,
    },
    sources: webSources.length > 0 ? webSources : undefined,
    webSearched: webSearchedSuccess,
  });

  let fullText = '';
  let actualModelUsed = route.modelId;
  let actualTier = route.tier;
  let actualTierLabel = route.tierLabel;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < modelsToTry.length; attempt++) {
    if (params.signal?.aborted) return;
    const modelToUse = modelsToTry[attempt];
    actualModelUsed = modelToUse;
    actualTier = modelToUse === state.ultraModelId ? 'ultra' : 'fast';
    actualTierLabel = actualTier === 'ultra' ? 'Deep reasoning' : 'Fast';

    try {
      const requestPayload: Record<string, unknown> = {
        model: modelToUse,
        messages: [
          { role: 'system', content: systemPrompt },
          ...validMessages,
        ],
        temperature: 0.6,
        max_tokens: 700,
        stream: true,
        chat_template_kwargs: { enable_thinking: false },
      };

      const stream = await (client.chat.completions.create as any)(
        requestPayload,
        { signal: params.signal }
      );

      for await (const chunk of stream) {
        if (params.signal?.aborted) return;
        const delta = chunk.choices?.[0]?.delta?.content || '';
        if (delta) {
          fullText += delta;
          params.onToken(delta);
        }
      }

      if (fullText.trim().length > 0) {
        break;
      }
      throw new Error(`Model ${modelToUse} returned an empty stream.`);
    } catch (err) {
      if (params.signal?.aborted) return;
      lastError = err;
      console.error(
        `[Nebius AI Chat] Streaming attempt ${attempt + 1} failed on ${modelToUse}:`,
        err instanceof Error ? err.message : err
      );
      if (fullText.trim().length > 0) {
        break;
      }
    }
  }

  if (!fullText.trim()) {
    const rawReason =
      lastError instanceof Error ? lastError.message : 'Unknown streaming error';
    console.error('[Nebius AI Chat] All streaming attempts failed:', rawReason);
    throw new Error('AI is unavailable, retry');
  }

  const latencyMs = Date.now() - startMs;
  recordInferenceCall({
    endpoint: '/api/ai/chat (SSE)',
    provider: 'Nebius Token Factory',
    model: actualModelUsed,
    latencyMs,
    status: 'live',
    note: `${actualTierLabel} · Live LLM Stream${webSearchedSuccess ? ' + Tavily Web' : ''}`,
  });

  params.onDone({
    fullText,
    modelTier: actualTier,
    modelTierLabel: actualTierLabel,
    modelId: actualModelUsed,
    latencyMs,
    isFallback: false,
  });
}

/**
 * Summarize 2026 skill market demand in 2 sentences using Nebius Fast model
 */
export async function summarizeSkillDemandWithNebius(params: {
  skill: string;
  role: string;
  searchResults: Array<{ title: string; url: string; content: string }>;
  tavilyAnswer?: string | null;
}): Promise<string> {
  const { skill, role, searchResults, tavilyAnswer } = params;
  const state = getNebiusConfigState();
  const client = createNebiusClient(15000);

  if (!client || searchResults.length === 0) {
    return (
      tavilyAnswer ||
      `${skill} remains a key requirement for ${role} roles in 2026, with strong hiring demand across tech employers.`
    );
  }

  try {
    const snippetContext = searchResults
      .slice(0, 3)
      .map(
        (r, i) =>
          `[Source ${i + 1} - ${r.title}]: ${(r.content || '').slice(0, 350)}`
      )
      .join('\n\n');

    const prompt = `You are a career readiness expert. Based on these 2026 live web search results about the skill "${skill}" for the role "${role}":\n\n${snippetContext}\n\nWrite exactly a concise 2-sentence summary explaining current industry hiring demand, what employers look for, and why having proof matters. Do not use markdown headers or bullet points; output only the 2 sentences.`;

    const completion = await (client.chat.completions.create as any)({
      model: state.fastModelId,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 140,
    });

    const summary = completion.choices?.[0]?.message?.content?.trim();
    if (summary && summary.length >= 20) {
      return summary;
    }
  } catch (err) {
    console.warn(
      '[Nebius AI] summarizeSkillDemandWithNebius fallback:',
      err instanceof Error ? err.message : err
    );
  }

  return (
    tavilyAnswer ||
    `${skill} is in active demand for ${role} positions in 2026, with employers prioritizing candidates who demonstrate verifiable project evidence.`
  );
}

/**
 * Non-streaming server route handler for POST /api/copilot
 * Calls the real Nebius model and throws an honest error if unavailable (never returns canned text).
 */
export async function runUnifiedCopilotChat(params: {
  userId: number;
  question?: string;
  messages?: CopilotChatTurnInput[];
  mode?: string;
  targetRole?: string;
  vault?: CopilotVaultPayload;
}): Promise<CopilotApiResponse> {
  const startMs = Date.now();
  const state = getNebiusConfigState();

  const normalizedMessages: CopilotChatTurnInput[] =
    Array.isArray(params.messages) && params.messages.length > 0
      ? params.messages
          .filter(
            (m) =>
              m &&
              (m.role === 'user' || m.role === 'assistant') &&
              typeof m.content === 'string' &&
              m.content.trim().length > 0
          )
          .map((m) => ({
            role: m.role,
            content: m.content.trim(),
          }))
          .slice(-10)
      : params.question && params.question.trim()
      ? [{ role: 'user', content: params.question.trim() }]
      : [];

  if (normalizedMessages.length === 0) {
    throw new Error('Please enter a question for the AI Career Readiness Copilot.');
  }

  const lastQuestion =
    [...normalizedMessages].reverse().find((m) => m.role === 'user')?.content ||
    normalizedMessages[normalizedMessages.length - 1].content;

  const { vault: dbVault } = loadUserProofVaultFromDb({
    userId: params.userId,
    viewerModeOverride: params.mode,
    targetRoleOverride: params.targetRole,
  });

  const resolvedTargetRole = (
    params.targetRole ||
    dbVault.targetRole ||
    'Full-Stack Software Engineer'
  ).trim();
  const resolvedMode = (params.mode || dbVault.role || 'jobseeker').trim();

  let resolvedVault: CopilotVaultPayload;
  if (
    params.vault &&
    Array.isArray(params.vault.verified) &&
    Array.isArray(params.vault.selfDeclared) &&
    Array.isArray(params.vault.missing)
  ) {
    resolvedVault = {
      readinessScore:
        typeof params.vault.readinessScore === 'number'
          ? params.vault.readinessScore
          : dbVault.readinessScore,
      verified: params.vault.verified,
      selfDeclared: params.vault.selfDeclared,
      missing: params.vault.missing,
    };
  } else {
    resolvedVault = {
      readinessScore: dbVault.readinessScore,
      verified: dbVault.skills
        .filter((s) => s.status === 'verified')
        .map((s) => ({
          skill: s.skill,
          status: 'verified' as const,
          proofTitle: s.proofs[0]?.title,
          proofType: s.proofs[0]?.type,
          proofUrl: s.proofs[0]?.url,
        })),
      selfDeclared: dbVault.skills
        .filter((s) => s.status === 'self-declared' || s.status === 'needs proof')
        .map((s) => ({
          skill: s.skill,
          status: 'self-declared' as const,
        })),
      missing: dbVault.skills
        .filter((s) => s.status === 'missing')
        .map((s) => ({
          skill: s.skill,
          status: 'missing' as const,
        })),
    };
  }

  const route = routeQuestionModelTier(lastQuestion, {
    fastModelId: state.fastModelId,
    ultraModelId: state.ultraModelId,
    ultraModelAvailable: state.ultraModelAvailable,
  });

  const systemPrompt = buildUnifiedCopilotSystemPrompt({
    targetRole: resolvedTargetRole,
    mode: resolvedMode,
    vault: resolvedVault,
  });

  const liveRes = await callNebiusWithRetry({
    modelId: route.modelId,
    systemPrompt,
    messages: normalizedMessages,
    jsonMode: false,
    temperature: 0.6,
    maxTokens: 700,
    timeoutMs: route.tier === 'ultra' ? 25000 : 18000,
  });

  const actualTier: 'fast' | 'ultra' =
    liveRes.modelUsed === state.ultraModelId ? 'ultra' : 'fast';
  const actualTierLabel: 'Fast' | 'Deep reasoning' =
    actualTier === 'ultra' ? 'Deep reasoning' : 'Fast';

  const latencyMs = Date.now() - startMs;
  recordInferenceCall({
    endpoint: '/api/copilot',
    provider: 'Nebius Token Factory',
    model: liveRes.modelUsed,
    latencyMs,
    status: 'live',
    note: `${actualTierLabel} · Live LLM`,
  });

  return {
    answer: liveRes.content,
    modelTier: actualTier,
    modelTierLabel: actualTierLabel,
    modelId: liveRes.modelUsed,
    provider: 'Nebius Token Factory',
    groundedInProofVault: true,
    latencyMs,
    isFallback: false,
    vault: resolvedVault,
  };
}

/**
 * Generate 3-sentence recruiter summary for Proof Passport from verified skills only.
 * Respects rate limits, uses Nemotron Fast model, and records inference call for Inspector.
 */
export async function generatePassportAiSummary(params: {
  userId: number;
  targetRole: string;
  verifiedSkills: Array<{ skill: string; proofTitle: string; proofType?: string }>;
}): Promise<string | null> {
  const { userId, targetRole, verifiedSkills } = params;
  if (!verifiedSkills || verifiedSkills.length === 0) return null;

  const rateCheck = checkUserAiRateLimit(String(userId));
  if (!rateCheck.allowed) return null;

  const state = getNebiusConfigState();
  if (!state.apiKeyConfigured) return null;

  const systemPrompt = `You are the ApplyWise Proof Passport recruiter summary engine.
Write exactly a 3-sentence recruiter-facing summary highlighting the candidate's verified skills and attached proofs for the role of ${targetRole}.
STRICT RULES:
1. Use ONLY the verified skills and proof titles provided below.
2. Do NOT invent companies, metrics, numbers, or achievements not explicitly provided.
3. Do NOT mention any unverified, self-declared, or missing skills.
4. Professional, punchy, third-person perspective. Exactly 3 sentences.`;

  const userContent = `Verified skills and attached proofs for ${targetRole}:
${verifiedSkills.map((v) => `• ${v.skill}: "${v.proofTitle}" (${v.proofType || 'artifact'})`).join('\n')}`;

  const startMs = Date.now();
  try {
    const res = await callNebiusWithRetry({
      modelId: state.fastModelId,
      systemPrompt,
      messages: [{ role: 'user', content: userContent }],
      temperature: 0.3,
      maxTokens: 250,
      timeoutMs: 15000,
    });

    const latencyMs = Date.now() - startMs;
    recordInferenceCall({
      endpoint: '/api/passport/summary',
      provider: 'Nebius Token Factory',
      model: res.modelUsed,
      latencyMs,
      status: 'live',
      note: 'Passport Recruiter Summary (Nemotron Fast)',
    });

    const text = (res.content || '').trim();
    return text || null;
  } catch (err) {
    console.warn('[Passport AI Summary] Generation failed or timed out:', err);
    return null;
  }
}
