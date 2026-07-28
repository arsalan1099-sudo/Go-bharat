import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
  RefreshControl,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { clearAllNotifications, sendPromotionNotification, markNotificationsReadOnServer, fetchPersonalizedPromotions, fetchNotificationHistory, buildBaseNotifications, timeAgo, type NotifItem, type NotifTab } from "@/lib/notifications";

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { orders, notifications: appNotifications, user, sendNotification, readNotifIds, markNotifItemsRead } = useApp();
  const [activeTab, setActiveTab] = useState<NotifTab>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [serverPromos, setServerPromos] = useState<NotifItem[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  useEffect(() => {
    if (user?.id) {
      const fetchInitialPromos = async () => {
        try {
          const userId = user?.id || "";
          const userRole = user?.role || "CUSTOMER";
          const recentCategories = orders.slice(0, 5).map(o => o.vendorName);
          const [promos, history] = await Promise.all([
            fetchPersonalizedPromotions(userId, userRole, recentCategories, orders.length).catch(() => []),
            fetchNotificationHistory(userId).catch(() => []),
          ]);
          const promoItems: NotifItem[] = (promos || []).map((p: any, i: number) => ({
            id: `server_promo_${p.id || i}_${Date.now()}`,
            icon: "sparkles",
            title: p.title || "Special Offer",
            message: p.message || p.body || "",
            time: p.sentAt ? timeAgo(p.sentAt) : "Just now",
            color: "#8B5CF6",
            category: "promotions" as NotifTab,
            read: false,
            deepLink: p.deepLink || undefined,
            promoCode: p.promoCode || undefined,
          }));
          const historyItems: NotifItem[] = (history || []).map((h: any) => ({
            id: `server_hist_${h.id || Date.now()}`,
            icon: "notifications",
            title: h.title || "Notification",
            message: h.message || h.body || "",
            time: h.sentAt ? timeAgo(h.sentAt) : "Just now",
            color: Colors.primary,
            category: "all" as NotifTab,
            read: h.read ?? false,
          }));
          setServerPromos([...promoItems, ...historyItems]);
        } catch {}
        setIsInitialLoading(false);
      };
      fetchInitialPromos();
    }
  }, [user?.id]);

  const allNotifications = useMemo<NotifItem[]>(() => {
    const readSet = new Set(readNotifIds);
    const items = buildBaseNotifications(orders, appNotifications, readSet);
    const existingIds = new Set(items.map(i => i.id));
    serverPromos.forEach(sp => {
      if (!existingIds.has(sp.id)) items.push({ ...sp, read: sp.read || readSet.has(sp.id) });
    });
    return items;
  }, [orders, appNotifications, readNotifIds, serverPromos]);

  const filteredNotifications = useMemo(() => {
    if (activeTab === "all") return allNotifications;
    return allNotifications.filter((n) => n.category === activeTab);
  }, [allNotifications, activeTab]);

  const unreadCount = useMemo(() => allNotifications.filter((n) => !n.read).length, [allNotifications]);

  const handleMarkAllRead = () => {
    markNotifItemsRead(allNotifications.map((n) => n.id));
  };

  const handleNotifPress = (notif: NotifItem) => {
    markNotifItemsRead([notif.id]);

    if (notif.deepLink) {
      router.push(notif.deepLink as any);
    } else if (notif.category === "orders" && notif.id.startsWith("order_")) {
      const orderId = notif.id.split("_")[1];
      router.push(`/order/${orderId}` as any);
    } else if (notif.category === "delivery" && notif.id.startsWith("delivery_")) {
      const orderId = notif.id.split("_")[1];
      router.push(`/order/${orderId}` as any);
    } else if (notif.promoCode) {
      router.push("/coupons" as any);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const userId = user?.id || "";
      const userRole = user?.role || "CUSTOMER";
      const recentCategories = orders.slice(0, 5).map(o => o.vendorName);
      const [promos, history] = await Promise.all([
        fetchPersonalizedPromotions(userId, userRole, recentCategories, orders.length).catch(() => []),
        fetchNotificationHistory(userId).catch(() => []),
      ]);
      const promoItems: NotifItem[] = (promos || []).map((p: any, i: number) => ({
        id: `server_promo_${p.id || i}_${Date.now()}`,
        icon: "sparkles",
        title: p.title || "Special Offer",
        message: p.message || p.body || "",
        time: p.sentAt ? timeAgo(p.sentAt) : "Just now",
        color: "#8B5CF6",
        category: "promotions" as NotifTab,
        read: false,
        deepLink: p.deepLink || undefined,
        promoCode: p.promoCode || undefined,
      }));
      const historyItems: NotifItem[] = (history || []).map((h: any) => ({
        id: `server_hist_${h.id || Date.now()}`,
        icon: "notifications",
        title: h.title || "Notification",
        message: h.message || h.body || "",
        time: h.sentAt ? timeAgo(h.sentAt) : "Just now",
        color: Colors.primary,
        category: "all" as NotifTab,
        read: h.read ?? false,
      }));
      setServerPromos([...promoItems, ...historyItems]);
    } catch {}
    setRefreshing(false);
  };

  const tabs: { id: NotifTab; label: string; icon: string }[] = [
    { id: "all", label: "All", icon: "apps" },
    { id: "orders", label: "Orders", icon: "bag-handle" },
    { id: "promotions", label: "Promos", icon: "pricetag" },
    { id: "delivery", label: "Delivery", icon: "bicycle" },
  ];

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.headerRight}>
          <Pressable onPress={() => router.push("/notification-settings" as any)} style={styles.headerAction}>
            <Ionicons name="settings-outline" size={20} color={Colors.textSecondary} />
          </Pressable>
          {unreadCount > 0 && (
            <Pressable onPress={handleMarkAllRead} style={styles.headerAction}>
              <Ionicons name="checkmark-done" size={20} color={Colors.primary} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const count = tab.id === "all"
            ? allNotifications.length
            : allNotifications.filter((n) => n.category === tab.id).length;
          return (
            <Pressable
              key={tab.id}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setActiveTab(tab.id)}
            >
              <Ionicons name={tab.icon as any} size={16} color={isActive ? "#FFF" : Colors.textSecondary} />
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
              <View style={[styles.tabCount, isActive && styles.tabCountActive]}>
                <Text style={[styles.tabCountText, isActive && styles.tabCountTextActive]}>{count}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        style={styles.list}
        contentContainerStyle={[styles.listContent, { paddingBottom: Platform.OS === "web" ? 84 : Math.max(insets.bottom, 16) + 60 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
        showsVerticalScrollIndicator={false}
      >
        {filteredNotifications.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="notifications-off-outline" size={48} color={Colors.textLight} />
            </View>
            <Text style={styles.emptyTitle}>No notifications</Text>
            <Text style={styles.emptySubtitle}>
              {activeTab === "all"
                ? "You're all caught up! Check back later."
                : `No ${activeTab} notifications yet.`
              }
            </Text>
          </View>
        ) : (
          filteredNotifications.map((notif, i) => (
            <Animated.View key={notif.id} entering={FadeInDown.duration(300).delay(i * 40)}>
              <Pressable
                style={[styles.notifItem, !notif.read && styles.notifItemUnread]}
                onPress={() => handleNotifPress(notif)}
              >
                <View style={[styles.notifIconWrap, { backgroundColor: notif.color + "15" }]}>
                  <Ionicons name={notif.icon as any} size={22} color={notif.color} />
                </View>
                <View style={styles.notifContent}>
                  <View style={styles.notifTitleRow}>
                    <Text style={[styles.notifTitle, !notif.read && styles.notifTitleUnread]} numberOfLines={1}>
                      {notif.title}
                    </Text>
                    {!notif.read && <View style={styles.unreadDot} />}
                  </View>
                  <Text style={styles.notifMessage} numberOfLines={2}>{notif.message}</Text>
                  <View style={styles.notifFooter}>
                    <Text style={styles.notifTime}>{notif.time}</Text>
                    {notif.promoCode ? (
                      <View style={styles.promoCodeBadge}>
                        <Ionicons name="ticket-outline" size={10} color="#8B5CF6" />
                        <Text style={styles.promoCodeText}>{notif.promoCode}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                {(notif.deepLink || notif.category === "orders") && (
                  <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
                )}
              </Pressable>
            </Animated.View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F1F5",
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: Colors.secondary,
    marginLeft: 12,
  },
  headerRight: {
    flexDirection: "row",
    gap: 6,
  },
  headerAction: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  tabBar: {
    maxHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F1F5",
  },
  tabBarContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
    height: 36,
  },
  tabActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: "#FFF",
  },
  tabCount: {
    backgroundColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: "center",
  },
  tabCountActive: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  tabCountText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
    color: Colors.textSecondary,
  },
  tabCountTextActive: {
    color: "#FFF",
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingTop: 4,
  },
  notifItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F7F8FA",
  },
  notifItemUnread: {
    backgroundColor: "#FFF5ED",
  },
  notifIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  notifContent: {
    flex: 1,
  },
  notifTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  notifTitle: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: Colors.text,
    flex: 1,
  },
  notifTitleUnread: {
    fontFamily: "Poppins_700Bold",
    color: Colors.secondary,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  notifMessage: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  notifFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  notifTime: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textLight,
  },
  promoCodeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#F3E8FF",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  promoCodeText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 9,
    color: "#8B5CF6",
    letterSpacing: 0.5,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 80,
    paddingHorizontal: 40,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
    color: Colors.text,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
});
