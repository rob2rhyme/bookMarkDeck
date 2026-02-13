import type { SVGProps } from "react";

type IconProps = {
  className?: string;
};

function baseProps(className?: string): SVGProps<SVGSVGElement> {
  return {
    className: className ?? "h-5 w-5",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    'aria-hidden': true,
  };
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

export function DotsHorizontal({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...baseProps(className)}>
      <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
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
