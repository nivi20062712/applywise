import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  AIProviderStatus,
  AnalysisData,
  CopilotChatMessage,
  EvidenceItem,
  Profile,
} from '../types';
import { streamAiChat } from '../api';
import { buildClientCopilotVault } from '../utils/copilotEngine';
import { ReadinessGauge } from './ReadinessGauge';
import { ViewerMode } from './InferenceInspectorModal';
import {
  Sparkles,
  X,
  Send,
  Loader2,
  Copy,
  Check,
  ShieldCheck,
  RefreshCw,
  Square,
  AlertCircle,
  AlertTriangle,
  Cpu,
  CheckCircle2,
  CircleDot,
  CircleDashed,
  User,
  Plus,
  Globe,
  ExternalLink,
} from 'lucide-react';

interface AICopilotModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile | null;
  analysis: AnalysisData | null;
  evidence: EvidenceItem[];
  viewerMode: ViewerMode;
  selectedModelId: string;
  aiStatus?: AIProviderStatus | null;
  onRefreshAIStatus?: () => void;
  onNavigate: (page: string) => void;
  onInspectSkill: (skillName: string) => void;
}

const SUGGESTION_PROMPTS: string[] = [
  'Which 2 skills will raise my readiness score the fastest?',
  'Design a 2-hour weekend project that proves my top unproven skills',
  'What skills are Software Engineer employers asking for right now?',
  'Find live openings that match my verified skills.',
  'Compare my readiness for Enterprise Product vs UPSC / NIC Scientist-B',
  'How should I phrase my self-declared skills honestly on my résumé?',
];

/**
 * Rich markdown renderer for streamed chat answers:
 * Supports markdown tables, fenced code blocks, headings, bullet/numbered lists, bold, italic, and inline code.
 */
function renderFormattedAnswer(text: string): React.ReactNode {
  if (!text) return null;
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  const formatInline = (lineText: string): React.ReactNode[] => {
    const parts = lineText.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return (
          <strong key={idx} className="font-semibold text-slate-900 dark:text-white">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        return (
          <code
            key={idx}
            className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-xs text-slate-800 dark:text-slate-200"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        return (
          <em key={idx} className="italic text-slate-800 dark:text-slate-200">
            {part.slice(1, -1)}
          </em>
        );
      }
      return part;
    });
  };

  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // 1. Fenced code block
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      elements.push(
        <pre
          key={`code-${i}`}
          className="my-2 p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto leading-relaxed"
        >
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // 2. Markdown table block
    if (
      trimmed.startsWith('|') &&
      trimmed.endsWith('|') &&
      i + 1 < lines.length &&
      /^\s*\|[\s:-]+\|/.test(lines[i + 1])
    ) {
      const parseCells = (rowStr: string) =>
        rowStr
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim());

      const headers = parseCells(trimmed);
      i += 2; // skip header + separator line
      const rows: string[][] = [];
      while (
        i < lines.length &&
        lines[i].trim().startsWith('|') &&
        lines[i].trim().endsWith('|')
      ) {
        if (!/^\s*\|[\s:-]+\|\s*$/.test(lines[i])) {
          rows.push(parseCells(lines[i]));
        }
        i++;
      }

      elements.push(
        <div
          key={`tbl-${i}`}
          className="my-2 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800"
        >
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800/90 text-slate-800 dark:text-slate-100">
                {headers.map((h, hIdx) => (
                  <th
                    key={hIdx}
                    className="px-3 py-2 font-semibold border-b border-slate-200 dark:border-slate-700"
                  >
                    {formatInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {rows.map((r, rIdx) => (
                <tr
                  key={rIdx}
                  className="bg-white dark:bg-slate-950/60 text-slate-700 dark:text-slate-200"
                >
                  {headers.map((_, cIdx) => (
                    <td key={cIdx} className="px-3 py-2 align-top leading-relaxed">
                      {formatInline(r[cIdx] || '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (!trimmed) {
      elements.push(<div key={`sp-${i}`} className="h-1.5" />);
      i++;
      continue;
    }

    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4
          key={`h4-${i}`}
          className="font-heading text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 pt-1.5"
        >
          {formatInline(trimmed.slice(4))}
        </h4>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
      const headingText = trimmed.replace(/^#{1,2}\s+/, '');
      elements.push(
        <h3
          key={`h3-${i}`}
          className="font-heading text-sm font-bold text-slate-900 dark:text-white pt-1.5"
        >
          {formatInline(headingText)}
        </h3>
      );
      i++;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const isIndented = rawLine.startsWith('  ') || rawLine.startsWith('\t');
      elements.push(
        <div
          key={`li-${i}`}
          className={`flex items-start gap-2 text-sm leading-relaxed text-slate-700 dark:text-slate-200 ${
            isIndented ? 'pl-4' : ''
          }`}
        >
          <span className="mt-2 w-1.5 h-1.5 rounded-full bg-[#2563EB] shrink-0" />
          <div className="flex-1">{formatInline(trimmed.replace(/^[-*]\s+/, ''))}</div>
        </div>
      );
      i++;
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const match = trimmed.match(/^(\d+\.)\s+(.*)$/);
      if (match) {
        elements.push(
          <div
            key={`num-${i}`}
            className="flex items-start gap-2 text-sm leading-relaxed text-slate-700 dark:text-slate-200"
          >
            <span className="font-mono text-xs font-bold text-[#2563EB] mt-0.5 shrink-0">
              {match[1]}
            </span>
            <div className="flex-1">{formatInline(match[2])}</div>
          </div>
        );
        i++;
        continue;
      }
    }

    elements.push(
      <p
        key={`p-${i}`}
        className="text-sm leading-relaxed text-slate-700 dark:text-slate-200"
      >
        {formatInline(trimmed)}
      </p>
    );
    i++;
  }

  return <div className="space-y-1.5">{elements}</div>;
}

export const AICopilotModal: React.FC<AICopilotModalProps> = ({
  isOpen,
  onClose,
  profile,
  analysis,
  evidence,
  viewerMode,
  aiStatus,
  onRefreshAIStatus,
  onInspectSkill,
}) => {
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<CopilotChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [retryingAiStatus, setRetryingAiStatus] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);

  const isAiOffline = !aiStatus?.nebiusConfigured;

  const handleRetryAiStatus = async () => {
    setRetryingAiStatus(true);
    try {
      await onRefreshAIStatus?.();
    } finally {
      setRetryingAiStatus(false);
    }
  };

  const inputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const targetRole =
    analysis?.jobTitle || profile?.title || 'Full-Stack Software Engineer';

  // Compute the shared Proof Vault summary in code via getSkillStatus()
  const vault = useMemo(
    () =>
      buildClientCopilotVault({
        profile,
        evidence,
        analysis,
        targetRole,
      }),
    [profile, evidence, analysis, targetRole]
  );

  // Scroll to bottom when messages update or streaming progresses
  useEffect(() => {
    if (isOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, isOpen]);

  // Focus input when modal opens; abort in-flight stream when closed
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else {
      abortControllerRef.current?.abort();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStopRequest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setMessages((prev) =>
      prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
    );
    setLoading(false);
  };

  /**
   * "New chat" button: aborts any active stream and clears the conversation history.
   */
  const handleNewChat = () => {
    handleStopRequest();
    setMessages([]);
    setErrorMessage(null);
    setInputText('');
    setTimeout(() => {
      inputRef.current?.focus();
    }, 30);
  };

  /**
   * Stream the full conversation history (`messages: [{ role, content }...]`) to POST /api/ai/chat.
   */
  const sendConversationToChat = async (
    conversationMessages: CopilotChatMessage[]
  ) => {
    handleStopRequest();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setErrorMessage(null);
    setLoading(true);

    const assistantMsgId = `assistant-${Date.now()}`;
    const placeholderAssistant: CopilotChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      isStreaming: true,
      groundedInProofVault: true,
    };

    setMessages([...conversationMessages, placeholderAssistant]);

    const payloadMessages = conversationMessages
      .filter((m) => (m.content || m.text || '').trim().length > 0)
      .map((m) => ({
        role: m.role,
        content: (m.content || m.text || '').trim(),
      }));

    try {
      await streamAiChat({
        messages: payloadMessages,
        viewerMode,
        targetRole,
        vault,
        webSearch: webSearchEnabled,
        signal: controller.signal,
        onMeta: (meta) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    modelTier: meta.modelTier,
                    modelTierLabel: meta.modelTierLabel,
                    modelId: meta.modelId,
                    groundedInProofVault: meta.groundedInProofVault,
                    sources: meta.sources,
                    webSearched: meta.webSearched,
                  }
                : m
            )
          );
        },
        onToken: (delta) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: (m.content || '') + delta,
                  }
                : m
            )
          );
        },
        onDone: (summary) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: summary.fullText || m.content,
                    isStreaming: false,
                    modelTier: summary.modelTier || m.modelTier,
                    modelTierLabel: summary.modelTierLabel || m.modelTierLabel,
                    modelId: summary.modelId || m.modelId,
                    latencyMs: summary.latencyMs,
                  }
                : m
            )
          );
          onRefreshAIStatus?.();
        },
      });
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      // Remove empty assistant placeholder if no tokens were streamed
      setMessages((prev) =>
        prev.filter((m) => !(m.id === assistantMsgId && !m.content.trim()))
      );
      const rawMsg =
        err instanceof Error && err.message
          ? err.message
          : 'AI is unavailable, retry';
      setErrorMessage(
        rawMsg.includes('AI is unavailable')
          ? rawMsg
          : `AI is unavailable, retry (${rawMsg})`
      );
    } finally {
      if (!controller.signal.aborted) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, isStreaming: false } : m
          )
        );
        setLoading(false);
      }
    }
  };

  const handleSendUserMessage = (rawQuestion: string) => {
    const trimmed = rawQuestion.trim();
    if (!trimmed || loading || isAiOffline) return;

    const userMsg: CopilotChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };

    const nextHistory = [
      ...messages.filter((m) => (m.content || m.text || '').trim().length > 0),
      userMsg,
    ];
    setInputText('');
    void sendConversationToChat(nextHistory);
  };

  /**
   * Step 4: The suggestion chips just send their text as a normal user message.
   */
  const handleSelectChip = (chipText: string) => {
    if (loading || isAiOffline) return;
    handleSendUserMessage(chipText);
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || loading || isAiOffline) return;
    handleSendUserMessage(inputText);
  };

  const handleRegenerate = () => {
    if (loading || isAiOffline) return;
    const cleaned = messages.filter(
      (m) => (m.content || m.text || '').trim().length > 0
    );
    if (cleaned.length === 0) return;

    // Remove the trailing assistant message (if present) so the last item is the user message
    const historyUpToLastUser =
      cleaned[cleaned.length - 1].role === 'assistant'
        ? cleaned.slice(0, -1)
        : cleaned;

    if (
      historyUpToLastUser.length === 0 ||
      historyUpToLastUser[historyUpToLastUser.length - 1].role !== 'user'
    ) {
      return;
    }

    void sendConversationToChat(historyUpToLastUser);
  };

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const lastAssistantIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return i;
    }
    return -1;
  })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-copilot-modal-title"
        data-testid="ai-copilot-modal"
        className="w-full max-w-5xl h-[86vh] max-h-[820px] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xl overflow-hidden flex flex-col"
      >
        {isAiOffline && (
          <div
            role="alert"
            data-testid="copilot-ai-offline-banner"
            className="px-6 py-3 border-b border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200 shrink-0"
          >
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="font-medium">
                AI offline: set NEBIUS_API_KEY on the server and restart.
              </span>
            </div>
            <button
              type="button"
              onClick={handleRetryAiStatus}
              disabled={retryingAiStatus}
              className="px-2.5 py-1 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 hover:bg-amber-100/50 dark:hover:bg-slate-800 text-amber-900 dark:text-amber-200 font-semibold inline-flex items-center gap-1.5 shrink-0 transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${retryingAiStatus ? 'animate-spin' : ''}`} />
              <span>Retry</span>
            </button>
          </div>
        )}

        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          {/* ====================================================================
              LEFT SIDEBAR: Score Ring + Vault Summary (Verified / Self-declared / Missing)
             ==================================================================== */}
          <aside
          data-testid="copilot-left-sidebar"
          className="w-full md:w-80 shrink-0 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 flex flex-col overflow-y-auto"
        >
          {/* Sidebar Header & Score Ring */}
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col items-center text-center space-y-3">
            <div className="w-full flex items-center justify-between text-left">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Readiness Score
              </span>
              <span className="px-2 py-0.5 rounded-md bg-[#2563EB]/10 text-[#2563EB] dark:text-blue-400 text-[11px] font-semibold">
                {viewerMode === 'student' ? 'Student Mode' : 'Job Seeker Mode'}
              </span>
            </div>

            <div className="py-1">
              <ReadinessGauge
                score={vault.readinessScore}
                targetRole={targetRole}
                size={96}
                showBreakdown={false}
              />
            </div>

            <div className="w-full pt-1">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Target Role
              </div>
              <div
                data-testid="copilot-sidebar-target-role"
                className="text-xs font-semibold text-slate-900 dark:text-white truncate mt-0.5"
                title={targetRole}
              >
                {targetRole}
              </div>
            </div>
          </div>

          {/* Vault Summary Lists: Verified / Self-declared / Missing */}
          <div className="p-5 space-y-4 flex-1">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Proof Vault Summary
              </h3>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                {vault.verified.length + vault.selfDeclared.length + vault.missing.length} skills
              </span>
            </div>

            {/* 1. Verified Skills */}
            <div
              data-testid="copilot-vault-verified"
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-white">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#2563EB]" />
                  <span>Verified</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-[#2563EB]/10 text-[#2563EB] dark:text-blue-400 font-mono text-[11px] font-bold">
                  {vault.verified.length}
                </span>
              </div>
              {vault.verified.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {vault.verified.map((item) => (
                    <button
                      key={item.skill}
                      type="button"
                      onClick={() => {
                        onClose();
                        onInspectSkill(item.skill);
                      }}
                      title={
                        item.proofTitle
                          ? `Verified by: ${item.proofTitle}`
                          : 'Click to inspect verified proof'
                      }
                      className="px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-[11px] font-medium transition cursor-pointer"
                    >
                      {item.skill}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  No verified skills yet. Attach a repo or certificate in Proof Vault.
                </p>
              )}
            </div>

            {/* 2. Self-declared Skills */}
            <div
              data-testid="copilot-vault-declared"
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-white">
                  <CircleDot className="w-3.5 h-3.5 text-slate-500" />
                  <span>Self-declared</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-[11px] font-bold">
                  {vault.selfDeclared.length}
                </span>
              </div>
              {vault.selfDeclared.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {vault.selfDeclared.map((item) => (
                    <button
                      key={item.skill}
                      type="button"
                      onClick={() => {
                        onClose();
                        onInspectSkill(item.skill);
                      }}
                      title="Self-declared in résumé/profile (needs proof)"
                      className="px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-medium transition cursor-pointer"
                    >
                      {item.skill}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  No self-declared skills waiting for proof.
                </p>
              )}
            </div>

            {/* 3. Missing Skills */}
            <div
              data-testid="copilot-vault-missing"
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-white">
                  <CircleDashed className="w-3.5 h-3.5 text-slate-400" />
                  <span>Missing</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono text-[11px] font-bold">
                  {vault.missing.length}
                </span>
              </div>
              {vault.missing.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {vault.missing.map((item) => (
                    <button
                      key={item.skill}
                      type="button"
                      onClick={() => {
                        onClose();
                        onInspectSkill(item.skill);
                      }}
                      title="Missing for target role — click to add proof"
                      className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-[#2563EB] hover:text-slate-900 dark:hover:text-white text-[11px] font-medium transition cursor-pointer"
                    >
                      {item.skill}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  No missing skills detected for {targetRole}.
                </p>
              )}
            </div>
          </div>
        </aside>

        {/* ====================================================================
            RIGHT MAIN PANE: Header + Chat Messages + Suggestion Row + Pinned Input
           ==================================================================== */}
        <section className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900">
          {/* Top Header */}
          <header className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-white dark:bg-slate-900 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#2563EB]/10 border border-[#2563EB]/20 flex items-center justify-center text-[#2563EB] shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2
                    id="ai-copilot-modal-title"
                    className="font-heading text-base font-bold tracking-tight text-slate-900 dark:text-white"
                  >
                    AI Career Readiness Copilot
                  </h2>
                  <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-medium">
                    Nebius Token Factory
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Live multi-turn mentor chat grounded in your Proof Vault ({vault.verified.length}{' '}
                  verified, {vault.selfDeclared.length} self-declared, {vault.missing.length} missing)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleNewChat}
                data-testid="copilot-new-chat-btn"
                title="Clear conversation history and start a new chat"
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[#2563EB] text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New chat</span>
              </button>

              {messages.some((m) => m.role === 'user') && (
                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={loading || isAiOffline}
                  data-testid="copilot-regenerate-btn"
                  title="Re-run your last question"
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-[#2563EB] text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Regenerate</span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                aria-label="Close AI Copilot modal"
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* Chat Message Thread */}
          <div
            data-testid="copilot-chat-thread"
            className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50/40 dark:bg-slate-900"
          >
            {messages.length === 0 && !loading && (
              <div
                data-testid="copilot-empty-state"
                className="h-full min-h-[220px] flex flex-col items-center justify-center text-center max-w-md mx-auto py-8 space-y-3"
              >
                <div className="w-11 h-11 rounded-2xl bg-[#2563EB]/10 border border-[#2563EB]/20 flex items-center justify-center text-[#2563EB]">
                  <Sparkles className="w-5 h-5" />
                </div>
                <h3 className="font-heading text-base font-bold text-slate-900 dark:text-white">
                  Ask anything about your {targetRole} readiness or career
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Type a question below or click any suggestion chip to send it immediately.
                  Follow-up questions remember your conversation context.
                </p>
              </div>
            )}

            {messages.map((msg, index) => {
              const messageText = msg.content || msg.text || '';

              if (msg.role === 'user') {
                return (
                  <div
                    key={msg.id}
                    data-testid="copilot-user-message"
                    className="flex justify-end"
                  >
                    <div className="max-w-[82%] rounded-2xl rounded-br-sm bg-[#2563EB] text-white px-4 py-3 shadow-xs">
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-blue-100 mb-1">
                        <User className="w-3 h-3" />
                        <span>You</span>
                      </div>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{messageText}</p>
                    </div>
                  </div>
                );
              }

              const isLatestAssistant = index === lastAssistantIndex;

              return (
                <div
                  key={msg.id}
                  data-testid="copilot-assistant-message"
                  className="flex justify-start"
                >
                  <div className="w-full max-w-[92%] rounded-2xl rounded-tl-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5 shadow-xs space-y-3">
                    {/* Answer Body or Typing Indicator */}
                    {messageText ? (
                      <div>
                        {renderFormattedAnswer(messageText)}
                        {msg.isStreaming && (
                          <span
                            data-testid="copilot-streaming-cursor"
                            className="inline-block w-2 h-4 ml-1 align-middle bg-[#2563EB] animate-pulse rounded-xs"
                          />
                        )}
                      </div>
                    ) : (
                      <div
                        data-testid="copilot-typing-indicator"
                        className="flex items-center gap-2.5 py-1 text-xs font-semibold text-[#2563EB]"
                      >
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{webSearchEnabled ? 'Searching the web via Tavily…' : 'Thinking…'}</span>
                      </div>
                    )}

                    {/* Source Chips under the answer when Tavily web search was used */}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          <Globe className="w-3 h-3 text-[#2563EB]" />
                          <span>Live Web Sources (via Tavily):</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.sources.map((src, sIdx) => (
                            <a
                              key={sIdx}
                              href={src.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] border border-slate-200 dark:border-slate-700 transition"
                            >
                              <span className="font-mono text-[10px] text-[#2563EB] dark:text-blue-400">
                                [{sIdx + 1}]
                              </span>
                              <span className="max-w-[200px] truncate">{src.title || src.url}</span>
                              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Grounding & Server Model Tier Footer */}
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                          <ShieldCheck className="w-3 h-3 text-[#2563EB]" />
                          <span>Grounded in your proof vault</span>
                        </span>

                        {msg.modelTierLabel && (
                          <span
                            data-testid="copilot-model-tier-badge"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#2563EB]/10 text-[#2563EB] dark:text-blue-400 font-medium"
                          >
                            <Cpu className="w-3 h-3" />
                            <span>
                              {msg.modelTierLabel}
                              {msg.modelId ? ` · ${msg.modelId}` : ''}
                            </span>
                          </span>
                        )}
                      </div>

                      {!msg.isStreaming && messageText && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleCopyMessage(msg.id, messageText)}
                            className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-[#2563EB] text-slate-600 dark:text-slate-300 inline-flex items-center gap-1 transition cursor-pointer"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check className="w-3 h-3 text-[#2563EB]" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>

                          {isLatestAssistant && (
                            <button
                              type="button"
                              onClick={handleRegenerate}
                              disabled={loading}
                              data-testid="copilot-message-regenerate-btn"
                              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-[#2563EB] text-slate-700 dark:text-slate-200 font-medium inline-flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>Regenerate</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Honest Error Banner (never a fake answer) */}
            {errorMessage && (
              <div
                role="alert"
                data-testid="copilot-error-banner"
                className="p-4 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-800 dark:text-slate-200"
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-700 dark:text-red-300">
                      AI is unavailable, retry
                    </p>
                    <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                      {errorMessage}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRegenerate}
                  data-testid="copilot-retry-btn"
                  className="px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry</span>
                </button>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Bottom Dock: Row of Suggestion Chips + Pinned Input Box */}
          <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shrink-0">
            {/* Row of Suggestions Above the Input (clicking sends their text as a normal user message) */}
            <div
              data-testid="copilot-suggestion-row"
              className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar"
            >
              {SUGGESTION_PROMPTS.map((promptText, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={loading || isAiOffline}
                  data-testid={`copilot-chip-${idx}`}
                  onClick={() => handleSelectChip(promptText)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:border-[#2563EB] hover:text-[#2563EB] dark:hover:text-white text-xs whitespace-nowrap transition cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {promptText}
                </button>
              ))}
            </div>

            {/* Pinned Input Bar */}
            <form onSubmit={handleSubmitForm} className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setWebSearchEnabled((prev) => !prev)}
                aria-pressed={webSearchEnabled}
                title={webSearchEnabled ? 'Live web search active (Tavily)' : 'Click to enable live web search (Tavily)'}
                className={`px-3 py-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                  webSearchEnabled
                    ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-300 dark:border-blue-700 text-[#2563EB] dark:text-[#60A5FA]'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Search web (Tavily)</span>
              </button>

              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (inputText.trim() && !loading && !isAiOffline) {
                      handleSendUserMessage(inputText);
                    }
                  }
                }}
                placeholder="Ask a career, coding, or readiness question…"
                aria-label="Ask AI Career Readiness Copilot"
                data-testid="copilot-chat-input"
                className="flex-1 px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-[#2563EB] transition"
              />

              {loading ? (
                <button
                  type="button"
                  onClick={handleStopRequest}
                  data-testid="copilot-stop-btn"
                  className="px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer shrink-0"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!inputText.trim() || isAiOffline}
                  data-testid="copilot-ask-btn"
                  className="px-5 py-3 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold inline-flex items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
                >
                  <Send className="w-4 h-4" />
                  <span>Ask</span>
                </button>
              )}
            </form>
          </div>
        </section>
        </div>
      </div>
    </div>
  );
};
