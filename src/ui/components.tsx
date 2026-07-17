// Everhold UI kit — small themed primitives. Every screen composes these so
// the slate/blue look (and the light inversion) stays consistent everywhere.

import type { ReactNode } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/ui/theme";
import { maxContentWidth, radius, spacing } from "@/ui/tokens";

export function Screen({
  children,
  scroll = true,
  padded = true,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
}) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const inner: ViewStyle = {
    width: "100%",
    maxWidth: maxContentWidth,
    alignSelf: "center",
    padding: padded ? spacing.lg : 0,
    paddingBottom: spacing.xxl + insets.bottom,
  };
  if (!scroll) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg }}>
        <View style={[inner, { flex: 1 }]}>{children}</View>
      </View>
    );
  }
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={inner}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Card({
  children,
  onPress,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  const { palette } = useTheme();
  const base: ViewStyle = {
    backgroundColor: palette.bgRaised,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [base, pressed && { opacity: 0.85 }, style]}
    >
      {children}
    </Pressable>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const { palette } = useTheme();
  return (
    <Text
      style={{
        color: palette.text,
        fontSize: 24,
        fontWeight: "700",
        marginBottom: spacing.md,
      }}
    >
      {children}
    </Text>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const { palette } = useTheme();
  return (
    <Text
      style={{
        color: palette.textMuted,
        fontSize: 12,
        fontWeight: "600",
        textTransform: "uppercase",
        letterSpacing: 1,
        marginTop: spacing.lg,
        marginBottom: spacing.sm,
      }}
    >
      {children}
    </Text>
  );
}

export function Body({
  children,
  muted,
  bold,
  size = 15,
}: {
  children: ReactNode;
  muted?: boolean;
  bold?: boolean;
  size?: number;
}) {
  const { palette } = useTheme();
  return (
    <Text
      style={{
        color: muted ? palette.textMuted : palette.text,
        fontSize: size,
        fontWeight: bold ? "600" : "400",
      }}
    >
      {children}
    </Text>
  );
}

export function Chip({
  label,
  active,
  onPress,
  tone = "default",
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const { palette } = useTheme();
  const toneColor =
    tone === "good" ? palette.good : tone === "warn" ? palette.warn : tone === "bad" ? palette.bad : null;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: active ? palette.accent : palette.borderStrong,
        backgroundColor: active ? palette.accentSoft : palette.bgElement,
        marginRight: spacing.sm,
        marginBottom: spacing.sm,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text
        style={{
          color: toneColor ?? (active ? palette.accentText : palette.textMuted),
          fontSize: 13,
          fontWeight: active ? "600" : "400",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>{children}</View>
  );
}

export function Field({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & TextInputProps) {
  const { palette } = useTheme();
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text
        style={{
          color: palette.textMuted,
          fontSize: 13,
          marginBottom: spacing.xs,
        }}
      >
        {label}
      </Text>
      <TextInput
        placeholderTextColor={palette.textFaint}
        accessibilityLabel={label}
        {...input}
        style={[
          {
            backgroundColor: palette.bgElement,
            borderColor: palette.border,
            borderWidth: 1,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            paddingVertical: Platform.OS === "web" ? 10 : 8,
            color: palette.text,
            fontSize: 15,
          },
          input.style,
        ]}
      />
      {hint ? (
        <Text
          style={{ color: palette.textFaint, fontSize: 12, marginTop: spacing.xs }}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function Button({
  label,
  onPress,
  kind = "primary",
  disabled,
}: {
  label: string;
  onPress: () => void;
  kind?: "primary" | "ghost" | "danger";
  disabled?: boolean;
}) {
  const { palette } = useTheme();
  const bg =
    kind === "primary" ? palette.accent : kind === "danger" ? "transparent" : "transparent";
  const border =
    kind === "primary" ? palette.accent : kind === "danger" ? palette.bad : palette.borderStrong;
  const color =
    kind === "primary" ? palette.onAccent : kind === "danger" ? palette.bad : palette.textMuted;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        backgroundColor: bg,
        borderColor: border,
        borderWidth: 1,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.xl,
        paddingVertical: 10,
        alignItems: "center",
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        marginBottom: spacing.sm,
      })}
    >
      <Text style={{ color, fontSize: 15, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  children,
}: {
  icon: string;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  const { palette } = useTheme();
  return (
    <View style={{ alignItems: "center", paddingVertical: spacing.xxl }}>
      <Text style={{ fontSize: 40, marginBottom: spacing.md }}>{icon}</Text>
      <Text
        style={{
          color: palette.text,
          fontSize: 17,
          fontWeight: "600",
          marginBottom: spacing.sm,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          color: palette.textMuted,
          fontSize: 14,
          textAlign: "center",
          maxWidth: 300,
          marginBottom: spacing.lg,
        }}
      >
        {body}
      </Text>
      {children}
    </View>
  );
}

export function FactRow({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" | "bad" }) {
  const { palette } = useTheme();
  const color =
    tone === "good" ? palette.good : tone === "warn" ? palette.warn : tone === "bad" ? palette.bad : palette.text;
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 6,
        gap: spacing.md,
      }}
    >
      <Text style={{ color: palette.textMuted, fontSize: 14 }}>{label}</Text>
      <Text style={{ color, fontSize: 14, flexShrink: 1, textAlign: "right" }}>
        {value}
      </Text>
    </View>
  );
}
