// OneSignal push delivery for the shipped Median Android app.
//
// Production runs the web build inside a Median (GoNative) Android WebView where
// Expo/native push is unavailable. Median ships first-class OneSignal support, so
// real "wake the locked phone" pushes for vendors / franchise owners / delivery
// partners must go through OneSignal's REST API.
//
// Everything here is GATED behind ONESIGNAL_APP_ID + ONESIGNAL_REST_API_KEY — if
// those env vars are not set, every call is a silent no-op so nothing breaks until
// the user creates a OneSignal account, wires it into the Median build, and adds
// the keys. See the new-order push path in routes.ts for callers.

const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID || "";
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY || "";
// Optional: the id of a high-importance Android notification channel configured in
// OneSignal (IMPORTANCE_HIGH + a loud custom ringtone). When set, notifications are
// delivered on that channel so they pop as a heads-up alert with sound even when the
// screen is locked. If unset, OneSignal uses its default channel.
const ONESIGNAL_ANDROID_CHANNEL_ID = process.env.ONESIGNAL_ANDROID_CHANNEL_ID || "";
// Optional absolute base URL of the deployed app (e.g. https://app.gobharat.in).
// Used to build the tap-to-open launch URL so Median navigates straight to the
// relevant orders screen. Falls back to a relative path inside data.deepLink.
const APP_PUBLIC_URL = (process.env.APP_PUBLIC_URL || process.env.EXPO_PUBLIC_DOMAIN || "").replace(/\/+$/, "");
// Custom sound resource names. These must be bundled in the native build for the
// ringtone to play; OneSignal falls back to the default sound if they are missing.
const ANDROID_SOUND = process.env.ONESIGNAL_ANDROID_SOUND || "new_order";
const IOS_SOUND = process.env.ONESIGNAL_IOS_SOUND || "new_order.wav";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isOneSignalConfigured(): boolean {
  return !!(ONESIGNAL_APP_ID && ONESIGNAL_REST_API_KEY);
}

// OneSignal player / subscription ids are UUIDs. This lets pushService route a
// stored token to the right provider (Expo tokens look like ExponentPushToken[...]).
export function isOneSignalToken(token: string): boolean {
  return UUID_RE.test((token || "").trim());
}

function buildLaunchUrl(deepLink?: string): string | undefined {
  if (!deepLink) return undefined;
  if (/^https?:\/\//i.test(deepLink)) return deepLink;
  if (!APP_PUBLIC_URL) return undefined;
  return `${APP_PUBLIC_URL}/${deepLink.replace(/^\/+/, "")}`;
}

export interface OneSignalMessage {
  title: string;
  body: string;
  data?: Record<string, any>;
  deepLink?: string;
}

// Send a high-priority OneSignal notification to a set of player ids.
export async function sendOneSignal(
  playerIds: string[],
  msg: OneSignalMessage
): Promise<{ sent: number; failed: number }> {
  const valid = Array.from(new Set((playerIds || []).filter(isOneSignalToken)));
  if (valid.length === 0) return { sent: 0, failed: 0 };
  if (!isOneSignalConfigured()) {
    // Not configured yet — treat as "not sent" without throwing.
    return { sent: 0, failed: valid.length };
  }

  const launchUrl = buildLaunchUrl(msg.deepLink);
  const payload: Record<string, any> = {
    app_id: ONESIGNAL_APP_ID,
    include_player_ids: valid,
    headings: { en: msg.title },
    contents: { en: msg.body },
    data: { ...(msg.data || {}), ...(msg.deepLink ? { deepLink: msg.deepLink } : {}) },
    // High priority so Android delivers immediately and shows a heads-up alert.
    priority: 10,
    android_visibility: 1,
    android_sound: ANDROID_SOUND,
    ios_sound: IOS_SOUND,
    // Wake / heads-up behaviour for newer Android relies on a high-importance channel.
    ...(ONESIGNAL_ANDROID_CHANNEL_ID ? { android_channel_id: ONESIGNAL_ANDROID_CHANNEL_ID } : {}),
    ...(launchUrl ? { url: launchUrl } : {}),
  };

  try {
    const res = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`OneSignal push failed (${res.status}): ${text}`);
      return { sent: 0, failed: valid.length };
    }
    const json: any = await res.json().catch(() => ({}));
    if (json?.errors) {
      console.error("OneSignal push errors:", json.errors);
      // recipients > 0 still means some were delivered
      if (!json.recipients) return { sent: 0, failed: valid.length };
    }
    const recipients = typeof json?.recipients === "number" ? json.recipients : valid.length;
    return { sent: recipients, failed: Math.max(0, valid.length - recipients) };
  } catch (err) {
    console.error("OneSignal push request error:", err);
    return { sent: 0, failed: valid.length };
  }
}
