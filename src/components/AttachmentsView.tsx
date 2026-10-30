import React, { useState, useRef, useMemo } from 'react';
import {
  AttachmentItem,
  EvidenceItem,
  Profile,
  UploadCheckResult,
  UploadTrustTier,
  UploadCheckFlag,
  SelectedUploadCategory,
} from '../types';
import {
  fetchApi,
  runUploadCheckOnFile,
  runUploadCheckScenario,
} from '../api';
import { COMMON_SKILL_TERMS, identifySkills } from '../utils/skillMatcher';
import {
  buildUploadCheckTestScenarios,
  runUploadCheckPipeline,
  UploadCheckTestScenario,
} from '../utils/uploadCheck';
import { ViewerMode } from './InferenceInspectorModal';
import { GitHubRepoProofModal, GitHubEvidenceCard } from './GitHubRepoProofModal';
import { UploadCheckModal } from './UploadCheckModal';
import {
  UploadCloud,
  FileText,
  Image as ImageIcon,
  FileCheck2,
  Trash2,
  Eye,
  EyeOff,
  Link2,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plus,
  Github,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Sparkles,
  Wrench,
  Lock,
  FlaskConical,
  X,
} from 'lucide-react';

interface AttachmentsViewProps {
  profile: Profile | null;
  attachments: AttachmentItem[];
  evidence: EvidenceItem[];
  viewerMode?: ViewerMode;
  onRefresh: () => void;
  onNotify: (msg: string) => void;
  onNavigate: (page: string) => void;
}

export const AttachmentsView: React.FC<AttachmentsViewProps> = ({
  profile,
  attachments,
  evidence,
  viewerMode = 'jobseeker',
  onRefresh,
  onNotify,
  onNavigate,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'resume' | 'certificate' | 'evidence'>(
    'resume'
  );
  const [linkedSkillInput, setLinkedSkillInput] = useState('TypeScript');
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showGitHubModal, setShowGitHubModal] = useState(false);

  // One-time tip banner ("We check the content of your files, not just their names.")
  const [showContentCheckTip, setShowContentCheckTip] = useState<boolean>(() => {
    try {
      return localStorage.getItem('applywise_upload_check_tip_dismissed') !== '1';
    } catch {
      return true;
    }
  });

  // Upload Check Modal state
  const [isUploadCheckOpen, setIsUploadCheckOpen] = useState(false);
  const [isRunningUploadCheck, setIsRunningUploadCheck] = useState(false);
  const [activeCheckResult, setActiveCheckResult] = useState<UploadCheckResult | null>(null);
  const [activeCheckError, setActiveCheckError] = useState<string | null>(null);
  const [activeCheckText, setActiveCheckText] = useState<string>('');
  const [activeCheckTargetSkill, setActiveCheckTargetSkill] = useState<string | undefined>(
    undefined
  );
  const [fixingAttachment, setFixingAttachment] = useState<AttachmentItem | null>(null);

  // Proof Vault filter ("All files" vs "Needs attention")
  const [vaultFilter, setVaultFilter] = useState<'all' | 'needs_attention'>('all');

  // Toggle for interactive 9-scenario test verification suite
  const [showTestSuite, setShowTestSuite] = useState<boolean>(true);

  // Actions on individual file cards
  const [expandedTextId, setExpandedTextId] = useState<number | null>(null);
  const [linkingFileId, setLinkingFileId] = useState<number | null>(null);
  const [linkSkillTarget, setLinkSkillTarget] = useState('React');
  const [linkTitleTarget, setLinkTitleTarget] = useState('');
  const [savingLink, setSavingLink] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [confirmDeleteEvidenceId, setConfirmDeleteEvidenceId] = useState<
    string | number | null
  >(null);

  // Quick URL proof form (for GitHub/certificate URLs without local file)
  const [showUrlForm, setShowUrlForm] = useState(false);
  const [urlSkill, setUrlSkill] = useState('React');
  const [urlType, setUrlType] = useState<'GitHub link' | 'certificate'>('GitHub link');
  const [urlTitle, setUrlTitle] = useState('');
  const [urlValue, setUrlValue] = useState('');

  // Inline profile name input when user has no profile name set yet
  const [missingNameInput, setMissingNameInput] = useState('');
  const [savingProfileName, setSavingProfileName] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveMissingProfileName = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = missingNameInput.trim();
    if (!trimmed) return;
    setSavingProfileName(true);
    try {
      await fetchApi('/profile', {
        method: 'PUT',
        body: JSON.stringify({
          ...(profile || {}),
          name: trimmed,
        }),
      });
      setMissingNameInput('');
      onRefresh();
      onNotify(`Profile name set to "${trimmed}". You can now verify document ownership.`);
    } catch {
      onNotify('Could not save profile name.');
    } finally {
      setSavingProfileName(false);
    }
  };

  const dismissTip = () => {
    setShowContentCheckTip(false);
    try {
      localStorage.setItem('applywise_upload_check_tip_dismissed', '1');
    } catch {
      // Ignore storage error
    }
  };

  // Run Upload Check pipeline on every uploaded file BEFORE anything is saved
  const processUploadWithCheck = async (file: File) => {
    setUploading(true);
    setFixingAttachment(null);
    const targetSkillForCheck = selectedCategory !== 'resume' ? linkedSkillInput : undefined;
    setActiveCheckTargetSkill(targetSkillForCheck);
    setActiveCheckResult(null);
    setActiveCheckError(null);
    setIsRunningUploadCheck(true);
    setIsUploadCheckOpen(true);

    try {
      const response = await runUploadCheckOnFile(file, {
        selectedCategory,
        userTitle: file.name.replace(/\.[^.]+$/, ''),
        targetSkill: targetSkillForCheck,
      });
      setActiveCheckResult(response.checkResult);
      setActiveCheckText(response.extractedText || '');
    } catch (err: unknown) {
      // Keep the review open and show the reason, rather than closing the modal silently
      setActiveCheckError(err instanceof Error ? err.message : 'Upload Check failed.');
    } finally {
      setIsRunningUploadCheck(false);
      setUploading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await processUploadWithCheck(file);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processUploadWithCheck(file);
  };

  // Open "Fix issues" review modal for an existing attachment with warnings
  const handleOpenFixIssues = (att: AttachmentItem) => {
    setFixingAttachment(att);
    setActiveCheckTargetSkill(undefined);
    setIsRunningUploadCheck(false);

    const existingCheck =
      att.upload_check ||
      runUploadCheckPipeline({
        id: `chk-att-${att.id}`,
        filename: att.filename,
        mimeType: att.mime_type,
        fileSize: att.file_size,
        extractedText: att.extracted_text || '',
        ocrConfidence: (att as any).readability?.ocrConfidence ?? 94,
        selectedCategory: (att.selected_category || att.category || 'resume') as SelectedUploadCategory,
        userTitle: att.user_title || att.filename.replace(/\.[^.]+$/, ''),
        profile,
        existingAttachments: attachments.filter((a) => a.id !== att.id),
        existingEvidence: evidence,
      });

    setActiveCheckError(null);
    setActiveCheckResult(existingCheck);
    setActiveCheckText(att.extracted_text || '');
    setIsUploadCheckOpen(true);
  };

  // Open any of the 9 canonical test scenarios in the live Upload Check review panel
  const handleInspectScenario = async (scenario: UploadCheckTestScenario) => {
    setFixingAttachment(null);
    setActiveCheckTargetSkill(scenario.targetSkill);
    setActiveCheckResult(null);
    setActiveCheckError(null);
    setIsRunningUploadCheck(true);
    setIsUploadCheckOpen(true);

    try {
      const response = await runUploadCheckScenario(scenario.id);
      setActiveCheckResult(response.checkResult);
      setActiveCheckText(response.extractedText || '');
    } catch {
      // Fallback to local deterministic pipeline if offline
      const simulatedAttachments = scenario.simulateDuplicateOfExisting
        ? [
            {
              id: attachments[0]?.id || 1,
              filename: scenario.filename.replace('_copy', ''),
              mime_type: 'application/pdf',
              category: 'resume' as const,
              extracted_text: scenario.extractedText,
              file_size: scenario.extractedText.length,
              created_at: new Date().toISOString(),
            },
          ]
        : attachments;

      const localCheck = runUploadCheckPipeline({
        filename: scenario.filename,
        mimeType: scenario.filename.endsWith('.jpg') ? 'image/jpeg' : 'application/pdf',
        fileSize: scenario.extractedText.length,
        extractedText: scenario.extractedText,
        ocrConfidence: scenario.ocrConfidence ?? 95,
        selectedCategory: scenario.selectedCategory,
        targetSkill: scenario.targetSkill,
        profile,
        existingAttachments: simulatedAttachments,
        existingEvidence: evidence,
      });
      setActiveCheckResult(localCheck);
      setActiveCheckText(localCheck.privacyRedacted ? '' : scenario.extractedText);
    } finally {
      setIsRunningUploadCheck(false);
    }
  };

  // Precompute deterministic results for all 9 test scenarios dynamically using the logged-in user's profile
  const computedTestScenarios = useMemo(() => {
    const referenceDate = new Date('2026-10-26T10:00:00Z');
    const scenarios = buildUploadCheckTestScenarios(profile);

    return scenarios.map((sc) => {
      const dupList: AttachmentItem[] = sc.simulateDuplicateOfExisting
        ? [
            {
              id: 1,
              filename: sc.filename.replace('_copy', ''),
              mime_type: 'application/pdf',
              category: 'resume',
              extracted_text: sc.extractedText,
              file_size: sc.extractedText.length,
              created_at: '2026-10-01T10:00:00Z',
            },
          ]
        : [];

      const result = runUploadCheckPipeline({
        filename: sc.filename,
        extractedText: sc.extractedText,
        ocrConfidence: sc.ocrConfidence ?? 95,
        selectedCategory: sc.selectedCategory,
        targetSkill: sc.targetSkill,
        profile,
        existingAttachments: dupList,
        existingEvidence: evidence,
        referenceNow: referenceDate,
      });

      return {
        scenario: sc,
        result,
      };
    });
  }, [profile, evidence]);

  const handleLinkFileToSkill = async (att: AttachmentItem) => {
    if (!linkSkillTarget) return;
    setSavingLink(true);
    try {
      const attTrust = att.trust || 'high';
      await fetchApi('/evidence', {
        method: 'POST',
        body: JSON.stringify({
          skill: linkSkillTarget,
          type: att.category === 'certificate' ? 'certificate' : 'file',
          title:
            linkTitleTarget.trim() ||
            att.user_title ||
            `${linkSkillTarget} — ${att.filename.replace(/\.[^.]+$/, '')}`,
          url: '',
          attachment_name: att.filename,
          extracted_summary: (att.extracted_text || '').slice(0, 320),
          details: {
            trust: attTrust,
            unconfirmedEvidence: attTrust === 'low',
            sha256: att.hash,
          },
        }),
      });
      setLinkingFileId(null);
      setLinkTitleTarget('');
      onRefresh();
      onNotify(`Linked "${att.filename}" to ${linkSkillTarget}.`);
    } catch {
      onNotify('Could not link file to skill.');
    } finally {
      setSavingLink(false);
    }
  };

  const handleDeleteAttachment = async (id: number, filename: string) => {
    try {
      await fetchApi(`/attachments/${id}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      onRefresh();
      onNotify(`Deleted "${filename}".`);
    } catch {
      onNotify('Could not delete file.');
    }
  };

  const handleDeleteEvidence = async (id: string | number, title: string) => {
    try {
      await fetchApi(`/evidence/${id}`, { method: 'DELETE' });
      setConfirmDeleteEvidenceId(null);
      onRefresh();
      onNotify(`Removed "${title}".`);
    } catch {
      onNotify('Could not remove proof.');
    }
  };

  const handleAddUrlProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlTitle.trim() || !urlValue.trim()) return;
    try {
      await fetchApi('/evidence', {
        method: 'POST',
        body: JSON.stringify({
          skill: urlSkill,
          type: urlType,
          title: urlTitle.trim(),
          url: urlValue.trim(),
        }),
      });
      setUrlTitle('');
      setUrlValue('');
      setShowUrlForm(false);
      onRefresh();
      onNotify(`Added ${urlType} for ${urlSkill}.`);
    } catch {
      onNotify('Could not save URL proof.');
    }
  };

  // Determine which attachments need attention (unresolved warning/blocking flags or medium/low/rejected trust)
  const attachmentHasIssues = (att: AttachmentItem): boolean => {
    const unresolvedFlags = (att.flags || []).filter(
      (f) => !f.resolved && (f.severity === 'warning' || f.severity === 'blocking')
    );
    if (unresolvedFlags.length > 0) return true;
    if (att.trust === 'low' || att.trust === 'rejected') return true;
    if (att.name_match === 'mismatch' || att.name_match === 'unknown') return true;
    return false;
  };

  const needsAttentionCount = useMemo(
    () => attachments.filter(attachmentHasIssues).length,
    [attachments]
  );

  const filteredAttachments = useMemo(() => {
    if (vaultFilter === 'needs_attention') {
      return attachments.filter(attachmentHasIssues);
    }
    return attachments;
  }, [attachments, vaultFilter]);

  // Map each skill -> linked files & repository proofs
  const skillToProofsMap = useMemo(() => {
    const map = new Map<
      string,
      Array<{ id: string; label: string; kind: string; url?: string }>
    >();

    for (const ev of evidence) {
      if (
        !ev.skill ||
        ev.type === 'self-declared' ||
        /mentioned in r[eé]sum[eé]/i.test(ev.title || '')
      ) {
        continue;
      }
      const list = map.get(ev.skill) || [];
      list.push({
        id: `ev-${ev.id}`,
        label: ev.attachment_name ? `${ev.title} (${ev.attachment_name})` : ev.title,
        kind: ev.type,
        url: ev.url,
      });
      map.set(ev.skill, list);
    }

    for (const att of attachments) {
      const detected = att.detectedSkills || identifySkills(att.extracted_text || '');
      for (const sk of detected) {
        const list = map.get(sk) || [];
        if (!list.some((item) => item.label.includes(att.filename))) {
          list.push({
            id: `att-${att.id}-${sk}`,
            label: att.filename,
            kind: att.category,
          });
          map.set(sk, list);
        }
      }
    }

    return Array.from(map.entries());
  }, [evidence, attachments]);

  const renderCardTrustBadge = (trust?: UploadTrustTier) => {
    const tier = trust || 'high';
    if (tier === 'high') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
          <ShieldCheck className="w-3 h-3 text-emerald-600" />
          High trust
        </span>
      );
    }
    if (tier === 'medium') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
          <FileCheck2 className="w-3 h-3 text-blue-600" />
          Medium trust
        </span>
      );
    }
    if (tier === 'low') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
          <AlertTriangle className="w-3 h-3 text-amber-600" />
          Low trust · Unconfirmed
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-rose-50 text-rose-800 border border-rose-200">
        <ShieldAlert className="w-3 h-3 text-rose-600" />
        Rejected
      </span>
    );
  };

  return (
    <div className="space-y-6" data-viewer-mode={viewerMode}>
      {/* One-time Tip Banner (Section 4) */}
      {showContentCheckTip && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs text-indigo-950">
            <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>
              <strong>Content-First Upload Check:</strong> We check the content of your files, not just their names. Every upload is inspected for readability, document type, recipient identity, and skill relevance before it counts as proof.
            </span>
          </div>
          <button
            type="button"
            onClick={dismissTip}
            aria-label="Dismiss tip"
            className="p-1 rounded-lg text-indigo-500 hover:text-indigo-800 hover:bg-indigo-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Single Drag-and-Drop Upload Zone with Category Selector (Résumé / Certificate / Evidence) */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xs p-6 space-y-5">
        {/* Requirement 7: If the user has no profile name, prompt them to set it before upload */}
        {!profile?.name?.trim() && (
          <form
            onSubmit={handleSaveMissingProfileName}
            className="rounded-xl border border-amber-300 bg-amber-50/90 dark:bg-amber-950/30 dark:border-amber-700 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="flex items-start gap-2.5 text-xs text-amber-950 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Set your profile full name before uploading</p>
                <p className="text-amber-800 dark:text-amber-300 mt-0.5">
                  Upload Check compares the candidate or recipient name on every document against your profile name.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input
                type="text"
                required
                value={missingNameInput}
                onChange={(e) => setMissingNameInput(e.target.value)}
                placeholder="Your full name (e.g. Nivindharan A)"
                className="px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                disabled={savingProfileName || !missingNameInput.trim()}
                className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-semibold transition cursor-pointer"
              >
                {savingProfileName ? 'Saving…' : 'Set profile name'}
              </button>
            </div>
          </form>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-heading text-lg font-semibold text-slate-900 dark:text-white">
              Upload proof document (with Upload Check)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Choose a category and drop your PDF, DOCX, image, or text file below. Nothing is saved until you confirm the Upload Review.
            </p>
          </div>

          {/* Category Selector: Résumé / Certificate / Evidence */}
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Document category"
              className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            >
              {(
                [
                  { id: 'resume', label: 'Résumé' },
                  { id: 'certificate', label: 'Certificate' },
                  { id: 'evidence', label: 'Evidence' },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    selectedCategory === cat.id
                      ? 'bg-white dark:bg-[#181B1E] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {selectedCategory !== 'resume' && (
              <select
                aria-label="Target skill for upload"
                value={linkedSkillInput}
                onChange={(e) => setLinkedSkillInput(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#14171A] text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-[#2563EB]"
              >
                {COMMON_SKILL_TERMS.map((sk) => (
                  <option key={sk} value={sk}>
                    Skill: {sk}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* One Drag-and-Drop Zone */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,.rtf,.jpg,.jpeg,.png,.webp"
          onChange={handleFileChange}
          className="hidden"
        />

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          aria-label="Drop a file here or click to upload"
          className={`w-full rounded-2xl border-2 border-dashed p-8 text-center transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
            isDragging
              ? 'border-[#2563EB] bg-[#2563EB]/5'
              : 'border-slate-300 dark:border-slate-700 hover:border-[#2563EB] bg-slate-50/50 dark:bg-slate-900/20'
          }`}
        >
          <div className="flex flex-col items-center justify-center gap-2.5">
            {uploading ? (
              <>
                <Loader2 className="w-8 h-8 text-[#2563EB] animate-spin" />
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Reading… Checking name… Matching skills…
                </p>
              </>
            ) : (
              <>
                <div className="w-11 h-11 rounded-2xl bg-[#2563EB]/10 text-[#2563EB] flex items-center justify-center">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Drag and drop your {selectedCategory} file here, or{' '}
                  <span className="text-[#2563EB] underline">browse</span>
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Runs SHA-256 fingerprint + Checks A–I (Readability, Content Type, Identity, Skill Relevance, Certificate Sanity)
                </p>
              </>
            )}
          </div>
        </div>

        {/* Privacy Notice (Section 5) + External Repo / URL links */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>
              <strong>Privacy:</strong> Extracted text is used to verify document type, name, and skills. Personal IDs and marksheets are blocked and their text is never stored.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowGitHubModal(true)}
              className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer shadow-xs"
            >
              <Github className="w-3.5 h-3.5" />
              <span>Link GitHub repo</span>
            </button>
            <button
              type="button"
              onClick={() => setShowUrlForm((prev) => !prev)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{showUrlForm ? 'Hide URL form' : 'Link certificate / live URL'}</span>
            </button>
          </div>
        </div>

        {showUrlForm && (
          <form
            onSubmit={handleAddUrlProof}
            className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-4 gap-3"
          >
            <select
              value={urlSkill}
              onChange={(e) => setUrlSkill(e.target.value)}
              aria-label="Skill"
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#14171A] text-xs font-medium text-slate-900 dark:text-white"
            >
              {COMMON_SKILL_TERMS.map((sk) => (
                <option key={sk} value={sk}>
                  {sk}
                </option>
              ))}
            </select>
            <input
              type="text"
              required
              value={urlTitle}
              onChange={(e) => setUrlTitle(e.target.value)}
              placeholder="Proof title (e.g. AWS Certified Developer)"
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#14171A] text-xs text-slate-900 dark:text-white"
            />
            <input
              type="url"
              required
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              placeholder="https://..."
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#14171A] text-xs text-slate-900 dark:text-white"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold transition cursor-pointer"
            >
              Save link
            </button>
          </form>
        )}
      </section>

      {/* Upload Check Modal */}
      <UploadCheckModal
        isOpen={isUploadCheckOpen}
        isRunningCheck={isRunningUploadCheck}
        checkResult={activeCheckResult}
        checkError={activeCheckError}
        extractedText={activeCheckText}
        profile={profile}
        targetSkill={activeCheckTargetSkill}
        existingAttachmentForFix={fixingAttachment}
        onClose={() => {
          setIsUploadCheckOpen(false);
          setFixingAttachment(null);
        }}
        onReplaceFile={() => {
          setIsUploadCheckOpen(false);
          setFixingAttachment(null);
          fileInputRef.current?.click();
        }}
        onNavigateToJobMatch={() => {
          setIsUploadCheckOpen(false);
          onNavigate('match');
        }}
        onConfirmed={({ checkResult, createdEvidence }) => {
          setIsUploadCheckOpen(false);
          setFixingAttachment(null);
          onRefresh();
          onNotify(
            `Saved "${checkResult.userTitle || checkResult.filename}" (${checkResult.trust} trust)${
              createdEvidence.length > 0
                ? ` · attached to ${createdEvidence.map((e) => e.skill).join(', ')}`
                : ''
            }.`
          );
        }}
      />

      <GitHubRepoProofModal
        isOpen={showGitHubModal}
        onClose={() => setShowGitHubModal(false)}
        defaultGithubUsername={profile?.github_username || 'arjun-mehta'}
        onEvidenceCreated={() => {
          onRefresh();
          onNotify('GitHub repository verified and attached to selected skills.');
        }}
      />

      {/* File List as Cards with "Needs attention" filter at top, trust badge per file, and "Fix issues" button */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="font-heading text-lg font-semibold text-slate-900 dark:text-white">
              Uploaded files & linked proofs ({attachments.length + evidence.length})
            </h3>
          </div>

          {/* Filter Tabs: All Files vs Needs Attention */}
          <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 self-start">
            <button
              type="button"
              onClick={() => setVaultFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                vaultFilter === 'all'
                  ? 'bg-white dark:bg-[#181B1E] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              All files ({attachments.length})
            </button>
            <button
              type="button"
              onClick={() => setVaultFilter('needs_attention')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer inline-flex items-center gap-1.5 ${
                vaultFilter === 'needs_attention'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-amber-800 dark:text-amber-300 hover:bg-amber-50/60'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Needs attention ({needsAttentionCount})</span>
            </button>
          </div>
        </div>

        {filteredAttachments.length === 0 && evidence.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No files or proofs found for this filter. Drop a file above to run Upload Check.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Uploaded File Cards */}
            {filteredAttachments.map((att) => {
              const detectedSkills =
                att.detectedSkills && att.detectedSkills.length > 0
                  ? att.detectedSkills
                  : identifySkills(att.extracted_text || '');
              const linkedEvidenceForFile = evidence.filter(
                (ev) => ev.attachment_name === att.filename
              );
              const supportedSkills = Array.from(
                new Set([
                  ...linkedEvidenceForFile.map((e) => e.skill),
                  ...detectedSkills.slice(0, 6),
                ])
              );
              const isImage = att.mime_type?.startsWith('image/');
              const isExpanded = expandedTextId === att.id;
              const isLinking = linkingFileId === att.id;
              const isConfirmingDelete = confirmDeleteId === att.id;
              const hasIssues = attachmentHasIssues(att);
              const unresolvedFlags = ((att.flags || []) as UploadCheckFlag[]).filter(
                (f: UploadCheckFlag) => !f.resolved && (f.severity === 'warning' || f.severity === 'blocking')
              );

              return (
                <div
                  key={`att-${att.id}`}
                  className={`rounded-2xl border bg-white dark:bg-[#181B1E] shadow-xs p-5 flex flex-col justify-between space-y-4 ${
                    hasIssues
                      ? 'border-amber-300 dark:border-amber-700/70'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Thumbnail Preview + Header + Trust Badge */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3.5 min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center shrink-0 text-slate-600 dark:text-slate-300">
                          {isImage ? (
                            <ImageIcon className="w-5 h-5 text-[#2563EB]" />
                          ) : att.category === 'certificate' ? (
                            <FileCheck2 className="w-5 h-5 text-emerald-600" />
                          ) : (
                            <FileText className="w-5 h-5 text-[#2563EB]" />
                          )}
                          <span className="text-[9px] font-mono uppercase mt-0.5">
                            {att.filename.split('.').pop()?.slice(0, 4) || 'DOC'}
                          </span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                              {att.user_title || att.filename}
                            </h4>
                            {renderCardTrustBadge(att.trust)}
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
                            {att.filename} · {att.category}
                            {att.detected_type && att.detected_type !== att.category
                              ? ` (detected: ${att.detected_type})`
                              : ''}{' '}
                            · {Math.max(1, Math.round((att.file_size || 1024) / 1024))} KB
                          </p>
                        </div>
                      </div>

                      {hasIssues && (
                        <button
                          type="button"
                          onClick={() => handleOpenFixIssues(att)}
                          className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
                        >
                          <Wrench className="w-3.5 h-3.5 text-amber-700" />
                          <span>Fix issues</span>
                        </button>
                      )}
                    </div>

                    {/* Show active warnings if any */}
                    {unresolvedFlags.length > 0 && (
                      <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/80 space-y-1">
                        {unresolvedFlags.map((flag: UploadCheckFlag, i: number) => (
                          <div
                            key={`${flag.code}-${i}`}
                            className="flex items-start gap-2 text-xs text-amber-900"
                          >
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                            <span>{flag.message}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Supported / Detected Skills */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        Supports skills:
                      </p>
                      {supportedSkills.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {supportedSkills.map((sk) => (
                            <span
                              key={sk}
                              className="px-2.5 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300"
                            >
                              {sk}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400">No specific technical skills detected</p>
                      )}
                    </div>

                    {/* Extracted Text Preview */}
                    {isExpanded && (
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {att.extracted_text || 'No extracted text available.'}
                      </div>
                    )}

                    {/* Inline Link to Skill Form */}
                    {isLinking && (
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <select
                            value={linkSkillTarget}
                            onChange={(e) => setLinkSkillTarget(e.target.value)}
                            aria-label="Select skill to link"
                            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#14171A] text-xs font-medium text-slate-900 dark:text-white"
                          >
                            {COMMON_SKILL_TERMS.map((sk) => (
                              <option key={sk} value={sk}>
                                {sk}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={linkTitleTarget}
                            onChange={(e) => setLinkTitleTarget(e.target.value)}
                            placeholder="Optional proof label"
                            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#14171A] text-xs text-slate-900 dark:text-white"
                          />
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setLinkingFileId(null)}
                            className="px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={savingLink}
                            onClick={() => handleLinkFileToSkill(att)}
                            className="px-3.5 py-1.5 rounded-lg bg-[#2563EB] text-white text-xs font-semibold cursor-pointer"
                          >
                            {savingLink ? 'Linking…' : 'Confirm link'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card Actions: View extracted text | Review Upload Check | Link to skill | Delete */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedTextId(isExpanded ? null : att.id)
                        }
                        className="text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-[#2563EB] inline-flex items-center gap-1 cursor-pointer"
                      >
                        {isExpanded ? (
                          <>
                            <EyeOff className="w-3.5 h-3.5" />
                            <span>Hide text</span>
                          </>
                        ) : (
                          <>
                            <Eye className="w-3.5 h-3.5" />
                            <span>View extracted text</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenFixIssues(att)}
                        className="text-xs font-semibold text-indigo-600 hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <FileCheck2 className="w-3.5 h-3.5" />
                        <span>Inspect Check</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setLinkingFileId(isLinking ? null : att.id);
                          setLinkSkillTarget(supportedSkills[0] || 'React');
                        }}
                        className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        <span>Link to skill</span>
                      </button>
                    </div>

                    {isConfirmingDelete ? (
                      <div className="inline-flex items-center gap-2">
                        <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                          Delete file?
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteAttachment(att.id, att.filename)}
                          className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs font-semibold cursor-pointer"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(att.id)}
                        className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Repository & Certificate Proof Cards */}
            {vaultFilter === 'all' &&
              evidence.map((ev) => {
                const isGitHubItem =
                  ev.type === 'github' ||
                  ev.type === 'GitHub link' ||
                  Boolean(ev.url && ev.url.toLowerCase().includes('github.com'));

                if (isGitHubItem && ev.id != null) {
                  return (
                    <GitHubEvidenceCard
                      key={`ev-${ev.id}`}
                      item={ev}
                      onRemove={(id) => handleDeleteEvidence(id, ev.title)}
                      onUpdated={onRefresh}
                    />
                  );
                }

                const isConfirming = confirmDeleteEvidenceId === ev.id;
                const evTrust = ev.details?.trust as UploadTrustTier | undefined;
                const isUnconfirmedEv =
                  Boolean(ev.details?.unconfirmedEvidence) || evTrust === 'low';

                return (
                  <div
                    key={`ev-${ev.id}`}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xs p-5 flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                              isUnconfirmedEv
                                ? 'bg-amber-500/10 text-amber-600'
                                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {isUnconfirmedEv ? (
                              <AlertTriangle className="w-5 h-5" />
                            ) : (
                              <CheckCircle2 className="w-5 h-5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                {ev.title}
                              </h4>
                              {evTrust && renderCardTrustBadge(evTrust)}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              Supports skill:{' '}
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {ev.skill}
                              </span>{' '}
                              · {ev.type}
                            </p>
                          </div>
                        </div>
                      </div>

                      {ev.extracted_summary && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          {ev.extracted_summary}
                        </p>
                      )}
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                      {ev.url ? (
                        <a
                          href={ev.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline inline-flex items-center gap-1"
                        >
                          <span>Verify / Open source link</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">
                          {ev.attachment_name ? `File: ${ev.attachment_name}` : 'Linked artifact'}
                        </span>
                      )}

                      {isConfirming ? (
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => ev.id != null && handleDeleteEvidence(ev.id, ev.title)}
                            className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs font-semibold cursor-pointer"
                          >
                            Confirm delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteEvidenceId(null)}
                            className="text-xs text-slate-500 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteEvidenceId(ev.id ?? null)}
                          className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </section>

      {/* Section 6: Interactive 9-Scenario Upload Check Verification Matrix */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xs p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center shrink-0 mt-0.5">
              <FlaskConical className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-heading text-base font-bold text-slate-900 dark:text-white">
                Upload Check Verification Suite — 9 Edge-Case Tests & Live Results
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                All 9 required edge cases run deterministically against the content-based pipeline. Click any scenario to open its live Upload Review panel.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowTestSuite((prev) => !prev)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 self-start"
          >
            {showTestSuite ? 'Hide test matrix' : 'Show 9 test cases'}
          </button>
        </div>

        {showTestSuite && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-2">
            {computedTestScenarios.map(({ scenario, result }) => (
              <div
                key={scenario.id}
                className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 flex flex-col justify-between space-y-3 hover:border-indigo-300 transition-colors"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                      Test #{scenario.number}
                    </span>
                    {renderCardTrustBadge(result.trust)}
                  </div>
                  <h4 className="text-xs font-bold text-slate-900">{scenario.title}</h4>
                  <p className="text-[11px] text-slate-500 font-mono truncate">
                    File: {scenario.filename} · Chose: {scenario.selectedCategory}
                  </p>

                  <div className="text-[11px] text-slate-700 bg-white rounded-lg p-2.5 border border-slate-200/80 space-y-1">
                    <div>
                      <span className="font-semibold text-slate-900">Detected type:</span>{' '}
                      <span className="font-mono">{result.detectedType}</span> (
                      {Math.round(result.typeConfidence * 100)}%)
                    </div>
                    <div>
                      <span className="font-semibold text-slate-900">Identity check:</span>{' '}
                      <span className="font-mono">{result.nameMatch}</span>
                      {result.extractedPersonName ? ` (${result.extractedPersonName})` : ''}
                    </div>
                    {result.flags.length > 0 && (
                      <div className="text-amber-900 font-medium pt-0.5">
                        Flag: {result.flags[0].message}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleInspectScenario(scenario)}
                  className="w-full py-1.5 px-3 rounded-lg bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Open in Upload Review Panel →
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Two-Way Mapping Section: Each Skill & Its Linked Files / Proofs */}
      {skillToProofsMap.length > 0 && (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xs p-6 space-y-4">
          <div>
            <h3 className="font-heading text-lg font-semibold text-slate-900 dark:text-white">
              Skills and their linked files
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Every skill below is mapped to the uploaded files or repository links that support it.
            </p>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {skillToProofsMap.map(([skill, items]) => (
              <div
                key={skill}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="font-semibold text-sm text-slate-900 dark:text-white">
                  {skill}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  {items.map((item, idx) => (
                    <React.Fragment key={item.id}>
                      {idx > 0 && <span className="text-slate-300 dark:text-slate-700">·</span>}
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#2563EB] dark:text-[#60A5FA] hover:underline inline-flex items-center gap-1"
                        >
                          <span>{item.label}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span>{item.label}</span>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
