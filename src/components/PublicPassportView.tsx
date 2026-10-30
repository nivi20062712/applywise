import React, { useEffect, useState } from 'react';
import { ReadinessGauge } from './ReadinessGauge';
import {
  ShieldCheck,
  Printer,
  ExternalLink,
  Code2,
  Globe,
  Award,
  FileText,
  AlertTriangle,
  Loader2,
  Sparkles,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react';

interface PublicVerifiedSkill {
  skill: string;
  proofTitle: string;
  proofType: string;
  proofUrl?: string;
  verifiedAt?: string;
}

interface PublicPassportData {
  displayName: string;
  targetRole: string;
  readinessScore: number;
  tier: string;
  verifiedSkills: PublicVerifiedSkill[];
  selfDeclaredCount: number;
  generatedAt: string;
  summary?: string | null;
}

interface PublicPassportViewProps {
  token: string;
}

export const PublicPassportView: React.FC<PublicPassportViewProps> = ({ token }) => {
  const [data, setData] = useState<PublicPassportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setErrorMsg(null);

    fetch(`/api/public/passport/${encodeURIComponent(token)}`, {
      headers: {
        Accept: 'application/json',
      },
    })
      .then(async (res) => {
        if (res.status === 404) {
          if (!cancelled) setNotFound(true);
          return null;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Server responded with ${res.status}`);
        }
        return res.json() as Promise<PublicPassportData>;
      })
      .then((passportData) => {
        if (!cancelled && passportData) {
          setData(passportData);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'Failed to load passport');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handlePrint = () => {
    window.print();
  };

  const getProofTypeIcon = (type: string) => {
    switch (type) {
      case 'code_repository':
      case 'github':
        return <Code2 className="w-4 h-4 text-[#2563EB]" />;
      case 'deployment':
      case 'live_url':
        return <Globe className="w-4 h-4 text-emerald-600" />;
      case 'certification':
      case 'certificate':
        return <Award className="w-4 h-4 text-purple-600" />;
      default:
        return <FileText className="w-4 h-4 text-slate-600" />;
    }
  };

  const formatProofType = (type: string) => {
    switch (type) {
      case 'code_repository':
        return 'Code Repository';
      case 'deployment':
        return 'Live Deployment';
      case 'certification':
        return 'Verified Certificate';
      default:
        return 'Technical Artifact';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-[#2563EB]/10 text-[#2563EB] flex items-center justify-center mb-4">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
        <h2 className="font-heading text-lg font-semibold text-slate-900 dark:text-white">
          Loading Proof Passport…
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Validating verification cryptographic tokens…
        </p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center mb-4">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h1 className="font-heading text-2xl font-bold text-slate-900 dark:text-white">
          This passport has been revoked or does not exist
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mt-2 leading-relaxed">
          The candidate may have updated or revoked this public verification link, or the token in the URL is incorrect.
        </p>
        <div className="mt-6">
          <a
            href="/"
            className="px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold transition inline-flex items-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Go to ApplyWise</span>
          </a>
        </div>
      </div>
    );
  }

  if (errorMsg || !data) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 text-red-600 flex items-center justify-center mb-4">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h1 className="font-heading text-xl font-bold text-slate-900 dark:text-white">
          Unable to display Proof Passport
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
          {errorMsg || 'An unexpected error occurred while loading this page.'}
        </p>
        <div className="mt-6">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-sm font-semibold hover:border-[#2563EB] transition cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const formattedDate = (() => {
    try {
      return new Date(data.generatedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return data.generatedAt;
    }
  })();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 py-8 px-4 sm:px-6 lg:px-8 print:bg-white print:py-0 print:px-0">
      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background: white !important;
            color: black !important;
          }
          .print-border-none {
            border: none !important;
            box-shadow: none !important;
          }
        }
      `}</style>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top Header Bar */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800 print:border-slate-300">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#2563EB] text-white flex items-center justify-center font-heading font-black text-sm shrink-0 shadow-xs">
              AW
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-heading text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                  ApplyWise Proof Passport
                </h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[11px] font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Publicly Verified</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tamper-resistant proof verification for engineering recruitment
              </p>
            </div>
          </div>

          <div className="no-print flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              data-testid="passport-print-btn"
              className="px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:border-[#2563EB] text-slate-800 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer shadow-xs"
            >
              <Printer className="w-4 h-4 text-[#2563EB]" />
              <span>Print / Save as PDF</span>
            </button>
          </div>
        </header>

        {/* Hero Card: Candidate Target Role & Readiness Gauge */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-xs print-border-none space-y-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-3 text-center md:text-left max-w-xl">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Target Role
                </span>
                <h2 className="font-heading text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight mt-0.5">
                  {data.targetRole}
                </h2>
              </div>

              <div className="flex items-center justify-center md:justify-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                <span>Candidate:</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {data.displayName}
                </span>
              </div>

              {/* Verified by ApplyWise Banner */}
              <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 text-xs flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="font-medium">
                  Verified by ApplyWise content analysis, not self-declared.
                </span>
              </div>
            </div>

            {/* Standard 200px ring with tier pill */}
            <div className="shrink-0 flex justify-center">
              <ReadinessGauge
                score={data.readinessScore}
                size={200}
                label="Readiness"
                sublabel={data.targetRole}
              />
            </div>
          </div>

          {/* Optional AI Recruiter Summary (Nemotron Fast, verified proofs only) */}
          {data.summary && (
            <div className="pt-5 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA]">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Verified Recruiter Summary</span>
              </div>
              <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
                {data.summary}
              </p>
            </div>
          )}
        </section>

        {/* Verified Skills Grid */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-heading text-lg font-bold text-slate-900 dark:text-white">
                Verified Skills & Proof Artifacts
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Skills backed by parsed source code, active deployments, or verified credentials
              </p>
            </div>
            <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
              {data.verifiedSkills.length} verified
            </span>
          </div>

          {data.verifiedSkills.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {data.verifiedSkills.map((item, idx) => (
                <div
                  key={`${item.skill}-${idx}`}
                  data-testid={`passport-verified-skill-${idx}`}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs print-border-none flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-heading text-base font-semibold text-slate-900 dark:text-white">
                        {item.skill}
                      </h4>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                        {getProofTypeIcon(item.proofType)}
                        <span>{formatProofType(item.proofType)}</span>
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                      {item.proofTitle}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-[11px] text-slate-400">
                      {item.verifiedAt ? `Verified ${item.verifiedAt.split('T')[0]}` : 'Verified proof'}
                    </span>

                    {item.proofUrl && (
                      <a
                        href={item.proofUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#2563EB] dark:text-[#60A5FA] font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>View proof</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center text-sm text-slate-500">
              No skills have attached proof yet.
            </div>
          )}

          {/* Notice of self-declared skills that are NOT shown */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/50 text-xs text-slate-600 dark:text-slate-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-slate-400 shrink-0" />
              <span>
                {data.selfDeclaredCount > 0
                  ? `${data.selfDeclaredCount} more skills are self-declared and not shown.`
                  : 'All candidate claimed skills have attached verified proof.'}
              </span>
            </div>
            <span className="text-[11px] text-slate-400 shrink-0">
              Passport generated on {formattedDate}
            </span>
          </div>
        </section>

        {/* Footer */}
        <footer className="pt-6 pb-12 border-t border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400 print:hidden space-y-1">
          <p>ApplyWise Proof Passport · Public Read-Only Verification</p>
          <p>
            Candidate identity and confidential documents are protected by server-side allow-listing.
          </p>
        </footer>
      </div>
    </div>
  );
};
