"use client";

import Link from "next/link";

type IconActionProps = {
  label: string;
  onClick?: () => void;
  href?: string;
  icon: React.ReactNode;
  variant?: "default" | "danger";
  active?: boolean;
  disabled?: boolean;
  className?: string;
};

const baseClassName =
  "inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700/70 bg-slate-900/70 text-slate-200 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950";

function classNameFor({
  variant,
  active,
  disabled,
  className,
}: {
  variant: "default" | "danger";
  active: boolean;
  disabled: boolean;
  className?: string;
}) {
  return [
    baseClassName,
    variant === "danger"
      ? "text-red-200 hover:border-red-500/70 hover:bg-red-900/35"
      : "hover:border-slate-500/80 hover:bg-slate-800/60",
    active ? "bg-slate-800/70" : "",
    disabled ? "cursor-not-allowed opacity-45 hover:bg-slate-900/70" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function IconAction({
  label,
  onClick,
  href,
  icon,
  variant = "default",
  active = false,
  disabled = false,
  className,
}: IconActionProps) {
  const buttonClassName = classNameFor({
    variant,
    active,
    disabled,
    className,
  });

  return (
    <div className="group relative inline-flex items-center">
      {href ? (
        <Link
          href={href}
          aria-label={label}
          className={buttonClassName}
          aria-disabled={disabled}
          onClick={(event) => {
            if (disabled) {
              event.preventDefault();
              return;
            }
            onClick?.();
          }}
        >
          {icon}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          disabled={disabled}
          className={buttonClassName}
        >
          {icon}
        </button>
      )}

      <div className="pointer-events-none absolute -top-10 left-1/2 z-20 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-md border border-slate-700/90 bg-slate-950/95 px-2 py-1 text-[11px] font-medium text-slate-100 opacity-0 shadow-xl transition duration-150 ease-out group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
        {label}
      </div>
    </div>
  );
}
