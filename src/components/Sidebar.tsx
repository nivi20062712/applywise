import React from 'react';
import {
  Home,
  ShieldCheck,
  Compass,
  Briefcase,
  FolderCheck,
  FileText,
  Kanban,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { User, Profile } from '../types';

export type UIThemePreset = 'google' | 'youtube' | 'tcs' | 'backup';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  user: User | null;
  profile: Profile | null;
  onSignOut: () => void;
  onOpenProfile: () => void;
  darkMode?: boolean;
  onToggleDarkMode?: (dark: boolean) => void;
  evidenceCount?: number;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export const navItems = [
  {
    id: 'overview',
    label: 'Home',
    icon: Home,
  },
  {
    id: 'skills',
    label: 'Skills',
    icon: ShieldCheck,
  },
  {
    id: 'roadmap',
    label: 'Roadmap',
    icon: Compass,
  },
  {
    id: 'offers',
    label: 'Jobs',
    icon: Briefcase,
  },
  {
    id: 'attachments',
    label: 'Proof Vault',
    icon: FolderCheck,
  },
  {
    id: 'resume',
    label: 'Résumé',
    icon: FileText,
  },
  {
    id: 'applications',
    label: 'Applications',
    icon: Kanban,
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onNavigate,
  darkMode = false,
  collapsed = false,
  onToggleCollapsed,
}) => {
  const activeNavId = currentPage === 'match' ? 'offers' : currentPage;

  return (
    <>
      {/* Desktop Left Sidebar (Collapsible) */}
      <aside
        aria-label="Primary Sidebar Navigation"
        className={`fixed inset-y-0 left-0 z-20 hidden md:flex flex-col justify-between border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#14171A] transition-all duration-150 select-none ${
          collapsed ? 'w-[72px] px-3 py-5' : 'w-[240px] px-4 py-5'
        }`}
      >
        <div>
          {/* Brand Header + Collapse Toggle */}
          <div
            className={`pb-6 flex items-center ${
              collapsed ? 'justify-center' : 'justify-between px-2'
            }`}
          >
            <button
              type="button"
              onClick={() => onNavigate('overview')}
              className="flex items-center gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-xl"
              title="ApplyWise Home"
            >
              <div className="w-9 h-9 flex items-center justify-center shrink-0">
                <svg viewBox="0 0 40 40" className="w-9 h-9" fill="none">
                  <path
                    d="M17.2 2.6a5.6 5.6 0 0 1 5.6 0l11.2 6.5a5.6 5.6 0 0 1 2.8 4.8v12.2a5.6 5.6 0 0 1-2.8 4.8L22.8 37.4a5.6 5.6 0 0 1-5.6 0L6 30.9a5.6 5.6 0 0 1-2.8-4.8V13.9A5.6 5.6 0 0 1 6 9.1l11.2-6.5Z"
                    fill={darkMode ? '#F8FAFC' : '#0F172A'}
                  />
                  <rect
                    x="13.5"
                    y="16.5"
                    width="2.8"
                    height="7"
                    rx="1.4"
                    fill={darkMode ? '#0F172A' : '#FFFFFF'}
                  />
                  <rect
                    x="18.6"
                    y="12.5"
                    width="2.8"
                    height="15"
                    rx="1.4"
                    fill={darkMode ? '#0F172A' : '#FFFFFF'}
                  />
                  <rect
                    x="23.7"
                    y="17.5"
                    width="2.8"
                    height="5"
                    rx="1.4"
                    fill={darkMode ? '#0F172A' : '#FFFFFF'}
                  />
                </svg>
              </div>
              {!collapsed && (
                <span className="font-heading font-bold text-base tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
                  ApplyWise
                </span>
              )}
            </button>

            {!collapsed && onToggleCollapsed && (
              <button
                type="button"
                onClick={onToggleCollapsed}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Journey Flow Indicator (Skills -> Roadmap -> Jobs) */}
          {!collapsed && (
            <div className="px-2 pb-2">
              <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
                Navigation
              </p>
            </div>
          )}

          {/* Clean Navigation List (No "+" or chevrons) */}
          <nav className="space-y-1" aria-label="Main Navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeNavId === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  title={collapsed ? item.label : undefined}
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-full flex items-center ${
                    collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
                  } rounded-xl text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] cursor-pointer ${
                    isActive
                      ? 'bg-[#2563EB]/10 text-[#2563EB] dark:bg-[#2563EB]/20 dark:text-[#60A5FA] font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <Icon
                    className={`w-5 h-5 shrink-0 ${
                      isActive
                        ? 'text-[#2563EB] dark:text-[#60A5FA] stroke-[2.2]'
                        : 'text-slate-500 dark:text-slate-400 stroke-[1.8]'
                    }`}
                  />
                  {!collapsed && <span className="truncate whitespace-nowrap">{item.label}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Expand/Collapse Control */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
          {onToggleCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={`w-full flex items-center ${
                collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2'
              } rounded-xl text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] cursor-pointer`}
            >
              {collapsed ? (
                <PanelLeftOpen className="w-4 h-4 shrink-0" />
              ) : (
                <>
                  <PanelLeftClose className="w-4 h-4 shrink-0" />
                  <span>Collapse sidebar</span>
                </>
              )}
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Bottom Tab Bar (Under 768px) */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white dark:bg-[#14171A] border-t border-slate-200 dark:border-slate-800 px-1 py-1.5 flex items-center justify-around print:hidden"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeNavId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors min-w-[44px] min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
                isActive
                  ? 'text-[#2563EB] dark:text-[#60A5FA] font-semibold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate max-w-[56px]">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
