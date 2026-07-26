import { View, Text } from "react-native";
import type { ReactNode } from "react";

/** Standard surface container. One radius, one border, one padding scale. */
export function Card({
  children,
  title,
  subtitle,
  footer,
  className = "",
}: {
  children?: ReactNode;
  title?: string;
  subtitle?: string;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <View
      className={`rounded-card border border-line bg-surface p-4 ${className}`.trim()}
    >
      {title ? (
        <Text className="text-base font-semibold text-ink">{title}</Text>
      ) : null}
      {subtitle ? (
        <Text className="mt-0.5 text-[13px] text-muted">{subtitle}</Text>
      ) : null}
      {children ? <View className={title ? "mt-3" : ""}>{children}</View> : null}
      {footer ? <View className="mt-3">{footer}</View> : null}
    </View>
  );
}
