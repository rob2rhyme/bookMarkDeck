import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { DURATION } from "./theme";

/** Shimmering placeholder — shown while data loads, instead of a blank screen. */
export function Skeleton({
  height = 16,
  width,
  rounded = "rounded-card",
}: {
  height?: number;
  width?: number | `${number}%`;
  rounded?: string;
}) {
  const pulse = useSharedValue(0.4);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(0.85, { duration: DURATION.slow * 2 }),
      -1,
      true
    );
  }, [pulse]);

  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View style={style} accessibilityElementsHidden>
      <View
        className={`bg-raised ${rounded}`}
        style={{ height, width: width ?? "100%" }}
      />
    </Animated.View>
  );
}
