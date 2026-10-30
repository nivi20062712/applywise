import React, { useState, useMemo, useRef } from 'react';
import {
  Profile,
  AnalysisData,
  EvidenceItem,
  AttachmentItem,
} from '../types';
import {
  identifySkills,
  buildEnhancedSevenDayPlan,
  buildSkillLearningLinks,
  buildCareerRoadmap,
} from '../utils/skillMatcher';
import { fetchApi, uploadResumeOrProofFile } from '../api';
import { ViewerMode } from './InferenceInspectorModal';
import {
  CheckCircle2,
  Circle,
  BookOpen,
  ExternalLink,
  UploadCloud,
  ChevronDown,
  ChevronUp,
  Loader2,
  ArrowRight,
} from 'lucide-react';

interface CareerRoadmapViewProps {
  profile: Profile | null;
  analysis: AnalysisData | null;
  analysesList?: AnalysisData[];
  evidence: EvidenceItem[];
  attachments?: AttachmentItem[];
  viewerMode?: ViewerMode;
  onSelectJobForMatch?: (jobText: string) => void;
  onRefresh: () => void;
  onNotify: (msg: string) => void;
  onNavigate: (page: string) => void;
}

interface DayProofRecord {
  day: number;
  title: string;
  url?: string;
  filename?: string;
}

export const CareerRoadmapView: React.FC<CareerRoadmapViewProps> = ({
  profile,
  analysis,
  evidence,
  attachments = [],
  viewerMode = 'jobseeker',
  onSelectJobForMatch,
  onRefresh,
  onNotify,
  onNavigate,
}) => {
  const doneKey = `applywise_sprint_done_${profile?.user_id || 'default'}`;
  const proofsKey = `applywise_sprint_proofs_${profile?.user_id || 'default'}`;

  const [completedDays, setCompletedDays] = useState<number[]>(() => {
    try {
      const raw = localStorage.getItem(doneKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [dayProofs, setDayProofs] = useState<Record<number, DayProofRecord>>(() => {
    try {
      const raw = localStorage.getItem(proofsKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  // Track which completed days are manually expanded
  const [expandedCompletedDays, setExpandedCompletedDays] = useState<number[]>([]);
  // Track which day has its "Resources" drawer open
  const [openResourcesDay, setOpenResourcesDay] = useState<number | null>(null);
  // Track which day has its inline "Attach proof" form open (opened when checking an unfinished day)
  const [attachingDay, setAttachingDay] = useState<number | null>(null);
  const [proofLinkInput, setProofLinkInput] = useState('');
  const [proofTitleInput, setProofTitleInput] = useState('');
  const [savingProofDay, setSavingProofDay] = useState<number | null>(null);
  const [activeViewTab, setActiveViewTab] = useState<'sprint' | 'pivots'>('sprint');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const targetRole = analysis?.jobTitle || profile?.title || 'Software Engineer';

  // Aggregate skills for sprint & pivots
  const allUserSkills = useMemo(() => {
    return Array.from(
      new Set([
        ...identifySkills(
          `${profile?.skills_text || ''} ${profile?.resume_text || ''} ${attachments
            .map((a) => a.extracted_text)
            .join(' ')}`
        ),
        ...evidence.map((e) => e.skill).filter(Boolean),
      ])
    );
  }, [profile, attachments, evidence]);

  const verifiedSkills = useMemo(() => {
    return Array.from(
      new Set(
        evidence
          .filter(
            (e) =>
              e.skill &&
              e.type !== 'self-declared' &&
              !/mentioned in r[eé]sum[eé]/i.test(e.title || '')
          )
          .map((e) => e.skill)
      )
    );
  }, [evidence]);

  const sevenDayPlan = useMemo(() => {
    if (analysis?.sevenDayPlan && analysis.sevenDayPlan.length === 7) {
      return analysis.sevenDayPlan;
    }
    const missing = (analysis?.missingSkills || []).map((m) => m.skill);
    const unproven = (analysis?.unprovenSkills || []).map((u) => u.skill);
    return buildEnhancedSevenDayPlan(
      targetRole,
      missing.length > 0 ? missing : ['TypeScript', 'Docker', 'AWS', 'System Design'],
      unproven.length > 0 ? unproven : ['React', 'Node.js', 'SQL']
    );
  }, [analysis, targetRole]);

  // First unfinished day is the current day
  const currentDayNumber = useMemo(() => {
    const next = sevenDayPlan.find((d) => !completedDays.includes(d.day));
    return next ? next.day : 7;
  }, [sevenDayPlan, completedDays]);

  const roadmapData = useMemo(() => {
    return buildCareerRoadmap({
      targetRole,
      userSkills: allUserSkills,
      verifiedSkills,
    });
  }, [targetRole, allUserSkills, verifiedSkills]);

  const saveCompletedDays = (nextDays: number[], nextProofs: Record<number, DayProofRecord>) => {
    setCompletedDays(nextDays);
    setDayProofs(nextProofs);
    localStorage.setItem(doneKey, JSON.stringify(nextDays));
    localStorage.setItem(proofsKey, JSON.stringify(nextProofs));
  };

  // Checking a day opens the inline "Attach proof" field and ONLY counts it as done once proof is attached
  const handleToggleDayCheckbox = (dayNum: number, focusSkill: string, deliverable: string) => {
    if (completedDays.includes(dayNum)) {
      // Uncheck day
      const nextDays = completedDays.filter((d) => d !== dayNum);
      const nextProofs = { ...dayProofs };
      delete nextProofs[dayNum];
      saveCompletedDays(nextDays, nextProofs);
      onNotify(`Marked Day ${dayNum} as incomplete.`);
      return;
    }
    // Open inline attach proof form
    setAttachingDay(dayNum);
    setProofTitleInput(`Day ${dayNum} — ${deliverable || focusSkill}`);
    setProofLinkInput('');
  };

  const handleConfirmDayProofLink = async (
    e: React.FormEvent,
    dayNum: number,
    focusSkill: string
  ) => {
    e.preventDefault();
    if (!proofLinkInput.trim()) return;
    setSavingProofDay(dayNum);
    try {
      const skillName = focusSkill || 'TypeScript';
      const title = proofTitleInput.trim() || `Day ${dayNum} Sprint Deliverable (${skillName})`;
      await fetchApi('/evidence', {
        method: 'POST',
        body: JSON.stringify({
          skill: skillName,
          type: 'GitHub link',
          title,
          url: proofLinkInput.trim(),
        }),
      });

      const nextDays = Array.from(new Set([...completedDays, dayNum]));
      const nextProofs = {
        ...dayProofs,
        [dayNum]: {
          day: dayNum,
          title,
          url: proofLinkInput.trim(),
        },
      };
      saveCompletedDays(nextDays, nextProofs);
      setAttachingDay(null);
      setProofLinkInput('');
      onRefresh();
      onNotify(`Attached proof and completed Day ${dayNum}.`);
    } catch {
      onNotify('Could not save sprint proof.');
    } finally {
      setSavingProofDay(null);
    }
  };

  const handleUploadDayProofFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
    dayNum: number,
    focusSkill: string
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSavingProofDay(dayNum);
    try {
      const skillName = focusSkill || 'TypeScript';
      const title = proofTitleInput.trim() || `Day ${dayNum} — ${file.name}`;
      const uploaded = await uploadResumeOrProofFile(file, {
        category: 'evidence',
        saveToProfile: false,
      });
      await fetchApi('/evidence', {
        method: 'POST',
        body: JSON.stringify({
          skill: skillName,
          type: 'project',
          title,
          url: '',
          attachment_name: file.name,
          extracted_summary: (uploaded.text || '').slice(0, 300),
        }),
      });

      const nextDays = Array.from(new Set([...completedDays, dayNum]));
      const nextProofs = {
        ...dayProofs,
        [dayNum]: {
          day: dayNum,
          title,
          filename: file.name,
        },
      };
      saveCompletedDays(nextDays, nextProofs);
      setAttachingDay(null);
      onRefresh();
      onNotify(`Uploaded "${file.name}" and completed Day ${dayNum}.`);
    } catch {
      onNotify('Could not upload sprint file.');
    } finally {
      setSavingProofDay(null);
    }
  };

  const progressPercent = Math.round(
    (completedDays.length / Math.max(1, sevenDayPlan.length)) * 100
  );

  return (
    <div className="space-y-6" data-viewer-mode={viewerMode}>
      {/* Sticky Sprint Progress Bar at the Top */}
      <div className="sticky top-[57px] z-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#181B1E]/95 backdrop-blur-xs shadow-xs p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1.5 flex-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-900 dark:text-white">
              7-day proof sprint · {targetRole}
            </span>
            <span className="font-mono font-semibold text-[#2563EB] dark:text-[#60A5FA] tabular-nums">
              {completedDays.length} of {sevenDayPlan.length} days complete ({progressPercent}%)
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-[#2563EB] transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* View Toggle: 7-day sprint | Role pivots */}
        <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0 self-start sm:self-center">
          <button
            type="button"
            onClick={() => setActiveViewTab('sprint')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeViewTab === 'sprint'
                ? 'bg-white dark:bg-[#181B1E] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            7-day sprint
          </button>
          <button
            type="button"
            onClick={() => setActiveViewTab('pivots')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeViewTab === 'pivots'
                ? 'bg-white dark:bg-[#181B1E] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Role pivots
          </button>
        </div>
      </div>

      {activeViewTab === 'sprint' ? (
        /* Vertical Timeline: One Card per Day */
        <div className="relative pl-6 sm:pl-8 space-y-4 before:content-[''] before:absolute before:left-2.5 sm:before:left-3.5 before:top-4 before:bottom-4 before:w-px before:bg-slate-200 dark:before:bg-slate-800">
          {sevenDayPlan.map((dayItem) => {
            const isCompleted = completedDays.includes(dayItem.day);
            const isCurrent = dayItem.day === currentDayNumber && !isCompleted;
            const isCollapsed =
              isCompleted && !expandedCompletedDays.includes(dayItem.day);
            const isResourcesOpen = openResourcesDay === dayItem.day;
            const isAttaching = attachingDay === dayItem.day;
            const focusSkill = dayItem.focusSkill || dayItem.skill || 'TypeScript';
            const dayTitle = dayItem.phase || dayItem.focus || `Day ${dayItem.day} · ${focusSkill}`;
            const dayTask = dayItem.task || dayItem.action || '';
            const dayDeliverable =
              dayItem.expectedProof ||
              dayItem.deliverable ||
              `Publish a small ${focusSkill} repository or code sample with README instructions.`;
            const links =
              dayItem.resources || dayItem.learningLinks || buildSkillLearningLinks(focusSkill);
            const attachedRecord = dayProofs[dayItem.day];

            return (
              <div key={dayItem.day} className="relative">
                {/* Timeline Node Indicator */}
                <div
                  className={`absolute -left-6 sm:-left-8 top-5 w-5 h-5 rounded-full flex items-center justify-center bg-white dark:bg-[#0F1215] ${
                    isCompleted
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : isCurrent
                      ? 'text-[#2563EB] ring-4 ring-[#2563EB]/15'
                      : 'text-slate-300 dark:text-slate-700'
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <Circle className="w-4 h-4 fill-current" />
                  )}
                </div>

                {/* Day Card */}
                <div
                  className={`rounded-2xl border transition bg-white dark:bg-[#181B1E] shadow-xs ${
                    isCurrent
                      ? 'border-[#2563EB] dark:border-[#2563EB]'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {/* Collapsed Header for Completed Days */}
                  {isCollapsed ? (
                    <div className="px-5 py-3.5 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={() =>
                            handleToggleDayCheckbox(
                              dayItem.day,
                              focusSkill,
                              dayDeliverable
                            )
                          }
                          aria-label={`Mark Day ${dayItem.day} incomplete`}
                          className="text-emerald-600 dark:text-emerald-400 shrink-0 cursor-pointer"
                        >
                          <CheckCircle2 className="w-5 h-5" />
                        </button>
                        <span className="text-xs font-mono text-slate-400 tabular-nums">
                          Day {dayItem.day}
                        </span>
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 line-through truncate">
                          {dayTitle}
                        </span>
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium hidden sm:inline">
                          · Proof attached
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedCompletedDays((prev) => [...prev, dayItem.day])
                        }
                        className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <span>Expand</span>
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    /* Expanded Day Card */
                    <div className="p-5 sm:p-6 space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3.5">
                          {/* Checkbox */}
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={isCompleted}
                            aria-label={`Complete Day ${dayItem.day}: ${dayTitle}`}
                            onClick={() =>
                              handleToggleDayCheckbox(
                                dayItem.day,
                                focusSkill,
                                dayDeliverable
                              )
                            }
                            className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
                              isCompleted
                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                : 'border-slate-300 dark:border-slate-600 hover:border-[#2563EB]'
                            }`}
                          >
                            {isCompleted && <CheckCircle2 className="w-3.5 h-3.5" />}
                          </button>

                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-mono font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                                Day {dayItem.day}
                              </span>
                              {isCurrent && (
                                <span className="px-2 py-0.5 rounded-md bg-[#2563EB]/10 text-[#2563EB] dark:text-[#60A5FA] font-semibold">
                                  Current day
                                </span>
                              )}
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                                {focusSkill}
                              </span>
                            </div>

                            <h3 className="font-heading text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
                              {dayTitle}
                            </h3>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {/* Single "Resources" Button per Day */}
                          <button
                            type="button"
                            onClick={() =>
                              setOpenResourcesDay(
                                isResourcesOpen ? null : dayItem.day
                              )
                            }
                            aria-expanded={isResourcesOpen}
                            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[#2563EB] text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 transition cursor-pointer"
                          >
                            <BookOpen className="w-3.5 h-3.5 text-[#2563EB]" />
                            <span>Resources</span>
                            {isResourcesOpen ? (
                              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                            )}
                          </button>

                          {isCompleted && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedCompletedDays((prev) =>
                                  prev.filter((d) => d !== dayItem.day)
                                )
                              }
                              className="text-xs text-slate-400 hover:text-slate-700 cursor-pointer"
                            >
                              Collapse
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="pl-8 space-y-3">
                        <p className="text-sm text-slate-600 dark:text-slate-300 leading-[22px]">
                          {dayTask}
                        </p>

                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          <strong className="font-semibold text-slate-800 dark:text-slate-200">
                            Deliverable:
                          </strong>{' '}
                          {dayDeliverable}
                        </div>

                        {/* Attached Proof Summary if Completed */}
                        {isCompleted && attachedRecord && (
                          <div className="pt-2 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span>Attached proof: {attachedRecord.title}</span>
                            {attachedRecord.url && (
                              <a
                                href={attachedRecord.url}
                                target="_blank"
                                rel="noreferrer"
                                className="underline inline-flex items-center gap-1"
                              >
                                <span>Open</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        )}

                        {/* Expanded Resources Drawer (YouTube / Udemy / Coursera, Best-Fit First) */}
                        {isResourcesOpen && (
                          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3">
                            {links.map((res, rIdx) => (
                              <a
                                key={`${res.platform}-${rIdx}`}
                                href={res.url}
                                target="_blank"
                                rel="noreferrer"
                                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 transition"
                              >
                                <span>
                                  {res.platform}
                                  {rIdx === 0 ? ' (Best fit)' : ''}
                                </span>
                                <ExternalLink className="w-3 h-3 text-slate-400" />
                              </a>
                            ))}
                          </div>
                        )}

                        {/* Inline "Attach proof" Field (Opened when checking a day; required before counting as done) */}
                        {isAttaching && (
                          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                            <p className="text-xs font-semibold text-slate-900 dark:text-white">
                              Attach your deliverable proof to mark Day {dayItem.day} complete:
                            </p>
                            <form
                              onSubmit={(e) =>
                                handleConfirmDayProofLink(e, dayItem.day, focusSkill)
                              }
                              className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
                            >
                              <input
                                type="url"
                                required
                                value={proofLinkInput}
                                onChange={(e) => setProofLinkInput(e.target.value)}
                                placeholder="https://github.com/username/sprint-day-proof"
                                aria-label={`Proof URL for Day ${dayItem.day}`}
                                className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#14171A] text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#2563EB]"
                              />
                              <button
                                type="submit"
                                disabled={savingProofDay === dayItem.day}
                                className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold transition cursor-pointer shrink-0"
                              >
                                {savingProofDay === dayItem.day
                                  ? 'Saving…'
                                  : 'Attach link & mark done'}
                              </button>

                              <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.webp"
                                onChange={(e) =>
                                  handleUploadDayProofFile(e, dayItem.day, focusSkill)
                                }
                                className="hidden"
                              />
                              <button
                                type="button"
                                disabled={savingProofDay === dayItem.day}
                                onClick={() => fileInputRef.current?.click()}
                                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[#2563EB] text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0"
                              >
                                {savingProofDay === dayItem.day ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <UploadCloud className="w-3.5 h-3.5 text-[#2563EB]" />
                                )}
                                <span>Or upload file</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setAttachingDay(null)}
                                className="px-2.5 py-2 text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </form>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Secondary Tab: Role Pivots (Enterprise & Government Tracks) */
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xs divide-y divide-slate-100 dark:divide-slate-800">
          {roadmapData.pivots.slice(0, 8).map((pivot) => (
            <div
              key={pivot.roleId}
              className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>{pivot.category}</span>
                  <span>·</span>
                  <span>{pivot.frictionLevel}</span>
                  <span>·</span>
                  <span className="font-mono font-semibold text-[#2563EB] dark:text-[#60A5FA] tabular-nums">
                    {pivot.pivotReadinessScore}% match
                  </span>
                </div>
                <h3 className="font-heading text-base font-semibold text-slate-900 dark:text-white">
                  {pivot.roleTitle}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Missing skills: {pivot.bridgeSkills.join(', ') || 'None'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  onSelectJobForMatch?.(
                    `${pivot.roleTitle} (${pivot.category})\n\n${
                      pivot.whyItFits
                    }\n\nRequired Skills: ${[
                      ...pivot.sharedSkills,
                      ...pivot.bridgeSkills,
                    ].join(', ')}`
                  );
                  onNavigate('match');
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[#2563EB] text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 transition cursor-pointer shrink-0 self-start sm:self-center"
              >
                <span>Match this role</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
};
