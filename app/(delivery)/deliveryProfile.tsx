import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TouchableOpacity,
  Platform,
  Switch,
  Modal,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { apiRequest } from "@/lib/query-client";


export default function DeliveryProfile() {
  const insets = useSafeAreaInsets();
  const { user, logout, isOnline, toggleOnline, deliveryOrders, teamMembers, language, setLanguage } = useApp();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const [showSettings, setShowSettings] = useState(false);
  const [showVehicle, setShowVehicle] = useState(false);
  const [showBank, setShowBank] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [pushNotifs, setPushNotifs] = useState(true);
  const [orderAlerts, setOrderAlerts] = useState(true);
  const [promoNotifs, setPromoNotifs] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const handleDeleteAccount = async () => {
    if (!user?.phone) return;
    setDeletingAccount(true);
    try {
      const res = await apiRequest("DELETE", `/api/user/${encodeURIComponent(user.phone)}`);
      if (res.ok) {
        setShowDeleteModal(false);
        logout();
        setTimeout(() => { router.replace("/auth" as any); }, 300);
        Alert.alert("Account Deleted", "Your account and all associated data have been permanently deleted.");
      } else {
        Alert.alert("Error", "Failed to delete account. Please try again.");
      }
    } catch {
      Alert.alert("Error", "Failed to delete account. Please try again.");
    } finally {
      setDeletingAccount(false);
    }
  };

  // Use real delivery orders for this partner
  const myDeliveries = deliveryOrders.filter((o) => o.status === "DELIVERED");
  const deliveredCount = myDeliveries.length;
  const totalEarnings = myDeliveries.length * 40;

  // Joining date from team member record, fallback to account creation
  const memberRecord = teamMembers.find((m) => m.phone === user?.phone);
  const joiningDate = memberRecord?.createdAt
    ? new Date(memberRecord.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

  // On-time rate: deliveries that were completed (all delivered count as on-time for now)
  const totalAssigned = deliveryOrders.length;
  const onTimeRate = totalAssigned > 0 ? Math.round((deliveredCount / totalAssigned) * 100) : 0;

  const languages = [
    { code: "en", label: "English" },
    { code: "hi", label: "Hindi" },
    { code: "mr", label: "Marathi" },
    { code: "ur", label: "Urdu" },
    { code: "ta", label: "Tamil" },
    { code: "te", label: "Telugu" },
    { code: "kn", label: "Kannada" },
    { code: "gu", label: "Gujarati" },
  ];

  const documents = [
    { label: "Aadhaar Card", status: "verified", icon: "card" as const },
    { label: "PAN Card", status: "verified", icon: "document-text" as const },
    { label: "Driving License", status: "verified", icon: "car" as const },
    { label: "Vehicle RC", status: "verified", icon: "bicycle" as const },
    { label: "Insurance", status: "verified", icon: "shield-checkmark" as const },
    { label: "Police Verification", status: "pending", icon: "alert-circle" as const },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: bottomInset + 100 }}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient
        colors={["#0B1E3D", "#142F5E"]}
        style={[styles.header, { paddingTop: topInset + 20 }]}
      >
        <View style={styles.headerTop}>
          <View style={{ width: 32 }} />
          <Text style={styles.headerTitle}>My Profile</Text>
          <Pressable
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
              router.push("/notification-settings" as any);
            }}
          >
            <Ionicons name="notifications-outline" size={22} color="#FFF" />
          </Pressable>
        </View>

        <View style={styles.profileSection}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(user?.name || "D").charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={[styles.statusDot, isOnline ? styles.statusOnline : styles.statusOffline]} />
          </View>
          <Text style={styles.name}>{user?.name || "Delivery Partner"}</Text>
          <Text style={styles.phone}>{user?.phone || "-"}</Text>

          <View style={styles.badgeRow}>
            <View style={styles.roleBadge}>
              <Ionicons name="bicycle" size={12} color="#FFF" />
              <Text style={styles.roleBadgeText}>Delivery Partner</Text>
            </View>
            <View style={[styles.statusBadge, isOnline ? styles.onlineBadge : styles.offlineBadge]}>
              <View style={[styles.statusIndicator, { backgroundColor: isOnline ? "#10B981" : "#EF4444" }]} />
              <Text style={[styles.statusText, { color: isOnline ? "#10B981" : "#EF4444" }]}>
                {isOnline ? "Online" : "Offline"}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{deliveredCount}</Text>
            <Text style={styles.statLabel}>Deliveries</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {totalEarnings >= 1000
                ? `₹${(totalEarnings / 1000).toFixed(1)}K`
                : `₹${totalEarnings}`}
            </Text>
            <Text style={styles.statLabel}>Total Earned</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{onTimeRate}%</Text>
            <Text style={styles.statLabel}>On-time</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.onlineToggleCard}>
        <View style={styles.onlineToggleLeft}>
          <View style={[styles.toggleIcon, { backgroundColor: isOnline ? "#10B981" + "15" : Colors.error + "15" }]}>
            <Ionicons name={isOnline ? "radio" : "radio-outline"} size={22} color={isOnline ? "#10B981" : Colors.error} />
          </View>
          <View>
            <Text style={styles.toggleTitle}>Availability Status</Text>
            <Text style={styles.toggleSubtitle}>
              {isOnline ? "You are receiving delivery requests" : "You are not receiving requests"}
            </Text>
          </View>
        </View>
        <Switch
          value={isOnline}
          onValueChange={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
            toggleOnline();
          }}
          trackColor={{ false: "#E0E0E0", true: "#10B981" + "50" }}
          thumbColor={isOnline ? "#10B981" : "#CCC"}
        />
      </View>

      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.menuCard}>
        {[
          { icon: "person", label: "Personal Information", subtitle: joiningDate !== "—" ? `Member since ${joiningDate}` : "Delivery Partner", action: () => Alert.alert("Personal Information", `Name: ${user?.name || "Delivery Partner"}\nPhone: ${user?.phone || "-"}\nEmail: ${memberRecord?.email || user?.email || "—"}\nCity: ${memberRecord?.city || "—"}\nJoined: ${joiningDate}\nPartner ID: ${user?.id ? user.id.slice(0, 8).toUpperCase() : "—"}`) },
          { icon: "wallet", label: "Earnings & Payouts", subtitle: "View earnings, request withdrawals", action: () => router.push("/delivery-earnings" as any) },
          { icon: "notifications", label: "Notifications", subtitle: "Manage notification preferences", action: () => router.push("/notifications" as any) },
        ].map((item, i, arr) => (
          <Pressable
            key={item.label}
            style={[styles.menuItem, i < arr.length - 1 && styles.menuBorder]}
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
              item.action();
            }}
          >
            <View style={styles.menuLeft}>
              <View style={styles.menuIconBg}>
                <Ionicons name={item.icon as any} size={20} color={Colors.primary} />
              </View>
              <View>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Vehicle & Documents</Text>
      <View style={styles.menuCard}>
        <Pressable
          style={[styles.menuItem, styles.menuBorder]}
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            setShowVehicle(true);
          }}
        >
          <View style={styles.menuLeft}>
            <View style={[styles.menuIconBg, { backgroundColor: "#3B82F6" + "15" }]}>
              <MaterialCommunityIcons name="motorbike" size={20} color="#3B82F6" />
            </View>
            <View>
              <Text style={styles.menuLabel}>Vehicle Information</Text>
              <Text style={styles.menuSubtitle}>{memberRecord?.vehicleNumber || "Not registered"}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
        </Pressable>

        <Pressable
          style={[styles.menuItem, styles.menuBorder]}
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            setShowDocs(true);
          }}
        >
          <View style={styles.menuLeft}>
            <View style={[styles.menuIconBg, { backgroundColor: "#8B5CF6" + "15" }]}>
              <Ionicons name="document-text" size={20} color="#8B5CF6" />
            </View>
            <View>
              <Text style={styles.menuLabel}>Documents</Text>
              <Text style={styles.menuSubtitle}>{documents.filter(d => d.status === "verified").length}/{documents.length} verified</Text>
            </View>
          </View>
          <View style={styles.verifiedBadge}>
            <Ionicons name="checkmark-circle" size={16} color="#10B981" />
          </View>
        </Pressable>

        <Pressable
          style={styles.menuItem}
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
            setShowBank(true);
          }}
        >
          <View style={styles.menuLeft}>
            <View style={[styles.menuIconBg, { backgroundColor: "#10B981" + "15" }]}>
              <Ionicons name="card" size={20} color="#10B981" />
            </View>
            <View>
              <Text style={styles.menuLabel}>Bank & UPI Details</Text>
              <Text style={styles.menuSubtitle}>{memberRecord?.bankName || "Not added"}{memberRecord?.accountNumber ? ` - ****${memberRecord.accountNumber.slice(-4)}` : ""}</Text>
            </View>
          </View>
          {memberRecord?.bankName ? (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
            </View>
          ) : null}
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Settings & Support</Text>
      <View style={styles.menuCard}>
        {[
          { icon: "settings", label: "App Settings", subtitle: "Language, notifications, sound", color: "#6366F1", action: () => setShowSettings(true) },
          { icon: "help-circle", label: "Help & Support", subtitle: "FAQ, contact us, report issue", color: "#0EA5E9", action: () => router.push("/help-support" as any) },
          { icon: "document-lock", label: "Terms & Conditions", subtitle: "Delivery partner agreement", color: "#F59E0B", action: () => router.push("/terms" as any) },
          { icon: "shield-checkmark", label: "Privacy Policy", subtitle: "Data protection & privacy", color: "#10B981", action: () => router.push("/privacy" as any) },
          { icon: "information-circle", label: "About Go Bharat", subtitle: "App version 2.0.1", color: "#8B5CF6", action: () => router.push("/about" as any) },
        ].map((item, i, arr) => (
          <Pressable
            key={item.label}
            style={[styles.menuItem, i < arr.length - 1 && styles.menuBorder]}
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
              item.action();
            }}
          >
            <View style={styles.menuLeft}>
              <View style={[styles.menuIconBg, { backgroundColor: item.color + "15" }]}>
                <Ionicons name={item.icon as any} size={20} color={item.color} />
              </View>
              <View>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
          </Pressable>
        ))}
      </View>

      <TouchableOpacity
        style={styles.logoutBtn}
        activeOpacity={0.7}
        onPress={() => setShowLogoutConfirm(true)}
      >
        <Ionicons name="log-out-outline" size={20} color={Colors.error} />
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>

      <Pressable style={styles.deleteAccountButton} onPress={() => setShowDeleteModal(true)}>
        <Ionicons name="trash-outline" size={18} color="#DC2626" />
        <Text style={styles.deleteAccountText}>Delete Account</Text>
      </Pressable>

      <Text style={styles.versionText}>Go Bharat v2.0.1{user?.id ? ` | Partner ID: ${user.id.slice(0, 8).toUpperCase()}` : ""}</Text>

      <Modal visible={showLogoutConfirm} transparent animationType="fade" onRequestClose={() => setShowLogoutConfirm(false)}>
        <View style={styles.logoutOverlay}>
          <View style={styles.logoutCard}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.error + "15", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <Ionicons name="log-out-outline" size={28} color={Colors.error} />
            </View>
            <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 18, color: Colors.text, marginBottom: 6 }}>Log Out</Text>
            <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textLight, textAlign: "center", marginBottom: 20 }}>Are you sure you want to log out of your account?</Text>
            <View style={{ flexDirection: "row", gap: 12, width: "100%" }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: Colors.backgroundLight, alignItems: "center" }}
                activeOpacity={0.7}
                onPress={() => setShowLogoutConfirm(false)}
              >
                <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.text }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: Colors.error, alignItems: "center" }}
                activeOpacity={0.7}
                onPress={() => {
                  logout();
                  setShowLogoutConfirm(false);
                  setTimeout(() => { router.replace("/auth" as any); }, 300);
                }}
              >
                <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#FFF" }}>Log Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showVehicle} transparent animationType="slide" onRequestClose={() => setShowVehicle(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowVehicle(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Vehicle Information</Text>
              <Pressable onPress={() => setShowVehicle(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>
            {[
              { label: "Registration No.", value: memberRecord?.vehicleNumber || "—", icon: "card" },
              { label: "Driving License", value: memberRecord?.drivingLicenseNumber || "—", icon: "document" },
            ].map((item) => (
              <View key={item.label} style={styles.infoRow}>
                <View style={styles.infoLeft}>
                  <Ionicons name={item.icon as any} size={18} color={Colors.primary} />
                  <Text style={styles.infoLabel}>{item.label}</Text>
                </View>
                <Text style={styles.infoValue}>{item.value}</Text>
              </View>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showBank} transparent animationType="slide" onRequestClose={() => setShowBank(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowBank(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Bank & UPI Details</Text>
              <Pressable onPress={() => setShowBank(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>
            {[
              { label: "Bank Name", value: memberRecord?.bankName || "—", icon: "business" },
              { label: "Account No.", value: memberRecord?.accountNumber ? `XXXX ${memberRecord.accountNumber.slice(-4)}` : "—", icon: "card" },
              { label: "IFSC Code", value: memberRecord?.ifscCode || "—", icon: "code-slash" },
              { label: "Account Holder", value: memberRecord?.accountHolderName || user?.name || "—", icon: "person" },
            ].map((item) => (
              <View key={item.label} style={styles.infoRow}>
                <View style={styles.infoLeft}>
                  <Ionicons name={item.icon as any} size={18} color={Colors.primary} />
                  <Text style={styles.infoLabel}>{item.label}</Text>
                </View>
                <Text style={styles.infoValue}>
                  {item.value}
                </Text>
              </View>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showDocs} transparent animationType="slide" onRequestClose={() => setShowDocs(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowDocs(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Documents</Text>
              <Pressable onPress={() => setShowDocs(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>
            {documents.map((doc) => (
              <View key={doc.label} style={styles.docRow}>
                <View style={styles.infoLeft}>
                  <View style={[styles.docIcon, { backgroundColor: doc.status === "verified" ? "#10B981" + "15" : Colors.warning + "15" }]}>
                    <Ionicons name={doc.icon} size={18} color={doc.status === "verified" ? "#10B981" : Colors.warning} />
                  </View>
                  <Text style={styles.infoLabel}>{doc.label}</Text>
                </View>
                <View style={[styles.docStatusBadge, { backgroundColor: doc.status === "verified" ? "#10B981" + "15" : Colors.warning + "15" }]}>
                  <Ionicons
                    name={doc.status === "verified" ? "checkmark-circle" : "time"}
                    size={14}
                    color={doc.status === "verified" ? "#10B981" : Colors.warning}
                  />
                  <Text style={[styles.docStatusText, { color: doc.status === "verified" ? "#10B981" : Colors.warning }]}>
                    {doc.status === "verified" ? "Verified" : "Pending"}
                  </Text>
                </View>
              </View>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={() => setShowDeleteModal(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 }}>
          <View style={{ backgroundColor: "#FFF", borderRadius: 20, padding: 28, alignItems: "center", width: "100%", maxWidth: 340 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#DC262615", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <Ionicons name="trash-outline" size={28} color="#DC2626" />
            </View>
            <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 18, color: Colors.text, marginBottom: 6 }}>Delete Account</Text>
            <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textLight, textAlign: "center", marginBottom: 20 }}>This will permanently delete your account and all associated data including orders, wallet balance, and saved addresses. This action cannot be undone.</Text>
            <View style={{ flexDirection: "row", gap: 12, width: "100%" }}>
              <Pressable style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: Colors.backgroundLight, alignItems: "center" }} onPress={() => setShowDeleteModal(false)}>
                <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.text }}>Cancel</Text>
              </Pressable>
              <Pressable style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: "#DC2626", alignItems: "center", opacity: deletingAccount ? 0.6 : 1 }} onPress={handleDeleteAccount} disabled={deletingAccount}>
                <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#FFF" }}>{deletingAccount ? "Deleting..." : "Delete"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showSettings} transparent animationType="slide" onRequestClose={() => setShowSettings(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowSettings(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>App Settings</Text>
              <Pressable onPress={() => setShowSettings(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            <Text style={styles.settingsSection}>Notifications</Text>
            {[
              { icon: "notifications" as const, label: "Push Notifications", value: pushNotifs, onChange: setPushNotifs },
              { icon: "bag-check" as const, label: "Order Alerts", value: orderAlerts, onChange: setOrderAlerts },
              { icon: "megaphone" as const, label: "Promotions & Offers", value: promoNotifs, onChange: setPromoNotifs },
              { icon: "volume-high" as const, label: "Sound", value: soundEnabled, onChange: setSoundEnabled },
            ].map((item) => (
              <View key={item.label} style={styles.settingRow}>
                <View style={styles.settingLeft}>
                  <Ionicons name={item.icon} size={20} color={Colors.primary} />
                  <Text style={styles.settingLabel}>{item.label}</Text>
                </View>
                <Switch
                  value={item.value}
                  onValueChange={(v) => { item.onChange(v); try { Haptics.selectionAsync(); } catch {} }}
                  trackColor={{ false: "#E0E0E0", true: Colors.primary + "50" }}
                  thumbColor={item.value ? Colors.primary : "#CCC"}
                />
              </View>
            ))}

            <View style={styles.settingDivider} />

            <Text style={styles.settingsSection}>Language</Text>
            <View style={styles.langGrid}>
              {languages.map((lang) => (
                <Pressable
                  key={lang.code}
                  style={[styles.langBtn, language === lang.code && styles.langBtnActive]}
                  onPress={() => { setLanguage(lang.code as any); try { Haptics.selectionAsync(); } catch {} }}
                >
                  <Text style={[styles.langText, language === lang.code && styles.langTextActive]}>{lang.label}</Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingBottom: 24 },
  headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 20 },
  headerTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 18, color: "#FFF" },
  profileSection: { alignItems: "center", marginBottom: 20 },
  avatarContainer: { position: "relative", marginBottom: 12 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.3)",
  },
  avatarText: { fontFamily: "Poppins_700Bold", fontSize: 32, color: "#FFF" },
  statusDot: { position: "absolute", bottom: 2, right: 2, width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: "#142F5E" },
  statusOnline: { backgroundColor: "#10B981" },
  statusOffline: { backgroundColor: "#EF4444" },
  name: { fontFamily: "Poppins_700Bold", fontSize: 22, color: "#FFF" },
  phone: { fontFamily: "Poppins_400Regular", fontSize: 14, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  roleBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  roleBadgeText: { fontFamily: "Poppins_600SemiBold", fontSize: 11, color: "#FFF" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  onlineBadge: { backgroundColor: "rgba(16,185,129,0.15)" },
  offlineBadge: { backgroundColor: "rgba(239,68,68,0.15)" },
  statusIndicator: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "rgba(255,255,255,0.08)",
    marginHorizontal: 20,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  statItem: { alignItems: "center", flex: 1 },
  statValue: { fontFamily: "Poppins_700Bold", fontSize: 16, color: "#FFF" },
  statLabel: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 },
  statDivider: { width: 1, height: 30, backgroundColor: "rgba(255,255,255,0.15)" },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  onlineToggleCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    marginTop: -12,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  onlineToggleLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  toggleIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  toggleTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  toggleSubtitle: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  sectionTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.secondary, marginHorizontal: 20, marginTop: 24, marginBottom: 10 },
  menuCard: { backgroundColor: "#FFF", borderRadius: 16, marginHorizontal: 20, overflow: "hidden" },
  menuItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  menuBorder: { borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  menuLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  menuIconBg: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.primary + "12", alignItems: "center", justifyContent: "center" },
  menuLabel: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.text },
  menuSubtitle: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  verifiedBadge: { marginRight: 4 },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: Colors.error + "08",
    borderRadius: 14,
    marginTop: 24,
    borderWidth: 1,
    borderColor: Colors.error + "20",
  },
  logoutText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.error },
  deleteAccountButton: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: 6, marginTop: 12, marginHorizontal: 20, paddingVertical: 12 },
  deleteAccountText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: "#DC2626" },
  versionText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight, textAlign: "center", marginTop: 16 },
  logoutOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 },
  logoutCard: { backgroundColor: "#FFF", borderRadius: 20, padding: 28, alignItems: "center", width: "100%", maxWidth: 340 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "80%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary },
  infoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  infoLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  infoLabel: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.text },
  infoValue: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.secondary, maxWidth: 180, textAlign: "right" },
  docRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  docIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  docStatusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  docStatusText: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  settingsSection: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.secondary, marginBottom: 12, marginTop: 4 },
  settingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  settingLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  settingLabel: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.text },
  settingDivider: { height: 1, backgroundColor: Colors.borderLight, marginVertical: 16 },
  langGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  langBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.borderLight },
  langBtnActive: { backgroundColor: Colors.primary + "12", borderColor: Colors.primary },
  langText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textSecondary },
  langTextActive: { color: Colors.primary },
});
