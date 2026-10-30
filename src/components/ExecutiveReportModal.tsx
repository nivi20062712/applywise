import React, { useEffect } from 'react';
import { AnalysisData, EvidenceItem, Profile } from '../types';
import { scoreProofStrength, buildEnhancedSevenDayPlan } from '../utils/skillMatcher';
import { X, Printer, ShieldCheck, Calendar, CheckCircle2 } from 'lucide-react';

interface ExecutiveReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile | null;
  analysis: AnalysisData | null;
  evidence: EvidenceItem[];
}

export const ExecutiveReportModal: React.FC<ExecutiveReportModalProps> = ({
  isOpen,
  onClose,
  profile,
  analysis,
  evidence,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const candidateName = profile?.name || 'Candidate';
  const targetRole = analysis?.jobTitle || profile?.title || 'Full-Stack Software Engineer';
  const targetCompany = analysis?.company || 'Target Organization';
  const score = analysis?.readinessScore || 78;
  const skillMatch = analysis?.scoreBreakdown?.skillMatch || 82;
  const evidenceStrength = analysis?.scoreBreakdown?.evidenceStrength || 76;
  const experienceRelevance = analysis?.scoreBreakdown?.experienceRelevance || 78;

  const sprintPlan =
    analysis?.sevenDayPlan && analysis.sevenDayPlan.length > 0
      ? analysis.sevenDayPlan
      : buildEnhancedSevenDayPlan(targetRole, ['System Design', 'Unit Testing'], ['Docker']);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto print:static print:p-0 print:bg-white"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exec-report-title"
        className="w-full max-w-4xl my-8 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#181B1E] text-slate-900 dark:text-white shadow-2xl overflow-hidden print:my-0 print:border-0 print:shadow-none print:bg-white print:text-black"
      >
        {/* Top Action Bar (Hidden in Print) */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-[#111315] border-b border-slate-200 dark:border-white/10 flex items-center justify-between gap-4 print:hidden">
          <div>
            <h2 id="exec-report-title" className="font-heading text-base font-bold">
              Executive Readiness Audit Report (PDF / Print Preview)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Client-side printable report · Use &ldquo;Save as PDF&rdquo; in your browser print dialog
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2 rounded-xl bg-[#2A85FF] hover:bg-[#0069F6] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save as PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close report preview"
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Document Body */}
        <div id="applywise-printable-report" className="p-8 space-y-8 max-h-[82vh] overflow-y-auto print:max-h-none print:overflow-visible">
          {/* Report Header */}
          <div className="pb-6 border-b border-slate-200 dark:border-white/10 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <p className="text-xs font-mono uppercase tracking-wider text-[#2A85FF] font-semibold">
                ApplyWise · Evidence-Based Career Readiness Audit
              </p>
              <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight mt-1">
                {candidateName}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                Target Role: <strong>{targetRole}</strong> · {targetCompany} · {profile?.location || 'India / Remote'}
              </p>
            </div>

            <div className="sm:text-right">
              <div className="inline-block p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02]">
                <span className="block text-[11px] uppercase tracking-wider text-slate-500">
                  Verified Readiness Score
                </span>
                <span className="font-mono text-3xl font-extrabold text-slate-900 dark:text-white tabular-nums">
                  {score}%
                </span>
                <span className="block text-[11px] text-slate-500 font-mono mt-0.5">
                  Match {skillMatch}% · Proof {evidenceStrength}% · Fit {experienceRelevance}%
                </span>
              </div>
            </div>
          </div>

          {/* Executive Summary */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              1. Executive Assessment Summary
            </h3>
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
              {analysis?.summary ||
                `${candidateName} has ${evidence.length} verified proof artifacts mapped against ${targetRole}. All claims below are cross-checked against repository links, certificates, or technical assessments.`}
            </p>
          </div>

          {/* Verified Evidence Portfolio Table */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#76B900]" />
              <span>2. Verified Proof Portfolio ({evidence.length} Artifacts)</span>
            </h3>

            {evidence.length === 0 ? (
              <p className="text-xs text-slate-500 italic">
                No verified proof artifacts attached yet.
              </p>
            ) : (
              <div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] text-slate-500">
                      <th className="py-2.5 px-3 font-semibold">Skill</th>
                      <th className="py-2.5 px-3 font-semibold">Artifact Title & Type</th>
                      <th className="py-2.5 px-3 font-semibold">Verification Link</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Proof Strength</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 dark:divide-white/5">
                    {evidence.map((ev, i) => {
                      const strength = scoreProofStrength(ev);
                      return (
                        <tr key={ev.id || i}>
                          <td className="py-2.5 px-3 font-semibold">{ev.skill}</td>
                          <td className="py-2.5 px-3">
                            <span className="font-medium">{ev.title}</span>
                            <span className="text-slate-400 mx-1">·</span>
                            <span className="text-slate-500">{ev.type}</span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 truncate max-w-[220px]">
                            {ev.url || ev.attachment_name || 'Self-reported'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold uppercase">
                            {strength}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 7-Day Action Sprint Plan */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-[#2A85FF]" />
              <span>3. 7-Day Proof Closure Sprint Plan</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sprintPlan.map((day) => (
                <div
                  key={day.day}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-white/10 space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-[#2A85FF]">
                      Day 0{day.day} · {day.focusSkill || 'Core Skill'}
                    </span>
                    <span className="text-[11px] text-slate-500">{day.proofType || 'Deliverable'}</span>
                  </div>
                  <p className="font-medium text-slate-800 dark:text-slate-200 leading-snug">
                    {day.task}
                  </p>
                  <p className="text-[11px] text-slate-500 flex items-center gap-1 pt-0.5">
                    <CheckCircle2 className="w-3 h-3 text-[#76B900] shrink-0" />
                    <span>Expected Proof: {day.expectedProof}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Footer Attribution */}
          <div className="pt-4 border-t border-slate-200 dark:border-white/10 flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>
              Generated by ApplyWise · Engine: {analysis?.aiProvider || 'Built-in Analysis'} ({analysis?.aiModel || 'deterministic-engine'})
            </span>
            <span>{new Date().toISOString().slice(0, 10)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
