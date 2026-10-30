import { recordInferenceCall } from './analyzer';

export interface TavilySearchOptions {
  query: string;
  maxResults?: number;
  searchDepth?: 'basic' | 'advanced';
  topic?: 'general' | 'news';
  timeRange?: 'day' | 'week' | 'month' | 'year';
  includeDomains?: string[];
  includeAnswer?: boolean;
}

export interface TavilySearchResultItem {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface TavilySearchResult {
  answer?: string | null;
  results: TavilySearchResultItem[];
  latencyMs: number;
}

export interface TavilyExtractItem {
  url: string;
  raw_content: string;
}

export interface TavilyStatus {
  configured: boolean;
  callsThisSession: number;
  lastLatencyMs: number;
}

const TAVILY_API_URL = 'https://api.tavily.com';
const TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Session tracking
let callsThisSession = 0;
let lastLatencyMs = 0;

// In-memory cache for search queries
interface CacheEntry {
  data: TavilySearchResult;
  expiresAt: number;
}
const searchCache = new Map<string, CacheEntry>();

function getApiKey(): string {
  return (process.env.TAVILY_API_KEY || '').trim();
}

export function isTavilyConfigured(): boolean {
  return Boolean(getApiKey());
}

export function getTavilyStatus(): TavilyStatus {
  return {
    configured: isTavilyConfigured(),
    callsThisSession,
    lastLatencyMs,
  };
}

function buildCacheKey(options: TavilySearchOptions): string {
  const q = options.query.trim().toLowerCase();
  const max = options.maxResults || 5;
  const depth = options.searchDepth || 'basic';
  const topic = options.topic || 'general';
  const domains = (options.includeDomains || []).map((d) => d.toLowerCase()).sort().join(',');
  return `${q}|${max}|${depth}|${topic}|${domains}`;
}

async function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute live Tavily Search with 8s timeout, 1 retry on 5xx/429, in-memory caching,
 * and automatic logging to the Inference Inspector.
 */
export async function tavilySearch(
  options: TavilySearchOptions
): Promise<TavilySearchResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    const err = new Error('TAVILY_API_KEY is not configured on the server.');
    recordInferenceCall({
      endpoint: 'Tavily Search',
      provider: 'Tavily',
      model: 'tavily-search',
      latencyMs: 1,
      status: 'fallback',
      note: 'API key not configured',
    });
    throw err;
  }

  const cacheKey = buildCacheKey(options);
  const now = Date.now();
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const payload: Record<string, unknown> = {
    query: options.query.trim(),
    search_depth: options.searchDepth || 'basic',
    max_results: options.maxResults ?? 5,
    include_answer: options.includeAnswer ?? true,
    topic: options.topic || 'general',
  };

  if (options.timeRange) {
    payload.time_range = options.timeRange;
  }
  if (options.includeDomains && options.includeDomains.length > 0) {
    payload.include_domains = options.includeDomains;
  }

  let attempt = 0;
  let lastErr: unknown = null;
  const startMs = Date.now();

  while (attempt < 2) {
    attempt++;
    try {
      const resp = await fetch(`${TAVILY_API_URL}/search`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!resp.ok) {
        if ((resp.status === 429 || resp.status >= 500) && attempt === 1) {
          await waitMs(400);
          continue;
        }
        const errText = await resp.text().catch(() => '');
        throw new Error(`Tavily search failed (HTTP ${resp.status}): ${errText.slice(0, 100)}`);
      }

      const json = (await resp.json()) as {
        answer?: string | null;
        results?: Array<{
          title?: string;
          url?: string;
          content?: string;
          score?: number;
        }>;
      };

      const durationMs = Date.now() - startMs;
      callsThisSession++;
      lastLatencyMs = durationMs;

      const rawResults = Array.isArray(json.results) ? json.results : [];
      const formattedResults: TavilySearchResultItem[] = rawResults.map((r) => ({
        title: (r.title || 'Untitled Result').trim(),
        url: (r.url || '').trim(),
        content: (r.content || '').trim(),
        score: typeof r.score === 'number' ? r.score : undefined,
      }));

      const searchResult: TavilySearchResult = {
        answer: json.answer || null,
        results: formattedResults,
        latencyMs: durationMs,
      };

      // Cache for 10 minutes to protect free-tier credits
      searchCache.set(cacheKey, {
        data: searchResult,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });

      recordInferenceCall({
        endpoint: `Tavily Search: ${options.query.slice(0, 32)}`,
        provider: 'Tavily',
        model: 'tavily-search',
        latencyMs: durationMs,
        status: 'live',
        note: `${formattedResults.length} web results${json.answer ? ' · AI answer' : ''}`,
      });

      return searchResult;
    } catch (err: unknown) {
      lastErr = err;
      if (attempt === 1) {
        await waitMs(400);
      }
    }
  }

  const durationMs = Date.now() - startMs;
  recordInferenceCall({
    endpoint: `Tavily Search: ${options.query.slice(0, 32)}`,
    provider: 'Tavily',
    model: 'tavily-search',
    latencyMs: durationMs,
    status: 'fallback',
    note: lastErr instanceof Error ? lastErr.message.slice(0, 50) : 'Search failed',
  });

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Execute Tavily Extract to parse raw web page content (e.g. bypassing bot blocks on job boards).
 */
export async function tavilyExtract(urls: string[]): Promise<TavilyExtractItem[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    const err = new Error('TAVILY_API_KEY is not configured on the server.');
    recordInferenceCall({
      endpoint: 'Tavily Extract',
      provider: 'Tavily',
      model: 'tavily-extract',
      latencyMs: 1,
      status: 'fallback',
      note: 'API key not configured',
    });
    throw err;
  }

  const validUrls = (urls || []).filter(
    (u) => typeof u === 'string' && /^https?:\/\//i.test(u.trim())
  );
  if (validUrls.length === 0) {
    return [];
  }

  let attempt = 0;
  let lastErr: unknown = null;
  const startMs = Date.now();

  while (attempt < 2) {
    attempt++;
    try {
      const resp = await fetch(`${TAVILY_API_URL}/extract`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ urls: validUrls }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!resp.ok) {
        if ((resp.status === 429 || resp.status >= 500) && attempt === 1) {
          await waitMs(400);
          continue;
        }
        const errText = await resp.text().catch(() => '');
        throw new Error(`Tavily extract failed (HTTP ${resp.status}): ${errText.slice(0, 100)}`);
      }

      const json = (await resp.json()) as {
        results?: Array<{
          url?: string;
          raw_content?: string;
        }>;
      };

      const durationMs = Date.now() - startMs;
      callsThisSession++;
      lastLatencyMs = durationMs;

      const items: TavilyExtractItem[] = (json.results || []).map((r) => ({
        url: r.url || validUrls[0],
        raw_content: r.raw_content || '',
      }));

      recordInferenceCall({
        endpoint: `Tavily Extract: ${validUrls[0]?.slice(0, 32)}`,
        provider: 'Tavily',
        model: 'tavily-extract',
        latencyMs: durationMs,
        status: 'live',
        note: `${items.length} url(s) extracted`,
      });

      return items;
    } catch (err: unknown) {
      lastErr = err;
      if (attempt === 1) {
        await waitMs(400);
      }
    }
  }

  const durationMs = Date.now() - startMs;
  recordInferenceCall({
    endpoint: `Tavily Extract: ${validUrls[0]?.slice(0, 32)}`,
    provider: 'Tavily',
    model: 'tavily-extract',
    latencyMs: durationMs,
    status: 'fallback',
    note: lastErr instanceof Error ? lastErr.message.slice(0, 50) : 'Extract failed',
  });

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
