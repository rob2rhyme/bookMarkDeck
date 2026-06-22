"use client";

// A compact SVG progress ring. `progress` is 0..1. Used for per-habit completion
// (the tappable check) and the overall day summary.

type HabitRingProps = {
  progress: number;
  size?: number;
  stroke?: number;
  color: string;
  trackClass?: string;
  children?: React.ReactNode;
  className?: string;
};

export function HabitRing({
  progress,
  size = 44,
  stroke = 4,
  color,
  trackClass = "text-slate-700",
  children,
  className,
}: HabitRingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  const dash = c * clamped;

  return (
    <span
      className={`relative inline-flex items-center justify-center ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="block -rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className={trackClass}
          stroke="currentColor"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke={color}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          style={{ transition: "stroke-dasharray 320ms ease" }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        {children}
      </span>
    </span>
  );
}

export default HabitRing;
