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
