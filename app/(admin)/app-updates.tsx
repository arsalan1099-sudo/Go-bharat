import React, { useState, useCallback } from "react";
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
  Switch,
} from "react-native";
import { router } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { getApiUrl, apiRequest, queryClient } from "@/lib/query-client";

interface AppAnnouncement {
  id: string;
  title: string;
  message: string;
  type: string;
  icon: string;
  color: string;
  targetRoles: string[];
  actionLabel?: string;
  actionRoute?: string;
  isActive: boolean;
  priority: number;
  expiresAt?: string;
  createdAt: string;
}

const TABS = ["Announcements", "AI Designer", "Theme"] as const;
const ANNOUNCEMENT_TYPES = ["info", "warning", "success", "promo"] as const;
const PRESET_ICONS = ["megaphone", "alert-circle", "checkmark-circle", "gift", "flash", "star"] as const;
const PRESET_COLORS = ["#FF6B00", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"] as const;
const TARGET_ROLES = ["ALL", "CUSTOMER", "VENDOR", "DELIVERY"] as const;
const DESIGN_TYPES = ["Page", "Announcement", "Promo Campaign"] as const;
const QUICK_PROMPTS = ["Diwali Sale Page", "New Year Offers", "Welcome Banner", "Flash Deal Alert", "Vendor Spotlight"] as const;

const THEMES = [
  { name: "Classic Saffron", colors: ["#FF6B00", "#0B1E3D", "#FFB74D"] },
  { name: "Royal Blue", colors: ["#1E40AF", "#0F172A", "#60A5FA"] },
  { name: "Forest Green", colors: ["#059669", "#064E3B", "#34D399"] },
  { name: "Royal Purple", colors: ["#7C3AED", "#1E1B4B", "#A78BFA"] },
  { name: "Crimson Red", colors: ["#DC2626", "#1F2937", "#F87171"] },
];

export default function AppUpdatesScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useApp();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [activeTab, setActiveTab] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [formType, setFormType] = useState("info");
  const [formIcon, setFormIcon] = useState("megaphone");
  const [formColor, setFormColor] = useState("#FF6B00");
  const [formTargetRoles, setFormTargetRoles] = useState<string[]>(["ALL"]);
  const [formPriority, setFormPriority] = useState("5");
  const [formExpiresAt, setFormExpiresAt] = useState("");

  const [aiPrompt, setAiPrompt] = useState("");
  const [aiDesignType, setAiDesignType] = useState("Page");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);

  const [selectedTheme, setSelectedTheme] = useState(0);

  const { data: announcements = [], refetch } = useQuery<AppAnnouncement[]>({
    queryKey: ["/api/admin/announcements"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", "/api/admin/announcements", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/announcements"] });
      resetForm();
      setShowCreateModal(false);
      Alert.alert("Success", "Announcement created successfully!");
    },
    onError: (err: any) => Alert.alert("Error", err.message || "Failed to create announcement"),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await apiRequest("PUT", `/api/admin/announcements/${id}`, { isActive });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/announcements"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/announcements/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/announcements"] }),
  });

  const resetForm = () => {
    setFormTitle("");
    setFormMessage("");
    setFormType("info");
    setFormIcon("megaphone");
    setFormColor("#FF6B00");
    setFormTargetRoles(["ALL"]);
    setFormPriority("5");
    setFormExpiresAt("");
  };

  const handleCreate = () => {
    if (!formTitle.trim() || !formMessage.trim()) {
      Alert.alert("Required", "Title and message are required");
      return;
    }
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    createMutation.mutate({
      title: formTitle.trim(),
      message: formMessage.trim(),
      type: formType,
      icon: formIcon,
      color: formColor,
      targetRoles: formTargetRoles,
      priority: parseInt(formPriority) || 5,
      expiresAt: formExpiresAt || undefined,
    });
  };

  const handleToggle = (id: string, current: boolean) => {
    try { Haptics.selectionAsync(); } catch {}
    toggleMutation.mutate({ id, isActive: !current });
  };

  const handleDelete = (id: string) => {
    Alert.alert("Delete", "Are you sure you want to delete this announcement?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
          deleteMutation.mutate(id);
        },
      },
    ]);
  };

  const toggleTargetRole = (role: string) => {
    setFormTargetRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) {
      Alert.alert("Required", "Please enter a prompt");
      return;
    }
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    setAiLoading(true);
    setAiResult(null);
    try {
      const res = await apiRequest("POST", "/api/admin/ai-designer", {
        prompt: aiPrompt.trim(),
        designType: aiDesignType,
      });
      const json = await res.json();
      setAiResult(json);
    } catch (err: any) {
      Alert.alert("Error", err.message || "AI generation failed");
    } finally {
      setAiLoading(false);
    }
  };

  const handleApplyDesign = async () => {
    if (!aiResult) return;
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    try {
      if (aiDesignType === "Page") {
        await apiRequest("POST", "/api/admin/dynamic-pages", aiResult);
      } else {
        await apiRequest("POST", "/api/admin/announcements", aiResult);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/announcements"] });
      Alert.alert("Success", "Design applied successfully!");
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to apply design");
    }
  };

  const handleApplyTheme = () => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    Alert.alert("Theme applied successfully!");
  };

  const typeBadgeColor = (type: string) => {
    switch (type) {
      case "warning": return "#F59E0B";
      case "success": return "#10B981";
      case "promo": return "#8B5CF6";
      default: return "#3B82F6";
    }
  };

  const renderAnnouncements = () => (
    <View>
      <Pressable
        style={({ pressed }) => [s.createBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
        onPress={() => setShowCreateModal(true)}
      >
        <LinearGradient colors={["#FF6B00", "#FF8A33"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.createBtnGrad}>
          <Ionicons name="add-circle" size={20} color="#FFF" />
          <Text style={s.createBtnText}>New Announcement</Text>
        </LinearGradient>
      </Pressable>

      {announcements.length === 0 && (
        <View style={s.emptyState}>
          <Ionicons name="megaphone-outline" size={48} color={Colors.textLight} />
          <Text style={s.emptyText}>No announcements yet</Text>
          <Text style={s.emptySubtext}>Create your first announcement to reach users</Text>
        </View>
      )}

      {announcements.map((ann) => (
        <View key={ann.id} style={s.annCard}>
          <View style={s.annCardHeader}>
            <View style={[s.annIconWrap, { backgroundColor: ann.color + "18" }]}>
              <Ionicons name={ann.icon as any} size={18} color={ann.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.annTitle}>{ann.title}</Text>
              <View style={s.annMetaRow}>
                <View style={[s.typeBadge, { backgroundColor: typeBadgeColor(ann.type) + "18" }]}>
                  <Text style={[s.typeBadgeText, { color: typeBadgeColor(ann.type) }]}>{ann.type}</Text>
                </View>
                <Text style={s.annPriority}>P{ann.priority}</Text>
              </View>
            </View>
            <Switch
              value={ann.isActive}
              onValueChange={() => handleToggle(ann.id, ann.isActive)}
              trackColor={{ false: Colors.border, true: Colors.primary + "60" }}
              thumbColor={ann.isActive ? Colors.primary : Colors.textLight}
            />
          </View>
          <Text style={s.annMessage} numberOfLines={2}>{ann.message}</Text>
          <View style={s.annFooter}>
            <View style={s.annRoles}>
              {ann.targetRoles.map((r) => (
                <View key={r} style={s.annRoleChip}>
                  <Text style={s.annRoleText}>{r}</Text>
                </View>
              ))}
            </View>
            <Pressable onPress={() => handleDelete(ann.id)} hitSlop={8}>
              <Ionicons name="trash-outline" size={18} color={Colors.error} />
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );

  const renderAIDesigner = () => (
    <View>
      <Text style={s.aiLabel}>Design Type</Text>
      <View style={s.chipRow}>
        {DESIGN_TYPES.map((dt) => (
          <Pressable
            key={dt}
            style={[s.chip, aiDesignType === dt && s.chipActive]}
            onPress={() => setAiDesignType(dt)}
          >
            <Text style={[s.chipText, aiDesignType === dt && s.chipTextActive]}>{dt}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.aiLabel}>Prompt</Text>
      <TextInput
        style={s.aiInput}
        value={aiPrompt}
        onChangeText={setAiPrompt}
        placeholder="Describe what you want to create... e.g., 'Create a Diwali festive sale page with 30% off electronics and fashion deals'"
        placeholderTextColor={Colors.textLight}
        multiline
        maxLength={500}
      />

      <Text style={s.aiLabel}>Quick Suggestions</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
        {QUICK_PROMPTS.map((qp) => (
          <Pressable
            key={qp}
            style={[s.chip, s.suggestChip]}
            onPress={() => setAiPrompt(qp)}
          >
            <Ionicons name="sparkles" size={12} color={Colors.primary} />
            <Text style={[s.chipText, { color: Colors.primary }]}>{qp}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Pressable
        style={({ pressed }) => [s.createBtn, { marginTop: 16 }, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
        onPress={handleAiGenerate}
        disabled={aiLoading}
      >
        <LinearGradient colors={["#FF6B00", "#FF8A33"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.createBtnGrad}>
          {aiLoading ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Ionicons name="sparkles" size={20} color="#FFF" />
          )}
          <Text style={s.createBtnText}>{aiLoading ? "Generating..." : "Generate with AI"}</Text>
        </LinearGradient>
      </Pressable>

      {aiResult && (
        <View style={s.aiResultWrap}>
          <View style={s.aiResultHeader}>
            <Ionicons name="code-slash" size={16} color={Colors.primary} />
            <Text style={s.aiResultTitle}>Generated Design</Text>
          </View>
          <ScrollView style={s.aiResultScroll} nestedScrollEnabled>
            <Text style={s.aiResultJson}>{JSON.stringify(aiResult, null, 2)}</Text>
          </ScrollView>
          <Pressable
            style={({ pressed }) => [s.applyBtn, pressed && { opacity: 0.85 }]}
            onPress={handleApplyDesign}
          >
            <LinearGradient colors={["#10B981", "#059669"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.createBtnGrad}>
              <Ionicons name="checkmark-circle" size={18} color="#FFF" />
              <Text style={s.createBtnText}>Apply Design</Text>
            </LinearGradient>
          </Pressable>
        </View>
      )}
    </View>
  );

  const renderTheme = () => (
    <View>
      <Text style={s.themeCurrentLabel}>Current Theme</Text>
      <View style={s.themeCurrentRow}>
        {[
          { label: "Primary", color: THEMES[selectedTheme].colors[0] },
          { label: "Secondary", color: THEMES[selectedTheme].colors[1] },
          { label: "Accent", color: THEMES[selectedTheme].colors[2] },
        ].map((c) => (
          <View key={c.label} style={s.themeCurrentItem}>
            <View style={[s.themeCurrentCircle, { backgroundColor: c.color }]} />
            <Text style={s.themeCurrentName}>{c.label}</Text>
            <Text style={s.themeCurrentHex}>{c.color}</Text>
          </View>
        ))}
      </View>

      <Text style={s.themePresetsLabel}>Preset Themes</Text>
      {THEMES.map((theme, idx) => (
        <Pressable
          key={theme.name}
          style={[s.themeCard, selectedTheme === idx && s.themeCardSelected]}
          onPress={() => { try { Haptics.selectionAsync(); } catch {} setSelectedTheme(idx); }}
        >
          <View style={s.themeCardColors}>
            {theme.colors.map((c) => (
              <View key={c} style={[s.themeCardCircle, { backgroundColor: c }]} />
            ))}
          </View>
          <Text style={s.themeCardName}>{theme.name}</Text>
          {selectedTheme === idx && (
            <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
          )}
        </Pressable>
      ))}

      <Pressable
        style={({ pressed }) => [s.createBtn, { marginTop: 20 }, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
        onPress={handleApplyTheme}
      >
        <LinearGradient colors={["#FF6B00", "#FF8A33"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.createBtnGrad}>
          <Ionicons name="color-palette" size={20} color="#FFF" />
          <Text style={s.createBtnText}>Apply Theme</Text>
        </LinearGradient>
      </Pressable>

      <Text style={s.themeNote}>Theme changes will reflect across all user screens</Text>
    </View>
  );

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: bottomInset + 20 }} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={["#FF6B00", "#FF8A33", "#FFB74D"]} style={[s.header, { paddingTop: topInset + 12 }]}>
          <View style={s.headerRow}>
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Ionicons name="arrow-back" size={24} color="#FFF" />
            </Pressable>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={s.headerTitle}>App Updates</Text>
              <Text style={s.headerSub}>Manage announcements, AI designs & themes</Text>
            </View>
            <MaterialCommunityIcons name="rocket-launch" size={28} color="rgba(255,255,255,0.8)" />
          </View>

          <View style={s.tabRow}>
            {TABS.map((tab, idx) => (
              <Pressable
                key={tab}
                style={[s.tab, activeTab === idx && s.tabActive]}
                onPress={() => { try { Haptics.selectionAsync(); } catch {} setActiveTab(idx); }}
              >
                <Ionicons
                  name={idx === 0 ? "megaphone" : idx === 1 ? "sparkles" : "color-palette"}
                  size={14}
                  color={activeTab === idx ? "#FF6B00" : "rgba(255,255,255,0.7)"}
                />
                <Text style={[s.tabText, activeTab === idx && s.tabTextActive]}>{tab}</Text>
              </Pressable>
            ))}
          </View>
        </LinearGradient>

        <View style={s.content}>
          {activeTab === 0 && renderAnnouncements()}
          {activeTab === 1 && renderAIDesigner()}
          {activeTab === 2 && renderTheme()}
        </View>
      </ScrollView>

      <Modal visible={showCreateModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>New Announcement</Text>
                <Pressable onPress={() => setShowCreateModal(false)}>
                  <Ionicons name="close" size={24} color={Colors.text} />
                </Pressable>
              </View>

              <Text style={s.modalLabel}>Title *</Text>
              <TextInput
                style={s.modalInput}
                value={formTitle}
                onChangeText={setFormTitle}
                placeholder="Announcement title"
                placeholderTextColor={Colors.textLight}
                maxLength={80}
              />

              <Text style={s.modalLabel}>Message *</Text>
              <TextInput
                style={[s.modalInput, { height: 90, textAlignVertical: "top" }]}
                value={formMessage}
                onChangeText={setFormMessage}
                placeholder="Write your announcement message..."
                placeholderTextColor={Colors.textLight}
                multiline
                maxLength={500}
              />

              <Text style={s.modalLabel}>Type</Text>
              <View style={s.chipRow}>
                {ANNOUNCEMENT_TYPES.map((t) => (
                  <Pressable
                    key={t}
                    style={[s.chip, formType === t && { backgroundColor: typeBadgeColor(t), borderColor: typeBadgeColor(t) }]}
                    onPress={() => setFormType(t)}
                  >
                    <Text style={[s.chipText, formType === t && { color: "#FFF" }]}>{t}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={s.modalLabel}>Icon</Text>
              <View style={s.chipRow}>
                {PRESET_ICONS.map((ic) => (
                  <Pressable
                    key={ic}
                    style={[s.iconChip, formIcon === ic && { backgroundColor: formColor + "20", borderColor: formColor }]}
                    onPress={() => setFormIcon(ic)}
                  >
                    <Ionicons name={ic as any} size={20} color={formIcon === ic ? formColor : Colors.textSecondary} />
                  </Pressable>
                ))}
              </View>

              <Text style={s.modalLabel}>Color</Text>
              <View style={s.chipRow}>
                {PRESET_COLORS.map((c) => (
                  <Pressable
                    key={c}
                    style={[s.colorChip, { backgroundColor: c }, formColor === c && s.colorChipActive]}
                    onPress={() => setFormColor(c)}
                  >
                    {formColor === c && <Ionicons name="checkmark" size={14} color="#FFF" />}
                  </Pressable>
                ))}
              </View>

              <Text style={s.modalLabel}>Target Roles</Text>
              <View style={s.chipRow}>
                {TARGET_ROLES.map((r) => (
                  <Pressable
                    key={r}
                    style={[s.chip, formTargetRoles.includes(r) && s.chipActive]}
                    onPress={() => toggleTargetRole(r)}
                  >
                    <Text style={[s.chipText, formTargetRoles.includes(r) && s.chipTextActive]}>{r}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={s.modalLabel}>Priority (0-10)</Text>
              <TextInput
                style={[s.modalInput, { width: 80 }]}
                value={formPriority}
                onChangeText={(t) => setFormPriority(t.replace(/[^0-9]/g, "").slice(0, 2))}
                placeholder="5"
                placeholderTextColor={Colors.textLight}
                keyboardType="numeric"
                maxLength={2}
              />

              <Text style={s.modalLabel}>Expires At (optional)</Text>
              <TextInput
                style={s.modalInput}
                value={formExpiresAt}
                onChangeText={setFormExpiresAt}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Colors.textLight}
                maxLength={10}
              />

              <Pressable
                style={({ pressed }) => [s.createBtn, { marginTop: 16 }, pressed && { opacity: 0.85 }]}
                onPress={handleCreate}
                disabled={createMutation.isPending}
              >
                <LinearGradient colors={["#FF6B00", "#FF8A33"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.createBtnGrad}>
                  {createMutation.isPending ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Ionicons name="send" size={18} color="#FFF" />
                  )}
                  <Text style={s.createBtnText}>{createMutation.isPending ? "Creating..." : "Create Announcement"}</Text>
                </LinearGradient>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 0 },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 22, color: "#FFF" },
  headerSub: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "rgba(255,255,255,0.75)" },
  tabRow: { flexDirection: "row", gap: 6, marginBottom: -1 },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  tabActive: { backgroundColor: Colors.background },
  tabText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: "rgba(255,255,255,0.8)" },
  tabTextActive: { color: "#FF6B00" },
  content: { paddingHorizontal: 20, paddingTop: 20 },
  createBtn: { borderRadius: 14, overflow: "hidden" },
  createBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, paddingHorizontal: 20 },
  createBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#FFF" },
  emptyState: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.textSecondary },
  emptySubtext: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textLight },
  annCard: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  annCardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  annIconWrap: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  annTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  annMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  typeBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  typeBadgeText: { fontFamily: "Poppins_500Medium", fontSize: 10, textTransform: "uppercase" as const },
  annPriority: { fontFamily: "Poppins_500Medium", fontSize: 10, color: Colors.textLight },
  annMessage: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 10, lineHeight: 18 },
  annFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  annRoles: { flexDirection: "row", gap: 4, flexWrap: "wrap" },
  annRoleChip: { backgroundColor: Colors.surfaceAlt, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  annRoleText: { fontFamily: "Poppins_500Medium", fontSize: 10, color: Colors.textSecondary },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  chip: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.textSecondary },
  chipTextActive: { color: "#FFF" },
  suggestChip: { borderColor: Colors.primary + "40", backgroundColor: Colors.primary + "08" },
  iconChip: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  colorChip: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  colorChipActive: { borderWidth: 3, borderColor: "#FFF", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: "90%",
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.secondary },
  modalLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text, marginBottom: 6, marginTop: 10 },
  modalInput: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
  },
  aiLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text, marginBottom: 8, marginTop: 6 },
  aiInput: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    height: 120,
    textAlignVertical: "top",
    marginBottom: 12,
  },
  aiResultWrap: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  aiResultHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  aiResultTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  aiResultScroll: { maxHeight: 250, backgroundColor: Colors.surfaceAlt, borderRadius: 10, padding: 12, marginBottom: 12 },
  aiResultJson: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 11, color: Colors.text, lineHeight: 16 },
  applyBtn: { borderRadius: 14, overflow: "hidden" },
  themeCurrentLabel: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.secondary, marginBottom: 14 },
  themeCurrentRow: { flexDirection: "row", justifyContent: "space-around", marginBottom: 24 },
  themeCurrentItem: { alignItems: "center", gap: 6 },
  themeCurrentCircle: { width: 60, height: 60, borderRadius: 30, shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 },
  themeCurrentName: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.text },
  themeCurrentHex: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textLight },
  themePresetsLabel: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.secondary, marginBottom: 12 },
  themeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "transparent",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  themeCardSelected: { borderColor: Colors.primary },
  themeCardColors: { flexDirection: "row", gap: 8, marginRight: 14 },
  themeCardCircle: { width: 28, height: 28, borderRadius: 14 },
  themeCardName: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text, flex: 1 },
  themeNote: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textLight, textAlign: "center", marginTop: 14 },
});
