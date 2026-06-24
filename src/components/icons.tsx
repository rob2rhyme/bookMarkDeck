//src/components/icons.tsx
import type { SVGProps } from "react";

type IconProps = {
  className?: string;
};

// Icons size in `em` so they track the surrounding text (text scale), then an
// inline style applies the independent icon multiplier on top. The h-/w- class
// is kept for layout fallbacks, but the inline width/height wins. `middle`
// alignment stops the SVG (which defaults to baseline) from riding high in its
// line box — the fix for icons appearing un-centered in inline contexts.
const ICON_SIZE_STYLE: React.CSSProperties = {
  width: "calc(1em * var(--app-icon-scale, 1))",
  height: "calc(1em * var(--app-icon-scale, 1))",
  verticalAlign: "middle",
};

function baseProps(className?: string): SVGProps<SVGSVGElement> {
  return {
    className: className ?? "h-5 w-5",
    style: ICON_SIZE_STYLE,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    'aria-hidden': true,
  };
}

// A scalable emoji glyph: tracks text size like everything else, plus the
// independent emoji multiplier. Use for prominent emoji spots.
export function Emoji({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      aria-hidden="true"
      {...rest}
      className={className}
      style={{
        fontSize: "calc(1em * var(--app-emoji-scale, 1))",
        // Tight, middle-aligned box so the glyph centers in rings/badges
        // instead of riding high on the baseline.
        lineHeight: 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        verticalAlign: "middle",
        ...rest.style,
      }}
    >
      {children}
    </span>
  );
}

export function ArrowLeft({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...baseProps(className)}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export function Star({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...baseProps(className)}>
      <path d="m12 3.5 2.7 5.5 6 .9-4.3 4.2 1 5.9L12 17.8 6.6 20l1-5.9L3.3 9.9l6-.9Z" />
    </svg>
  );
}

export function StarFilled({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className ?? "h-5 w-5"}
      style={ICON_SIZE_STYLE}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      <path d="m12 3.5 2.7 5.5 6 .9-4.3 4.2 1 5.9L12 17.8 6.6 20l1-5.9L3.3 9.9l6-.9Z" />
    </svg>
  );
}

export function Note({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...baseProps(className)}>
      <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
    </svg>
  );
}

export function Pencil({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...baseProps(className)}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export function Check({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...baseProps(className)}>
      <path d="M5 12l4 4L19 6" />
    </svg>
  );
}

export function CheckSquare({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...baseProps(className)}>
      <rect x="3" y="3" width="18" height="18" rx="3" ry="3" />
      <path d="M8 12l3 3 5-6" />
    </svg>
  );
}

export function X({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...baseProps(className)}>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
}

export function Trash({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...baseProps(className)}>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export function Trash2({ className }: IconProps) {
  return <Trash className={className} />;
}

export function FolderPlus({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...baseProps(className)}>
      <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <path d="M12 11v6" />
      <path d="M9 14h6" />
    </svg>
  );
}

export function FolderTree(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...baseProps(props.className)} {...props}>
      <path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v2" />
      <path d="M5 10v8a2 2 0 0 0 2 2h2" />
      <path d="M9 18v-4" />
      <path d="M9 14h4" />
      <path d="M9 18h4" />
      <path d="M17 13v2" />
      <path d="M15 17h4" />
    </svg>
  );
}

export function FolderMoveInto({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...baseProps(className)}>
      <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <path d="M10 11h6" />
      <path d="M14 9l3 3-3 3" />
    </svg>
  );
}

export function DotsHorizontal({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...baseProps(className)}>
      <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function DotsVertical({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...baseProps(className)}>
      <circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ChevronUp({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...baseProps(className)}>
      <path d="m6 14 6-6 6 6" />
    </svg>
  );
}

export function ExternalLink({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...baseProps(className)}>
      <path d="M14 4h6v6" />
      <path d="M10 14 20 4" />
      <path d="M20 14v5a1 1 0 0 1-1 1h-14a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

export function Eye({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...baseProps(className)}>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  );
}

export function EyeOff({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...baseProps(className)}>
      <path d="M3 3l18 18" />
      <path d="M10.7 5.2A11.2 11.2 0 0 1 12 5c6.5 0 10 7 10 7a16.5 16.5 0 0 1-4 4.8" />
      <path d="M7.9 7.9A16.1 16.1 0 0 0 2 12s3.5 7 10 7c1 0 1.9-.2 2.8-.5" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

export function Timer({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...baseProps(className)}>
      <path d="M10 2h4" />
      <circle cx="12" cy="14" r="8" />
      <path d="M12 14V9.5" />
    </svg>
  );
}

export function Repeat({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...baseProps(className)}>
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

export function Bookmark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...baseProps(className)}>
      <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

export function Search({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...baseProps(className)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function Settings({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...baseProps(className)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}
