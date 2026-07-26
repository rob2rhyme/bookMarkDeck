import { useId } from "react";
import { Text, TextInput, View } from "react-native";
import type { TextInputProps } from "react-native";

import { HIT_SLOP_MIN } from "./theme";

/**
 * A labelled text input.
 *
 * Every field in this app goes through here so a visible label is structural,
 * not optional — the web version relied on placeholders (≈44 controls to ≈6
 * labels), which is the single biggest accessibility debt we are NOT porting.
 */
export function Field({
  label,
  hint,
  error,
  required,
  ...input
}: TextInputProps & {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
}) {
  const id = useId();

  return (
    <View className="gap-1.5">
      <Text nativeID={`${id}-label`} className="text-[13px] font-medium text-muted">
        {label}
        {required ? <Text className="text-bad"> *</Text> : null}
      </Text>

      <TextInput
        accessibilityLabel={label}
        accessibilityLabelledBy={`${id}-label`}
        accessibilityHint={hint}
        placeholderTextColor="rgb(148 163 184)"
        style={{ minHeight: HIT_SLOP_MIN }}
        className={[
          "rounded-card border bg-raised px-3 py-3 text-[15px] text-ink",
          error ? "border-bad" : "border-line",
        ].join(" ")}
        {...input}
      />

      {error ? (
        <Text className="text-[12px] text-bad">{error}</Text>
      ) : hint ? (
        <Text className="text-[12px] text-faint">{hint}</Text>
      ) : null}
    </View>
  );
}
