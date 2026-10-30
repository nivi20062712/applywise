import React, { useState } from 'react';
import { fetchApi } from '../api';
import { User } from '../types';
import { ShieldCheck, CheckCircle2, ArrowRight, Sparkles, Sun, Moon } from 'lucide-react';

interface AuthViewProps {
  onSuccess: (session: { token: string; user: User }) => void;
  darkMode?: boolean;
  onToggleDarkMode?: (dark: boolean) => void;
}

export const AuthView: React.FC<AuthViewProps> = ({
  onSuccess,
  darkMode = false,
  onToggleDarkMode,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'Student' | 'Job seeker'>('Student');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const endpoint = mode === 'register' ? '/auth/register' : '/auth/login';
      const payload =
        mode === 'register'
          ? { name: name.trim(), email: email.trim(), password, role }
          : { email: email.trim(), password };

      const result = await fetchApi(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      onSuccess(result);
    } catch (err: any) {
      setError(err.message || 'Authentication error.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchApi('/demo-profile', {
        method: 'POST',
        body: JSON.stringify({ presetId: 'senior-fullstack' }),
      });
      onSuccess({
        token: result.token,
        user: result.user,
      });
    } catch (err: any) {
      setError(err.message || 'Could not sign in as demo user.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{ backgroundColor: 'var(--ui-bg)', color: 'var(--ui-text)' }}
      className="min-h-screen flex flex-col justify-between p-6 md:p-10 transition-colors duration-150"
    >
      {/* Top Bar with Hexagonal Brand Mark & Light/Dark Toggle */}
      <header className="w-full max-w-6xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 40 40" className="w-10 h-10" fill="none">
            <path
              d="M17.2 2.6a5.6 5.6 0 0 1 5.6 0l11.2 6.5a5.6 5.6 0 0 1 2.8 4.8v12.2a5.6 5.6 0 0 1-2.8 4.8L22.8 37.4a5.6 5.6 0 0 1-5.6 0L6 30.9a5.6 5.6 0 0 1-2.8-4.8V13.9A5.6 5.6 0 0 1 6 9.1l11.2-6.5Z"
              fill={darkMode ? '#FCFCFC' : '#1A1D1F'}
            />
            <rect
              x="13.5"
              y="16.5"
              width="2.8"
              height="7"
              rx="1.4"
              fill={darkMode ? '#1A1D1F' : '#FFFFFF'}
            />
            <rect
              x="18.6"
              y="12.5"
              width="2.8"
              height="15"
              rx="1.4"
              fill={darkMode ? '#1A1D1F' : '#FFFFFF'}
            />
            <rect
              x="23.7"
              y="17.5"
              width="2.8"
              height="5"
              rx="1.4"
              fill={darkMode ? '#1A1D1F' : '#FFFFFF'}
            />
          </svg>
          <span className="font-heading font-extrabold text-xl tracking-tight text-[#1A1D1F] dark:text-[#FCFCFC]">
            ApplyWise
          </span>
        </div>

        {onToggleDarkMode && (
          <div className="p-1 rounded-full bg-white dark:bg-[#1A1D1F] border border-[#EFEFEF] dark:border-[#272B30] flex items-center gap-1">
            <button
              type="button"
              onClick={() => onToggleDarkMode(false)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition ${
                !darkMode
                  ? 'bg-[#F4F4F4] text-[#1A1D1F]'
                  : 'text-[#6F767E] hover:text-[#FCFCFC]'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>Light</span>
            </button>
            <button
              type="button"
              onClick={() => onToggleDarkMode(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition ${
                darkMode
                  ? 'bg-[#272B30] text-[#FCFCFC]'
                  : 'text-[#6F767E] hover:text-[#1A1D1F]'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              <span>Dark</span>
            </button>
          </div>
        )}
      </header>

      {/* Main Split Container */}
      <div className="w-full max-w-5xl mx-auto my-8 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
        {/* Left Hero */}
        <div className="lg:col-span-6 space-y-6">
          <div className="flex items-center gap-2.5 text-xs font-bold text-[#6F767E]">
            <span className="w-3 h-5 rounded-[3px] bg-[#FFBC99]" />
            <span>Evidence-Driven Career Readiness · Nebius x NVIDIA Powered</span>
          </div>

          <h1
            className="font-heading text-4xl sm:text-5xl font-extrabold text-[#1A1D1F] dark:text-[#FCFCFC] leading-tight tracking-tight"
            style={{ textWrap: 'balance' }}
          >
            Build verifiable proof for the role you want.
          </h1>

          <p className="text-[#6F767E] text-base sm:text-lg leading-relaxed max-w-lg">
            Connect live job requirements from Google, Microsoft, Oracle, TCS, and Zoho directly to your repositories, certificates, and project evidence.
          </p>

          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-3 text-sm text-[#1A1D1F] dark:text-[#FCFCFC] font-semibold">
              <CheckCircle2 className="w-5 h-5 text-[#83BF6E] shrink-0" />
              <span>Interactive Role Readiness Score & 4-Phase Career Roadmap</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-[#1A1D1F] dark:text-[#FCFCFC] font-semibold">
              <ShieldCheck className="w-5 h-5 text-[#2A85FF] shrink-0" />
              <span>Multi-format document vault (PDF, DOCX, JPG) & skill proof matrix</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-[#1A1D1F] dark:text-[#FCFCFC] font-semibold">
              <Sparkles className="w-5 h-5 text-[#FFBC99] shrink-0" />
              <span>7-Day learning sprints with YouTube, Udemy & Coursera links</span>
            </div>
          </div>

          {/* Quick Demo Button */}
          <div className="pt-3">
            <button
              type="button"
              onClick={handleDemoSignIn}
              disabled={loading}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-[#2A85FF] hover:bg-[#0069F6] text-white text-sm font-bold shadow-xs transition whitespace-nowrap"
            >
              <span>Explore Demo Profile (Aanya Kumar)</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right Sign-in Card */}
        <div className="lg:col-span-6">
          <div className="bg-white dark:bg-[#1A1D1F] rounded-2xl p-7 sm:p-9 border border-[#EFEFEF] dark:border-[#272B30] text-[#1A1D1F] dark:text-[#FCFCFC]">
            <div className="mb-6 flex items-center gap-3">
              <span className="w-3.5 h-7 rounded-[4px] bg-[#CABDFF] shrink-0" />
              <div>
                <p className="text-xs font-semibold text-[#6F767E]">
                  {mode === 'login' ? 'Sign in to continue' : 'Create your ApplyWise account'}
                </p>
                <h2 className="font-heading text-2xl font-bold text-[#1A1D1F] dark:text-[#FCFCFC]">
                  {mode === 'login' ? 'Sign in to ApplyWise' : 'Start your evidence journey'}
                </h2>
              </div>
            </div>

            {error && (
              <div className="mb-5 p-3.5 bg-[#FFE7E4] rounded-xl text-[#FF6A55] text-xs font-bold leading-relaxed">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-[#6F767E] mb-1.5">
                      Your full name
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., Alex Johnson"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F4F4] dark:bg-[#272B30] border border-transparent text-sm text-[#1A1D1F] dark:text-[#FCFCFC] focus:outline-none focus:border-[#2A85FF] transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#6F767E] mb-1.5">
                      I am a
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setRole('Student')}
                        className={`p-3 rounded-xl border text-left transition ${
                          role === 'Student'
                            ? 'border-[#2A85FF] bg-[#2A85FF]/10 text-[#2A85FF]'
                            : 'border-[#EFEFEF] dark:border-[#272B30] text-[#6F767E]'
                        }`}
                      >
                        <p className="text-xs font-bold">Student</p>
                        <p className="text-[10px] opacity-80 mt-0.5">
                          Building first portfolio evidence
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setRole('Job seeker')}
                        className={`p-3 rounded-xl border text-left transition ${
                          role === 'Job seeker'
                            ? 'border-[#2A85FF] bg-[#2A85FF]/10 text-[#2A85FF]'
                            : 'border-[#EFEFEF] dark:border-[#272B30] text-[#6F767E]'
                        }`}
                      >
                        <p className="text-xs font-bold">Job seeker</p>
                        <p className="text-[10px] opacity-80 mt-0.5">
                          Targeting immediate roles
                        </p>
                      </button>
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-bold text-[#6F767E] mb-1.5">
                  Email address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F4F4] dark:bg-[#272B30] border border-transparent text-sm text-[#1A1D1F] dark:text-[#FCFCFC] focus:outline-none focus:border-[#2A85FF] transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#6F767E] mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F4F4] dark:bg-[#272B30] border border-transparent text-sm text-[#1A1D1F] dark:text-[#FCFCFC] focus:outline-none focus:border-[#2A85FF] transition"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-[#2A85FF] hover:bg-[#0069F6] text-white font-bold text-sm transition disabled:opacity-60"
              >
                {loading
                  ? 'Verifying…'
                  : mode === 'login'
                  ? 'Sign in to workspace'
                  : 'Create account'}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-[#EFEFEF] dark:border-[#272B30] flex items-center justify-between text-xs text-[#6F767E]">
              <span>
                {mode === 'login' ? "Don't have an account?" : 'Already registered?'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'login' ? 'register' : 'login');
                  setError('');
                }}
                className="font-bold text-[#2A85FF] hover:underline"
              >
                {mode === 'login' ? 'Create an account' : 'Sign in'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full max-w-6xl mx-auto text-xs text-[#6F767E] flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-[#EFEFEF] dark:border-[#272B30]">
        <span>ApplyWise Career Readiness Platform</span>
        <span>Powered by NVIDIA NIM & Nebius AI Studio</span>
      </footer>
    </div>
  );
};
