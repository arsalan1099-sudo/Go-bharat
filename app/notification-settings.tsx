import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Switch,
  ScrollView,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import Colors from "@/constants/colors";
import {
  NotifSettings,
  getNotifSettings,
  saveNotifSettings,
  registerForPushNotifications,
  clearAllNotifications,
} from "@/lib/notifications";

interface SettingItemProps {
  icon: string;
  iconColor: string;
  title: string;
  subtitle: string;
  value: boolean;
  onToggle: (val: boolean) => void;
  index: number;
}

function SettingItem({ icon, iconColor, title, subtitle, value, onToggle, index }: SettingItemProps) {
  return (
    <Animated.View entering={FadeInDown.duration(300).delay(index * 60)}>
      <View style={styles.settingRow}>
        <View style={[styles.settingIcon, { backgroundColor: iconColor + "15" }]}>
          <Ionicons name={icon as any} size={20} color={iconColor} />
        </View>
        <View style={styles.settingInfo}>
          <Text style={styles.settingTitle}>{title}</Text>
          <Text style={styles.settingSubtitle}>{subtitle}</Text>
        </View>
        <Switch
          value={value}
          onValueChange={onToggle}
          trackColor={{ false: "#E5E7EB", true: Colors.primary + "60" }}
          thumbColor={value ? Colors.primary : "#F3F4F6"}
        />
      </View>
    </Animated.View>
  );
}

export default function NotificationSettingsScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const [settings, setSettings] = useState<NotifSettings>({
    orderUpdates: true,
    promotions: true,
    deliveryAlerts: true,
    newArrivals: true,
  });
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const saved = await getNotifSettings();
      setSettings(saved);

      if (Platform.OS !== "web") {
        try {
          const NotifModule = require("expo-notifications");
          const { status } = await NotifModule.getPermissionsAsync();
          setPermissionGranted(status === "granted");
        } catch {
          setPermissionGranted(false);
        }
      } else {
        setPermissionGranted(true);
      }
      setLoading(false);
    })();
  }, []);

  const handleToggle = async (key: keyof NotifSettings, val: boolean) => {
    const newSettings = { ...settings, [key]: val };
    setSettings(newSettings);
    await saveNotifSettings(newSettings);
  };

  const handleEnableNotifications = async () => {
    const token = await registerForPushNotifications();
    if (token) {
      setPermissionGranted(true);
    } else {
      Alert.alert(
        "Permission Required",
        "Please enable notifications in your device settings to receive updates.",
        [{ text: "OK" }]
      );
    }
  };

  const handleClearAll = () => {
    Alert.alert(
      "Clear Notifications",
      "This will remove all pending notification reminders. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: async () => {
            await clearAllNotifications();
            Alert.alert("Done", "All notifications cleared.");
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Notification Settings</Text>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: bottomInset + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {!permissionGranted && !loading && Platform.OS !== "web" && (
          <Animated.View entering={FadeInDown.duration(300)}>
            <View style={styles.permissionCard}>
              <View style={styles.permissionIconWrap}>
                <Ionicons name="notifications-off" size={28} color="#EF4444" />
              </View>
              <Text style={styles.permissionTitle}>Notifications are disabled</Text>
              <Text style={styles.permissionSubtitle}>
                Enable notifications to get updates about your orders, deliveries, and exclusive offers.
              </Text>
              <Pressable style={styles.enableBtn} onPress={handleEnableNotifications}>
                <Ionicons name="notifications" size={18} color="#FFF" />
                <Text style={styles.enableBtnText}>Enable Notifications</Text>
              </Pressable>
            </View>
          </Animated.View>
        )}

        {permissionGranted && !loading && (
          <View style={styles.permissionOk}>
            <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
            <Text style={styles.permissionOkText}>Notifications are enabled</Text>
          </View>
        )}

        <Text style={styles.sectionLabel}>NOTIFICATION TYPES</Text>

        <View style={styles.settingsCard}>
          <SettingItem
            icon="bag-handle"
            iconColor="#FF6B00"
            title="Order Updates"
            subtitle="Get notified when your order status changes"
            value={settings.orderUpdates}
            onToggle={(val) => handleToggle("orderUpdates", val)}
            index={0}
          />
          <View style={styles.divider} />
          <SettingItem
            icon="pricetag"
            iconColor="#EF4444"
            title="Promotions & Offers"
            subtitle="Flash sales, cashback, and exclusive deals"
            value={settings.promotions}
            onToggle={(val) => handleToggle("promotions", val)}
            index={1}
          />
          <View style={styles.divider} />
          <SettingItem
            icon="bicycle"
            iconColor="#10B981"
            title="Delivery Alerts"
            subtitle="Real-time delivery partner tracking updates"
            value={settings.deliveryAlerts}
            onToggle={(val) => handleToggle("deliveryAlerts", val)}
            index={2}
          />
          <View style={styles.divider} />
          <SettingItem
            icon="storefront"
            iconColor="#3B82F6"
            title="New Arrivals"
            subtitle="New stores and products in your area"
            value={settings.newArrivals}
            onToggle={(val) => handleToggle("newArrivals", val)}
            index={3}
          />
        </View>

        <Text style={styles.sectionLabel}>ACTIONS</Text>

        <View style={styles.settingsCard}>
          <Pressable style={styles.actionRow} onPress={handleClearAll}>
            <View style={[styles.settingIcon, { backgroundColor: "#FEE2E2" }]}>
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
            </View>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingTitle, { color: "#EF4444" }]}>Clear All Notifications</Text>
              <Text style={styles.settingSubtitle}>Remove all pending notification reminders</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
          </Pressable>
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.textSecondary} />
          <Text style={styles.infoText}>
            Push notifications help you stay updated with your orders and get personalized offers. You can change these settings anytime.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F8FA" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#FFF",
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
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: Colors.secondary,
    marginLeft: 12,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  permissionCard: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#FEE2E2",
  },
  permissionIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  permissionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.text,
    marginBottom: 6,
  },
  permissionSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
  },
  enableBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  enableBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#FFF",
  },
  permissionOk: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ECFDF5",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  permissionOkText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: "#065F46",
  },
  sectionLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    color: Colors.textLight,
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 4,
    paddingLeft: 4,
  },
  settingsCard: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 20,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  settingInfo: {
    flex: 1,
  },
  settingTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  settingSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: "#F0F1F5",
    marginLeft: 68,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#F0F7FF",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  infoText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
});
