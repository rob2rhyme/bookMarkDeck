import { MOOD_BY_KEY, type MoodKey } from "@/features/focus/lib/mood";

type Eyes = "dots" | "happy" | "closed" | "worried";

// Per-mood expression: eye style + mouth path (24×24 viewBox, currentColor).
const FACE: Record<MoodKey, { eyes: Eyes; mouth: string; brows?: boolean }> = {
  great: { eyes: "happy", mouth: "M8 13.5 Q12 18.5 16 13.5" },
  good: { eyes: "dots", mouth: "M8.5 14 Q12 16.8 15.5 14" },
  excited: { eyes: "happy", mouth: "M8 13 Q12 19 16 13" },
  calm: { eyes: "dots", mouth: "M9.5 14.6 Q12 16 14.5 14.6" },
  okay: { eyes: "dots", mouth: "M9 15.2 H15" },
  tired: { eyes: "closed", mouth: "M9.5 15.2 H14.5" },
  low: { eyes: "dots", mouth: "M8.5 15.6 Q12 13.8 15.5 15.6" },
  anxious: {
    eyes: "dots",
    mouth: "M8.4 15.2 q1.8 -1.3 3.6 0 q1.8 1.3 3.6 0",
    brows: true,
  },
  stressed: { eyes: "worried", mouth: "M8 16.2 Q12 13 16 16.2", brows: true },
};

function Eyes({ kind }: { kind: Eyes }) {
  if (kind === "closed") {
    return (
      <>
        <path d="M7.5 10.5 H10.5" />
        <path d="M13.5 10.5 H16.5" />
      </>
    );
  }
  if (kind === "happy") {
    return (
      <>
        <path d="M7.6 10.8 Q9 9.2 10.4 10.8" />
        <path d="M13.6 10.8 Q15 9.2 16.4 10.8" />
      </>
    );
  }
  if (kind === "worried") {
    return (
      <>
        <circle cx="9" cy="10.6" r="1.05" className="fill-current" stroke="none" />
        <circle cx="15" cy="10.6" r="1.05" className="fill-current" stroke="none" />
      </>
    );
  }
  return (
    <>
      <circle cx="9" cy="10.4" r="1.05" className="fill-current" stroke="none" />
      <circle cx="15" cy="10.4" r="1.05" className="fill-current" stroke="none" />
    </>
  );
}

/**
 * A small, premium face icon for a mood. Color comes from the mood's `tint`
 * (applied as text color); all strokes/fills use currentColor.
 */
export function MoodIcon({
  mood,
  className = "h-5 w-5",
}: {
  mood: MoodKey;
  className?: string;
}) {
  const face = FACE[mood];
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${MOOD_BY_KEY[mood].tint} ${className}`}
      role="img"
      aria-label={MOOD_BY_KEY[mood].label}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9.2" className="fill-current opacity-10" stroke="none" />
      <circle cx="12" cy="12" r="9.2" />
      {face.brows && (
        <>
          <path d="M7.4 8 L10.2 8.9" />
          <path d="M16.6 8 L13.8 8.9" />
        </>
      )}
      <Eyes kind={face.eyes} />
      <path d={face.mouth} />
    </svg>
  );
}

export default MoodIcon;
