import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";

const ACCESS_LEVELS = [
  { id: "full", label: "Full Access", desc: "All admin privileges", icon: "shield-checkmark" as const, color: "#EF4444" },
  { id: "limited", label: "Limited Access", desc: "View & manage orders only", icon: "shield-half" as const, color: "#F59E0B" },
  { id: "readonly", label: "View Only", desc: "Read-only dashboard access", icon: "eye" as const, color: "#3B82F6" },
];

export default function AdminManagement() {
  const insets = useSafeAreaInsets();
  const { user, teamMembers, addTeamMember, removeTeamMember, toggleTeamMemberStatus, adminPhone, setAdminPhone } = useApp();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [showModal, setShowModal] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [newAdminPhone, setNewAdminPhone] = useState(adminPhone);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [accessLevel, setAccessLevel] = useState("full");

  const admins = teamMembers.filter((m) => m.role === "SUPER_ADMIN");

  const resetForm = () => {
    setName("");
    setPhone("");
    setEmail("");
    setCity("");
    setAccessLevel("full");
  };

  const handleSubmit = () => {
    if (!name.trim() || !phone.trim() || !email.trim()) {
      Alert.alert("Missing Info", "Please fill in name, phone, and email.");
      return;
    }
    if (phone.replace(/\D/g, "").length !== 10) {
      Alert.alert("Invalid Phone", "Please enter a valid 10-digit phone number.");
      return;
    }
    if (!email.includes("@")) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    addTeamMember({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      role: "SUPER_ADMIN",
      city: city.trim() || "Malegaon",
      territory: accessLevel === "full" ? "Full Access" : accessLevel === "limited" ? "Limited Access" : "View Only",
      status: "ACTIVE",
      createdBy: user?.name || "Admin",
      createdByRole: "SUPER_ADMIN",
    });
    resetForm();
    setShowModal(false);
  };

  const handleRemove = (id: string, memberName: string) => {
    if (Platform.OS === "web") {
      const confirmed = window.confirm(`Remove admin ${memberName}? This will revoke all their admin privileges.`);
      if (confirmed) {
        removeTeamMember(id);
      }
      return;
    }
    Alert.alert(
      "Remove Admin",
      `Remove ${memberName} from admin? This will revoke all their admin privileges.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
            removeTeamMember(id);
          },
        },
      ]
    );
  };

  const handleChangePhone = () => {
    const cleaned = newAdminPhone.replace(/\D/g, "");
    if (cleaned.length !== 10) {
      Alert.alert("Invalid Phone", "Please enter a valid 10-digit phone number.");
      return;
    }
    const existingMember = teamMembers.find(m => m.phone.replace(/\D/g, "").slice(-10) === cleaned && m.status === "ACTIVE");
    if (existingMember) {
      Alert.alert("Phone In Use", `This number is already assigned to ${existingMember.name} (${existingMember.role}). Please use a different number.`);
      return;
    }
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    setAdminPhone(cleaned);
    setShowPhoneModal(false);
    Alert.alert("Phone Updated", `Admin login number changed to ${cleaned}. Use this number to log in as Super Admin next time.`);
  };

  const getAccessColor = (territory?: string) => {
    if (territory === "Full Access") return "#EF4444";
    if (territory === "Limited Access") return "#F59E0B";
    return "#3B82F6";
  };

  const getAccessIcon = (territory?: string): any => {
    if (territory === "Full Access") return "shield-checkmark";
    if (territory === "Limited Access") return "shield-half";
    return "eye";
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0B1E3D", "#142F5E", "#1A3A6B"]} style={[styles.header, { paddingTop: topInset + 12 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#FFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Admin Management</Text>
          <Pressable
            style={styles.addBtn}
            onPress={() => { try { Haptics.selectionAsync(); } catch {} setShowModal(true); }}
          >
            <Ionicons name="add" size={22} color="#FFF" />
          </Pressable>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ paddingBottom: bottomInset + 20 }} showsVerticalScrollIndicator={false}>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: "#EF4444" + "18" }]}>
              <Ionicons name="shield-checkmark" size={18} color="#EF4444" />
            </View>
            <Text style={styles.statValue}>{admins.length + 1}</Text>
            <Text style={styles.statLabel}>Total Admins</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: Colors.success + "18" }]}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
            </View>
            <Text style={styles.statValue}>{admins.filter(a => a.status === "ACTIVE").length + 1}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: "#F59E0B" + "18" }]}>
              <Ionicons name="time" size={18} color="#F59E0B" />
            </View>
            <Text style={styles.statValue}>{admins.filter(a => a.status === "INACTIVE").length}</Text>
            <Text style={styles.statLabel}>Suspended</Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={18} color="#3B82F6" />
          <Text style={styles.infoText}>Only Super Admins can create or remove other admins. All admin actions are logged.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>You (Primary Admin)</Text>
          <View style={styles.adminCard}>
            <View style={styles.cardTop}>
              <View style={[styles.avatarCircle, { backgroundColor: "#EF4444" }]}>
                <Ionicons name="shield-checkmark" size={20} color="#FFF" />
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.cardName}>{user?.name || "Super Admin"}</Text>
                <Text style={styles.cardEmail}>{user?.email || "admin@gobharat.in"}</Text>
              </View>
              <View style={[styles.accessBadge, { backgroundColor: "#EF4444" + "15" }]}>
                <Ionicons name="shield-checkmark" size={12} color="#EF4444" />
                <Text style={[styles.accessBadgeText, { color: "#EF4444" }]}>Owner</Text>
              </View>
            </View>
            <View style={styles.cardDetails}>
              <View style={styles.detailRow}>
                <Ionicons name="call-outline" size={13} color={Colors.textSecondary} />
                <Text style={styles.detailText}>{adminPhone}</Text>
              </View>
              <View style={styles.detailRow}>
                <Ionicons name="key" size={13} color={Colors.textSecondary} />
                <Text style={styles.detailText}>Full Access (Cannot be removed)</Text>
              </View>
            </View>
            <View style={styles.cardFooter}>
              <Text style={styles.createdDate}>Primary Admin Account</Text>
              <Pressable
                style={styles.changePhoneBtn}
                onPress={() => { try { Haptics.selectionAsync(); } catch {} setNewAdminPhone(adminPhone); setShowPhoneModal(true); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="create-outline" size={16} color={Colors.primary} />
                <Text style={styles.changePhoneBtnText}>Change Number</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Other Admins</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{admins.length}</Text>
            </View>
          </View>

          {admins.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="shield-outline" size={48} color={Colors.textLight} />
              <Text style={styles.emptyTitle}>No other admins yet</Text>
              <Text style={styles.emptySubtitle}>Tap + to add a new admin</Text>
            </View>
          ) : (
            admins.map((admin) => (
              <View key={admin.id} style={styles.adminCard}>
                <View style={styles.cardTop}>
                  <View style={[styles.avatarCircle, { backgroundColor: getAccessColor(admin.territory) }]}>
                    <Text style={styles.avatarText}>{admin.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardName}>{admin.name}</Text>
                    <Text style={styles.cardEmail}>{admin.email}</Text>
                  </View>
                  <Pressable
                    onPress={() => { try { Haptics.selectionAsync(); } catch {} toggleTeamMemberStatus(admin.id); }}
                    style={[
                      styles.statusBadge,
                      { backgroundColor: admin.status === "ACTIVE" ? Colors.success + "18" : Colors.error + "18" },
                    ]}
                  >
                    <View style={[styles.statusDot, { backgroundColor: admin.status === "ACTIVE" ? Colors.success : Colors.error }]} />
                    <Text style={[styles.statusText, { color: admin.status === "ACTIVE" ? Colors.success : Colors.error }]}>
                      {admin.status === "ACTIVE" ? "Active" : "Suspended"}
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.cardDetails}>
                  <View style={styles.detailRow}>
                    <Ionicons name="call-outline" size={13} color={Colors.textSecondary} />
                    <Text style={styles.detailText}>{admin.phone}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons name="location-outline" size={13} color={Colors.textSecondary} />
                    <Text style={styles.detailText}>{admin.city}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons name={getAccessIcon(admin.territory)} size={13} color={getAccessColor(admin.territory)} />
                    <Text style={[styles.detailText, { color: getAccessColor(admin.territory), fontFamily: "Poppins_600SemiBold" }]}>
                      {admin.territory || "Full Access"}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardFooter}>
                  <Text style={styles.createdDate}>Added {new Date(admin.createdAt).toLocaleDateString()}</Text>
                  <Pressable
                    style={styles.removeBtn}
                    onPress={() => handleRemove(admin.id, admin.name)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={16} color={Colors.error} />
                    <Text style={styles.removeBtnText}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: bottomInset + 20 }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Admin</Text>
              <Pressable onPress={() => { resetForm(); setShowModal(false); }}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.warningBanner}>
                <Ionicons name="warning" size={16} color="#F59E0B" />
                <Text style={styles.warningText}>Admins will have access to manage the entire platform. Only add trusted people.</Text>
              </View>

              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Enter admin's name"
                placeholderTextColor={Colors.textLight}
              />

              <Text style={styles.inputLabel}>Phone Number</Text>
              <View style={styles.phoneRow}>
                <View style={styles.phonePrefix}>
                  <Text style={styles.phonePrefixText}>+91</Text>
                </View>
                <TextInput
                  style={[styles.input, { flex: 1, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }]}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="10-digit number"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="phone-pad"
                  maxLength={10}
                />
              </View>

              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="admin@gobharat.in"
                placeholderTextColor={Colors.textLight}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>City</Text>
              <TextInput
                style={styles.input}
                value={city}
                onChangeText={setCity}
                placeholder="e.g. Malegaon"
                placeholderTextColor={Colors.textLight}
              />

              <Text style={styles.inputLabel}>Access Level</Text>
              <View style={styles.accessGrid}>
                {ACCESS_LEVELS.map((level) => (
                  <Pressable
                    key={level.id}
                    style={[
                      styles.accessOption,
                      accessLevel === level.id && { borderColor: level.color, backgroundColor: level.color + "08" },
                    ]}
                    onPress={() => { try { Haptics.selectionAsync(); } catch {} setAccessLevel(level.id); }}
                  >
                    <View style={[styles.accessOptionIcon, { backgroundColor: level.color + "15" }]}>
                      <Ionicons name={level.icon} size={20} color={level.color} />
                    </View>
                    <Text style={[styles.accessOptionLabel, accessLevel === level.id && { color: level.color }]}>{level.label}</Text>
                    <Text style={styles.accessOptionDesc}>{level.desc}</Text>
                    {accessLevel === level.id && (
                      <View style={[styles.checkMark, { backgroundColor: level.color }]}>
                        <Ionicons name="checkmark" size={12} color="#FFF" />
                      </View>
                    )}
                  </Pressable>
                ))}
              </View>

              <Pressable style={styles.submitBtn} onPress={handleSubmit}>
                <LinearGradient colors={["#EF4444", "#DC2626"]} style={styles.submitGradient}>
                  <Ionicons name="shield-checkmark" size={20} color="#FFF" />
                  <Text style={styles.submitText}>Make Admin</Text>
                </LinearGradient>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showPhoneModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: bottomInset + 20 }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Admin Number</Text>
              <Pressable onPress={() => setShowPhoneModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            <View style={styles.warningBanner}>
              <Ionicons name="warning" size={16} color="#F59E0B" />
              <Text style={styles.warningText}>Changing this number will update your Super Admin login. Make sure you remember the new number.</Text>
            </View>

            <Text style={styles.inputLabel}>Current Number</Text>
            <View style={styles.currentPhoneDisplay}>
              <Ionicons name="call" size={16} color={Colors.textSecondary} />
              <Text style={styles.currentPhoneText}>+91 {adminPhone}</Text>
            </View>

            <Text style={styles.inputLabel}>New Phone Number</Text>
            <View style={styles.phoneRow}>
              <View style={styles.phonePrefix}>
                <Text style={styles.phonePrefixText}>+91</Text>
              </View>
              <TextInput
                style={[styles.input, { flex: 1, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }]}
                value={newAdminPhone}
                onChangeText={setNewAdminPhone}
                placeholder="Enter new 10-digit number"
                placeholderTextColor={Colors.textLight}
                keyboardType="phone-pad"
                maxLength={10}
              />
            </View>

            <Pressable style={styles.submitBtn} onPress={handleChangePhone}>
              <LinearGradient colors={["#FF6B00", "#FF8A33"]} style={styles.submitGradient}>
                <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                <Text style={styles.submitText}>Update Number</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 18 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: "#FFF" },
  addBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center" },
  statsRow: { flexDirection: "row", paddingHorizontal: 16, gap: 10, marginTop: 16 },
  statCard: {
    flex: 1, backgroundColor: "#FFF", borderRadius: 16, padding: 14, alignItems: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  statValue: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary },
  statLabel: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  infoCard: {
    flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginTop: 14,
    backgroundColor: "#EFF6FF", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#BFDBFE",
  },
  infoText: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 12, color: "#1E40AF", lineHeight: 18 },
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.text, marginBottom: 12 },
  countBadge: { backgroundColor: "#EF4444", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  countBadgeText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: "#FFF" },
  adminCard: {
    backgroundColor: "#FFF", borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  avatarCircle: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: "Poppins_700Bold", fontSize: 18, color: "#FFF" },
  cardInfo: { flex: 1 },
  cardName: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.text },
  cardEmail: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  accessBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  accessBadgeText: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  cardDetails: { gap: 6, paddingLeft: 4 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary },
  cardFooter: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.borderLight,
  },
  createdDate: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight },
  removeBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: Colors.error + "10", borderRadius: 8 },
  removeBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.error },
  emptyState: { alignItems: "center", paddingVertical: 40 },
  emptyTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.text, marginTop: 12 },
  emptySubtitle: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 12, maxHeight: "85%" },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.borderLight, alignSelf: "center", marginBottom: 16 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  modalTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.text },
  warningBanner: {
    flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FFFBEB",
    borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: "#FDE68A",
  },
  warningText: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 12, color: "#92400E", lineHeight: 18 },
  inputLabel: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textSecondary, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: Colors.background, borderRadius: 12, paddingHorizontal: 16, height: 50,
    fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.text, borderWidth: 1, borderColor: Colors.borderLight,
  },
  phoneRow: { flexDirection: "row", alignItems: "center" },
  phonePrefix: {
    backgroundColor: Colors.secondary + "10", height: 50, paddingHorizontal: 14, alignItems: "center", justifyContent: "center",
    borderTopLeftRadius: 12, borderBottomLeftRadius: 12, borderWidth: 1, borderColor: Colors.borderLight, borderRightWidth: 0,
  },
  phonePrefixText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.secondary },
  accessGrid: { gap: 10, marginTop: 4 },
  accessOption: {
    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#FFF", borderRadius: 14,
    padding: 14, borderWidth: 1.5, borderColor: Colors.borderLight, position: "relative",
  },
  accessOptionIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  accessOptionLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text, flex: 1 },
  accessOptionDesc: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, position: "absolute", right: 14, bottom: 12 },
  checkMark: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", position: "absolute", top: 10, right: 10 },
  submitBtn: { marginTop: 24, borderRadius: 14, overflow: "hidden", marginBottom: 20 },
  submitGradient: { paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  submitText: { fontFamily: "Poppins_700Bold", fontSize: 16, color: "#FFF" },
  changePhoneBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: Colors.primary + "10", borderRadius: 8 },
  changePhoneBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.primary },
  currentPhoneDisplay: {
    flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: Colors.background,
    borderRadius: 12, paddingHorizontal: 16, height: 50, borderWidth: 1, borderColor: Colors.borderLight, marginBottom: 4,
  },
  currentPhoneText: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.textSecondary },
});
