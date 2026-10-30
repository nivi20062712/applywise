import React, { useState, useMemo, useEffect } from 'react';
import {
  AnalysisData,
  Profile,
  AttachmentItem,
  EvidenceItem,
  ResumeStudioBullet,
  ResumeStudioOutput,
  AnswerEvaluationResult,
  HonestRewriteResult,
  CopilotStructuredResponse,
} from '../types';
import {
  getSkillStatus,
  buildResumeGenerationInput,
  validateResumeOutput,
  buildFallbackResumeStudioOutput,
  buildSingleBulletVariation,
  SkillStatusContext,
} from '../utils/evidenceModel';
import { ViewerMode } from './InferenceInspectorModal';
import { AICareerCoachCard } from './AICareerCoachCard';
import { fetchApi, callAiStructured } from '../api';
import {
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  Info,
  X,
  HelpCircle,
  Sparkles,
  Loader2,
  Sliders,
  MessageSquare,
  RefreshCw,
  ExternalLink,
  FolderCheck,
  Github,
  Award,
  FileText,
  Link2,
} from 'lucide-react';

interface ResumeViewProps {
  analysis: AnalysisData | null;
  profile?: Profile | null;
  evidence?: EvidenceItem[];
  attachments?: AttachmentItem[];
  viewerMode?: ViewerMode;
  selectedModelId?: string;
  onRefresh?: () => void;
  onNotify?: (msg: string) => void;
  onNavigate: (page: string) => void;
  onInspectSkill?: (skillName: string) => void;
}

export const ResumeView: React.FC<ResumeViewProps> = ({
  analysis,
  profile,
  evidence = [],
  attachments = [],
  viewerMode = 'jobseeker',
  selectedModelId,
  onNotify,
  onNavigate,
  onInspectSkill,
}) => {
  const [activeTab, setActiveTab] = useState<'studio' | 'interview'>('studio');
  const [showEthicalBanner, setShowEthicalBanner] = useState(true);
  const [copiedBullets, setCopiedBullets] = useState(false);
  const [copiedLetter, setCopiedLetter] = useState(false);

  // Interactive Metric Fill Bar state
  const [metricPercentInput, setMetricPercentInput] = useState('42%');
  const [metricCountInput, setMetricCountInput] = useState('18');

  // AI generation & per-bullet regeneration state
  const [generatingAll, setGeneratingAll] = useState(false);
  const [regeneratingBulletIdx, setRegeneratingBulletIdx] = useState<number | null>(null);
  const [openWhyTooltipIdx, setOpenWhyTooltipIdx] = useState<number | 'skillsLine' | null>(null);
  const [selectedEvidenceModal, setSelectedEvidenceModal] = useState<ResumeStudioBullet | null>(null);

  // Step 4a: "Honest Rewrite" per-bullet AI state
  const [rewritingBulletIdx, setRewritingBulletIdx] = useState<number | null>(null);
  const [honestRewrites, setHonestRewrites] = useState<
    Record<number, CopilotStructuredResponse<HonestRewriteResult>>
  >({});

  // Interactive AI Mock Interview Practice state
  const [activePracticeIdx, setActivePracticeIdx] = useState<number | null>(0);
  const [practiceAnswers, setPracticeAnswers] = useState<Record<number, string>>({});
  const [evaluatingIdx, setEvaluatingIdx] = useState<number | null>(null);
  const [answerEvaluations, setAnswerEvaluations] = useState<
    Record<number, AnswerEvaluationResult>
  >({});

  const roleName = analysis?.jobTitle || profile?.title || 'Software Engineer';
  const companyName = analysis?.company || 'the hiring organization';

  // Check if a 7-day sprint is currently in progress
  const sprintInProgress = useMemo(() => {
    try {
      const raw = localStorage.getItem(
        `applywise_sprint_done_${profile?.user_id || 'default'}`
      );
      const parsed: number[] = raw ? JSON.parse(raw) : [];
      return (
        (Array.isArray(parsed) && parsed.length > 0) ||
        Boolean(analysis?.sevenDayPlan && analysis.sevenDayPlan.length > 0)
      );
    } catch {
      return Boolean(analysis?.sevenDayPlan && analysis.sevenDayPlan.length > 0);
    }
  }, [profile?.user_id, analysis?.sevenDayPlan]);

  const [includeSprintInCoverLetter, setIncludeSprintInCoverLetter] = useState<boolean>(
    sprintInProgress
  );

  useEffect(() => {
    setIncludeSprintInCoverLetter(sprintInProgress);
  }, [sprintInProgress]);

  const statusContext = useMemo<SkillStatusContext>(
    () => ({
      evidence,
      profile,
      attachments,
    }),
    [evidence, profile, attachments]
  );

  // Missing skills for the target role (strictly computed via getSkillStatus === 'missing')
  const missingSkillNames = useMemo(() => {
    const candidates = [
      ...(analysis?.missingSkills || []).map((m) => m.skill),
      ...(analysis?.unprovenSkills || []).map((u) => u.skill),
    ];
    const unique = Array.from(new Set(candidates));
    return unique.filter((sk) => getSkillStatus(sk, statusContext) === 'missing');
  }, [analysis, statusContext]);

  // Build the generation input in code (Part 1 Step 1):
  // Pass only verified skills with their evidence details, declared skills as a separate list, and target role.
  // Never pass missing skills!
  const generationInput = useMemo(() => {
    const candidateUniverse = [
      ...(analysis?.verifiedSkills || []).map((v) => v.skill),
      ...(analysis?.unprovenSkills || []).map((u) => u.skill),
    ];
    return buildResumeGenerationInput({
      context: statusContext,
      targetRole: roleName,
      companyName,
      candidateName: profile?.name || 'Candidate',
      candidateSkillsUniverse: candidateUniverse,
      sprintInProgress: includeSprintInCoverLetter,
      sprintSkills: includeSprintInCoverLetter ? missingSkillNames.slice(0, 2) : [],
    });
  }, [
    statusContext,
    roleName,
    companyName,
    profile?.name,
    analysis,
    includeSprintInCoverLetter,
    missingSkillNames,
  ]);

  // Deterministic code-validated initial output
  const fallbackOutput = useMemo<ResumeStudioOutput>(() => {
    return buildFallbackResumeStudioOutput(generationInput);
  }, [generationInput]);

  const [bullets, setBullets] = useState<ResumeStudioBullet[]>(fallbackOutput.bullets);
  const [skillsLine, setSkillsLine] = useState<string>(fallbackOutput.skillsLine);
  const [coverLetterText, setCoverLetterText] = useState<string>(fallbackOutput.coverLetter);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    errors: string[];
  }>({ valid: true, errors: [] });

  useEffect(() => {
    setBullets(fallbackOutput.bullets);
    setSkillsLine(fallbackOutput.skillsLine);
    setCoverLetterText(fallbackOutput.coverLetter);
    setValidationResult(validateResumeOutput(fallbackOutput, generationInput));
  }, [fallbackOutput, generationInput]);

  // Live code validation whenever bullets, skillsLine, or coverLetterText changes
  const currentValidation = useMemo(() => {
    return validateResumeOutput(
      {
        bullets,
        skillsLine,
        coverLetter: coverLetterText,
      },
      generationInput
    );
  }, [bullets, skillsLine, coverLetterText, generationInput]);

  const handleGenerateWithAI = async () => {
    setGeneratingAll(true);
    try {
      const res = await fetchApi<ResumeStudioOutput>('/resume-studio/generate', {
        method: 'POST',
        body: JSON.stringify({
          targetRole: roleName,
          companyName,
          sprintInProgress: includeSprintInCoverLetter,
          sprintSkills: includeSprintInCoverLetter ? missingSkillNames.slice(0, 2) : [],
          modelId: selectedModelId,
        }),
      });

      if (res && Array.isArray(res.bullets)) {
        const check = validateResumeOutput(res, generationInput);
        if (check.valid) {
          setBullets(res.bullets);
          setSkillsLine(res.skillsLine || fallbackOutput.skillsLine);
          setCoverLetterText(res.coverLetter || fallbackOutput.coverLetter);
          setValidationResult(check);
          onNotify?.(
            res.usedFallback
              ? 'Generated verified résumé bullets & cover letter (validated).'
              : 'AI generated & validated résumé bullets and cover letter.'
          );
        } else {
          // Client-side safety net: fall back to deterministic template if validation fails
          setBullets(fallbackOutput.bullets);
          setSkillsLine(fallbackOutput.skillsLine);
          setCoverLetterText(fallbackOutput.coverLetter);
          setValidationResult({ valid: true, errors: [] });
          onNotify?.('Applied code-validated achievement bullets & cover letter.');
        }
      }
    } catch {
      setBullets(fallbackOutput.bullets);
      setSkillsLine(fallbackOutput.skillsLine);
      setCoverLetterText(fallbackOutput.coverLetter);
      onNotify?.('Generated verified résumé bullets & cover letter.');
    } finally {
      setGeneratingAll(false);
    }
  };

  const handleRegenerateSingleBullet = async (idx: number) => {
    const bullet = bullets[idx];
    if (!bullet) return;

    const verifiedEntry = generationInput.verifiedSkills.find(
      (v) =>
        String(v.evidenceId) === String(bullet.evidenceId) ||
        v.skillId.toLowerCase() === bullet.skillId.toLowerCase()
    );
    if (!verifiedEntry) return;

    setRegeneratingBulletIdx(idx);
    try {
      const nextText = buildSingleBulletVariation(
        verifiedEntry,
        bullet.text,
        bullets.filter((_, i) => i !== idx)
      );
      setBullets((prev) =>
        prev.map((item, i) => (i === idx ? { ...item, text: nextText } : item))
      );
      onNotify?.(`Regenerated ${bullet.skillId} bullet with a new action verb opening.`);
    } finally {
      setRegeneratingBulletIdx(null);
    }
  };

  const handleUpdateBulletText = (idx: number, newText: string) => {
    setBullets((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, text: newText } : item))
    );
  };

  const handleHonestRewriteBullet = async (idx: number) => {
    const bullet = bullets[idx];
    if (!bullet) return;
    setRewritingBulletIdx(idx);
    try {
      const res = await callAiStructured<HonestRewriteResult>('honest_rewrite', {
        viewerMode,
        targetRole: roleName,
        payload: {
          bulletText: bullet.text,
          skill: bullet.skillId,
        },
      });
      setHonestRewrites((prev) => ({ ...prev, [idx]: res }));
      onNotify?.(
        `Generated Honest Rewrite for ${bullet.skillId} (Claim risk: ${res.data.claimRisk}).`
      );
    } catch {
      onNotify?.('Could not run Honest Rewrite right now.');
    } finally {
      setRewritingBulletIdx(null);
    }
  };

  const handleApplyPlaceholders = () => {
    const pct = metricPercentInput.trim() || '40%';
    const cnt = metricCountInput.trim() || '15';
    setBullets((prev) =>
      prev.map((b) => ({
        ...b,
        text: b.text
          .replace(/\[X%\]/g, pct)
          .replace(/\[Y%\]/g, pct)
          .replace(/\[N\]/g, cnt)
          .replace(/\[M\]/g, cnt),
      }))
    );
    onNotify?.(`Applied ${pct} and ${cnt} across your verified achievement bullets.`);
  };

  const handleCopyAllBullets = () => {
    const lines = bullets.map((b) => `• ${b.text}`);
    if (skillsLine.trim()) {
      lines.push(`\nSkills: ${skillsLine.trim()}`);
    }
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedBullets(true);
    onNotify?.('Copied bullets and skills line to clipboard.');
    setTimeout(() => setCopiedBullets(false), 2000);
  };

  const handleCopyCoverLetter = () => {
    navigator.clipboard.writeText(coverLetterText);
    setCopiedLetter(true);
    onNotify?.('Copied cover letter to clipboard.');
    setTimeout(() => setCopiedLetter(false), 2000);
  };

  const handleEvaluatePracticeAnswer = async (
    idx: number,
    questionText: string,
    skillHint: string
  ) => {
    const draft = (practiceAnswers[idx] || '').trim();
    if (!draft) return;
    setEvaluatingIdx(idx);
    try {
      const res = await fetchApi('/evaluate-answer', {
        method: 'POST',
        body: JSON.stringify({
          question: questionText,
          targetSkill: skillHint,
          targetRole: roleName,
          userAnswer: draft,
          verifiedProofs: generationInput.verifiedSkills.map((v) => v.evidenceTitle),
        }),
      });
      setAnswerEvaluations((prev) => ({ ...prev, [idx]: res }));
      onNotify?.(`Evaluated interview answer (${res.scoreOutOf10}/10)`);
    } catch {
      onNotify?.('Could not evaluate interview answer.');
    } finally {
      setEvaluatingIdx(null);
    }
  };

  const formatEvidenceBadgeLabel = (b: ResumeStudioBullet): string => {
    const typeLabel =
      b.evidenceType === 'github'
        ? 'GitHub'
        : b.evidenceType === 'certificate'
        ? 'Certificate'
        : b.evidenceType === 'file'
        ? 'File'
        : 'Proof';
    const rawTitle = b.evidenceTitle || b.skillId;
    if (b.evidenceType === 'github' && b.evidenceUrl) {
      const match = /github\.com\/([^/]+\/[^/]+)/i.exec(b.evidenceUrl);
      if (match) {
        return `GitHub: ${match[1].replace(/\.git$/i, '')}`;
      }
    }
    return `${typeLabel}: ${rawTitle}`;
  };

  const renderEvidenceBadgeIcon = (type?: string) => {
    if (type === 'github') return <Github className="w-3 h-3 shrink-0" />;
    if (type === 'certificate') return <Award className="w-3 h-3 shrink-0" />;
    if (type === 'file') return <FileText className="w-3 h-3 shrink-0" />;
    return <Link2 className="w-3 h-3 shrink-0" />;
  };

  const hasPlaceholders = bullets.some((b) => /\[(X%|Y%|N|M)\]/.test(b.text));
  const verifiedSkillNames = generationInput.verifiedSkills.map((v) => v.skillId);
  const declaredSkillNames = generationInput.declaredSkills;

  return (
    <div className="space-y-6" data-viewer-mode={viewerMode}>
      {/* Small Dismissible Ethical Résumé Info Banner */}
      {showEthicalBanner && (
        <div
          role="region"
          aria-label="Ethical résumé notice"
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] px-4 py-3 flex items-center justify-between gap-4 text-xs text-slate-600 dark:text-slate-300"
        >
          <div className="flex items-center gap-2.5">
            <Info className="w-4 h-4 text-[#2563EB] shrink-0" />
            <span>
              <strong className="font-semibold text-slate-900 dark:text-white">
                Ethical résumé policy:
              </strong>{' '}
              Achievement bullets are generated only for verified skills with attached proof (
              {verifiedSkillNames.length}). Self-declared skills ({declaredSkillNames.length}) are placed in a neutral{' '}
              <span className="font-medium">&ldquo;Skills&rdquo;</span> line, and missing skills (
              {missingSkillNames.slice(0, 4).join(', ') || 'none'}) are never included.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowEthicalBanner(false)}
            aria-label="Dismiss ethical résumé notice"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Zero Verified Skills Banner (Part 1 Requirement 5) */}
      {generationInput.verifiedSkills.length === 0 && (
        <div
          role="alert"
          data-testid="zero-verified-banner"
          className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="font-heading text-sm font-semibold text-slate-900 dark:text-white">
                Add proof to unlock achievement bullets
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                You currently have 0 verified skills with attached proof. Link a GitHub repository, upload a certificate, or attach project files in the Proof Vault to generate achievement bullets.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('attachments')}
            className="px-4 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold inline-flex items-center gap-2 shrink-0 cursor-pointer transition"
          >
            <FolderCheck className="w-4 h-4" />
            <span>Go to Proof Vault</span>
          </button>
        </div>
      )}

      {/* Tabbed Panel: Bullets & Cover letter | Interview prep */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => setActiveTab('studio')}
            className={`pb-3 text-sm font-semibold border-b-2 transition cursor-pointer ${
              activeTab === 'studio'
                ? 'border-[#2563EB] text-[#2563EB] dark:text-[#60A5FA]'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Bullets & cover letter
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('interview')}
            className={`pb-3 text-sm font-semibold border-b-2 transition cursor-pointer ${
              activeTab === 'interview'
                ? 'border-[#2563EB] text-[#2563EB] dark:text-[#60A5FA]'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Interview prep & AI practice
          </button>
        </div>

        {activeTab === 'studio' && (
          <div className="pb-2 flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                currentValidation.valid
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
              }`}
              title={
                currentValidation.valid
                  ? 'All bullets link to valid proof, use distinct opening verbs, and exclude unverified claims.'
                  : currentValidation.errors.join(' ')
              }
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>
                {currentValidation.valid ? 'Code-validated wording' : 'Check wording rules'}
              </span>
            </span>

            <button
              type="button"
              disabled={generatingAll}
              onClick={handleGenerateWithAI}
              className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[#2563EB] text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            >
              {generatingAll ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2563EB]" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-[#2563EB]" />
              )}
              <span>Regenerate all with AI</span>
            </button>
          </div>
        )}
      </div>

      {activeTab === 'studio' ? (
        /* Two Columns: Editable Bullets + Separate Skills Line | Cover Letter */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Achievement Bullets (Verified Only) + Separate Declared Skills Line */}
          <section className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xs p-6 space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-heading text-lg font-semibold text-slate-900 dark:text-white">
                  Achievement bullets ({bullets.length})
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Each bullet names your verified proof and starts with a distinct action verb.
                </p>
              </div>

              <button
                type="button"
                onClick={handleCopyAllBullets}
                className="px-3.5 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer shrink-0"
              >
                {copiedBullets ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy bullets</span>
                  </>
                )}
              </button>
            </div>

            {/* Interactive Metric Placeholder Fill Bar */}
            {hasPlaceholders && (
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                  <Sliders className="w-3.5 h-3.5 text-[#2563EB]" />
                  <span>Quick-fill your real project metrics:</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                    <span>[X%]</span>
                    <input
                      type="text"
                      value={metricPercentInput}
                      onChange={(e) => setMetricPercentInput(e.target.value)}
                      aria-label="Metric percentage value"
                      className="w-16 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-semibold text-slate-900 dark:text-white"
                    />
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                    <span>[N]</span>
                    <input
                      type="text"
                      value={metricCountInput}
                      onChange={(e) => setMetricCountInput(e.target.value)}
                      aria-label="Metric count value"
                      className="w-14 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-semibold text-slate-900 dark:text-white"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleApplyPlaceholders}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
                  >
                    Fill [X%] & [N]
                  </button>
                </div>
              </div>
            )}

            {/* Achievement Bullets List */}
            {bullets.length === 0 ? (
              <div className="py-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  No verified skills yet
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  Achievement bullets are unlocked as soon as you attach a valid GitHub repository, certificate, or project file.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {bullets.map((item, idx) => {
                  const isRegenerating = regeneratingBulletIdx === idx;
                  const showWhy = openWhyTooltipIdx === idx;
                  const badgeLabel = formatEvidenceBadgeLabel(item);

                  return (
                    <div key={`${item.skillId}-${idx}`} className="py-4 space-y-2.5">
                      {/* Top Row: Verified Skill Pill + Clickable Evidence Badge + Why this wording? + Regenerate */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>Verified · {item.skillId}</span>
                          </span>

                          {/* Clickable Evidence Badge ("GitHub: portfolio-react") */}
                          <button
                            type="button"
                            onClick={() => setSelectedEvidenceModal(item)}
                            title="Click to inspect attached evidence"
                            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 hover:border-[#2563EB] text-xs font-medium text-slate-700 dark:text-slate-200 transition cursor-pointer"
                          >
                            {renderEvidenceBadgeIcon(item.evidenceType)}
                            <span className="truncate max-w-[230px]">{badgeLabel}</span>
                            <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                          </button>
                        </div>

                        <div className="flex items-center gap-3">
                          {/* "Why this wording?" Tooltip Trigger */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenWhyTooltipIdx(showWhy ? null : idx)
                              }
                              className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white inline-flex items-center gap-1 cursor-pointer"
                            >
                              <HelpCircle className="w-3.5 h-3.5" />
                              <span>Why this wording?</span>
                            </button>

                            {showWhy && (
                              <div
                                role="tooltip"
                                className="mt-1.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#14171A] shadow-lg text-xs text-slate-600 dark:text-slate-300 space-y-1.5 max-w-xs z-20"
                              >
                                <p className="font-semibold text-slate-900 dark:text-white">
                                  Backed by verified proof
                                </p>
                                <p>
                                  Because <strong>{item.skillId}</strong> has a validated proof artifact (
                                  <em>{item.evidenceTitle || badgeLabel}</em>), ApplyWise uses a strong action verb and names the specific artifact.
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Step 4a: Honest Rewrite AI Button */}
                          <button
                            type="button"
                            disabled={rewritingBulletIdx === idx}
                            onClick={() => handleHonestRewriteBullet(idx)}
                            data-testid={`honest-rewrite-btn-${idx}`}
                            className="px-2.5 py-1 rounded-lg bg-[#2563EB]/10 hover:bg-[#2563EB]/20 text-[#2563EB] dark:text-[#60A5FA] text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition disabled:opacity-50"
                          >
                            {rewritingBulletIdx === idx ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Sparkles className="w-3 h-3" />
                            )}
                            <span>Honest Rewrite</span>
                          </button>

                          {/* Per-Bullet Regenerate Button */}
                          <button
                            type="button"
                            disabled={isRegenerating}
                            onClick={() => handleRegenerateSingleBullet(idx)}
                            aria-label={`Regenerate bullet for ${item.skillId}`}
                            className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline inline-flex items-center gap-1 cursor-pointer"
                          >
                            <RefreshCw
                              className={`w-3 h-3 ${isRegenerating ? 'animate-spin' : ''}`}
                            />
                            <span>Regenerate</span>
                          </button>
                        </div>
                      </div>

                      {/* Editable Bullet Textarea */}
                      <textarea
                        rows={2}
                        value={item.text}
                        onChange={(e) => handleUpdateBulletText(idx, e.target.value)}
                        aria-label={`Bullet for ${item.skillId}`}
                        className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 text-sm text-slate-900 dark:text-white leading-[22px] focus:outline-none focus:border-[#2563EB]"
                      />

                      {/* Step 4a: Honest Rewrite Before/After & Claim Risk Comparison Card */}
                      {honestRewrites[idx] && (
                        <div
                          data-testid={`honest-rewrite-card-${idx}`}
                          className="p-4 rounded-xl border border-[#2563EB]/30 bg-[#2563EB]/5 space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[11px] font-semibold">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Grounded in your proof vault</span>
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-700 dark:text-sky-300 text-[11px] font-semibold">
                                Model tier: {honestRewrites[idx].modelTierLabel}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase ${
                                  honestRewrites[idx].data.claimRisk === 'low'
                                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                    : honestRewrites[idx].data.claimRisk === 'medium'
                                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                    : 'bg-red-500/15 text-red-700 dark:text-red-300'
                                }`}
                              >
                                Claim risk: {honestRewrites[idx].data.claimRisk}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  handleUpdateBulletText(
                                    idx,
                                    honestRewrites[idx].data.rewrittenBullet
                                  );
                                  onNotify?.('Applied Honest Rewrite to bullet.');
                                }}
                                className="px-2.5 py-1 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold cursor-pointer"
                              >
                                Use rewrite
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(
                                    honestRewrites[idx].data.rewrittenBullet
                                  );
                                  onNotify?.('Copied rewritten bullet.');
                                }}
                                className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Copy className="w-3 h-3" />
                                <span>Copy</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setHonestRewrites((prev) => {
                                    const next = { ...prev };
                                    delete next[idx];
                                    return next;
                                  })
                                }
                                className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                            <div className="p-2.5 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-1">
                              <div className="text-[10px] font-bold uppercase text-slate-400">
                                Before
                              </div>
                              <p className="text-slate-600 dark:text-slate-300">
                                {honestRewrites[idx].data.originalBullet}
                              </p>
                            </div>
                            <div className="p-2.5 rounded-lg bg-emerald-500/8 border border-emerald-500/25 space-y-1">
                              <div className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400">
                                After (Honest Rewrite)
                              </div>
                              <p className="text-slate-900 dark:text-white font-medium">
                                {honestRewrites[idx].data.rewrittenBullet}
                              </p>
                            </div>
                          </div>

                          <p className="text-[11px] text-slate-600 dark:text-slate-300">
                            {honestRewrites[idx].data.claimRiskReason}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Separate "Skills" Line for Declared Skills (Never in Achievement Bullets) */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Separate Skills Line (Declared skills without proof)
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[11px] font-semibold">
                    <span>{declaredSkillNames.length} declared</span>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setOpenWhyTooltipIdx(
                      openWhyTooltipIdx === 'skillsLine' ? null : 'skillsLine'
                    )
                  }
                  className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white inline-flex items-center gap-1 cursor-pointer"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Why this wording?</span>
                </button>
              </div>

              {openWhyTooltipIdx === 'skillsLine' && (
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#14171A] text-xs text-slate-600 dark:text-slate-300">
                  Self-declared skills ({declaredSkillNames.join(', ') || 'none'}) appear in your résumé or profile without attached proof. They are kept in a neutral{' '}
                  <strong>&ldquo;Familiar with…&rdquo;</strong> line and never placed in achievement bullets or described as &ldquo;verified&rdquo; or &ldquo;developed&rdquo;.
                </div>
              )}

              {declaredSkillNames.length > 0 ? (
                <input
                  type="text"
                  value={skillsLine}
                  onChange={(e) => setSkillsLine(e.target.value)}
                  aria-label="Declared skills line"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-[#2563EB]"
                />
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No unverified self-declared skills detected.
                </p>
              )}
            </div>
          </section>

          {/* Right Column: Cover Letter */}
          <section className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xs p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-heading text-lg font-semibold text-slate-900 dark:text-white">
                  Cover letter
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Claims only verified skills ({verifiedSkillNames.join(', ') || 'none yet'}).
                </p>
              </div>

              <button
                type="button"
                onClick={handleCopyCoverLetter}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[#2563EB] text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 transition cursor-pointer shrink-0"
              >
                {copiedLetter ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy letter</span>
                  </>
                )}
              </button>
            </div>

            {/* Sprint in progress toggle for "currently building" rule */}
            {missingSkillNames.length > 0 && (
              <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 text-xs cursor-pointer">
                <span className="text-slate-700 dark:text-slate-300">
                  7-day sprint in progress (mention{' '}
                  <strong className="font-semibold">
                    &ldquo;currently building {missingSkillNames.slice(0, 2).join(' and ')}&rdquo;
                  </strong>
                  )
                </span>
                <input
                  type="checkbox"
                  checked={includeSprintInCoverLetter}
                  onChange={(e) => setIncludeSprintInCoverLetter(e.target.checked)}
                  className="rounded border-slate-300 text-[#2563EB] focus:ring-[#2563EB]"
                />
              </label>
            )}

            <textarea
              rows={14}
              value={coverLetterText}
              onChange={(e) => setCoverLetterText(e.target.value)}
              aria-label="Cover letter editor"
              className="w-full p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 text-sm text-slate-900 dark:text-white leading-[22px] focus:outline-none focus:border-[#2563EB]"
            />

            {!currentValidation.valid && currentValidation.errors.length > 0 && (
              <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                <p className="font-semibold">Wording validator notice:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  {currentValidation.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      ) : (
        /* Interview Prep Tab: Interactive AI Mock Interview Practice + AI Career Coach */
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xs p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-[#2563EB]" />
                <h2 className="font-heading text-lg font-semibold text-slate-900 dark:text-white">
                  Interactive AI Mock Interview Practice
                </h2>
              </div>
              <span className="text-xs text-slate-500">
                Draft an answer and get instant AI STAR feedback
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {(
                analysis?.interviewQuestions || [
                  `Walk through the architecture and key trade-offs in your ${
                    verifiedSkillNames[0] || 'React'
                  } repository.`,
                  `How do you test edge cases and failure recovery in your ${
                    verifiedSkillNames[1] || 'TypeScript'
                  } implementation?`,
                  `How would you ramp up on ${
                    missingSkillNames[0] || 'Python'
                  } during your first 30 days?`,
                ]
              ).map((q, idx) => {
                const isOpen = activePracticeIdx === idx;
                const evalRes = answerEvaluations[idx];
                const skillHint =
                  verifiedSkillNames[idx] ||
                  missingSkillNames[0] ||
                  'System Design';

                return (
                  <div key={idx} className="py-4 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <span className="font-mono text-xs font-bold text-[#2563EB] mt-1 tabular-nums">
                          0{idx + 1}.
                        </span>
                        <p className="text-sm font-medium text-slate-900 dark:text-white leading-[22px]">
                          {q}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setActivePracticeIdx(isOpen ? null : idx)}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[#2563EB] text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-[#2563EB]" />
                        <span>{isOpen ? 'Hide practice' : 'Practice answer'}</span>
                      </button>
                    </div>

                    {isOpen && (
                      <div className="pl-7 space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">
                            Reference your verified projects (
                            {verifiedSkillNames.slice(0, 3).join(', ') || 'none yet'})
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setPracticeAnswers((prev) => ({
                                ...prev,
                                [idx]: `In my ${skillHint} project repository, I separated the API validation layer from state updates, added unit and E2E regression tests in CI, and used bounded retries with idempotency keys to keep p95 latency predictable under load.`,
                              }))
                            }
                            className="font-semibold text-[#2563EB] hover:underline cursor-pointer"
                          >
                            Load sample draft
                          </button>
                        </div>

                        <textarea
                          rows={3}
                          value={practiceAnswers[idx] || ''}
                          onChange={(e) =>
                            setPracticeAnswers((prev) => ({
                              ...prev,
                              [idx]: e.target.value,
                            }))
                          }
                          placeholder="Type your interview answer here…"
                          className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                        />

                        <button
                          type="button"
                          disabled={
                            evaluatingIdx === idx || !(practiceAnswers[idx] || '').trim()
                          }
                          onClick={() => handleEvaluatePracticeAnswer(idx, q, skillHint)}
                          className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          {evaluatingIdx === idx ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Evaluating…</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>AI Evaluate Answer</span>
                            </>
                          )}
                        </button>

                        {evalRes && (
                          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50 space-y-2.5 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-900 dark:text-white">
                                AI Interviewer Feedback
                              </span>
                              <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-mono font-bold">
                                Score: {evalRes.scoreOutOf10}/10
                              </span>
                            </div>
                            <p className="text-slate-700 dark:text-slate-300">
                              {evalRes.verdict}
                            </p>
                            <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 space-y-1">
                              <span className="font-semibold text-[#2563EB] dark:text-[#60A5FA] block">
                                Polished STAR Response:
                              </span>
                              <p className="text-slate-700 dark:text-slate-200 leading-relaxed">
                                {evalRes.improvedStarAnswer}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <AICareerCoachCard
            targetRole={roleName}
            selectedModelId={selectedModelId || 'nvidia/nemotron-3.5-lightning-30b-a3b'}
            onNotify={onNotify}
          />
        </div>
      )}

      {/* Evidence Detail Modal when Clicking a Bullet's Evidence Badge */}
      {selectedEvidenceModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Attached evidence details"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Verified proof · {selectedEvidenceModal.skillId}</span>
                </span>
                <h3 className="font-heading text-base font-bold text-slate-900 dark:text-white mt-2">
                  {selectedEvidenceModal.evidenceTitle ||
                    formatEvidenceBadgeLabel(selectedEvidenceModal)}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEvidenceModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Evidence type:</span>
                <span className="font-semibold text-slate-900 dark:text-white uppercase">
                  {selectedEvidenceModal.evidenceType || 'proof'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Evidence ID:</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">
                  {String(selectedEvidenceModal.evidenceId)}
                </span>
              </div>
              {selectedEvidenceModal.evidenceUrl && (
                <div className="pt-1 border-t border-slate-200/60 dark:border-slate-800">
                  <span className="text-slate-500 block mb-1">Source link:</span>
                  <a
                    href={selectedEvidenceModal.evidenceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#2563EB] dark:text-[#60A5FA] hover:underline break-all inline-flex items-center gap-1 font-medium"
                  >
                    <span>{selectedEvidenceModal.evidenceUrl}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              {onInspectSkill && (
                <button
                  type="button"
                  onClick={() => {
                    const sk = selectedEvidenceModal.skillId;
                    setSelectedEvidenceModal(null);
                    onInspectSkill(sk);
                  }}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[#2563EB] text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  Open skill proof drawer
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedEvidenceModal(null)}
                className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
