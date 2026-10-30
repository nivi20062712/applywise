import React, { useState, useEffect } from 'react';
import {
  Github,
  X,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Sparkles,
  ExternalLink,
  GitCommit,
  Star,
  Clock,
  Trash2,
  Check,
  ShieldCheck,
} from 'lucide-react';
import {
  EvidenceItem,
  GitHubRepoEvidenceDetails,
  GitHubAIReviewResult,
} from '../types';

function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('applywise_token') || '';
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers['x-applywise-token'] = token;
  }
  return fetch(url, { ...options, headers });
}

const GITHUB_CACHE_PREFIX = 'applywise_gh_cache_v1_';
const GITHUB_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface GitHubInspectionResult {
  owner: string;
  repo: string;
  url: string;
  description: string;
  isFork: boolean;
  isPrivate: boolean;
  stargazersCount: number;
  defaultBranch: string;
  pushedAt: string;
  languages: Record<string, number>;
  userCommitCount: number;
  singleDayCommitWarning?: boolean;
  weakWarningReason?: string;
  validationStatus: 'valid' | 'rejected';
  validationReason: string;
  detectedSkills: string[];
  treePaths: string[];
  readmeExcerpt: string;
}

function getCachedInspection(ownerRepoUserKey: string): GitHubInspectionResult | null {
  try {
    const raw = localStorage.getItem(GITHUB_CACHE_PREFIX + ownerRepoUserKey.toLowerCase());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; data: GitHubInspectionResult };
    if (Date.now() - parsed.ts > GITHUB_CACHE_TTL_MS) {
      localStorage.removeItem(GITHUB_CACHE_PREFIX + ownerRepoUserKey.toLowerCase());
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function setCachedInspection(ownerRepoUserKey: string, data: GitHubInspectionResult): void {
  try {
    localStorage.setItem(
      GITHUB_CACHE_PREFIX + ownerRepoUserKey.toLowerCase(),
      JSON.stringify({ ts: Date.now(), data })
    );
  } catch {
    // Ignore storage quota errors
  }
}

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Java: '#b07219',
  'C++': '#f34b7d',
  SQL: '#e38c00',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Dockerfile: '#384d54',
  Shell: '#89e051',
  Go: '#00ADD8',
  Rust: '#dea584',
};

export function LanguageBreakdownBar({ languages }: { languages?: Record<string, number> }) {
  if (!languages || Object.keys(languages).length === 0) return null;
  const entries = Object.entries(languages).filter(([, bytes]) => bytes > 0);
  const total = entries.reduce((acc, [, b]) => acc + b, 0);
  if (total <= 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="h-2 w-full rounded-full overflow-hidden flex bg-slate-200 dark:bg-slate-800">
        {entries.map(([lang, bytes]) => {
          const pct = Math.max(3, Math.round((bytes / total) * 100));
          return (
            <div
              key={lang}
              style={{
                width: `${pct}%`,
                backgroundColor: LANGUAGE_COLORS[lang] || '#64748b',
              }}
              title={`${lang}: ${Math.round((bytes / total) * 100)}%`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-400">
        {entries.slice(0, 5).map(([lang, bytes]) => (
          <span key={lang} className="inline-flex items-center gap-1">
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ backgroundColor: LANGUAGE_COLORS[lang] || '#64748b' }}
            />
            <span className="font-medium text-slate-700 dark:text-slate-300">{lang}</span>
            <span>{Math.max(1, Math.round((bytes / total) * 100))}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

interface GitHubRepoProofModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultSkill?: string;
  targetSkill?: string;
  defaultGithubUsername?: string;
  onSaveGithubUsername?: (username: string) => void;
  onEvidenceCreated: () => Promise<void> | void;
  selectedModelId?: string;
}

export const GitHubRepoProofModal: React.FC<GitHubRepoProofModalProps> = ({
  isOpen,
  onClose,
  defaultSkill,
  targetSkill,
  defaultGithubUsername = '',
  onSaveGithubUsername,
  onEvidenceCreated,
  selectedModelId,
}) => {
  const effectiveSkill = targetSkill || defaultSkill;
  const [repoUrl, setRepoUrl] = useState('https://github.com/arjun-mehta/telemetry-cloud-ui');
  const [username, setUsername] = useState(defaultGithubUsername || 'arjun-mehta');
  const [inspecting, setInspecting] = useState(false);
  const [error, setError] = useState('');
  const [rateLimited, setRateLimited] = useState(false);
  const [inspection, setInspection] = useState<GitHubInspectionResult | null>(null);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [aiReview, setAiReview] = useState<GitHubAIReviewResult | null>(null);

  useEffect(() => {
    if (defaultGithubUsername) {
      setUsername(defaultGithubUsername);
    } else {
      const savedUser = localStorage.getItem('applywise_github_username');
      if (savedUser) setUsername(savedUser);
    }
  }, [defaultGithubUsername, isOpen]);

  if (!isOpen) return null;

  const handleInspect = async (bypassCache = false, customUrl?: string, customUser?: string) => {
    const targetUrl = (customUrl ?? repoUrl).trim();
    const targetUser = (customUser ?? username).trim().replace(/^@/, '');
    if (!targetUrl || !targetUser) {
      setError('Please enter both a GitHub repository URL and your GitHub username.');
      return;
    }

    setError('');
    setRateLimited(false);
    setAiReview(null);

    try {
      localStorage.setItem('applywise_github_username', targetUser);
      onSaveGithubUsername?.(targetUser);
    } catch {
      // Ignore
    }

    const cacheKey = `${targetUrl}@${targetUser}`;
    if (!bypassCache) {
      const cached = getCachedInspection(cacheKey);
      if (cached) {
        setInspection(cached);
        const preselected = defaultSkill
          ? cached.detectedSkills.filter((s) => s.toLowerCase() === defaultSkill.toLowerCase())
          : cached.detectedSkills;
        setSelectedSkills(preselected.length > 0 ? preselected : cached.detectedSkills);
        return;
      }
    }

    setInspecting(true);
    try {
      const pat = localStorage.getItem('applywise_github_token') || '';
      const res = await apiFetch('/api/github/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl: targetUrl,
          username: targetUser,
          githubToken: pat,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429 || data.rateLimited) {
          setRateLimited(true);
        }
        setError(data.error || 'Could not inspect GitHub repository.');
        setInspection(null);
      } else {
        setCachedInspection(cacheKey, data);
        setInspection(data);
        const preselected = defaultSkill
          ? (data.detectedSkills || []).filter(
              (s: string) => s.toLowerCase() === defaultSkill.toLowerCase()
            )
          : data.detectedSkills || [];
        setSelectedSkills(
          preselected.length > 0 ? preselected : (data.detectedSkills || []).slice(0, 5)
        );
      }
    } catch {
      setError('Network error while inspecting GitHub repository.');
    } finally {
      setInspecting(false);
    }
  };

  const handleToggleSkill = (skill: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    );
  };

  const handleReviewRepo = async () => {
    if (!inspection) return;
    setReviewing(true);
    try {
      const res = await apiFetch('/api/github/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: inspection.owner,
          repo: inspection.repo,
          description: inspection.description,
          readmeText: inspection.readmeExcerpt,
          treePaths: inspection.treePaths,
          languages: inspection.languages,
          detectedSkills: inspection.detectedSkills,
          modelId: selectedModelId,
        }),
      });
      const data = await res.json();
      if (res.ok && data.summary) {
        setAiReview(data);
      }
    } catch {
      // Ignore optional AI review failure
    } finally {
      setReviewing(false);
    }
  };

  const handleAttachSkills = async () => {
    if (!inspection) return;
    const skillsToSave =
      selectedSkills.length > 0
        ? selectedSkills
        : defaultSkill
        ? [defaultSkill]
        : inspection.detectedSkills.slice(0, 1);

    if (skillsToSave.length === 0) {
      setError('Select at least one detected skill to attach this repository to.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      for (const skill of skillsToSave) {
        const hasSignal = inspection.detectedSkills.some(
          (d) => d.toLowerCase() === skill.toLowerCase()
        );
        const finalStatus =
          inspection.validationStatus === 'valid' && hasSignal ? 'valid' : 'rejected';
        const finalReason =
          finalStatus === 'valid'
            ? inspection.weakWarningReason || inspection.validationReason
            : !hasSignal
            ? `Repository passed commit checks, but no code/config signal for ${skill} was detected.`
            : inspection.validationReason;

        const details: GitHubRepoEvidenceDetails = {
          owner: inspection.owner,
          repo: inspection.repo,
          username: username.trim().replace(/^@/, ''),
          description: inspection.description,
          languages: inspection.languages,
          pushedAt: inspection.pushedAt,
          isFork: inspection.isFork,
          isPrivate: inspection.isPrivate,
          stargazersCount: inspection.stargazersCount,
          defaultBranch: inspection.defaultBranch,
          userCommitCount: inspection.userCommitCount,
          singleDayCommitWarning: inspection.singleDayCommitWarning,
          detectedSkills: inspection.detectedSkills?.map((s) => ({ skill: s, signal: 'detected' })),
          treeHighlights: inspection.treePaths.slice(0, 20),
          readmeExcerpt: inspection.readmeExcerpt?.slice(0, 500),
          aiReview: aiReview || undefined,
          lastCheckedAt: new Date().toISOString(),
        };

        await apiFetch('/api/evidence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            skill,
            skillId: skill,
            type: 'github',
            title: `${inspection.owner}/${inspection.repo}`,
            url: inspection.url,
            status: finalStatus,
            reason: finalReason,
            addedAt: new Date().toISOString(),
            details,
            extracted_summary:
              inspection.description ||
              `GitHub repo ${inspection.owner}/${inspection.repo} (${inspection.userCommitCount} commits by @${username})`,
          }),
        });
      }

      await onEvidenceCreated();
      onClose();
    } catch {
      setError('Failed to save GitHub repository evidence.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-900 dark:bg-slate-800 text-white flex items-center justify-center">
              <Github className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Link GitHub Repository as Proof
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Verifies ownership, commit history, languages, and config files via the GitHub API
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Quick sample presets for instant testing */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium mr-1">
              Quick test repos:
            </span>
            <button
              type="button"
              onClick={() => {
                const u = 'https://github.com/arjun-mehta/telemetry-cloud-ui';
                setRepoUrl(u);
                setUsername('arjun-mehta');
                handleInspect(false, u, 'arjun-mehta');
              }}
              className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-blue-400 transition-colors"
            >
              Valid Repo (24 commits)
            </button>
            <button
              type="button"
              onClick={() => {
                const u = 'https://github.com/arjun-mehta/weak-commits';
                setRepoUrl(u);
                setUsername('arjun-mehta');
                handleInspect(false, u, 'arjun-mehta');
              }}
              className="px-2.5 py-1 rounded-md border border-amber-200 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 hover:border-amber-400 transition-colors"
            >
              Weak Evidence (2 commits)
            </button>
            <button
              type="button"
              onClick={() => {
                const u = 'https://github.com/arjun-mehta/demo-fork';
                setRepoUrl(u);
                setUsername('arjun-mehta');
                handleInspect(false, u, 'arjun-mehta');
              }}
              className="px-2.5 py-1 rounded-md border border-red-200 dark:border-red-800/60 bg-red-50/60 dark:bg-red-950/30 text-red-700 dark:text-red-300 hover:border-red-400 transition-colors"
            >
              Fork w/ 0 Commits (Rejected)
            </button>
          </div>

          {/* Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                GitHub Repository URL
              </label>
              <input
                type="url"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/username/repository"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Your GitHub Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. arjun-mehta"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Your username is saved to your profile so we can verify your commits. Responses are cached for 1 hour.
            </p>
            <button
              type="button"
              onClick={() => handleInspect(false)}
              disabled={inspecting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${inspecting ? 'animate-spin' : ''}`} />
              {inspecting ? 'Checking GitHub...' : 'Verify Repository'}
            </button>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <XCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
              {rateLimited && (
                <p className="text-[11px] text-red-600 dark:text-red-400">
                  Tip: Open the avatar menu → Settings → Advanced to paste a GitHub Personal Access Token (increases limit from 60 to 5,000 requests/hr).
                </p>
              )}
            </div>
          )}

          {/* Inspection Results */}
          {inspection && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4 space-y-4">
              {/* Top status banner */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <a
                      href={inspection.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-bold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 inline-flex items-center gap-1"
                    >
                      {inspection.owner}/{inspection.repo}
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    {inspection.isFork && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                        Fork
                      </span>
                    )}
                  </div>
                  {inspection.description && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                      {inspection.description}
                    </p>
                  )}
                </div>

                {/* Validation badge */}
                {inspection.validationStatus === 'rejected' ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-800/60">
                    <XCircle className="w-3.5 h-3.5" />
                    Rejected
                  </span>
                ) : inspection.singleDayCommitWarning ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Valid (Weak Evidence Warning)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Passed Validation
                  </span>
                )}
              </div>

              {/* Validation Reason / Weak Evidence Warning */}
              <div
                className={`p-3 rounded-lg text-xs border ${
                  inspection.validationStatus === 'rejected'
                    ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-800 dark:text-red-300'
                    : inspection.singleDayCommitWarning
                    ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300'
                    : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300'
                }`}
              >
                <p className="font-medium">
                  {inspection.singleDayCommitWarning && inspection.weakWarningReason
                    ? inspection.weakWarningReason
                    : inspection.validationReason}
                </p>
              </div>

              {/* Metadata row */}
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <GitCommit className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <strong className="text-slate-900 dark:text-white">
                    {inspection.userCommitCount}
                  </strong>{' '}
                  commits by @{username.trim().replace(/^@/, '')}
                </span>
                {inspection.pushedAt && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    Updated {new Date(inspection.pushedAt).toLocaleDateString()}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 text-amber-500" />
                  {inspection.stargazersCount} stars
                </span>
              </div>

              {/* Languages bar */}
              <LanguageBreakdownBar languages={inspection.languages} />

              {/* Detected Skills with Checkboxes */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700/70">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Detected Skills (choose which skills to attach this repo to)
                  </label>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {inspection.validationStatus === 'valid'
                      ? 'Selected skills will become Verified'
                      : 'Repo rejected — skills will not be marked Verified'}
                  </span>
                </div>

                {inspection.detectedSkills.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No matching technical signals found in languages or config files.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {inspection.detectedSkills.map((skill) => {
                      const checked = selectedSkills.includes(skill);
                      return (
                        <label
                          key={skill}
                          onClick={() => handleToggleSkill(skill)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                            checked
                              ? 'border-blue-600 bg-blue-50/80 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200'
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <span
                            className={`w-4 h-4 rounded flex items-center justify-center border ${
                              checked
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'border-slate-300 dark:border-slate-600'
                            }`}
                          >
                            {checked && <Check className="w-3 h-3" />}
                          </span>
                          <span className="truncate">{skill}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Optional AI Review ("Review this repo") */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700/70">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Optional AI Repository Review
                    </span>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Reviews README and file tree for strengths & gaps (advice only — does not change verified status)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleReviewRepo}
                    disabled={reviewing}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    {reviewing ? 'Reviewing...' : 'Review this repo'}
                  </button>
                </div>

                {aiReview && (
                  <div className="mt-3 p-3.5 rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/40 dark:bg-blue-950/20 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-blue-900 dark:text-blue-300">
                        AI Repository Feedback (Advisory Only)
                      </span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                      {aiReview.summary}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <div>
                        <p className="font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
                          Strengths
                        </p>
                        <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                          {aiReview.strengths.map((s, i) => (
                            <li key={i}>• {s}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="font-semibold text-amber-700 dark:text-amber-400 mb-1">
                          Suggested Fixes
                        </p>
                        <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                          {aiReview.suggestedFixes.map((g: string, i: number) => (
                            <li key={i}>• {g}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!inspection || saving || selectedSkills.length === 0}
            onClick={handleAttachSkills}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
          >
            <ShieldCheck className="w-4 h-4" />
            {saving
              ? 'Attaching...'
              : inspection?.validationStatus === 'rejected'
              ? `Save Record (${selectedSkills.length} skill${selectedSkills.length === 1 ? '' : 's'})`
              : `Attach & Verify ${selectedSkills.length} Skill${
                  selectedSkills.length === 1 ? '' : 's'
                }`}
          </button>
        </div>
      </div>
    </div>
  );
};

interface GitHubEvidenceCardProps {
  item: EvidenceItem;
  onRemove: (id: number) => void;
  onUpdated: () => void;
  selectedModelId?: string;
}

export const GitHubEvidenceCard: React.FC<GitHubEvidenceCardProps> = ({
  item,
  onRemove,
  onUpdated,
  selectedModelId,
}) => {
  const [rechecking, setRechecking] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const details = (item.details || {}) as GitHubRepoEvidenceDetails;
  const owner = details.owner || item.title.split('/')[0] || 'github';
  const repo = details.repo || item.title.split('/')[1] || item.title;
  const username =
    details.username || localStorage.getItem('applywise_github_username') || 'arjun-mehta';
  const isRejected = item.status === 'rejected';
  const isWeak = Boolean(details.singleDayCommitWarning);

  const handleRecheck = async () => {
    setRechecking(true);
    try {
      const pat = localStorage.getItem('applywise_github_token') || '';
      const res = await apiFetch('/api/github/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl: item.url || `https://github.com/${owner}/${repo}`,
          username,
          githubToken: pat,
        }),
      });
      if (res.ok) {
        const data: GitHubInspectionResult = await res.json();
        const updatedDetails: GitHubRepoEvidenceDetails = {
          ...details,
          owner: data.owner,
          repo: data.repo,
          username,
          description: data.description,
          languages: data.languages,
          pushedAt: data.pushedAt,
          isFork: data.isFork,
          isPrivate: data.isPrivate,
          stargazersCount: data.stargazersCount,
          userCommitCount: data.userCommitCount,
          singleDayCommitWarning: data.singleDayCommitWarning,
          detectedSkills: data.detectedSkills?.map((s) => ({ skill: s, signal: 'detected' })),
          treeHighlights: data.treePaths?.slice(0, 20),
          readmeExcerpt: data.readmeExcerpt?.slice(0, 500),
          lastCheckedAt: new Date().toISOString(),
        };

        await apiFetch(`/api/evidence/${item.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: data.validationStatus,
            reason: data.weakWarningReason || data.validationReason,
            details: updatedDetails,
          }),
        });
        onUpdated();
      }
    } finally {
      setRechecking(false);
    }
  };

  const handleReview = async () => {
    setReviewing(true);
    try {
      const res = await apiFetch('/api/github/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner,
          repo,
          description: details.description || item.extracted_summary || '',
          readmeText: details.readmeExcerpt || item.extracted_summary || '',
          treePaths: details.treeHighlights || [],
          languages: details.languages || {},
          detectedSkills: details.detectedSkills || [item.skill],
          modelId: selectedModelId,
        }),
      });
      if (res.ok) {
        const reviewData: GitHubAIReviewResult = await res.json();
        const updatedDetails: GitHubRepoEvidenceDetails = {
          ...details,
          aiReview: reviewData,
        };
        await apiFetch(`/api/evidence/${item.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            details: updatedDetails,
          }),
        });
        onUpdated();
      }
    } finally {
      setReviewing(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-slate-800 text-white flex items-center justify-center shrink-0 mt-0.5">
            <Github className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={item.url || `https://github.com/${owner}/${repo}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-bold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 inline-flex items-center gap-1 truncate"
              >
                {owner}/{repo}
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              </a>
              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50">
                Skill: {item.skill}
              </span>
            </div>
            {(details.description || item.extracted_summary) && (
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2">
                {details.description || item.extracted_summary}
              </p>
            )}
          </div>
        </div>

        {/* Validation status badge */}
        <div className="flex items-center gap-1.5">
          {isRejected ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-800/60">
              <XCircle className="w-3 h-3" />
              Rejected
            </span>
          ) : isWeak ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
              <AlertTriangle className="w-3 h-3" />
              Weak Evidence
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              <CheckCircle2 className="w-3 h-3" />
              Verified
            </span>
          )}
        </div>
      </div>

      {item.reason && (
        <p
          className={`text-[11px] px-2.5 py-1.5 rounded-lg ${
            isRejected
              ? 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300'
              : isWeak
              ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
              : 'bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400'
          }`}
        >
          {item.reason}
        </p>
      )}

      {/* Languages bar */}
      {details.languages && Object.keys(details.languages).length > 0 && (
        <LanguageBreakdownBar languages={details.languages} />
      )}

      {/* Commit count, last updated, and detected skills */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 pt-1">
        <div className="flex flex-wrap items-center gap-3">
          {details.userCommitCount !== undefined && (
            <span className="inline-flex items-center gap-1">
              <GitCommit className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <strong className="text-slate-800 dark:text-slate-200">
                {details.userCommitCount}
              </strong>{' '}
              commits by @{username}
            </span>
          )}
          {details.pushedAt && (
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Updated {new Date(details.pushedAt).toLocaleDateString()}
            </span>
          )}
        </div>

        {details.detectedSkills && details.detectedSkills.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {details.detectedSkills.slice(0, 5).map((sk: any, idx: number) => {
              const label = typeof sk === 'string' ? sk : sk?.skill || '';
              return (
                <span
                  key={typeof sk === 'string' ? sk : `${label}-${idx}`}
                  className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                >
                  {label}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* AI Review section if generated */}
      {details.aiReview && (
        <div className="p-3 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50/40 dark:bg-blue-950/20 space-y-1.5 text-xs">
          <div className="font-semibold text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            AI Repo Review (Advisory Only)
          </div>
          <p className="text-slate-700 dark:text-slate-300">{details.aiReview.summary}</p>
          {details.aiReview.suggestedFixes?.length > 0 && (
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              <strong>Suggested fix:</strong> {details.aiReview.suggestedFixes[0]}
            </p>
          )}
        </div>
      )}

      {/* Actions: Review this repo, Re-check, Remove */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleReview}
          disabled={reviewing}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          {reviewing ? 'Reviewing...' : 'Review this repo'}
        </button>
        <button
          type="button"
          onClick={handleRecheck}
          disabled={rechecking}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${rechecking ? 'animate-spin' : ''}`} />
          {rechecking ? 'Re-checking...' : 'Re-check'}
        </button>
        <button
          type="button"
          onClick={() => {
            if (item.id !== undefined) onRemove(Number(item.id));
          }}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-red-900/50 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Remove
        </button>
      </div>
    </div>
  );
};
