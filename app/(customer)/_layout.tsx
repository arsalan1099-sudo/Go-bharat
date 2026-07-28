import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs, useRouter } from "expo-router";
import { NativeTabs, Icon, Label, Badge } from "expo-router/unstable-native-tabs";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View, Animated, Pressable, Text, BackHandler, Alert, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { t } from "@/lib/i18n";
import { useTabBar } from "@/lib/tabBarContext";
import { hapticSelection } from "@/lib/haptics";
import React, { useEffect } from "react";

function BackToDashboardBanner() {
  const { user } = useApp();
  const router = useRouter();
  const isWeb = Platform.OS === "web";
  const safeAreaInsets = useSafeAreaInsets();

  if (!user?.role || user.role === "CUSTOMER") return null;

  const roleLabels: Record<string, string> = {
    VENDOR: "Vendor",
    DELIVERY: "Delivery",
    FRANCHISE: "Franchise",
    MARKETING: "Marketing",
    SUPER_ADMIN: "Admin",
  };

  return (
    <Pressable
      onPress={() => {
        const routeMap: Record<string, string> = {
          VENDOR: "/(vendor)",
          DELIVERY: "/(delivery)",
          FRANCHISE: "/(franchise)",
          MARKETING: "/(marketing)",
          SUPER_ADMIN: "/(admin)",
        };
        router.replace((routeMap[user.role] || "/(customer)") as any);
      }}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 999,
      }}
    >
      <LinearGradient
        colors={["#FF6B00", "#FF8C33"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{
          paddingTop: isWeb ? 67 + 8 : safeAreaInsets.top + 4,
          paddingBottom: 10,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}
      >
        <Ionicons name="arrow-back-circle" size={22} color="#FFF" />
        <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#FFF" }}>
          Back to {roleLabels[user.role] || ""} Dashboard
        </Text>
        <Ionicons name="chevron-forward" size={16} color="#FFF" />
      </LinearGradient>
    </Pressable>
  );
}

function GuestLoginModal() {
  const { showGuestLoginPrompt, setShowGuestLoginPrompt } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={showGuestLoginPrompt} transparent animationType="fade">
      <View style={guestStyles.overlay}>
        <View style={[guestStyles.card, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
          <View style={guestStyles.iconWrap}>
            <Ionicons name="lock-closed" size={32} color={Colors.primary} />
          </View>
          <Text style={guestStyles.title}>Login Required</Text>
          <Text style={guestStyles.subtitle}>
            Please log in or create an account to continue.
          </Text>
          <Pressable
            style={guestStyles.loginBtn}
            onPress={() => {
              setShowGuestLoginPrompt(false);
              router.replace("/auth" as any);
            }}
          >
            <Ionicons name="person-circle-outline" size={20} color="#FFF" />
            <Text style={guestStyles.loginBtnText}>Login / Sign Up</Text>
          </Pressable>
          <Pressable
            style={guestStyles.cancelBtn}
            onPress={() => setShowGuestLoginPrompt(false)}
          >
            <Text style={guestStyles.cancelBtnText}>Continue Browsing</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const guestStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  card: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingHorizontal: 24,
    gap: 12,
    alignItems: "center",
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.text, textAlign: "center" },
  subtitle: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", lineHeight: 21 },
  loginBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    width: "100%",
    marginTop: 4,
  },
  loginBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: "#FFF" },
  cancelBtn: { paddingVertical: 10, width: "100%", alignItems: "center" },
  cancelBtnText: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.textSecondary },
});

function NativeTabLayout() {
  const { cart, language, user, unreadNotificationCount } = useApp();
  return (
    <>
      <BackToDashboardBanner />
      <GuestLoginModal />
      <NativeTabs>
        <NativeTabs.Trigger name="index">
          <Icon sf={{ default: "house", selected: "house.fill" }} />
          <Label>{t("home", language)}</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="explore">
          <Icon sf={{ default: "map", selected: "map.fill" }} />
          <Label>{t("explore", language)}</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="community">
          <Icon sf={{ default: "bubble.left.and.bubble.right", selected: "bubble.left.and.bubble.right.fill" }} />
          <Label>Community</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="cart">
          <Icon sf={{ default: "cart", selected: "cart.fill" }} />
          <Label>{t("cart", language)}</Label>
          {cart.length > 0 && <Badge>{cart.length}</Badge>}
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="orders">
          <Icon sf={{ default: "list.bullet.rectangle", selected: "list.bullet.rectangle.fill" }} />
          <Label>{t("orders", language)}</Label>
          {unreadNotificationCount > 0 && <Badge>{unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}</Badge>}
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="profile">
          <Icon sf={{ default: "person", selected: "person.fill" }} />
          <Label>{t("profile", language)}</Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </>
  );
}

function ClassicTabLayout() {
  const { cart, language, user, unreadNotificationCount } = useApp();
  const isWeb = Platform.OS === "web";
  const isIOS = Platform.OS === "ios";
  const safeAreaInsets = useSafeAreaInsets();
  const { translateY } = useTabBar();
  const router = useRouter();

  return (
    <>
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
            transform: [{ translateY: translateY as any }],
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
        <Tabs.Screen
          name="index"
          listeners={{ tabPress: () => hapticSelection() }}
          options={{
            title: t("home", language),
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "home" : "home-outline"} size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="explore"
          listeners={{ tabPress: () => hapticSelection() }}
          options={{
            title: t("explore", language),
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "map" : "map-outline"} size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="community"
          listeners={{ tabPress: () => hapticSelection() }}
          options={{
            title: "Community",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "people" : "people-outline"} size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="reels"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="vendor-map"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="cart"
          listeners={{ tabPress: () => hapticSelection() }}
          options={{
            title: t("cart", language),
            tabBarBadge: cart.length > 0 ? cart.length : undefined,
            tabBarBadgeStyle: { backgroundColor: Colors.primary, fontFamily: "Poppins_600SemiBold" },
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "cart" : "cart-outline"} size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="orders"
          listeners={{ tabPress: () => hapticSelection() }}
          options={{
            title: t("orders", language),
            tabBarBadge: unreadNotificationCount > 0 ? (unreadNotificationCount > 9 ? "9+" : unreadNotificationCount) : undefined,
            tabBarBadgeStyle: { backgroundColor: "#EF4444", fontFamily: "Poppins_600SemiBold", fontSize: 10 },
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "receipt" : "receipt-outline"} size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          listeners={{ tabPress: () => hapticSelection() }}
          options={{
            title: t("profile", language),
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "person" : "person-outline"} size={24} color={color} />
            ),
          }}
        />
      </Tabs>
      <BackToDashboardBanner />
      <GuestLoginModal />
    </>
  );
}

export default function CustomerLayout() {
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      Alert.alert(
        "Exit App",
        "Do you want to close the app?",
        [
          { text: "Cancel", style: "cancel", onPress: () => {} },
          { text: "Exit", style: "destructive", onPress: () => BackHandler.exitApp() },
        ],
        { cancelable: true }
      );
      return true;
    });
    return () => handler.remove();
  }, []);

  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
