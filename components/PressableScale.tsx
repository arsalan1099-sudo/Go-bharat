import React, { useCallback } from "react";
import {
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
  GestureResponderEvent,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from "react-native-reanimated";
import {
  hapticSelection,
  hapticLight,
  hapticMedium,
  hapticSuccess,
  hapticError,
} from "@/lib/haptics";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type HapticType =
  | "selection"
  | "light"
  | "medium"
  | "success"
  | "error"
  | "none";

type StyleFn = (state: { pressed: boolean }) => StyleProp<ViewStyle>;

export interface PressableScaleProps extends Omit<PressableProps, "style"> {
  style?: StyleProp<ViewStyle> | StyleFn;
  /** Which haptic to fire on press. Defaults to "selection". Use "none" to skip. */
  haptic?: HapticType;
  /** Scale at the bottom of the press. Defaults to 0.96. */
  scaleTo?: number;
  /** Opacity at the bottom of the press. Defaults to 0.9. */
  dimTo?: number;
}

function fireHaptic(type: HapticType) {
  switch (type) {
    case "selection": hapticSelection(); break;
    case "light": hapticLight(); break;
    case "medium": hapticMedium(); break;
    case "success": hapticSuccess(); break;
    case "error": hapticError(); break;
    default: break;
  }
}

// Drop-in replacement for Pressable / TouchableOpacity that gives a tactile
// feel on every tap: the element dips (scale + slight dim) under the finger and
// springs back on release, and a haptic fires on press. Forwards all Pressable
// props (style, onPress, onLongPress, disabled, hitSlop, testID, etc.) so it can
// replace existing touchables with minimal churn.
//
// The scale/opacity use reanimated transform + opacity (not layout animations),
// which run on web — important since the shipped app is the web build inside a
// Median WebView.
export default function PressableScale({
  haptic = "selection",
  scaleTo = 0.96,
  dimTo = 0.9,
  style,
  onPress,
  onPressIn,
  onPressOut,
  disabled,
  children,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const handlePressIn = useCallback(
    (e: GestureResponderEvent) => {
      scale.value = withTiming(scaleTo, { duration: 90, easing: Easing.out(Easing.quad) });
      opacity.value = withTiming(dimTo, { duration: 90 });
      onPressIn?.(e);
    },
    [scaleTo, dimTo, onPressIn, opacity, scale]
  );

  const handlePressOut = useCallback(
    (e: GestureResponderEvent) => {
      scale.value = withSpring(1, { damping: 14, stiffness: 320, mass: 0.5 });
      opacity.value = withTiming(1, { duration: 140 });
      onPressOut?.(e);
    },
    [onPressOut, opacity, scale]
  );

  const handlePress = useCallback(
    (e: GestureResponderEvent) => {
      if (!disabled) fireHaptic(haptic);
      onPress?.(e);
    },
    [disabled, haptic, onPress]
  );

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={
        ((state: { pressed: boolean }) => [
          typeof style === "function" ? style(state) : style,
          animatedStyle,
        ]) as any
      }
    >
      {children}
    </AnimatedPressable>
  );
}
