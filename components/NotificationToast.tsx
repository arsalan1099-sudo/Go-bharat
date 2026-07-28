import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Platform, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInUp, FadeOutUp, useSharedValue, useAnimatedStyle, withTiming, runOnJS } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";

const { width } = Dimensions.get("window");

interface ToastItem {
  id: string;
  title: string;
  message: string;
  icon: string;
  color: string;
  route?: string;
}

const ICON_MAP: Record<string, { icon: string; color: string }> = {
  order_placed: { icon: "bag-check", color: "#10B981" },
  order_status: { icon: "cube", color: "#3B82F6" },
  new_order_vendor: { icon: "notifications", color: Colors.primary },
  delivery_assigned: { icon: "bicycle", color: "#8B5CF6" },
  new_delivery: { icon: "navigate", color: "#10B981" },
  promotion: { icon: "pricetag", color: "#EF4444" },
  default: { icon: "notifications", color: Colors.primary },
};

export default function NotificationToast() {
  const insets = useSafeAreaInsets();
  const { notifications, user } = useApp();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const lastNotifCount = useRef(notifications.length);
  const lastNotifId = useRef<string>("");
  // Record when this component mounted so we never surface pre-existing notifications.
  const mountTimeRef = useRef(Date.now());
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  useEffect(() => {
    const isGuest = !user || user.phone === "guest" || user.phone === "" || !user.phone;
    if (isGuest) {
      setToasts([]);
      lastNotifCount.current = notifications.length;
      lastNotifId.current = "";
      return;
    }
    if (notifications.length > lastNotifCount.current) {
      const newest = notifications[0];
      // Only show a toast if the notification arrived AFTER this component mounted
      // AND within the last 60 seconds — prevents old saved notifications from
      // firing as toasts every time the app starts or the notifications load.
      const notifAge = newest?.sentAt
        ? Date.now() - new Date(newest.sentAt).getTime()
        : 999_999;
      const arrivedAfterMount = newest?.sentAt
        ? new Date(newest.sentAt).getTime() >= mountTimeRef.current - 5000
        : false;
      if (newest && newest.id !== lastNotifId.current && !newest.read
          && notifAge < 60_000 && arrivedAfterMount) {
        lastNotifId.current = newest.id;
        const titleLower = newest.title.toLowerCase();
        const msgLower = newest.message.toLowerCase();
        const category = titleLower.includes("order") || titleLower.includes("placed") ? "order_status"
          : titleLower.includes("delivery") || titleLower.includes("partner") ? "delivery_assigned"
          : titleLower.includes("deal") && (titleLower.includes("approved") || titleLower.includes("live")) ? "promotion"
          : titleLower.includes("promo") || titleLower.includes("offer") || titleLower.includes("sale") || titleLower.includes("cashback") || titleLower.includes("discount") ? "promotion"
          : "default";
        const iconInfo = ICON_MAP[category] || ICON_MAP.default;

        let route = "/notifications";
        const orderIdMatch = newest.message.match(/#(ord[_-]?\w+|[A-Za-z0-9]+)/i) || newest.id.match(/placed_(ord[_-]?\w+)/i) || newest.id.match(/status_(ord[_-]?\w+)/i);
        if (category === "order_status" && orderIdMatch) {
          const oid = orderIdMatch[1].replace(/^ord[_-]?/i, "");
          route = `/order/${orderIdMatch[1]}`;
        } else if (category === "delivery_assigned") {
          route = "/(delivery)";
        } else if (category === "promotion") {
          route = "/notifications";
        }

        const toast: ToastItem = {
          id: newest.id,
          title: newest.title,
          message: newest.message,
          icon: iconInfo.icon,
          color: iconInfo.color,
          route,
        };
        setToasts(prev => [toast, ...prev].slice(0, 3));
        setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== toast.id));
        }, 4500);
      }
    }
    lastNotifCount.current = notifications.length;
  }, [notifications.length, user]);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const handlePress = useCallback((toast: ToastItem) => {
    dismissToast(toast.id);
    if (toast.route) {
      router.push(toast.route as any);
    }
  }, [dismissToast]);

  const isGuest = !user || user.phone === "guest" || user.phone === "" || !user.phone;
  if (isGuest || toasts.length === 0) return null;

  return (
    <View style={[styles.container, { top: topInset + 8 }]} pointerEvents="box-none">
      {toasts.map((toast, index) => (
        <Animated.View
          key={toast.id}
          entering={FadeInUp.duration(300).springify()}
          exiting={FadeOutUp.duration(200)}
          style={[styles.toastWrap, { marginTop: index * 4 }]}
        >
          <Pressable style={styles.toast} onPress={() => handlePress(toast)}>
            <View style={[styles.iconWrap, { backgroundColor: toast.color + "20" }]}>
              <Ionicons name={toast.icon as any} size={20} color={toast.color} />
            </View>
            <View style={styles.textWrap}>
              <Text style={styles.title} numberOfLines={1}>{toast.title}</Text>
              <Text style={styles.message} numberOfLines={2}>{toast.message}</Text>
            </View>
            <Pressable onPress={() => dismissToast(toast.id)} style={styles.closeBtn} hitSlop={8}>
              <Ionicons name="close" size={16} color={Colors.textLight} />
            </Pressable>
          </Pressable>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 9999,
    elevation: 100,
  },
  toastWrap: {
    marginBottom: 6,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: "#F0F1F5",
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: Colors.secondary,
  },
  message: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
    lineHeight: 16,
  },
  closeBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
});
