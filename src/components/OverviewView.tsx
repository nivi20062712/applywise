import React, { useMemo, useState } from 'react';
import {
  Profile,
  EvidenceItem,
  AnalysisData,
  ApplicationItem,
  AttachmentItem,
  AIProviderStatus,
} from '../types';
import {
  identifySkills,
  calculateReadinessScore,
  buildEnhancedSevenDayPlan,
  DEMO_PROFILES,
} from '../utils/skillMatcher';
import {
  getSkillStatus,
  normalizeEvidenceItem,
  normalizeSkillName,
  SkillStatusContext,
} from '../utils/evidenceModel';
import { fetchApi } from '../api';
import { ReadinessGauge } from './ReadinessGauge';
import { ViewerMode } from './InferenceInspectorModal';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  Calendar,
  FolderCheck,
  Briefcase,
  Kanban,
  UploadCloud,
  Loader2,
  Users,
  RefreshCw,
  Share2,
} from 'lucide-react';

interface OverviewViewProps {
  profile: Profile | null;
  evidence: EvidenceItem[];
  analysis: AnalysisData | null;
  analysesList?: AnalysisData[];
  applications: ApplicationItem[];
  attachments?: AttachmentItem[];
  selectedModelId: string;
  viewerMode?: ViewerMode;
  aiStatus?: AIProviderStatus | null;
  onRefreshAIStatus?: () => void;
  onSelectAnalysis: (analysis: AnalysisData) => void;
  onSelectJobForMatch: (jobDescriptionText: string) => void;
  onNavigate: (page: string) => void;
  onOpenProfile: () => void;
  onInspectSkill: (skillName: string) => void;
  onOpenReportModal: () => void;
  onOpenPassportModal?: () => void;
  onRefresh?: () => void;
  onNotify?: (msg: string) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  profile,
  evidence,
  analysis,
  applications,
  attachments = [],
  viewerMode = 'jobseeker',
  aiStatus,
  onRefreshAIStatus,
  onSelectAnalysis,
  onNavigate,
  onInspectSkill,
  onOpenPassportModal,
  onRefresh,
  onNotify,
}) => {
  const [loadingDemoId, setLoadingDemoId] = useState<string | null>(null);
  const [showEmptyPreview, setShowEmptyPreview] = useState(false);
  const [retryingAiStatus, setRetryingAiStatus] = useState(false);

  const isAiOffline = !aiStatus?.nebiusConfigured;

  const handleRetryAiStatus = async () => {
    setRetryingAiStatus(true);
    try {
      await onRefreshAIStatus?.();
      onNotify?.('Refreshed AI status.');
    } finally {
      setRetryingAiStatus(false);
    }
  };

  const firstName = useMemo(() => {
    const raw = (profile?.name || '').trim();
    if (!raw || raw.toLowerCase() === 'candidate') return '';
    return raw.split(/\s+/)[0];
  }, [profile?.name]);

  const statusContext = useMemo<SkillStatusContext>(
    () => ({
      evidence,
      profile,
      attachments,
    }),
    [evidence, profile, attachments]
  );

  // Build candidate skill universe from evidence, profile/resume, and current analysis
  const candidateSkillsUniverse = useMemo(() => {
    const fromEvidence = evidence
      .map((e) => normalizeEvidenceItem(e))
      .map((e) => e.skillId || e.skill);
    const fromClaimed = [
      ...identifySkills(
        `${profile?.skills_text || ''} ${profile?.resume_text || ''} ${attachments
          .map((a) => a.extracted_text)
          .join(' ')}`
      ),
      ...(profile?.skills_text || '')
        .split(',')
        .map((s) => normalizeSkillName(s).canonical)
        .filter((s) => s.length > 1 && s.length < 32),
    ];
    const fromAnalysis = [
      ...(analysis?.verifiedSkills || []).map((v) => v.skill),
      ...(analysis?.unprovenSkills || []).map((u) => u.skill),
      ...(analysis?.missingSkills || []).map((m) => m.skill),
    ];
    const defaults =
      fromAnalysis.length > 0
        ? []
        : ['TypeScript', 'Unit Testing', 'Docker', 'AWS', 'System Design', 'SQL'];

    const seen = new Set<string>();
    const list: string[] = [];
    for (const raw of [...fromEvidence, ...fromClaimed, ...fromAnalysis, ...defaults]) {
      const canonical = normalizeSkillName(raw).canonical || raw;
      if (!canonical) continue;
      const lower = canonical.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        list.push(canonical);
      }
    }
    return list;
  }, [evidence, profile, attachments, analysis]);

  // Verified skills = computed strictly via getSkillStatus(skill, statusContext) === 'verified'
  const verifiedSkills = useMemo(() => {
    return candidateSkillsUniverse.filter(
      (sk) => getSkillStatus(sk, statusContext) === 'verified'
    );
  }, [candidateSkillsUniverse, statusContext]);

  // Need proof (declared) = computed strictly via getSkillStatus(skill, statusContext) === 'declared'
  const needProofSkills = useMemo(() => {
    return candidateSkillsUniverse.filter(
      (sk) => getSkillStatus(sk, statusContext) === 'declared'
    );
  }, [candidateSkillsUniverse, statusContext]);

  // Missing skills = computed strictly via getSkillStatus(skill, statusContext) === 'missing'
  const missingSkills = useMemo(() => {
    return candidateSkillsUniverse.filter(
      (sk) => getSkillStatus(sk, statusContext) === 'missing'
    );
  }, [candidateSkillsUniverse, statusContext]);

  // Compute readiness score
  const readinessScore = useMemo(() => {
    if (showEmptyPreview) return 0;
    const totalTarget = Math.max(
      1,
      verifiedSkills.length + needProofSkills.length + missingSkills.length
    );
    const fallback = calculateReadinessScore({
      matchedCount: verifiedSkills.length + needProofSkills.length,
      totalRequired: totalTarget,
      verifiedEvidenceCount: evidence.length,
    });
    return analysis?.readinessScore ?? fallback.score;
  }, [showEmptyPreview, analysis, verifiedSkills, needProofSkills, missingSkills, evidence]);

  // Next best action skill (first skill needing proof, or first missing skill)
  const nextActionSkill = needProofSkills[0] || missingSkills[0] || 'TypeScript';
  const targetRoleLabel =
    analysis?.jobTitle || profile?.title || 'Software Engineer';

  // One-line second-person summary (strictly "you/your", "verified" only when proof exists)
  const oneLineSummary = useMemo(() => {
    if (showEmptyPreview || (verifiedSkills.length === 0 && needProofSkills.length === 0)) {
      return 'Upload your résumé or link a project repository to calculate your role readiness score.';
    }
    if (verifiedSkills.length > 0) {
      return `You have verified proof for ${verifiedSkills.length} ${
        verifiedSkills.length === 1 ? 'skill' : 'skills'
      }, ${needProofSkills.length} ${
        needProofSkills.length === 1 ? 'skill needs' : 'skills need'
      } proof, and ${missingSkills.length} ${
        missingSkills.length === 1 ? 'is' : 'are'
      } missing for ${targetRoleLabel}.`;
    }
    return `You have ${needProofSkills.length} self-declared ${
      needProofSkills.length === 1 ? 'skill' : 'skills'
    } that need attached proof for ${targetRoleLabel}.`;
  }, [showEmptyPreview, verifiedSkills, needProofSkills, missingSkills, targetRoleLabel]);

  // 7-day sprint progress ("This week" card)
  const sevenDayPlan = useMemo(() => {
    if (analysis?.sevenDayPlan && analysis.sevenDayPlan.length > 0) {
      return analysis.sevenDayPlan;
    }
    return buildEnhancedSevenDayPlan(targetRoleLabel, missingSkills, needProofSkills);
  }, [analysis, targetRoleLabel, missingSkills, needProofSkills]);

  const completedSprintDays = useMemo(() => {
    try {
      const raw = localStorage.getItem(
        `applywise_sprint_done_${profile?.user_id || 'default'}`
      );
      const parsed: number[] = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [profile?.user_id]);

  const nextUnfinishedSprintDay = useMemo(() => {
    return (
      sevenDayPlan.find((d) => !completedSprintDays.includes(d.day)) ||
      sevenDayPlan[0]
    );
  }, [sevenDayPlan, completedSprintDays]);

  const isNewUserEmpty =
    showEmptyPreview ||
    (verifiedSkills.length === 0 &&
      needProofSkills.length === 0 &&
      attachments.length === 0 &&
      !profile?.resume_text);

  const handleLoadDemoProfile = async (presetId: string) => {
    setShowEmptyPreview(false);
    setLoadingDemoId(presetId);
    try {
      const res = await fetchApi<{
        ok: boolean;
        label: string;
        token?: string;
        user?: { id: number; name: string; email: string; role?: string };
        analysis: AnalysisData;
      }>('/demo-profile', {
        method: 'POST',
        body: JSON.stringify({ presetId }),
      });
      if (res.token) {
        localStorage.setItem('applywise_token', res.token);
      }
      if (res.user) {
        localStorage.setItem('applywise_user', JSON.stringify(res.user));
      }
      if (res.analysis) {
        onSelectAnalysis(res.analysis);
      }
      onRefresh?.();
      onNotify?.(`Loaded sample profile: ${res.label}`);
    } catch {
      onNotify?.('Could not load sample profile.');
    } finally {
      setLoadingDemoId(null);
    }
  };

  return (
    <div className="space-y-6" data-viewer-mode={viewerMode}>
      {/* Greeting Header + Sample Persona Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Track your attached proof, close skill gaps, and apply with confidence.
          </p>
        </div>

        {/* Sample Profile Switcher for instant testing */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5 mr-1">
            <Users className="w-3.5 h-3.5 text-[#2563EB]" />
            <span>Sample profile:</span>
          </span>
          {DEMO_PROFILES.map((preset) => {
            const isActive = !showEmptyPreview && profile?.name === preset.name;
            const isLoading = loadingDemoId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                disabled={Boolean(loadingDemoId)}
                onClick={() => handleLoadDemoProfile(preset.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition cursor-pointer inline-flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
                  isActive
                    ? 'border-[#2563EB] bg-[#2563EB]/10 text-[#2563EB] dark:text-[#60A5FA] font-semibold'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {isLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                <span>{preset.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setShowEmptyPreview(!showEmptyPreview)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
              showEmptyPreview
                ? 'border-[#2563EB] bg-[#2563EB]/10 text-[#2563EB] dark:text-[#60A5FA] font-semibold'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            New user view
          </button>
          {onOpenPassportModal && (
            <button
              type="button"
              onClick={onOpenPassportModal}
              data-testid="home-header-share-passport-btn"
              className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] text-slate-800 dark:text-slate-200 hover:border-[#2563EB] transition cursor-pointer inline-flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
            >
              <Share2 className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>Share my Passport</span>
            </button>
          )}
        </div>
      </div>

      {/* Empty State for New Users (Single CTA) */}
      {isNewUserEmpty ? (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xs p-8 sm:p-12 text-center max-w-2xl mx-auto space-y-5">
          {isAiOffline && (
            <div
              role="alert"
              data-testid="home-empty-ai-offline-banner"
              className="mb-4 p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200 text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="font-medium">
                  AI offline: set NEBIUS_API_KEY on the server and restart.
                </span>
              </div>
              <button
                type="button"
                onClick={handleRetryAiStatus}
                disabled={retryingAiStatus}
                className="px-2.5 py-1 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 hover:bg-amber-100/50 dark:hover:bg-slate-800 text-amber-900 dark:text-amber-200 font-semibold inline-flex items-center gap-1.5 shrink-0 transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${retryingAiStatus ? 'animate-spin' : ''}`} />
                <span>Retry</span>
              </button>
            </div>
          )}
          <div className="w-12 h-12 rounded-2xl bg-[#2563EB]/10 text-[#2563EB] flex items-center justify-center mx-auto">
            <UploadCloud className="w-6 h-6" />
          </div>
          <div className="space-y-2">
            <h3 className="font-heading text-lg font-semibold text-slate-900 dark:text-white">
              Start by uploading your résumé or first project proof
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-[22px]">
              Upload a PDF, DOCX, certificate, or link a GitHub repository so you can see which skills are backed by proof and which need evidence.
            </p>
          </div>
          <div>
            <button
              type="button"
              onClick={() => onNavigate('attachments')}
              className="px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold transition inline-flex items-center gap-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Upload your first proof</span>
            </button>
          </div>
        </section>
      ) : (
        <>
          {/* Hero Card: Readiness Ring + One-Line Summary + Next Best Action Button */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xs p-6 sm:p-8">
            {isAiOffline && (
              <div
                role="alert"
                data-testid="home-hero-ai-offline-banner"
                className="mb-5 p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="font-medium">
                    AI offline: set NEBIUS_API_KEY on the server and restart.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleRetryAiStatus}
                  disabled={retryingAiStatus}
                  className="px-2.5 py-1 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 hover:bg-amber-100/50 dark:hover:bg-slate-800 text-amber-900 dark:text-amber-200 font-semibold inline-flex items-center gap-1.5 shrink-0 transition cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${retryingAiStatus ? 'animate-spin' : ''}`} />
                  <span>Retry</span>
                </button>
              </div>
            )}
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
                <ReadinessGauge
                  score={readinessScore}
                  size={200}
                  label="Readiness"
                  sublabel={targetRoleLabel}
                />
                <div className="space-y-2 max-w-xl">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Target role · <span className="text-slate-800 dark:text-slate-200 font-semibold">{targetRoleLabel}</span>
                    {analysis?.company ? ` · ${analysis.company}` : ''}
                  </div>
                  <h3 className="font-heading text-lg sm:text-xl font-semibold text-slate-900 dark:text-white leading-snug">
                    {oneLineSummary}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-[22px]">
                    Attach a repository, live deployment URL, or certificate for your unproven skills to increase your readiness score.
                  </p>
                </div>
              </div>

              {/* Primary Actions on Home */}
              <div className="shrink-0 w-full md:w-auto flex flex-col sm:flex-row items-center gap-3">
                {onOpenPassportModal && (
                  <button
                    type="button"
                    onClick={onOpenPassportModal}
                    data-testid="home-hero-share-passport-btn"
                    className="w-full sm:w-auto px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-[#2563EB] text-slate-800 dark:text-slate-200 text-sm font-semibold transition inline-flex items-center justify-center gap-2 cursor-pointer shadow-xs whitespace-nowrap"
                  >
                    <Share2 className="w-4 h-4 text-[#2563EB]" />
                    <span>Share my Passport</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onInspectSkill(nextActionSkill)}
                  className="w-full sm:w-auto px-5 py-3 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold transition inline-flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] whitespace-nowrap"
                >
                  <span>Add proof for {nextActionSkill}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </section>

          {/* Three Stat Tiles: Verified skills | Need proof | Missing */}
          <section
            aria-label="Skill status summary"
            className="grid grid-cols-1 md:grid-cols-3 gap-4"
          >
            {/* 1. Verified skills */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xs p-5 flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                  Verified skills
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Verified</span>
                </span>
              </div>
              <div>
                <div className="font-heading text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
                  {verifiedSkills.length}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
                  {verifiedSkills.length > 0
                    ? verifiedSkills.join(' · ')
                    : 'No skills have attached proof yet'}
                </p>
              </div>
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80">
                <button
                  type="button"
                  onClick={() => onNavigate('skills')}
                  className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>View verified proofs</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 2. Need proof */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xs p-5 flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                  Need proof
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Needs proof</span>
                </span>
              </div>
              <div>
                <div className="font-heading text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
                  {needProofSkills.length}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
                  {needProofSkills.length > 0
                    ? needProofSkills.join(' · ')
                    : 'All claimed skills have proof attached'}
                </p>
              </div>
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80">
                <button
                  type="button"
                  onClick={() =>
                    needProofSkills[0]
                      ? onInspectSkill(needProofSkills[0])
                      : onNavigate('skills')
                  }
                  className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>Attach proof now</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 3. Missing */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xs p-5 flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                  Missing
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 text-red-700 dark:text-red-400 text-xs font-semibold">
                  <XCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Missing</span>
                </span>
              </div>
              <div>
                <div className="font-heading text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
                  {missingSkills.length}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
                  {missingSkills.length > 0
                    ? missingSkills.join(' · ')
                    : 'No missing skills for your target role'}
                </p>
              </div>
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80">
                <button
                  type="button"
                  onClick={() => onNavigate('roadmap')}
                  className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>Start 7-day proof sprint</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </section>

          {/* Bottom Split: "This week" Card + "Recent activity" List */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* "This week" Card (Sprint progress + next unfinished day) */}
            <section className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xs p-6 flex flex-col justify-between space-y-5">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="font-heading text-lg font-semibold text-slate-900 dark:text-white">
                      This week
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Your 7-day proof sprint for {targetRoleLabel}
                    </p>
                  </div>
                  <span className="text-xs font-mono font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                    {completedSprintDays.length} / {sevenDayPlan.length} days done
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#2563EB] transition-all duration-300"
                    style={{
                      width: `${Math.round(
                        (completedSprintDays.length / Math.max(1, sevenDayPlan.length)) * 100
                      )}%`,
                    }}
                  />
                </div>

                {/* Next Unfinished Day */}
                {nextUnfinishedSprintDay && (
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-[#2563EB] dark:text-[#60A5FA]">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Next unfinished · Day {nextUnfinishedSprintDay.day}</span>
                      </span>
                      {(nextUnfinishedSprintDay.focusSkill || nextUnfinishedSprintDay.skill) && (
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          Focus: {nextUnfinishedSprintDay.focusSkill || nextUnfinishedSprintDay.skill}
                        </span>
                      )}
                    </div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {nextUnfinishedSprintDay.phase || nextUnfinishedSprintDay.focus || `Day ${nextUnfinishedSprintDay.day} Sprint`}
                    </h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-[22px]">
                      {nextUnfinishedSprintDay.task || nextUnfinishedSprintDay.action}
                    </p>
                    {(nextUnfinishedSprintDay.expectedProof || nextUnfinishedSprintDay.deliverable) && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Deliverable:{' '}
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {nextUnfinishedSprintDay.expectedProof || nextUnfinishedSprintDay.deliverable}
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Attach proof to complete Day {nextUnfinishedSprintDay?.day || 1}
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('roadmap')}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[#2563EB] text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 transition cursor-pointer"
                >
                  <span>Open roadmap</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </section>

            {/* "Recent activity" List (Last uploads, last match, last application) */}
            <section className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xs p-6 flex flex-col justify-between space-y-4">
              <div>
                <h3 className="font-heading text-lg font-semibold text-slate-900 dark:text-white">
                  Recent activity
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Your latest proofs, job matches, and applications
                </p>

                <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                  {/* 1. Last Upload / Evidence */}
                  <div className="py-3 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <FolderCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500 dark:text-slate-400">Latest proof</p>
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {attachments[0]?.filename ||
                            evidence[0]?.title ||
                            'No proof uploaded yet'}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {evidence[0]?.skill
                            ? `Supports ${evidence[0].skill}`
                            : attachments[0]?.category || 'Add a file in Proof Vault'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate('attachments')}
                      className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline shrink-0 cursor-pointer"
                    >
                      Vault
                    </button>
                  </div>

                  {/* 2. Last Job Match */}
                  <div className="py-3 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <Briefcase className="w-4 h-4 text-[#2563EB] dark:text-[#60A5FA] shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500 dark:text-slate-400">Latest match</p>
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {analysis?.jobTitle || 'No job matched yet'}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate tabular-nums">
                          {analysis
                            ? `${analysis.company || 'Target company'} · ${analysis.readinessScore}% readiness`
                            : 'Match a job description to see your fit'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate('skills')}
                      className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline shrink-0 cursor-pointer"
                    >
                      Skills
                    </button>
                  </div>

                  {/* 3. Last Application */}
                  <div className="py-3 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <Kanban className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Latest application
                        </p>
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {applications[0]
                            ? `${applications[0].job_title} · ${applications[0].company}`
                            : 'No saved applications yet'}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {applications[0]
                            ? `Status: ${applications[0].status}`
                            : 'Save a role from Jobs to track your pipeline'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate('applications')}
                      className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline shrink-0 cursor-pointer"
                    >
                      Board
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
};
