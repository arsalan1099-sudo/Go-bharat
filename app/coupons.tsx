import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Alert } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import Colors from "@/constants/colors";

interface CouponData {
  id: string;
  code: string;
  description: string;
  discountText: string;
  minOrder: number;
  expiresAt: string;
  isExpired: boolean;
}

const coupons: CouponData[] = [
  { id: "c1", code: "SAVE100", description: "10% off on your order", discountText: "10% OFF", minOrder: 500, expiresAt: "31 Mar 2026", isExpired: false },
  { id: "c2", code: "FIRST50", description: "Flat Rs.50 off on first order", discountText: "Rs.50 OFF", minOrder: 0, expiresAt: "28 Feb 2026", isExpired: false },
  { id: "c3", code: "FREESHIP", description: "Free delivery on your order", discountText: "FREE DELIVERY", minOrder: 299, expiresAt: "15 Apr 2026", isExpired: false },
  { id: "c4", code: "GOBHARAT20", description: "20% off, max discount Rs.200", discountText: "20% OFF", minOrder: 0, expiresAt: "30 Apr 2026", isExpired: false },
  { id: "c5", code: "DIWALI30", description: "30% off on all orders", discountText: "30% OFF", minOrder: 1000, expiresAt: "15 Nov 2025", isExpired: true },
];

export default function CouponsScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const handleCopy = async (code: string) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    await Clipboard.setStringAsync(code);
    Alert.alert("Copied!", `Coupon code "${code}" copied to clipboard.`);
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0B1E3D", "#142F5E"]} style={[styles.header, { paddingTop: topInset + 12 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </Pressable>
          <Text style={styles.headerTitle}>My Coupons</Text>
          <View style={{ width: 40 }} />
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: bottomInset + 20 }} showsVerticalScrollIndicator={false}>
        {coupons.map((coupon) => (
          <View key={coupon.id} style={[styles.couponCard, coupon.isExpired && styles.couponExpired]}>
            <View style={styles.couponLeft}>
              <View style={[styles.discountBadge, coupon.isExpired && { backgroundColor: Colors.textLight + "20" }]}>
                <Text style={[styles.discountText, coupon.isExpired && { color: Colors.textLight }]}>{coupon.discountText}</Text>
              </View>
            </View>
            <View style={styles.couponDivider} />
            <View style={styles.couponRight}>
              <View style={styles.codeRow}>
                <View style={styles.codeBadge}>
                  <Text style={styles.codeText}>{coupon.code}</Text>
                </View>
                {!coupon.isExpired && (
                  <Pressable style={styles.copyBtn} onPress={() => handleCopy(coupon.code)}>
                    <Ionicons name="copy-outline" size={16} color={Colors.primary} />
                    <Text style={styles.copyText}>Copy</Text>
                  </Pressable>
                )}
              </View>
              <Text style={styles.couponDesc}>{coupon.description}</Text>
              <View style={styles.couponMeta}>
                {coupon.minOrder > 0 && <Text style={styles.couponMetaText}>Min order: {"\u20B9"}{coupon.minOrder}</Text>}
                <Text style={[styles.couponMetaText, coupon.isExpired && { color: Colors.error }]}>
                  {coupon.isExpired ? "Expired" : `Valid till ${coupon.expiresAt}`}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 18, color: "#FFF" },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  couponCard: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: Colors.primary + "40",
    overflow: "hidden",
  },
  couponExpired: { opacity: 0.6, borderColor: Colors.textLight + "40" },
  couponLeft: { width: 90, alignItems: "center", justifyContent: "center", paddingVertical: 16 },
  discountBadge: { backgroundColor: Colors.primary + "15", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  discountText: { fontFamily: "Poppins_700Bold", fontSize: 12, color: Colors.primary, textAlign: "center" },
  couponDivider: { width: 1, backgroundColor: Colors.borderLight, marginVertical: 12 },
  couponRight: { flex: 1, padding: 14 },
  codeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  codeBadge: { backgroundColor: Colors.secondary + "10", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  codeText: { fontFamily: "Poppins_700Bold", fontSize: 14, color: Colors.secondary, letterSpacing: 1 },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: Colors.primary },
  copyText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.primary },
  couponDesc: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, marginBottom: 6 },
  couponMeta: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 4 },
  couponMetaText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight },
});
