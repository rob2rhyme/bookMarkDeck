// Lightweight shimmer placeholder. The pulse animation is automatically
// neutralised under prefers-reduced-motion by the global CSS guard.

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-slate-800/70 ${className}`}
      aria-hidden="true"
    />
  );
}

export default Skeleton;
