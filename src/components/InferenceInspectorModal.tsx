import React, { useEffect, useRef, useState } from 'react';
import { AIProviderStatus } from '../types';
import { fetchApi } from '../api';
import { DEMO_PROFILES } from '../utils/skillMatcher';
import {
  X,
  Settings,
  Cpu,
  Activity,
  CheckCircle2,
  AlertCircle,
  Zap,
  Loader2,
  Clock,
  ChevronDown,
  ChevronUp,
  Users,
} from 'lucide-react';

export type ViewerMode = 'jobseeker' | 'student';

interface InferenceInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  aiStatus: AIProviderStatus | null;
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
  onRefreshStatus: () => void;
  onNotify?: (msg: string) => void;
  viewerMode?: ViewerMode;
  onChangeViewerMode?: (mode: ViewerMode) => void;
  onLoadDemoPreset?: (presetId: string) => void;
}

export const InferenceInspectorModal: React.FC<InferenceInspectorModalProps> = ({
  isOpen,
  onClose,
  aiStatus,
  selectedModelId,
  onSelectModel,
  onRefreshStatus,
  onNotify,
  viewerMode = 'jobseeker',
  onChangeViewerMode,
  onLoadDemoPreset,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [testingPing, setTestingPing] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [loadingPresetId, setLoadingPresetId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    dialogRef.current?.focus();
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const models = aiStatus?.models || [];
  const recentCalls = aiStatus?.recentCalls || [];
  const anyConfigured = Boolean(aiStatus?.anyKeyConfigured);

  const handleTestInference = async () => {
    setTestingPing(true);
    try {
      const res = await fetchApi<{
        provider: string;
        model: string;
        latencyMs: number;
        isFallback: boolean;
      }>('/ai-coach', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'interview',
          modelId: selectedModelId,
        }),
      });
      onRefreshStatus();
      onNotify?.(
        `Inference verified via ${res.provider} (${res.model}) in ${res.latencyMs}ms`
      );
    } catch {
      onNotify?.('Inference test completed with built-in fallback.');
      onRefreshStatus();
    } finally {
      setTestingPing(false);
    }
  };

  const handleQuickDemo = async (presetId: string) => {
    if (!onLoadDemoPreset) return;
    setLoadingPresetId(presetId);
    try {
      await onLoadDemoPreset(presetId);
    } finally {
      setLoadingPresetId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        tabIndex={-1}
        className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181B1E] shadow-xl overflow-hidden focus:outline-none"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#2563EB]/10 text-[#2563EB] flex items-center justify-center">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="settings-modal-title"
                className="font-heading text-lg font-semibold text-slate-900 dark:text-white"
              >
                Settings
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Viewer preferences, demo profiles, and advanced AI model settings
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Settings"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
          {/* 1. Viewer Mode Setting ("jobseeker" | "student") */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Viewer mode
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Choose how ApplyWise tailors your career readiness experience.
              </p>
            </div>
            <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => onChangeViewerMode?.('jobseeker')}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  viewerMode === 'jobseeker'
                    ? 'bg-white dark:bg-[#181B1E] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Job seeker (Default)
              </button>
              <button
                type="button"
                onClick={() => onChangeViewerMode?.('student')}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  viewerMode === 'student'
                    ? 'bg-white dark:bg-[#181B1E] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Student
              </button>
            </div>
          </div>

          {/* 2. Demo Profile Switcher */}
          {onLoadDemoPreset && (
            <div className="pt-5 space-y-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#2563EB]" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Load sample profile
                </h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Populate your workspace with a complete demo profile, evidence links, and job match.
              </p>
              <div className="flex flex-wrap gap-2">
                {DEMO_PROFILES.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={Boolean(loadingPresetId)}
                    onClick={() => handleQuickDemo(preset.id)}
                    className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[#2563EB] text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-2 transition cursor-pointer"
                  >
                    {loadingPresetId === preset.id && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2563EB]" />
                    )}
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 3. Advanced Section: Model Picker + Latency & Provider Telemetry */}
          <div className="pt-5 space-y-4">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between text-left focus:outline-none"
            >
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-[#2563EB]" />
                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                  Advanced — AI model & latency inspector
                </span>
              </div>
              {showAdvanced ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {showAdvanced && (
              <div className="space-y-5 pt-2">
                {/* Active Engine Status */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {anyConfigured ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {anyConfigured
                          ? `Active provider: ${aiStatus?.activeProvider}`
                          : 'Using built-in deterministic analysis (no API key set)'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
                        {anyConfigured
                          ? `Model: ${aiStatus?.activeModel} · Last latency: ${
                              aiStatus?.lastLatencyMs != null
                                ? `${aiStatus.lastLatencyMs}ms`
                                : 'No call yet'
                            }`
                          : 'Set NVIDIA_API_KEY, NEBIUS_API_KEY, or GEMINI_API_KEY in environment variables.'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={testingPing}
                    onClick={handleTestInference}
                    className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:border-[#2563EB] text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 shrink-0 transition cursor-pointer disabled:opacity-50"
                  >
                    {testingPing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Testing…</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5 text-[#2563EB]" />
                        <span>Test latency</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Model Picker */}
                <div>
                  <label
                    htmlFor="inspector-model-switcher"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
                  >
                    Inference model
                  </label>
                  <select
                    id="inspector-model-switcher"
                    value={selectedModelId}
                    onChange={(e) => onSelectModel(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111315] text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-[#2563EB]"
                  >
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} ({m.providerName})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Configured Providers */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      name: 'NVIDIA NIM',
                      envVar: 'NVIDIA_API_KEY',
                      configured: Boolean(aiStatus?.nvidiaConfigured),
                    },
                    {
                      name: 'Nebius AI Studio',
                      envVar: 'NEBIUS_API_KEY',
                      configured: Boolean(aiStatus?.nebiusConfigured),
                    },
                    {
                      name: 'Google Gemini',
                      envVar: 'GEMINI_API_KEY',
                      configured: Boolean(aiStatus?.geminiConfigured),
                    },
                  ].map((prov) => (
                    <div
                      key={prov.envVar}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-900 dark:text-white">
                          {prov.name}
                        </span>
                        <span
                          className={`text-xs font-mono ${
                            prov.configured
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {prov.configured ? 'Configured' : 'Not set'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-mono mt-1">{prov.envVar}</p>
                    </div>
                  ))}
                </div>

                {/* Recent Inference Latency Log */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5" />
                      <span>Recent calls ({recentCalls.length})</span>
                    </span>
                    <span className="text-xs text-slate-400 font-mono tabular-nums">
                      Measured latency (ms)
                    </span>
                  </div>

                  {recentCalls.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 py-3">
                      No inference calls recorded in this session yet.
                    </p>
                  ) : (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-slate-500">
                            <th className="py-2 px-3 font-medium">Time</th>
                            <th className="py-2 px-3 font-medium">Endpoint</th>
                            <th className="py-2 px-3 font-medium">Provider & model</th>
                            <th className="py-2 px-3 font-medium text-right">Latency</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {recentCalls.slice(0, 8).map((call) => (
                            <tr key={call.id} className="text-slate-700 dark:text-slate-300">
                              <td className="py-2 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap tabular-nums">
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="w-3 h-3 opacity-60" />
                                  {new Date(call.timestamp).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit',
                                  })}
                                </span>
                              </td>
                              <td className="py-2 px-3 font-mono text-[11px]">{call.endpoint}</td>
                              <td className="py-2 px-3">
                                <span className="font-medium text-slate-900 dark:text-white">
                                  {call.provider}
                                </span>{' '}
                                <span className="text-slate-400 font-mono text-[11px]">
                                  · {call.model}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right font-mono tabular-nums">
                                {call.latencyMs}ms
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
