import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  FileText,
  Info,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import type {
  AttachmentItem,
  EvidenceItem,
  Profile,
  SelectedUploadCategory,
  UploadCheckFlag,
  UploadCheckResult,
  UploadTrustTier,
} from '../types';
import {
  computeUploadTrustTier,
  formatDetectedTypeLabel,
  formatSelectedCategoryLabel,
  mapDetectedTypeToCategory,
  verifyIdentity,
} from '../utils/uploadCheck';
import { confirmUploadCheck, fetchApi, updateAttachmentItem } from '../api';

export interface UploadCheckModalProps {
  isOpen: boolean;
  isRunningCheck?: boolean;
  checkResult: UploadCheckResult | null;
  extractedText?: string;
  profile?: Profile | null;
  targetSkill?: string;
  existingAttachmentForFix?: AttachmentItem | null;
  onClose: () => void;
  onReplaceFile?: () => void;
  onNavigateToJobMatch?: (jdText?: string) => void;
  onConfirmed: (result: {
    attachment: AttachmentItem | null;
    createdEvidence: EvidenceItem[];
    checkResult: UploadCheckResult;
    text: string;
    detectedSkills: string[];
    readinessScore?: number;
    updatedProfileName?: string;
  }) => void;
}

interface CheckRowItem {
  id: string;
  label: string;
  status: 'pass' | 'warning' | 'blocking' | 'info';
  summary: string;
  flags: UploadCheckFlag[];
}

export const UploadCheckModal: React.FC<UploadCheckModalProps> = ({
  isOpen,
  isRunningCheck = false,
  checkResult,
  extractedText = '',
  profile,
  targetSkill,
  existingAttachmentForFix = null,
  onClose,
  onReplaceFile,
  onNavigateToJobMatch,
  onConfirmed,
}) => {
  const [progressStep, setProgressStep] = useState<number>(0);
  const [selectedCategory, setSelectedCategory] = useState<SelectedUploadCategory>('resume');
  const [filename, setFilename] = useState<string>('');
  const [userTitle, setUserTitle] = useState<string>('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [categoryResolution, setCategoryResolution] = useState<'unresolved' | 'moved'>('unresolved');
  const [identityResolution, setIdentityResolution] = useState<
    'unresolved' | 'confirmed_mine' | 'update_profile'
  >('unresolved');
  const [skillMismatchResolution, setSkillMismatchResolution] = useState<'unresolved' | 'use_detected' | 'attach_anyway'>('unresolved');
  const [linkExistingAttachmentId, setLinkExistingAttachmentId] = useState<number | undefined>(undefined);
  const [overwriteProfileResume, setOverwriteProfileResume] = useState<boolean>(true);
  const [keepExistingResumeOnConflict, setKeepExistingResumeOnConflict] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Support setting profile name inline if user has no profile name set yet
  const [customProfileName, setCustomProfileName] = useState<string>('');
  const [pendingProfileNameInput, setPendingProfileNameInput] = useState<string>('');
  const [isSavingProfileName, setIsSavingProfileName] = useState<boolean>(false);

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const categorySelectRef = useRef<HTMLSelectElement | null>(null);

  const profileName = (
    customProfileName ||
    profile?.name ||
    checkResult?.profileNameUsed ||
    ''
  ).trim();

  // Animate progress steps when isRunningCheck is active
  useEffect(() => {
    if (!isRunningCheck) {
      setProgressStep(2);
      return;
    }
    setProgressStep(0);
    const t1 = setTimeout(() => setProgressStep(1), 350);
    const t2 = setTimeout(() => setProgressStep(2), 750);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isRunningCheck]);

  // Initialize local state from checkResult
  useEffect(() => {
    if (!checkResult) return;
    setSelectedCategory(checkResult.selectedCategory);
    setFilename(checkResult.filename);
    setUserTitle(checkResult.userTitle || '');

    const initialSkills = new Set<string>(checkResult.detectedSkills || []);
    if (checkResult.targetSkill && checkResult.targetSkillMentioned) {
      initialSkills.add(checkResult.targetSkill);
    }
    setSelectedSkills(Array.from(initialSkills));
    setCategoryResolution('unresolved');
    setIdentityResolution('unresolved');
    setSkillMismatchResolution('unresolved');
    setLinkExistingAttachmentId(undefined);
    setOverwriteProfileResume(true);
    setKeepExistingResumeOnConflict(false);
    setCustomProfileName('');
    setPendingProfileNameInput(profile?.name || checkResult.profileNameUsed || '');
    setErrorMsg(null);
  }, [checkResult, profile?.name]);

  // Compute live identity verification using verifyIdentity(profile, docText, options)
  const liveIdentityVerification = useMemo(() => {
    if (!checkResult) return null;
    if (
      !customProfileName &&
      checkResult.identityVerification &&
      (profile?.name || '').trim() === (checkResult.profileNameUsed || '').trim()
    ) {
      return checkResult.identityVerification;
    }
    const docText = extractedText || checkResult.extractedTextPreview || '';
    return verifyIdentity(
      {
        name: profileName,
        email: profile?.email,
        phone: profile?.phone,
        linkedin: profile?.linkedin,
        linkedin_username: profile?.linkedin_username,
        github: profile?.github,
        github_username: profile?.github_username,
      },
      docText,
      {
        extractedPersonNameHint: checkResult.extractedPersonName,
        detectedType: checkResult.detectedType,
      }
    );
  }, [checkResult, customProfileName, profile, profileName, extractedText]);

  const rawNameMatch = useMemo(() => {
    if (!checkResult) return 'unknown';
    if (checkResult.readability.status === 'unreadable' || checkResult.nameMatch === 'unreadable') {
      return 'unreadable';
    }
    if (liveIdentityVerification) {
      if (liveIdentityVerification.missingProfileName) return 'unknown';
      if (liveIdentityVerification.status === 'PASS') return 'match';
      if (liveIdentityVerification.status === 'WARN') return 'partial';
      return liveIdentityVerification.conflictingName ? 'mismatch' : 'not_found';
    }
    return checkResult.nameMatch;
  }, [checkResult, liveIdentityVerification]);

  // Compute live flags & live trust based on user resolutions in the modal
  const effectiveNameMatch = useMemo(() => {
    if (!checkResult) return 'unknown';
    if (
      rawNameMatch === 'partial' &&
      (identityResolution === 'confirmed_mine' || identityResolution === 'update_profile')
    ) {
      return 'match';
    }
    return rawNameMatch;
  }, [checkResult, rawNameMatch, identityResolution]);

  const effectiveIdentityUnconfirmed = useMemo(() => {
    if (!checkResult) return false;
    if (rawNameMatch === 'match') return false;
    if (
      rawNameMatch === 'partial' &&
      (identityResolution === 'confirmed_mine' || identityResolution === 'update_profile')
    ) {
      return false;
    }
    return true;
  }, [checkResult, rawNameMatch, identityResolution]);

  const effectiveFlags = useMemo<UploadCheckFlag[]>(() => {
    if (!checkResult) return [];
    const expectedCat = mapDetectedTypeToCategory(checkResult.detectedType);

    return (checkResult.flags || []).map((flag) => {
      if (flag.code === 'CATEGORY_MISMATCH') {
        if (expectedCat && selectedCategory === expectedCat) {
          return {
            ...flag,
            resolved: true,
            resolutionAction: `Moved to ${formatSelectedCategoryLabel(selectedCategory)}`,
          };
        }
      }

      if (flag.code === 'IDENTITY_MISSING_PROFILE_NAME' && profileName) {
        if (rawNameMatch === 'match' || (rawNameMatch === 'partial' && identityResolution === 'confirmed_mine')) {
          return {
            ...flag,
            resolved: true,
            resolutionAction: `Profile name set to "${profileName}"`,
          };
        }
      }

      if (flag.code === 'IDENTITY_PARTIAL_MATCH') {
        if (identityResolution === 'confirmed_mine' || identityResolution === 'update_profile') {
          return {
            ...flag,
            resolved: true,
            resolutionAction:
              identityResolution === 'update_profile'
                ? `Confirmed & will update profile name to "${checkResult.extractedPersonName}"`
                : 'Confirmed as your document',
          };
        }
      }

      if (flag.code === 'IDENTITY_NOT_FOUND_EVIDENCE') {
        if (identityResolution === 'confirmed_mine') {
          return {
            ...flag,
            resolved: true,
            resolutionAction: 'Confirmed as your project evidence',
          };
        }
      }

      if (flag.code === 'FILENAME_CONTENT_MISMATCH' && checkResult.suggestedRename) {
        if (filename === checkResult.suggestedRename) {
          return {
            ...flag,
            resolved: true,
            resolutionAction: `Renamed to "${filename}"`,
          };
        }
      }

      if (flag.code === 'GENERIC_FILENAME_NEEDS_TITLE') {
        if (userTitle.trim().length >= 3) {
          return {
            ...flag,
            resolved: true,
            resolutionAction: `Title set to "${userTitle.trim()}"`,
          };
        }
      }

      if (flag.code === 'SKILL_RELEVANCE_MISMATCH') {
        if (skillMismatchResolution === 'use_detected') {
          return {
            ...flag,
            resolved: true,
            resolutionAction: 'Attached to detected skills instead',
          };
        }
        if (skillMismatchResolution === 'attach_anyway') {
          return {
            ...flag,
            resolved: true,
            resolutionAction: 'Attached anyway (marked Unconfirmed / Low trust)',
          };
        }
      }

      if (
        (flag.code === 'DUPLICATE_FILE_HASH' || flag.code === 'DUPLICATE_TEXT_CONTENT') &&
        linkExistingAttachmentId
      ) {
        return {
          ...flag,
          resolved: true,
          resolutionAction: 'Will link existing file copy',
        };
      }

      return flag;
    });
  }, [
    checkResult,
    selectedCategory,
    categoryResolution,
    identityResolution,
    profileName,
    rawNameMatch,
    filename,
    userTitle,
    skillMismatchResolution,
    linkExistingAttachmentId,
  ]);

  const effectiveTrust = useMemo<UploadTrustTier>(() => {
    if (!checkResult) return 'low';
    const activeFlags = effectiveFlags.filter((f) => !f.resolved);
    const effectiveTargetSkill =
      skillMismatchResolution === 'use_detected'
        ? undefined
        : targetSkill || checkResult.targetSkill;
    const effectiveTargetMentioned =
      skillMismatchResolution === 'use_detected'
        ? true
        : checkResult.targetSkillMentioned;

    return computeUploadTrustTier({
      readabilityStatus: checkResult.readability?.status || 'readable',
      detectedType: checkResult.detectedType,
      selectedCategory,
      typeConfidence: checkResult.typeConfidence,
      nameMatch: effectiveNameMatch,
      identityUnconfirmed: effectiveIdentityUnconfirmed,
      targetSkill: effectiveTargetSkill,
      targetSkillMentioned: effectiveTargetMentioned,
      attachedAnywayUnconfirmed: skillMismatchResolution === 'attach_anyway',
      flags: activeFlags,
    });
  }, [
    checkResult,
    effectiveFlags,
    selectedCategory,
    effectiveNameMatch,
    effectiveIdentityUnconfirmed,
    skillMismatchResolution,
    targetSkill,
  ]);

  // Build structured 9-check summary rows for the right-hand panel
  const checkRows = useMemo<CheckRowItem[]>(() => {
    if (!checkResult) return [];

    const byCheck = (checkId: UploadCheckFlag['checkId']) =>
      effectiveFlags.filter((f) => f.checkId === checkId);

    const rows: CheckRowItem[] = [];

    // A. Readability & OCR Quality
    const readFlags = byCheck('readability');
    const isReadable =
      checkResult.readability.status === 'readable' &&
      checkResult.readability.ocrConfidence >= 60 &&
      checkResult.readability.charCount >= 100 &&
      !checkResult.isNonDocumentPhoto &&
      checkResult.detectedType !== 'non_document_photo';

    const realOcrReasonLabel =
      checkResult.readability.failureCategory === 'not_a_document' ||
      checkResult.isNonDocumentPhoto ||
      checkResult.detectedType === 'non_document_photo'
        ? 'not a document'
        : checkResult.readability.failureCategory === 'rotated'
        ? 'rotated'
        : checkResult.readability.failureCategory === 'too_small'
        ? 'too small'
        : checkResult.readability.reason || 'blurry';

    rows.push({
      id: 'readability',
      label: 'A. Readability & OCR',
      status: isReadable ? 'pass' : 'blocking',
      summary: isReadable
        ? `Readable (${checkResult.readability.charCount.toLocaleString()} chars · ${checkResult.readability.ocrConfidence}% OCR confidence${
            checkResult.readability.retriedWithPreprocessed ? ' · Preprocessed 1600px PNG' : ''
          }${checkResult.readability.usedVisionFallback ? ' · Vision Fallback' : ''})`
        : readFlags[0]?.message ||
          `Unreadable (${realOcrReasonLabel}): Please upload a clearer document.`,
      flags: readFlags,
    });

    // B. Document Type (Content-based)
    const typeFlags = byCheck('document_type');
    const detectedLabel = formatDetectedTypeLabel(checkResult.detectedType);
    const chosenLabel = formatSelectedCategoryLabel(selectedCategory);
    const mappedCat = mapDetectedTypeToCategory(checkResult.detectedType);
    const confidencePct = Math.round((checkResult.typeConfidence || 0) * 100);

    const isPhoto =
      checkResult.isNonDocumentPhoto || checkResult.detectedType === 'non_document_photo';
    const isLowConfidence = !isReadable || (checkResult.typeConfidence ?? 0) < 0.6;
    const isUnrelatedOrBlockedType =
      checkResult.detectedType === 'other' ||
      checkResult.detectedType === 'id_document' ||
      checkResult.detectedType === 'marksheet' ||
      checkResult.detectedType === 'job_description';
    const isCategoryMismatch = !mappedCat || mappedCat !== selectedCategory;

    const isTypeBlocked =
      isPhoto ||
      isLowConfidence ||
      isUnrelatedOrBlockedType ||
      isCategoryMismatch ||
      typeFlags.some((f) => f.severity === 'blocking' && !f.resolved);

    let typeSummary = `Content matches ${chosenLabel} (${confidencePct}% confidence)`;
    if (isPhoto) {
      typeSummary = 'This looks like a photo, not a document.';
    } else if (checkResult.detectedType === 'id_document' || checkResult.detectedType === 'marksheet') {
      typeSummary =
        typeFlags[0]?.message ||
        'This looks like a personal ID or marksheet. Do not upload sensitive IDs. Remove it?';
    } else if (checkResult.detectedType === 'job_description') {
      typeSummary =
        typeFlags[0]?.message ||
        'This file looks like a job description rather than your personal proof.';
    } else if (checkResult.detectedType === 'other') {
      typeSummary =
        'Unrelated Document: This file does not appear to be a résumé, certificate, or project evidence.';
    } else if (isLowConfidence) {
      typeSummary = `Document type confidence is ${confidencePct}% (below 60% minimum required). Cannot verify as ${chosenLabel}.`;
    } else if (isCategoryMismatch) {
      typeSummary = `This looks like a ${detectedLabel} (${confidencePct}% confidence), but you chose ${chosenLabel}.`;
    }

    rows.push({
      id: 'document_type',
      label: 'B. Document Type (Content-Based)',
      status: isTypeBlocked ? 'blocking' : 'pass',
      summary: typeSummary,
      flags: typeFlags,
    });

    // C. Identity & Recipient Match (Universal verifyIdentity)
    const idFlags = byCheck('identity_match');
    let idStatus: CheckRowItem['status'] = 'blocking';
    let idSummary = 'Cannot verify identity';

    if (!isReadable || checkResult.nameMatch === 'unreadable') {
      idStatus = 'blocking';
      idSummary = 'Cannot verify identity — document text is unreadable.';
    } else if (!profileName || liveIdentityVerification?.missingProfileName) {
      idStatus = 'blocking';
      idSummary =
        liveIdentityVerification?.message ||
        'Please set your full name in your profile before uploading so we can verify document ownership.';
    } else if (rawNameMatch === 'match') {
      idStatus = 'pass';
      idSummary =
        liveIdentityVerification?.message ||
        `Name on document: ${checkResult.extractedPersonName || profileName} matches your profile.`;
    } else if (rawNameMatch === 'partial') {
      if (identityResolution === 'confirmed_mine' || identityResolution === 'update_profile') {
        idStatus = 'pass';
        idSummary = `Confirmed as your document (${profileName}). ${
          liveIdentityVerification?.message || ''
        }`;
      } else {
        idStatus = 'warning';
        idSummary =
          liveIdentityVerification?.message ||
          `Partial identity match for "${profileName}". Please check "Confirm this is your document" below to save.`;
      }
    } else {
      // BLOCK (conflicting name or no signal at all)
      idStatus = 'blocking';
      idSummary =
        liveIdentityVerification?.message ||
        (checkResult.extractedPersonName
          ? `This document appears to belong to ${checkResult.extractedPersonName}, not ${profileName}. Upload your own document.`
          : `No matching identity signal found for "${profileName}". Upload your own document.`);
    }

    rows.push({
      id: 'identity_match',
      label: 'C. Identity & Recipient Match',
      status: idStatus,
      summary: idSummary,
      flags: idFlags,
    });

    // D. Filename vs Content
    const fnFlags = byCheck('filename_vs_content');
    const hasUnresolvedFnWarning = fnFlags.some((f) => !f.resolved);
    rows.push({
      id: 'filename_vs_content',
      label: 'D. Filename vs Content',
      status: hasUnresolvedFnWarning ? 'warning' : 'pass',
      summary: hasUnresolvedFnWarning
        ? fnFlags.map((f) => f.message).join(' ')
        : `Filename "${filename}" and title "${userTitle || filename}" look consistent`,
      flags: fnFlags,
    });

    // E. Skill Relevance
    const skillFlags = byCheck('skill_relevance');
    const hasUnresolvedSkillWarning = skillFlags.some((f) => !f.resolved);
    const activeTarget = targetSkill || checkResult.targetSkill;
    rows.push({
      id: 'skill_relevance',
      label: 'E. Skill Relevance & Detection',
      status: !isReadable
        ? 'info'
        : hasUnresolvedSkillWarning
        ? 'warning'
        : checkResult.detectedSkills.length > 0
        ? 'pass'
        : 'warning',
      summary: !isReadable
        ? '0 skills extracted from unreadable file'
        : hasUnresolvedSkillWarning
        ? skillFlags[0]?.message || `Target skill ${activeTarget} not found`
        : skillMismatchResolution === 'attach_anyway'
        ? `Attached to ${activeTarget} anyway — marked Unconfirmed (Low trust)`
        : checkResult.detectedSkills.length > 0
        ? `Detected ${checkResult.detectedSkills.length} skill${checkResult.detectedSkills.length === 1 ? '' : 's'}: ${checkResult.detectedSkills.slice(0, 6).join(', ')}`
        : 'No technical skills automatically detected in text',
      flags: skillFlags,
    });

    // F. Certificate Sanity Checks (shown when certificate)
    if (checkResult.detectedType === 'certificate' || selectedCategory === 'certificate') {
      const certFlags = byCheck('certificate_sanity');
      const hasCertWarning = certFlags.some((f) => !f.resolved);
      rows.push({
        id: 'certificate_sanity',
        label: 'F. Certificate Sanity Checks',
        status: hasCertWarning ? 'warning' : 'pass',
        summary: hasCertWarning
          ? certFlags.map((f) => f.message).join(' ')
          : `Issuer (${checkResult.certificateMeta?.issuer || 'Verified'}), date (${checkResult.certificateMeta?.issueDate || 'Valid'}), and credential details checked`,
        flags: certFlags,
      });
    }

    // G. Duplicates & Reuse
    const dupFlags = byCheck('duplicates_reuse');
    const hasDupWarning = dupFlags.some((f) => !f.resolved);
    rows.push({
      id: 'duplicates_reuse',
      label: 'G. Duplicates & Reuse Check',
      status: hasDupWarning ? 'warning' : 'pass',
      summary: hasDupWarning
        ? dupFlags[0]?.message || 'Duplicate file detected'
        : linkExistingAttachmentId
        ? `Linked to existing file copy (#${linkExistingAttachmentId})`
        : `Unique SHA-256 hash (${checkResult.hash.slice(0, 12)}…)`,
      flags: dupFlags,
    });

    // H. Résumé-specific Checks (shown when résumé)
    if (checkResult.detectedType === 'resume' || selectedCategory === 'resume') {
      const resFlags = byCheck('resume_specific');
      const hasResWarning = resFlags.some((f) => f.severity === 'warning' && !f.resolved);
      const unprovenCount = checkResult.resumeMeta?.claimedButUnprovenSkills?.length || 0;
      rows.push({
        id: 'resume_specific',
        label: 'H. Résumé Consistency & Unproven Claims',
        status: hasResWarning ? 'warning' : 'pass',
        summary: hasResWarning
          ? resFlags.filter((f) => f.severity === 'warning').map((f) => f.message).join(' ')
          : unprovenCount > 0
          ? `${unprovenCount} claimed skill${unprovenCount === 1 ? '' : 's'} in this résumé still need proof (${checkResult.resumeMeta?.claimedButUnprovenSkills.slice(0, 4).join(', ')})`
          : 'All claimed skills in this résumé match your profile and evidence',
        flags: resFlags,
      });
    }

    // I. Suspicious Content
    const suspFlags = byCheck('suspicious_content');
    const hasSuspWarning = suspFlags.some((f) => !f.resolved);
    if (hasSuspWarning) {
      rows.push({
        id: 'suspicious_content',
        label: 'I. Content Depth & Authenticity',
        status: 'warning',
        summary: suspFlags[0]?.message || 'Low-trust evidence flagged',
        flags: suspFlags,
      });
    }

    return rows;
  }, [
    checkResult,
    effectiveFlags,
    selectedCategory,
    rawNameMatch,
    liveIdentityVerification,
    identityResolution,
    profileName,
    filename,
    userTitle,
    targetSkill,
    skillMismatchResolution,
    linkExistingAttachmentId,
  ]);

  if (!isOpen) return null;

  const hasAnyBlockedCheck = checkRows.some((r) => r.status === 'blocking');
  const needsIdentityConfirmation =
    rawNameMatch === 'partial' &&
    identityResolution !== 'confirmed_mine' &&
    identityResolution !== 'update_profile';

  const hasHardBlock =
    !checkResult ||
    hasAnyBlockedCheck ||
    checkResult.readability.status === 'unreadable' ||
    checkResult.detectedType === 'non_document_photo' ||
    checkResult.detectedType === 'id_document' ||
    checkResult.detectedType === 'marksheet' ||
    checkResult.detectedType === 'job_description' ||
    checkResult.detectedType === 'other' ||
    (checkResult.typeConfidence ?? 0) < 0.6 ||
    effectiveFlags.some((f) => f.severity === 'blocking' && !f.resolved);

  const needsTitleError = checkResult && !hasHardBlock && userTitle.trim().length < 2;
  const canSave = Boolean(
    checkResult &&
      !isRunningCheck &&
      !hasHardBlock &&
      !hasAnyBlockedCheck &&
      !needsIdentityConfirmation &&
      !needsTitleError &&
      !isSaving
  );

  const handleSaveProfileNameInline = async () => {
    const trimmed = pendingProfileNameInput.trim();
    if (!trimmed) return;
    setIsSavingProfileName(true);
    setErrorMsg(null);
    try {
      await fetchApi('/profile', {
        method: 'PUT',
        body: JSON.stringify({
          ...(profile || {}),
          name: trimmed,
        }),
      });
    } catch {
      // Even if offline, update customProfileName in modal so verifyIdentity runs immediately
    } finally {
      setCustomProfileName(trimmed);
      setIsSavingProfileName(false);
    }
  };

  const toggleSkillCheckbox = (skill: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    );
  };

  const handleMoveToDetectedCategory = () => {
    if (!checkResult) return;
    const mapped = mapDetectedTypeToCategory(checkResult.detectedType);
    if (mapped) {
      setSelectedCategory(mapped);
      setCategoryResolution('moved');
    }
  };

  const handleSaveConfirmed = async () => {
    if (!checkResult || !canSave) return;
    setIsSaving(true);
    setErrorMsg(null);

    try {
      // If editing an existing Proof Vault attachment via "Fix issues"
      if (existingAttachmentForFix) {
        const updatedAtt = await updateAttachmentItem(existingAttachmentForFix.id, {
          filename,
          user_title: userTitle.trim(),
          category: selectedCategory,
          selected_category: selectedCategory,
          name_match: effectiveNameMatch,
          flags: effectiveFlags,
          trust: effectiveTrust,
          confirmed_by_user: true,
          upload_check: {
            ...checkResult,
            filename,
            userTitle: userTitle.trim(),
            selectedCategory,
            nameMatch: effectiveNameMatch,
            profileNameUsed: profileName,
            nameSimilarityScore:
              liveIdentityVerification?.score ?? checkResult.nameSimilarityScore,
            identityUnconfirmed: effectiveIdentityUnconfirmed,
            missingProfileName: Boolean(liveIdentityVerification?.missingProfileName),
            identityVerification:
              liveIdentityVerification || checkResult.identityVerification,
            flags: effectiveFlags,
            trust: effectiveTrust,
            confirmedByUser: true,
          },
          updateProfileName:
            identityResolution === 'update_profile'
              ? checkResult.extractedPersonName
              : customProfileName || undefined,
        });

        onConfirmed({
          attachment: updatedAtt,
          createdEvidence: [],
          checkResult: updatedAtt.upload_check || checkResult,
          text: updatedAtt.extracted_text || extractedText,
          detectedSkills: selectedSkills,
          updatedProfileName:
            identityResolution === 'update_profile'
              ? checkResult.extractedPersonName
              : customProfileName || undefined,
        });
        return;
      }

      const response = await confirmUploadCheck({
        checkResult: {
          ...checkResult,
          nameMatch: effectiveNameMatch,
          profileNameUsed: profileName,
          nameSimilarityScore:
            liveIdentityVerification?.score ?? checkResult.nameSimilarityScore,
          identityUnconfirmed: effectiveIdentityUnconfirmed,
          missingProfileName: Boolean(liveIdentityVerification?.missingProfileName),
          identityVerification:
            liveIdentityVerification || checkResult.identityVerification,
          flags: effectiveFlags,
          trust: effectiveTrust,
        },
        selectedCategory,
        userTitle: userTitle.trim(),
        filename,
        extractedText,
        selectedSkills,
        attachAnyway: skillMismatchResolution === 'attach_anyway',
        updateProfileName: identityResolution === 'update_profile',
        overwriteProfileResume,
        keepExistingResumeOnConflict,
        linkExistingAttachmentId,
        saveToProfile: selectedCategory === 'resume',
      });

      onConfirmed({
        attachment: response.attachment,
        createdEvidence: response.createdEvidence || [],
        checkResult: response.checkResult,
        text: response.text,
        detectedSkills: response.detectedSkills,
        readinessScore: response.readinessScore,
        updatedProfileName:
          identityResolution === 'update_profile'
            ? checkResult.extractedPersonName
            : customProfileName || undefined,
      });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not save confirmed file.');
    } finally {
      setIsSaving(false);
    }
  };

  const renderTrustBadge = (trust: UploadTrustTier) => {
    switch (trust) {
      case 'high':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            High trust · Eligible for Verified
          </span>
        );
      case 'medium':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200">
            <FileCheck2 className="w-3.5 h-3.5 text-blue-600" />
            Medium trust · Eligible for Verified
          </span>
        );
      case 'low':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            Low trust · Unconfirmed evidence (stays Declared)
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
            Rejected · Blocked from saving
          </span>
        );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-check-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 id="upload-check-modal-title" className="text-base font-bold text-slate-900">
                  {existingAttachmentForFix ? 'Fix Upload Check Issues' : 'Upload Check & Content Review'}
                </h2>
                {!isRunningCheck && checkResult && renderTrustBadge(effectiveTrust)}
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                We verify the actual content of your file—never trusting the filename or selected category alone. Nothing counts as evidence until you confirm.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Upload Check review"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step 1: Progress state ("Reading… Checking name… Matching skills…") */}
        {isRunningCheck || !checkResult ? (
          <div className="p-10 flex flex-col items-center justify-center text-center min-h-[340px]">
            <div className="w-12 h-12 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mb-4 animate-pulse">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-2">
              Inspecting file contents before saving…
            </h3>
            <div className="flex items-center gap-3 text-xs font-medium text-slate-600 mb-5">
              <span className={progressStep >= 0 ? 'text-indigo-700 font-semibold' : 'text-slate-400'}>
                1. Reading…
              </span>
              <span className="text-slate-300">→</span>
              <span className={progressStep >= 1 ? 'text-indigo-700 font-semibold' : 'text-slate-400'}>
                2. Checking name…
              </span>
              <span className="text-slate-300">→</span>
              <span className={progressStep >= 2 ? 'text-indigo-700 font-semibold' : 'text-slate-400'}>
                3. Matching skills…
              </span>
            </div>
            <div className="w-64 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 transition-all duration-300"
                style={{ width: `${((progressStep + 1) / 3) * 100}%` }}
              />
            </div>
          </div>
        ) : (
          /* Step 2: Split Review Layout (File preview on the left, Checks list on the right) */
          <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
            {/* LEFT COLUMN: File preview, metadata, title, category, detected skills */}
            <div className="lg:col-span-5 p-5 space-y-4 bg-slate-50/40">
              <div className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <FileText className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 truncate" title={filename}>
                        {filename}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {checkResult.readability.source} · {checkResult.readability.charCount.toLocaleString()} chars · OCR {checkResult.readability.ocrConfidence}%
                      </p>
                    </div>
                  </div>
                  <span
                    className="text-[10px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200 shrink-0"
                    title={`SHA-256: ${checkResult.hash}`}
                  >
                    SHA256: {checkResult.hash.slice(0, 10)}…
                  </span>
                </div>

                {/* Title Input */}
                <div>
                  <label
                    htmlFor="upload-check-title-input"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Evidence Title {checkResult.needsGenericTitle && <span className="text-amber-700">(Required — generic filename)</span>}
                  </label>
                  <input
                    id="upload-check-title-input"
                    ref={titleInputRef}
                    type="text"
                    value={userTitle}
                    onChange={(e) => setUserTitle(e.target.value)}
                    placeholder="e.g. AWS Solutions Architect Certificate or Full-Stack Résumé"
                    className={`w-full px-3 py-1.5 text-xs rounded-lg border ${
                      needsTitleError
                        ? 'border-amber-400 bg-amber-50/30 focus:ring-amber-500'
                        : 'border-slate-300 bg-white focus:ring-indigo-500'
                    } focus:outline-none focus:ring-2`}
                  />
                  {needsTitleError && (
                    <p className="text-[11px] text-amber-700 mt-1">
                      Add a short descriptive title before saving this evidence.
                    </p>
                  )}
                </div>

                {/* Selected Category vs Detected Type */}
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <div>
                    <label
                      htmlFor="upload-check-category-select"
                      className="block text-[11px] font-semibold text-slate-600 mb-1"
                    >
                      Selected Category
                    </label>
                    <select
                      id="upload-check-category-select"
                      ref={categorySelectRef}
                      value={selectedCategory}
                      onChange={(e) => {
                        setSelectedCategory(e.target.value as SelectedUploadCategory);
                        setCategoryResolution('moved');
                      }}
                      className="w-full px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-800"
                    >
                      <option value="resume">Résumé</option>
                      <option value="certificate">Certificate</option>
                      <option value="evidence">Project Evidence</option>
                    </select>
                  </div>

                  <div>
                    <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Content-Detected Type
                    </span>
                    <div className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 border border-slate-200 text-slate-800 flex items-center justify-between">
                      <span className="capitalize">{formatDetectedTypeLabel(checkResult.detectedType)}</span>
                      <span className="text-[10px] text-slate-500">
                        {Math.round(checkResult.typeConfidence * 100)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Certificate Metadata & Verify with Issuer Link (Check F) */}
              {checkResult.certificateMeta && (
                <div className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Extracted Certificate Details
                    </h4>
                    {checkResult.certificateMeta.verifyUrl && (
                      <a
                        href={checkResult.certificateMeta.verifyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline"
                      >
                        Verify with issuer
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500 block text-[11px]">Issuer</span>
                      <span className="font-medium text-slate-800">
                        {checkResult.certificateMeta.issuer || 'Not found'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">Recipient</span>
                      <span className="font-medium text-slate-800">
                        {checkResult.certificateMeta.recipientName || 'Not found'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">Issue Date</span>
                      <span
                        className={`font-medium ${
                          checkResult.certificateMeta.isFutureDate ? 'text-rose-700 font-bold' : 'text-slate-800'
                        }`}
                      >
                        {checkResult.certificateMeta.issueDate || 'Missing'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">Credential ID</span>
                      <span className="font-mono text-slate-800">
                        {checkResult.certificateMeta.credentialId || 'None'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Detected Skills Checkboxes (Check E) */}
              {!hasHardBlock && (
                <div className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-800">
                      Skills to attach ({selectedSkills.length} selected)
                    </h4>
                    {checkResult.detectedSkills.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedSkills(checkResult.detectedSkills)}
                        className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800"
                      >
                        Select all detected
                      </button>
                    )}
                  </div>

                  {checkResult.detectedSkills.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      No skills were automatically detected in this file&apos;s text.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from(
                        new Set([
                          ...checkResult.detectedSkills,
                          ...(targetSkill ? [targetSkill] : []),
                        ])
                      ).map((skill) => {
                        const isChecked = selectedSkills.includes(skill);
                        const isDetected = checkResult.detectedSkills.includes(skill);
                        return (
                          <label
                            key={skill}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer border transition-colors ${
                              isChecked
                                ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleSkillCheckbox(skill)}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span>{skill}</span>
                            {!isDetected && (
                              <span className="text-[10px] text-amber-700 font-semibold">
                                (not in text)
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Extracted Content Preview */}
              <div className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800">File Content Preview</h4>
                  <span className="text-[11px] text-slate-500">
                    {checkResult.privacyRedacted ? 'Redacted for privacy' : 'Extracted text layer'}
                  </span>
                </div>
                {checkResult.privacyRedacted ? (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                    <Lock className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Privacy protection active:</strong> Because this file looks like a personal government ID or academic marksheet, ApplyWise immediately discarded the extracted text and will not store it.
                    </span>
                  </div>
                ) : (
                  <pre className="text-[11px] font-mono text-slate-700 bg-slate-50 p-2.5 rounded border border-slate-200 max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                    {checkResult.extractedTextPreview || extractedText || 'No readable text extracted.'}
                  </pre>
                )}
              </div>

              {/* Privacy Notice (Section 5) */}
              <div className="p-3 rounded-lg bg-slate-100 border border-slate-200/80 text-[11px] text-slate-600 flex items-start gap-2">
                <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-700">What we extract & store:</strong> We compute a SHA-256 file fingerprint and inspect the document text to verify category, recipient name, and skill mentions. Sensitive IDs and marksheets are blocked and never stored.
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Checks list (green tick, amber warning, red cross + interactive resolution buttons) */}
            <div className="lg:col-span-7 p-5 space-y-3.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Content Verification Checks ({checkRows.length})
                </h3>
                <span className="text-xs text-slate-500">
                  All checks run on file content, never filename alone
                </span>
              </div>

              <div className="space-y-2.5">
                {checkRows.map((row) => {
                  const icon =
                    row.status === 'pass' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : row.status === 'blocking' ? (
                      <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    ) : row.status === 'warning' ? (
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    ) : (
                      <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    );

                  const borderClass =
                    row.status === 'pass'
                      ? 'border-emerald-200/80 bg-emerald-50/20'
                      : row.status === 'blocking'
                      ? 'border-rose-300 bg-rose-50/40'
                      : row.status === 'warning'
                      ? 'border-amber-300 bg-amber-50/40'
                      : 'border-slate-200 bg-slate-50/40';

                  const mappedDetectedCategory = mapDetectedTypeToCategory(checkResult.detectedType);

                  return (
                    <div
                      key={row.id}
                      className={`rounded-lg border p-3.5 transition-colors ${borderClass}`}
                    >
                      <div className="flex items-start gap-2.5">
                        {icon}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-bold text-slate-900">{row.label}</p>
                            <span
                              className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                                row.status === 'pass'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : row.status === 'blocking'
                                  ? 'bg-rose-100 text-rose-800'
                                  : row.status === 'warning'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {row.status === 'pass'
                                ? 'Passed'
                                : row.status === 'blocking'
                                ? 'Blocked'
                                : row.status === 'warning'
                                ? 'Needs Review'
                                : 'Info'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-700 mt-1 leading-relaxed">{row.summary}</p>

                          {/* Diagnostic reason badge for Check A when blocked */}
                          {row.id === 'readability' && row.status === 'blocking' && (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-100 text-rose-800 border border-rose-200">
                                OCR issue:{' '}
                                {checkResult.readability.failureCategory === 'not_a_document' ||
                                checkResult.isNonDocumentPhoto ||
                                checkResult.detectedType === 'non_document_photo'
                                  ? 'not a document'
                                  : checkResult.readability.failureCategory === 'rotated'
                                  ? 'rotated'
                                  : checkResult.readability.failureCategory === 'too_small'
                                  ? 'too small'
                                  : checkResult.readability.reason || 'blurry'}
                              </span>
                              {onReplaceFile && (
                                <button
                                  type="button"
                                  onClick={onReplaceFile}
                                  className="px-2.5 py-1 rounded-md text-xs font-semibold bg-white text-slate-700 border border-slate-300 hover:bg-slate-100"
                                >
                                  Upload a clearer file
                                </button>
                              )}
                            </div>
                          )}

                          {/* Resolution actions for Check B: Category mismatch */}
                          {row.id === 'document_type' &&
                            mappedDetectedCategory &&
                            mappedDetectedCategory !== selectedCategory &&
                            checkResult.typeConfidence >= 0.6 && (
                              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={handleMoveToDetectedCategory}
                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                                >
                                  Move to {formatSelectedCategoryLabel(mappedDetectedCategory)}
                                </button>
                              </div>
                            )}

                          {/* Resolution actions for Check B: ID Document or Marksheet */}
                          {row.id === 'document_type' &&
                            (checkResult.detectedType === 'id_document' ||
                              checkResult.detectedType === 'marksheet') && (
                              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={onClose}
                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 transition-colors"
                                >
                                  Remove sensitive file now
                                </button>
                                {onReplaceFile && (
                                  <button
                                    type="button"
                                    onClick={onReplaceFile}
                                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-slate-700 border border-slate-300 hover:bg-slate-100"
                                  >
                                    Replace with another file
                                  </button>
                                )}
                              </div>
                            )}

                          {/* Resolution actions for Check B: Job Description */}
                          {row.id === 'document_type' &&
                            checkResult.detectedType === 'job_description' && (
                              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                                {onNavigateToJobMatch && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onClose();
                                      onNavigateToJobMatch(extractedText || checkResult.extractedTextPreview);
                                    }}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                                  >
                                    Open in Jobs → Analyse a job
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={onClose}
                                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-slate-700 border border-slate-300 hover:bg-slate-100"
                                >
                                  Remove file
                                </button>
                              </div>
                            )}

                          {/* Name comparison, matched tokens, and supporting signals for Check C */}
                          {row.id === 'identity_match' && (
                            <div className="mt-2 p-2.5 rounded-md bg-white/90 border border-slate-200/90 space-y-2 text-xs">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                  <div>
                                    <span className="text-[11px] font-medium text-slate-500 mr-1">
                                      Detected on document:
                                    </span>
                                    <span
                                      className={`font-semibold ${
                                        row.status === 'blocking'
                                          ? 'text-rose-700'
                                          : row.status === 'warning'
                                          ? 'text-amber-800'
                                          : 'text-emerald-800'
                                      }`}
                                    >
                                      {checkResult.readability.status === 'unreadable' ||
                                      checkResult.nameMatch === 'unreadable'
                                        ? 'Cannot verify (unreadable)'
                                        : liveIdentityVerification?.conflictingName ||
                                          liveIdentityVerification?.detectedName ||
                                          checkResult.extractedPersonName ||
                                          (liveIdentityVerification &&
                                          liveIdentityVerification.matchedTokens.length > 0
                                            ? liveIdentityVerification.matchedTokens.join(' ')
                                            : 'Not found')}
                                    </span>
                                  </div>
                                  <span className="text-slate-300 font-bold">vs</span>
                                  <div>
                                    <span className="text-[11px] font-medium text-slate-500 mr-1">
                                      Profile:
                                    </span>
                                    <span className="font-semibold text-slate-900">
                                      {profileName || 'Not set'}
                                    </span>
                                  </div>
                                </div>
                                {liveIdentityVerification &&
                                  !liveIdentityVerification.missingProfileName &&
                                  checkResult.readability.status === 'readable' && (
                                    <span
                                      className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border ${
                                        liveIdentityVerification.status === 'PASS'
                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                          : liveIdentityVerification.status === 'WARN'
                                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                                          : 'bg-rose-50 text-rose-700 border-rose-200'
                                      }`}
                                    >
                                      {Math.round(liveIdentityVerification.score * 100)}% token match (
                                      {liveIdentityVerification.matchedTokens.length}/
                                      {liveIdentityVerification.profileTokens.length})
                                    </span>
                                  )}
                              </div>

                              {/* Matched tokens & supporting signals breakdown */}
                              {liveIdentityVerification &&
                                !liveIdentityVerification.missingProfileName &&
                                (liveIdentityVerification.matchedTokens.length > 0 ||
                                  liveIdentityVerification.signals.length > 0) && (
                                  <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
                                    {liveIdentityVerification.matchedTokens.length > 0 && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                                        Matched tokens: {liveIdentityVerification.matchedTokens.join(', ')}
                                      </span>
                                    )}
                                    {liveIdentityVerification.signals.map((sig, idx) => (
                                      <span
                                        key={idx}
                                        className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200"
                                      >
                                        + {sig}
                                      </span>
                                    ))}
                                  </div>
                                )}
                            </div>
                          )}

                          {/* Requirement 7: If the user has no profile name, prompt them to set it before upload */}
                          {row.id === 'identity_match' &&
                            (!profileName || liveIdentityVerification?.missingProfileName) && (
                              <div className="mt-2.5 p-2.5 rounded-lg bg-white border border-rose-200 space-y-2">
                                <label
                                  htmlFor="inline-profile-name-input"
                                  className="block text-xs font-semibold text-slate-800"
                                >
                                  Set your profile full name to verify document ownership:
                                </label>
                                <div className="flex flex-wrap items-center gap-2">
                                  <input
                                    id="inline-profile-name-input"
                                    type="text"
                                    value={pendingProfileNameInput}
                                    onChange={(e) => setPendingProfileNameInput(e.target.value)}
                                    placeholder="Enter your full name (e.g. Nivindharan A)"
                                    className="flex-1 min-w-[200px] px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                  />
                                  <button
                                    type="button"
                                    disabled={!pendingProfileNameInput.trim() || isSavingProfileName}
                                    onClick={handleSaveProfileNameInline}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 transition-colors"
                                  >
                                    {isSavingProfileName
                                      ? 'Saving…'
                                      : 'Save profile name & verify'}
                                  </button>
                                </div>
                              </div>
                            )}

                          {/* Requirement 6 (WARN): Show a "Confirm this is your document" checkbox and allow saving after the user confirms */}
                          {row.id === 'identity_match' && rawNameMatch === 'partial' && (
                            <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                              <label
                                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                                  identityResolution === 'confirmed_mine'
                                    ? 'bg-emerald-50 border-emerald-400 text-emerald-900'
                                    : 'bg-white border-amber-400 text-slate-900 hover:bg-amber-50'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={identityResolution === 'confirmed_mine'}
                                  onChange={(e) =>
                                    setIdentityResolution(
                                      e.target.checked ? 'confirmed_mine' : 'unresolved'
                                    )
                                  }
                                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span>Confirm this is your document</span>
                              </label>
                              <button
                                type="button"
                                onClick={onClose}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
                              >
                                This isn&apos;t mine, remove it
                              </button>
                            </div>
                          )}

                          {/* Requirement 6 (BLOCK): Conflicting name or no signal at all -> Hard Blocked */}
                          {row.id === 'identity_match' &&
                            (rawNameMatch === 'mismatch' || rawNameMatch === 'not_found') &&
                            Boolean(profileName) && (
                              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                                {onReplaceFile && (
                                  <button
                                    type="button"
                                    onClick={onReplaceFile}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                                  >
                                    Upload your own document
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={onClose}
                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 transition-colors"
                                >
                                  Remove file
                                </button>
                              </div>
                            )}

                          {/* Resolution actions for Check D: Filename mismatch or Generic filename */}
                          {row.id === 'filename_vs_content' && (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {checkResult.suggestedRename &&
                                filename !== checkResult.suggestedRename && (
                                  <button
                                    type="button"
                                    onClick={() => setFilename(checkResult.suggestedRename!)}
                                    className="px-2.5 py-1 rounded-md text-xs font-semibold bg-white border border-amber-300 text-amber-900 hover:bg-amber-100"
                                  >
                                    Rename to &ldquo;{checkResult.suggestedRename}&rdquo;
                                  </button>
                                )}
                              {checkResult.needsGenericTitle && userTitle.trim().length < 3 && (
                                <button
                                  type="button"
                                  onClick={() => titleInputRef.current?.focus()}
                                  className="px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700"
                                >
                                  Add a short title
                                </button>
                              )}
                            </div>
                          )}

                          {/* Resolution actions for Check E: Skill Relevance Mismatch */}
                          {row.id === 'skill_relevance' &&
                            (targetSkill || checkResult.targetSkill) &&
                            checkResult.targetSkillMentioned === false && (
                              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                                {checkResult.detectedSkills.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedSkills(checkResult.detectedSkills);
                                      setSkillMismatchResolution('use_detected');
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                      skillMismatchResolution === 'use_detected'
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                    }`}
                                  >
                                    Attach to detected skills instead ({checkResult.detectedSkills.slice(0, 3).join(', ')})
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const tSkill = targetSkill || checkResult.targetSkill!;
                                    if (!selectedSkills.includes(tSkill)) {
                                      setSelectedSkills((prev) => [...prev, tSkill]);
                                    }
                                    setSkillMismatchResolution('attach_anyway');
                                  }}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                    skillMismatchResolution === 'attach_anyway'
                                      ? 'bg-amber-100 border-amber-400 text-amber-900 font-semibold'
                                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                                  }`}
                                >
                                  Attach anyway (marks as Unconfirmed, never Verified)
                                </button>
                              </div>
                            )}

                          {/* Resolution actions for Check G: Duplicate file */}
                          {row.id === 'duplicates_reuse' && checkResult.duplicateOf && (
                            <div className="mt-2.5 flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setLinkExistingAttachmentId(checkResult.duplicateOf?.attachmentId)
                                }
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                  linkExistingAttachmentId
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                }`}
                              >
                                {linkExistingAttachmentId
                                  ? `Linked to existing "${checkResult.duplicateOf.filename}"`
                                  : `Link existing copy ("${checkResult.duplicateOf.filename}")`}
                              </button>
                            </div>
                          )}

                          {/* Resolution details for Check H: Résumé-specific diff & unproven skills */}
                          {row.id === 'resume_specific' && checkResult.resumeMeta && (
                            <div className="mt-2.5 space-y-2">
                              {checkResult.resumeMeta.claimedButUnprovenSkills.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1">
                                  <span className="text-[11px] font-semibold text-slate-600 mr-1">
                                    Claimed but unproven:
                                  </span>
                                  {checkResult.resumeMeta.claimedButUnprovenSkills.map((sk) => (
                                    <span
                                      key={sk}
                                      className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100/80 text-amber-900 border border-amber-200"
                                    >
                                      {sk}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {checkResult.resumeMeta.profileContactDiffers && (
                                <div className="p-2.5 rounded bg-white border border-amber-200 text-xs space-y-1.5">
                                  <p className="text-slate-700 font-medium">
                                    {checkResult.resumeMeta.profileContactDiffDetails}
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setOverwriteProfileResume(true)}
                                      className={`px-2.5 py-1 rounded text-xs font-semibold ${
                                        overwriteProfileResume
                                          ? 'bg-indigo-600 text-white'
                                          : 'bg-slate-100 text-slate-700'
                                      }`}
                                    >
                                      Update profile résumé
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setOverwriteProfileResume(false)}
                                      className={`px-2.5 py-1 rounded text-xs font-semibold ${
                                        !overwriteProfileResume
                                          ? 'bg-slate-800 text-white'
                                          : 'bg-slate-100 text-slate-700'
                                      }`}
                                    >
                                      Keep saved profile details
                                    </button>
                                  </div>
                                </div>
                              )}

                              {checkResult.resumeMeta.conflictsWithExistingResume &&
                                checkResult.resumeMeta.conflictDiffSummary && (
                                  <div className="p-2.5 rounded bg-white border border-amber-200 text-xs space-y-2">
                                    <p className="font-semibold text-slate-800">
                                      Résumé Conflict Diff — Choose which version to keep active:
                                    </p>
                                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                                      <div className="p-2 rounded bg-slate-50 border border-slate-200">
                                        <span className="font-bold text-slate-700 block">
                                          Saved Résumé
                                        </span>
                                        <span className="text-slate-600 block">
                                          Employers:{' '}
                                          {checkResult.resumeMeta.conflictDiffSummary.previousEmployers.join(', ') || 'None'}
                                        </span>
                                        <span className="text-slate-600 block">
                                          Dates:{' '}
                                          {checkResult.resumeMeta.conflictDiffSummary.previousDates.join(', ') || 'None'}
                                        </span>
                                      </div>
                                      <div className="p-2 rounded bg-indigo-50/50 border border-indigo-200">
                                        <span className="font-bold text-indigo-900 block">
                                          New Uploaded Résumé
                                        </span>
                                        <span className="text-indigo-800 block">
                                          Employers:{' '}
                                          {checkResult.resumeMeta.conflictDiffSummary.newEmployers.join(', ') || 'None'}
                                        </span>
                                        <span className="text-indigo-800 block">
                                          Dates:{' '}
                                          {checkResult.resumeMeta.conflictDiffSummary.newDates.join(', ') || 'None'}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setKeepExistingResumeOnConflict(false)}
                                        className={`px-2.5 py-1 rounded text-xs font-semibold ${
                                          !keepExistingResumeOnConflict
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-slate-100 text-slate-700'
                                        }`}
                                      >
                                        Keep New Uploaded Résumé
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setKeepExistingResumeOnConflict(true)}
                                        className={`px-2.5 py-1 rounded text-xs font-semibold ${
                                          keepExistingResumeOnConflict
                                            ? 'bg-slate-800 text-white'
                                            : 'bg-slate-100 text-slate-700'
                                        }`}
                                      >
                                        Keep Saved Résumé
                                      </button>
                                    </div>
                                  </div>
                                )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {errorMsg && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
                  {errorMsg}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer Actions: Primary "Looks right, save", Secondary "Change category", "Replace file", "Cancel" */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => categorySelectRef.current?.focus()}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors"
            >
              Change category
            </button>
            {onReplaceFile && (
              <button
                type="button"
                onClick={onReplaceFile}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                Replace file
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition-colors"
            >
              Cancel
            </button>
          </div>

          <div className="flex items-center gap-3">
            {hasHardBlock && !isRunningCheck && (
              <span className="text-xs font-semibold text-rose-700">
                Blocking issue detected — replace or remove this file
              </span>
            )}
            {!hasHardBlock && needsIdentityConfirmation && !isRunningCheck && (
              <span className="text-xs font-semibold text-amber-800">
                Check &ldquo;Confirm this is your document&rdquo; to enable saving
              </span>
            )}
            <button
              type="button"
              disabled={!canSave}
              onClick={handleSaveConfirmed}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                canSave
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Saving verified evidence…
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Looks right, save
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
