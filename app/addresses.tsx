import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Alert, Modal, TextInput } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";

const LABEL_OPTIONS = ["Home", "Office", "Other"];

export default function AddressesScreen() {
  const insets = useSafeAreaInsets();
  const { addresses, addAddress, removeAddress, setDefaultAddress } = useApp();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLabel, setNewLabel] = useState("Home");
  const [newAddress, setNewAddress] = useState("");
  const [newLandmark, setNewLandmark] = useState("");

  const iconMap: Record<string, string> = { Home: "home", Office: "briefcase", Other: "location" };

  const handleSetDefault = (id: string) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setDefaultAddress(id);
  };

  const handleDelete = (id: string, label: string) => {
    Alert.alert("Remove Address", `Remove "${label}" address?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
          removeAddress(id);
        },
      },
    ]);
  };

  const handleAddAddress = () => {
    if (!newAddress.trim()) {
      Alert.alert("Required", "Please enter the full address.");
      return;
    }
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    const fullAddr = newLandmark.trim()
      ? `${newAddress.trim()}, Near ${newLandmark.trim()}, Malegaon, Maharashtra 423203`
      : `${newAddress.trim()}, Malegaon, Maharashtra 423203`;
    addAddress({
      userId: "u1",
      label: newLabel,
      fullAddress: fullAddr,
      lat: 20.5547 + (Math.random() - 0.5) * 0.01,
      lng: 74.5247 + (Math.random() - 0.5) * 0.01,
      isDefault: addresses.length === 0,
    });
    setNewAddress("");
    setNewLandmark("");
    setNewLabel("Home");
    setShowAddModal(false);
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0B1E3D", "#142F5E"]} style={[styles.header, { paddingTop: topInset + 12 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Saved Addresses</Text>
          <View style={{ width: 40 }} />
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: bottomInset + 80 }} showsVerticalScrollIndicator={false}>
        {addresses.map((addr) => (
          <View key={addr.id} style={[styles.addressCard, addr.isDefault && styles.addressCardActive]}>
            <View style={styles.addressTop}>
              <View style={styles.addressLabelRow}>
                <View style={[styles.addressIconBg, addr.isDefault && { backgroundColor: Colors.primary + "20" }]}>
                  <Ionicons name={(iconMap[addr.label] || "location") as any} size={20} color={addr.isDefault ? Colors.primary : Colors.textSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.addressLabel}>{addr.label}</Text>
                </View>
                {addr.isDefault && (
                  <View style={styles.defaultBadge}>
                    <Text style={styles.defaultBadgeText}>Default</Text>
                  </View>
                )}
                <Pressable onPress={() => handleDelete(addr.id, addr.label)} hitSlop={10} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={18} color={Colors.error} />
                </Pressable>
              </View>
            </View>
            <Text style={styles.addressFull}>{addr.fullAddress}</Text>
            <View style={styles.addressActions}>
              {!addr.isDefault && (
                <Pressable style={styles.setDefaultBtn} onPress={() => handleSetDefault(addr.id)}>
                  <Ionicons name="checkmark-circle-outline" size={16} color={Colors.primary} />
                  <Text style={styles.setDefaultText}>Set as Default</Text>
                </Pressable>
              )}
            </View>
          </View>
        ))}
        {addresses.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="location-outline" size={48} color={Colors.textLight} />
            <Text style={styles.emptyText}>No saved addresses</Text>
            <Text style={styles.emptySubText}>Add your first delivery address</Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: bottomInset + 12 }]}>
        <Pressable style={styles.addBtn} onPress={() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {} setShowAddModal(true); }}>
          <Ionicons name="add-circle" size={22} color="#FFF" />
          <Text style={styles.addBtnText}>Add New Address</Text>
        </Pressable>
      </View>

      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: bottomInset + 20 }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Address</Text>
              <Pressable onPress={() => setShowAddModal(false)} hitSlop={10}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            <Text style={styles.inputLabel}>Label</Text>
            <View style={styles.labelOptions}>
              {LABEL_OPTIONS.map((l) => (
                <Pressable
                  key={l}
                  style={[styles.labelBtn, newLabel === l && styles.labelBtnActive]}
                  onPress={() => setNewLabel(l)}
                >
                  <Ionicons name={(iconMap[l] || "location") as any} size={16} color={newLabel === l ? "#FFF" : Colors.textSecondary} />
                  <Text style={[styles.labelBtnText, newLabel === l && styles.labelBtnTextActive]}>{l}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.inputLabel}>Full Address</Text>
            <TextInput
              style={styles.textInput}
              value={newAddress}
              onChangeText={setNewAddress}
              placeholder="House no., Street, Area"
              placeholderTextColor={Colors.textLight}
              multiline
            />

            <Text style={styles.inputLabel}>Landmark (Optional)</Text>
            <TextInput
              style={styles.textInput}
              value={newLandmark}
              onChangeText={setNewLandmark}
              placeholder="Near mosque, school, etc."
              placeholderTextColor={Colors.textLight}
            />

            <Pressable style={[styles.saveBtn, !newAddress.trim() && { opacity: 0.5 }]} onPress={handleAddAddress}>
              <Text style={styles.saveBtnText}>Save Address</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  addressCard: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
  },
  addressCardActive: { borderColor: Colors.primary },
  addressTop: { marginBottom: 8 },
  addressLabelRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  addressIconBg: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  addressLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.text },
  defaultBadge: {
    backgroundColor: Colors.success + "15",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  defaultBadgeText: { fontFamily: "Poppins_500Medium", fontSize: 11, color: Colors.success },
  deleteBtn: { padding: 6 },
  addressFull: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, marginLeft: 48, lineHeight: 20 },
  addressActions: { flexDirection: "row", justifyContent: "flex-end", marginTop: 8 },
  setDefaultBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: Colors.primary },
  setDefaultText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.primary },
  emptyState: { alignItems: "center", paddingTop: 60 },
  emptyText: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.textLight, marginTop: 12 },
  emptySubText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textLight, marginTop: 4 },
  bottomBar: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: "#FFF", borderTopWidth: 1, borderTopColor: Colors.borderLight },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
  },
  addBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: "#FFF" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 12 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.borderLight, alignSelf: "center", marginBottom: 16 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  modalTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 18, color: Colors.text },
  inputLabel: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textSecondary, marginBottom: 8, marginTop: 12 },
  labelOptions: { flexDirection: "row", gap: 10 },
  labelBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: Colors.borderLight, backgroundColor: Colors.background },
  labelBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  labelBtnText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textSecondary },
  labelBtnTextActive: { color: "#FFF" },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.text,
    backgroundColor: Colors.background,
    minHeight: 44,
  },
  saveBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 20 },
  saveBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: "#FFF" },
});
