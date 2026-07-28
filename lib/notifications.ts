import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "./query-client";
import Colors from "../constants/colors";

let Notifications: any = null;
let Device: any = null;

try {
  Notifications = require("expo-notifications");
  Device = require("expo-device");
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch {
}

const NOTIF_SETTINGS_KEY = "gobharat_notif_settings";

export interface NotifSettings {
  orderUpdates: boolean;
  promotions: boolean;
  deliveryAlerts: boolean;
  newArrivals: boolean;
}

const DEFAULT_SETTINGS: NotifSettings = {
  orderUpdates: true,
  promotions: true,
  deliveryAlerts: true,
  newArrivals: true,
};

export async function getNotifSettings(): Promise<NotifSettings> {
  try {
    const data = await AsyncStorage.getItem(NOTIF_SETTINGS_KEY);
    if (data) return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
  } catch {}
  return DEFAULT_SETTINGS;
}

export async function saveNotifSettings(settings: NotifSettings): Promise<void> {
  await AsyncStorage.setItem(NOTIF_SETTINGS_KEY, JSON.stringify(settings));
}

export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === "web" || !Notifications || !Device) return null;

  try {
    if (!Device.isDevice) {
      return null;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      return null;
    }

    if (Platform.OS === "android") {
      try {
        await Notifications.setNotificationChannelAsync("orders", {
          name: "Order Updates",
          importance: Notifications.AndroidImportance?.HIGH || 4,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#FF6B00",
          sound: "default",
        });

        await Notifications.setNotificationChannelAsync("promotions", {
          name: "Promotions & Offers",
          importance: Notifications.AndroidImportance?.DEFAULT || 3,
          lightColor: "#FF6B00",
        });

        await Notifications.setNotificationChannelAsync("delivery", {
          name: "Delivery Alerts",
          importance: Notifications.AndroidImportance?.HIGH || 4,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#10B981",
          sound: "default",
        });
      } catch {}
    }

    const token = (await Notifications.getExpoPushTokenAsync()).data;
    return token;
  } catch {
    return null;
  }
}

export type NotifCategory = "order" | "promotion" | "delivery" | "general";

interface LocalNotifOptions {
  title: string;
  body: string;
  data?: Record<string, any>;
  category?: NotifCategory;
}

export async function sendLocalNotification(options: LocalNotifOptions): Promise<void> {
  if (!Notifications) return;

  try {
    const settings = await getNotifSettings();

    if (options.category === "order" && !settings.orderUpdates) return;
    if (options.category === "promotion" && !settings.promotions) return;
    if (options.category === "delivery" && !settings.deliveryAlerts) return;

    const channelId =
      options.category === "order" ? "orders"
      : options.category === "delivery" ? "delivery"
      : options.category === "promotion" ? "promotions"
      : "default";

    await Notifications.scheduleNotificationAsync({
      content: {
        title: options.title,
        body: options.body,
        data: options.data || {},
        sound: "default",
        ...(Platform.OS === "android" ? { channelId } : {}),
      },
      trigger: null,
    });
  } catch {}
}

export async function scheduleDelayedNotification(
  options: LocalNotifOptions,
  delaySeconds: number
): Promise<string> {
  if (!Notifications) return "";

  try {
    const settings = await getNotifSettings();

    if (options.category === "order" && !settings.orderUpdates) return "";
    if (options.category === "promotion" && !settings.promotions) return "";
    if (options.category === "delivery" && !settings.deliveryAlerts) return "";

    const channelId =
      options.category === "order" ? "orders"
      : options.category === "delivery" ? "delivery"
      : options.category === "promotion" ? "promotions"
      : "default";

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: options.title,
        body: options.body,
        data: options.data || {},
        sound: "default",
        ...(Platform.OS === "android" ? { channelId } : {}),
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes?.TIME_INTERVAL || "timeInterval", seconds: delaySeconds },
    });

    return id;
  } catch {
    return "";
  }
}

const ORDER_STATUS_MESSAGES: Record<string, { title: string; body: (orderId: string, vendorName?: string) => string; emoji: string }> = {
  ACCEPTED: {
    title: "Order Accepted!",
    body: (id, v) => `Your order #${id} has been accepted by ${v || "the vendor"}. It will be prepared shortly.`,
    emoji: "✅",
  },
  PREPARING: {
    title: "Being Prepared",
    body: (id, v) => `${v || "The vendor"} is now preparing your order #${id}. Sit tight!`,
    emoji: "👨‍🍳",
  },
  READY: {
    title: "Order Ready!",
    body: (id) => `Your order #${id} is ready and waiting for pickup by the delivery partner.`,
    emoji: "📦",
  },
  PICKED: {
    title: "Order Picked Up",
    body: (id) => `Your order #${id} has been picked up and is on its way to you!`,
    emoji: "🏍️",
  },
  ON_THE_WAY: {
    title: "On The Way!",
    body: (id) => `Your order #${id} is on its way. Get ready to receive it!`,
    emoji: "🚀",
  },
  DELIVERED: {
    title: "Order Delivered!",
    body: (id) => `Your order #${id} has been delivered. Enjoy! Rate your experience.`,
    emoji: "🎉",
  },
  CANCELLED: {
    title: "Order Cancelled",
    body: (id) => `Your order #${id} has been cancelled. Refund will be processed if applicable.`,
    emoji: "❌",
  },
};

export async function sendOrderStatusNotification(
  orderId: string,
  status: string,
  vendorName?: string
): Promise<void> {
  const msg = ORDER_STATUS_MESSAGES[status];
  if (!msg) return;

  await sendLocalNotification({
    title: `${msg.emoji} ${msg.title}`,
    body: msg.body(orderId, vendorName),
    data: { type: "order_status", orderId, status },
    category: "order",
  });
}

export async function sendDeliveryNotification(
  orderId: string,
  deliveryPartnerName: string
): Promise<void> {
  await sendLocalNotification({
    title: "🏍️ Delivery Partner Assigned",
    body: `${deliveryPartnerName} has been assigned to deliver your order #${orderId}.`,
    data: { type: "delivery_assigned", orderId },
    category: "delivery",
  });
}

export async function sendPromotionNotification(
  title: string,
  body: string,
  promoData?: Record<string, any>
): Promise<void> {
  await sendLocalNotification({
    title: `🎁 ${title}`,
    body,
    data: { type: "promotion", ...promoData },
    category: "promotion",
  });
}

export async function sendOrderPlacedNotification(orderId: string, totalAmount: number): Promise<void> {
  await sendLocalNotification({
    title: "🛒 Order Placed Successfully!",
    body: `Your order #${orderId} worth ₹${totalAmount.toFixed(0)} has been placed. We'll keep you updated!`,
    data: { type: "order_placed", orderId },
    category: "order",
  });
}

export async function sendNewOrderNotificationForVendor(orderId: string, customerName: string, totalAmount: number): Promise<void> {
  await sendLocalNotification({
    title: "🔔 New Order Received!",
    body: `New order #${orderId} from ${customerName} worth ₹${totalAmount.toFixed(0)}. Tap to view details.`,
    data: { type: "new_order_vendor", orderId },
    category: "order",
  });
}

export async function sendNewDeliveryNotificationForPartner(orderId: string, vendorName: string, address: string): Promise<void> {
  await sendLocalNotification({
    title: "📍 New Delivery Available!",
    body: `Pickup from ${vendorName}, deliver to ${address.slice(0, 40)}...`,
    data: { type: "new_delivery", orderId },
    category: "delivery",
  });
}

const PROMOTIONS = [
  { title: "Flash Sale!", body: "Get 30% OFF on all groceries. Order now before the offer ends!", delay: 30 },
  { title: "Free Delivery", body: "Enjoy FREE delivery on your next 3 orders. No minimum order value!", delay: 120 },
  { title: "Weekend Special", body: "Buy 1 Get 1 Free on selected restaurants this weekend. Don't miss out!", delay: 300 },
  { title: "Cashback Offer", body: "Get ₹50 cashback on orders above ₹299. Use code: GOBHARAT50", delay: 600 },
  { title: "New Stores Added", body: "5 new stores just joined Go Bharat near you! Check them out now.", delay: 900 },
];

export async function schedulePromotionNotifications(): Promise<void> {
  if (!Notifications) return;

  try {
    const settings = await getNotifSettings();
    if (!settings.promotions) return;

    const randomPromo = PROMOTIONS[Math.floor(Math.random() * PROMOTIONS.length)];

    await scheduleDelayedNotification({
      title: `🎁 ${randomPromo.title}`,
      body: randomPromo.body,
      data: { type: "promotion" },
      category: "promotion",
    }, randomPromo.delay);
  } catch {}
}

export async function clearAllNotifications(): Promise<void> {
  if (!Notifications) return;
  try {
    await Notifications.dismissAllNotificationsAsync();
    await Notifications.setBadgeCountAsync(0);
  } catch {}
}

export async function getBadgeCount(): Promise<number> {
  if (!Notifications) return 0;
  try {
    return Notifications.getBadgeCountAsync();
  } catch {
    return 0;
  }
}

export async function setBadgeCount(count: number): Promise<void> {
  if (!Notifications) return;
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch {}
}

async function apiCall(path: string, options?: RequestInit) {
  try {
    const baseUrl = getApiUrl();
    const url = new URL(path, baseUrl);
    const res = await fetch(url.toString(), {
      ...options,
      headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function registerPushTokenWithServer(userId: string, token: string, role?: string): Promise<void> {
  await apiCall("/api/notifications/register-token", {
    method: "POST",
    body: JSON.stringify({ userId, token, platform: Platform.OS, role: role || "" }),
  });
}

// ─── OneSignal (Median WebView) push registration ──────────────────────────────
//
// Production ships the web build inside a Median (GoNative) Android WebView, where
// expo-notifications never registers (registerForPushNotifications returns null on
// web). Median provides OneSignal natively and exposes the device's OneSignal
// player/subscription id to the WebView via a JS bridge. We read that id and store
// it server-side so the backend can ring vendors / franchise owners / delivery
// partners even when the app is closed or the phone is locked.
//
// Safe everywhere: it only does anything inside the Median bridge; in a normal
// browser or on native it is a no-op.

function getMedianBridge(): any {
  if (typeof window === "undefined") return null;
  return (window as any).median || (window as any).gonative || null;
}

async function readOneSignalPlayerId(): Promise<string | null> {
  const bridge = getMedianBridge();
  const onesignal = bridge?.onesignal;
  if (!onesignal) return null;
  try {
    const infoFn = onesignal.onesignalInfo || onesignal.userInfo;
    if (typeof infoFn !== "function") return null;
    const info = await infoFn.call(onesignal);
    const id =
      info?.oneSignalUserId ||
      info?.userId ||
      info?.subscriptionId ||
      info?.oneSignalPushToken ||
      info?.pushToken ||
      null;
    return id ? String(id) : null;
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function registerOneSignalToken(userId: string, role?: string): Promise<boolean> {
  if (Platform.OS !== "web") return false;
  if (!getMedianBridge()?.onesignal) return false;

  // The OneSignal player id may not be ready immediately after launch (native
  // registration is async), so retry a few times before giving up.
  let playerId: string | null = null;
  for (let attempt = 0; attempt < 6 && !playerId; attempt++) {
    playerId = await readOneSignalPlayerId();
    if (!playerId) await sleep(2000);
  }
  if (!playerId) return false;

  await apiCall("/api/notifications/register-token", {
    method: "POST",
    body: JSON.stringify({ userId, token: playerId, platform: "onesignal", role: role || "" }),
  });

  // Best-effort: tag the device with role + external user id so OneSignal-side
  // targeting/segments also work. Ignored silently if the bridge lacks these.
  try {
    const onesignal = getMedianBridge()?.onesignal;
    onesignal?.tags?.setTags?.({ role: role || "", userId });
    onesignal?.externalUserId?.set?.({ externalId: userId });
  } catch {}

  return true;
}

export async function fetchNotificationHistory(userId: string, limit = 50): Promise<any[]> {
  const data = await apiCall(`/api/notifications/history?userId=${userId}&limit=${limit}`);
  return data?.notifications || [];
}

export async function fetchUnreadCount(userId: string): Promise<number> {
  const data = await apiCall(`/api/notifications/unread-count?userId=${userId}`);
  return data?.unreadCount || 0;
}

export async function markNotificationsReadOnServer(userId: string, notificationIds: string[]): Promise<void> {
  await apiCall("/api/notifications/mark-read", {
    method: "POST",
    body: JSON.stringify({ userId, notificationIds }),
  });
}

export async function sendOrderUpdateToServer(orderId: string, status: string, userId: string, vendorName?: string): Promise<void> {
  await apiCall("/api/notifications/order-update", {
    method: "POST",
    body: JSON.stringify({ orderId, status, userId, vendorName }),
  });
}

export async function sendPromotionToServer(title: string, body: string, promoCode?: string, discount?: number, targetUserIds?: string[]): Promise<void> {
  await apiCall("/api/notifications/promotion", {
    method: "POST",
    body: JSON.stringify({ title, body, promoCode, discount, targetUserIds }),
  });
}

export async function sendBroadcastNotification(title: string, body: string, segment?: string): Promise<void> {
  await apiCall("/api/notifications/send", {
    method: "POST",
    body: JSON.stringify({ title, body, segment: segment || "all" }),
  });
}

export async function fetchPersonalizedPromotions(userId: string, userRole: string, recentCategories: string[], orderCount: number): Promise<any[]> {
  const data = await apiCall("/api/notifications/personalized-promotions", {
    method: "POST",
    body: JSON.stringify({ userId, userRole, recentCategories, orderCount }),
  });
  return data?.promotions || [];
}

export type NotifTab = "all" | "orders" | "promotions" | "delivery";

export interface NotifItem {
  id: string;
  icon: string;
  title: string;
  message: string;
  time: string;
  color: string;
  category: NotifTab;
  read: boolean;
  deepLink?: string;
  promoCode?: string;
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

const ORDER_STATUS_NOTIF: Record<string, { title: string; msg: (o: any) => string; color: string; icon: string }> = {
  ACCEPTED: { title: "Order Accepted", msg: (o) => `Order #${o.id.slice(-6)} has been accepted by ${o.vendorName}`, color: "#10B981", icon: "checkmark-circle" },
  PREPARING: { title: "Being Prepared", msg: (o) => `${o.vendorName} is preparing your order #${o.id.slice(-6)}`, color: "#F59E0B", icon: "restaurant" },
  READY: { title: "Order Ready", msg: (o) => `Your order #${o.id.slice(-6)} is ready for pickup`, color: "#3B82F6", icon: "cube" },
  PICKED: { title: "Order Picked Up", msg: (o) => `${o.deliveryPartnerName || "Delivery partner"} picked up your order #${o.id.slice(-6)}`, color: "#8B5CF6", icon: "bicycle" },
  ON_THE_WAY: { title: "On The Way!", msg: (o) => `Your order #${o.id.slice(-6)} is on its way to you`, color: Colors.primary, icon: "navigate" },
  DELIVERED: { title: "Delivered!", msg: (o) => `Order #${o.id.slice(-6)} delivered successfully. Rate your experience!`, color: "#22C55E", icon: "bag-check" },
  CANCELLED: { title: "Order Cancelled", msg: (o) => `Order #${o.id.slice(-6)} has been cancelled`, color: "#EF4444", icon: "close-circle" },
};

/**
 * Canonical list of real, local notifications (order status + delivery + admin broadcasts).
 * Read state is derived from the shared, persisted `readIds` so the home-header badge and
 * the Notifications screen always agree and the badge clears once items are read.
 */
export function buildBaseNotifications(orders: any[], appNotifications: any[], readIds: Set<string>): NotifItem[] {
  const items: NotifItem[] = [];

  (orders || []).forEach((order) => {
    const info = ORDER_STATUS_NOTIF[order.status];
    if (info) {
      const id = `order_${order.id}_${order.status}`;
      items.push({
        id,
        icon: info.icon,
        title: info.title,
        message: info.msg(order),
        time: timeAgo(order.deliveredAt || order.pickedAt || order.assignedAt || order.createdAt),
        color: info.color,
        category: "orders",
        read: readIds.has(id),
      });
    }
    if (order.deliveryPartnerName && order.assignedAt) {
      const id = `delivery_${order.id}`;
      items.push({
        id,
        icon: "bicycle",
        title: "Delivery Partner Assigned",
        message: `${order.deliveryPartnerName} is assigned to deliver order #${order.id.slice(-6)}`,
        time: timeAgo(order.assignedAt),
        color: "#10B981",
        category: "delivery",
        read: readIds.has(id),
      });
    }
  });

  (appNotifications || []).forEach((notif) => {
    const id = `app_${notif.id}`;
    items.push({
      id,
      icon: "megaphone",
      title: notif.title,
      message: notif.message,
      time: timeAgo(notif.sentAt),
      color: Colors.primary,
      category: "promotions",
      read: readIds.has(id),
    });
  });

  return items;
}

/** Unread count for the header badge — based on the same canonical list the screen renders. */
export function countUnreadNotifications(orders: any[], appNotifications: any[], readIds: Set<string>): number {
  return buildBaseNotifications(orders, appNotifications, readIds).filter((n) => !n.read).length;
}
