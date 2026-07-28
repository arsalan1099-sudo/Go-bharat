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

function NativeTabLayout() {
  const { language, unreadNotificationCount } = useApp();
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>{t("dashboard", language)}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="deliveryOrders">
        <Icon sf={{ default: "list.bullet.rectangle", selected: "list.bullet.rectangle.fill" }} />
        <Label>{t("orders", language)}</Label>
        {unreadNotificationCount > 0 && <Badge>{unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}</Badge>}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="earnings">
        <Icon sf={{ default: "indianrupeesign.circle", selected: "indianrupeesign.circle.fill" }} />
        <Label>{t("earnings", language)}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="deliveryProfile">
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
  const { language, unreadNotificationCount } = useApp();

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
      <Tabs.Screen name="deliveryOrders" options={{ title: t("orders", language), tabBarBadge: unreadNotificationCount > 0 ? (unreadNotificationCount > 9 ? "9+" : unreadNotificationCount) : undefined, tabBarBadgeStyle: { backgroundColor: "#EF4444", fontFamily: "Poppins_600SemiBold", fontSize: 10 }, tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "list" : "list-outline"} size={24} color={color} /> }} />
      <Tabs.Screen name="earnings" options={{ title: t("earnings", language), tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "wallet" : "wallet-outline"} size={24} color={color} /> }} />
      <Tabs.Screen name="deliveryProfile" options={{ title: t("profile", language), tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "person" : "person-outline"} size={24} color={color} /> }} />
    </Tabs>
  );
}

export default function DeliveryLayout() {
  return (
    <RoleGuard requiredRole="DELIVERY">
      {isLiquidGlassAvailable() ? <NativeTabLayout /> : <ClassicTabLayout />}
    </RoleGuard>
  );
}
