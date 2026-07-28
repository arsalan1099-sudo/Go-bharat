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
  FlatList,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { getApiUrl, apiRequest } from "@/lib/query-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface ContentBlock {
  id: string;
  type: string;
  config: Record<string, any>;
  order: number;
}

interface DynamicPage {
  id: string;
  title: string;
  slug: string;
  targetRoles: string[];
  blocks: ContentBlock[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const ROLES = ["ALL", "CUSTOMER", "VENDOR", "DELIVERY", "FRANCHISE", "MARKETING", "SUPER_ADMIN"];

const BLOCK_TYPES = [
  { type: "banner", label: "Banner", icon: "image" as const },
  { type: "text", label: "Text", icon: "text" as const },
  { type: "product_grid", label: "Product Grid", icon: "grid" as const },
  { type: "promo_card", label: "Promo Card", icon: "pricetag" as const },
  { type: "announcement", label: "Announcement", icon: "megaphone" as const },
  { type: "cta_button", label: "CTA Button", icon: "link" as const },
  { type: "spacer", label: "Spacer", icon: "remove" as const },
];

const GRADIENT_PRESETS = [
  ["#FF6B00", "#FF8A33"],
  ["#0B1E3D", "#1A3A6B"],
  ["#8B5CF6", "#6366F1"],
  ["#10B981", "#059669"],
  ["#EF4444", "#DC2626"],
  ["#3B82F6", "#2563EB"],
  ["#F59E0B", "#D97706"],
  ["#EC4899", "#DB2777"],
];

const COLOR_PRESETS = ["#FF6B00", "#0B1E3D", "#8B5CF6", "#10B981", "#EF4444", "#3B82F6", "#F59E0B", "#EC4899"];

const genId = () => Date.now().toString() + Math.random().toString(36).substr(2, 9);

const defaultConfig = (type: string): Record<string, any> => {
  switch (type) {
    case "banner": return { title: "", subtitle: "", gradientIndex: 0, iconName: "star" };
    case "text": return { content: "", fontSize: 16, alignment: "left", bold: false };
    case "product_grid": return { title: "", columns: 2, categoryFilter: "" };
    case "promo_card": return { title: "", description: "", promoCode: "", discount: "", gradientIndex: 0 };
    case "announcement": return { title: "", message: "", type: "info", icon: "information-circle" };
    case "cta_button": return { label: "", route: "", colorIndex: 0, icon: "arrow-forward" };
    case "spacer": return { height: 16 };
    default: return {};
  }
};

export default function ContentBuilderScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const qc = useQueryClient();

  const [mode, setMode] = useState<"list" | "editor">("list");
  const [editingPage, setEditingPage] = useState<DynamicPage | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [targetRoles, setTargetRoles] = useState<string[]>(["ALL"]);
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [editingBlock, setEditingBlock] = useState<ContentBlock | null>(null);
  const [showBlockConfig, setShowBlockConfig] = useState(false);

  const { data: pages = [], isLoading } = useQuery<DynamicPage[]>({
    queryKey: ["/api/admin/dynamic-pages"],
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { title, slug, targetRoles, blocks, isActive };
      if (editingPage) {
        return apiRequest("PUT", `/api/admin/dynamic-pages/${editingPage.id}`, payload);
      }
      return apiRequest("POST", "/api/admin/dynamic-pages", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/dynamic-pages"] });
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      Alert.alert("Success", editingPage ? "Page updated" : "Page created");
      resetEditor();
    },
    onError: (e: any) => Alert.alert("Error", e.message || "Failed to save"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/dynamic-pages/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/dynamic-pages"] });
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    },
    onError: (e: any) => Alert.alert("Error", e.message || "Failed to delete"),
  });

  const resetEditor = () => {
    setMode("list");
    setEditingPage(null);
    setTitle("");
    setSlug("");
    setTargetRoles(["ALL"]);
    setBlocks([]);
    setIsActive(true);
  };

  const openEditor = (page?: DynamicPage) => {
    if (page) {
      setEditingPage(page);
      setTitle(page.title);
      setSlug(page.slug);
      setTargetRoles(page.targetRoles);
      setBlocks(page.blocks || []);
      setIsActive(page.isActive);
    } else {
      setEditingPage(null);
      setTitle("");
      setSlug("");
      setTargetRoles(["ALL"]);
      setBlocks([]);
      setIsActive(true);
    }
    setMode("editor");
    try { Haptics.selectionAsync(); } catch {}
  };

  const handleDelete = (id: string) => {
    Alert.alert("Delete Page", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(id) },
    ]);
  };

  const toggleRole = (role: string) => {
    setTargetRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const addBlock = (type: string) => {
    const block: ContentBlock = { id: genId(), type, config: defaultConfig(type), order: blocks.length };
    setBlocks((prev) => [...prev, block]);
    setShowBlockModal(false);
    setEditingBlock(block);
    setShowBlockConfig(true);
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
  };

  const updateBlockConfig = (id: string, key: string, value: any) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, config: { ...b.config, [key]: value } } : b)));
    if (editingBlock?.id === id) {
      setEditingBlock((prev) => prev ? { ...prev, config: { ...prev.config, [key]: value } } : prev);
    }
  };

  const removeBlock = (id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id).map((b, i) => ({ ...b, order: i })));
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
  };

  const moveBlock = (id: string, dir: "up" | "down") => {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id);
      if ((dir === "up" && idx === 0) || (dir === "down" && idx === prev.length - 1)) return prev;
      const next = [...prev];
      const swap = dir === "up" ? idx - 1 : idx + 1;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next.map((b, i) => ({ ...b, order: i }));
    });
    try { Haptics.selectionAsync(); } catch {}
  };

  const renderBlockPreview = (block: ContentBlock) => {
    const { config, type } = block;
    switch (type) {
      case "banner": {
        const g = GRADIENT_PRESETS[config.gradientIndex || 0];
        return (
          <LinearGradient colors={g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={ps.bannerCard}>
            <Ionicons name={(config.iconName || "star") as any} size={28} color="rgba(255,255,255,0.8)" />
            <Text style={ps.bannerTitle}>{config.title || "Banner Title"}</Text>
            <Text style={ps.bannerSub}>{config.subtitle || "Subtitle text"}</Text>
          </LinearGradient>
        );
      }
      case "text":
        return (
          <Text style={[ps.textBlock, { fontSize: config.fontSize || 16, textAlign: config.alignment || "left", fontWeight: config.bold ? "700" : "400" }]}>
            {config.content || "Text content here..."}
          </Text>
        );
      case "product_grid":
        return (
          <View style={ps.gridBlock}>
            <Text style={ps.gridTitle}>{config.title || "Product Grid"}</Text>
            <View style={ps.gridPlaceholder}>
              {Array.from({ length: config.columns || 2 }).map((_, i) => (
                <View key={i} style={[ps.gridItem, { width: `${100 / (config.columns || 2) - 4}%` as any }]} />
              ))}
            </View>
          </View>
        );
      case "promo_card": {
        const pg = GRADIENT_PRESETS[config.gradientIndex || 0];
        return (
          <LinearGradient colors={pg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={ps.promoCard}>
            <View style={{ flex: 1 }}>
              <Text style={ps.promoTitle}>{config.title || "Promo Title"}</Text>
              <Text style={ps.promoDesc}>{config.description || "Description"}</Text>
            </View>
            {config.promoCode ? (
              <View style={ps.promoBadge}>
                <Text style={ps.promoCode}>{config.promoCode}</Text>
                {config.discount ? <Text style={ps.promoDiscount}>{config.discount}% OFF</Text> : null}
              </View>
            ) : null}
          </LinearGradient>
        );
      }
      case "announcement": {
        const typeColors: Record<string, string> = { info: "#3B82F6", warning: "#F59E0B", success: "#10B981", promo: "#8B5CF6" };
        const c = typeColors[config.type || "info"] || "#3B82F6";
        return (
          <View style={[ps.announcementBar, { backgroundColor: c + "15", borderLeftColor: c }]}>
            <Ionicons name={(config.icon || "information-circle") as any} size={20} color={c} />
            <View style={{ flex: 1 }}>
              <Text style={[ps.announcementTitle, { color: c }]}>{config.title || "Announcement"}</Text>
              <Text style={ps.announcementMsg}>{config.message || "Message text"}</Text>
            </View>
          </View>
        );
      }
      case "cta_button": {
        const bc = COLOR_PRESETS[config.colorIndex || 0];
        return (
          <Pressable style={[ps.ctaBtn, { backgroundColor: bc }]}>
            <Ionicons name={(config.icon || "arrow-forward") as any} size={18} color="#FFF" />
            <Text style={ps.ctaLabel}>{config.label || "Button"}</Text>
          </Pressable>
        );
      }
      case "spacer":
        return <View style={{ height: config.height || 16 }} />;
      default:
        return null;
    }
  };

  const renderBlockConfig = () => {
    if (!editingBlock) return null;
    const { type, config, id } = editingBlock;
    const u = (key: string, val: any) => updateBlockConfig(id, key, val);

    switch (type) {
      case "banner":
        return (
          <View style={cs.configBody}>
            <Text style={cs.cfgLabel}>Title</Text>
            <TextInput style={cs.cfgInput} value={config.title} onChangeText={(v) => u("title", v)} placeholder="Banner title" placeholderTextColor={Colors.textLight} />
            <Text style={cs.cfgLabel}>Subtitle</Text>
            <TextInput style={cs.cfgInput} value={config.subtitle} onChangeText={(v) => u("subtitle", v)} placeholder="Subtitle" placeholderTextColor={Colors.textLight} />
            <Text style={cs.cfgLabel}>Icon Name</Text>
            <TextInput style={cs.cfgInput} value={config.iconName} onChangeText={(v) => u("iconName", v)} placeholder="e.g. star, gift, flame" placeholderTextColor={Colors.textLight} />
            <Text style={cs.cfgLabel}>Gradient</Text>
            <View style={cs.presetRow}>
              {GRADIENT_PRESETS.map((g, i) => (
                <Pressable key={i} onPress={() => u("gradientIndex", i)} style={[cs.gradientChip, config.gradientIndex === i && cs.gradientChipActive]}>
                  <LinearGradient colors={g} style={cs.gradientInner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
                </Pressable>
              ))}
            </View>
          </View>
        );
      case "text":
        return (
          <View style={cs.configBody}>
            <Text style={cs.cfgLabel}>Content</Text>
            <TextInput style={[cs.cfgInput, { height: 80, textAlignVertical: "top" }]} value={config.content} onChangeText={(v) => u("content", v)} placeholder="Text content" placeholderTextColor={Colors.textLight} multiline />
            <Text style={cs.cfgLabel}>Font Size</Text>
            <View style={cs.chipRow}>
              {[14, 16, 18, 20, 24].map((s) => (
                <Pressable key={s} onPress={() => u("fontSize", s)} style={[cs.chip, config.fontSize === s && cs.chipActive]}>
                  <Text style={[cs.chipText, config.fontSize === s && cs.chipTextActive]}>{s}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={cs.cfgLabel}>Alignment</Text>
            <View style={cs.chipRow}>
              {["left", "center", "right"].map((a) => (
                <Pressable key={a} onPress={() => u("alignment", a)} style={[cs.chip, config.alignment === a && cs.chipActive]}>
                  <Text style={[cs.chipText, config.alignment === a && cs.chipTextActive]}>{a}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={cs.toggleRow} onPress={() => u("bold", !config.bold)}>
              <Text style={cs.cfgLabel}>Bold</Text>
              <View style={[cs.toggle, config.bold && cs.toggleActive]}>
                <View style={[cs.toggleDot, config.bold && cs.toggleDotActive]} />
              </View>
            </Pressable>
          </View>
        );
      case "product_grid":
        return (
          <View style={cs.configBody}>
            <Text style={cs.cfgLabel}>Title</Text>
            <TextInput style={cs.cfgInput} value={config.title} onChangeText={(v) => u("title", v)} placeholder="Grid title" placeholderTextColor={Colors.textLight} />
            <Text style={cs.cfgLabel}>Columns</Text>
            <View style={cs.chipRow}>
              {[2, 3].map((c) => (
                <Pressable key={c} onPress={() => u("columns", c)} style={[cs.chip, config.columns === c && cs.chipActive]}>
                  <Text style={[cs.chipText, config.columns === c && cs.chipTextActive]}>{c} cols</Text>
                </Pressable>
              ))}
            </View>
            <Text style={cs.cfgLabel}>Category Filter</Text>
            <TextInput style={cs.cfgInput} value={config.categoryFilter} onChangeText={(v) => u("categoryFilter", v)} placeholder="Category name" placeholderTextColor={Colors.textLight} />
          </View>
        );
      case "promo_card":
        return (
          <View style={cs.configBody}>
            <Text style={cs.cfgLabel}>Title</Text>
            <TextInput style={cs.cfgInput} value={config.title} onChangeText={(v) => u("title", v)} placeholder="Promo title" placeholderTextColor={Colors.textLight} />
            <Text style={cs.cfgLabel}>Description</Text>
            <TextInput style={cs.cfgInput} value={config.description} onChangeText={(v) => u("description", v)} placeholder="Description" placeholderTextColor={Colors.textLight} />
            <Text style={cs.cfgLabel}>Promo Code</Text>
            <TextInput style={cs.cfgInput} value={config.promoCode} onChangeText={(v) => u("promoCode", v)} placeholder="e.g. SAVE20" placeholderTextColor={Colors.textLight} autoCapitalize="characters" />
            <Text style={cs.cfgLabel}>Discount (%)</Text>
            <TextInput style={cs.cfgInput} value={config.discount} onChangeText={(v) => u("discount", v)} placeholder="e.g. 20" placeholderTextColor={Colors.textLight} keyboardType="numeric" />
            <Text style={cs.cfgLabel}>Gradient</Text>
            <View style={cs.presetRow}>
              {GRADIENT_PRESETS.map((g, i) => (
                <Pressable key={i} onPress={() => u("gradientIndex", i)} style={[cs.gradientChip, config.gradientIndex === i && cs.gradientChipActive]}>
                  <LinearGradient colors={g} style={cs.gradientInner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
                </Pressable>
              ))}
            </View>
          </View>
        );
      case "announcement":
        return (
          <View style={cs.configBody}>
            <Text style={cs.cfgLabel}>Title</Text>
            <TextInput style={cs.cfgInput} value={config.title} onChangeText={(v) => u("title", v)} placeholder="Alert title" placeholderTextColor={Colors.textLight} />
            <Text style={cs.cfgLabel}>Message</Text>
            <TextInput style={[cs.cfgInput, { height: 70, textAlignVertical: "top" }]} value={config.message} onChangeText={(v) => u("message", v)} placeholder="Alert message" placeholderTextColor={Colors.textLight} multiline />
            <Text style={cs.cfgLabel}>Type</Text>
            <View style={cs.chipRow}>
              {["info", "warning", "success", "promo"].map((t) => (
                <Pressable key={t} onPress={() => u("type", t)} style={[cs.chip, config.type === t && cs.chipActive]}>
                  <Text style={[cs.chipText, config.type === t && cs.chipTextActive]}>{t}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={cs.cfgLabel}>Icon</Text>
            <TextInput style={cs.cfgInput} value={config.icon} onChangeText={(v) => u("icon", v)} placeholder="e.g. information-circle" placeholderTextColor={Colors.textLight} />
          </View>
        );
      case "cta_button":
        return (
          <View style={cs.configBody}>
            <Text style={cs.cfgLabel}>Label</Text>
            <TextInput style={cs.cfgInput} value={config.label} onChangeText={(v) => u("label", v)} placeholder="Button label" placeholderTextColor={Colors.textLight} />
            <Text style={cs.cfgLabel}>Route</Text>
            <TextInput style={cs.cfgInput} value={config.route} onChangeText={(v) => u("route", v)} placeholder="e.g. /store/123" placeholderTextColor={Colors.textLight} />
            <Text style={cs.cfgLabel}>Icon</Text>
            <TextInput style={cs.cfgInput} value={config.icon} onChangeText={(v) => u("icon", v)} placeholder="e.g. arrow-forward" placeholderTextColor={Colors.textLight} />
            <Text style={cs.cfgLabel}>Color</Text>
            <View style={cs.presetRow}>
              {COLOR_PRESETS.map((c, i) => (
                <Pressable key={i} onPress={() => u("colorIndex", i)} style={[cs.colorChip, config.colorIndex === i && cs.colorChipActive]}>
                  <View style={[cs.colorDot, { backgroundColor: c }]} />
                </Pressable>
              ))}
            </View>
          </View>
        );
      case "spacer":
        return (
          <View style={cs.configBody}>
            <Text style={cs.cfgLabel}>Height</Text>
            <View style={cs.chipRow}>
              {[8, 16, 24, 32].map((h) => (
                <Pressable key={h} onPress={() => u("height", h)} style={[cs.chip, config.height === h && cs.chipActive]}>
                  <Text style={[cs.chipText, config.height === h && cs.chipTextActive]}>{h}px</Text>
                </Pressable>
              ))}
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  if (mode === "editor") {
    return (
      <View style={s.container}>
        <LinearGradient colors={[Colors.primary, "#FF8A33", "#FFB74D"]} style={[s.header, { paddingTop: topInset + 12 }]}>
          <View style={s.headerRow}>
            <Pressable onPress={resetEditor} style={s.backBtn}>
              <Ionicons name="arrow-back" size={22} color="#FFF" />
            </Pressable>
            <Text style={s.headerTitle}>{editingPage ? "Edit Page" : "New Page"}</Text>
            <Pressable onPress={() => setIsActive(!isActive)} style={[s.statusToggle, { backgroundColor: isActive ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)" }]}>
              <View style={[s.statusDot, { backgroundColor: isActive ? "#10B981" : "#EF4444" }]} />
              <Text style={s.statusText}>{isActive ? "Active" : "Inactive"}</Text>
            </Pressable>
          </View>
        </LinearGradient>

        <ScrollView contentContainerStyle={{ paddingBottom: bottomInset + 100 }} showsVerticalScrollIndicator={false}>
          <View style={s.formSection}>
            <Text style={s.fieldLabel}>Page Title</Text>
            <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="e.g. Holiday Sale Page" placeholderTextColor={Colors.textLight} />
            <Text style={s.fieldLabel}>Slug</Text>
            <TextInput style={s.input} value={slug} onChangeText={setSlug} placeholder="e.g. holiday-sale" placeholderTextColor={Colors.textLight} autoCapitalize="none" />
            <Text style={s.fieldLabel}>Target Roles</Text>
            <View style={s.rolesRow}>
              {ROLES.map((r) => (
                <Pressable key={r} onPress={() => toggleRole(r)} style={[s.roleChip, targetRoles.includes(r) && s.roleChipActive]}>
                  <Text style={[s.roleChipText, targetRoles.includes(r) && s.roleChipTextActive]}>{r}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={s.formSection}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Blocks ({blocks.length})</Text>
              <Pressable style={s.addBlockBtn} onPress={() => setShowBlockModal(true)}>
                <Ionicons name="add" size={18} color="#FFF" />
                <Text style={s.addBlockText}>Add Block</Text>
              </Pressable>
            </View>

            {blocks.map((block, idx) => (
              <View key={block.id} style={s.blockItem}>
                <View style={s.blockInfo}>
                  <View style={[s.blockIcon, { backgroundColor: Colors.primary + "15" }]}>
                    <Ionicons name={BLOCK_TYPES.find((b) => b.type === block.type)?.icon || "cube"} size={16} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.blockType}>{BLOCK_TYPES.find((b) => b.type === block.type)?.label || block.type}</Text>
                    <Text style={s.blockOrder}>#{idx + 1}</Text>
                  </View>
                </View>
                <View style={s.blockActions}>
                  <Pressable onPress={() => moveBlock(block.id, "up")} style={s.blockActionBtn} disabled={idx === 0}>
                    <Ionicons name="chevron-up" size={18} color={idx === 0 ? Colors.textLight : Colors.text} />
                  </Pressable>
                  <Pressable onPress={() => moveBlock(block.id, "down")} style={s.blockActionBtn} disabled={idx === blocks.length - 1}>
                    <Ionicons name="chevron-down" size={18} color={idx === blocks.length - 1 ? Colors.textLight : Colors.text} />
                  </Pressable>
                  <Pressable onPress={() => { setEditingBlock(block); setShowBlockConfig(true); }} style={s.blockActionBtn}>
                    <Ionicons name="settings-outline" size={18} color={Colors.info} />
                  </Pressable>
                  <Pressable onPress={() => removeBlock(block.id)} style={s.blockActionBtn}>
                    <Ionicons name="trash-outline" size={18} color={Colors.error} />
                  </Pressable>
                </View>
              </View>
            ))}

            {blocks.length === 0 && (
              <View style={s.emptyBlocks}>
                <Ionicons name="layers-outline" size={40} color={Colors.textLight} />
                <Text style={s.emptyBlocksText}>No blocks added yet</Text>
              </View>
            )}
          </View>

          {blocks.length > 0 && (
            <View style={s.formSection}>
              <Text style={s.sectionTitle}>Live Preview</Text>
              <View style={s.previewContainer}>
                {blocks.map((block) => (
                  <View key={block.id} style={s.previewBlock}>
                    {renderBlockPreview(block)}
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        <View style={[s.saveBar, { paddingBottom: bottomInset + 12 }]}>
          <Pressable style={({ pressed }) => [s.saveBtn, pressed && { opacity: 0.8 }]} onPress={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            <LinearGradient colors={[Colors.primary, "#FF8A33"]} style={s.saveBtnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              {saveMutation.isPending ? <ActivityIndicator color="#FFF" size="small" /> : <Ionicons name="save" size={20} color="#FFF" />}
              <Text style={s.saveBtnText}>{editingPage ? "Update Page" : "Save Page"}</Text>
            </LinearGradient>
          </Pressable>
        </View>

        <Modal visible={showBlockModal} animationType="slide" transparent>
          <View style={s.modalOverlay}>
            <View style={s.modalContent}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Add Block</Text>
                <Pressable onPress={() => setShowBlockModal(false)}>
                  <Ionicons name="close" size={24} color={Colors.text} />
                </Pressable>
              </View>
              <View style={s.blockTypeGrid}>
                {BLOCK_TYPES.map((bt) => (
                  <Pressable key={bt.type} style={({ pressed }) => [s.blockTypeCard, pressed && { opacity: 0.7 }]} onPress={() => addBlock(bt.type)}>
                    <View style={[s.blockTypeIcon, { backgroundColor: Colors.primary + "12" }]}>
                      <Ionicons name={bt.icon} size={24} color={Colors.primary} />
                    </View>
                    <Text style={s.blockTypeLabel}>{bt.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={showBlockConfig} animationType="slide" transparent>
          <View style={s.modalOverlay}>
            <View style={[s.modalContent, { maxHeight: "80%" }]}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Configure {BLOCK_TYPES.find((b) => b.type === editingBlock?.type)?.label}</Text>
                <Pressable onPress={() => { setShowBlockConfig(false); setEditingBlock(null); }}>
                  <Ionicons name="checkmark" size={24} color={Colors.success} />
                </Pressable>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                {renderBlockConfig()}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <LinearGradient colors={[Colors.primary, "#FF8A33", "#FFB74D"]} style={[s.header, { paddingTop: topInset + 12 }]}>
        <View style={s.headerRow}>
          <Pressable onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#FFF" />
          </Pressable>
          <Text style={s.headerTitle}>Content Builder</Text>
          <Pressable style={s.createBtn} onPress={() => openEditor()}>
            <Ionicons name="add" size={18} color="#FFF" />
            <Text style={s.createBtnText}>Create Page</Text>
          </Pressable>
        </View>
      </LinearGradient>

      {isLoading ? (
        <View style={s.loader}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (pages as DynamicPage[]).length === 0 ? (
        <View style={s.emptyState}>
          <Ionicons name="document-text-outline" size={64} color={Colors.textLight} />
          <Text style={s.emptyTitle}>No Pages Yet</Text>
          <Text style={s.emptySub}>Create your first dynamic page to get started</Text>
          <Pressable style={s.emptyBtn} onPress={() => openEditor()}>
            <Text style={s.emptyBtnText}>Create Page</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 20 }} showsVerticalScrollIndicator={false}>
          {(pages as DynamicPage[]).map((page) => (
            <View key={page.id} style={s.pageCard}>
              <View style={s.pageCardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.pageTitle}>{page.title}</Text>
                  <Text style={s.pageSlug}>/{page.slug}</Text>
                </View>
                <View style={[s.statusBadge, { backgroundColor: page.isActive ? Colors.success + "18" : Colors.error + "18" }]}>
                  <View style={[s.statusBadgeDot, { backgroundColor: page.isActive ? Colors.success : Colors.error }]} />
                  <Text style={[s.statusBadgeText, { color: page.isActive ? Colors.success : Colors.error }]}>
                    {page.isActive ? "Active" : "Inactive"}
                  </Text>
                </View>
              </View>
              <View style={s.pageCardMeta}>
                <View style={s.metaItem}>
                  <Ionicons name="layers-outline" size={14} color={Colors.textSecondary} />
                  <Text style={s.metaText}>{page.blocks?.length || 0} blocks</Text>
                </View>
                <View style={s.metaItem}>
                  <Ionicons name="people-outline" size={14} color={Colors.textSecondary} />
                  <Text style={s.metaText}>{page.targetRoles?.join(", ")}</Text>
                </View>
              </View>
              <Text style={s.pageDate}>{new Date(page.createdAt).toLocaleDateString()}</Text>
              <View style={s.pageCardActions}>
                <Pressable style={({ pressed }) => [s.editBtn, pressed && { opacity: 0.7 }]} onPress={() => openEditor(page)}>
                  <Ionicons name="create-outline" size={16} color={Colors.info} />
                  <Text style={[s.actionText, { color: Colors.info }]}>Edit</Text>
                </Pressable>
                <Pressable style={({ pressed }) => [s.deleteBtn, pressed && { opacity: 0.7 }]} onPress={() => handleDelete(page.id)}>
                  <Ionicons name="trash-outline" size={16} color={Colors.error} />
                  <Text style={[s.actionText, { color: Colors.error }]}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const ps = StyleSheet.create({
  bannerCard: { borderRadius: 14, padding: 20, alignItems: "center", gap: 6 },
  bannerTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: "#FFF", textAlign: "center" },
  bannerSub: { fontFamily: "Poppins_400Regular", fontSize: 13, color: "rgba(255,255,255,0.8)", textAlign: "center" },
  textBlock: { fontFamily: "Poppins_400Regular", color: Colors.text, paddingHorizontal: 4 },
  gridBlock: { gap: 8 },
  gridTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.secondary },
  gridPlaceholder: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  gridItem: { height: 80, backgroundColor: Colors.surfaceAlt, borderRadius: 10 },
  promoCard: { borderRadius: 14, padding: 18, flexDirection: "row", alignItems: "center", gap: 12 },
  promoTitle: { fontFamily: "Poppins_700Bold", fontSize: 16, color: "#FFF" },
  promoDesc: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "rgba(255,255,255,0.8)" },
  promoBadge: { backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, alignItems: "center" },
  promoCode: { fontFamily: "Poppins_700Bold", fontSize: 14, color: "#FFF" },
  promoDiscount: { fontFamily: "Poppins_600SemiBold", fontSize: 11, color: "rgba(255,255,255,0.9)" },
  announcementBar: { borderRadius: 10, padding: 14, flexDirection: "row", alignItems: "center", gap: 10, borderLeftWidth: 4 },
  announcementTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  announcementMsg: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  ctaBtn: { borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  ctaLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#FFF" },
});

const cs = StyleSheet.create({
  configBody: { padding: 16, gap: 10 },
  cfgLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.secondary, marginTop: 4 },
  cfgInput: { backgroundColor: Colors.surfaceAlt, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  chipRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textSecondary },
  chipTextActive: { color: "#FFF" },
  presetRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  gradientChip: { width: 40, height: 28, borderRadius: 8, overflow: "hidden", borderWidth: 2, borderColor: "transparent" },
  gradientChipActive: { borderColor: Colors.secondary },
  gradientInner: { flex: 1 },
  colorChip: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: "transparent", alignItems: "center", justifyContent: "center" },
  colorChipActive: { borderColor: Colors.secondary },
  colorDot: { width: 26, height: 26, borderRadius: 13 },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  toggle: { width: 44, height: 24, borderRadius: 12, backgroundColor: Colors.border, justifyContent: "center", paddingHorizontal: 2 },
  toggleActive: { backgroundColor: Colors.primary },
  toggleDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#FFF" },
  toggleDotActive: { alignSelf: "flex-end" as const },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 18 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontFamily: "Poppins_700Bold", fontSize: 20, color: "#FFF" },
  createBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  createBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#FFF" },
  statusToggle: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: "#FFF" },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, gap: 8 },
  emptyTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary, marginTop: 12 },
  emptySub: { fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center" },
  emptyBtn: { marginTop: 16, backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  emptyBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#FFF" },
  pageCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  pageCardHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 },
  pageTitle: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.secondary },
  pageSlug: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeDot: { width: 6, height: 6, borderRadius: 3 },
  statusBadgeText: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  pageCardMeta: { flexDirection: "row", gap: 16, marginBottom: 6 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  pageDate: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight, marginBottom: 10 },
  pageCardActions: { flexDirection: "row", gap: 12, borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: 10 },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: Colors.info + "10" },
  deleteBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: Colors.error + "10" },
  actionText: { fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  formSection: { marginHorizontal: 16, marginTop: 20, backgroundColor: "#FFF", borderRadius: 16, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  fieldLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.secondary, marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: Colors.surfaceAlt, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  rolesRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  roleChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border },
  roleChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  roleChipText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.textSecondary },
  roleChipTextActive: { color: "#FFF" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.secondary },
  addBlockBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  addBlockText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: "#FFF" },
  blockItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: Colors.surfaceAlt, borderRadius: 12, padding: 12, marginBottom: 8 },
  blockInfo: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  blockIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  blockType: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text },
  blockOrder: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight },
  blockActions: { flexDirection: "row", gap: 4 },
  blockActionBtn: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  emptyBlocks: { alignItems: "center", paddingVertical: 30, gap: 8 },
  emptyBlocksText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textLight },
  previewContainer: { backgroundColor: Colors.background, borderRadius: 14, padding: 12, gap: 8, borderWidth: 1, borderColor: Colors.border },
  previewBlock: {},
  saveBar: { position: "absolute" as const, bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingTop: 12, backgroundColor: "#FFF", borderTopWidth: 1, borderTopColor: Colors.borderLight },
  saveBtn: { borderRadius: 14, overflow: "hidden" },
  saveBtnGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14 },
  saveBtnText: { fontFamily: "Poppins_700Bold", fontSize: 15, color: "#FFF" },
  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 34 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  modalTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.secondary },
  blockTypeGrid: { flexDirection: "row", flexWrap: "wrap", padding: 16, gap: 12 },
  blockTypeCard: { width: "30%" as any, alignItems: "center", backgroundColor: Colors.surfaceAlt, borderRadius: 14, paddingVertical: 18, paddingHorizontal: 8, gap: 8 },
  blockTypeIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  blockTypeLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.text, textAlign: "center" },
});
