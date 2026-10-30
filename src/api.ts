import type {
  AttachmentItem,
  CopilotApiResponse,
  CopilotStructuredResponse,
  CopilotStructuredTask,
  CopilotVaultPayload,
  EvidenceItem,
  SelectedUploadCategory,
  UploadCheckResult,
} from './types';
import { preprocessImageFileForOcr } from './utils/imagePreprocess';

export async function fetchApi<T = any>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('applywise_token') || '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options?.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['x-applywise-token'] = token;
  }

  const normalizedEndpoint = endpoint.startsWith('/api/')
    ? endpoint
    : '/api' + (endpoint.startsWith('/') ? endpoint : '/' + endpoint);

  const response = await fetch(normalizedEndpoint, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Server error occurred. Please try again.');
  }

  return data as T;
}

export interface UploadedFileResponse {
  id: number;
  filename: string;
  mimeType: string;
  category: string;
  text: string;
  source: string;
  detectedSkills: string[];
  readinessScore?: number;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Could not read selected file from disk.'));
    reader.readAsDataURL(file);
  });
}

export async function uploadResumeOrProofFile(
  file: File,
  options?: {
    category?: 'resume' | 'certificate' | 'evidence';
    saveToProfile?: boolean;
  }
): Promise<UploadedFileResponse> {
  const category = options?.category || 'resume';
  const saveToProfile = options?.saveToProfile !== undefined ? options.saveToProfile : true;
  const token = localStorage.getItem('applywise_token') || '';

  // 1. Primary path: Multipart FormData upload to /api/upload
  try {
    const fd = new FormData();
    fd.append('resume', file);
    fd.append('category', category);
    fd.append('saveToProfile', saveToProfile ? 'true' : 'false');

    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: token ? { 'x-applywise-token': token } : {},
      body: fd,
    });

    const rawText = await res.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = null;
    }

    if (res.ok && parsed && typeof parsed.text === 'string') {
      return parsed as UploadedFileResponse;
    }

    // If server returned a structured 400 error message, keep note of it before trying base64 fallback
    if (res.status === 400 && parsed?.error) {
      throw new Error(parsed.error);
    }
  } catch {
    // Fall through to Base64 JSON upload endpoint
  }

  // 2. Fallback path: Base64 JSON payload to /api/upload-base64 (immune to multipart proxy stripping)
  const base64Data = await fileToBase64(file);
  return fetchApi<UploadedFileResponse>('/upload-base64', {
    method: 'POST',
    body: JSON.stringify({
      filename: file.name || 'resume.pdf',
      mimeType: file.type || 'application/octet-stream',
      fileSize: file.size || 0,
      base64Data,
      category,
      saveToProfile,
    }),
  });
}

export interface UploadCheckApiResponse {
  checkResult: UploadCheckResult;
  extractedText: string;
  source: string;
}

export interface UploadConfirmApiResponse {
  ok: boolean;
  attachment: AttachmentItem | null;
  createdEvidence: EvidenceItem[];
  checkResult: UploadCheckResult;
  text: string;
  detectedSkills: string[];
  readinessScore?: number;
}

export async function runUploadCheckOnFile(
  file: File,
  options: {
    selectedCategory: SelectedUploadCategory;
    userTitle?: string;
    targetSkill?: string;
  }
): Promise<UploadCheckApiResponse> {
  const token = localStorage.getItem('applywise_token') || '';

  // For images (.jfif/.jpg/.webp/.png), convert to PNG on canvas first and generate
  // the 1600px upscaled + grayscale + contrast + adaptive-threshold preprocessed image
  const imgPrep = await preprocessImageFileForOcr(file);
  if (imgPrep.isImage && imgPrep.convertedPngBase64) {
    return fetchApi<UploadCheckApiResponse>('/upload-check', {
      method: 'POST',
      body: JSON.stringify({
        filename: file.name || imgPrep.convertedFilename,
        mimeType: 'image/png',
        fileSize: file.size || 0,
        base64Data: imgPrep.convertedPngBase64,
        preprocessedBase64: imgPrep.preprocessedPngBase64,
        imageMeta: {
          originalWidth: imgPrep.originalWidth,
          originalHeight: imgPrep.originalHeight,
          exifOrientation: imgPrep.exifOrientation,
          wasRotated: imgPrep.wasRotated,
          wasUpscaled: imgPrep.wasUpscaled,
          isLikelyPhoto: imgPrep.isLikelyPhoto,
          suspectedFailureReason: imgPrep.suspectedFailureReason,
        },
        selectedCategory: options.selectedCategory,
        userTitle: options.userTitle || '',
        targetSkill: options.targetSkill,
      }),
    });
  }

  // 1. Try multipart upload-check first for PDFs / DOCX / TXT
  try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('selectedCategory', options.selectedCategory);
    if (options.userTitle) fd.append('userTitle', options.userTitle);
    if (options.targetSkill) fd.append('targetSkill', options.targetSkill);

    const res = await fetch('/api/upload-check', {
      method: 'POST',
      headers: token ? { 'x-applywise-token': token } : {},
      body: fd,
    });

    if (res.ok) {
      const parsed = await res.json();
      if (parsed && parsed.checkResult) {
        return parsed as UploadCheckApiResponse;
      }
    }
  } catch {
    // Fall through to base64 JSON payload
  }

  // 2. Base64 JSON fallback
  const base64Data = await fileToBase64(file);
  return fetchApi<UploadCheckApiResponse>('/upload-check', {
    method: 'POST',
    body: JSON.stringify({
      filename: file.name || 'document.pdf',
      mimeType: file.type || 'application/pdf',
      fileSize: file.size || 0,
      base64Data,
      selectedCategory: options.selectedCategory,
      userTitle: options.userTitle || '',
      targetSkill: options.targetSkill,
    }),
  });
}

export async function runUploadCheckScenario(
  scenarioId: string
): Promise<UploadCheckApiResponse> {
  return fetchApi<UploadCheckApiResponse>('/upload-check', {
    method: 'POST',
    body: JSON.stringify({ scenarioId }),
  });
}

export async function confirmUploadCheck(payload: {
  checkResult: UploadCheckResult;
  selectedCategory: SelectedUploadCategory;
  userTitle: string;
  filename: string;
  extractedText: string;
  selectedSkills: string[];
  attachAnyway?: boolean;
  updateProfileName?: boolean;
  overwriteProfileResume?: boolean;
  keepExistingResumeOnConflict?: boolean;
  linkExistingAttachmentId?: number;
  saveToProfile?: boolean;
}): Promise<UploadConfirmApiResponse> {
  return fetchApi<UploadConfirmApiResponse>('/upload-confirm', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateAttachmentItem(
  id: number,
  payload: Record<string, unknown>
): Promise<AttachmentItem> {
  return fetchApi<AttachmentItem>(`/attachments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function callAiStructured<T = any>(
  task: CopilotStructuredTask,
  options?: {
    viewerMode?: string;
    targetRole?: string;
    payload?: Record<string, any>;
    signal?: AbortSignal;
  }
): Promise<CopilotStructuredResponse<T>> {
  return fetchApi<CopilotStructuredResponse<T>>('/ai/structured', {
    method: 'POST',
    signal: options?.signal,
    body: JSON.stringify({
      task,
      viewerMode: options?.viewerMode,
      targetRole: options?.targetRole,
      payload: options?.payload || {},
    }),
  });
}

export async function streamAiChat(options: {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  viewerMode?: string;
  targetRole?: string;
  vault?: CopilotVaultPayload;
  webSearch?: boolean;
  signal?: AbortSignal;
  onMeta?: (meta: {
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
  onToken?: (delta: string) => void;
  onDone?: (summary: {
    fullText: string;
    modelTier: 'fast' | 'ultra';
    modelTierLabel: 'Fast' | 'Deep reasoning';
    modelId: string;
    latencyMs: number;
    isFallback: boolean;
  }) => void;
}): Promise<void> {
  const token = localStorage.getItem('applywise_token') || '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['x-applywise-token'] = token;
  }

  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers,
    signal: options.signal,
    body: JSON.stringify({
      messages: options.messages,
      viewerMode: options.viewerMode,
      targetRole: options.targetRole,
      vault: options.vault,
      webSearch: options.webSearch,
    }),
  });

  if (!response.ok) {
    const errJson = await response.json().catch(() => ({}));
    throw new Error(errJson.error || 'AI is unavailable, retry');
  }

  if (!response.body) {
    throw new Error('AI is unavailable, retry');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const processEventBlock = (part: string) => {
    const line = part
      .split('\n')
      .find((l) => l.startsWith('data: '));
    if (!line) return;
    const jsonStr = line.slice(6).trim();
    if (!jsonStr) return;
    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return;
    }
    if (parsed.type === 'meta') {
      options.onMeta?.(parsed);
    } else if (parsed.type === 'delta' && typeof parsed.content === 'string') {
      options.onToken?.(parsed.content);
    } else if (parsed.type === 'done') {
      options.onDone?.(parsed);
    } else if (parsed.type === 'error') {
      throw new Error(parsed.error || 'AI is unavailable, retry');
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      processEventBlock(part);
    }
  }

  if (buffer.trim()) {
    processEventBlock(buffer);
  }
}

export async function askCopilot(params: {
  question?: string;
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  mode: string;
  targetRole: string;
  vault: CopilotVaultPayload;
  signal?: AbortSignal;
}): Promise<CopilotApiResponse> {
  return fetchApi<CopilotApiResponse>('/copilot', {
    method: 'POST',
    signal: params.signal,
    body: JSON.stringify({
      question: params.question,
      messages: params.messages,
      mode: params.mode,
      targetRole: params.targetRole,
      vault: params.vault,
    }),
  });
}




