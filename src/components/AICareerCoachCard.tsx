import React, { useState, useEffect } from 'react';
import { CareerCoachResponse } from '../types';
import { fetchApi } from '../api';
import {
  Sparkles,
  Loader2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';

interface AICareerCoachCardProps {
  targetRole: string;
  selectedModelId: string;
  defaultSampleDuty?: string;
  onRefreshAiStatus?: () => void;
  onNotify?: (msg: string) => void;
}

export const AICareerCoachCard: React.FC<AICareerCoachCardProps> = ({
  targetRole,
  selectedModelId,
  defaultSampleDuty = 'Built full-stack web features, REST APIs, and database queries using React, TypeScript, and SQL.',
  onRefreshAiStatus,
  onNotify,
}) => {
  const [activeTab, setActiveTab] = useState<'interview' | 'bullets' | 'salary'>('interview');
  const [loading, setLoading] = useState(false);
  const [dataMap, setDataMap] = useState<Partial<Record<'interview' | 'bullets' | 'salary', CareerCoachResponse>>>({});
  const [dutyInput, setDutyInput] = useState(defaultSampleDuty);
  const [expandedQuestionIdx, setExpandedQuestionIdx] = useState<number | null>(0);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadCoachTab = async (tab: 'interview' | 'bullets' | 'salary', forceReload = false) => {
    if (!forceReload && dataMap[tab]) return;
    setLoading(true);
    try {
      const res = await fetchApi<CareerCoachResponse>('/career-coach', {
        method: 'POST',
        body: JSON.stringify({
          tab,
          sampleDuty: dutyInput,
          modelId: selectedModelId,
        }),
      });
      setDataMap((prev) => ({ ...prev, [tab]: res }));
      onRefreshAiStatus?.();
      if (forceReload) {
        onNotify?.(`Refreshed ${tab} insights via ${res.provider} (${res.latencyMs}ms)`);
      }
    } catch {
      onNotify?.('Could not load career coach insights.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCoachTab(activeTab, false);
  }, [activeTab]);

  const currentData = dataMap[activeTab];

  const handleCopyText = (text: string, key: string, label: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    onNotify?.(`Copied ${label} to clipboard`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <section className="rounded-2xl border border-slate-200/70 dark:border-white/5 bg-white dark:bg-[#181B1E] shadow-xs dark:shadow-sm p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>AI Career Coach</span>
            <span aria-hidden="true">·</span>
            <span>{targetRole}</span>
          </div>
          <h2 className="font-heading text-lg font-bold tracking-tight text-slate-900 dark:text-white mt-0.5">
            Interview Simulator, ATS Rewriter & Salary Bands
          </h2>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={() => loadCoachTab(activeTab, true)}
          className="px-3.5 py-2 rounded-xl bg-[#2A85FF] hover:bg-[#0069F6] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-60 self-start sm:self-auto"
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Running…</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              <span>Regenerate Tab</span>
            </>
          )}
        </button>
      </div>

      {/* Segmented 3-Tab Bar */}
      <div
        role="tablist"
        aria-label="AI Career Coach Tabs"
        className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#111315]"
      >
        {[
          { id: 'interview' as const, label: '1. Interview Simulator' },
          { id: 'bullets' as const, label: '2. ATS Bullet Rewriter' },
          { id: 'salary' as const, label: '3. Salary & Leveling' },
        ].map((t) => {
          const isSelected = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setActiveTab(t.id)}
              className={`py-2 px-3 rounded-lg text-xs font-semibold transition cursor-pointer ${
                isSelected
                  ? 'bg-white dark:bg-[#272B30] text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {loading && !currentData ? (
        <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-[#2A85FF]" />
          <span>Generating insights for {targetRole}…</span>
        </div>
      ) : (
        <div className="space-y-4">
          {/* TAB 1: INTERVIEW SIMULATOR */}
          {activeTab === 'interview' && currentData?.interviewQuestions && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                3 technical scenario questions targeting your unverified or missing skills, with model-answer hints:
              </p>
              {currentData.interviewQuestions.map((item, idx) => {
                const isOpen = expandedQuestionIdx === idx;
                return (
                  <div
                    key={idx}
                    className="rounded-xl border border-slate-200/70 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] p-4 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          Question {idx + 1} · Target Skill: <strong className="text-slate-800 dark:text-slate-200">{item.targetSkill}</strong>
                        </p>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white leading-snug">
                          {item.question}
                        </h3>
                      </div>

                      <button
                        type="button"
                        onClick={() => setExpandedQuestionIdx(isOpen ? null : idx)}
                        aria-expanded={isOpen}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <span>{isOpen ? 'Hide Hint' : 'Answer Hint'}</span>
                        {isOpen ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    {isOpen && (
                      <div className="pt-2.5 border-t border-slate-200/60 dark:border-white/10 space-y-2 text-xs">
                        <p className="text-slate-600 dark:text-slate-400">
                          <strong className="text-slate-800 dark:text-slate-200">What this tests:</strong>{' '}
                          {item.whyAsked}
                        </p>
                        <div className="p-3 rounded-lg bg-white dark:bg-[#111315] border border-slate-200/60 dark:border-white/5 flex items-start justify-between gap-3">
                          <p className="text-slate-700 dark:text-slate-200 leading-relaxed">
                            <strong className="text-[#76B900]">Model Answer Strategy:</strong>{' '}
                            {item.modelAnswerHint}
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopyText(
                                `Q: ${item.question}\nHint: ${item.modelAnswerHint}`,
                                `q-${idx}`,
                                'interview question & hint'
                              )
                            }
                            aria-label={`Copy question ${idx + 1}`}
                            className="p-1.5 rounded text-slate-400 hover:text-slate-900 dark:hover:text-white shrink-0"
                          >
                            {copiedKey === `q-${idx}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 2: ATS BULLET REWRITER */}
          {activeTab === 'bullets' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="ats-duty-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Plain Job Duty or Project Note (Never invents fake metrics — inserts [X%] placeholders):
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    id="ats-duty-input"
                    type="text"
                    value={dutyInput}
                    onChange={(e) => setDutyInput(e.target.value)}
                    placeholder="e.g. Built REST APIs and frontend dashboard in React and Node.js"
                    className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#111315] text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#2A85FF]"
                  />
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => loadCoachTab('bullets', true)}
                    className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 transition cursor-pointer shrink-0"
                  >
                    Rewrite Duty
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                {(currentData?.rewrittenBullets || []).map((item, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl border border-slate-200/70 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-[#2A85FF]">
                        {item.originalConcept}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyText(
                            item.rewrittenBullet,
                            `b-${idx}`,
                            'ATS bullet'
                          )
                        }
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                      >
                        {copiedKey === `b-${idx}` ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Bullet</span>
                          </>
                        )}
                      </button>
                    </div>

                    <p className="text-xs font-medium text-slate-900 dark:text-white leading-relaxed">
                      {item.rewrittenBullet}
                    </p>

                    {item.placeholdersToFill && item.placeholdersToFill.length > 0 && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">
                        Fill your real numbers: {item.placeholdersToFill.join(' · ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: SALARY & LEVEL BENCHMARKING */}
          {activeTab === 'salary' && currentData?.salaryBenchmark && (
            <div className="space-y-4">
              {/* Honest Indicative Estimate Disclaimer */}
              <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                <Info className="w-4 h-4 text-amber-500 shrink-0" />
                <span>
                  <strong>Indicative estimate, not live data:</strong>{' '}
                  {currentData.salaryBenchmark.disclaimer}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* India Bands */}
                <div className="p-4 rounded-xl border border-slate-200/70 dark:border-white/10 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    India Tech Hubs (INR LPA · Indicative)
                  </h3>
                  <div className="divide-y divide-slate-200/60 dark:divide-white/5">
                    {currentData.salaryBenchmark.indiaRanges.map((band, i) => (
                      <div key={i} className="py-2.5 first:pt-0 last:pb-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                            {band.level}
                          </span>
                          <span className="font-mono text-xs font-bold text-[#2A85FF] tabular-nums">
                            {band.rangeInr}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {band.notes}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Global Remote + Government Equivalent */}
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-slate-200/70 dark:border-white/10 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Global Remote (USD / Yr · Indicative)
                    </h3>
                    <div className="divide-y divide-slate-200/60 dark:divide-white/5">
                      {currentData.salaryBenchmark.globalRemoteRanges.map((band, i) => (
                        <div key={i} className="py-2 first:pt-0 last:pb-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                              {band.level}
                            </span>
                            <span className="font-mono text-xs font-bold text-emerald-600 dark:text-[#76B900] tabular-nums">
                              {band.rangeUsd}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {band.notes}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {currentData.salaryBenchmark.govComparison && (
                    <div className="p-4 rounded-xl border border-slate-200/70 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.02] space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Public Sector Equivalent · {currentData.salaryBenchmark.govComparison.cadre}
                      </p>
                      <p className="font-mono text-xs font-bold text-slate-900 dark:text-white tabular-nums">
                        {currentData.salaryBenchmark.govComparison.payLevel}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {currentData.salaryBenchmark.govComparison.allowancesNote}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Honest Provider Footer */}
          {currentData && (
            <div className="pt-2 border-t border-slate-200/60 dark:border-white/5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono">
              <span>
                Answered by: {currentData.provider} · {currentData.model}
              </span>
              <span className="tabular-nums">{currentData.latencyMs}ms</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
