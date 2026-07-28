import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { UserRole } from "@/lib/types";
import { getApiUrl } from "@/lib/query-client";
import AsyncStorage from "@react-native-async-storage/async-storage";



const ROLES: { label: string; value: UserRole | "ALL" }[] = [
  { label: "All Users", value: "ALL" },
  { label: "Customer", value: "CUSTOMER" },
  { label: "Vendor", value: "VENDOR" },
  { label: "Delivery", value: "DELIVERY" },
  { label: "Franchise", value: "FRANCHISE" },
  { label: "Marketing", value: "MARKETING" },
  { label: "Super Admin", value: "SUPER_ADMIN" },
];

const BAN_ROLES: { label: string; value: UserRole }[] = [
  { label: "Customer", value: "CUSTOMER" },
  { label: "Vendor", value: "VENDOR" },
  { label: "Delivery", value: "DELIVERY" },
  { label: "Franchise", value: "FRANCHISE" },
  { label: "Marketing", value: "MARKETING" },
  { label: "Super Admin", value: "SUPER_ADMIN" },
];

const STAT_META = [
  { role: "CUSTOMER", label: "Customers", icon: "person", color: "#3B82F6" },
  { role: "VENDOR", label: "Vendors", icon: "storefront", color: "#FF6B00" },
  { role: "DELIVERY", label: "Delivery Partners", icon: "bicycle", color: "#10B981" },
  { role: "MARKETING", label: "Marketing Execs", icon: "megaphone", color: "#F59E0B" },
  { role: "FRANCHISE", label: "Franchise Owners", icon: "business", color: "#8B5CF6" },
  { role: "SUPER_ADMIN", label: "Admins", icon: "shield", color: "#EF4444" },
];

export default function UserManagementScreen() {
  const insets = useSafeAreaInsets();
  const { bannedUsers, notifications, banUser, unbanUser, sendNotification } = useApp();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [notifTitle, setNotifTitle] = useState("");
  const [notifMessage, setNotifMessage] = useState("");
  const [notifTarget, setNotifTarget] = useState<UserRole | "ALL">("ALL");

  const [banName, setBanName] = useState("");
  const [banPhone, setBanPhone] = useState("");
  const [banRole, setBanRole] = useState<UserRole>("CUSTOMER");
  const [banReason, setBanReason] = useState("");

  const [statsLoading, setStatsLoading] = useState(true);
  const [byRole, setByRole] = useState<Record<string, number>>({});
  const [growth, setGrowth] = useState({ today: 0, thisWeek: 0, thisMonth: 0 });

  const [grantPhone, setGrantPhone] = useState("");
  const [grantAmount, setGrantAmount] = useState("");
  const [grantNote, setGrantNote] = useState("");
  const [grantLoading, setGrantLoading] = useState(false);
  const [grantSuccess, setGrantSuccess] = useState<string | null>(null);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [grantHistory, setGrantHistory] = useState<any[]>([]);
  const [grantHistoryLoading, setGrantHistoryLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const apiUrl = getApiUrl();
    AsyncStorage.getItem("gobharat_auth_token").then((token) => {
      fetch(new URL("/api/admin/user-stats", apiUrl).toString(), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          if (data.byRole) setByRole(data.byRole);
          if (data.growth) setGrowth(data.growth);
        })
        .catch(() => {})
        .finally(() => { if (!cancelled) setStatsLoading(false); });
    });
    return () => { cancelled = true; };
  }, []);

  const handleSendNotification = () => {
    if (!notifTitle.trim() || !notifMessage.trim()) return;
    sendNotification({ title: notifTitle.trim(), message: notifMessage.trim(), targetRole: notifTarget });
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    setNotifTitle("");
    setNotifMessage("");
    setNotifTarget("ALL");
  };

  const handleBanUser = () => {
    if (!banName.trim() || !banPhone.trim() || !banReason.trim()) return;
    banUser({ name: banName.trim(), phone: banPhone.trim(), role: banRole, reason: banReason.trim() });
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
    setBanName("");
    setBanPhone("");
    setBanRole("CUSTOMER");
    setBanReason("");
  };

  const handleUnban = (id: string) => {
    unbanUser(id);
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
  };

  const loadGrantHistory = async () => {
    setGrantHistoryLoading(true);
    try {
      const token = await AsyncStorage.getItem("gobharat_auth_token");
      if (!token) return;
      const res = await fetch(new URL("/api/admin/coins/grants", getApiUrl()).toString(), {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      setGrantHistory(data.grants || []);
    } catch {} finally {
      setGrantHistoryLoading(false);
    }
  };

  useEffect(() => { loadGrantHistory(); }, []);

  const handleGrantCoins = async () => {
    const cleanPhone = grantPhone.replace(/\D/g, "").slice(-10);
    const amt = parseInt(grantAmount.replace(/,/g, ""), 10);
    if (cleanPhone.length !== 10) { setGrantError("Enter a valid 10-digit phone number"); return; }
    if (!amt || amt <= 0) { setGrantError("Enter a valid coin amount"); return; }
    setGrantLoading(true);
    setGrantSuccess(null);
    setGrantError(null);
    try {
      const token = await AsyncStorage.getItem("gobharat_auth_token");
      if (!token) { setGrantError("Not authenticated"); return; }
      const res = await fetch(new URL("/api/admin/coins/grant", getApiUrl()).toString(), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanPhone, amount: amt, note: grantNote.trim() || "Admin coin grant" }),
      });
      const data = await res.json();
      if (!res.ok) { setGrantError(data.error || "Failed to grant coins"); return; }
      setGrantSuccess(`✓ ${amt.toLocaleString()} coins granted to ${cleanPhone}`);
      setGrantPhone("");
      setGrantAmount("");
      setGrantNote("");
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      loadGrantHistory();
    } catch { setGrantError("Network error. Try again."); }
    finally { setGrantLoading(false); }
  };

  const getRoleLabel = (role: UserRole | "ALL") => {
    const found = ROLES.find((r) => r.value === role);
    return found ? found.label : role;
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: bottomInset + 40 }} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={["#0B1E3D", "#142F5E"]} style={[styles.header, { paddingTop: topInset + 12 }]}>
          <View style={styles.headerRow}>
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color="#FFF" />
            </Pressable>
            <Text style={styles.headerTitle}>User Management</Text>
            <View style={{ width: 36 }} />
          </View>
          <Text style={styles.headerSub}>Manage all platform users, notifications & bans</Text>
        </LinearGradient>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>User Statistics</Text>
          {statsLoading ? (
            <View style={{ alignItems: "center", paddingVertical: 24 }}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : (
            <View style={styles.statsGrid}>
              {STAT_META.map((stat) => (
                <View key={stat.label} style={styles.statCard}>
                  <View style={[styles.statIconWrap, { backgroundColor: stat.color + "15" }]}>
                    <Ionicons name={stat.icon as any} size={22} color={stat.color} />
                  </View>
                  <Text style={styles.statValue}>{(byRole[stat.role] ?? 0).toLocaleString()}</Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>User Growth</Text>
          <View style={styles.growthCard}>
            {[
              { label: "Today", value: growth.today, color: Colors.success },
              { label: "This Week", value: growth.thisWeek, color: Colors.info },
              { label: "This Month", value: growth.thisMonth, color: "#8B5CF6" },
            ].map((g) => (
              <View key={g.label} style={styles.growthRow}>
                <View style={styles.growthLeft}>
                  <View style={[styles.growthDot, { backgroundColor: g.color }]} />
                  <Text style={styles.growthLabel}>{g.label}</Text>
                </View>
                <View style={[styles.growthBadge, { backgroundColor: g.color + "15" }]}>
                  <Ionicons name="trending-up" size={14} color={g.color} />
                  <Text style={[styles.growthValue, { color: g.color }]}>+{g.value.toLocaleString()}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Send Notification</Text>
          <View style={styles.formCard}>
            <Text style={styles.inputLabel}>Title</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Notification title..."
              placeholderTextColor={Colors.textLight}
              value={notifTitle}
              onChangeText={setNotifTitle}
            />
            <Text style={styles.inputLabel}>Message</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              placeholder="Write your message..."
              placeholderTextColor={Colors.textLight}
              value={notifMessage}
              onChangeText={setNotifMessage}
              multiline
              numberOfLines={3}
            />
            <Text style={styles.inputLabel}>Target Role</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roleScroll}>
              {ROLES.map((role) => (
                <Pressable
                  key={role.value}
                  style={[
                    styles.roleChip,
                    notifTarget === role.value && styles.roleChipActive,
                  ]}
                  onPress={() => setNotifTarget(role.value)}
                >
                  <Text
                    style={[
                      styles.roleChipText,
                      notifTarget === role.value && styles.roleChipTextActive,
                    ]}
                  >
                    {role.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              style={[styles.sendBtn, (!notifTitle.trim() || !notifMessage.trim()) && styles.sendBtnDisabled]}
              onPress={handleSendNotification}
            >
              <Ionicons name="send" size={18} color="#FFF" />
              <Text style={styles.sendBtnText}>Send Notification</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Banned Users ({bannedUsers.length})</Text>
          {bannedUsers.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="checkmark-circle" size={36} color={Colors.success} />
              <Text style={styles.emptyText}>No banned users</Text>
            </View>
          ) : (
            bannedUsers.map((bu) => (
              <View key={bu.id} style={styles.bannedCard}>
                <View style={styles.bannedLeft}>
                  <View style={styles.bannedAvatar}>
                    <Ionicons name="person" size={18} color={Colors.error} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bannedName}>{bu.name}</Text>
                    <Text style={styles.bannedPhone}>{bu.phone} | {bu.role}</Text>
                    <Text style={styles.bannedReason}>{bu.reason}</Text>
                    <Text style={styles.bannedDate}>{new Date(bu.bannedAt).toLocaleDateString()}</Text>
                  </View>
                </View>
                <Pressable style={styles.unbanBtn} onPress={() => handleUnban(bu.id)}>
                  <Ionicons name="lock-open" size={16} color={Colors.success} />
                  <Text style={styles.unbanText}>Unban</Text>
                </Pressable>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ban User</Text>
          <View style={styles.formCard}>
            <Text style={styles.inputLabel}>Name</Text>
            <TextInput
              style={styles.textInput}
              placeholder="User name..."
              placeholderTextColor={Colors.textLight}
              value={banName}
              onChangeText={setBanName}
            />
            <Text style={styles.inputLabel}>Phone</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Phone number..."
              placeholderTextColor={Colors.textLight}
              value={banPhone}
              onChangeText={setBanPhone}
              keyboardType="phone-pad"
            />
            <Text style={styles.inputLabel}>Role</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roleScroll}>
              {BAN_ROLES.map((role) => (
                <Pressable
                  key={role.value}
                  style={[
                    styles.roleChip,
                    banRole === role.value && styles.roleChipActiveDanger,
                  ]}
                  onPress={() => setBanRole(role.value)}
                >
                  <Text
                    style={[
                      styles.roleChipText,
                      banRole === role.value && styles.roleChipTextActiveDanger,
                    ]}
                  >
                    {role.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={styles.inputLabel}>Reason</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              placeholder="Reason for banning..."
              placeholderTextColor={Colors.textLight}
              value={banReason}
              onChangeText={setBanReason}
              multiline
              numberOfLines={3}
            />
            <Pressable
              style={[styles.banBtn, (!banName.trim() || !banPhone.trim() || !banReason.trim()) && styles.banBtnDisabled]}
              onPress={handleBanUser}
            >
              <Ionicons name="ban" size={18} color="#FFF" />
              <Text style={styles.banBtnText}>Ban User</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Grant Coins ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="logo-bitcoin" size={20} color="#F59E0B" />
            <Text style={styles.sectionTitle}>Grant Go-Coins</Text>
          </View>
          <View style={styles.formCard}>
            <Text style={styles.inputLabel}>Recipient Phone</Text>
            <TextInput
              style={styles.textInput}
              placeholder="10-digit mobile number..."
              placeholderTextColor={Colors.textLight}
              value={grantPhone}
              onChangeText={(t) => { setGrantPhone(t); setGrantSuccess(null); setGrantError(null); }}
              keyboardType="phone-pad"
              maxLength={15}
            />
            <Text style={styles.inputLabel}>Coin Amount</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. 5000"
              placeholderTextColor={Colors.textLight}
              value={grantAmount}
              onChangeText={(t) => { setGrantAmount(t); setGrantSuccess(null); setGrantError(null); }}
              keyboardType="numeric"
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roleScroll}>
              {[100, 500, 1000, 5000, 10000, 50000, 100000, 1000000].map((preset) => (
                <Pressable
                  key={preset}
                  style={[styles.roleChip, grantAmount === String(preset) && styles.roleChipCoin]}
                  onPress={() => { setGrantAmount(String(preset)); setGrantSuccess(null); setGrantError(null); }}
                >
                  <Text style={[styles.roleChipText, grantAmount === String(preset) && styles.roleChipTextCoin]}>
                    {preset >= 100000 ? `${preset / 100000}L` : preset >= 1000 ? `${preset / 1000}K` : String(preset)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={styles.inputLabel}>Note / Reason</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              placeholder="Reason for granting coins..."
              placeholderTextColor={Colors.textLight}
              value={grantNote}
              onChangeText={setGrantNote}
              multiline
              numberOfLines={2}
            />
            {grantSuccess ? (
              <View style={styles.grantSuccessBanner}>
                <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                <Text style={styles.grantSuccessText}>{grantSuccess}</Text>
              </View>
            ) : null}
            {grantError ? (
              <View style={styles.grantErrorBanner}>
                <Ionicons name="alert-circle" size={16} color={Colors.error} />
                <Text style={styles.grantErrorText}>{grantError}</Text>
              </View>
            ) : null}
            <Pressable
              style={[styles.grantBtn, (grantLoading || !grantPhone.trim() || !grantAmount.trim()) && styles.grantBtnDisabled]}
              onPress={handleGrantCoins}
              disabled={grantLoading || !grantPhone.trim() || !grantAmount.trim()}
            >
              {grantLoading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Ionicons name="gift" size={18} color="#FFF" />
                  <Text style={styles.grantBtnText}>Grant Coins</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Coin Grant History</Text>
          {grantHistoryLoading ? (
            <View style={{ alignItems: "center", paddingVertical: 20 }}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : grantHistory.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="logo-bitcoin" size={36} color={Colors.textLight} />
              <Text style={styles.emptyText}>No coin grants yet</Text>
            </View>
          ) : (
            grantHistory.slice(0, 20).map((g) => (
              <View key={g.id} style={styles.grantHistoryCard}>
                <View style={[styles.grantHistoryIcon, { backgroundColor: g.claimedAt ? Colors.success + "18" : "#F59E0B18" }]}>
                  <Ionicons name="logo-bitcoin" size={18} color={g.claimedAt ? Colors.success : "#F59E0B"} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.grantHistoryRow}>
                    <Text style={styles.grantHistoryPhone}>+91{g.phone}</Text>
                    <Text style={[styles.grantHistoryAmount, { color: "#F59E0B" }]}>+{Number(g.amount).toLocaleString()}</Text>
                  </View>
                  <Text style={styles.grantHistoryNote}>{g.note || "Admin grant"}</Text>
                  <View style={styles.grantHistoryMeta}>
                    <Text style={styles.grantHistoryDate}>{new Date(g.createdAt).toLocaleDateString()}</Text>
                    <View style={[styles.grantStatusBadge, { backgroundColor: g.claimedAt ? Colors.success + "18" : "#F59E0B18" }]}>
                      <Text style={[styles.grantStatusText, { color: g.claimedAt ? Colors.success : "#F59E0B" }]}>
                        {g.claimedAt ? "Claimed" : "Pending"}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Notifications ({notifications.length})</Text>
          {notifications.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="notifications-off" size={36} color={Colors.textLight} />
              <Text style={styles.emptyText}>No notifications sent yet</Text>
            </View>
          ) : (
            notifications.slice().reverse().map((notif) => (
              <View key={notif.id} style={styles.notifCard}>
                <View style={styles.notifIconWrap}>
                  <Ionicons name="notifications" size={18} color={Colors.info} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.notifTitle}>{notif.title}</Text>
                  <Text style={styles.notifMsg}>{notif.message}</Text>
                  <View style={styles.notifMeta}>
                    <View style={styles.notifRoleBadge}>
                      <Text style={styles.notifRoleText}>{getRoleLabel(notif.targetRole)}</Text>
                    </View>
                    <Text style={styles.notifDate}>{new Date(notif.sentAt).toLocaleString()}</Text>
                  </View>
                </View>
              </View>
            ))
          )}
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
    paddingHorizontal: 20,
    paddingBottom: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: "#FFF",
  },
  headerSub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    marginTop: 8,
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 20,
  },
  sectionTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 17,
    color: Colors.text,
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCard: {
    width: "31%",
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  statValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 2,
  },
  growthCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  growthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  growthLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  growthDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  growthLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: Colors.text,
  },
  growthBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  growthValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
  },
  formCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  inputLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 6,
    marginTop: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  textInput: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  textArea: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  roleScroll: {
    marginVertical: 8,
  },
  roleChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surfaceAlt,
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
  },
  roleChipActive: {
    backgroundColor: Colors.primary + "15",
    borderColor: Colors.primary,
  },
  roleChipActiveDanger: {
    backgroundColor: Colors.error + "15",
    borderColor: Colors.error,
  },
  roleChipText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  roleChipTextActive: {
    color: Colors.primary,
    fontFamily: "Poppins_600SemiBold",
  },
  roleChipTextActiveDanger: {
    color: Colors.error,
    fontFamily: "Poppins_600SemiBold",
  },
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    gap: 8,
    marginTop: 16,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: "#FFF",
  },
  banBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.error,
    borderRadius: 14,
    paddingVertical: 14,
    gap: 8,
    marginTop: 16,
  },
  banBtnDisabled: {
    opacity: 0.5,
  },
  banBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: "#FFF",
  },
  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 30,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  bannedCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderLeftWidth: 3,
    borderLeftColor: Colors.error,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  bannedLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    flex: 1,
  },
  bannedAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.error + "12",
    alignItems: "center",
    justifyContent: "center",
  },
  bannedName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  bannedPhone: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  bannedReason: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.error,
    marginTop: 2,
  },
  bannedDate: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
    color: Colors.textLight,
    marginTop: 2,
  },
  unbanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.success + "15",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  unbanText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    color: Colors.success,
  },
  notifCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  notifIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.info + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  notifTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  notifMsg: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  notifMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  notifRoleBadge: {
    backgroundColor: Colors.primary + "15",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  notifRoleText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
    color: Colors.primary,
  },
  notifDate: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
    color: Colors.textLight,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 0,
  },
  roleChipCoin: {
    backgroundColor: "#F59E0B",
    borderColor: "#F59E0B",
    borderWidth: 1,
  },
  roleChipTextCoin: {
    color: "#FFF",
  },
  grantSuccessBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.success + "18",
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  grantSuccessText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.success,
    flex: 1,
  },
  grantErrorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.error + "18",
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  grantErrorText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.error,
    flex: 1,
  },
  grantBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#F59E0B",
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 14,
  },
  grantBtnDisabled: {
    opacity: 0.45,
  },
  grantBtnText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    color: "#FFF",
  },
  grantHistoryCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  grantHistoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  grantHistoryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  grantHistoryPhone: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: Colors.text,
  },
  grantHistoryAmount: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
  },
  grantHistoryNote: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  grantHistoryMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  grantHistoryDate: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textLight,
  },
  grantStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  grantStatusText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
  },
});
