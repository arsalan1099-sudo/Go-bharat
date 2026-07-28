import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

// Centralized tactile feedback. One safe entry point instead of the per-file
// `try { Haptics.x(); } catch {}` pattern scattered across the app.
//
// The app ships as the WEB build inside a Median Android WebView, so every
// path must work (or no-op) on web. On web we drive the Vibration API
// (navigator.vibrate) directly — it's the only thing a WebView exposes — and
// fall back to a silent no-op when it isn't available. On native we use
// expo-haptics. Nothing here ever throws.

function webVibrate(pattern: number | number[]): void {
  try {
    const nav: any = typeof navigator !== "undefined" ? navigator : undefined;
    if (nav && typeof nav.vibrate === "function") {
      nav.vibrate(pattern);
    }
  } catch {}
}

// Swallows both synchronous throws and rejected promises from expo-haptics so
// a missing/blocked native module can never surface an unhandled rejection.
function safeNative(run: () => Promise<unknown> | void): void {
  try {
    const r = run();
    if (r && typeof (r as Promise<unknown>).catch === "function") {
      (r as Promise<unknown>).catch(() => {});
    }
  } catch {}
}

/** Light tick for navigation, tab switches, toggles, chips, list rows. */
export function hapticSelection(): void {
  if (Platform.OS === "web") return webVibrate(8);
  safeNative(() => Haptics.selectionAsync());
}

/** Soft tap for secondary actions and small buttons. */
export function hapticLight(): void {
  if (Platform.OS === "web") return webVibrate(10);
  safeNative(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Firmer tap for primary actions (add to cart, pay, submit, confirm). */
export function hapticMedium(): void {
  if (Platform.OS === "web") return webVibrate(18);
  safeNative(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/** Positive confirmation (payment success, order placed, redeem complete). */
export function hapticSuccess(): void {
  if (Platform.OS === "web") return webVibrate([0, 12, 45, 14]);
  safeNative(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** Negative feedback (validation failure, payment failed). */
export function hapticError(): void {
  if (Platform.OS === "web") return webVibrate([0, 22, 55, 22]);
  safeNative(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}

export const haptics = {
  selection: hapticSelection,
  light: hapticLight,
  medium: hapticMedium,
  success: hapticSuccess,
  error: hapticError,
};

export default haptics;
