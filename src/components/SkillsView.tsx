import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  AnalysisData,
  EvidenceItem,
  Profile,
  AttachmentItem,
  UploadCheckResult,
  CloseTheGapResult,
  CopilotStructuredResponse,
} from '../types';
import { fetchApi, runUploadCheckOnFile, callAiStructured } from '../api';
import {
  IT_JOB_ROLES,
  FEATURED_COMPANY_JOBS,
  GOVERNMENT_SECTOR_CATALOG,
  identifySkills,
  calculateReadinessScore,
} from '../utils/skillMatcher';
import {
  getSkillStatus,
  getValidEvidenceForSkill,
  getUnconfirmedEvidenceForSkill,
} from '../utils/evidenceModel';
import { GitHubRepoProofModal } from './GitHubRepoProofModal';
import { UploadCheckModal } from './UploadCheckModal';
import { ReadinessGauge } from './ReadinessGauge';
import { ViewerMode } from './InferenceInspectorModal';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Search,
  ChevronDown,
  ChevronUp,
  FileText,
  HelpCircle,
  Plus,
  UploadCloud,
  Github,
  Award,
  ExternalLink,
  X,
  Loader2,
  Sparkles,
  Calendar,
  Share2,
  TrendingUp,
} from 'lucide-react';

interface SkillsViewProps {
  profile: Profile | null;
  analysis: AnalysisData | null;
  analysesList?: AnalysisData[];
  evidence: EvidenceItem[];
  attachments: AttachmentItem[];
  viewerMode?: ViewerMode;
  onSelectAnalysis?: (analysis: AnalysisData) => void;
  onSelectJobForMatch?: (jobDescriptionText: string) => void;
  onOpenProfile?: () => void;
  onInspectSkill?: (skillName: string) => void;
  onOpenReportModal?: () => void;
  onOpenPassportModal?: () => void;
  onRefresh: () => void;
  onNotify: (msg: string) => void;
  onNavigate: (page: string) => void;
}

interface RoleOptionItem {
  id: string;
  group: 'My role' | 'IT roles' | 'Companies' | 'Government exams';
  label: string;
  sublabel: string;
  skills: string[];
  description: string;
}

interface SkillRowItem {
  skill: string;
  status: 'verified' | 'needs_proof' | 'missing';
  importance: 'High' | 'Medium';
  proofs: EvidenceItem[];
  unconfirmedProofs: EvidenceItem[];
}

export const SkillsView: React.FC<SkillsViewProps> = ({
  profile,
  analysis,
  analysesList = [],
  evidence,
  attachments,
  viewerMode = 'jobseeker',
  onSelectAnalysis,
  onInspectSkill,
  onOpenReportModal,
  onOpenPassportModal,
  onRefresh,
  onNotify,
}) => {
  const [selectedRoleId, setSelectedRoleId] = useState<string>('current');
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [roleSearchQuery, setRoleSearchQuery] = useState('');
  const [savedMatchesOpen, setSavedMatchesOpen] = useState(false);
  const [formulaDrawerOpen, setFormulaDrawerOpen] = useState(false);

  // Step 4c: "Close the gap" 7-day proof plan state
  const [generatingCloseGap, setGeneratingCloseGap] = useState(false);
  const [closeGapPlan, setCloseGapPlan] =
    useState<CopilotStructuredResponse<CloseTheGapResult> | null>(null);

  // Collapsible table sections
  const [expandedSections, setExpandedSections] = useState<{
    verified: boolean;
    needs_proof: boolean;
    missing: boolean;
  }>({
    verified: true,
    needs_proof: true,
    missing: true,
  });

  // Add Proof Modal state
  const [addProofSkill, setAddProofSkill] = useState<string | null>(null);
  const [proofTab, setProofTab] = useState<'file' | 'github' | 'certificate'>('github');
  const [proofTitle, setProofTitle] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [savingProof, setSavingProof] = useState(false);

  // Upload Check Modal state for Add Proof file uploads
  const [isUploadCheckOpen, setIsUploadCheckOpen] = useState(false);
  const [isRunningUploadCheck, setIsRunningUploadCheck] = useState(false);
  const [activeCheckResult, setActiveCheckResult] = useState<UploadCheckResult | null>(null);
  const [activeCheckText, setActiveCheckText] = useState<string>('');
  const [activeCheckSkill, setActiveCheckSkill] = useState<string | undefined>(undefined);

  // Step 5: Missing skill 2026 market demand (Tavily + Nebius Fast Model)
  const [demandSkill, setDemandSkill] = useState<string | null>(null);
  const [demandData, setDemandData] = useState<{
    skill: string;
    role: string;
    summary: string;
    sources: Array<{ title: string; url: string }>;
  } | null>(null);
  const [demandLoading, setDemandLoading] = useState(false);
  const [demandError, setDemandError] = useState<string | null>(null);

  const handleCheckSkillDemand = async (skillName: string) => {
    setDemandSkill(skillName);
    setDemandData(null);
    setDemandError(null);
    setDemandLoading(true);
    try {
      const res = await fetchApi<{
        skill: string;
        role: string;
        summary: string;
        sources: Array<{ title: string; url: string }>;
      }>('/skill-demand', {
        method: 'POST',
        body: JSON.stringify({
          skill: skillName,
          role: activeRoleOption?.label || profile?.title || 'Software Engineer',
        }),
      });
      setDemandData(res);
    } catch (err: any) {
      setDemandError(err?.message || 'Could not fetch market demand context.');
    } finally {
      setDemandLoading(false);
    }
  };

  const roleDropdownRef = useRef<HTMLDivElement>(null);
  const savedMatchesRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(e.target as Node)) {
        setRoleDropdownOpen(false);
      }
      if (savedMatchesRef.current && !savedMatchesRef.current.contains(e.target as Node)) {
        setSavedMatchesOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Build grouped searchable role options: My role / IT roles / Companies / Government exams
  const roleOptions: RoleOptionItem[] = useMemo(() => {
    const myRoleTitle = profile?.title || analysis?.jobTitle || 'Software Engineer';
    const myRoleSkills = analysis
      ? Array.from(
          new Set([
            ...(analysis.matchedSkills || []).map((m) => m.skill),
            ...(analysis.unprovenSkills || []).map((u) => u.skill),
            ...(analysis.missingSkills || []).map((m) => m.skill),
          ])
        )
      : identifySkills(
          `${profile?.skills_text || ''} ${profile?.resume_text || ''} React TypeScript JavaScript SQL Git Unit Testing`
        );

    const list: RoleOptionItem[] = [
      {
        id: 'current',
        group: 'My role',
        label: myRoleTitle,
        sublabel: analysis?.company || 'Your active target role',
        skills:
          myRoleSkills.length > 0
            ? myRoleSkills
            : ['React', 'TypeScript', 'JavaScript', 'Node.js', 'SQL', 'Git', 'Unit Testing'],
        description: analysis?.summary || 'Your default target role based on your profile and latest job match.',
      },
    ];

    for (const r of IT_JOB_ROLES) {
      list.push({
        id: `it-${r.id}`,
        group: 'IT roles',
        label: r.title,
        sublabel: r.category,
        skills: r.skills,
        description: r.description,
      });
    }

    for (const j of FEATURED_COMPANY_JOBS) {
      if (j.sector === 'Government & PSU') {
        list.push({
          id: `gov-job-${j.id}`,
          group: 'Government exams',
          label: `${j.company} — ${j.title}`,
          sublabel: j.payScale || 'Government & PSU',
          skills: j.skills,
          description: j.description,
        });
      } else {
        list.push({
          id: `comp-${j.id}`,
          group: 'Companies',
          label: `${j.company} — ${j.title}`,
          sublabel: j.location,
          skills: j.skills,
          description: j.description,
        });
      }
    }

    for (const g of GOVERNMENT_SECTOR_CATALOG) {
      list.push({
        id: `gov-cat-${g.id}`,
        group: 'Government exams',
        label: `${g.shortCode} — ${g.postTitle}`,
        sublabel: g.payScale,
        skills: g.requiredSkills,
        description: `${g.commission} · ${g.selectionStages.join(' → ')}`,
      });
    }

    return list;
  }, [profile, analysis]);

  const activeRoleOption = useMemo(() => {
    return roleOptions.find((o) => o.id === selectedRoleId) || roleOptions[0];
  }, [roleOptions, selectedRoleId]);

  const filteredRoleOptions = useMemo(() => {
    const q = roleSearchQuery.trim().toLowerCase();
    if (!q) return roleOptions;
    return roleOptions.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.sublabel.toLowerCase().includes(q) ||
        o.group.toLowerCase().includes(q) ||
        o.skills.some((s) => s.toLowerCase().includes(q))
    );
  }, [roleOptions, roleSearchQuery]);

  // Candidate's self-declared skills from profile, résumé, and attachments
  const selfDeclaredSkills = useMemo(() => {
    return Array.from(
      new Set([
        ...identifySkills(
          `${profile?.skills_text || ''} ${profile?.resume_text || ''} ${attachments
            .map((a) => a.extracted_text)
            .join(' ')}`
        ),
        ...(profile?.skills_text || '')
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 1 && s.length < 32),
      ])
    );
  }, [profile, attachments]);

  // Build rows for active role
  const skillRows: SkillRowItem[] = useMemo(() => {
    const reqSkills = activeRoleOption.skills;
    const highPrioritySet = new Set([
      'React',
      'TypeScript',
      'Node.js',
      'Python',
      'Java',
      'SQL',
      'System Design',
      'Cybersecurity',
      'Data Structures & Algorithms',
      'Computer Networks',
    ]);

    return reqSkills.map((skill, idx) => {
      const validProofs = getValidEvidenceForSkill(skill, evidence);
      const unconfirmedProofs = getUnconfirmedEvidenceForSkill(skill, evidence);
      const computedStatus = getSkillStatus(skill, {
        evidence,
        profile,
        attachments,
      });

      const importance: 'High' | 'Medium' =
        highPrioritySet.has(skill) || idx < 3 ? 'High' : 'Medium';

      if (computedStatus === 'verified') {
        return {
          skill,
          status: 'verified',
          importance,
          proofs: validProofs,
          unconfirmedProofs,
        };
      }
      if (computedStatus === 'declared' || selfDeclaredSkills.some((s) => s.toLowerCase() === skill.toLowerCase())) {
        return {
          skill,
          status: 'needs_proof',
          importance,
          proofs: validProofs,
          unconfirmedProofs,
        };
      }
      return {
        skill,
        status: 'missing',
        importance,
        proofs: [],
        unconfirmedProofs: [],
      };
    });
  }, [activeRoleOption, evidence, profile, attachments, selfDeclaredSkills]);

  const verifiedRows = skillRows.filter((r) => r.status === 'verified');
  const needsProofRows = skillRows.filter((r) => r.status === 'needs_proof');
  const missingRows = skillRows.filter((r) => r.status === 'missing');

  // Only show Importance column when values differ across skills; otherwise hide it
  const showImportanceColumn = useMemo(() => {
    if (skillRows.length <= 1) return false;
    const first = skillRows[0].importance;
    return skillRows.some((r) => r.importance !== first);
  }, [skillRows]);

  const [simulatedSkills, setSimulatedSkills] = useState<string[]>([]);

  const toggleSimulatedSkill = (skill: string) => {
    setSimulatedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    );
  };

  const readinessMetrics = useMemo(() => {
    return calculateReadinessScore({
      matchedCount: verifiedRows.length + needsProofRows.length,
      totalRequired: Math.max(1, skillRows.length),
      verifiedEvidenceCount: verifiedRows.length,
    });
  }, [verifiedRows.length, needsProofRows.length, skillRows.length]);

  const simulatedReadinessMetrics = useMemo(() => {
    if (simulatedSkills.length === 0) return readinessMetrics;
    const simMissingCount = simulatedSkills.filter((sk) =>
      missingRows.some((m) => m.skill === sk)
    ).length;
    return calculateReadinessScore({
      matchedCount: verifiedRows.length + needsProofRows.length + simMissingCount,
      totalRequired: Math.max(1, skillRows.length),
      verifiedEvidenceCount: verifiedRows.length + simulatedSkills.length,
    });
  }, [simulatedSkills, readinessMetrics, verifiedRows.length, needsProofRows.length, missingRows, skillRows.length]);

  const simulatedDelta = Math.max(0, simulatedReadinessMetrics.score - readinessMetrics.score);

  const openAddProofModal = (skill: string) => {
    setAddProofSkill(skill);
    setProofTab('github');
    setProofTitle(`${skill} — Project Repository`);
    setProofUrl('');
  };

  // Step 4c: "Close the gap" 1-click 7-day proof plan generator (saves tasks to user's account)
  const handleCloseTheGap = async () => {
    setGeneratingCloseGap(true);
    try {
      const res = await callAiStructured<CloseTheGapResult>('close_the_gap', {
        viewerMode,
        targetRole: activeRoleOption.label,
      });
      setCloseGapPlan(res);
      onRefresh();
      onNotify(
        `Generated & saved personalized 7-day proof plan for ${activeRoleOption.label} to your account.`
      );
    } catch {
      onNotify('Could not generate 7-day proof plan right now.');
    } finally {
      setGeneratingCloseGap(false);
    }
  };

  const handleSaveLinkProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addProofSkill || !proofTitle.trim()) return;
    setSavingProof(true);
    try {
      await fetchApi('/evidence', {
        method: 'POST',
        body: JSON.stringify({
          skill: addProofSkill,
          type: proofTab === 'github' ? 'GitHub link' : 'certificate',
          title: proofTitle.trim(),
          url: proofUrl.trim(),
        }),
      });
      setAddProofSkill(null);
      onRefresh();
      onNotify(`Attached proof for ${addProofSkill}.`);
    } catch {
      onNotify('Could not attach proof.');
    } finally {
      setSavingProof(false);
    }
  };

  const handleUploadProofFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !addProofSkill) return;

    const targetSkillForUpload = addProofSkill;
    setUploadingFile(true);
    setActiveCheckSkill(targetSkillForUpload);
    setActiveCheckResult(null);
    setIsRunningUploadCheck(true);
    setIsUploadCheckOpen(true);

    try {
      const res = await runUploadCheckOnFile(file, {
        selectedCategory: proofTab === 'certificate' ? 'certificate' : 'evidence',
        userTitle: proofTitle.trim() || `${targetSkillForUpload} — ${file.name.replace(/\.[^.]+$/, '')}`,
        targetSkill: targetSkillForUpload,
      });
      setActiveCheckResult(res.checkResult);
      setActiveCheckText(res.extractedText || '');
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : 'Upload Check failed.');
      setIsUploadCheckOpen(false);
    } finally {
      setIsRunningUploadCheck(false);
      setUploadingFile(false);
    }
  };

  const groups: Array<'My role' | 'IT roles' | 'Companies' | 'Government exams'> = [
    'My role',
    'IT roles',
    'Companies',
    'Government exams',
  ];

  return (
    <div className="space-y-6" data-viewer-mode={viewerMode}>
      {/* Top Toolbar: Searchable Grouped Role Selector + Saved Matches Dropdown + Report PDF Button */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Searchable Grouped Role Dropdown */}
        <div ref={roleDropdownRef} className="relative w-full lg:max-w-md">
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            Target role or exam
          </label>
          <button
            type="button"
            onClick={() => setRoleDropdownOpen((prev) => !prev)}
            aria-expanded={roleDropdownOpen}
            aria-label="Select target role or exam"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] text-left flex items-center justify-between gap-3 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
          >
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                {activeRoleOption.label}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {activeRoleOption.group} · {activeRoleOption.sublabel}
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
          </button>

          {roleDropdownOpen && (
            <div className="absolute left-0 right-0 mt-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xl z-30 overflow-hidden">
              <div className="p-2.5 border-b border-slate-100 dark:border-slate-800">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={roleSearchQuery}
                    onChange={(e) => setRoleSearchQuery(e.target.value)}
                    placeholder="Search roles, companies, or UPSC/SSC exams…"
                    aria-label="Filter roles"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto p-2 space-y-3">
                {groups.map((groupName) => {
                  const groupItems = filteredRoleOptions.filter((o) => o.group === groupName);
                  if (groupItems.length === 0) return null;
                  return (
                    <div key={groupName}>
                      <div className="px-2.5 py-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                        {groupName}
                      </div>
                      <div className="space-y-0.5">
                        {groupItems.map((item) => {
                          const isSelected = item.id === selectedRoleId;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setSelectedRoleId(item.id);
                                setRoleDropdownOpen(false);
                              }}
                              className={`w-full px-3 py-2 rounded-xl text-left flex items-center justify-between gap-2 text-xs transition cursor-pointer ${
                                isSelected
                                  ? 'bg-[#2563EB]/10 text-[#2563EB] dark:text-[#60A5FA] font-semibold'
                                  : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="truncate">{item.label}</div>
                                <div className="text-[11px] text-slate-400 truncate">
                                  {item.sublabel}
                                </div>
                              </div>
                              <span className="text-[11px] font-mono text-slate-400 shrink-0 tabular-nums">
                                {item.skills.length} skills
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Controls: Saved Matches Dropdown + Secondary Report PDF Button */}
        <div className="flex flex-wrap items-center gap-3 self-start lg:self-end">
          {/* Saved Matches Dropdown */}
          <div ref={savedMatchesRef} className="relative">
            <button
              type="button"
              onClick={() => setSavedMatchesOpen((prev) => !prev)}
              aria-expanded={savedMatchesOpen}
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] hover:border-slate-300 dark:hover:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-2 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
            >
              <span>Saved matches ({analysesList.length})</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {savedMatchesOpen && (
              <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xl p-2 z-30 max-h-72 overflow-y-auto">
                {analysesList.length === 0 ? (
                  <p className="p-3 text-xs text-slate-500 dark:text-slate-400 text-center">
                    No saved job matches yet. Click &ldquo;Match a job&rdquo; in the top bar.
                  </p>
                ) : (
                  analysesList.map((item, idx) => {
                    const dateStr = item.created_at
                      ? new Date(item.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : 'Recent';
                    const displayLabel =
                      (item as AnalysisData & { savedDisplayName?: string }).savedDisplayName ||
                      `${item.company || 'Company'} — ${item.jobTitle || 'Target role'} (${dateStr})`;
                    return (
                      <button
                        key={item.id || idx}
                        type="button"
                        onClick={() => {
                          setSelectedRoleId('current');
                          onSelectAnalysis?.(item);
                          setSavedMatchesOpen(false);
                        }}
                        className="w-full p-2.5 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center justify-between gap-3 cursor-pointer"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {displayLabel}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {item.jobTitle || 'Target role'} · {dateStr}
                          </p>
                        </div>
                        <span className="text-xs font-mono font-bold text-[#2563EB] dark:text-[#60A5FA] tabular-nums shrink-0">
                          {item.readinessScore}%
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Page-level Secondary Buttons: Share Passport & Report PDF */}
          {onOpenPassportModal && (
            <button
              type="button"
              onClick={onOpenPassportModal}
              data-testid="skills-share-passport-btn"
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] hover:border-[#2563EB] text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-2 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
            >
              <Share2 className="w-4 h-4 text-[#2563EB]" />
              <span>Share my Passport</span>
            </button>
          )}

          {onOpenReportModal && (
            <button
              type="button"
              onClick={onOpenReportModal}
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] hover:border-[#2563EB] text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-2 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
            >
              <FileText className="w-4 h-4 text-[#2563EB]" />
              <span>Report PDF</span>
            </button>
          )}
        </div>
      </div>

      {/* Summary Row: Readiness Ring + "X verified · Y need proof · Z missing" + Interactive What-If Simulator */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xs p-6 space-y-5">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
            <ReadinessGauge
              score={simulatedReadinessMetrics.score}
              size={160}
              label="Readiness"
            />
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>
                  {activeRoleOption.group} · {activeRoleOption.sublabel}
                </span>
                {simulatedDelta > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-mono font-bold">
                    +{simulatedDelta}% simulated boost
                  </span>
                )}
              </div>
              <h2 className="font-heading text-lg font-semibold text-slate-900 dark:text-white">
                {activeRoleOption.label}
              </h2>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 tabular-nums">
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  {verifiedRows.length} verified
                </span>
                {' · '}
                <span className="text-amber-600 dark:text-amber-400 font-semibold">
                  {needsProofRows.length} need proof
                </span>
                {' · '}
                <span className="text-red-600 dark:text-red-400 font-semibold">
                  {missingRows.length} missing
                </span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Step 4c: "Close the gap" One-Click AI 7-Day Proof Plan Button */}
            <button
              type="button"
              disabled={generatingCloseGap}
              onClick={handleCloseTheGap}
              data-testid="close-the-gap-btn"
              className="px-4 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold inline-flex items-center gap-2 transition cursor-pointer shadow-xs disabled:opacity-50"
            >
              {generatingCloseGap ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>Close the gap (7-day AI proof plan)</span>
            </button>

            <button
              type="button"
              onClick={() => setFormulaDrawerOpen(true)}
              className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline inline-flex items-center gap-1.5 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-lg px-2 py-1"
            >
              <HelpCircle className="w-4 h-4" />
              <span>How is this scored?</span>
            </button>
          </div>
        </div>

        {/* Step 4c: Generated & Saved 7-Day Proof Plan Panel */}
        {closeGapPlan && (
          <div
            data-testid="close-the-gap-panel"
            className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Grounded in your proof vault · Saved to your account</span>
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-purple-500/10 text-purple-700 dark:text-purple-300 text-xs font-semibold">
                  Model tier: {closeGapPlan.modelTierLabel} ({closeGapPlan.modelId})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCloseGapPlan(null)}
                className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                Hide 7-day plan
              </button>
            </div>

            <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 font-medium">
              {closeGapPlan.data.summary}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {closeGapPlan.data.days.map((d) => (
                <div
                  key={d.day}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex flex-col justify-between space-y-2 text-xs"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 font-mono font-bold text-[#2563EB] dark:text-[#60A5FA]">
                        <Calendar className="w-3 h-3" />
                        Day {d.day}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-[10px] font-semibold">
                        {d.skill}
                      </span>
                    </div>
                    <h4 className="font-bold text-slate-900 dark:text-white leading-snug">
                      {d.title}
                    </h4>
                    <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
                      {d.task}
                    </p>
                  </div>
                  <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                    Proof: {d.proofArtifact}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Interactive What-If Proof Simulator Bar */}
        {(needsProofRows.length > 0 || missingRows.length > 0) && (
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 mr-1">
                Simulate adding proof:
              </span>
              {[...needsProofRows, ...missingRows].slice(0, 6).map((r) => {
                const isSim = simulatedSkills.includes(r.skill);
                return (
                  <button
                    key={r.skill}
                    type="button"
                    onClick={() => toggleSimulatedSkill(r.skill)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                      isSim
                        ? 'bg-[#2563EB] text-white font-semibold shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {isSim ? `✓ ${r.skill}` : `+ ${r.skill}`}
                  </button>
                );
              })}
              {simulatedSkills.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSimulatedSkills([])}
                  className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 ml-1 cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>

            {simulatedSkills.length > 0 && (
              <button
                type="button"
                onClick={() => onInspectSkill?.(simulatedSkills[simulatedSkills.length - 1])}
                className="text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:underline shrink-0 cursor-pointer"
              >
                Generate 2-hr AI task for {simulatedSkills[simulatedSkills.length - 1]} →
              </button>
            )}
          </div>
        )}
      </section>

      {/* Skill Table Grouped into Collapsible Sections: Verified, Needs proof, Missing */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xs overflow-hidden divide-y divide-slate-200 dark:divide-slate-800">
        {(
          [
            {
              key: 'verified' as const,
              title: 'Verified',
              rows: verifiedRows,
              badgeClass:
                'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
              Icon: CheckCircle2,
            },
            {
              key: 'needs_proof' as const,
              title: 'Needs proof',
              rows: needsProofRows,
              badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
              Icon: AlertTriangle,
            },
            {
              key: 'missing' as const,
              title: 'Missing',
              rows: missingRows,
              badgeClass: 'bg-red-500/10 text-red-700 dark:text-red-400',
              Icon: XCircle,
            },
          ] as const
        ).map((group) => {
          const isExpanded = expandedSections[group.key];
          const GroupIcon = group.Icon;

          return (
            <div key={group.key}>
              {/* Section Header */}
              <button
                type="button"
                onClick={() =>
                  setExpandedSections((prev) => ({
                    ...prev,
                    [group.key]: !prev[group.key],
                  }))
                }
                aria-expanded={isExpanded}
                className="w-full px-6 py-4 flex items-center justify-between gap-4 bg-slate-50/60 dark:bg-slate-900/30 hover:bg-slate-100/60 dark:hover:bg-slate-800/40 transition text-left cursor-pointer focus:outline-none"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${group.badgeClass}`}
                  >
                    <GroupIcon className="w-3.5 h-3.5 shrink-0" />
                    <span>{group.title}</span>
                  </span>
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                    {group.rows.length} {group.rows.length === 1 ? 'skill' : 'skills'}
                  </span>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </button>

              {/* Section Table */}
              {isExpanded && (
                <div className="overflow-x-auto">
                  {group.rows.length === 0 ? (
                    <div className="px-6 py-5 text-xs text-slate-500 dark:text-slate-400">
                      No skills in this section.
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                          <th className="py-3 px-6 font-medium">Skill</th>
                          {showImportanceColumn && (
                            <th className="py-3 px-4 font-medium">Importance</th>
                          )}
                          <th className="py-3 px-4 font-medium">Evidence</th>
                          <th className="py-3 px-4 font-medium">Status</th>
                          <th className="py-3 px-6 font-medium text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                        {group.rows.map((row) => (
                          <tr
                            key={row.skill}
                            className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition"
                          >
                            {/* Skill */}
                            <td className="py-3.5 px-6 font-semibold text-slate-900 dark:text-white">
                              <button
                                type="button"
                                onClick={() => onInspectSkill?.(row.skill)}
                                title="Open skill evidence & 2-hour proof task drawer"
                                className="hover:text-[#2563EB] dark:hover:text-[#60A5FA] transition text-left cursor-pointer"
                              >
                                {row.skill}
                              </button>
                            </td>

                            {/* Importance (Only rendered if values differ) */}
                            {showImportanceColumn && (
                              <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-400">
                                {row.importance}
                              </td>
                            )}

                            {/* Evidence */}
                            <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-300">
                              {row.proofs.length > 0 ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  {row.proofs.map((p) => (
                                    <span
                                      key={p.id}
                                      className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-200"
                                    >
                                      <span className="truncate max-w-[220px]">{p.title}</span>
                                      {p.url && (
                                        <a
                                          href={p.url}
                                          target="_blank"
                                          rel="noreferrer"
                                          aria-label={`Open ${p.title}`}
                                          className="text-[#2563EB] hover:underline"
                                        >
                                          <ExternalLink className="w-3 h-3" />
                                        </a>
                                      )}
                                    </span>
                                  ))}
                                </div>
                              ) : row.unconfirmedProofs.length > 0 ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-semibold">
                                    <AlertTriangle className="w-3 h-3 text-amber-700" />
                                    Unconfirmed evidence
                                  </span>
                                  <span className="text-slate-600 truncate max-w-[180px]">
                                    {row.unconfirmedProofs[0].title}
                                  </span>
                                </div>
                              ) : row.status === 'needs_proof' ? (
                                <span className="text-slate-400 dark:text-slate-500">
                                  Self-declared in résumé (no proof attached)
                                </span>
                              ) : (
                                <span className="text-slate-400 dark:text-slate-500">
                                  No evidence attached
                                </span>
                              )}
                            </td>

                            {/* Status Pill (Consistent size, Icon + Text) */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              {row.status === 'verified' ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
                                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                  <span>Verified</span>
                                </span>
                              ) : row.status === 'needs_proof' ? (
                                <div className="inline-flex items-center gap-1.5">
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-semibold">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                    <span>Needs proof (Declared)</span>
                                  </span>
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 text-red-700 dark:text-red-400 text-xs font-semibold">
                                  <XCircle className="w-3.5 h-3.5 shrink-0" />
                                  <span>Missing</span>
                                </span>
                              )}
                            </td>

                            {/* Action: Single "Add proof" button + "Market demand" if missing */}
                            <td className="py-3.5 px-6 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-2">
                                {row.status === 'missing' && (
                                  <button
                                    type="button"
                                    onClick={() => handleCheckSkillDemand(row.skill)}
                                    title={`View 2026 hiring demand and market context for ${row.skill} via Tavily`}
                                    className="px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 text-[#2563EB] dark:text-[#60A5FA] text-xs font-semibold inline-flex items-center gap-1 transition cursor-pointer"
                                  >
                                    <TrendingUp className="w-3.5 h-3.5" />
                                    <span>Market demand</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => openAddProofModal(row.skill)}
                                  title={`Upload a file, link a GitHub repository, or attach a certificate for ${row.skill}`}
                                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[#2563EB] text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                                >
                                  <Plus className="w-3.5 h-3.5 text-[#2563EB]" />
                                  <span>Add proof</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* Slide-Over Drawer: Skill 2026 Market Demand via Tavily + Nebius Fast Model */}
      {demandSkill && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDemandSkill(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="market-demand-title"
            className="w-full max-w-md bg-white dark:bg-[#181B1E] h-full border-l border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between overflow-y-auto shadow-2xl space-y-6"
          >
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-[#2563EB] dark:text-[#60A5FA] flex items-center justify-center">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <div>
                    <h3
                      id="market-demand-title"
                      className="font-heading text-base font-semibold text-slate-900 dark:text-white"
                    >
                      {demandSkill}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      2026 Market Demand & Trends
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDemandSkill(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {demandLoading ? (
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                  <Loader2 className="w-6 h-6 text-[#2563EB] animate-spin" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Searching 2026 live hiring data via Tavily & summarizing with Nebius…
                  </p>
                </div>
              ) : demandError ? (
                <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-300">
                  {demandError}
                </div>
              ) : demandData ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20 p-4 space-y-2">
                    <div className="text-[11px] font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Live Market Demand (Tavily + Nebius Fast)</span>
                    </div>
                    <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                      {demandData.summary}
                    </p>
                  </div>

                  {demandData.sources && demandData.sources.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                        Verified Web Sources:
                      </span>
                      <div className="space-y-1.5">
                        {demandData.sources.map((src, idx) => (
                          <a
                            key={idx}
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-[#2563EB] bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between text-xs text-slate-700 dark:text-slate-200 transition"
                          >
                            <span className="truncate max-w-[270px] font-medium">{src.title || src.url}</span>
                            <ExternalLink className="w-3 h-3 text-[#2563EB] shrink-0 ml-2" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  const s = demandSkill;
                  setDemandSkill(null);
                  if (s) openAddProofModal(s);
                }}
                className="w-full py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold transition cursor-pointer"
              >
                Add Proof for {demandSkill}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slide-Over Drawer: "How is this scored?" Formula */}
      {formulaDrawerOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) setFormulaDrawerOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="scoring-formula-title"
            className="w-full max-w-md bg-white dark:bg-[#181B1E] h-full border-l border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between overflow-y-auto shadow-2xl"
          >
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                <h3
                  id="scoring-formula-title"
                  className="font-heading text-lg font-semibold text-slate-900 dark:text-white"
                >
                  How your readiness score is calculated
                </h3>
                <button
                  type="button"
                  onClick={() => setFormulaDrawerOpen(false)}
                  aria-label="Close scoring drawer"
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-sm text-slate-600 dark:text-slate-300 leading-[22px]">
                ApplyWise prioritizes verifiable proof over self-declared résumé claims. A skill is only marked <strong className="font-semibold text-emerald-600 dark:text-emerald-400">Verified</strong> when you attach a repository link, certificate, or project file.
              </p>

              <div className="space-y-4 divide-y divide-slate-100 dark:divide-slate-800">
                <div className="pt-3">
                  <div className="flex items-center justify-between text-sm font-semibold text-slate-900 dark:text-white">
                    <span>1. Skill coverage</span>
                    <span className="font-mono tabular-nums">{readinessMetrics.skillMatch}% (Weight: 55%)</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Percentage of required target role skills found in your profile or proof vault.
                  </p>
                </div>

                <div className="pt-3">
                  <div className="flex items-center justify-between text-sm font-semibold text-slate-900 dark:text-white">
                    <span>2. Proof strength</span>
                    <span className="font-mono tabular-nums">{readinessMetrics.evidenceStrength}% (Weight: 30%)</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Ratio of skills backed by concrete repositories, live deployments, or certificates.
                  </p>
                </div>

                <div className="pt-3">
                  <div className="flex items-center justify-between text-sm font-semibold text-slate-900 dark:text-white">
                    <span>3. Role alignment</span>
                    <span className="font-mono tabular-nums">{readinessMetrics.experienceRelevance}% (Weight: 15%)</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Alignment of your project artifacts with the target role’s core deliverables.
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setFormulaDrawerOpen(false)}
              className="w-full py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold transition cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Modal: Add Proof (Upload file / Link GitHub / Link certificate) */}
      {addProofSkill && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAddProofSkill(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-proof-modal-title"
            className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xl p-6 space-y-5"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3
                  id="add-proof-modal-title"
                  className="font-heading text-lg font-semibold text-slate-900 dark:text-white"
                >
                  Add proof for {addProofSkill}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Attach a file, GitHub repository, or certificate to verify this skill.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddProofSkill(null)}
                aria-label="Close modal"
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 3 Mode Tabs: Link GitHub | Link certificate | Upload file */}
            <div className="grid grid-cols-3 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => {
                  setProofTab('github');
                  setProofTitle(`${addProofSkill} — GitHub Repository`);
                }}
                className={`py-2 px-3 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  proofTab === 'github'
                    ? 'bg-white dark:bg-[#181B1E] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Github className="w-3.5 h-3.5" />
                <span>Link GitHub</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setProofTab('certificate');
                  setProofTitle(`${addProofSkill} — Verified Certificate`);
                }}
                className={`py-2 px-3 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  proofTab === 'certificate'
                    ? 'bg-white dark:bg-[#181B1E] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Award className="w-3.5 h-3.5" />
                <span>Certificate</span>
              </button>
              <button
                type="button"
                onClick={() => setProofTab('file')}
                className={`py-2 px-3 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  proofTab === 'file'
                    ? 'bg-white dark:bg-[#181B1E] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Upload file</span>
              </button>
            </div>

            {proofTab === 'file' ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Proof title
                  </label>
                  <input
                    type="text"
                    value={proofTitle}
                    onChange={(e) => setProofTitle(e.target.value)}
                    placeholder={`${addProofSkill} project or certificate`}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#14171A] text-sm text-slate-900 dark:text-white focus:outline-none focus:border-[#2563EB]"
                  />
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,.rtf,.jpg,.jpeg,.png,.webp"
                  onChange={handleUploadProofFile}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={uploadingFile}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-8 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-[#2563EB] flex flex-col items-center justify-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200 transition cursor-pointer"
                >
                  {uploadingFile ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin text-[#2563EB]" />
                      <span>Uploading and linking file…</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-6 h-6 text-[#2563EB]" />
                      <span>Choose PDF, DOCX, or image file</span>
                      <span className="text-xs font-normal text-slate-400">Max 4 MB</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSaveLinkProof} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Proof title
                  </label>
                  <input
                    type="text"
                    required
                    value={proofTitle}
                    onChange={(e) => setProofTitle(e.target.value)}
                    placeholder={
                      proofTab === 'github'
                        ? `${addProofSkill} — GitHub Repository`
                        : `${addProofSkill} — Certificate`
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#14171A] text-sm text-slate-900 dark:text-white focus:outline-none focus:border-[#2563EB]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    {proofTab === 'github' ? 'Repository or live demo URL' : 'Certificate verification URL'}
                  </label>
                  <input
                    type="url"
                    required
                    value={proofUrl}
                    onChange={(e) => setProofUrl(e.target.value)}
                    placeholder={
                      proofTab === 'github'
                        ? 'https://github.com/username/project'
                        : 'https://coursera.org/verify/...'
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#14171A] text-sm text-slate-900 dark:text-white focus:outline-none focus:border-[#2563EB]"
                  />
                </div>
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      const sk = addProofSkill;
                      setAddProofSkill(null);
                      if (sk) onInspectSkill?.(sk);
                    }}
                    className="text-xs font-semibold text-[#2563EB] hover:underline cursor-pointer"
                  >
                    Need a 2-hour mini-project idea?
                  </button>
                  <button
                    type="submit"
                    disabled={savingProof}
                    className="px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                  >
                    {savingProof ? 'Saving…' : 'Save proof'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Upload Check Modal for Add Proof File Uploads */}
      <UploadCheckModal
        isOpen={isUploadCheckOpen}
        isRunningCheck={isRunningUploadCheck}
        checkResult={activeCheckResult}
        extractedText={activeCheckText}
        profile={profile}
        targetSkill={activeCheckSkill}
        onClose={() => setIsUploadCheckOpen(false)}
        onReplaceFile={() => {
          setIsUploadCheckOpen(false);
          fileInputRef.current?.click();
        }}
        onConfirmed={({ checkResult, createdEvidence }) => {
          setIsUploadCheckOpen(false);
          setAddProofSkill(null);
          onRefresh();
          onNotify(
            `Saved "${checkResult.userTitle || checkResult.filename}" (${checkResult.trust} trust)${
              createdEvidence.length > 0
                ? ` for ${createdEvidence.map((e) => e.skill).join(', ')}`
                : ''
            }.`
          );
        }}
      />
    </div>
  );
};
