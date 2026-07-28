import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { NativeTabs, Icon, Label, Badge } from "expo-router/unstable-native-tabs";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import React from "react";
import RoleGuard from "@/components/RoleGuard";

function useVendorLabels() {
  const { user, vendorApplications, language } = useApp();
  const vendorCategoryId = user?.vendorCategoryId || vendorApplications.find(a => a.phone.replace(/\D/g, "").slice(-10) === user?.phone && (a.status === "APPROVED" || a.status === "LIVE"))?.categoryId;

  const productsLabel = vendorCategoryId === "3" ? "Services"
    : vendorCategoryId === "4" ? "Workers"
    : vendorCategoryId === "5" ? "Routes"
    : vendorCategoryId === "1" ? "Catalog"
    : t("products", language);

  const ordersLabel = vendorCategoryId === "3" ? "Bookings"
    : vendorCategoryId === "4" ? "Jobs"
    : t("orders", language);

  const productsIcon = vendorCategoryId === "3" ? "construct"
    : vendorCategoryId === "4" ? "people"
    : vendorCategoryId === "5" ? "map"
    : "pricetag";

  const productsIconOutline = vendorCategoryId === "3" ? "construct-outline"
    : vendorCategoryId === "4" ? "people-outline"
    : vendorCategoryId === "5" ? "map-outline"
    : "pricetag-outline";

  return { productsLabel, ordersLabel, productsIcon, productsIconOutline, language };
}

function NativeTabLayout() {
  const { orders } = useApp();
  const { productsLabel, ordersLabel, language } = useVendorLabels();
  const pendingOrdersCount = orders.filter((o) => o.status === "PENDING").length;
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>{t("dashboard", language)}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="products">
        <Icon sf={{ default: "bag", selected: "bag.fill" }} />
        <Label>{productsLabel}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="vendorReels">
        <Icon sf={{ default: "play.rectangle", selected: "play.rectangle.fill" }} />
        <Label>{t("reels", language)}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="vendorOrders">
        <Icon sf={{ default: "list.bullet.rectangle", selected: "list.bullet.rectangle.fill" }} />
        <Label>{ordersLabel}</Label>
        {pendingOrdersCount > 0 && <Badge>{pendingOrdersCount > 9 ? "9+" : pendingOrdersCount}</Badge>}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="vendorProfile">
        <Icon sf={{ default: "person", selected: "person.fill" }} />
        <Label>{t("profile", language)}</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const isWeb = Platform.OS === "web";
  const isIOS = Platform.OS === "ios";
  const safeAreaInsets = useSafeAreaInsets();
  const { orders } = useApp();
  const { productsLabel, ordersLabel, productsIcon, productsIconOutline, language } = useVendorLabels();
  const pendingOrdersCount = orders.filter((o) => o.status === "PENDING").length;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textLight,
        tabBarLabelStyle: { fontFamily: "Poppins_500Medium", fontSize: 11 },
        tabBarStyle: {
          position: "absolute" as const,
          backgroundColor: isIOS ? "transparent" : "#FFF",
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: Colors.border,
          elevation: 0,
          paddingBottom: isWeb ? 0 : safeAreaInsets.bottom,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={100} tint="light" style={StyleSheet.absoluteFill} />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "#FFF" }]} />
          ) : null,
      }}
    >
      <Tabs.Screen name="index" options={{ title: t("dashboard", language), tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "home" : "home-outline"} size={24} color={color} /> }} />
      <Tabs.Screen name="products" options={{ title: productsLabel, tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? productsIcon as any : productsIconOutline as any} size={24} color={color} /> }} />
      <Tabs.Screen name="vendorReels" options={{ title: t("reels", language), tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "play-circle" : "play-circle-outline"} size={24} color={color} /> }} />
      <Tabs.Screen name="vendorOrders" options={{ title: ordersLabel, tabBarBadge: pendingOrdersCount > 0 ? (pendingOrdersCount > 9 ? "9+" : pendingOrdersCount) : undefined, tabBarBadgeStyle: { backgroundColor: "#EF4444", fontFamily: "Poppins_600SemiBold", fontSize: 10 }, tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "receipt" : "receipt-outline"} size={24} color={color} /> }} />
      <Tabs.Screen name="vendorProfile" options={{ title: t("profile", language), tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "person" : "person-outline"} size={24} color={color} /> }} />
      <Tabs.Screen name="deals" options={{ href: null }} />
    </Tabs>
  );
}

export default function VendorLayout() {
  return (
    <RoleGuard requiredRole="VENDOR">
      {isLiquidGlassAvailable() ? <NativeTabLayout /> : <ClassicTabLayout />}
    </RoleGuard>
  );
}
