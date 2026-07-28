import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Modal, Switch, Alert } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { t, LANGUAGES, Language } from "@/lib/i18n";
import { apiRequest } from "@/lib/query-client";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, walletBalance, logout, orders, language, setLanguage, autoDetectLanguage, setAutoDetectLanguage } = useApp();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const currentLang = LANGUAGES.find((l) => l.id === language);

  const menuSections = [
    {
      title: t("myAccount", language),
      items: [
        { icon: "wallet", label: t("wallet", language), route: "/wallet" },
        { icon: "location", label: t("savedAddresses", language), route: "/addresses" },
        { icon: "pricetag", label: t("myCoupons", language), route: "/coupons" },
        { icon: "heart", label: t("wishlist", language), route: "/wishlist" },
        { icon: "notifications", label: "Notification Settings", route: "/notification-settings" },
      ],
    },
    {
      title: t("general", language),
      items: [
        { icon: "help-circle", label: t("helpSupport", language), route: "/help-support" },
        { icon: "document-text", label: t("termsConditions", language), route: "/terms" },
        { icon: "shield-checkmark", label: t("privacyPolicy", language), route: "/privacy" },
        { icon: "information-circle", label: t("aboutApp", language), route: "/about" },
      ],
    },
  ];

  const handleLogout = () => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
    setShowLogoutModal(true);
  };

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

  const handleLanguageSelect = (lang: Language) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setLanguage(lang);
    setShowLanguageModal(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={["#0B1E3D", "#142F5E"]} style={[styles.profileHeader, { paddingTop: topInset + 16 }]}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={36} color="#FFF" />
          </View>
          <Pressable style={styles.editAvatarBtn}>
            <Ionicons name="camera" size={14} color="#FFF" />
          </Pressable>
        </View>
        <Text style={styles.userName}>{user?.name || "User"}</Text>
        <Text style={styles.userPhone}>{user?.phone || ""}</Text>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{orders.length}</Text>
            <Text style={styles.statLabel}>{t("orders", language)}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{"\u20B9"}{walletBalance}</Text>
            <Text style={styles.statLabel}>{t("wallet", language)}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>3</Text>
            <Text style={styles.statLabel}>{t("myCoupons", language)}</Text>
          </View>
        </View>
      </LinearGradient>


      {menuSections[0] && (
        <View style={styles.menuSection}>
          <Text style={styles.menuSectionTitle}>{menuSections[0].title}</Text>
          <View style={styles.menuCard}>
            {menuSections[0].items.map((item, i) => (
              <Pressable key={item.label} style={[styles.menuItem, i < menuSections[0].items.length - 1 && styles.menuItemBorder]} onPress={() => { if (item.route) { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} router.push(item.route as any); } }}>
                <View style={styles.menuItemLeft}>
                  <View style={styles.menuIconBg}>
                    <Ionicons name={item.icon as any} size={20} color={Colors.primary} />
                  </View>
                  <Text style={styles.menuItemLabel}>{item.label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <View style={styles.menuSection}>
        <Text style={styles.menuSectionTitle}>{t("language", language)}</Text>
        <View style={styles.menuCard}>
          <Pressable style={styles.menuItem} onPress={() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} setShowLanguageModal(true); }}>
            <View style={styles.menuItemLeft}>
              <View style={styles.menuIconBg}>
                <Ionicons name="language" size={20} color={Colors.primary} />
              </View>
              <View>
                <Text style={styles.menuItemLabel}>{t("changeLanguage", language)}</Text>
                <Text style={styles.menuItemSub}>{currentLang?.nativeLabel || "English"}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
          </Pressable>
        </View>
      </View>

      {menuSections[1] && (
        <View style={styles.menuSection}>
          <Text style={styles.menuSectionTitle}>{menuSections[1].title}</Text>
          <View style={styles.menuCard}>
            {menuSections[1].items.map((item, i) => (
              <Pressable key={item.label} style={[styles.menuItem, i < menuSections[1].items.length - 1 && styles.menuItemBorder]} onPress={() => { if (item.route) { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} router.push(item.route as any); } }}>
                <View style={styles.menuItemLeft}>
                  <View style={styles.menuIconBg}>
                    <Ionicons name={item.icon as any} size={20} color={Colors.primary} />
                  </View>
                  <Text style={styles.menuItemLabel}>{item.label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <Pressable style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color={Colors.error} />
        <Text style={styles.logoutText}>{t("logOut", language)}</Text>
      </Pressable>

      <Pressable style={styles.deleteAccountButton} onPress={() => setShowDeleteModal(true)}>
        <Ionicons name="trash-outline" size={18} color="#DC2626" />
        <Text style={styles.deleteAccountText}>Delete Account</Text>
      </Pressable>

      <Text style={styles.version}>Go Bharat v2.0</Text>

      <Modal visible={showLogoutModal} transparent animationType="fade" onRequestClose={() => setShowLogoutModal(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 }}>
          <View style={{ backgroundColor: "#FFF", borderRadius: 20, padding: 28, alignItems: "center", width: "100%", maxWidth: 340 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.error + "15", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <Ionicons name="log-out-outline" size={28} color={Colors.error} />
            </View>
            <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 18, color: Colors.text, marginBottom: 6 }}>Log Out</Text>
            <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textLight, textAlign: "center", marginBottom: 20 }}>Are you sure you want to log out of your account?</Text>
            <View style={{ flexDirection: "row", gap: 12, width: "100%" }}>
              <Pressable style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: Colors.backgroundLight, alignItems: "center" }} onPress={() => setShowLogoutModal(false)}>
                <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.text }}>Cancel</Text>
              </Pressable>
              <Pressable style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: Colors.error, alignItems: "center" }} onPress={() => { logout(); setShowLogoutModal(false); setTimeout(() => { router.replace("/auth" as any); }, 300); }}>
                <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#FFF" }}>Log Out</Text>
              </Pressable>
            </View>
          </View>
        </View>
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

      <Modal visible={showLanguageModal} transparent animationType="slide" onRequestClose={() => setShowLanguageModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowLanguageModal(false)}>
          <Pressable style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{t("selectLanguage", language)}</Text>

            <View style={styles.autoDetectRow}>
              <View style={styles.autoDetectLeft}>
                <Ionicons name="locate" size={20} color={Colors.primary} />
                <Text style={styles.autoDetectLabel}>{t("autoDetect", language)}</Text>
              </View>
              <Switch
                value={autoDetectLanguage}
                onValueChange={setAutoDetectLanguage}
                trackColor={{ false: Colors.border, true: Colors.primary + "60" }}
                thumbColor={autoDetectLanguage ? Colors.primary : Colors.textLight}
              />
            </View>

            <ScrollView style={styles.languageList} showsVerticalScrollIndicator={false}>
              {LANGUAGES.map((lang) => (
                <Pressable key={lang.id} style={[styles.languageItem, language === lang.id && styles.languageItemActive]} onPress={() => handleLanguageSelect(lang.id)}>
                  <View style={styles.languageItemLeft}>
                    <View style={[styles.langFlag, language === lang.id && styles.langFlagActive]}>
                      <Text style={[styles.langFlagText, language === lang.id && styles.langFlagTextActive]}>{lang.flag}</Text>
                    </View>
                    <View>
                      <Text style={[styles.langName, language === lang.id && styles.langNameActive]}>{lang.label}</Text>
                      <Text style={styles.langNative}>{lang.nativeLabel}</Text>
                    </View>
                  </View>
                  {language === lang.id && <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  profileHeader: { alignItems: "center", paddingBottom: 28, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  avatarContainer: { position: "relative", marginBottom: 12 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: Colors.primary,
  },
  editAvatarBtn: {
    position: "absolute",
    bottom: 0,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#0B1E3D",
  },
  userName: { fontFamily: "Poppins_700Bold", fontSize: 20, color: "#FFF" },
  userPhone: { fontFamily: "Poppins_400Regular", fontSize: 14, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  statsRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    marginTop: 20,
    marginHorizontal: 30,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  statItem: { flex: 1, alignItems: "center" },
  statValue: { fontFamily: "Poppins_700Bold", fontSize: 18, color: "#FFF" },
  statLabel: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 },
  statDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.15)" },
  menuSection: { marginTop: 20, paddingHorizontal: 20 },
  menuSectionTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.textSecondary, marginBottom: 8, marginLeft: 4 },
  menuCard: { backgroundColor: "#FFF", borderRadius: 16, overflow: "hidden" },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  menuItemLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  menuIconBg: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.primary + "12",
    alignItems: "center",
    justifyContent: "center",
  },
  menuItemLabel: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.text },
  menuItemSub: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight, marginTop: 1 },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 30,
    marginHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: Colors.error + "10",
    borderRadius: 14,
  },
  logoutText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.error },
  deleteAccountButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    marginTop: 12,
    marginHorizontal: 20,
    paddingVertical: 12,
  },
  deleteAccountText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: "#DC2626" },
  version: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textLight, textAlign: "center", marginTop: 16 },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    maxHeight: "80%" as any,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: Colors.text,
    marginBottom: 16,
  },
  autoDetectRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.background,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  autoDetectLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  autoDetectLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: Colors.text,
  },
  languageList: {
    maxHeight: 400,
  },
  languageItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 4,
  },
  languageItemActive: {
    backgroundColor: Colors.primary + "10",
  },
  languageItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  langFlag: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  langFlagActive: {
    backgroundColor: Colors.primary + "20",
  },
  langFlagText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.textSecondary,
  },
  langFlagTextActive: {
    color: Colors.primary,
  },
  langName: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    color: Colors.text,
  },
  langNameActive: {
    color: Colors.primary,
    fontFamily: "Poppins_600SemiBold",
  },
  langNative: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: Colors.textLight,
  },
});
