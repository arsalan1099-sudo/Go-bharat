import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  TextInput,
  Switch,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";

export default function CouponsSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { adminCoupons, addAdminCoupon, toggleAdminCoupon, deleteAdminCoupon } = useApp();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"PERCENTAGE" | "FLAT">("PERCENTAGE");
  const [value, setValue] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [expiryDays, setExpiryDays] = useState("30");

  const resetForm = () => {
    setCode("");
    setDiscountType("PERCENTAGE");
    setValue("");
    setMinOrder("");
    setMaxDiscount("");
    setUsageLimit("");
    setIsActive(true);
    setExpiryDays("30");
  };

  const handleCreateCoupon = () => {
    if (!code.trim() || !value || !minOrder || !usageLimit || !expiryDays) {
      Alert.alert("Missing Fields", "Please fill in all required fields.");
      return;
    }
    const expiresAt = new Date(
      Date.now() + parseInt(expiryDays) * 24 * 60 * 60 * 1000
    ).toISOString();

    addAdminCoupon({
      code: code.toUpperCase().trim(),
      discountType,
      value: parseFloat(value),
      minOrder: parseFloat(minOrder),
      maxDiscount: discountType === "PERCENTAGE" ? parseFloat(maxDiscount) || undefined : undefined,
      usageLimit: parseInt(usageLimit) || 0,
      isActive,
      expiresAt,
    });

    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    resetForm();
  };

  const handleDeleteCoupon = (couponId: string, couponCode: string) => {
    Alert.alert(
      "Delete Coupon",
      `Are you sure you want to delete coupon "${couponCode}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteAdminCoupon(couponId);
            try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
          },
        },
      ]
    );
  };

  const getCouponStatus = (coupon: typeof adminCoupons[0]) => {
    if (new Date(coupon.expiresAt) < new Date()) return "Expired";
    if (!coupon.isActive) return "Inactive";
    return "Active";
  };

  const getStatusColor = (status: string) => {
    if (status === "Active") return Colors.success;
    if (status === "Expired") return Colors.error;
    return Colors.textLight;
  };

  const platformSettings = [
    { label: "Default Commission Rate", value: "12%", icon: "wallet-outline" },
    { label: "Delivery Charge", value: "\u20B930", icon: "bicycle-outline" },
    { label: "Free Delivery Above", value: "\u20B9500", icon: "gift-outline" },
    { label: "Max Delivery Distance", value: "10km", icon: "navigate-outline" },
    { label: "GST Rate", value: "18%", icon: "document-text-outline" },
  ];

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0B1E3D", "#142F5E"]} style={[styles.header, { paddingTop: topInset + 12 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#FFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Coupons & Settings</Text>
          <View style={{ width: 36 }} />
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ paddingBottom: bottomInset + 20 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Create Coupon</Text>
          <View style={styles.card}>
            <Text style={styles.inputLabel}>Coupon Code</Text>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              placeholder="e.g. SAVE20"
              placeholderTextColor={Colors.textLight}
              autoCapitalize="characters"
            />

            <Text style={styles.inputLabel}>Discount Type</Text>
            <View style={styles.segmentRow}>
              <Pressable
                style={[styles.segmentBtn, discountType === "PERCENTAGE" && styles.segmentBtnActive]}
                onPress={() => setDiscountType("PERCENTAGE")}
              >
                <Text style={[styles.segmentText, discountType === "PERCENTAGE" && styles.segmentTextActive]}>
                  PERCENTAGE
                </Text>
              </Pressable>
              <Pressable
                style={[styles.segmentBtn, discountType === "FLAT" && styles.segmentBtnActive]}
                onPress={() => setDiscountType("FLAT")}
              >
                <Text style={[styles.segmentText, discountType === "FLAT" && styles.segmentTextActive]}>
                  FLAT
                </Text>
              </Pressable>
            </View>

            <Text style={styles.inputLabel}>
              {discountType === "PERCENTAGE" ? "Discount (%)" : "Discount Amount (\u20B9)"}
            </Text>
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={setValue}
              placeholder={discountType === "PERCENTAGE" ? "e.g. 20" : "e.g. 100"}
              placeholderTextColor={Colors.textLight}
              keyboardType="numeric"
            />

            <Text style={styles.inputLabel}>Min Order Amount (\u20B9)</Text>
            <TextInput
              style={styles.input}
              value={minOrder}
              onChangeText={setMinOrder}
              placeholder="e.g. 300"
              placeholderTextColor={Colors.textLight}
              keyboardType="numeric"
            />

            {discountType === "PERCENTAGE" && (
              <>
                <Text style={styles.inputLabel}>Max Discount (\u20B9)</Text>
                <TextInput
                  style={styles.input}
                  value={maxDiscount}
                  onChangeText={setMaxDiscount}
                  placeholder="e.g. 150"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="numeric"
                />
              </>
            )}

            <Text style={styles.inputLabel}>Usage Limit</Text>
            <TextInput
              style={styles.input}
              value={usageLimit}
              onChangeText={setUsageLimit}
              placeholder="e.g. 100"
              placeholderTextColor={Colors.textLight}
              keyboardType="numeric"
            />

            <View style={styles.switchRow}>
              <Text style={styles.inputLabel}>Active</Text>
              <Switch
                value={isActive}
                onValueChange={setIsActive}
                trackColor={{ false: Colors.border, true: Colors.success + "60" }}
                thumbColor={isActive ? Colors.success : Colors.textLight}
              />
            </View>

            <Text style={styles.inputLabel}>Expires In (days)</Text>
            <TextInput
              style={styles.input}
              value={expiryDays}
              onChangeText={setExpiryDays}
              placeholder="e.g. 30"
              placeholderTextColor={Colors.textLight}
              keyboardType="numeric"
            />

            <Pressable style={styles.createBtn} onPress={handleCreateCoupon}>
              <Ionicons name="add-circle" size={20} color="#FFF" />
              <Text style={styles.createBtnText}>Create Coupon</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Coupons ({adminCoupons.length})</Text>
          {adminCoupons.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="pricetag-outline" size={40} color={Colors.textLight} />
              <Text style={styles.emptyText}>No coupons created yet</Text>
            </View>
          ) : (
            adminCoupons.map((coupon) => {
              const status = getCouponStatus(coupon);
              const statusColor = getStatusColor(status);
              const usageProgress = coupon.usageLimit > 0 ? coupon.usedCount / coupon.usageLimit : 0;

              return (
                <View key={coupon.id} style={styles.couponCard}>
                  <View style={styles.couponHeader}>
                    <View style={styles.couponCodeWrap}>
                      <Text style={styles.couponCode}>{coupon.code}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: statusColor + "18" }]}>
                        <Text style={[styles.statusBadgeText, { color: statusColor }]}>{status}</Text>
                      </View>
                    </View>
                    <Pressable onPress={() => handleDeleteCoupon(coupon.id, coupon.code)}>
                      <Ionicons name="trash-outline" size={20} color={Colors.error} />
                    </Pressable>
                  </View>

                  <Text style={styles.couponDiscount}>
                    {coupon.discountType === "PERCENTAGE"
                      ? `${coupon.value}% off`
                      : `\u20B9${coupon.value} off`}
                  </Text>

                  <View style={styles.couponMeta}>
                    <Text style={styles.couponMetaText}>Min Order: \u20B9{coupon.minOrder}</Text>
                    {coupon.maxDiscount !== undefined && coupon.maxDiscount !== null && (
                      <Text style={styles.couponMetaText}>Max Discount: \u20B9{coupon.maxDiscount}</Text>
                    )}
                  </View>

                  <View style={styles.usageRow}>
                    <Text style={styles.usageLabel}>
                      Usage: {coupon.usedCount} / {coupon.usageLimit}
                    </Text>
                  </View>
                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.min(usageProgress * 100, 100)}%`,
                          backgroundColor: usageProgress > 0.8 ? Colors.error : Colors.primary,
                        },
                      ]}
                    />
                  </View>

                  <View style={styles.couponFooter}>
                    <View style={styles.switchRow}>
                      <Text style={styles.couponToggleLabel}>
                        {coupon.isActive ? "Enabled" : "Disabled"}
                      </Text>
                      <Switch
                        value={coupon.isActive}
                        onValueChange={() => {
                          toggleAdminCoupon(coupon.id);
                          try { Haptics.selectionAsync(); } catch {}
                        }}
                        trackColor={{ false: Colors.border, true: Colors.success + "60" }}
                        thumbColor={coupon.isActive ? Colors.success : Colors.textLight}
                      />
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Platform Settings</Text>
          <View style={styles.card}>
            {platformSettings.map((setting, index) => (
              <View
                key={setting.label}
                style={[
                  styles.settingRow,
                  index < platformSettings.length - 1 && styles.settingRowBorder,
                ]}
              >
                <View style={styles.settingLeft}>
                  <View style={styles.settingIcon}>
                    <Ionicons name={setting.icon as any} size={18} color={Colors.primary} />
                  </View>
                  <Text style={styles.settingLabel}>{setting.label}</Text>
                </View>
                <Text style={styles.settingValue}>{setting.value}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingBottom: 18,
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: "#FFF",
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 20,
  },
  sectionTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: Colors.text,
    marginBottom: 12,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  inputLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  segmentRow: {
    flexDirection: "row",
    gap: 10,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.surfaceAlt,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  segmentBtnActive: {
    backgroundColor: Colors.primary + "15",
    borderColor: Colors.primary,
  },
  segmentText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  segmentTextActive: {
    color: Colors.primary,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 20,
    gap: 8,
  },
  createBtnText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    color: "#FFF",
  },
  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    gap: 10,
  },
  emptyText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textLight,
  },
  couponCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  couponHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  couponCodeWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  couponCode: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: Colors.text,
    letterSpacing: 1,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusBadgeText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
  },
  couponDiscount: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.primary,
    marginTop: 6,
  },
  couponMeta: {
    flexDirection: "row",
    gap: 16,
    marginTop: 6,
  },
  couponMetaText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  usageRow: {
    marginTop: 10,
  },
  usageLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  progressBar: {
    height: 6,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 3,
    marginTop: 6,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  couponFooter: {
    marginTop: 10,
  },
  couponToggleLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  settingRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primary + "12",
    alignItems: "center",
    justifyContent: "center",
  },
  settingLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.text,
  },
  settingValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    color: Colors.primary,
  },
});
