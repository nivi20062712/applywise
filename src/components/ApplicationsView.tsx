import React, { useState } from 'react';
import { ApplicationItem, AnalysisData } from '../types';
import { fetchApi } from '../api';
import { ViewerMode } from './InferenceInspectorModal';
import {
  Plus,
  Kanban,
  List,
  Trash2,
  Calendar,
  GripVertical,
  X,
} from 'lucide-react';

interface ApplicationsViewProps {
  applications: ApplicationItem[];
  analysis: AnalysisData | null;
  viewerMode?: ViewerMode;
  onRefresh: () => void;
  onNotify: (msg: string) => void;
}

const KANBAN_COLUMNS: Array<ApplicationItem['status']> = [
  'Saved',
  'Preparing',
  'Applied',
  'Interview',
  'Offer',
  'Rejected',
];

const NEXT_STEP_BY_STATUS: Record<ApplicationItem['status'], string> = {
  Saved: 'Tailor résumé bullets in Résumé Studio',
  Preparing: 'Attach missing skill proof before submitting',
  Applied: 'Follow up with recruiter in 5 business days',
  Interview: 'Practice technical questions in Interview prep',
  Offer: 'Compare compensation band & sign offer',
  Rejected: 'Review feedback & target adjacent roles',
};

export const ApplicationsView: React.FC<ApplicationsViewProps> = ({
  applications,
  analysis,
  viewerMode = 'jobseeker',
  onRefresh,
  onNotify,
}) => {
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [showAddModal, setShowAddModal] = useState(false);
  const [draggedAppId, setDraggedAppId] = useState<number | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    company: analysis?.company || '',
    job_title: analysis?.jobTitle || '',
    status: 'Saved' as ApplicationItem['status'],
    application_date: new Date().toISOString().slice(0, 10),
    follow_up_date: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const defaultMatchScore = analysis?.readinessScore || 76;

  const extractMatchPercent = (app: ApplicationItem): number => {
    const match = /(\d{1,3})%/.exec(app.notes || '');
    if (match) return Number(match[1]);
    return defaultMatchScore;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.company.trim() || !formData.job_title.trim()) return;

    setSaving(true);
    try {
      await fetchApi('/applications', {
        method: 'POST',
        body: JSON.stringify({
          ...formData,
          analysis_id: analysis?.id || null,
        }),
      });

      setShowAddModal(false);
      setFormData({
        company: '',
        job_title: '',
        status: 'Saved',
        application_date: new Date().toISOString().slice(0, 10),
        follow_up_date: '',
        notes: '',
      });
      onRefresh();
      onNotify('Saved application to your board.');
    } catch {
      onNotify('Could not save application.');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id: number, newStatus: ApplicationItem['status']) => {
    try {
      await fetchApi(`/applications/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      onRefresh();
      onNotify(`Moved application to ${newStatus}.`);
    } catch {
      onNotify('Could not update application status.');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await fetchApi(`/applications/${id}`, { method: 'DELETE' });
      onRefresh();
      onNotify('Removed application.');
    } catch {
      onNotify('Could not remove application.');
    }
  };

  const handleDropOnColumn = async (column: ApplicationItem['status']) => {
    setDragOverColumn(null);
    if (draggedAppId == null) return;
    const targetApp = applications.find((a) => a.id === draggedAppId);
    setDraggedAppId(null);
    if (!targetApp || targetApp.status === column) return;
    await handleStatusChange(targetApp.id, column);
  };

  return (
    <div className="space-y-6" data-viewer-mode={viewerMode}>
      {/* Toolbar: View Mode Toggle (Kanban / List) + Primary Action when populated */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setViewMode('kanban')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${
              viewMode === 'kanban'
                ? 'bg-white dark:bg-[#181B1E] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Kanban className="w-3.5 h-3.5" />
            <span>Kanban board</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${
              viewMode === 'list'
                ? 'bg-white dark:bg-[#181B1E] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>List view</span>
          </button>
        </div>

        {applications.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add application</span>
          </button>
        )}
      </div>

      {/* Empty State: Illustration, One "Save your first application" Button, and Faded Preview of the 6 Columns */}
      {applications.length === 0 ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xs p-8 sm:p-10 text-center max-w-xl mx-auto space-y-5">
            {/* Clean SVG Illustration */}
            <div className="w-16 h-16 rounded-2xl bg-[#2563EB]/10 text-[#2563EB] flex items-center justify-center mx-auto">
              <svg viewBox="0 0 48 48" className="w-9 h-9" fill="none">
                <rect
                  x="6"
                  y="10"
                  width="10"
                  height="28"
                  rx="3"
                  stroke="currentColor"
                  strokeWidth="2.5"
                />
                <rect
                  x="19"
                  y="10"
                  width="10"
                  height="20"
                  rx="3"
                  stroke="currentColor"
                  strokeWidth="2.5"
                />
                <rect
                  x="32"
                  y="10"
                  width="10"
                  height="24"
                  rx="3"
                  stroke="currentColor"
                  strokeWidth="2.5"
                />
              </svg>
            </div>

            <div className="space-y-1.5">
              <h2 className="font-heading text-lg font-semibold text-slate-900 dark:text-white">
                Track every role from saved to offer
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-[22px]">
                Drag and drop applications across stages, see your verified match percentage on every card, and keep your next follow-up visible.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold inline-flex items-center gap-2 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Save your first application</span>
            </button>
          </section>

          {/* Faded Preview of the 6 Columns */}
          <div
            aria-hidden="true"
            className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 opacity-45 pointer-events-none select-none"
          >
            {KANBAN_COLUMNS.map((col) => (
              <div
                key={col}
                className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/50 dark:bg-[#181B1E]/50 p-4 min-h-[160px] space-y-3"
              >
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>{col}</span>
                  <span className="font-mono">0</span>
                </div>
                <div className="h-16 rounded-xl bg-slate-100 dark:bg-slate-800/70" />
              </div>
            ))}
          </div>
        </div>
      ) : viewMode === 'kanban' ? (
        /* Kanban Board: Saved -> Preparing -> Applied -> Interview -> Offer -> Rejected */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-start">
          {KANBAN_COLUMNS.map((column) => {
            const colApps = applications.filter((a) => a.status === column);
            const isOver = dragOverColumn === column;

            return (
              <div
                key={column}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverColumn(column);
                }}
                onDragLeave={() => setDragOverColumn(null)}
                onDrop={() => handleDropOnColumn(column)}
                className={`rounded-2xl border p-3.5 min-h-[380px] transition flex flex-col gap-3 ${
                  isOver
                    ? 'border-[#2563EB] bg-[#2563EB]/5'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-[#14171A]'
                }`}
              >
                <div className="px-1 flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {column}
                  </h3>
                  <span className="text-xs font-mono font-semibold text-slate-500 tabular-nums">
                    {colApps.length}
                  </span>
                </div>

                <div className="space-y-2.5 flex-1">
                  {colApps.map((app) => {
                    const matchPct = extractMatchPercent(app);
                    const nextStepText =
                      app.notes && !app.notes.startsWith('Matched via')
                        ? app.notes
                        : NEXT_STEP_BY_STATUS[app.status] || 'Review role requirements';

                    return (
                      <div
                        key={app.id}
                        draggable
                        onDragStart={() => setDraggedAppId(app.id)}
                        onDragEnd={() => {
                          setDraggedAppId(null);
                          setDragOverColumn(null);
                        }}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xs p-3.5 space-y-2.5 cursor-grab active:cursor-grabbing"
                      >
                        {/* Company + Match % */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <GripVertical className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 shrink-0" />
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 truncate">
                              {app.company}
                            </span>
                          </div>
                          <span className="text-xs font-mono font-bold text-[#2563EB] dark:text-[#60A5FA] tabular-nums shrink-0">
                            {matchPct}%
                          </span>
                        </div>

                        {/* Role */}
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-white leading-snug">
                          {app.job_title}
                        </h4>

                        {/* Date */}
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono tabular-nums">
                          <Calendar className="w-3 h-3 shrink-0" />
                          <span>{app.application_date || 'Today'}</span>
                        </div>

                        {/* Next Step */}
                        <p className="text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800 leading-relaxed">
                          Next: <span className="text-slate-700 dark:text-slate-300">{nextStepText}</span>
                        </p>

                        {/* Accessible Keyboard Status Select + Delete */}
                        <div className="pt-1 flex items-center justify-between gap-2">
                          <select
                            aria-label={`Change stage for ${app.job_title}`}
                            value={app.status}
                            onChange={(e) =>
                              handleStatusChange(
                                app.id,
                                e.target.value as ApplicationItem['status']
                              )
                            }
                            className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300"
                          >
                            {KANBAN_COLUMNS.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            onClick={() => handleDelete(app.id)}
                            aria-label={`Delete ${app.job_title}`}
                            className="p-1 text-slate-400 hover:text-red-600 transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View Toggle */
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-6 font-medium">Company & role</th>
                  <th className="py-3 px-4 font-medium">Match %</th>
                  <th className="py-3 px-4 font-medium">Date</th>
                  <th className="py-3 px-4 font-medium">Next step</th>
                  <th className="py-3 px-4 font-medium">Stage</th>
                  <th className="py-3 px-6 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {applications.map((app) => {
                  const matchPct = extractMatchPercent(app);
                  const nextStepText =
                    app.notes && !app.notes.startsWith('Matched via')
                      ? app.notes
                      : NEXT_STEP_BY_STATUS[app.status] || 'Review role requirements';

                  return (
                    <tr key={app.id}>
                      <td className="py-3.5 px-6">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {app.job_title}
                        </div>
                        <div className="text-xs text-slate-500">{app.company}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-[#2563EB] dark:text-[#60A5FA] tabular-nums">
                        {matchPct}%
                      </td>
                      <td className="py-3.5 px-4 text-xs font-mono text-slate-500 tabular-nums">
                        {app.application_date || 'Today'}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-300">
                        {nextStepText}
                      </td>
                      <td className="py-3.5 px-4">
                        <select
                          aria-label={`Change stage for ${app.job_title}`}
                          value={app.status}
                          onChange={(e) =>
                            handleStatusChange(
                              app.id,
                              e.target.value as ApplicationItem['status']
                            )
                          }
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#14171A] text-xs font-medium"
                        >
                          {KANBAN_COLUMNS.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3.5 px-6 text-right">
                        <button
                          type="button"
                          onClick={() => handleDelete(app.id)}
                          aria-label={`Delete ${app.job_title}`}
                          className="text-xs text-red-600 hover:underline cursor-pointer"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Modal: Save Application */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddModal(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-app-modal-title"
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3
                id="add-app-modal-title"
                className="font-heading text-lg font-semibold text-slate-900 dark:text-white"
              >
                Save application
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                aria-label="Close modal"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Company
                </label>
                <input
                  type="text"
                  required
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  placeholder="e.g. Google, Zoho, ISRO"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#14171A] text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Role title
                </label>
                <input
                  type="text"
                  required
                  value={formData.job_title}
                  onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
                  placeholder="e.g. Software Engineer"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#14171A] text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Stage
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        status: e.target.value as ApplicationItem['status'],
                      })
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#14171A] text-sm text-slate-900 dark:text-white"
                  >
                    {KANBAN_COLUMNS.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={formData.application_date}
                    onChange={(e) =>
                      setFormData({ ...formData, application_date: e.target.value })
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#14171A] text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Next step (optional)
                </label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="e.g. Complete system design proof before interview"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#14171A] text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
