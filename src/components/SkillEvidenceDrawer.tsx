import React, { useEffect, useRef, useState } from 'react';
import { EvidenceItem, ProofTaskBrief, ProofAuditResult, UploadCheckResult } from '../types';
import { evaluateSkillProofSummary } from '../utils/skillMatcher';
import { fetchApi, runUploadCheckOnFile } from '../api';
import { GitHubRepoProofModal, GitHubEvidenceCard } from './GitHubRepoProofModal';
import { UploadCheckModal } from './UploadCheckModal';
import {
  X,
  ShieldCheck,
  ExternalLink,
  Sparkles,
  Loader2,
  CheckCircle2,
  Plus,
  Copy,
  Check,
  Clock,
  FolderGit2,
  FileSearch,
  AlertTriangle,
  Github,
  UploadCloud,
} from 'lucide-react';

interface SkillEvidenceDrawerProps {
  skill: string | null;
  targetRole: string;
  evidence: EvidenceItem[];
  selectedModelId: string;
  onClose: () => void;
  onRefreshEvidence: () => void;
  onNotify?: (msg: string) => void;
}

export const SkillEvidenceDrawer: React.FC<SkillEvidenceDrawerProps> = ({
  skill,
  targetRole,
  evidence,
  selectedModelId,
  onClose,
  onRefreshEvidence,
  onNotify,
}) => {
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const [activeAiTab, setActiveAiTab] = useState<'task' | 'auditor'>('task');
  const [proofTask, setProofTask] = useState<ProofTaskBrief | null>(null);
  const [generatingTask, setGeneratingTask] = useState(false);
  const [checkedSteps, setCheckedSteps] = useState<Record<number, boolean>>({});
  const [copiedBrief, setCopiedBrief] = useState(false);

  // AI Proof Auditor state
  const [auditTitle, setAuditTitle] = useState('');
  const [auditUrl, setAuditUrl] = useState('');
  const [auditText, setAuditText] = useState('');
  const [auditing, setAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<ProofAuditResult | null>(null);
  const [savingAudited, setSavingAudited] = useState(false);

  // Quick inline add proof state & GitHub Repo Modal + Upload Check Modal
  const [showGitHubModal, setShowGitHubModal] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProofType, setNewProofType] = useState('certificate');
  const [newProofTitle, setNewProofTitle] = useState('');
  const [newProofUrl, setNewProofUrl] = useState('');
  const [savingProof, setSavingProof] = useState(false);

  const [isUploadCheckOpen, setIsUploadCheckOpen] = useState(false);
  const [isRunningUploadCheck, setIsRunningUploadCheck] = useState(false);
  const [activeCheckResult, setActiveCheckResult] = useState<UploadCheckResult | null>(null);
  const [activeCheckText, setActiveCheckText] = useState('');
  const drawerFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setProofTask(null);
    setCheckedSteps({});
    setShowAddForm(false);
    setNewProofTitle('');
    setNewProofUrl('');
    setAuditResult(null);
    setAuditTitle(skill ? `${skill} Production Service & Test Suite` : '');
    setAuditUrl(
      skill
        ? `https://github.com/arjun-mehta/${skill.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-service`
        : ''
    );
    setAuditText('');
  }, [skill]);

  useEffect(() => {
    if (!skill) return;
    closeBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [skill, onClose]);

  if (!skill) return null;

  const summary = evaluateSkillProofSummary(skill, evidence);

  const meterColor =
    summary.overallTier === 'strong'
      ? '#16A34A'
      : summary.overallTier === 'moderate'
      ? '#2563EB'
      : summary.overallTier === 'weak'
      ? '#D97706'
      : '#94A3B8';

  const handleGenerateProofTask = async () => {
    setGeneratingTask(true);
    try {
      const res = await fetchApi('/proof-task', {
        method: 'POST',
        body: JSON.stringify({
          skill,
          targetRole,
          currentTier: summary.overallTier,
          modelId: selectedModelId,
        }),
      });
      setProofTask(res);
      setCheckedSteps({});
      onNotify?.(`Generated 2-hour ${skill} proof task`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate proof task.';
      onNotify?.(msg);
    } finally {
      setGeneratingTask(false);
    }
  };

  const handleRunProofAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auditText.trim()) return;
    setAuditing(true);
    try {
      const res = await fetchApi('/audit-proof', {
        method: 'POST',
        body: JSON.stringify({
          skill,
          targetRole,
          proofTitle: auditTitle.trim() || `${skill} Implementation`,
          proofUrl: auditUrl.trim(),
          proofText: auditText.trim(),
          modelId: selectedModelId,
        }),
      });
      setAuditResult(res);
      onNotify?.(`Audited ${skill} proof (${res.credibilityScore}/100 credibility)`);
    } catch {
      onNotify?.('Could not run AI proof audit.');
    } finally {
      setAuditing(false);
    }
  };

  const handleSaveAuditedAsEvidence = async () => {
    if (!auditResult) return;
    setSavingAudited(true);
    try {
      await fetchApi('/api/evidence', {
        method: 'POST',
        body: JSON.stringify({
          skill,
          type: auditUrl.includes('github') ? 'GitHub link' : 'project',
          title: auditTitle.trim() || `${skill} Audited Project`,
          url: auditUrl.trim() || `https://github.com/demo/${skill.toLowerCase()}-proof`,
          extracted_summary: auditResult.verdictSummary,
        }),
      });
      onRefreshEvidence();
      onNotify?.(`Saved verified proof for ${skill}`);
    } catch {
      onNotify?.('Could not save audited proof.');
    } finally {
      setSavingAudited(false);
    }
  };

  const handleCopyBrief = () => {
    if (!proofTask) return;
    const text = `${proofTask.title} (${proofTask.estimatedTime})\nGoal: ${proofTask.goal}\n\nSteps:\n${proofTask.steps
      .map((s, i) => `${i + 1}. ${s}`)
      .join('\n')}\n\nAcceptance Checklist:\n${proofTask.acceptanceChecklist
      .map((c) => `- [ ] ${c}`)
      .join('\n')}\n\nProof to Link: ${proofTask.recommendedProofToLink}`;
    navigator.clipboard?.writeText(text);
    setCopiedBrief(true);
    onNotify?.(`Copied ${skill} proof brief to clipboard`);
    setTimeout(() => setCopiedBrief(false), 2000);
  };

  const handleSaveQuickProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProofTitle.trim()) return;
    setSavingProof(true);
    try {
      await fetchApi('/api/evidence', {
        method: 'POST',
        body: JSON.stringify({
          skill,
          type: newProofType,
          title: newProofTitle.trim(),
          url: newProofUrl.trim(),
        }),
      });
      setNewProofTitle('');
      setNewProofUrl('');
      setShowAddForm(false);
      onRefreshEvidence();
      onNotify?.(`Added ${newProofType} proof for ${skill}`);
    } catch {
      onNotify?.('Could not save proof item.');
    } finally {
      setSavingProof(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-xs transition-opacity"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="skill-drawer-title"
        className="w-full max-w-lg h-full bg-white dark:bg-[#181B1E] border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col justify-between overflow-y-auto"
      >
        <div>
          {/* Sticky Top Bar */}
          <div className="sticky top-0 z-10 px-6 py-4 bg-white/95 dark:bg-[#181B1E]/95 backdrop-blur-xs border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Skill Evidence & AI Verification
              </p>
              <h2
                id="skill-drawer-title"
                className="font-heading text-xl font-bold tracking-tight text-slate-900 dark:text-white mt-0.5"
              >
                {skill}
              </h2>
            </div>

            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              aria-label="Close skill evidence drawer"
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Drawer Content */}
          <div className="p-6 space-y-6">
            {/* 1. Proof Strength Meter */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Proof Strength Meter
                </span>
                <span className="font-mono text-xs font-bold text-slate-900 dark:text-white tabular-nums">
                  {summary.meterPercent}% · {summary.tierLabel}
                </span>
              </div>

              {/* Meter Bar */}
              <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  style={{
                    width: `${summary.meterPercent}%`,
                    backgroundColor: meterColor,
                  }}
                  className="h-full rounded-full transition-all duration-300"
                />
              </div>

              {/* Tier Scale Legend */}
              <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
                <div
                  className={
                    summary.overallTier === 'weak'
                      ? 'font-bold text-amber-600 dark:text-amber-400'
                      : ''
                  }
                >
                  Weak · Self-reported
                </div>
                <div
                  className={`text-center ${
                    summary.overallTier === 'moderate'
                      ? 'font-bold text-[#2563EB]'
                      : ''
                  }`}
                >
                  Moderate · Certificate
                </div>
                <div
                  className={`text-right ${
                    summary.overallTier === 'strong'
                      ? 'font-bold text-emerald-600 dark:text-emerald-400'
                      : ''
                  }`}
                >
                  Strong · Repo / Live
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed pt-1 border-t border-slate-200/60 dark:border-slate-800">
                {summary.tierDescription}
              </p>
            </div>

            {/* 2. Verified Proofs from Evidence Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Attached Proofs ({summary.items.length})</span>
                </h3>
                <div className="flex items-center gap-2">
                  <input
                    ref={drawerFileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt,.rtf,.jpg,.jpeg,.png,.webp"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file || !skill) return;
                      setActiveCheckResult(null);
                      setIsRunningUploadCheck(true);
                      setIsUploadCheckOpen(true);
                      try {
                        const res = await runUploadCheckOnFile(file, {
                          selectedCategory: 'certificate',
                          userTitle: `${skill} — ${file.name.replace(/\.[^.]+$/, '')}`,
                          targetSkill: skill,
                        });
                        setActiveCheckResult(res.checkResult);
                        setActiveCheckText(res.extractedText || '');
                      } catch (err: unknown) {
                        onNotify?.(err instanceof Error ? err.message : 'Upload Check failed.');
                        setIsUploadCheckOpen(false);
                      } finally {
                        setIsRunningUploadCheck(false);
                      }
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => drawerFileInputRef.current?.click()}
                    className="text-xs font-semibold text-indigo-600 hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>Upload file</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowGitHubModal(true)}
                    className="text-xs font-semibold text-slate-700 hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Github className="w-3.5 h-3.5" />
                    <span>Link GitHub</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="text-xs font-semibold text-[#2563EB] hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{showAddForm ? 'Cancel' : 'Attach URL'}</span>
                  </button>
                </div>
              </div>

              {showAddForm && (
                <form
                  onSubmit={handleSaveQuickProof}
                  className="p-4 rounded-xl border border-[#2563EB]/40 bg-blue-500/5 space-y-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        Artifact Type
                      </label>
                      <select
                        value={newProofType}
                        onChange={(e) => setNewProofType(e.target.value)}
                        className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
                      >
                        <option value="GitHub link">GitHub Repository (Strong)</option>
                        <option value="project">Live Deployed App (Strong)</option>
                        <option value="certificate">Verified Certificate (Moderate)</option>
                        <option value="self-reported">Self-Reported Note (Weak)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        Title
                      </label>
                      <input
                        type="text"
                        required
                        value={newProofTitle}
                        onChange={(e) => setNewProofTitle(e.target.value)}
                        placeholder={`e.g. ${skill} Microservice Repo`}
                        className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Verification URL (GitHub / Live Demo / Credential)
                    </label>
                    <input
                      type="url"
                      value={newProofUrl}
                      onChange={(e) => setNewProofUrl(e.target.value)}
                      placeholder="https://github.com/username/repo"
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={savingProof}
                    className="w-full py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold transition cursor-pointer"
                  >
                    {savingProof ? 'Saving Proof…' : `Save ${skill} Proof`}
                  </button>
                </form>
              )}

              {summary.items.length === 0 ? (
                <div className="p-5 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-1.5">
                  <FolderGit2 className="w-5 h-5 text-slate-400 mx-auto" />
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    No proof linked for {skill} yet
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Use the AI Proof Task generator or AI Proof Auditor below to build and validate proof.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {summary.items.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 flex items-start justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {item.type} ·{' '}
                          <span
                            className={
                              item.strength === 'strong'
                                ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                                : item.strength === 'moderate'
                                ? 'text-[#2563EB] font-semibold'
                                : 'text-amber-600 font-medium'
                            }
                          >
                            {item.strength.toUpperCase()} PROOF
                          </span>
                          {item.attachment_name ? ` · ${item.attachment_name}` : ''}
                        </p>
                        {item.extracted_summary && (
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2 mt-1">
                            {item.extracted_summary}
                          </p>
                        )}
                      </div>

                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open proof link for ${item.title}`}
                          className="p-2 rounded-lg text-slate-500 hover:text-[#2563EB] hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Interactive AI Toolkit Tabs: 2-Hour Proof Task | AI Proof Auditor */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-4">
              <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-900 p-1 border border-slate-200/70 dark:border-slate-800 w-full">
                <button
                  type="button"
                  onClick={() => setActiveAiTab('task')}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    activeAiTab === 'task'
                      ? 'bg-white dark:bg-[#181B1E] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#2563EB]" />
                  <span>2-Hour AI Proof Task</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveAiTab('auditor')}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    activeAiTab === 'auditor'
                      ? 'bg-white dark:bg-[#181B1E] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  <FileSearch className="w-3.5 h-3.5 text-[#2563EB]" />
                  <span>AI Proof Auditor</span>
                </button>
              </div>

              {activeAiTab === 'task' ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        2-Hour Verifiable Proof Task
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Tailored mini-project brief to upgrade {skill} to Strong proof
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={generatingTask}
                      onClick={handleGenerateProofTask}
                      className="px-3.5 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-60 shrink-0"
                    >
                      {generatingTask ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Generating…</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Generate Proof Task</span>
                        </>
                      )}
                    </button>
                  </div>

                  {proofTask && (
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 space-y-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{proofTask.estimatedTime} Sprint Brief</span>
                            <span>·</span>
                            <span>{proofTask.targetRole}</span>
                          </p>
                          <h4 className="font-heading text-sm font-bold text-slate-900 dark:text-white mt-1">
                            {proofTask.title}
                          </h4>
                        </div>

                        <button
                          type="button"
                          onClick={handleCopyBrief}
                          aria-label="Copy proof task brief"
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1 transition cursor-pointer"
                        >
                          {copiedBrief ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>

                      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                        {proofTask.goal}
                      </p>

                      {/* Implementation Steps */}
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Execution Steps
                        </p>
                        <ol className="space-y-1.5 text-xs text-slate-700 dark:text-slate-200 list-decimal list-inside">
                          {proofTask.steps.map((step, i) => (
                            <li key={i} className="leading-relaxed">
                              {step}
                            </li>
                          ))}
                        </ol>
                      </div>

                      {/* Interactive Acceptance Checklist */}
                      <div className="space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Acceptance Checklist
                        </p>
                        <div className="space-y-1.5">
                          {proofTask.acceptanceChecklist.map((criterion, idx) => (
                            <label
                              key={idx}
                              className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-200 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(checkedSteps[idx])}
                                onChange={(e) =>
                                  setCheckedSteps((prev) => ({
                                    ...prev,
                                    [idx]: e.target.checked,
                                  }))
                                }
                                className="mt-0.5 rounded border-slate-300 text-[#2563EB] focus:ring-[#2563EB]"
                              />
                              <span
                                className={
                                  checkedSteps[idx] ? 'line-through text-slate-400' : ''
                                }
                              >
                                {criterion}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* What to link as proof */}
                      <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
                        <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          What to link as Strong Proof:
                        </span>
                        <p className="text-slate-600 dark:text-slate-300 mt-1">
                          {proofTask.recommendedProofToLink}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* AI Proof Auditor Tab */
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        AI Proof Credibility Auditor
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Paste your README or project notes to check if your {skill} evidence is interview-ready.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setAuditText(
                          `Built a modular ${skill} service for ${targetRole} with strict schema validation, automated unit & integration tests (Vitest + GitHub Actions), Docker containerization, and documented p95 latency benchmarks in README.md.`
                        )
                      }
                      className="text-xs font-semibold text-[#2563EB] hover:underline shrink-0 cursor-pointer"
                    >
                      Load sample README
                    </button>
                  </div>

                  <form onSubmit={handleRunProofAudit} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <input
                        type="text"
                        value={auditTitle}
                        onChange={(e) => setAuditTitle(e.target.value)}
                        placeholder={`Project title`}
                        className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                      />
                      <input
                        type="url"
                        value={auditUrl}
                        onChange={(e) => setAuditUrl(e.target.value)}
                        placeholder="https://github.com/username/repo"
                        className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                    <textarea
                      rows={3}
                      required
                      value={auditText}
                      onChange={(e) => setAuditText(e.target.value)}
                      placeholder={`Paste your ${skill} README summary, architecture notes, or test coverage details here…`}
                      className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                    />
                    <button
                      type="submit"
                      disabled={auditing || !auditText.trim()}
                      className="w-full py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      {auditing ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Auditing Proof Credibility…</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Audit {skill} Proof with AI</span>
                        </>
                      )}
                    </button>
                  </form>

                  {auditResult && (
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                          Credibility Verdict
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-md font-mono text-xs font-bold ${
                            auditResult.strengthTier === 'strong'
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                              : auditResult.strengthTier === 'moderate'
                              ? 'bg-blue-500/10 text-[#2563EB] dark:text-[#60A5FA]'
                              : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {auditResult.credibilityScore}/100 · {auditResult.strengthTier.toUpperCase()}
                        </span>
                      </div>

                      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                        {auditResult.verdictSummary}
                      </p>

                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                          Detected Engineering Signals:
                        </p>
                        {auditResult.detectedSignals.map((sig, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>{sig}</span>
                          </div>
                        ))}
                      </div>

                      {auditResult.missingElements.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                            To make this even stronger:
                          </p>
                          {auditResult.missingElements.map((m, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <span>{m}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <button
                        type="button"
                        disabled={savingAudited}
                        onClick={handleSaveAuditedAsEvidence}
                        className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>
                          {savingAudited ? 'Saving…' : `Save as Verified ${skill} Proof`}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <GitHubRepoProofModal
        isOpen={showGitHubModal}
        onClose={() => setShowGitHubModal(false)}
        targetSkill={skill}
        onEvidenceCreated={() => {
          onRefreshEvidence();
          onNotify?.(`Linked GitHub repository for ${skill}.`);
        }}
      />

      <UploadCheckModal
        isOpen={isUploadCheckOpen}
        isRunningCheck={isRunningUploadCheck}
        checkResult={activeCheckResult}
        extractedText={activeCheckText}
        targetSkill={skill}
        onClose={() => setIsUploadCheckOpen(false)}
        onReplaceFile={() => {
          setIsUploadCheckOpen(false);
          drawerFileInputRef.current?.click();
        }}
        onConfirmed={({ checkResult }) => {
          setIsUploadCheckOpen(false);
          onRefreshEvidence();
          onNotify?.(
            `Saved "${checkResult.userTitle || checkResult.filename}" (${checkResult.trust} trust) for ${skill}.`
          );
        }}
      />
    </div>
  );
};
