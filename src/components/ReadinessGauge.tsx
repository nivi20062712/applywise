import React, { useEffect, useState } from 'react';

interface ReadinessGaugeProps {
  score: number;
  skillMatch?: number;
  evidenceStrength?: number;
  experienceRelevance?: number;
  targetRole?: string;
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
  showBreakdown?: boolean;
}

const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));

export const ReadinessGauge: React.FC<ReadinessGaugeProps> = ({
  score,
  skillMatch = 82,
  evidenceStrength = 76,
  experienceRelevance = 80,
  targetRole = 'Software Engineer',
  size = 200,
  strokeWidth: customStrokeWidth,
  showBreakdown = false,
}) => {
  const clampedScore = Math.max(0, Math.min(100, Math.round(score || 0)));
  const [animatedScore, setAnimatedScore] = useState<number>(0);

  // Responsive check for < 640px wide viewport (Home hero ring scales from 200 to 160)
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 640;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(max-width: 639px)');
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setAnimatedScore(clampedScore);
      return;
    }

    let rafId = 0;
    const duration = 750;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Cubic ease-out
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(Math.round(clampedScore * eased));
      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      }
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [clampedScore]);

  // Standard sizes: Home hero = 200 (160 below 640px), Skills = 160, Match / small cards = 96
  const currentSize = size === 200 && isMobile ? 160 : size;

  // Geometry: strokeWidth = clamp(size * 0.07, 8, 16) unless custom strokeWidth passed
  const strokeWidth = customStrokeWidth ?? clamp(Math.round(currentSize * 0.07), 8, 16);
  const radius = (currentSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (animatedScore / 100) * circumference;

  // Safe text area: innerDiameter = size - 2*strokeWidth.
  // All inside text must fit in a centred box of width innerDiameter * 0.72
  const innerDiameter = currentSize - 2 * strokeWidth;
  const safeBoxWidth = Math.round(innerDiameter * 0.72);

  // Text scaling rules:
  // For size >= 120:
  //   score font-size = size * 0.24 (bold, tabular-nums, line-height 1)
  //   "READINESS" label font-size = clamp(size * 0.055, 9px, 12px)
  //   gap = size * 0.03
  // For size < 120:
  //   show only score at size * 0.28
  const isCompact = currentSize < 120;
  const scoreFontSize = Math.round(isCompact ? currentSize * 0.28 : currentSize * 0.24);
  const labelFontSize = clamp(Math.round(currentSize * 0.055), 9, 12);
  const gap = Math.max(2, Math.round(currentSize * 0.03));

  const readinessTier =
    clampedScore >= 80
      ? 'Offer Ready'
      : clampedScore >= 65
      ? 'Competitive Fit'
      : 'Building Proof';

  const tierPillClass =
    readinessTier === 'Offer Ready'
      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/60'
      : readinessTier === 'Competitive Fit'
      ? 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800/60'
      : 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60';

  const center = currentSize / 2;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="flex flex-col items-center shrink-0">
        {/* Ring SVG container with fixed width/height and shrink-0 */}
        <div
          className="relative flex items-center justify-center shrink-0"
          style={{ width: currentSize, height: currentSize }}
          role="img"
          aria-label={`Readiness score ${clampedScore} percent (${readinessTier}) for ${targetRole}`}
        >
          <svg
            width={currentSize}
            height={currentSize}
            viewBox={`0 0 ${currentSize} ${currentSize}`}
            className="shrink-0 overflow-visible"
          >
            <defs>
              <linearGradient id="applywiseReadinessGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#16A34A" />
                <stop offset="100%" stopColor="#2563EB" />
              </linearGradient>
            </defs>

            {/* Background Track */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              className="text-slate-200/80 dark:text-white/10"
            />

            {/* Animated Progress Arc: starts at 12 o'clock and fills clockwise */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke="url(#applywiseReadinessGrad)"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              transform={`rotate(-90 ${center} ${center})`}
              className="transition-[stroke-dashoffset] duration-150 ease-out"
            />
          </svg>

          {/* Centred safe text area: width = innerDiameter * 0.72 */}
          <div className="absolute inset-0 flex flex-col items-center justify-center select-none pointer-events-none">
            <div
              className="flex flex-col items-center justify-center text-center -translate-y-0.5"
              style={{
                width: `${safeBoxWidth}px`,
                maxWidth: `${safeBoxWidth}px`,
                gap: `${gap}px`,
              }}
            >
              {!isCompact && (
                <span
                  className="font-medium uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400 leading-none"
                  style={{ fontSize: `${labelFontSize}px` }}
                >
                  READINESS
                </span>
              )}
              <span
                data-testid="readiness-gauge-value"
                className="font-bold tabular-nums text-slate-900 dark:text-white"
                style={{ fontSize: `${scoreFontSize}px`, lineHeight: 1 }}
              >
                {animatedScore}%
              </span>
            </div>
          </div>
        </div>

        {/* Tier pill directly below the ring with 12px gap */}
        <div style={{ marginTop: '12px' }} className="flex justify-center shrink-0">
          <span
            data-testid="readiness-tier-pill"
            className={`inline-flex items-center px-3 py-0.5 rounded-full text-[12px] font-semibold whitespace-nowrap ${tierPillClass}`}
          >
            {readinessTier}
          </span>
        </div>
      </div>

      {/* Sub-score Breakdown */}
      {showBreakdown && (
        <div className="flex-1 w-full space-y-3.5">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Target Role · <span className="font-semibold text-slate-800 dark:text-slate-200">{targetRole}</span>
            </p>
          </div>

          {[
            { label: 'Skill Match', val: skillMatch, color: '#2563EB' },
            { label: 'Evidence Strength', val: evidenceStrength, color: '#16A34A' },
            { label: 'Experience Fit', val: experienceRelevance, color: '#10B981' },
          ].map((metric) => (
            <div key={metric.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-600 dark:text-slate-300">{metric.label}</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                  {Math.round(metric.val)}%
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                <div
                  style={{
                    width: `${Math.max(6, Math.min(100, Math.round(metric.val)))}%`,
                    backgroundColor: metric.color,
                  }}
                  className="h-full rounded-full transition-all duration-500"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
