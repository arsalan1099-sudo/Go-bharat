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
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { TeamMember } from "@/lib/types";

const citySuggestions = ["Malegaon", "Nashik", "Pune", "Mumbai", "Delhi NCR", "Bangalore"];

export default function FranchiseManagement() {
  const insets = useSafeAreaInsets();
  const { user, teamMembers, addTeamMember, removeTeamMember, toggleTeamMemberStatus, editTeamMember } = useApp();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedCity, setSelectedCity] = useState("All");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [territory, setTerritory] = useState("");
  const [pinCode, setPinCode] = useState("");
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [accountHolderName, setAccountHolderName] = useState("");

  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editTerritory, setEditTerritory] = useState("");
  const [editPinCode, setEditPinCode] = useState("");
  const [editBankName, setEditBankName] = useState("");
  const [editAccountNumber, setEditAccountNumber] = useState("");
  const [editIfscCode, setEditIfscCode] = useState("");
  const [editAccountHolderName, setEditAccountHolderName] = useState("");
  const [showEditCitySuggestions, setShowEditCitySuggestions] = useState(false);

  const franchises = teamMembers.filter((m) => m.role === "FRANCHISE");
  const activeFranchises = franchises.filter((f) => f.status === "ACTIVE");
  const uniqueCities = [...new Set(franchises.map((f) => f.city))];

  const filteredFranchises = selectedCity === "All"
    ? franchises
    : franchises.filter((f) => f.city === selectedCity);

  const groupedByCity: Record<string, TeamMember[]> = {};
  filteredFranchises.forEach((f) => {
    if (!groupedByCity[f.city]) groupedByCity[f.city] = [];
    groupedByCity[f.city].push(f);
  });

  const resetForm = () => {
    setName("");
    setPhone("");
    setEmail("");
    setCity("");
    setTerritory("");
    setPinCode("");
    setShowCitySuggestions(false);
    setBankName("");
    setAccountNumber("");
    setIfscCode("");
    setAccountHolderName("");
  };

  const handleSubmit = async () => {
    if (!name.trim() || !phone.trim() || !email.trim() || !city.trim() || !territory.trim()) {
      Alert.alert("Error", "Please fill all fields");
      return;
    }
    if (phone.replace(/\D/g, "").length !== 10) {
      Alert.alert("Error", "Please enter a valid 10-digit phone number");
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      await addTeamMember({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        role: "FRANCHISE",
        city: city.trim(),
        territory: territory.trim(),
        pinCode: pinCode.trim() || undefined,
        status: "ACTIVE",
        createdBy: user?.name || "Admin",
        createdByRole: "SUPER_ADMIN",
        bankName: bankName.trim() || undefined,
        accountNumber: accountNumber.trim() || undefined,
        ifscCode: ifscCode.trim().toUpperCase() || undefined,
        accountHolderName: accountHolderName.trim() || undefined,
      });
      // Only dismiss the form once the franchise has actually been saved on the server.
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      resetForm();
      setShowModal(false);
    } catch (err: any) {
      // Surface the failure instead of silently swallowing it — previously the modal
      // closed on a failed save and the optimistic row was rolled back, so franchises
      // appeared to "disappear" with no explanation.
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      Alert.alert(
        "Could not save franchise",
        (err?.message ? `${err.message}\n\n` : "") +
          "The franchise was NOT saved. Please try again. If this keeps happening, log out and log back in as Super Admin, then retry.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = (id: string, memberName: string) => {
    if (Platform.OS === "web") {
      const confirmed = window.confirm(`Are you sure you want to remove ${memberName}? This action cannot be undone.`);
      if (confirmed) {
        removeTeamMember(id);
      }
      return;
    }
    Alert.alert(
      "Remove Franchise",
      `Are you sure you want to remove ${memberName}? This action cannot be undone.`,
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

  const handleToggleStatus = (id: string) => {
    try { Haptics.selectionAsync(); } catch {}
    toggleTeamMemberStatus(id);
  };

  const openEdit = (member: TeamMember) => {
    setEditingMember(member);
    setEditName(member.name);
    setEditPhone(member.phone);
    setEditEmail(member.email);
    setEditCity(member.city);
    setEditTerritory(member.territory || "");
    setEditPinCode(member.pinCode || "");
    setEditBankName(member.bankName || "");
    setEditAccountNumber(member.accountNumber || "");
    setEditIfscCode(member.ifscCode || "");
    setEditAccountHolderName(member.accountHolderName || "");
    setShowEditCitySuggestions(false);
  };

  const handleEditSubmit = async () => {
    if (!editingMember) return;
    if (!editName.trim() || !editPhone.trim() || !editCity.trim()) {
      Alert.alert("Error", "Name, phone, and city are required");
      return;
    }
    if (editPhone.replace(/\D/g, "").length !== 10) {
      Alert.alert("Error", "Please enter a valid 10-digit phone number");
      return;
    }
    const success = await editTeamMember(editingMember.id, {
      name: editName.trim(),
      phone: editPhone.trim(),
      email: editEmail.trim(),
      city: editCity.trim(),
      territory: editTerritory.trim(),
      pinCode: editPinCode.trim() || undefined,
      bankName: editBankName.trim() || undefined,
      accountNumber: editAccountNumber.trim() || undefined,
      ifscCode: editIfscCode.trim().toUpperCase() || undefined,
      accountHolderName: editAccountHolderName.trim() || undefined,
    });
    if (success) {
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      Alert.alert("Updated", `${editName.trim()}'s details have been updated.`);
      setEditingMember(null);
    } else {
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      Alert.alert("Failed", "Could not save changes. Please check your connection and try again.");
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0B1E3D", "#142F5E", "#1A3A6B"]} style={[styles.header, { paddingTop: topInset + 12 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#FFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Franchise Management</Text>
          <Pressable
            style={styles.addBtn}
            onPress={() => {
              try { Haptics.selectionAsync(); } catch {}
              setShowModal(true);
            }}
          >
            <Ionicons name="add" size={22} color="#FFF" />
          </Pressable>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ paddingBottom: bottomInset + 20 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: "#6366F1" + "18" }]}>
              <Ionicons name="business" size={18} color="#6366F1" />
            </View>
            <Text style={styles.statValue}>{franchises.length}</Text>
            <Text style={styles.statLabel}>Total Franchises</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: Colors.success + "18" }]}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
            </View>
            <Text style={styles.statValue}>{activeFranchises.length}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: Colors.info + "18" }]}>
              <Ionicons name="location" size={18} color={Colors.info} />
            </View>
            <Text style={styles.statValue}>{uniqueCities.length}</Text>
            <Text style={styles.statLabel}>Cities</Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {["All", ...uniqueCities].map((c) => (
            <Pressable
              key={c}
              style={[styles.filterTab, selectedCity === c && styles.filterTabActive]}
              onPress={() => {
                try { Haptics.selectionAsync(); } catch {}
                setSelectedCity(c);
              }}
            >
              <Text style={[styles.filterTabText, selectedCity === c && styles.filterTabTextActive]}>
                {c}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {Object.keys(groupedByCity).length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="business-outline" size={48} color={Colors.textLight} />
            <Text style={styles.emptyTitle}>No Franchises Found</Text>
            <Text style={styles.emptySubtitle}>Tap + to add a new franchise owner</Text>
          </View>
        )}

        {Object.entries(groupedByCity).map(([cityName, members]) => (
          <View key={cityName} style={styles.citySection}>
            <View style={styles.citySectionHeader}>
              <Ionicons name="location" size={14} color="#6366F1" />
              <Text style={styles.citySectionTitle}>{cityName}</Text>
              <View style={styles.citySectionBadge}>
                <Text style={styles.citySectionBadgeText}>{members.length}</Text>
              </View>
            </View>

            {members.map((member) => {
              // Match this franchise's team the same way the franchise dashboard does:
              // franchiseId (primary) OR legacy createdBy name/phone fallback. Matching by
              // createdBy alone misses members the SUPER_ADMIN assigned via franchiseId.
              const ownerPhoneNorm = (member.phone || "").replace(/\D/g, "").slice(-10);
              const subTeam = teamMembers.filter((m) => {
                if (m.role !== "MARKETING" && m.role !== "DELIVERY") return false;
                const mFranchise = (m.franchiseId || "").replace(/\D/g, "").slice(-10);
                if (mFranchise && mFranchise === ownerPhoneNorm) return true;
                if (m.createdByRole === "FRANCHISE") {
                  if (m.createdBy === member.name) return true;
                  const createdByNorm = (m.createdBy || "").replace(/\D/g, "").slice(-10);
                  if (createdByNorm && createdByNorm === ownerPhoneNorm) return true;
                }
                return false;
              });
              const marketingCount = subTeam.filter((m) => m.role === "MARKETING").length;
              const deliveryCount = subTeam.filter((m) => m.role === "DELIVERY").length;
              const isExpanded = expandedTeams.has(member.id);
              const toggleTeam = () => {
                setExpandedTeams((prev) => {
                  const next = new Set(prev);
                  if (next.has(member.id)) next.delete(member.id);
                  else next.add(member.id);
                  return next;
                });
                try { Haptics.selectionAsync(); } catch {}
              };

              return (
              <View key={member.id} style={styles.franchiseCard}>
                <View style={styles.cardTop}>
                  <View style={styles.avatarCircle}>
                    <Text style={styles.avatarText}>{member.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardName}>{member.name}</Text>
                    {member.territory && (
                      <Text style={styles.cardTerritory}>{member.territory}</Text>
                    )}
                  </View>
                  <Pressable
                    onPress={() => handleToggleStatus(member.id)}
                    style={[
                      styles.statusBadge,
                      { backgroundColor: member.status === "ACTIVE" ? Colors.success + "18" : Colors.error + "18" },
                    ]}
                  >
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: member.status === "ACTIVE" ? Colors.success : Colors.error },
                      ]}
                    />
                    <Text
                      style={[
                        styles.statusText,
                        { color: member.status === "ACTIVE" ? Colors.success : Colors.error },
                      ]}
                    >
                      {member.status === "ACTIVE" ? "Active" : "Inactive"}
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.cardDetails}>
                  <View style={styles.detailRow}>
                    <Ionicons name="call-outline" size={13} color={Colors.textSecondary} />
                    <Text style={styles.detailText}>{member.phone}</Text>
                  </View>
                  {!!member.email && (
                    <View style={styles.detailRow}>
                      <Ionicons name="mail-outline" size={13} color={Colors.textSecondary} />
                      <Text style={styles.detailText}>{member.email}</Text>
                    </View>
                  )}
                  <View style={styles.detailRow}>
                    <Ionicons name="location-outline" size={13} color={Colors.textSecondary} />
                    <Text style={styles.detailText}>{member.city}</Text>
                  </View>
                  {!!member.fullAddress && (
                    <View style={styles.detailRow}>
                      <Ionicons name="home-outline" size={13} color={Colors.textSecondary} />
                      <Text style={[styles.detailText, { flex: 1 }]}>{member.fullAddress}</Text>
                    </View>
                  )}
                  {!!member.dateOfBirth && (
                    <View style={styles.detailRow}>
                      <Ionicons name="calendar-outline" size={13} color={Colors.textSecondary} />
                      <Text style={styles.detailText}>DOB: {member.dateOfBirth}{member.gender ? `  •  ${member.gender}` : ""}</Text>
                    </View>
                  )}
                  {!!member.aadhaarNumber && (
                    <View style={styles.detailRow}>
                      <Ionicons name="card-outline" size={13} color={Colors.textSecondary} />
                      <Text style={styles.detailText}>Aadhaar: ****{member.aadhaarNumber.slice(-4)}</Text>
                    </View>
                  )}
                  {!!member.panNumber && (
                    <View style={styles.detailRow}>
                      <Ionicons name="document-text-outline" size={13} color={Colors.textSecondary} />
                      <Text style={styles.detailText}>PAN: {member.panNumber}</Text>
                    </View>
                  )}
                  {!!member.emergencyContactName && (
                    <View style={styles.detailRow}>
                      <Ionicons name="people-outline" size={13} color={Colors.textSecondary} />
                      <Text style={styles.detailText}>Emergency: {member.emergencyContactName} ({member.emergencyContactPhone})</Text>
                    </View>
                  )}
                </View>

                {member.bankName && (
                  <View style={styles.bankDetailsCard}>
                    <View style={styles.bankDetailsHeader}>
                      <Ionicons name="card" size={13} color="#6366F1" />
                      <Text style={styles.bankDetailsTitle}>Bank Details</Text>
                    </View>
                    {member.accountHolderName && (
                      <Text style={styles.bankDetailText}>{member.accountHolderName}</Text>
                    )}
                    <Text style={styles.bankDetailText}>{member.bankName} | A/C: ****{member.accountNumber?.slice(-4)}</Text>
                    {member.ifscCode && (
                      <Text style={styles.bankDetailText}>IFSC: {member.ifscCode}</Text>
                    )}
                  </View>
                )}

                <Pressable style={styles.teamToggleBtn} onPress={toggleTeam}>
                  <View style={styles.teamSummaryRow}>
                    <Ionicons name="people" size={14} color="#10B981" />
                    <Text style={styles.teamSummaryText}>
                      {subTeam.length === 0
                        ? "No team members yet"
                        : `${marketingCount > 0 ? `${marketingCount} Marketing` : ""}${marketingCount > 0 && deliveryCount > 0 ? " • " : ""}${deliveryCount > 0 ? `${deliveryCount} Delivery` : ""}`
                      }
                    </Text>
                  </View>
                  <Ionicons
                    name={isExpanded ? "chevron-up" : "chevron-down"}
                    size={14}
                    color={Colors.textSecondary}
                  />
                </Pressable>

                {isExpanded && subTeam.length > 0 && (
                  <View style={styles.teamList}>
                    {subTeam.map((tm) => (
                      <View key={tm.id} style={styles.teamMemberRow}>
                        <View style={[styles.teamMemberAvatar, { backgroundColor: tm.role === "MARKETING" ? "#EC4899" + "20" : "#10B981" + "20" }]}>
                          <Text style={[styles.teamMemberAvatarText, { color: tm.role === "MARKETING" ? "#EC4899" : "#10B981" }]}>
                            {tm.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.teamMemberInfo}>
                          <Text style={styles.teamMemberName}>{tm.name}</Text>
                          <Text style={styles.teamMemberMeta}>{tm.phone} • {tm.role === "MARKETING" ? "Marketing" : "Delivery"}</Text>
                        </View>
                        <View style={[styles.teamMemberStatus, { backgroundColor: tm.status === "ACTIVE" ? Colors.success + "18" : Colors.error + "18" }]}>
                          <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 10, color: tm.status === "ACTIVE" ? Colors.success : Colors.error }}>
                            {tm.status === "ACTIVE" ? "Active" : "Inactive"}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {isExpanded && subTeam.length === 0 && (
                  <View style={styles.emptyTeamState}>
                    <Text style={styles.emptyTeamText}>No team members added yet</Text>
                  </View>
                )}

                <View style={styles.cardFooter}>
                  <Text style={styles.createdDate}>
                    Added {new Date(member.createdAt).toLocaleDateString()}
                  </Text>
                  <View style={styles.cardActions}>
                    <Pressable
                      style={styles.editBtn}
                      onPress={() => openEdit(member)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="create-outline" size={16} color="#6366F1" />
                      <Text style={styles.editBtnText}>Edit</Text>
                    </Pressable>
                    <Pressable
                      style={styles.removeBtn}
                      onPress={() => handleRemove(member.id, member.name)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={16} color={Colors.error} />
                      <Text style={styles.removeBtnText}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
              );
            })}
          </View>
        ))}
      </ScrollView>

      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: bottomInset + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Franchise Owner</Text>
              <Pressable onPress={() => { resetForm(); setShowModal(false); }}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.inputLabel}>Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Enter franchise owner name"
                placeholderTextColor={Colors.textLight}
              />

              <Text style={styles.inputLabel}>Phone</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="10-digit phone number"
                placeholderTextColor={Colors.textLight}
                keyboardType="phone-pad"
                maxLength={10}
              />

              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="email@example.com"
                placeholderTextColor={Colors.textLight}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>City</Text>
              <TextInput
                style={styles.input}
                value={city}
                onChangeText={(t) => {
                  setCity(t);
                  setShowCitySuggestions(t.length > 0);
                }}
                onFocus={() => setShowCitySuggestions(true)}
                placeholder="Select or enter city"
                placeholderTextColor={Colors.textLight}
              />
              {showCitySuggestions && (
                <View style={styles.suggestionsContainer}>
                  {citySuggestions
                    .filter((s) => s && s.toLowerCase().includes((city || "").toLowerCase()))
                    .map((s) => (
                      <Pressable
                        key={s}
                        style={styles.suggestionItem}
                        onPress={() => {
                          setCity(s);
                          setShowCitySuggestions(false);
                        }}
                      >
                        <Ionicons name="location" size={14} color="#6366F1" />
                        <Text style={styles.suggestionText}>{s}</Text>
                      </Pressable>
                    ))}
                </View>
              )}

              <Text style={styles.inputLabel}>Territory</Text>
              <TextInput
                style={styles.input}
                value={territory}
                onChangeText={setTerritory}
                placeholder='e.g. "Malegaon Territory"'
                placeholderTextColor={Colors.textLight}
              />

              <Text style={styles.inputLabel}>Pin Code</Text>
              <TextInput
                style={styles.input}
                value={pinCode}
                onChangeText={setPinCode}
                placeholder="e.g. 423203"
                placeholderTextColor={Colors.textLight}
                keyboardType="number-pad"
                maxLength={6}
              />

              <View style={styles.bankSection}>
                <View style={styles.bankSectionHeader}>
                  <Ionicons name="card" size={18} color="#6366F1" />
                  <Text style={styles.bankSectionTitle}>Bank Details</Text>
                </View>

                <Text style={styles.inputLabel}>Account Holder Name</Text>
                <TextInput
                  style={styles.input}
                  value={accountHolderName}
                  onChangeText={setAccountHolderName}
                  placeholder="Full name as per bank account"
                  placeholderTextColor={Colors.textLight}
                />

                <Text style={styles.inputLabel}>Bank Name</Text>
                <TextInput
                  style={styles.input}
                  value={bankName}
                  onChangeText={setBankName}
                  placeholder="e.g. State Bank of India"
                  placeholderTextColor={Colors.textLight}
                />

                <Text style={styles.inputLabel}>Account Number</Text>
                <TextInput
                  style={styles.input}
                  value={accountNumber}
                  onChangeText={setAccountNumber}
                  placeholder="Enter account number"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="number-pad"
                />

                <Text style={styles.inputLabel}>IFSC Code</Text>
                <TextInput
                  style={styles.input}
                  value={ifscCode}
                  onChangeText={setIfscCode}
                  placeholder="e.g. SBIN0001234"
                  placeholderTextColor={Colors.textLight}
                  autoCapitalize="characters"
                  maxLength={11}
                />
              </View>

              <Pressable style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={handleSubmit} disabled={submitting}>
                <LinearGradient
                  colors={["#6366F1", "#4F46E5"]}
                  style={styles.submitGradient}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Ionicons name="add-circle" size={20} color="#FFF" />
                  )}
                  <Text style={styles.submitText}>{submitting ? "Saving..." : "Add Franchise Owner"}</Text>
                </LinearGradient>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={!!editingMember} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: bottomInset + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Franchise Owner</Text>
              <Pressable onPress={() => setEditingMember(null)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={{ alignItems: "center", marginBottom: 16 }}>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#6366F1" + "18", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                  <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 22, color: "#6366F1" }}>{editName.charAt(0).toUpperCase() || "?"}</Text>
                </View>
              </View>

              <Text style={styles.inputLabel}>Name</Text>
              <TextInput
                style={styles.input}
                value={editName}
                onChangeText={setEditName}
                placeholder="Franchise owner name"
                placeholderTextColor={Colors.textLight}
              />

              <Text style={styles.inputLabel}>Phone</Text>
              <TextInput
                style={styles.input}
                value={editPhone}
                onChangeText={(t) => setEditPhone(t.replace(/\D/g, "").slice(0, 10))}
                placeholder="10-digit phone number"
                placeholderTextColor={Colors.textLight}
                keyboardType="phone-pad"
                maxLength={10}
              />

              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.input}
                value={editEmail}
                onChangeText={setEditEmail}
                placeholder="email@example.com"
                placeholderTextColor={Colors.textLight}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>City</Text>
              <TextInput
                style={styles.input}
                value={editCity}
                onChangeText={(t) => {
                  setEditCity(t);
                  setShowEditCitySuggestions(t.length > 0);
                }}
                onFocus={() => setShowEditCitySuggestions(true)}
                placeholder="Select or enter city"
                placeholderTextColor={Colors.textLight}
              />
              {showEditCitySuggestions && (
                <View style={styles.suggestionsContainer}>
                  {citySuggestions
                    .filter((s) => s && s.toLowerCase().includes((editCity || "").toLowerCase()))
                    .map((s) => (
                      <Pressable
                        key={s}
                        style={styles.suggestionItem}
                        onPress={() => {
                          setEditCity(s);
                          setShowEditCitySuggestions(false);
                        }}
                      >
                        <Ionicons name="location" size={14} color="#6366F1" />
                        <Text style={styles.suggestionText}>{s}</Text>
                      </Pressable>
                    ))}
                </View>
              )}

              <Text style={styles.inputLabel}>Territory</Text>
              <TextInput
                style={styles.input}
                value={editTerritory}
                onChangeText={setEditTerritory}
                placeholder='e.g. "Malegaon Territory"'
                placeholderTextColor={Colors.textLight}
              />

              <Text style={styles.inputLabel}>Pin Code</Text>
              <TextInput
                style={styles.input}
                value={editPinCode}
                onChangeText={setEditPinCode}
                placeholder="e.g. 423203"
                placeholderTextColor={Colors.textLight}
                keyboardType="number-pad"
                maxLength={6}
              />

              <View style={styles.bankSection}>
                <View style={styles.bankSectionHeader}>
                  <Ionicons name="card" size={18} color="#6366F1" />
                  <Text style={styles.bankSectionTitle}>Bank Details</Text>
                </View>

                <Text style={styles.inputLabel}>Account Holder Name</Text>
                <TextInput
                  style={styles.input}
                  value={editAccountHolderName}
                  onChangeText={setEditAccountHolderName}
                  placeholder="Full name as per bank account"
                  placeholderTextColor={Colors.textLight}
                />

                <Text style={styles.inputLabel}>Bank Name</Text>
                <TextInput
                  style={styles.input}
                  value={editBankName}
                  onChangeText={setEditBankName}
                  placeholder="e.g. State Bank of India"
                  placeholderTextColor={Colors.textLight}
                />

                <Text style={styles.inputLabel}>Account Number</Text>
                <TextInput
                  style={styles.input}
                  value={editAccountNumber}
                  onChangeText={setEditAccountNumber}
                  placeholder="Enter account number"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="number-pad"
                />

                <Text style={styles.inputLabel}>IFSC Code</Text>
                <TextInput
                  style={styles.input}
                  value={editIfscCode}
                  onChangeText={setEditIfscCode}
                  placeholder="e.g. SBIN0001234"
                  placeholderTextColor={Colors.textLight}
                  autoCapitalize="characters"
                  maxLength={11}
                />
              </View>

              <Pressable style={[styles.submitBtn, !editName.trim() && { opacity: 0.5 }]} onPress={handleEditSubmit} disabled={!editName.trim()}>
                <LinearGradient
                  colors={["#6366F1", "#4F46E5"]}
                  style={styles.submitGradient}
                >
                  <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                  <Text style={styles.submitText}>Save Changes</Text>
                </LinearGradient>
              </Pressable>
            </ScrollView>
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
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: "#FFF" },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#6366F1",
    alignItems: "center",
    justifyContent: "center",
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 10,
    marginTop: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  statValue: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary },
  statLabel: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  filterRow: { paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterTabActive: {
    backgroundColor: "#6366F1",
    borderColor: "#6366F1",
  },
  filterTabText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textSecondary },
  filterTabTextActive: { color: "#FFF" },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 8,
  },
  emptyTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.text },
  emptySubtitle: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary },
  citySection: { paddingHorizontal: 16, marginBottom: 16 },
  citySectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  citySectionTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.secondary, flex: 1 },
  citySectionBadge: {
    backgroundColor: "#6366F1" + "18",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  citySectionBadgeText: { fontFamily: "Poppins_600SemiBold", fontSize: 11, color: "#6366F1" },
  franchiseCard: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardTop: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#6366F1",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: "Poppins_700Bold", fontSize: 18, color: "#FFF" },
  cardInfo: { flex: 1, marginLeft: 12 },
  cardName: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.text },
  cardTerritory: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: "Poppins_500Medium", fontSize: 11 },
  cardDetails: { gap: 6, marginBottom: 12 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  detailText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    paddingTop: 10,
  },
  createdDate: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight },
  cardActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: "#6366F1" + "10", borderRadius: 8 },
  editBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#6366F1" },
  removeBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: Colors.error + "10", borderRadius: 8 },
  removeBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.error },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.secondary },
  inputLabel: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.text, marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.text,
    backgroundColor: Colors.background,
  },
  suggestionsContainer: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    marginTop: 4,
    overflow: "hidden",
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  suggestionText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.text },
  submitBtn: { marginTop: 24, marginBottom: 10 },
  submitGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  submitText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#FFF" },
  bankSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  bankSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  bankSectionTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#6366F1" },
  bankDetailsCard: {
    backgroundColor: "#6366F1" + "08",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#6366F1" + "18",
  },
  bankDetailsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  bankDetailsTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: "#6366F1" },
  bankDetailText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  teamToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#10B981" + "10",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#10B981" + "20",
  },
  teamSummaryRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  teamSummaryText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: "#10B981" },
  teamList: {
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 8,
    marginBottom: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  teamMemberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFF",
    borderRadius: 8,
    padding: 8,
  },
  teamMemberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  teamMemberAvatarText: { fontFamily: "Poppins_700Bold", fontSize: 13 },
  teamMemberInfo: { flex: 1 },
  teamMemberName: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text },
  teamMemberMeta: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  teamMemberStatus: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  emptyTeamState: {
    alignItems: "center",
    paddingVertical: 10,
    marginBottom: 10,
  },
  emptyTeamText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textLight },
});
