import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { fetchApi } from '../api';
import {
  X,
  Share2,
  Copy,
  Check,
  ExternalLink,
  ShieldAlert,
  Loader2,
  ShieldCheck,
  Eye,
  EyeOff,
  QrCode,
  Sparkles,
} from 'lucide-react';

interface PassportInfo {
  token: string;
  showName: boolean;
  createdAt: string;
  summary?: string | null;
}

interface SharePassportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNotify?: (msg: string) => void;
}

export const SharePassportModal: React.FC<SharePassportModalProps> = ({
  isOpen,
  onClose,
  onNotify,
}) => {
  const [loading, setLoading] = useState(false);
  const [passport, setPassport] = useState<PassportInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [confirmRevoking, setConfirmRevoking] = useState(false);
  const [updatingShowName, setUpdatingShowName] = useState(false);

  const loadPassport = async () => {
    setLoading(true);
    try {
      const res = await fetchApi<{
        passport: PassportInfo | null;
        token?: string;
        showName?: boolean;
        createdAt?: string;
        summary?: string | null;
      }>('/passport/me');

      if (res && (res.passport || res.token)) {
        const p = res.passport || {
          token: res.token!,
          showName: Boolean(res.showName),
          createdAt: res.createdAt!,
          summary: res.summary,
        };
        setPassport(p);
      } else {
        setPassport(null);
      }
    } catch {
      setPassport(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadPassport();
      setConfirmRevoking(false);
    }
  }, [isOpen]);

  // Generate QR code client-side whenever token changes
  useEffect(() => {
    if (!passport?.token) {
      setQrDataUrl('');
      return;
    }

    const publicUrl = `${window.location.origin}/p/${passport.token}`;
    QRCode.toDataURL(publicUrl, {
      width: 180,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Failed to generate QR code', err));
  }, [passport?.token]);

  if (!isOpen) return null;

  const publicUrl = passport ? `${window.location.origin}/p/${passport.token}` : '';

  const handleCreatePassport = async () => {
    setLoading(true);
    try {
      const res = await fetchApi<{
        token: string;
        showName: boolean;
        createdAt: string;
        summary?: string | null;
      }>('/passport', {
        method: 'POST',
        body: JSON.stringify({ showName: false }),
      });
      setPassport(res);
      onNotify?.('Proof Passport created successfully.');
    } catch {
      onNotify?.('Failed to create Proof Passport.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleShowName = async () => {
    if (!passport || updatingShowName) return;
    const nextShowName = !passport.showName;
    setUpdatingShowName(true);
    try {
      const res = await fetchApi<{
        token: string;
        showName: boolean;
        createdAt: string;
        summary?: string | null;
      }>('/passport', {
        method: 'POST',
        body: JSON.stringify({ showName: nextShowName }),
      });
      setPassport(res);
      onNotify?.(
        nextShowName
          ? 'First name will now appear on your public passport.'
          : 'First name is now hidden (shows "Verified candidate").'
      );
    } catch {
      onNotify?.('Failed to update passport name preference.');
    } finally {
      setUpdatingShowName(false);
    }
  };

  const handleCopyLink = () => {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    onNotify?.('Public passport link copied to clipboard.');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRevokePassport = async () => {
    setLoading(true);
    try {
      await fetchApi('/passport', { method: 'DELETE' });
      setPassport(null);
      setConfirmRevoking(false);
      onNotify?.('Passport link revoked. Existing links will now return 404.');
    } catch {
      onNotify?.('Failed to revoke passport link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-passport-modal-title"
        data-testid="share-passport-modal"
        className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <header className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#2563EB]/10 text-[#2563EB] flex items-center justify-center">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="share-passport-modal-title"
                className="font-heading text-base font-bold text-slate-900 dark:text-white"
              >
                Share my Proof Passport
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Public read-only link for recruiters & hiring managers
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Content */}
        <div className="p-6 space-y-5">
          {loading && !passport ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-[#2563EB]" />
              <p className="text-xs text-slate-500">Checking active passport status…</p>
            </div>
          ) : !passport ? (
            /* Empty State: Create Passport */
            <div className="text-center py-4 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div className="space-y-1.5 max-w-sm mx-auto">
                <h3 className="font-heading text-base font-bold text-slate-900 dark:text-white">
                  Generate your recruiter-ready link
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Creates a public URL showcasing your verified skills and attached proofs.
                  Your email, phone, full name, and unverified skills remain strictly private.
                </p>
              </div>
              <div>
                <button
                  type="button"
                  onClick={handleCreatePassport}
                  data-testid="create-passport-btn"
                  className="px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold inline-flex items-center gap-2 transition cursor-pointer shadow-xs"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Create Proof Passport</span>
                </button>
              </div>
            </div>
          ) : (
            /* Active Passport View */
            <div className="space-y-5">
              {/* Public Link Box */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Public verification link
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={publicUrl}
                    data-testid="passport-url-input"
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-800 dark:text-slate-200 select-all"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    data-testid="passport-copy-btn"
                    className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-[#2563EB] text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 transition cursor-pointer shrink-0"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-600">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                  <a
                    href={`/p/${passport.token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="passport-open-btn"
                    className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-[#2563EB] text-slate-700 dark:text-slate-200 transition cursor-pointer shrink-0"
                    title="Open passport in new tab"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* QR Code and Privacy Toggle Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
                {/* QR Code */}
                <div className="flex flex-col items-center justify-center text-center p-2">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="Passport QR Code"
                      data-testid="passport-qr-code"
                      className="w-32 h-32 rounded-lg border border-slate-200 dark:border-slate-700 bg-white p-1"
                    />
                  ) : (
                    <div className="w-32 h-32 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center">
                      <QrCode className="w-8 h-8 text-slate-400" />
                    </div>
                  )}
                  <span className="text-[11px] text-slate-400 mt-1.5">
                    Scan with camera to open
                  </span>
                </div>

                {/* Privacy & Toggle */}
                <div className="space-y-3">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Privacy Guard</span>
                    </span>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                      Never shares email, phone, full name, or unverified skills.
                    </p>
                  </div>

                  {/* Show First Name Toggle */}
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-xs font-medium text-slate-800 dark:text-slate-200 block truncate">
                        Show first name
                      </span>
                      <span className="text-[10px] text-slate-400 block truncate">
                        {passport.showName ? 'Shows first name' : 'Shows "Verified candidate"'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleToggleShowName}
                      disabled={updatingShowName}
                      data-testid="passport-toggle-name-btn"
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        passport.showName ? 'bg-[#2563EB]' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                      role="switch"
                      aria-checked={passport.showName}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          passport.showName ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Revoke Option */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                {confirmRevoking ? (
                  <div className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60">
                    <div className="flex items-center gap-2 text-red-700 dark:text-red-300 text-xs font-medium">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <span>Revoke link immediately?</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setConfirmRevoking(false)}
                        className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-semibold cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleRevokePassport}
                        data-testid="passport-confirm-revoke-btn"
                        className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-semibold cursor-pointer"
                      >
                        Confirm Revoke
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="text-slate-400">
                      Active since {passport.createdAt?.split('T')[0] || 'today'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setConfirmRevoking(true)}
                      data-testid="passport-revoke-btn"
                      className="text-red-600 hover:text-red-700 font-semibold hover:underline cursor-pointer"
                    >
                      Revoke link
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
