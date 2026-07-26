import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { ReactNode } from "react";

import { HIT_SLOP_MIN } from "./theme";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg";

const BASE =
  "flex-row items-center justify-center gap-2 rounded-pill active:opacity-80";

const VARIANT: Record<Variant, { box: string; label: string }> = {
  primary: { box: "bg-accent", label: "text-accent-ink font-semibold" },
  secondary: {
    box: "bg-raised border border-line",
    label: "text-ink font-medium",
  },
  ghost: { box: "bg-transparent", label: "text-accent font-medium" },
  danger: { box: "bg-bad", label: "text-accent-ink font-semibold" },
};

const SIZE: Record<Size, { box: string; label: string }> = {
  md: { box: "px-4 py-3", label: "text-[15px]" },
  lg: { box: "px-5 py-4", label: "text-base" },
};

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  disabled,
  loading,
  icon,
  fullWidth,
  accessibilityHint,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
  accessibilityHint?: string;
}) {
  const v = VARIANT[variant];
  const s = SIZE[size];
  const isOff = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isOff}
      // The label IS the accessible name — no icon-only ambiguity.
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!isOff, busy: !!loading }}
      style={{ minHeight: HIT_SLOP_MIN }}
      className={[
        BASE,
        v.box,
        s.box,
        fullWidth ? "w-full" : "",
        isOff ? "opacity-50" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {loading ? (
        <ActivityIndicator size="small" />
      ) : icon ? (
        <View>{icon}</View>
      ) : null}
      <Text className={[v.label, s.label].join(" ")}>{label}</Text>
    </Pressable>
  );
}
