import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { UserRole } from "@/lib/types";

const routeMap: Record<string, string> = {
  CUSTOMER: "/(customer)",
  VENDOR: "/(vendor)",
  DELIVERY: "/(delivery)",
  FRANCHISE: "/(franchise)",
  MARKETING: "/(marketing)",
  SUPER_ADMIN: "/(admin)",
};

const roleConfig: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  CUSTOMER: { label: "Customer", color: "#FF6B00", bg: "#FFF5ED", icon: "bag-handle" },
  VENDOR: { label: "Vendor", color: "#3B82F6", bg: "#EFF6FF", icon: "storefront" },
  DELIVERY: { label: "Delivery Partner", color: "#10B981", bg: "#ECFDF5", icon: "bicycle" },
  FRANCHISE: { label: "Franchise Owner", color: "#8B5CF6", bg: "#F3F0FF", icon: "business" },
  MARKETING: { label: "Marketing Executive", color: "#EC4899", bg: "#FDF2F8", icon: "megaphone" },
};

const roleHighlights: Record<string, string[]> = {
  CUSTOMER: [
    "Right to cancel orders within 5 minutes of placement",
    "Secure payments via UPI, Cards, Net Banking, Wallet, COD",
    "Personal data protected under DPDP Act 2023",
    "Dispute resolution through internal grievance mechanism",
    "Platform not liable for third-party product quality",
    "Wallet balance non-refundable after 365 days of inactivity",
    "Account may be suspended for fraudulent activity",
  ],
  VENDOR: [
    "Commission rates set by platform, subject to change with 30-day notice",
    "Must maintain accurate product listings and pricing",
    "Platform may delist products violating quality standards",
    "Responsible for GST compliance under CGST Act 2017",
    "Payout settlements within 7 business days",
    "Must comply with FSSAI regulations for food items",
    "Intellectual property rights remain with respective owners",
  ],
  DELIVERY: [
    "Independent contractor, not an employee of Go Bharat",
    "Must maintain valid driving license and vehicle documents",
    "Earnings based on completed deliveries and distance",
    "Minimum withdrawal amount: Rs 100",
    "Must follow traffic laws and delivery guidelines",
    "Platform provides insurance coverage during active deliveries",
    "Account deactivation for repeated delivery failures",
  ],
  FRANCHISE: [
    "Territory exclusivity for assigned city/region",
    "Revenue sharing as per franchise agreement",
    "Must manage local vendor onboarding and quality control",
    "Responsible for marketing executive team management",
    "Monthly performance targets and reporting obligations",
    "Agreement renewable annually based on performance",
    "Dispute resolution via arbitration under Arbitration Act 1996",
  ],
  MARKETING: [
    "Commission-based earnings on vendor onboarding",
    "Must follow ethical marketing practices",
    "No unauthorized use of Go Bharat branding materials",
    "Performance tracked through lead management system",
    "Incentive bonuses for exceeding monthly targets",
    "Must maintain professional conduct with vendors",
    "Non-compete clause for 6 months post-termination",
  ],
};

export default function AcceptTermsScreen() {
  const { role: paramRole } = useLocalSearchParams<{ role: string }>();
  const insets = useSafeAreaInsets();
  const { acceptTermsForRole, user } = useApp();
  const [check1, setCheck1] = useState(false);
  const [check2, setCheck2] = useState(false);
  const [check3, setCheck3] = useState(false);

  const role = paramRole || user?.role || "CUSTOMER";
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const allChecked = check1 && check2 && check3;
  const config = roleConfig[role] || roleConfig.CUSTOMER;
  const highlights = roleHighlights[role] || roleHighlights.CUSTOMER;

  const toggleCheck = (setter: React.Dispatch<React.SetStateAction<boolean>>) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setter((prev) => !prev);
  };

  const handleAccept = async () => {
    if (!allChecked) return;
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    const effectiveRole = role || user?.role || "CUSTOMER";
    try {
      const existing = await AsyncStorage.getItem("gobharat_terms_accepted");
      const current: string[] = existing ? JSON.parse(existing) : [];
      if (!current.includes(effectiveRole)) {
        const updated = [...current, effectiveRole];
        await AsyncStorage.setItem("gobharat_terms_accepted", JSON.stringify(updated));
      }
    } catch {}
    acceptTermsForRole(effectiveRole as UserRole);
    router.replace(routeMap[effectiveRole] as any);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Image
          source={require("@/assets/images/go-bharat-logo-nobg.png")}
          style={styles.logo}
          contentFit="contain"
          accessibilityLabel="Go Bharat logo"
        />
        <Text style={styles.headerTitle}>Terms & Conditions</Text>
        <Text style={styles.headerSubtitle}>Please review before continuing</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View entering={FadeInDown.duration(400).delay(100)}>
          <View style={[styles.roleBadge, { backgroundColor: config.bg, borderColor: config.color + "30" }]}>
            <View style={[styles.roleBadgeIcon, { backgroundColor: config.color }]}>
              <Ionicons name={config.icon as any} size={18} color="#FFF" />
            </View>
            <Text style={[styles.roleBadgeText, { color: config.color }]}>{config.label}</Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(400).delay(200)}>
          <Text style={styles.sectionTitle}>Key Agreement Highlights</Text>
          <View style={styles.highlightsCard}>
            {highlights.map((item, index) => (
              <View key={index} style={styles.highlightRow}>
                <View style={[styles.bulletDot, { backgroundColor: config.color }]} />
                <Text style={styles.highlightText}>{item}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(400).delay(300)}>
          <Text style={styles.sectionTitle}>Your Consent</Text>

          <Pressable style={styles.checkRow} onPress={() => toggleCheck(setCheck1)}>
            <Ionicons
              name={check1 ? "checkbox" : "checkbox-outline"}
              size={24}
              color={check1 ? Colors.success : Colors.textSecondary}
            />
            <Text style={styles.checkText}>
              I have read and agree to the{" "}
              <Text style={styles.linkText} onPress={() => router.push("/terms" as any)}>
                Terms & Conditions
              </Text>
            </Text>
          </Pressable>

          <Pressable style={styles.checkRow} onPress={() => toggleCheck(setCheck2)}>
            <Ionicons
              name={check2 ? "checkbox" : "checkbox-outline"}
              size={24}
              color={check2 ? Colors.success : Colors.textSecondary}
            />
            <Text style={styles.checkText}>
              I have read and agree to the{" "}
              <Text style={styles.linkText} onPress={() => router.push("/privacy" as any)}>
                Privacy Policy
              </Text>
            </Text>
          </Pressable>

          <Pressable style={styles.checkRow} onPress={() => toggleCheck(setCheck3)}>
            <Ionicons
              name={check3 ? "checkbox" : "checkbox-outline"}
              size={24}
              color={check3 ? Colors.success : Colors.textSecondary}
            />
            <Text style={styles.checkText}>
              I am at least 18 years old and legally competent to enter this agreement
            </Text>
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(400).delay(400)}>
          <Pressable
            style={[styles.acceptButton, !allChecked && { opacity: 0.5 }]}
            onPress={handleAccept}
            disabled={!allChecked}
          >
            <LinearGradient
              colors={["#FF6B00", "#FF8A33"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.acceptGradient}
            >
              <Ionicons name="shield-checkmark" size={20} color="#FFF" />
              <Text style={styles.acceptText}>I Accept & Continue</Text>
            </LinearGradient>
          </Pressable>

          <Text style={styles.bottomNote}>
            By continuing, you agree to be bound by all platform rules and Indian laws governing this agreement.
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    alignItems: "center",
    paddingBottom: 24,
    backgroundColor: "#FFF",
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  logo: {
    width: 140,
    height: 90,
    marginBottom: 12,
  },
  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    color: "#0B1E3D",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "#666",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 50,
    borderWidth: 1,
    marginBottom: 24,
    gap: 10,
  },
  roleBadgeIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  roleBadgeText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
  },
  sectionTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 17,
    color: Colors.secondary,
    marginBottom: 12,
  },
  highlightsCard: {
    backgroundColor: Colors.background,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  highlightRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
    gap: 10,
  },
  bulletDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  highlightText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.text,
    flex: 1,
    lineHeight: 20,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  checkText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.text,
    flex: 1,
    lineHeight: 20,
    marginTop: 2,
  },
  linkText: {
    color: Colors.primary,
    fontFamily: "Poppins_600SemiBold",
    textDecorationLine: "underline",
  },
  acceptButton: {
    marginTop: 28,
    borderRadius: 16,
    overflow: "hidden",
  },
  acceptGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 10,
  },
  acceptText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: "#FFFFFF",
  },
  bottomNote: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 16,
    lineHeight: 16,
    paddingHorizontal: 12,
  },
});
