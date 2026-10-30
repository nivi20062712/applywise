import React, { useState, useEffect, useMemo } from 'react';
import { fetchApi } from '../api';
import {
  JobResponse,
  JobCard,
  Profile,
  EvidenceItem,
  AnalysisData,
  AttachmentItem,
} from '../types';
import { GOVERNMENT_SECTOR_CATALOG } from '../utils/skillMatcher';
import { getSkillStatus, SkillStatusContext } from '../utils/evidenceModel';
import { ViewerMode } from './InferenceInspectorModal';
import { MatchView } from './MatchView';
import {
  Search,
  MapPin,
  Bookmark,
  Check,
  Loader2,
  X,
  ExternalLink,
  Sparkles,
} from 'lucide-react';

interface JobOffersViewProps {
  profile?: Profile | null;
  evidence?: EvidenceItem[];
  attachments?: AttachmentItem[];
  analysis?: AnalysisData | null;
  analysesList?: AnalysisData[];
  selectedJob?: string;
  selectedModelId?: string;
  viewerMode?: ViewerMode;
  onSelectJobForMatch: (jobDescriptionText: string) => void;
  onAnalysisDone?: (analysis: AnalysisData, targetPage?: string) => void;
  onInspectSkill?: (skillName: string) => void;
  onRefresh?: () => void;
  onNotify?: (msg: string) => void;
  onNavigate: (page: string) => void;
}

const COMPANY_OPTIONS = [
  { id: 'all', label: 'All companies' },
  { id: 'google', label: 'Google' },
  { id: 'microsoft', label: 'Microsoft' },
  { id: 'oracle', label: 'Oracle' },
  { id: 'zoho', label: 'Zoho' },
  { id: 'amazon', label: 'Amazon' },
  { id: 'tcs', label: 'TCS' },
  { id: 'infosys', label: 'Infosys' },
  { id: 'cisco', label: 'Cisco' },
  { id: 'salesforce', label: 'Salesforce' },
  { id: 'adobe', label: 'Adobe' },
  { id: 'ibm', label: 'IBM' },
  { id: 'flipkart', label: 'Flipkart' },
  { id: 'upsc', label: 'UPSC' },
  { id: 'ssc', label: 'SSC' },
  { id: 'isro', label: 'ISRO' },
  { id: 'drdo', label: 'DRDO' },
  { id: 'nic', label: 'NIC' },
  { id: 'rbi', label: 'RBI' },
];

const ROLE_EXAM_OPTIONS = [
  'All roles & exams',
  'Software Engineer',
  'Full Stack',
  'Frontend',
  'Backend',
  'Cloud & DevOps',
  'UPSC',
  'SSC CGL',
  'ISRO Scientist',
  'DRDO Scientist',
  'NIC Scientist',
];

const TECH_OPTIONS = [
  'All tech',
  'React',
  'TypeScript',
  'Node.js',
  'Python',
  'Java',
  'SQL',
  'Docker',
  'AWS',
  'Cybersecurity',
  'System Design',
];

export const JobOffersView: React.FC<JobOffersViewProps> = ({
  profile = null,
  evidence = [],
  attachments = [],
  analysis,
  analysesList = [],
  selectedJob = '',
  selectedModelId,
  viewerMode = 'jobseeker',
  onSelectJobForMatch,
  onAnalysisDone,
  onInspectSkill,
  onRefresh,
  onNotify,
  onNavigate,
}) => {
  const [roleQuery, setRoleQuery] = useState('software developer');
  const [locationQuery, setLocationQuery] = useState('');

  // ONE Filter Panel: Sector | Company | Role/Exam | Tech
  const [sectorFilter, setSectorFilter] = useState<'all' | 'private' | 'government'>('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [roleExamFilter, setRoleExamFilter] = useState('All roles & exams');
  const [techFilter, setTechFilter] = useState('All tech');

  // Tab switch: Private enterprise roles vs Government roles vs Analyse a job tab
  const [activeTab, setActiveTab] = useState<'private' | 'government' | 'analyse'>('private');

  const [data, setData] = useState<JobResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingJobId, setSavingJobId] = useState<string | null>(null);
  const [savedJobIds, setSavedJobIds] = useState<string[]>([]);

  const statusContext = useMemo<SkillStatusContext>(
    () => ({
      evidence,
      profile,
      attachments,
    }),
    [evidence, profile, attachments]
  );

  const fetchJobs = async (q = roleQuery, loc = locationQuery, comp = companyFilter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        query: q,
        location: loc,
        company: comp,
      });
      const res = await fetchApi<JobResponse>(`/jobs?${params}`);
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs(roleQuery, locationQuery, companyFilter);
  }, [companyFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchJobs(roleQuery, locationQuery, companyFilter);
  };

  const handleClearAllFilters = () => {
    setSectorFilter('all');
    setCompanyFilter('all');
    setRoleExamFilter('All roles & exams');
    setTechFilter('All tech');
    setRoleQuery('software developer');
    setLocationQuery('');
    fetchJobs('software developer', '', 'all');
  };

  // Sync tab when Sector dropdown changes
  const handleSectorChange = (val: 'all' | 'private' | 'government') => {
    setSectorFilter(val);
    if (val === 'government') setActiveTab('government');
    if (val === 'private') setActiveTab('private');
  };

  // Compute match % against user's verified skills and top missing skills using getSkillStatus
  const evaluateJobMatch = (requiredSkills: string[]) => {
    if (!requiredSkills || requiredSkills.length === 0) {
      return { matchPercent: 50, missingSkills: [] as string[] };
    }
    const verifiedMatches = requiredSkills.filter(
      (sk) => getSkillStatus(sk, statusContext) === 'verified'
    );
    const missing = requiredSkills.filter(
      (sk) => getSkillStatus(sk, statusContext) !== 'verified'
    );
    const pct = Math.round((verifiedMatches.length / requiredSkills.length) * 100);
    return {
      matchPercent: pct,
      missingSkills: missing,
    };
  };

  // Filter jobs client-side by Sector, Role/Exam, and Tech
  const filteredJobs = useMemo(() => {
    const rawJobs = data?.jobs || [];
    return rawJobs.filter((job) => {
      const isGov = job.sector === 'Government & PSU';
      if (sectorFilter === 'private' && isGov) return false;
      if (sectorFilter === 'government' && !isGov) return false;

      if (roleExamFilter !== 'All roles & exams') {
        const needle = roleExamFilter.toLowerCase();
        const hay = `${job.title} ${job.company} ${job.description}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }

      if (techFilter !== 'All tech') {
        const hasTech = (job.skills || []).some(
          (s) => s.toLowerCase() === techFilter.toLowerCase()
        );
        if (!hasTech) return false;
      }

      return true;
    });
  }, [data, sectorFilter, roleExamFilter, techFilter]);

  const privateJobs = filteredJobs.filter((j) => j.sector !== 'Government & PSU');
  const governmentJobs = filteredJobs.filter((j) => j.sector === 'Government & PSU');

  // Active filter chips
  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onClear: () => void }> = [];
    if (sectorFilter !== 'all') {
      chips.push({
        key: 'sector',
        label: `Sector: ${sectorFilter === 'private' ? 'Private' : 'Government'}`,
        onClear: () => setSectorFilter('all'),
      });
    }
    if (companyFilter !== 'all') {
      const compLabel =
        COMPANY_OPTIONS.find((c) => c.id === companyFilter)?.label || companyFilter;
      chips.push({
        key: 'company',
        label: `Company: ${compLabel}`,
        onClear: () => setCompanyFilter('all'),
      });
    }
    if (roleExamFilter !== 'All roles & exams') {
      chips.push({
        key: 'role',
        label: `Role/Exam: ${roleExamFilter}`,
        onClear: () => setRoleExamFilter('All roles & exams'),
      });
    }
    if (techFilter !== 'All tech') {
      chips.push({
        key: 'tech',
        label: `Tech: ${techFilter}`,
        onClear: () => setTechFilter('All tech'),
      });
    }
    return chips;
  }, [sectorFilter, companyFilter, roleExamFilter, techFilter]);

  const handleSaveJobToApplications = async (job: JobCard) => {
    setSavingJobId(job.id);
    try {
      await fetchApi('/applications', {
        method: 'POST',
        body: JSON.stringify({
          company: job.company,
          job_title: job.title,
          job_description: job.description,
          status: 'Saved',
          application_date: new Date().toISOString().slice(0, 10),
          notes: `Matched via Jobs (${evaluateJobMatch(job.skills).matchPercent}% verified skill match)`,
          analysis_id: analysis?.id || null,
        }),
      });
      setSavedJobIds((prev) => Array.from(new Set([...prev, job.id])));
      onRefresh?.();
      onNotify?.(`Saved "${job.title}" at ${job.company} to Applications.`);
    } catch {
      onNotify?.('Could not save job to Applications.');
    } finally {
      setSavingJobId(null);
    }
  };

  const handleMatchJob = (job: JobCard) => {
    const formatted = `${job.title} at ${job.company}\nLocation: ${job.location}\n\nJob Description:\n${job.description}\n\nRequired Skills:\n${(job.skills || []).join(', ')}`;
    onSelectJobForMatch(formatted);
    onNavigate('match');
  };

  const trends = data?.trends || [];

  return (
    <div className="space-y-6" data-viewer-mode={viewerMode}>
      {/* Top Tabs inside Jobs: Private enterprise | Government & PSU | Analyse a job */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => setActiveTab('private')}
            className={`pb-3 text-sm font-semibold border-b-2 transition cursor-pointer ${
              activeTab === 'private'
                ? 'border-[#2563EB] text-[#2563EB] dark:text-[#60A5FA]'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Private enterprise ({privateJobs.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('government')}
            className={`pb-3 text-sm font-semibold border-b-2 transition cursor-pointer ${
              activeTab === 'government'
                ? 'border-[#2563EB] text-[#2563EB] dark:text-[#60A5FA]'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Government & PSU ({governmentJobs.length + GOVERNMENT_SECTOR_CATALOG.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('analyse')}
            className={`pb-3 text-sm font-semibold border-b-2 transition cursor-pointer inline-flex items-center gap-1.5 ${
              activeTab === 'analyse'
                ? 'border-[#2563EB] text-[#2563EB] dark:text-[#60A5FA]'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Analyse a job</span>
          </button>
        </div>
      </div>

      {activeTab === 'analyse' ? (
        <MatchView
          profile={profile}
          evidence={evidence}
          attachments={attachments}
          analysis={analysis}
          analysesList={analysesList}
          selectedJob={selectedJob}
          selectedModelId={selectedModelId}
          onAnalysisDone={(newAnalysis, targetPage) => {
            onAnalysisDone?.(newAnalysis, targetPage);
          }}
          onRefreshAttachments={() => onRefresh?.()}
          onNavigate={onNavigate}
          onInspectSkill={onInspectSkill}
          onNotify={onNotify}
        />
      ) : (
        <>
          {/* Search Bar (Role, Location) + ONE Filter Panel (Sector, Company, Role/Exam, Tech) */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xs p-6 space-y-4">
            {/* Search Row */}
            <form
              onSubmit={handleSearchSubmit}
              className="grid grid-cols-1 md:grid-cols-12 gap-3"
            >
              <div className="md:col-span-6 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={roleQuery}
                  onChange={(e) => setRoleQuery(e.target.value)}
                  placeholder="Role, title, or keyword (e.g. Full Stack, UPSC, React)…"
                  aria-label="Search role or keyword"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="md:col-span-4 relative">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={locationQuery}
                  onChange={(e) => setLocationQuery(e.target.value)}
                  placeholder="Location (e.g. Bengaluru, Remote, All-India)…"
                  aria-label="Location filter"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-full min-h-[42px] px-4 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold transition cursor-pointer inline-flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Search</span>}
                </button>
              </div>
            </form>

            {/* ONE Unified Filter Panel: Sector | Company | Role/Exam | Tech + Clear all */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 flex-1">
                {/* 1. Sector Dropdown */}
                <select
                  aria-label="Filter by sector"
                  value={sectorFilter}
                  onChange={(e) =>
                    handleSectorChange(e.target.value as 'all' | 'private' | 'government')
                  }
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#14171A] text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:border-[#2563EB]"
                >
                  <option value="all">Sector: All</option>
                  <option value="private">Sector: Private</option>
                  <option value="government">Sector: Government</option>
                </select>

                {/* 2. Company Dropdown */}
                <select
                  aria-label="Filter by company"
                  value={companyFilter}
                  onChange={(e) => setCompanyFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#14171A] text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:border-[#2563EB]"
                >
                  {COMPANY_OPTIONS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>

                {/* 3. Role / Exam Dropdown */}
                <select
                  aria-label="Filter by role or exam"
                  value={roleExamFilter}
                  onChange={(e) => setRoleExamFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#14171A] text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:border-[#2563EB]"
                >
                  {ROLE_EXAM_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>

                {/* 4. Tech Dropdown */}
                <select
                  aria-label="Filter by technology"
                  value={techFilter}
                  onChange={(e) => setTechFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#14171A] text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:border-[#2563EB]"
                >
                  {TECH_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleClearAllFilters}
                className="text-xs font-semibold text-slate-500 hover:text-[#2563EB] dark:text-slate-400 dark:hover:text-[#60A5FA] whitespace-nowrap cursor-pointer self-end lg:self-center"
              >
                Clear all
              </button>
            </div>

            {/* Active Filter Chips */}
            {activeFilterChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {activeFilterChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={chip.onClear}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#2563EB]/10 text-[#2563EB] dark:text-[#60A5FA] text-xs font-medium cursor-pointer"
                  >
                    <span>{chip.label}</span>
                    <X className="w-3 h-3" />
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Main Content Split: Job Results (Left 8 cols) + Live Skill Demand Horizontal Bars (Right 4 cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 space-y-4">
              {activeTab === 'private' ? (
                /* Private Enterprise Job Cards */
                privateJobs.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] p-8 text-center text-sm text-slate-500">
                    No private enterprise jobs match your current filters. Click &ldquo;Clear all&rdquo; above.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {privateJobs.map((job) => {
                      const { matchPercent, missingSkills } = evaluateJobMatch(job.skills);
                      const isSaved = savedJobIds.includes(job.id);
                      const isSaving = savingJobId === job.id;

                      return (
                        <div
                          key={job.id}
                          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xs p-5 space-y-3"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                                    {job.company}
                                  </span>
                                  {' · '}
                                  <span>{job.location}</span>
                                </div>
                                {(job.source === 'Live · Tavily' || job.badge === 'Live · Tavily') && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-400 text-[11px] font-semibold">
                                    <Sparkles className="w-3 h-3 text-[#2563EB]" />
                                    Live web results via Tavily
                                  </span>
                                )}
                                {job.url && (
                                  <a
                                    href={job.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] text-[#2563EB] dark:text-[#60A5FA] hover:underline"
                                    title="Open original job posting"
                                  >
                                    <span>Source</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </div>
                              <h3 className="font-heading text-base font-semibold text-slate-900 dark:text-white">
                                {job.title}
                              </h3>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs font-mono font-bold text-[#2563EB] dark:text-[#60A5FA] tabular-nums">
                                {matchPercent}% verified match
                              </span>
                            </div>
                          </div>

                          <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                            {job.description}
                          </p>

                          {/* Top Missing Skills + Save / Match Actions */}
                          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {missingSkills.length > 0 ? (
                                <>
                                  Missing proof:{' '}
                                  <span className="font-medium text-slate-800 dark:text-slate-200">
                                    {missingSkills.slice(0, 4).join(' · ')}
                                  </span>
                                </>
                              ) : (
                                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                  All required skills verified in your Proof Vault
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                disabled={isSaving || isSaved}
                                onClick={() => handleSaveJobToApplications(job)}
                                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[#2563EB] text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-60"
                              >
                                {isSaved ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Saved</span>
                                  </>
                                ) : (
                                  <>
                                    <Bookmark className="w-3.5 h-3.5" />
                                    <span>{isSaving ? 'Saving…' : 'Save'}</span>
                                  </>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleMatchJob(job)}
                                className="px-3.5 py-1.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold transition cursor-pointer"
                              >
                                Match
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
                /* Government Roles Tab: Pay Scale, Eligibility, Exam Stages in a Consistent Compact Layout */
                <div className="space-y-3">
                  {GOVERNMENT_SECTOR_CATALOG.map((gov) => {
                    const { matchPercent, missingSkills } = evaluateJobMatch(gov.requiredSkills);
                    const jobCardEquivalent: JobCard = {
                      id: `gov-${gov.id}`,
                      title: `${gov.shortCode} — ${gov.postTitle}`,
                      company: gov.commission,
                      location: 'All-India Cadre',
                      created: 'Official Notification',
                      url: gov.officialPortalUrl,
                      description: `${gov.postTitle} at ${gov.commission}. Pay Scale: ${gov.payScale}. Eligibility: ${gov.eligibility}. Selection stages: ${gov.selectionStages.join(' -> ')}.`,
                      skills: gov.requiredSkills,
                      sector: 'Government & PSU',
                      payScale: gov.payScale,
                      eligibility: gov.eligibility,
                      selectionStages: gov.selectionStages,
                    };
                    const isSaved = savedJobIds.includes(jobCardEquivalent.id);

                    return (
                      <div
                        key={gov.id}
                        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xs p-5 space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                          <div>
                            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {gov.shortCode}
                              </span>
                              {' · '}
                              <span>{gov.commission}</span>
                            </div>
                            <h3 className="font-heading text-base font-semibold text-slate-900 dark:text-white mt-0.5">
                              {gov.postTitle}
                            </h3>
                          </div>

                          <span className="text-xs font-mono font-bold text-[#2563EB] dark:text-[#60A5FA] tabular-nums shrink-0">
                            {matchPercent}% verified match
                          </span>
                        </div>

                        {/* Consistent Compact Grid: Pay scale | Eligibility | Exam stages */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-2.5 border-y border-slate-100 dark:border-slate-800 text-xs">
                          <div>
                            <span className="text-slate-400 dark:text-slate-500 block">
                              Pay scale (Indicative)
                            </span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
                              {gov.payScale}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 dark:text-slate-500 block">
                              Eligibility
                            </span>
                            <span className="font-medium text-slate-800 dark:text-slate-200">
                              {gov.eligibility}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 dark:text-slate-500 block">
                              Exam stages
                            </span>
                            <span className="font-medium text-slate-800 dark:text-slate-200">
                              {gov.selectionStages.join(' → ')}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            Top missing:{' '}
                            <span className="font-medium text-slate-800 dark:text-slate-200">
                              {missingSkills.slice(0, 3).join(' · ') || 'None'}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <a
                              href={gov.officialPortalUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2.5 py-1.5 rounded-xl text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white inline-flex items-center gap-1"
                            >
                              <span>Portal</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                            <button
                              type="button"
                              disabled={isSaved}
                              onClick={() => handleSaveJobToApplications(jobCardEquivalent)}
                              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[#2563EB] text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 transition cursor-pointer"
                            >
                              <Bookmark className="w-3.5 h-3.5" />
                              <span>{isSaved ? 'Saved' : 'Save'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMatchJob(jobCardEquivalent)}
                              className="px-3.5 py-1.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold transition cursor-pointer"
                            >
                              Match
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right 4 Cols: "Live skill demand" Card with Horizontal Bars (High Contrast on Dark Backgrounds) */}
            <aside className="lg:col-span-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xs p-6 space-y-4">
              <div>
                <h3 className="font-heading text-lg font-semibold text-slate-900 dark:text-white">
                  Live skill demand
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  Frequency across {data?.jobs?.length || filteredJobs.length || 30} analyzed roles
                </p>
              </div>

              <div className="space-y-3.5">
                {trends.slice(0, 10).map((t) => {
                  const isVerified = getSkillStatus(t.skill, statusContext) === 'verified';
                  return (
                    <div key={t.skill} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                          <span>{t.skill}</span>
                          {isVerified && (
                            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                              · Verified
                            </span>
                          )}
                        </span>
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                          {t.share}% ({t.count})
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isVerified ? 'bg-emerald-600 dark:bg-emerald-500' : 'bg-[#2563EB]'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(6, t.share))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
};
