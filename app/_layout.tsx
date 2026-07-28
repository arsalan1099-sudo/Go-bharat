import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { StatusBar } from "expo-status-bar";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { AppProvider } from "@/lib/AppProvider";
import { TabBarProvider } from "@/lib/tabBarContext";
import NotificationToast from "@/components/NotificationToast";
import NewOrderAlert from "@/components/NewOrderAlert";

SplashScreen.preventAutoHideAsync();

function NotificationHandler() {
  const router = useRouter();

  useEffect(() => {
    let subscription: any = null;
    try {
      const Notifications = require("expo-notifications");
      subscription = Notifications.addNotificationResponseReceivedListener(
        (response: any) => {
          const data = response?.notification?.request?.content?.data;
          if (!data) return;
          const { type, orderId } = data;
          if (
            (type === "order_status" || type === "order_placed" || type === "new_order_vendor") &&
            orderId
          ) {
            router.push(`/order/${orderId}` as any);
          } else if (type === "delivery_assigned" || type === "new_delivery") {
            router.push("/(delivery)" as any);
          } else if (type === "VENDOR_QR_PENDING") {
            router.push("/(vendor)/vendorOrders" as any);
          } else if (type === "promotion") {
            router.push("/notifications" as any);
          }
        }
      );
    } catch {}
    return () => {
      if (subscription) {
        try { subscription.remove(); } catch {}
      }
    };
  }, [router]);

  return null;
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false, headerBackTitle: "Back" }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="auth" />
      <Stack.Screen name="(customer)" />
      <Stack.Screen name="(vendor)" />
      <Stack.Screen name="(delivery)" />
      <Stack.Screen name="(franchise)" />
      <Stack.Screen name="(marketing)" />
      <Stack.Screen name="(admin)" />
      <Stack.Screen name="category/[id]" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="subcategory/[id]" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="store/[id]" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="product/[id]" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="bus-booking" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="order/[id]" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="upload-reel" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="ai-assistant" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="wallet" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="addresses" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="coupons" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="wishlist" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="help-support" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="terms" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="privacy" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="about" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="payment" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="vendor-payouts" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="delivery-earnings" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="franchise-revenue" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="marketing-incentives" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="write-review" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="notifications" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="notification-settings" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="vendor-ads" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="submit-story" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="accept-terms" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="admin-manual" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="vendor-chat" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="vendor-travel" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="vendor-manpower" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="vendor-b2b" options={{ headerShown: false, presentation: "card" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError || timedOut) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, timedOut]);

  if (!fontsLoaded && !fontError && !timedOut) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AppProvider>
          <NotificationHandler />
          <NotificationToast />
          <NewOrderAlert />
          <TabBarProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <StatusBar style="light" />
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </TabBarProvider>
        </AppProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
