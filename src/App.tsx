import React, { useState, useEffect, useRef } from 'react';
import {
  User,
  Profile,
  EvidenceItem,
  AnalysisData,
  ApplicationItem,
  AttachmentItem,
  AIProviderStatus,
} from './types';
import { fetchApi } from './api';
import { setGlobalSkillContext } from './utils/evidenceModel';
import { Sidebar } from './components/Sidebar';
import { AuthView } from './components/AuthView';
import { ProfileModal } from './components/ProfileModal';
import { OverviewView } from './components/OverviewView';
import { MatchView } from './components/MatchView';
import { JobOffersView } from './components/JobOffersView';
import { SkillsView } from './components/SkillsView';
import { AttachmentsView } from './components/AttachmentsView';
import { CareerRoadmapView } from './components/CareerRoadmapView';
import { ResumeView } from './components/ResumeView';
import { ApplicationsView } from './components/ApplicationsView';
import { InferenceInspectorModal, ViewerMode } from './components/InferenceInspectorModal';
import { SkillEvidenceDrawer } from './components/SkillEvidenceDrawer';
import { ExecutiveReportModal } from './components/ExecutiveReportModal';
import { AICopilotModal } from './components/AICopilotModal';
import { PublicPassportView } from './components/PublicPassportView';
import { SharePassportModal } from './components/SharePassportModal';
import {
  Search,
  Bell,
  User as UserIcon,
  Settings,
  FileText,
  Sun,
  Moon,
  LogOut,
  CheckCircle2,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

const DEFAULT_MODEL_ID = 'nvidia/nemotron-3.5-lightning-30b-a3b';

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('applywise_theme') === 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('applywise_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('applywise_theme', 'light');
    }
  }, [darkMode]);

  const [viewerMode, setViewerMode] = useState<ViewerMode>(() => {
    const saved = localStorage.getItem('applywise_viewer_mode');
    return saved === 'student' ? 'student' : 'jobseeker';
  });

  const handleChangeViewerMode = (mode: ViewerMode) => {
    setViewerMode(mode);
    localStorage.setItem('applywise_viewer_mode', mode);
  };

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('applywise_sidebar_collapsed') === '1';
  });

  const handleToggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('applywise_sidebar_collapsed', next ? '1' : '0');
      return next;
    });
  };

  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    return localStorage.getItem('applywise_selected_model') || DEFAULT_MODEL_ID;
  });

  const handleSelectModel = (modelId: string) => {
    setSelectedModelId(modelId);
    localStorage.setItem('applywise_selected_model', modelId);
  };

  const [user, setUser] = useState<User | null>(() => {
    if (localStorage.getItem('applywise_demo_reset_v2') !== '1') {
      localStorage.removeItem('applywise_token');
      localStorage.removeItem('applywise_user');
      sessionStorage.removeItem('applywise_signed_out');
      localStorage.setItem('applywise_demo_reset_v2', '1');
    }

    const params = new URLSearchParams(window.location.search);
    const googleToken = params.get('google_token');
    if (params.get('signin') === '1') {
      localStorage.removeItem('applywise_token');
      localStorage.removeItem('applywise_user');
      window.history.replaceState({}, '', window.location.pathname);
      return null;
    }
    if (googleToken) {
      const gUser: User = {
        id: 1,
        name: params.get('google_name') || 'ApplyWise User',
        email: params.get('google_email') || '',
        role: 'Job seeker',
      };
      localStorage.setItem('applywise_token', googleToken);
      localStorage.setItem('applywise_user', JSON.stringify(gUser));
      window.history.replaceState({}, '', window.location.pathname);
      return gUser;
    }
    try {
      const saved = JSON.parse(localStorage.getItem('applywise_user') || 'null');
      if (saved && saved.name !== 'Nivindharan') return saved;
    } catch {
      // Ignore parse error
    }
    if (sessionStorage.getItem('applywise_signed_out') === '1' && params.get('autostart') !== '1') {
      return null;
    }
    return {
      id: 1,
      name: 'Arjun Mehta',
      email: 'demo@applywise.local',
      role: 'Job seeker',
    };
  });

  const [currentPage, setCurrentPage] = useState('overview');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [analysesList, setAnalysesList] = useState<AnalysisData[]>([]);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [aiStatus, setAiStatus] = useState<AIProviderStatus | null>(null);
  const [selectedJobDraft, setSelectedJobDraft] = useState('');
  const [toast, setToast] = useState('');
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [isPassportModalOpen, setIsPassportModalOpen] = useState(false);
  const [inspectedSkill, setInspectedSkill] = useState<string | null>(null);
  const [commandQuery, setCommandQuery] = useState('');
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const avatarMenuRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(''), 3500);
  };

  // Global keyboard shortcut Ctrl/Cmd + K for search, Esc to close menus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 'k' || e.key.toLowerCase() === 'f')) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape') {
        setAvatarMenuOpen(false);
        setNotificationsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Click outside to close avatar menu & notifications dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target as Node)) {
        setAvatarMenuOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const refreshAiStatus = async (modelOverride?: string) => {
    try {
      const m = modelOverride || selectedModelId;
      const statusData = await fetchApi<AIProviderStatus>(
        `/ai-status?model=${encodeURIComponent(m)}`
      );
      if (statusData) setAiStatus(statusData);
    } catch {
      // Ignore error
    }
  };

  const refreshData = async () => {
    try {
      const [p, e, a, allA, ap, att, statusData] = await Promise.all([
        fetchApi<Profile>('/profile'),
        fetchApi<EvidenceItem[]>('/evidence'),
        fetchApi<AnalysisData | null>('/analyses/latest'),
        fetchApi<AnalysisData[]>('/analyses'),
        fetchApi<ApplicationItem[]>('/applications'),
        fetchApi<AttachmentItem[]>('/attachments'),
        fetchApi<AIProviderStatus>(
          `/ai-status?model=${encodeURIComponent(selectedModelId)}`
        ).catch(() => null),
      ]);
      setProfile(p);
      setEvidence(e);
      setAnalysis(a);
      setAnalysesList(allA || []);
      setApplications(ap);
      setAttachments(att || []);
      if (statusData) setAiStatus(statusData);
      if (p?.name && user?.email === 'demo@applywise.local' && user.name !== p.name) {
        const syncedDemoUser: User = {
          ...user,
          name: p.name,
          role: p.role || user.role,
        };
        setUser(syncedDemoUser);
        localStorage.setItem('applywise_user', JSON.stringify(syncedDemoUser));
      }
    } catch {
      // Background refresh silent fail
    }
  };

  useEffect(() => {
    if (user) {
      refreshData();
    } else {
      setProfile(null);
      setAnalysis(null);
      setAnalysesList([]);
      setEvidence([]);
      setAttachments([]);
      setApplications([]);
    }
  }, [user?.id, user?.email]);

  useEffect(() => {
    setGlobalSkillContext({
      evidence,
      profile,
      attachments,
    });
  }, [evidence, profile, attachments]);

  const handleLoadDemoPreset = async (presetId: string) => {
    try {
      const res = await fetchApi<{
        ok: boolean;
        label: string;
        token?: string;
        user?: User;
        analysis: AnalysisData;
      }>('/demo-profile', {
        method: 'POST',
        body: JSON.stringify({ presetId }),
      });
      if (res.token) localStorage.setItem('applywise_token', res.token);
      if (res.user) {
        localStorage.setItem('applywise_user', JSON.stringify(res.user));
        setUser(res.user);
      }
      if (res.analysis) setAnalysis(res.analysis);
      await refreshData();
      showToast(`Loaded sample profile: ${res.label}`);
    } catch {
      showToast('Could not load sample profile.');
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('applywise_token');
    localStorage.removeItem('applywise_user');
    sessionStorage.setItem('applywise_signed_out', '1');
    setProfile(null);
    setAnalysis(null);
    setAnalysesList([]);
    setEvidence([]);
    setAttachments([]);
    setApplications([]);
    setUser(null);
  };

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = commandQuery.trim().toLowerCase();
    if (!q) return;
    if (q.includes('ai') || q.includes('copilot') || q.includes('coach')) {
      setIsCopilotOpen(true);
    } else if (q.includes('skill') || q.includes('readiness') || q.includes('score')) {
      setCurrentPage('skills');
    } else if (q.includes('road') || q.includes('sprint') || q.includes('day')) {
      setCurrentPage('roadmap');
    } else if (q.includes('job') || q.includes('offer') || q.includes('company') || q.includes('upsc')) {
      setCurrentPage('offers');
    } else if (q.includes('match') || q.includes('analyze')) {
      setCurrentPage('match');
    } else if (q.includes('resume') || q.includes('cv')) {
      setCurrentPage('resume');
    } else if (q.includes('attach') || q.includes('proof') || q.includes('vault')) {
      setCurrentPage('attachments');
    } else if (q.includes('app') || q.includes('kanban')) {
      setCurrentPage('applications');
    } else {
      setSelectedJobDraft(commandQuery.trim());
      setCurrentPage('match');
      showToast(`Opened Job Match for "${commandQuery.trim()}"`);
    }
    setCommandQuery('');
  };

  // Public Proof Passport route: /p/:token (no login required, no sidebar)
  const publicTokenMatch =
    typeof window !== 'undefined'
      ? window.location.pathname.match(/^\/p\/([a-zA-Z0-9_-]+)/)
      : null;
  if (publicTokenMatch) {
    return <PublicPassportView token={publicTokenMatch[1]} />;
  }

  if (!user) {
    return (
      <AuthView
        darkMode={darkMode}
        onToggleDarkMode={setDarkMode}
        onSuccess={(session) => {
          sessionStorage.removeItem('applywise_signed_out');
          localStorage.setItem('applywise_token', session.token);
          localStorage.setItem('applywise_user', JSON.stringify(session.user));
          setProfile(null);
          setAnalysis(null);
          setEvidence([]);
          setAttachments([]);
          setApplications([]);
          setUser(session.user);
          setCurrentPage('overview');
          showToast(`Signed in as ${session.user.name}`);
        }}
      />
    );
  }

  const needsInitialOnboarding =
    profile !== null && (!profile.onboarded || !profile.title || !profile.name);

  const displayUserName = profile?.name || user.name || 'Candidate';

  // Distinct page titles and subtitles (sentence case, no repeated subtitle)
  const pageHeaderConfig: Record<string, { title: string; subtitle: string }> = {
    overview: {
      title: 'Home',
      subtitle: 'Your readiness score, proof status, and next action for this week.',
    },
    skills: {
      title: 'Skills',
      subtitle: 'Compare your verified proof against target roles, companies, and government exams.',
    },
    roadmap: {
      title: 'Roadmap',
      subtitle: 'Complete your 7-day proof sprint by attaching a link or file to each daily deliverable.',
    },
    offers: {
      title: 'Jobs',
      subtitle: 'Search private enterprise and government roles matched against your verified skills.',
    },
    match: {
      title: 'Match a job',
      subtitle: 'Paste any job description to audit your verified skills, gaps, and 7-day sprint.',
    },
    attachments: {
      title: 'Proof Vault',
      subtitle: 'Upload résumés, certificates, and project files and link them directly to your skills.',
    },
    resume: {
      title: 'Résumé Studio',
      subtitle: 'Generate honest, evidence-backed bullets and cover letters from your verified skills.',
    },
    applications: {
      title: 'Applications',
      subtitle: 'Track your job applications from saved roles through interviews and offers.',
    },
  };

  // Thin 4-step progress stepper mapping
  const journeySteps = [
    {
      id: 'attachments',
      stepNum: 1,
      label: 'Upload proof',
      done: attachments.length > 0 || evidence.length > 0,
    },
    {
      id: 'skills',
      stepNum: 2,
      label: 'Verify skills',
      done: evidence.length >= 2,
    },
    {
      id: 'offers',
      stepNum: 3,
      label: 'Match jobs',
      done: Boolean(analysis),
    },
    {
      id: 'applications',
      stepNum: 4,
      label: 'Apply',
      done: applications.length > 0,
    },
  ];

  const activeStepperId =
    currentPage === 'attachments'
      ? 'attachments'
      : currentPage === 'skills' || currentPage === 'roadmap'
      ? 'skills'
      : currentPage === 'offers' || currentPage === 'match'
      ? 'offers'
      : currentPage === 'applications' || currentPage === 'resume'
      ? 'applications'
      : evidence.length === 0
      ? 'attachments'
      : !analysis
      ? 'skills'
      : 'offers';

  const currentHeader = pageHeaderConfig[currentPage] || pageHeaderConfig.overview;

  return (
    <div
      data-viewer={viewerMode}
      className="min-h-screen flex bg-[#F8FAFC] dark:bg-[#0F1215] text-slate-900 dark:text-slate-100 transition-colors duration-150"
    >
      {/* Toast Confirmation */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-4 py-3 rounded-xl shadow-lg text-xs font-semibold animate-in fade-in slide-in-from-bottom-2 duration-150 print:hidden"
        >
          {toast}
        </div>
      )}

      {/* Left Sidebar (Collapsible on Desktop, Bottom Tab Bar on Mobile) */}
      <div className="print:hidden">
        <Sidebar
          currentPage={currentPage}
          onNavigate={(p) => setCurrentPage(p)}
          user={user}
          profile={profile}
          onSignOut={handleSignOut}
          onOpenProfile={() => setIsProfileModalOpen(true)}
          darkMode={darkMode}
          onToggleDarkMode={setDarkMode}
          evidenceCount={evidence.length + attachments.length}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={handleToggleSidebarCollapsed}
        />
      </div>

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-h-screen min-w-0 transition-all duration-150 print:ml-0 ${
          sidebarCollapsed ? 'md:ml-[72px]' : 'md:ml-[240px]'
        }`}
      >
        {/* Top Bar: ONLY Global Search (Ctrl/Cmd+K), One Primary Button ("Match a job"), Notifications, Avatar Menu */}
        <header className="sticky top-0 z-20 bg-white dark:bg-[#14171A] border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 py-3 flex items-center justify-between gap-4 print:hidden">
          {/* 1. Global Search (Ctrl/Cmd+K) */}
          <div className="flex-1 max-w-md min-w-[160px]">
            <form onSubmit={handleCommandSubmit} className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={commandQuery}
                onChange={(e) => setCommandQuery(e.target.value)}
                placeholder="Search skills, jobs, or jump to page…"
                aria-label="Global search"
                className="w-full pl-10 pr-14 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 border border-transparent focus:outline-none focus:border-[#2563EB] focus:bg-white dark:focus:bg-[#181B1E] transition"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsCopilotOpen(true)}
                  title="Open AI Career Copilot"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#2563EB]/10 hover:bg-[#2563EB]/20 text-[#2563EB] dark:text-[#60A5FA] text-[11px] font-semibold transition cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Ask AI</span>
                </button>
                <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 text-[11px] font-mono border border-slate-200 dark:border-slate-700 pointer-events-none">
                  ⌘K
                </kbd>
              </div>
            </form>
          </div>

          {/* Right Zone: Primary Button ("Match a job") + Notifications + Avatar Menu */}
          <div className="flex items-center gap-3 shrink-0">
            {/* 2. Single Primary Button ("Match a job") */}
            <button
              type="button"
              onClick={() => setCurrentPage('match')}
              className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs sm:text-sm font-semibold transition cursor-pointer whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
            >
              Match a job
            </button>

            {/* 3. Notifications Dropdown */}
            <div ref={notificationsRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotificationsOpen((prev) => !prev);
                  setAvatarMenuOpen(false);
                }}
                aria-label="Notifications"
                aria-expanded={notificationsOpen}
                className="relative p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
              >
                <Bell className="w-5 h-5" />
                {evidence.length > 0 && (
                  <span className="w-2 h-2 rounded-full bg-[#2563EB] absolute top-2 right-2" />
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xl p-4 space-y-3 z-40">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900 dark:text-white">
                      Notifications
                    </span>
                    <span className="text-[11px] text-slate-400">Recent updates</span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    <div className="py-2.5 space-y-0.5">
                      <p className="font-medium text-slate-900 dark:text-white">
                        {evidence.length} skills backed by attached proof
                      </p>
                      <p className="text-slate-500 dark:text-slate-400">
                        Add proof for your remaining self-declared skills in Skills.
                      </p>
                    </div>
                    {analysis && (
                      <div className="py-2.5 space-y-0.5">
                        <p className="font-medium text-slate-900 dark:text-white">
                          Latest match: {analysis.jobTitle} ({analysis.readinessScore}%)
                        </p>
                        <p className="text-slate-500 dark:text-slate-400">
                          View your 7-day sprint tasks in Roadmap.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 4. Avatar Menu (Profile, Settings, Export report PDF, Light/Dark, Sign out) */}
            <div ref={avatarMenuRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setAvatarMenuOpen((prev) => !prev);
                  setNotificationsOpen(false);
                }}
                aria-label="Account menu"
                aria-expanded={avatarMenuOpen}
                className="w-9 h-9 rounded-full bg-[#2563EB]/10 text-[#2563EB] dark:bg-[#2563EB]/20 dark:text-[#60A5FA] font-heading font-bold text-xs flex items-center justify-center border border-[#2563EB]/30 hover:border-[#2563EB] transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
              >
                {displayUserName.charAt(0).toUpperCase()}
              </button>

              {avatarMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-56 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xl py-1.5 z-40 text-sm"
                >
                  <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
                    <p className="font-semibold text-slate-900 dark:text-white truncate">
                      {displayUserName}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {profile?.title || user.email}
                    </p>
                  </div>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAvatarMenuOpen(false);
                      setIsProfileModalOpen(true);
                    }}
                    className="w-full px-4 py-2 text-left flex items-center gap-2.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    <UserIcon className="w-4 h-4 text-slate-400" />
                    <span>Profile</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAvatarMenuOpen(false);
                      refreshAiStatus();
                      setIsSettingsOpen(true);
                    }}
                    className="w-full px-4 py-2 text-left flex items-center gap-2.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    <Settings className="w-4 h-4 text-slate-400" />
                    <span>Settings</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAvatarMenuOpen(false);
                      setIsReportModalOpen(true);
                    }}
                    className="w-full px-4 py-2 text-left flex items-center gap-2.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    <FileText className="w-4 h-4 text-slate-400" />
                    <span>Export report PDF</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setDarkMode(!darkMode);
                      setAvatarMenuOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left flex items-center gap-2.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    {darkMode ? (
                      <Sun className="w-4 h-4 text-amber-400" />
                    ) : (
                      <Moon className="w-4 h-4 text-slate-400" />
                    )}
                    <span>{darkMode ? 'Light mode' : 'Dark mode'}</span>
                  </button>

                  <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAvatarMenuOpen(false);
                      handleSignOut();
                    }}
                    className="w-full px-4 py-2 text-left flex items-center gap-2.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Thin 4-Step Progress Stepper Under Top Bar: Upload proof -> Verify skills -> Match jobs -> Apply */}
        <div
          aria-label="Career readiness progress"
          className="bg-white/80 dark:bg-[#14171A]/90 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 py-2 print:hidden"
        >
          <div className="max-w-[1280px] mx-auto flex items-center justify-between sm:justify-start gap-2 sm:gap-6 overflow-x-auto no-scrollbar">
            {journeySteps.map((step, idx) => {
              const isCurrent = activeStepperId === step.id;
              return (
                <React.Fragment key={step.id}>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(step.id)}
                    aria-current={isCurrent ? 'step' : undefined}
                    className={`inline-flex items-center gap-2 py-1 text-xs font-medium transition whitespace-nowrap cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-md px-1.5 ${
                      isCurrent
                        ? 'text-[#2563EB] dark:text-[#60A5FA] font-semibold'
                        : step.done
                        ? 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                        : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    {step.done && !isCurrent ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <span
                        className={`w-4 h-4 rounded-full text-[10px] font-mono flex items-center justify-center shrink-0 ${
                          isCurrent
                            ? 'bg-[#2563EB] text-white font-bold'
                            : 'border border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        {step.stepNum}
                      </span>
                    )}
                    <span>{step.label}</span>
                  </button>
                  {idx < journeySteps.length - 1 && (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-700 shrink-0" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Page Content Body */}
        <main className="flex-1 px-4 sm:px-8 py-6 pb-24 md:pb-12 max-w-[1280px] w-full mx-auto">
          <div className="mb-6 print:hidden">
            <h1 className="font-heading text-[28px] leading-8 font-bold text-slate-900 dark:text-white tracking-tight">
              {currentHeader.title}
            </h1>
            <p className="text-sm leading-[22px] text-slate-500 dark:text-slate-400 mt-1">
              {currentHeader.subtitle}
            </p>
          </div>

          {currentPage === 'overview' && (
            <OverviewView
              profile={profile}
              evidence={evidence}
              analysis={analysis}
              analysesList={analysesList}
              applications={applications}
              attachments={attachments}
              selectedModelId={selectedModelId}
              viewerMode={viewerMode}
              aiStatus={aiStatus}
              onRefreshAIStatus={() => refreshAiStatus()}
              onSelectAnalysis={(selected) => setAnalysis(selected)}
              onSelectJobForMatch={(jobText) => {
                setSelectedJobDraft(jobText);
                setCurrentPage('match');
              }}
              onNavigate={setCurrentPage}
              onOpenProfile={() => setIsProfileModalOpen(true)}
              onInspectSkill={(skill) => setInspectedSkill(skill)}
              onOpenReportModal={() => setIsReportModalOpen(true)}
              onOpenPassportModal={() => setIsPassportModalOpen(true)}
              onRefresh={refreshData}
              onNotify={showToast}
            />
          )}

          {currentPage === 'skills' && (
            <SkillsView
              profile={profile}
              analysis={analysis}
              analysesList={analysesList}
              evidence={evidence}
              attachments={attachments}
              viewerMode={viewerMode}
              onSelectAnalysis={(selected) => {
                setAnalysis(selected);
                showToast(`Switched to analysis for ${selected.jobTitle || 'Role'}`);
              }}
              onSelectJobForMatch={(jobText) => {
                setSelectedJobDraft(jobText);
                setCurrentPage('match');
              }}
              onOpenProfile={() => setIsProfileModalOpen(true)}
              onInspectSkill={(skill) => setInspectedSkill(skill)}
              onOpenReportModal={() => setIsReportModalOpen(true)}
              onOpenPassportModal={() => setIsPassportModalOpen(true)}
              onRefresh={refreshData}
              onNotify={showToast}
              onNavigate={setCurrentPage}
            />
          )}

          {currentPage === 'roadmap' && (
            <CareerRoadmapView
              profile={profile}
              analysis={analysis}
              analysesList={analysesList}
              evidence={evidence}
              attachments={attachments}
              viewerMode={viewerMode}
              onSelectJobForMatch={(jobText) => {
                setSelectedJobDraft(jobText);
                setCurrentPage('match');
              }}
              onRefresh={refreshData}
              onNotify={showToast}
              onNavigate={setCurrentPage}
            />
          )}

          {currentPage === 'attachments' && (
            <AttachmentsView
              profile={profile}
              attachments={attachments}
              evidence={evidence}
              viewerMode={viewerMode}
              onRefresh={refreshData}
              onNotify={showToast}
              onNavigate={setCurrentPage}
            />
          )}

          {currentPage === 'match' && (
            <MatchView
              profile={profile}
              evidence={evidence}
              attachments={attachments}
              analysis={analysis}
              analysesList={analysesList}
              selectedJob={selectedJobDraft}
              selectedModelId={selectedModelId}
              onAnalysisDone={(newAnalysis: AnalysisData, targetPage?: string) => {
                setAnalysis(newAnalysis);
                refreshData();
                if (targetPage) {
                  setCurrentPage(targetPage);
                }
              }}
              onRefreshAttachments={refreshData}
              onNavigate={setCurrentPage}
              onInspectSkill={(skill) => setInspectedSkill(skill)}
              onNotify={showToast}
            />
          )}

          {currentPage === 'offers' && (
            <JobOffersView
              profile={profile}
              evidence={evidence}
              attachments={attachments}
              analysis={analysis}
              analysesList={analysesList}
              selectedJob={selectedJobDraft}
              selectedModelId={selectedModelId}
              viewerMode={viewerMode}
              onSelectJobForMatch={(jobText) => {
                setSelectedJobDraft(jobText);
                setCurrentPage('match');
              }}
              onAnalysisDone={(newAnalysis: AnalysisData, targetPage?: string) => {
                setAnalysis(newAnalysis);
                refreshData();
                if (targetPage) {
                  setCurrentPage(targetPage);
                }
              }}
              onInspectSkill={(skill) => setInspectedSkill(skill)}
              onRefresh={refreshData}
              onNotify={showToast}
              onNavigate={setCurrentPage}
            />
          )}

          {currentPage === 'resume' && (
            <ResumeView
              analysis={analysis}
              profile={profile}
              evidence={evidence}
              attachments={attachments}
              viewerMode={viewerMode}
              selectedModelId={selectedModelId}
              onRefresh={refreshData}
              onNotify={showToast}
              onNavigate={setCurrentPage}
              onInspectSkill={(skill) => setInspectedSkill(skill)}
            />
          )}

          {currentPage === 'applications' && (
            <ApplicationsView
              applications={applications}
              analysis={analysis}
              viewerMode={viewerMode}
              onRefresh={refreshData}
              onNotify={showToast}
            />
          )}
        </main>
      </div>

      {/* Settings Modal (Viewer Mode + Sample Profiles + Advanced AI Model Picker & Latency) */}
      <InferenceInspectorModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        aiStatus={aiStatus}
        selectedModelId={selectedModelId}
        onSelectModel={(modelId) => {
          handleSelectModel(modelId);
          refreshAiStatus(modelId);
          showToast(`Selected model: ${modelId}`);
        }}
        onRefreshStatus={() => refreshAiStatus()}
        onNotify={showToast}
        viewerMode={viewerMode}
        onChangeViewerMode={(m) => {
          handleChangeViewerMode(m);
          showToast(`Viewer mode set to ${m === 'student' ? 'Student' : 'Job seeker'}`);
        }}
        onLoadDemoPreset={handleLoadDemoPreset}
      />

      {/* Slide-Over Skill Evidence Drawer */}
      <SkillEvidenceDrawer
        skill={inspectedSkill}
        onClose={() => setInspectedSkill(null)}
        evidence={evidence}
        targetRole={analysis?.jobTitle || profile?.title || 'Software Engineer'}
        selectedModelId={selectedModelId}
        onRefreshEvidence={() => {
          refreshData();
          refreshAiStatus();
        }}
        onNotify={showToast}
      />

      {/* Printable Executive Report PDF Modal */}
      <ExecutiveReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        profile={profile}
        evidence={evidence}
        analysis={analysis}
      />

      {/* Profile & Onboarding Modal */}
      <ProfileModal
        isOpen={isProfileModalOpen || needsInitialOnboarding}
        isInitialOnboarding={needsInitialOnboarding}
        user={user}
        profile={profile}
        attachments={attachments}
        onClose={() => setIsProfileModalOpen(false)}
        onProfileUpdated={() => {
          setIsProfileModalOpen(false);
          refreshData();
          showToast('Profile saved.');
        }}
      />

      {/* Interactive AI Career Copilot Modal */}
      <AICopilotModal
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        profile={profile}
        evidence={evidence}
        analysis={analysis}
        aiStatus={aiStatus}
        selectedModelId={selectedModelId}
        viewerMode={viewerMode}
        onRefreshAIStatus={() => refreshAiStatus()}
        onNavigate={(page) => setCurrentPage(page)}
        onInspectSkill={(skill) => setInspectedSkill(skill)}
      />

      {/* Share Proof Passport Modal */}
      <SharePassportModal
        isOpen={isPassportModalOpen}
        onClose={() => setIsPassportModalOpen(false)}
        onNotify={showToast}
      />
    </div>
  );
}
