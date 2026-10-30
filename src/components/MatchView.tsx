import React, { useState, useEffect, useMemo, useRef } from 'react';
import { fetchApi, runUploadCheckOnFile, callAiStructured } from '../api';
import {
  Profile,
  EvidenceItem,
  AnalysisData,
  AttachmentItem,
  JdGapAnalysisResult,
  JdEvaluatedSkillItem,
  JdExtractionOutput,
  UploadCheckResult,
  WhyThisScoreResult,
  CopilotStructuredResponse,
} from '../types';
import {
  FEATURED_COMPANY_JOBS,
  buildEnhancedSevenDayPlan,
} from '../utils/skillMatcher';
import {
  computeJdGapAnalysis,
  SkillStatusContext,
} from '../utils/evidenceModel';
import { ReadinessGauge } from './ReadinessGauge';
import { UploadCheckModal } from './UploadCheckModal';
import {
  Loader2,
  UploadCloud,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Link2,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Plus,
  Trash2,
  FileText,
  Calendar,
  Bookmark,
  Check,
  Quote,
  X,
  ArrowRight,
  Compass,
} from 'lucide-react';

interface MatchViewProps {
  profile: Profile | null;
  evidence: EvidenceItem[];
  attachments: AttachmentItem[];
  analysis?: AnalysisData | null;
  analysesList?: AnalysisData[];
  selectedJob: string;
  selectedModelId?: string;
  onAnalysisDone: (analysis: AnalysisData, targetPage?: string) => void;
  onRefreshAttachments: () => void;
  onNavigate: (page: string) => void;
  onInspectSkill?: (skillName: string) => void;
  onNotify?: (msg: string) => void;
}

interface ManualSkillRow {
  skill: string;
  importance: 'core' | 'important' | 'nice-to-have';
  quote: string;
}

export const MatchView: React.FC<MatchViewProps> = ({
  profile,
  evidence,
  attachments,
  analysis,
  analysesList = [],
  selectedJob,
  selectedModelId,
  onAnalysisDone,
  onRefreshAttachments,
  onNavigate,
  onInspectSkill,
  onNotify,
}) => {
  const [jobDescription, setJobDescription] = useState(selectedJob || '');
  const [roleTitleInput, setRoleTitleInput] = useState('');
  const [companyInput, setCompanyInput] = useState('');
  const [jdUrlInput, setJdUrlInput] = useState('');
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [urlWarning, setUrlWarning] = useState('');

  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [gapResult, setGapResult] = useState<JdGapAnalysisResult | null>(null);
  const [latestSavedAnalysis, setLatestSavedAnalysis] = useState<AnalysisData | null>(
    analysis || null
  );

  // Collapsible Nice-to-haves section & Scoring formula drawer
  const [niceToHavesOpen, setNiceToHavesOpen] = useState(false);
  const [isScoreDrawerOpen, setIsScoreDrawerOpen] = useState(false);
  const [savingToApps, setSavingToApps] = useState(false);
  const [savedToApps, setSavedToApps] = useState(false);

  // Step 4b: "Why this score?" AI explanation state
  const [loadingWhyScore, setLoadingWhyScore] = useState(false);
  const [whyThisScoreResponse, setWhyThisScoreResponse] =
    useState<CopilotStructuredResponse<WhyThisScoreResult> | null>(null);

  // Résumé Upload Check state in Job Match
  const [isResumeCheckOpen, setIsResumeCheckOpen] = useState(false);
  const [isRunningResumeCheck, setIsRunningResumeCheck] = useState(false);
  const [resumeCheckResult, setResumeCheckResult] = useState<UploadCheckResult | null>(null);
  const [resumeCheckText, setResumeCheckText] = useState('');
  const resumeUploadInputRef = useRef<HTMLInputElement>(null);

  // Manual skill entry fallback form (shown if AI parse fails after 1 retry or toggled by user)
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualSkills, setManualSkills] = useState<ManualSkillRow[]>([
    { skill: 'React', importance: 'core', quote: 'Build modular web interfaces with React' },
    { skill: 'TypeScript', importance: 'core', quote: 'Strong TypeScript type safety required' },
    { skill: 'Node.js', importance: 'important', quote: 'Design REST APIs with Node.js' },
    { skill: 'Docker', importance: 'nice-to-have', quote: 'Containerized deployment experience' },
  ]);
  const [newManualSkill, setNewManualSkill] = useState('');
  const [newManualImportance, setNewManualImportance] = useState<
    'core' | 'important' | 'nice-to-have'
  >('core');
  const [newManualQuote, setNewManualQuote] = useState('');

  useEffect(() => {
    if (selectedJob) {
      setJobDescription(selectedJob);
    }
  }, [selectedJob]);

  const statusContext = useMemo<SkillStatusContext>(
    () => ({
      evidence,
      profile,
      attachments,
    }),
    [evidence, profile, attachments]
  );

  // Recompute live statuses when evidence changes while viewing a gapResult
  const activeGapResult = useMemo<JdGapAnalysisResult | null>(() => {
    if (!gapResult) return null;
    const extraction: JdExtractionOutput = {
      roleTitle: gapResult.roleTitle,
      company: gapResult.company,
      seniority: gapResult.seniority,
      mustHave: gapResult.allEvaluatedSkills
        .filter((s) => s.importance !== 'nice-to-have')
        .map((s) => ({
          skill: s.rawSkill || s.skill,
          importance: s.importance === 'core' ? 'core' : 'important',
          quote: s.quote,
        })),
      niceToHave: gapResult.allEvaluatedSkills
        .filter((s) => s.importance === 'nice-to-have')
        .map((s) => ({
          skill: s.rawSkill || s.skill,
          quote: s.quote,
        })),
      responsibilities: gapResult.responsibilities,
      softSkills: gapResult.softSkills,
      experienceRequired: gapResult.experienceRequired,
      redFlags: gapResult.redFlags,
    };

    const recomputed = computeJdGapAnalysis({
      extraction,
      context: statusContext,
      companyOverride: gapResult.company,
      roleOverride: gapResult.roleTitle,
    });

    return {
      ...recomputed,
      aiSummary: gapResult.aiSummary || recomputed.aiSummary,
      applicationStrategy: gapResult.applicationStrategy || recomputed.applicationStrategy,
      strategyLabel: gapResult.strategyLabel || recomputed.strategyLabel,
    };
  }, [gapResult, statusContext]);

  const selectFeaturedCompanyJob = (companyName: string) => {
    const job =
      FEATURED_COMPANY_JOBS.find(
        (j) => j.company.toLowerCase() === companyName.toLowerCase()
      ) || FEATURED_COMPANY_JOBS[0];

    setCompanyInput(job.company);
    setRoleTitleInput(job.title);
    setJobDescription(
      `${job.title} at ${job.company}\nLocation: ${job.location}\n\nRole Overview:\n${job.description}\n\nCore Technical Requirements:\n- Hands-on production experience with ${job.skills
        .slice(0, 3)
        .join(', ')} for scalable architecture.\n- Strong proficiency in ${job.skills
        .slice(3)
        .join(', ')} with automated test coverage and code reviews.\n- Ability to design, test, and ship reliable distributed features across cross-functional engineering squads.`
    );
    setError('');
  };

  const handleFetchJdUrl = async () => {
    const trimmed = jdUrlInput.trim();
    if (!trimmed) return;
    setFetchingUrl(true);
    setUrlWarning('');
    setError('');
    try {
      const res = await fetchApi<{
        ok?: boolean;
        text?: string;
        error?: string;
        via?: string;
      }>('/jd-fetch-url', {
        method: 'POST',
        body: JSON.stringify({ url: trimmed }),
      });
      if (res.text) {
        setJobDescription(res.text);
        if (res.via === 'tavily-extract') {
          onNotify?.('Fetched with Tavily Extract (bypassed site block).');
        } else {
          onNotify?.('Fetched job description text from URL.');
        }
      } else {
        setUrlWarning(
          res.error ||
            'Could not read that URL because of login or CORS restrictions. Please paste the job description text directly below.'
        );
      }
    } catch (err: any) {
      setUrlWarning(
        err?.message ||
          'Could not fetch URL automatically (site requires login or blocks automated requests). Please paste the job description text below.'
      );
    } finally {
      setFetchingUrl(false);
    }
  };

  const handleAnalyzeJd = async () => {
    const trimmedJd = jobDescription.trim();
    if (trimmedJd.length < 150) {
      setError(
        `Job description is too short (${trimmedJd.length} characters). Please paste at least 150 characters so requirements can be extracted accurately.`
      );
      return;
    }

    setAnalyzing(true);
    setError('');
    setSavedToApps(false);

    try {
      const res = await fetchApi<{
        ok: boolean;
        requiresManualEntry?: boolean;
        error?: string;
        gapAnalysis: JdGapAnalysisResult;
        savedAnalysis: AnalysisData;
      }>('/jd-analyze', {
        method: 'POST',
        body: JSON.stringify({
          jobDescription: trimmedJd,
          roleTitle: roleTitleInput.trim() || undefined,
          company: companyInput.trim() || undefined,
          modelId: selectedModelId,
        }),
      });

      if (res.requiresManualEntry) {
        setShowManualForm(true);
        setError(
          res.error ||
            'Automated skill extraction could not parse the job description. Use the manual skill entry form below.'
        );
        return;
      }

      if (res.gapAnalysis) {
        setGapResult(res.gapAnalysis);
      }
      if (res.savedAnalysis) {
        setLatestSavedAnalysis(res.savedAnalysis);
        onRefreshAttachments();
      }
      onNotify?.(
        `Analysed ${res.gapAnalysis?.company || 'Target Company'} — ${
          res.gapAnalysis?.roleTitle || 'Role'
        } (${res.gapAnalysis?.score ?? 0}% match)`
      );
    } catch (err: any) {
      setError(err?.message || 'Could not complete job gap analysis.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleRunManualGapAnalysis = () => {
    if (manualSkills.length === 0) {
      setError('Please add at least one skill in the manual entry list.');
      return;
    }
    setError('');
    const extraction: JdExtractionOutput = {
      roleTitle: roleTitleInput.trim() || 'Software Engineer',
      company: companyInput.trim() || 'Target Company',
      seniority: 'Mid-Level',
      mustHave: manualSkills
        .filter((m) => m.importance !== 'nice-to-have')
        .map((m) => ({
          skill: m.skill,
          importance: m.importance === 'core' ? 'core' : 'important',
          quote: m.quote || `Required skill: ${m.skill}`,
        })),
      niceToHave: manualSkills
        .filter((m) => m.importance === 'nice-to-have')
        .map((m) => ({
          skill: m.skill,
          quote: m.quote || `Preferred skill: ${m.skill}`,
        })),
      responsibilities: ['Deliver tested, production-ready features'],
      softSkills: ['Problem solving'],
      experienceRequired: 'Not specified',
      redFlags: [],
    };

    const computed = computeJdGapAnalysis({
      extraction,
      context: statusContext,
      companyOverride: extraction.company,
      roleOverride: extraction.roleTitle,
    });
    setGapResult(computed);
    onNotify?.(`Computed manual gap analysis (${computed.score}% match).`);
  };

  const handleAddSkillToSprint = (skillName: string) => {
    try {
      const key = `applywise_sprint_custom_skills_${profile?.user_id || 'default'}`;
      const existing: string[] = JSON.parse(localStorage.getItem(key) || '[]');
      const updated = Array.from(new Set([...existing, skillName]));
      localStorage.setItem(key, JSON.stringify(updated));
    } catch {
      // Ignore storage error
    }
    onNotify?.(`Added "${skillName}" to your 7-day proof sprint.`);
  };

  // Step 4b: "Why this score?" AI explanation handler
  const handleExplainWhyThisScore = async () => {
    const roleTitle = activeGapResult?.roleTitle || analysis?.jobTitle || profile?.title || 'Software Engineer';
    const company = activeGapResult?.company || analysis?.company || 'Target Company';
    const score = activeGapResult?.score ?? analysis?.readinessScore ?? 65;

    setLoadingWhyScore(true);
    try {
      const res = await callAiStructured<WhyThisScoreResult>('why_this_score', {
        targetRole: roleTitle,
        payload: {
          roleTitle,
          company,
          score,
        },
      });
      setWhyThisScoreResponse(res);
      onNotify?.(`Generated "Why this score?" AI breakdown for ${company} — ${roleTitle}.`);
    } catch {
      onNotify?.('Could not generate "Why this score?" explanation.');
    } finally {
      setLoadingWhyScore(false);
    }
  };

  // Action 1: "Generate résumé bullets for this job" -> opens Résumé Studio with this JD preselected
  const handleGenerateResumeBulletsForJob = () => {
    if (!activeGapResult) return;
    const synthesizedAnalysis: AnalysisData = latestSavedAnalysis || {
      id: Date.now(),
      jobTitle: activeGapResult.roleTitle,
      company: activeGapResult.company,
      readinessScore: activeGapResult.score,
      verifiedSkills: activeGapResult.youCanProve.map((s) => ({
        skill: s.skill,
        status: 'verified' as const,
        proof: s.evidenceItems[0]?.title || 'Verified proof',
      })),
      unprovenSkills: activeGapResult.needsProof.map((s) => ({
        skill: s.skill,
        reason: 'Self-reported without verified code or certificate.',
        howToStrengthenEvidence: `Attach proof for ${s.skill}`,
      })),
      missingSkills: activeGapResult.gaps.map((s) => ({
        skill: s.skill,
        importance: (s.importance === 'core' ? 'high' : s.importance === 'important' ? 'medium' : 'low') as 'high' | 'medium' | 'low',
        reason: s.quote,
        recommendedProof: `Provide proof for ${s.skill}`,
      })),
      sevenDayPlan: buildEnhancedSevenDayPlan(
        activeGapResult.roleTitle,
        activeGapResult.gaps.map((g) => g.skill),
        activeGapResult.needsProof.map((n) => n.skill)
      ),
      resumeImprovements: [],
      interviewQuestions: [],
      created_at: new Date().toISOString(),
    } as AnalysisData;
    onAnalysisDone(synthesizedAnalysis, 'resume');
    onNotify?.(
      `Opened Résumé Studio for ${activeGapResult.company} — ${activeGapResult.roleTitle}`
    );
  };

  // Action 2: "Create a sprint for the gaps" -> builds a 7-day plan from missing & declared core/important skills and opens Roadmap
  const handleCreateSprintForGaps = () => {
    if (!activeGapResult) return;
    const missingCoreOrImportant = activeGapResult.gaps
      .filter((g) => g.importance !== 'nice-to-have')
      .map((g) => g.skill);
    const declaredCoreOrImportant = activeGapResult.needsProof
      .filter((n) => n.importance !== 'nice-to-have')
      .map((n) => n.skill);

    const newPlan = buildEnhancedSevenDayPlan(
      activeGapResult.roleTitle,
      missingCoreOrImportant.length > 0
        ? missingCoreOrImportant
        : activeGapResult.gaps.map((g) => g.skill),
      declaredCoreOrImportant.length > 0
        ? declaredCoreOrImportant
        : activeGapResult.needsProof.map((n) => n.skill)
    );

    const updatedAnalysis: AnalysisData = {
      ...(latestSavedAnalysis || {
        id: Date.now(),
        verifiedSkills: [],
        unprovenSkills: [],
        missingSkills: [],
        resumeImprovements: [],
        interviewQuestions: [],
      }),
      jobTitle: activeGapResult.roleTitle,
      company: activeGapResult.company,
      readinessScore: activeGapResult.score,
      sevenDayPlan: newPlan,
    };

    onAnalysisDone(updatedAnalysis, 'roadmap');
    onNotify?.(
      `Created 7-day proof sprint for ${
        missingCoreOrImportant.length + declaredCoreOrImportant.length
      } priority skills.`
    );
  };

  // Action 3: "Save to Applications" -> creates a card in Applications tracker with score & date
  const handleSaveToApplications = async () => {
    if (!activeGapResult) return;
    setSavingToApps(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await fetchApi('/applications', {
        method: 'POST',
        body: JSON.stringify({
          company: activeGapResult.company,
          job_title: activeGapResult.roleTitle,
          job_description: jobDescription.trim(),
          status: 'Saved',
          application_date: today,
          notes: `JD Gap Analysis Score: ${activeGapResult.score}% (${activeGapResult.youCanProve.length} verified, ${activeGapResult.needsProof.length} need proof, ${activeGapResult.gaps.length} gaps) · ${today}`,
          analysis_id: latestSavedAnalysis?.id || null,
        }),
      });
      setSavedToApps(true);
      onRefreshAttachments();
      onNotify?.(
        `Saved "${activeGapResult.company} — ${activeGapResult.roleTitle}" (${activeGapResult.score}%) to Applications.`
      );
    } catch {
      onNotify?.('Could not save to Applications.');
    } finally {
      setSavingToApps(false);
    }
  };

  const formatSavedMatchLabel = (item: AnalysisData) => {
    const company = (item.company || 'Target Company').trim();
    const role = (item.jobTitle || 'Role').trim();
    const rawDate = item.created_at
      ? new Date(item.created_at).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : 'Recent';
    return `${company} — ${role} (${rawDate}) · ${item.readinessScore}%`;
  };

  const charCount = jobDescription.trim().length;

  return (
    <div className="space-y-6">
      {/* Input Card: Paste JD or URL + Optional Role Title & Company + Saved Matches Dropdown */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xs p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="font-heading text-lg font-semibold text-slate-900 dark:text-white">
              Analyse a job description against your verified proof
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Extract must-have and nice-to-have skills, quotes, and compute your weighted proof score.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Résumé upload button in Job Match (runs Upload Check) */}
            <input
              ref={resumeUploadInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.rtf,.jpg,.jpeg,.png,.webp"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setResumeCheckResult(null);
                setIsRunningResumeCheck(true);
                setIsResumeCheckOpen(true);
                try {
                  const res = await runUploadCheckOnFile(file, {
                    selectedCategory: 'resume',
                    userTitle: file.name.replace(/\.[^.]+$/, ''),
                  });
                  setResumeCheckResult(res.checkResult);
                  setResumeCheckText(res.extractedText || '');
                } catch (err: unknown) {
                  onNotify?.(err instanceof Error ? err.message : 'Résumé Upload Check failed.');
                  setIsResumeCheckOpen(false);
                } finally {
                  setIsRunningResumeCheck(false);
                }
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => resumeUploadInputRef.current?.click()}
              className="px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50/80 hover:bg-indigo-100 text-xs font-semibold text-indigo-800 inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <UploadCloud className="w-3.5 h-3.5 text-indigo-600" />
              <span>Upload résumé</span>
            </button>

            {/* Saved Matches Dropdown ("{Company} — {Role} ({Date})") */}
            {analysesList.length > 0 && (
              <select
                aria-label="Saved matches"
                value={latestSavedAnalysis?.id || ''}
                onChange={(e) => {
                  const found = analysesList.find(
                    (a) => String(a.id) === e.target.value
                  );
                  if (found) {
                    setLatestSavedAnalysis(found);
                    if (found.gapAnalysis) {
                      setGapResult(found.gapAnalysis);
                    }
                    onNotify?.(
                      `Loaded saved match: ${found.company || 'Company'} — ${
                        found.jobTitle || 'Role'
                      }`
                    );
                  }
                }}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[#2563EB]"
              >
                <option value="" disabled>
                  Saved matches ({analysesList.length})
                </option>
                {analysesList.map((item, idx) => (
                  <option key={item.id || idx} value={item.id}>
                    {formatSavedMatchLabel(item)}
                  </option>
                ))}
              </select>
            )}

            <span className="text-xs text-slate-400">Sample JD:</span>
            {['Google', 'Microsoft', 'Oracle', 'Zoho'].map((comp) => (
              <button
                key={comp}
                type="button"
                onClick={() => selectFeaturedCompanyJob(comp)}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-[#2563EB] text-xs font-semibold text-slate-700 dark:text-slate-200 transition cursor-pointer"
              >
                {comp}
              </button>
            ))}
          </div>
        </div>

        {/* Optional Role Title, Company, and Job URL Fetch Row */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Role title (optional)
            </label>
            <input
              type="text"
              value={roleTitleInput}
              onChange={(e) => setRoleTitleInput(e.target.value)}
              placeholder="e.g. Senior Frontend Engineer"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Company (optional)
            </label>
            <input
              type="text"
              value={companyInput}
              onChange={(e) => setCompanyInput(e.target.value)}
              placeholder="e.g. Google"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <div className="md:col-span-6">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Import from job posting URL (optional)
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Link2 className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="url"
                  value={jdUrlInput}
                  onChange={(e) => setJdUrlInput(e.target.value)}
                  placeholder="https://careers.example.com/job/123"
                  className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#2563EB]"
                />
              </div>
              <button
                type="button"
                disabled={fetchingUrl || !jdUrlInput.trim()}
                onClick={handleFetchJdUrl}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[#2563EB] text-xs font-semibold text-slate-700 dark:text-slate-200 transition cursor-pointer disabled:opacity-50 shrink-0"
              >
                {fetchingUrl ? 'Fetching…' : 'Fetch URL'}
              </button>
            </div>
          </div>
        </div>

        {urlWarning && (
          <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-center justify-between gap-3 text-xs text-amber-800 dark:text-amber-300">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{urlWarning}</span>
            </div>
            <button
              type="button"
              onClick={() => setUrlWarning('')}
              className="text-amber-700 dark:text-amber-300 hover:underline shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 flex items-center gap-2.5 text-red-700 dark:text-red-300 text-xs font-medium"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Job Description Textarea */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <label
              htmlFor="jd-textarea"
              className="font-semibold text-slate-700 dark:text-slate-200"
            >
              Job description text (minimum 150 characters)
            </label>
            <span
              className={`font-mono ${
                charCount > 0 && charCount < 150
                  ? 'text-amber-600 dark:text-amber-400 font-semibold'
                  : 'text-slate-400'
              }`}
            >
              {charCount} / 150 min chars
            </span>
          </div>
          <textarea
            id="jd-textarea"
            rows={6}
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste the full job description here (responsibilities, must-have skills, nice-to-have qualifications)…"
            className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/50 text-xs text-slate-900 dark:text-white leading-relaxed focus:outline-none focus:border-[#2563EB]"
          />
        </div>

        {/* Primary Action Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={() => setShowManualForm((prev) => !prev)}
            className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer"
          >
            {showManualForm ? 'Hide manual skill entry' : 'Or enter required skills manually'}
          </button>

          <button
            type="button"
            onClick={handleAnalyzeJd}
            disabled={analyzing}
            className="px-6 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition cursor-pointer disabled:opacity-60"
          >
            {analyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Extracting requirements & scoring proof…</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Analyse job fit</span>
              </>
            )}
          </button>
        </div>

        {/* Manual Skill Entry Form Fallback */}
        {showManualForm && (
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Manual JD Skill Entry
              </h3>
              <button
                type="button"
                onClick={handleRunManualGapAnalysis}
                className="px-3.5 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
              >
                Compute score from manual skills
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <input
                type="text"
                value={newManualSkill}
                onChange={(e) => setNewManualSkill(e.target.value)}
                placeholder="Skill name (e.g. Kubernetes)"
                className="sm:col-span-4 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
              />
              <select
                value={newManualImportance}
                onChange={(e) =>
                  setNewManualImportance(
                    e.target.value as 'core' | 'important' | 'nice-to-have'
                  )
                }
                className="sm:col-span-3 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
              >
                <option value="core">Core (weight 3)</option>
                <option value="important">Important (weight 2)</option>
                <option value="nice-to-have">Nice-to-have (weight 1)</option>
              </select>
              <input
                type="text"
                value={newManualQuote}
                onChange={(e) => setNewManualQuote(e.target.value)}
                placeholder="Quote from JD (optional)"
                className="sm:col-span-4 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
              />
              <button
                type="button"
                onClick={() => {
                  if (!newManualSkill.trim()) return;
                  setManualSkills((prev) => [
                    ...prev,
                    {
                      skill: newManualSkill.trim(),
                      importance: newManualImportance,
                      quote: newManualQuote.trim() || `Required: ${newManualSkill.trim()}`,
                    },
                  ]);
                  setNewManualSkill('');
                  setNewManualQuote('');
                }}
                className="sm:col-span-1 px-2.5 py-1.5 rounded-lg bg-[#2563EB] text-white text-xs font-semibold inline-flex items-center justify-center cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {manualSkills.map((m, i) => (
                <span
                  key={`${m.skill}-${i}`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200"
                >
                  <strong className="font-semibold">{m.skill}</strong>
                  <span className="text-[11px] text-slate-400">({m.importance})</span>
                  <button
                    type="button"
                    onClick={() =>
                      setManualSkills((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    className="text-slate-400 hover:text-red-500 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Results Screen (Part 3 Steps 3, 4, 5, 6) */}
      {activeGapResult && (
        <div className="space-y-6" data-testid="jd-gap-results">
          {/* Non-Tech JD Notice (< 2 known technical skills) */}
          {activeGapResult.nonTechNotice && (
            <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 flex items-center gap-3 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{activeGapResult.nonTechNotice}</span>
            </div>
          )}

          {/* Hero Score Card: Score Ring + Verdict + Confidence Label + AI Strategy + "How is this scored?" */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xs p-6 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
                <ReadinessGauge
                  score={activeGapResult.score}
                  size={96}
                  label="Job match"
                  sublabel={activeGapResult.seniority}
                />

                <div className="space-y-2.5 max-w-2xl">
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                    <span className="text-xs font-semibold text-slate-900 dark:text-white">
                      {activeGapResult.company} — {activeGapResult.roleTitle}
                    </span>

                    {/* Confidence Label (High if >= 5 JD skills, Low otherwise) */}
                    <span
                      title={activeGapResult.confidenceReason}
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold ${
                        activeGapResult.confidence === 'High'
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                          : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      <span>Confidence: {activeGapResult.confidence}</span>
                    </span>

                    {/* Suggested Application Strategy Badge */}
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-[#2563EB]/10 text-[#2563EB] dark:text-[#60A5FA] text-xs font-semibold">
                      <Compass className="w-3.5 h-3.5" />
                      <span>
                        Strategy:{' '}
                        {activeGapResult.aiExplanation?.strategyLabel ||
                          activeGapResult.strategyLabel ||
                          'Apply after proving top skills'}
                      </span>
                    </span>
                  </div>

                  {/* One-Sentence Verdict */}
                  <h3 className="font-heading text-lg font-bold text-slate-900 dark:text-white leading-snug">
                    {activeGapResult.verdictOneLiner || activeGapResult.verdict}
                  </h3>

                  {/* AI Plain-Language Summary */}
                  {activeGapResult.aiExplanation?.summary &&
                    activeGapResult.aiExplanation.summary !==
                      (activeGapResult.verdictOneLiner || activeGapResult.verdict) && (
                      <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        {activeGapResult.aiExplanation.summary}
                      </p>
                    )}

                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 pt-1">
                    <button
                      type="button"
                      disabled={loadingWhyScore}
                      onClick={handleExplainWhyThisScore}
                      data-testid="why-this-score-btn"
                      className="px-3 py-1.5 rounded-xl bg-[#2563EB]/10 hover:bg-[#2563EB]/20 text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] inline-flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
                    >
                      {loadingWhyScore ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      <span>Why this score? (AI breakdown)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsScoreDrawerOpen(true)}
                      className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>Formula details</span>
                    </button>

                    {activeGapResult.experienceRequired && (
                      <span className="text-xs text-slate-500">
                        Experience:{' '}
                        <strong className="text-slate-700 dark:text-slate-300">
                          {activeGapResult.experienceRequired}
                        </strong>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Step 6: Three Primary Actions from Results */}
              <div className="flex flex-col gap-2.5 shrink-0 min-w-[240px]">
                <button
                  type="button"
                  onClick={handleGenerateResumeBulletsForJob}
                  className="w-full px-4 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold inline-flex items-center justify-between gap-2 transition cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Generate résumé bullets for this job</span>
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={handleCreateSprintForGaps}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[#2563EB] text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center justify-between gap-2 transition cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-[#2563EB]" />
                    <span>Create a sprint for the gaps</span>
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  disabled={savingToApps || savedToApps}
                  onClick={handleSaveToApplications}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[#2563EB] text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center justify-between gap-2 transition cursor-pointer disabled:opacity-60"
                >
                  <span className="inline-flex items-center gap-2">
                    {savedToApps ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Bookmark className="w-3.5 h-3.5 text-amber-500" />
                    )}
                    <span>
                      {savedToApps
                        ? 'Saved to Applications'
                        : savingToApps
                        ? 'Saving…'
                        : 'Save to Applications'}
                    </span>
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">
                    {activeGapResult.score}%
                  </span>
                </button>
              </div>
            </div>

            {/* Step 4b: "Why this score?" AI Breakdown Card */}
            {whyThisScoreResponse && (
              <div
                data-testid="why-this-score-panel"
                className="mt-4 pt-5 border-t border-slate-200 dark:border-slate-800 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Grounded in your proof vault</span>
                    </span>
                    <span className="px-2.5 py-0.5 rounded-md bg-sky-500/10 text-sky-700 dark:text-sky-300 text-xs font-semibold">
                      Model tier: {whyThisScoreResponse.modelTierLabel} ({whyThisScoreResponse.modelId})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWhyThisScoreResponse(null)}
                    className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                  >
                    Hide AI breakdown
                  </button>
                </div>

                <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                  {whyThisScoreResponse.data.explanationSummary}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Top 3 Matching Skills */}
                  <div className="p-4 rounded-xl border border-emerald-500/25 bg-emerald-500/5 space-y-2.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      Top 3 Matching Skills
                    </h4>
                    {whyThisScoreResponse.data.topMatchingSkills.map((m) => (
                      <div
                        key={m.skill}
                        className="p-2.5 rounded-lg bg-white dark:bg-[#181B1E] border border-slate-200/80 dark:border-slate-800 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {m.skill}
                          </span>
                          <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                            {m.scoreContribution}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">{m.evidenceUsed}</p>
                      </div>
                    ))}
                  </div>

                  {/* Top 3 Missing / Unproven Skills + 1 Proof Task per Gap */}
                  <div className="p-4 rounded-xl border border-amber-500/25 bg-amber-500/5 space-y-2.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                      Top 3 Gaps & Actionable Proof Tasks
                    </h4>
                    {whyThisScoreResponse.data.topMissingSkills.map((g) => (
                      <div
                        key={g.skill}
                        className="p-2.5 rounded-lg bg-white dark:bg-[#181B1E] border border-slate-200/80 dark:border-slate-800 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {g.skill} ({g.gapType})
                          </span>
                          <span className="font-mono text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                            +{g.estimatedScoreGain}% potential
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300">
                          <strong>Proof task:</strong> {g.proofTask}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleAddSkillToSprint(g.skill)}
                          className="px-2.5 py-1 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add to my plan</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* "What to do first": Top 3 Highest-Impact Skills to Prove (Declared or Missing) */}
          {activeGapResult.whatToDoFirst.length > 0 && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xs p-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-heading text-base font-semibold text-slate-900 dark:text-white">
                    What to do first (Top {activeGapResult.whatToDoFirst.length} highest-impact skills)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Ranked by requirement weight and score gain if you attach valid proof.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {activeGapResult.whatToDoFirst.map((item, idx) => (
                  <div
                    key={item.skill}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 p-4 flex flex-col justify-between space-y-3"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-[#2563EB]">
                          #{idx + 1} · {item.importance.toUpperCase()} (w={item.weight})
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase ${
                            item.estimatedEffort === 'low'
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                              : item.estimatedEffort === 'medium'
                              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                              : 'bg-red-500/10 text-red-700 dark:text-red-400'
                          }`}
                        >
                          Effort: {item.estimatedEffort || 'medium'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <h4 className="font-heading text-sm font-bold text-slate-900 dark:text-white">
                          {item.skill}
                        </h4>
                        <span className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                          +{item.potentialPointGain} pts
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        {item.effortReason}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800">
                      {item.status === 'declared' ? (
                        <button
                          type="button"
                          onClick={() => onInspectSkill?.(item.skill)}
                          className="w-full py-1.5 px-3 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold cursor-pointer"
                        >
                          Add proof for {item.skill}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAddSkillToSprint(item.skill)}
                          className="w-full py-1.5 px-3 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-[#2563EB] text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer"
                        >
                          Add to my sprint
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Three Groups: "You can prove" (verified) | "Needs proof" (declared) | "Gaps" (missing) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Group 1: You can prove (verified, with evidence links) */}
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xs p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="font-heading text-base font-semibold text-slate-900 dark:text-white">
                    You can prove ({activeGapResult.youCanProve.length})
                  </h3>
                </div>
                <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                  1.0 pt × weight
                </span>
              </div>

              {activeGapResult.youCanProve.length === 0 ? (
                <p className="text-xs text-slate-500 py-4">
                  None of the extracted skills for this job have validated proof attached yet.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {activeGapResult.youCanProve.map((item) => (
                    <div key={item.skill} className="py-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                          {item.skill}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[11px] font-semibold">
                          {item.importance} · +{item.weightedPoints}
                        </span>
                      </div>

                      {/* Quote from JD */}
                      <p className="text-xs text-slate-500 dark:text-slate-400 italic flex items-start gap-1.5">
                        <Quote className="w-3 h-3 shrink-0 mt-0.5 text-slate-400" />
                        <span>&ldquo;{item.quote}&rdquo;</span>
                      </p>

                      {/* Evidence Links */}
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {item.evidenceItems.map((ev, i) => (
                          <button
                            key={`${ev.id}-${i}`}
                            type="button"
                            onClick={() => onInspectSkill?.(item.skill)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:border-[#2563EB] text-[11px] font-medium text-[#2563EB] dark:text-[#60A5FA] cursor-pointer"
                          >
                            <span className="truncate max-w-[180px]">{ev.title}</span>
                            <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Group 2: Needs proof (declared, with "Add proof" button) */}
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xs p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <h3 className="font-heading text-base font-semibold text-slate-900 dark:text-white">
                    Needs proof ({activeGapResult.needsProof.length})
                  </h3>
                </div>
                <span className="text-xs font-mono text-amber-600 dark:text-amber-400 font-semibold">
                  0.4 pt × weight
                </span>
              </div>

              {activeGapResult.needsProof.length === 0 ? (
                <p className="text-xs text-slate-500 py-4">
                  No unverified self-declared skills for this job.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {activeGapResult.needsProof.map((item) => (
                    <div key={item.skill} className="py-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="text-sm font-semibold text-slate-900 dark:text-white">
                            {item.skill}
                          </span>
                          <span className="ml-2 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                            ({item.importance})
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => onInspectSkill?.(item.skill)}
                          className="px-2.5 py-1 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold cursor-pointer shrink-0"
                        >
                          Add proof
                        </button>
                      </div>

                      {/* Quote from JD */}
                      <p className="text-xs text-slate-500 dark:text-slate-400 italic flex items-start gap-1.5">
                        <Quote className="w-3 h-3 shrink-0 mt-0.5 text-slate-400" />
                        <span>&ldquo;{item.quote}&rdquo;</span>
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Group 3: Gaps (missing, with "Add to my sprint" button) */}
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xs p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-500" />
                  <h3 className="font-heading text-base font-semibold text-slate-900 dark:text-white">
                    Gaps ({activeGapResult.gaps.length})
                  </h3>
                </div>
                <span className="text-xs font-mono text-red-600 dark:text-red-400 font-semibold">
                  0 pt × weight
                </span>
              </div>

              {activeGapResult.gaps.length === 0 ? (
                <p className="text-xs text-slate-500 py-4">
                  Zero missing skill gaps detected for this job description!
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {activeGapResult.gaps.map((item) => (
                    <div key={item.skill} className="py-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="text-sm font-semibold text-slate-900 dark:text-white">
                            {item.skill}
                          </span>
                          <span className="ml-2 text-[11px] text-red-600 dark:text-red-400 font-medium">
                            ({item.importance})
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleAddSkillToSprint(item.skill)}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-[#2563EB] text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer shrink-0"
                        >
                          Add to my sprint
                        </button>
                      </div>

                      {/* Quote from JD */}
                      <p className="text-xs text-slate-500 dark:text-slate-400 italic flex items-start gap-1.5">
                        <Quote className="w-3 h-3 shrink-0 mt-0.5 text-slate-400" />
                        <span>&ldquo;{item.quote}&rdquo;</span>
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Separate Collapsible Section for Nice-to-haves */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xs overflow-hidden">
            <button
              type="button"
              onClick={() => setNiceToHavesOpen((prev) => !prev)}
              aria-expanded={niceToHavesOpen}
              className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="font-heading text-sm font-semibold text-slate-900 dark:text-white">
                  Nice-to-have skills ({activeGapResult.niceToHaves.length})
                </span>
                <span className="text-xs text-slate-500">
                  Weight = 1 · Lower impact on readiness score
                </span>
              </div>
              {niceToHavesOpen ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {niceToHavesOpen && (
              <div className="px-6 pb-5 pt-2 border-t border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                {activeGapResult.niceToHaves.length === 0 ? (
                  <p className="text-xs text-slate-500 py-2">
                    No separate nice-to-have skills were listed in this job description.
                  </p>
                ) : (
                  activeGapResult.niceToHaves.map((item) => (
                    <div
                      key={item.skill}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900 dark:text-white">
                            {item.skill}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                              item.status === 'verified'
                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                : item.status === 'declared'
                                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                                : 'bg-red-500/10 text-red-700 dark:text-red-400'
                            }`}
                          >
                            {item.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 italic">
                          &ldquo;{item.quote}&rdquo;
                        </p>
                      </div>

                      {item.status !== 'verified' && (
                        <button
                          type="button"
                          onClick={() =>
                            item.status === 'declared'
                              ? onInspectSkill?.(item.skill)
                              : handleAddSkillToSprint(item.skill)
                          }
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer shrink-0"
                        >
                          {item.status === 'declared' ? 'Add proof' : 'Add to my sprint'}
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {/* "How is this scored?" Formula & Skill Contribution Drawer */}
      {isScoreDrawerOpen && activeGapResult && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="How this job match is scored"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex justify-end"
        >
          <div className="w-full max-w-lg bg-white dark:bg-[#181B1E] h-full shadow-2xl border-l border-slate-200 dark:border-slate-800 p-6 overflow-y-auto space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-heading text-lg font-bold text-slate-900 dark:text-white">
                  How is this scored?
                </h3>
                <p className="text-xs text-slate-500">
                  Deterministic weighted evidence formula (never guessed by AI)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsScoreDrawerOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800 space-y-2 text-xs">
              <div className="font-mono font-bold text-slate-900 dark:text-white">
                Score = round((sum(points × weight) / sum(weights)) × 100)
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 text-slate-600 dark:text-slate-300">
                <div>
                  <strong className="block text-slate-900 dark:text-white">
                    Status points:
                  </strong>
                  • Verified proof = 1.0 pt
                  <br />• Declared (no proof) = 0.4 pt
                  <br />• Missing = 0.0 pt
                </div>
                <div>
                  <strong className="block text-slate-900 dark:text-white">
                    Importance weights:
                  </strong>
                  • Core = 3<br />• Important = 2<br />• Nice-to-have = 1
                </div>
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 font-mono text-slate-800 dark:text-slate-200">
                Total: {activeGapResult.totalWeightedPoints} /{' '}
                {activeGapResult.totalPossibleWeight} weighted pts ={' '}
                <strong>{activeGapResult.score}%</strong>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Per-skill contribution ({activeGapResult.allEvaluatedSkills.length} skills)
              </h4>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {activeGapResult.allEvaluatedSkills.map((s) => (
                  <div
                    key={s.skill}
                    className="py-2.5 flex items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {s.skill}
                      </span>{' '}
                      <span className="text-slate-400">
                        ({s.importance}, weight {s.weight})
                      </span>
                      <div className="text-[11px] text-slate-500">
                        Status: <strong>{s.status}</strong> ({s.points} pt)
                      </div>
                    </div>
                    <div className="font-mono font-bold text-slate-900 dark:text-white">
                      {s.weightedPoints} / {s.weight}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <UploadCheckModal
        isOpen={isResumeCheckOpen}
        isRunningCheck={isRunningResumeCheck}
        checkResult={resumeCheckResult}
        extractedText={resumeCheckText}
        profile={profile}
        onClose={() => setIsResumeCheckOpen(false)}
        onReplaceFile={() => {
          setIsResumeCheckOpen(false);
          resumeUploadInputRef.current?.click();
        }}
        onConfirmed={({ checkResult, detectedSkills }) => {
          setIsResumeCheckOpen(false);
          onRefreshAttachments();
          onNotify?.(
            `Confirmed résumé "${checkResult.userTitle || checkResult.filename}" (${checkResult.trust} trust · ${detectedSkills.length} skills detected).`
          );
        }}
      />
    </div>
  );
};
