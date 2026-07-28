import Expo, { ExpoPushMessage, ExpoPushTicket } from "expo-server-sdk";
import { sendOneSignal, isOneSignalToken } from "./oneSignalService";

const expo = new Expo();

export async function sendPushNotifications(
  tokens: Array<{ userId: string; token: string; platform: string }>,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<{ sent: number; failed: number }> {
  const messages: Array<ExpoPushMessage> = [];

  for (const { token } of tokens) {
    if (!Expo.isExpoPushToken(token)) {
      console.warn(`Invalid Expo push token: ${token}`);
      continue;
    }
    messages.push({
      to: token,
      sound: "default",
      title,
      body,
      data: data || {},
    });
  }

  if (messages.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const chunks = expo.chunkPushNotifications(messages);
  let sent = 0;
  let failed = 0;

  for (const chunk of chunks) {
    try {
      const ticketChunk: Array<ExpoPushTicket> = await expo.sendPushNotificationsAsync(chunk);
      for (const ticket of ticketChunk) {
        if (ticket.status === "ok") {
          sent++;
        } else {
          failed++;
          if (ticket.status === "error") {
            console.error(`Push notification error: ${ticket.message}`);
          }
        }
      }
    } catch (error) {
      console.error("Error sending push notification chunk:", error);
      failed += chunk.length;
    }
  }

  return { sent, failed };
}

export async function sendPushToUser(
  storage: any,
  userId: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<boolean> {
  const tokenData = await storage.getPushToken(userId);
  if (!tokenData) return false;

  // Route to the right provider. Median (production) registers OneSignal player
  // ids; Expo/native builds register Expo push tokens.
  if (tokenData.platform === "onesignal" || isOneSignalToken(tokenData.token)) {
    const result = await sendOneSignal([tokenData.token], {
      title,
      body,
      data,
      deepLink: data?.deepLink,
    });
    return result.sent > 0;
  }

  const result = await sendPushNotifications(
    [{ userId, token: tokenData.token, platform: tokenData.platform }],
    title,
    body,
    data
  );
  return result.sent > 0;
}

// Ring every registered user of a given role (used to alert all delivery partners
// when an order becomes available for pickup). Routes each token to its provider.
export async function sendPushToRole(
  storage: any,
  role: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<{ sent: number; failed: number }> {
  const tokens: Array<{ userId: string; token: string; platform: string }> =
    (await storage.getPushTokensByRole?.(role)) || [];
  if (tokens.length === 0) return { sent: 0, failed: 0 };

  const oneSignalIds: string[] = [];
  const expoTokens: Array<{ userId: string; token: string; platform: string }> = [];
  for (const t of tokens) {
    if (t.platform === "onesignal" || isOneSignalToken(t.token)) oneSignalIds.push(t.token);
    else expoTokens.push(t);
  }

  let sent = 0;
  let failed = 0;
  if (oneSignalIds.length > 0) {
    const r = await sendOneSignal(oneSignalIds, { title, body, data, deepLink: data?.deepLink });
    sent += r.sent;
    failed += r.failed;
  }
  if (expoTokens.length > 0) {
    const r = await sendPushNotifications(expoTokens, title, body, data);
    sent += r.sent;
    failed += r.failed;
  }
  return { sent, failed };
}
