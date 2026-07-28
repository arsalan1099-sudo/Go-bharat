import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, Platform,
  TextInput, Modal, ScrollView, Switch, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { HomeBanner, HomeDeal } from "@/lib/types";
import { router } from "expo-router";

const PRESET_COLORS = [
  { label: "Orange", value: "#FF6B00" },
  { label: "Navy", value: "#0B1E3D" },
  { label: "Purple", value: "#8B5CF6" },
  { label: "Green", value: "#10B981" },
  { label: "Blue", value: "#3B82F6" },
  { label: "Red", value: "#EF4444" },
  { label: "Pink", value: "#EC4899" },
  { label: "Teal", value: "#14B8A6" },
  { label: "Amber", value: "#F59E0B" },
  { label: "Indigo", value: "#6366F1" },
];

const TABS = ["Banners", "Daily Deals", "Promo Media"];

const DEAL_HOURS_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 12, 24];

export default function HomeContent() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const { homeBanners, homeDeals, addHomeBanner, updateHomeBanner, deleteHomeBanner, addHomeDeal, updateHomeDeal, deleteHomeDeal, promoMedia, addPromoMedia, removePromoMedia, togglePromoMedia, loadHomeContent } = useApp();

  useEffect(() => { loadHomeContent(); }, []);

  const [activeTab, setActiveTab] = useState(0);

  const [bannerModal, setBannerModal] = useState(false);
  const [editingBanner, setEditingBanner] = useState<HomeBanner | null>(null);
  const [bannerTitle, setBannerTitle] = useState("");
  const [bannerSubtitle, setBannerSubtitle] = useState("");
  const [bannerColor, setBannerColor] = useState("#FF6B00");
  const [bannerCta, setBannerCta] = useState("Shop Now");
  const [bannerImage, setBannerImage] = useState("");

  const [dealModal, setDealModal] = useState(false);
  const [editingDeal, setEditingDeal] = useState<HomeDeal | null>(null);
  const [dealName, setDealName] = useState("");
  const [dealImage, setDealImage] = useState("");
  const [dealPrice, setDealPrice] = useState("");
  const [dealOriginalPrice, setDealOriginalPrice] = useState("");
  const [dealHours, setDealHours] = useState(3);
  const [dealSold, setDealSold] = useState("0");
  const [dealTotal, setDealTotal] = useState("100");

  const openAddBanner = () => {
    setEditingBanner(null);
    setBannerTitle("");
    setBannerSubtitle("");
    setBannerColor("#FF6B00");
    setBannerCta("Shop Now");
    setBannerImage("");
    setBannerModal(true);
  };

  const openEditBanner = (b: HomeBanner) => {
    setEditingBanner(b);
    setBannerTitle(b.title);
    setBannerSubtitle(b.subtitle);
    setBannerColor(b.color);
    setBannerCta(b.ctaText);
    setBannerImage(b.image || "");
    setBannerModal(true);
  };

  const pickBannerImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [16, 7],
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setBannerImage(asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri);
    }
  };

  const saveBanner = () => {
    if (!bannerTitle.trim()) return;
    const data = { title: bannerTitle.trim(), subtitle: bannerSubtitle.trim(), color: bannerColor, ctaText: bannerCta.trim() || "Shop Now", isActive: editingBanner?.isActive ?? true, order: editingBanner?.order ?? homeBanners.length + 1, image: bannerImage || null };
    if (editingBanner) updateHomeBanner(editingBanner.id, data);
    else addHomeBanner(data);
    setBannerModal(false);
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
  };

  const confirmDeleteBanner = (b: HomeBanner) => {
    Alert.alert("Delete Banner", `Delete "${b.title}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteHomeBanner(b.id) },
    ]);
  };

  const openAddDeal = () => {
    setEditingDeal(null);
    setDealName("");
    setDealImage("");
    setDealPrice("");
    setDealOriginalPrice("");
    setDealHours(3);
    setDealSold("0");
    setDealTotal("100");
    setDealModal(true);
  };

  const openEditDeal = (d: HomeDeal) => {
    setEditingDeal(d);
    setDealName(d.name);
    setDealImage(d.image);
    setDealPrice(String(d.price));
    setDealOriginalPrice(String(d.originalPrice));
    setDealHours(d.endsInHours);
    setDealSold(String(d.sold));
    setDealTotal(String(d.total));
    setDealModal(true);
  };

  const pickDealImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setDealImage(asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri);
    }
  };

  const saveDeal = () => {
    if (!dealName.trim() || !dealPrice || !dealOriginalPrice) return;
    const data: Omit<HomeDeal, "id" | "createdAt"> = {
      name: dealName.trim(),
      image: dealImage.trim() || "https://images.pexels.com/photos/3780681/pexels-photo-3780681.jpeg?auto=compress&cs=tinysrgb&w=400",
      price: parseFloat(dealPrice) || 0,
      originalPrice: parseFloat(dealOriginalPrice) || 0,
      endsInHours: dealHours,
      sold: parseInt(dealSold) || 0,
      total: parseInt(dealTotal) || 100,
      isActive: editingDeal?.isActive ?? true,
    };
    if (editingDeal) updateHomeDeal(editingDeal.id, data);
    else addHomeDeal(data);
    setDealModal(false);
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
  };

  const confirmDeleteDeal = (d: HomeDeal) => {
    Alert.alert("Delete Deal", `Delete "${d.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteHomeDeal(d.id) },
    ]);
  };

  const discountPct = (deal: HomeDeal) => Math.round((1 - deal.price / deal.originalPrice) * 100);

  const pickPromoMedia = async (type: "image" | "video") => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: type === "video" ? ["videos"] : ["images"],
      allowsEditing: type === "image",
      aspect: type === "image" ? [16, 9] : undefined,
      quality: 0.8,
      base64: type === "image",
      videoMaxDuration: 30,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const uri = type === "image" && asset.base64
        ? `data:image/jpeg;base64,${asset.base64}`
        : asset.uri;
      addPromoMedia({ type, uri, isActive: true });
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    }
  };

  const confirmDeletePromo = (id: string) => {
    if (Platform.OS === "web") {
      if (window.confirm("Remove this promo media?")) removePromoMedia(id);
      return;
    }
    Alert.alert("Remove Media", "Remove this promo media?", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => removePromoMedia(id) },
    ], { cancelable: true });
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.secondary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Home Content</Text>
          <Text style={styles.headerSub}>Banners, deals & promo media</Text>
        </View>
        <Pressable
          style={styles.addBtn}
          onPress={() => {
            if (activeTab === 0) openAddBanner();
            else if (activeTab === 1) openAddDeal();
            else Alert.alert("Add Promo Media", "Choose media type", [
              { text: "Photo", onPress: () => pickPromoMedia("image") },
              { text: "Video", onPress: () => pickPromoMedia("video") },
              { text: "Cancel", style: "cancel" },
            ]);
          }}
        >
          <Ionicons name="add" size={22} color="#FFF" />
        </Pressable>
      </View>

      <View style={styles.tabsRow}>
        {TABS.map((tab, idx) => (
          <Pressable key={tab} style={[styles.tab, activeTab === idx && styles.tabActive]} onPress={() => setActiveTab(idx)}>
            <Ionicons
              name={idx === 0 ? "images-outline" : idx === 1 ? "flash-outline" : "play-circle-outline"}
              size={15}
              color={activeTab === idx ? "#FFF" : Colors.textSecondary}
            />
            <Text style={[styles.tabText, activeTab === idx && styles.tabTextActive]}>{tab}</Text>
            <View style={[styles.tabCount, activeTab === idx && styles.tabCountActive]}>
              <Text style={[styles.tabCountText, activeTab === idx && styles.tabCountTextActive]}>
                {idx === 0 ? homeBanners.filter(b => b.isActive).length : idx === 1 ? homeDeals.filter(d => d.isActive).length : promoMedia.filter(m => m.isActive).length}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>

      {activeTab === 0 ? (
        <FlatList
          data={homeBanners}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 12 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="images-outline" size={56} color={Colors.textLight} />
              <Text style={styles.emptyText}>No banners yet</Text>
              <Pressable style={styles.emptyAddBtn} onPress={openAddBanner}>
                <Text style={styles.emptyAddBtnText}>Add First Banner</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.bannerCard}>
              <View style={[styles.bannerPreview, { backgroundColor: item.color, flexDirection: "row", alignItems: "center" }]}>
                <View style={{ flex: 1 }}>
                  <View style={styles.bannerPreviewBrand}>
                    <Ionicons name="storefront" size={11} color="rgba(255,255,255,0.8)" />
                    <Text style={styles.bannerPreviewBrandText}>Go Bharat</Text>
                  </View>
                  <Text style={styles.bannerPreviewTitle}>{item.title}</Text>
                  <Text style={styles.bannerPreviewSub}>{item.subtitle}</Text>
                  <View style={styles.bannerPreviewCta}>
                    <Text style={styles.bannerPreviewCtaText}>{item.ctaText} →</Text>
                  </View>
                </View>
                {item.image ? (
                  <Image source={{ uri: item.image }} style={{ width: 100, height: 80, borderRadius: 10, marginLeft: 10 }} contentFit="cover" accessibilityLabel={item.title} />
                ) : (
                  <Ionicons name="pricetag" size={54} color="rgba(255,255,255,0.12)" style={{ marginLeft: 10 }} />
                )}
              </View>
              <View style={styles.bannerInfo}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bannerCardTitle}>{item.title}</Text>
                  <Text style={styles.bannerCardSub}>{item.subtitle}</Text>
                </View>
                <Switch
                  value={item.isActive}
                  onValueChange={(v) => updateHomeBanner(item.id, { isActive: v })}
                  trackColor={{ false: Colors.borderLight, true: Colors.primary + "60" }}
                  thumbColor={item.isActive ? Colors.primary : "#CCC"}
                />
              </View>
              <View style={styles.cardActions}>
                <Pressable style={styles.editBtn} onPress={() => openEditBanner(item)}>
                  <Ionicons name="pencil" size={15} color={Colors.primary} />
                  <Text style={styles.editBtnText}>Edit</Text>
                </Pressable>
                <Pressable style={styles.deleteBtn} onPress={() => confirmDeleteBanner(item)}>
                  <Ionicons name="trash-outline" size={15} color={Colors.error} />
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      ) : activeTab === 1 ? (
        <FlatList
          data={homeDeals}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 12 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="flash-outline" size={56} color={Colors.textLight} />
              <Text style={styles.emptyText}>No deals yet</Text>
              <Pressable style={styles.emptyAddBtn} onPress={openAddDeal}>
                <Text style={styles.emptyAddBtnText}>Add First Deal</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.dealCard}>
              <Image source={{ uri: item.image }} style={styles.dealImage} contentFit="cover" accessibilityLabel={item.title} />
              <View style={styles.dealInfo}>
                <View style={styles.dealInfoTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dealName} numberOfLines={1}>{item.name}</Text>
                    <View style={styles.dealPriceRow}>
                      <Text style={styles.dealPrice}>₹{item.price}</Text>
                      <Text style={styles.dealOriginal}>₹{item.originalPrice}</Text>
                      <View style={styles.discountBadge}>
                        <Text style={styles.discountText}>{discountPct(item)}% OFF</Text>
                      </View>
                    </View>
                  </View>
                  <Switch
                    value={item.isActive}
                    onValueChange={(v) => updateHomeDeal(item.id, { isActive: v })}
                    trackColor={{ false: Colors.borderLight, true: Colors.primary + "60" }}
                    thumbColor={item.isActive ? Colors.primary : "#CCC"}
                  />
                </View>
                <View style={styles.dealMeta}>
                  <View style={styles.dealMetaChip}>
                    <Ionicons name="time-outline" size={12} color={Colors.error} />
                    <Text style={styles.dealMetaText}>{item.endsInHours}h left</Text>
                  </View>
                  <View style={styles.dealMetaChip}>
                    <Ionicons name="people-outline" size={12} color={Colors.textSecondary} />
                    <Text style={styles.dealMetaText}>{item.sold}/{item.total} sold</Text>
                  </View>
                </View>
                <View style={styles.cardActions}>
                  <Pressable style={styles.editBtn} onPress={() => openEditDeal(item)}>
                    <Ionicons name="pencil" size={15} color={Colors.primary} />
                    <Text style={styles.editBtnText}>Edit</Text>
                  </Pressable>
                  <Pressable style={styles.deleteBtn} onPress={() => confirmDeleteDeal(item)}>
                    <Ionicons name="trash-outline" size={15} color={Colors.error} />
                    <Text style={styles.deleteBtnText}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={promoMedia}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 14 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginBottom: 4 }}>
              These photos & videos replace the promo banner on the customer home screen.
            </Text>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="play-circle-outline" size={56} color={Colors.textLight} />
              <Text style={styles.emptyText}>No promo media yet</Text>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                <Pressable style={[styles.emptyAddBtn, { flex: 1 }]} onPress={() => pickPromoMedia("image")}>
                  <Text style={styles.emptyAddBtnText}>Add Photo</Text>
                </Pressable>
                <Pressable style={[styles.emptyAddBtn, { flex: 1, backgroundColor: Colors.secondary }]} onPress={() => pickPromoMedia("video")}>
                  <Text style={styles.emptyAddBtnText}>Add Video</Text>
                </Pressable>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <View style={{ backgroundColor: "#FFF", borderRadius: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }}>
              {/* Media preview — own overflow:hidden for top rounded corners */}
              <View style={{ borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: "hidden" }}>
                {item.type === "video" ? (
                  <View style={{ width: "100%", height: 180, backgroundColor: "#1a1a2e", alignItems: "center", justifyContent: "center" }}>
                    <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="play" size={32} color="#FFF" style={{ marginLeft: 4 }} />
                    </View>
                    <Text style={{ color: "rgba(255,255,255,0.6)", fontFamily: "Inter_500Medium", fontSize: 12, marginTop: 10 }}>Video saved</Text>
                  </View>
                ) : (
                  <Image source={{ uri: item.uri }} style={{ width: "100%", height: 180 }} contentFit="cover" accessibilityLabel="Banner media" />
                )}
                <View style={{ position: "absolute", top: 8, left: 8 }}>
                  <View style={{ backgroundColor: item.type === "video" ? "#7C3AED" : Colors.primary, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name={item.type === "video" ? "videocam" : "image"} size={11} color="#FFF" />
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#FFF" }}>{item.type === "video" ? "Video" : "Photo"}</Text>
                  </View>
                </View>
              </View>
              {/* Toggle row */}
              <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8, gap: 10 }}>
                <Switch
                  value={item.isActive}
                  onValueChange={(v) => togglePromoMedia(item.id, v)}
                  trackColor={{ false: Colors.borderLight, true: Colors.primary + "60" }}
                  thumbColor={item.isActive ? Colors.primary : "#CCC"}
                />
                <Text style={{ flex: 1, fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text }}>
                  {item.isActive ? "Active — showing on home" : "Hidden"}
                </Text>
              </View>
              {/* Delete button — outside overflow:hidden so touches register correctly on Android */}
              <Pressable
                onPress={() => confirmDeletePromo(item.id)}
                android_ripple={{ color: "#ffeaea", borderless: false }}
                style={({ pressed }) => ({
                  flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                  paddingVertical: 13, marginHorizontal: 12, marginBottom: 12,
                  borderRadius: 10, backgroundColor: pressed ? "#ffeaea" : "#FFF5F5",
                  borderWidth: 1, borderColor: "#FFCDD2",
                })}
              >
                <Ionicons name="trash-outline" size={16} color={Colors.error} />
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.error }}>Delete</Text>
              </Pressable>
            </View>
          )}
        />
      )}

      <Modal visible={bannerModal} transparent animationType="slide" onRequestClose={() => setBannerModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{editingBanner ? "Edit Banner" : "Add Banner"}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Banner Title *</Text>
              <TextInput style={styles.input} value={bannerTitle} onChangeText={setBannerTitle} placeholder="e.g. Festival Sale" placeholderTextColor={Colors.textLight} />

              <Text style={styles.fieldLabel}>Subtitle</Text>
              <TextInput style={styles.input} value={bannerSubtitle} onChangeText={setBannerSubtitle} placeholder="e.g. Up to 70% off on fashion" placeholderTextColor={Colors.textLight} />

              <Text style={styles.fieldLabel}>CTA Button Text</Text>
              <TextInput style={styles.input} value={bannerCta} onChangeText={setBannerCta} placeholder="Shop Now" placeholderTextColor={Colors.textLight} />

              <Text style={styles.fieldLabel}>Banner Image (optional)</Text>
              {bannerImage ? (
                <View style={{ marginBottom: 12 }}>
                  <Image source={{ uri: bannerImage }} style={{ width: "100%", height: 120, borderRadius: 10, marginBottom: 8 }} contentFit="cover" accessibilityLabel="Banner preview" />
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Pressable style={[styles.input, { flex: 1, justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 6, paddingVertical: 10 }]} onPress={pickBannerImage}>
                      <Ionicons name="pencil" size={14} color={Colors.primary} />
                      <Text style={{ color: Colors.primary, fontSize: 13, fontFamily: "Inter_500Medium" }}>Change</Text>
                    </Pressable>
                    <Pressable style={[styles.input, { flex: 1, justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 6, paddingVertical: 10 }]} onPress={() => setBannerImage("")}>
                      <Ionicons name="trash" size={14} color={Colors.error || "#EF4444"} />
                      <Text style={{ color: Colors.error || "#EF4444", fontSize: 13, fontFamily: "Inter_500Medium" }}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable style={[styles.input, { justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 8, paddingVertical: 16, marginBottom: 12, borderStyle: "dashed", borderWidth: 1.5, borderColor: Colors.border }]} onPress={pickBannerImage}>
                  <Ionicons name="image-outline" size={20} color={Colors.textLight} />
                  <Text style={{ color: Colors.textLight, fontSize: 14, fontFamily: "Inter_400Regular" }}>Tap to upload image</Text>
                </Pressable>
              )}

              <Text style={styles.fieldLabel}>Banner Color</Text>
              <View style={styles.colorGrid}>
                {PRESET_COLORS.map((c) => (
                  <Pressable key={c.value} style={[styles.colorChip, { backgroundColor: c.value }, bannerColor === c.value && styles.colorChipSelected]} onPress={() => setBannerColor(c.value)}>
                    {bannerColor === c.value && <Ionicons name="checkmark" size={16} color="#FFF" />}
                  </Pressable>
                ))}
              </View>

              {(bannerTitle.trim() || bannerImage) ? (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: 4 }]}>Preview</Text>
                  <View style={[styles.bannerPreview, { backgroundColor: bannerColor, marginTop: 4, flexDirection: "row", alignItems: "center" }]}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.bannerPreviewBrand}>
                        <Ionicons name="storefront" size={11} color="rgba(255,255,255,0.8)" />
                        <Text style={styles.bannerPreviewBrandText}>Go Bharat</Text>
                      </View>
                      <Text style={styles.bannerPreviewTitle}>{bannerTitle || "Banner Title"}</Text>
                      {bannerSubtitle ? <Text style={styles.bannerPreviewSub}>{bannerSubtitle}</Text> : null}
                      <View style={styles.bannerPreviewCta}>
                        <Text style={styles.bannerPreviewCtaText}>{bannerCta || "Shop Now"} →</Text>
                      </View>
                    </View>
                    {bannerImage ? (
                      <Image source={{ uri: bannerImage }} style={{ width: 100, height: 80, borderRadius: 10, marginLeft: 10 }} contentFit="cover" accessibilityLabel="Banner preview" />
                    ) : (
                      <Ionicons name="pricetag" size={54} color="rgba(255,255,255,0.12)" style={{ marginLeft: 10 }} />
                    )}
                  </View>
                </>
              ) : null}
            </ScrollView>
            <View style={styles.modalBtns}>
              <Pressable style={styles.cancelBtn} onPress={() => setBannerModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.saveBtn, !bannerTitle.trim() && { opacity: 0.5 }]} onPress={saveBanner} disabled={!bannerTitle.trim()}>
                <Text style={styles.saveBtnText}>{editingBanner ? "Update" : "Add Banner"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={dealModal} transparent animationType="slide" onRequestClose={() => setDealModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{editingDeal ? "Edit Deal" : "Add Deal"}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Product Name *</Text>
              <TextInput style={styles.input} value={dealName} onChangeText={setDealName} placeholder="e.g. Wireless Earbuds Pro" placeholderTextColor={Colors.textLight} />

              <Text style={styles.fieldLabel}>Product Image</Text>
              {dealImage ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <Image source={{ uri: dealImage }} style={{ width: 90, height: 90, borderRadius: 10 }} contentFit="cover" accessibilityLabel="Deal product photo" />
                  <View style={{ flex: 1, gap: 8 }}>
                    <Pressable style={[styles.input, { justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 6, paddingVertical: 10 }]} onPress={pickDealImage}>
                      <Ionicons name="pencil" size={14} color={Colors.primary} />
                      <Text style={{ color: Colors.primary, fontSize: 13, fontFamily: "Inter_500Medium" }}>Change Photo</Text>
                    </Pressable>
                    <Pressable style={[styles.input, { justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 6, paddingVertical: 10 }]} onPress={() => setDealImage("")}>
                      <Ionicons name="trash" size={14} color={Colors.error || "#EF4444"} />
                      <Text style={{ color: Colors.error || "#EF4444", fontSize: 13, fontFamily: "Inter_500Medium" }}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable style={[styles.input, { justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 8, paddingVertical: 16, marginBottom: 12, borderStyle: "dashed", borderWidth: 1.5, borderColor: Colors.border }]} onPress={pickDealImage}>
                  <Ionicons name="image-outline" size={20} color={Colors.textLight} />
                  <Text style={{ color: Colors.textLight, fontSize: 14, fontFamily: "Inter_400Regular" }}>Tap to upload image</Text>
                </Pressable>
              )}

              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Deal Price (₹) *</Text>
                  <TextInput style={styles.input} value={dealPrice} onChangeText={setDealPrice} keyboardType="numeric" placeholder="499" placeholderTextColor={Colors.textLight} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Original Price (₹) *</Text>
                  <TextInput style={styles.input} value={dealOriginalPrice} onChangeText={setDealOriginalPrice} keyboardType="numeric" placeholder="1999" placeholderTextColor={Colors.textLight} />
                </View>
              </View>

              {dealPrice && dealOriginalPrice && parseFloat(dealOriginalPrice) > 0 ? (
                <View style={styles.discountPreview}>
                  <Ionicons name="pricetag" size={14} color={Colors.success} />
                  <Text style={styles.discountPreviewText}>
                    {Math.round((1 - parseFloat(dealPrice || "0") / parseFloat(dealOriginalPrice || "1")) * 100)}% discount
                  </Text>
                </View>
              ) : null}

              <Text style={styles.fieldLabel}>Deal Duration</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={styles.hoursRow}>
                  {DEAL_HOURS_OPTIONS.map((h) => (
                    <Pressable key={h} style={[styles.hourChip, dealHours === h && styles.hourChipActive]} onPress={() => setDealHours(h)}>
                      <Text style={[styles.hourChipText, dealHours === h && styles.hourChipTextActive]}>{h}h</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>

              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Units Sold</Text>
                  <TextInput style={styles.input} value={dealSold} onChangeText={setDealSold} keyboardType="numeric" placeholder="0" placeholderTextColor={Colors.textLight} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Total Units</Text>
                  <TextInput style={styles.input} value={dealTotal} onChangeText={setDealTotal} keyboardType="numeric" placeholder="100" placeholderTextColor={Colors.textLight} />
                </View>
              </View>
            </ScrollView>
            <View style={styles.modalBtns}>
              <Pressable style={styles.cancelBtn} onPress={() => setDealModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.saveBtn, (!dealName.trim() || !dealPrice || !dealOriginalPrice) && { opacity: 0.5 }]} onPress={saveDeal} disabled={!dealName.trim() || !dealPrice || !dealOriginalPrice}>
                <Text style={styles.saveBtnText}>{editingDeal ? "Update" : "Add Deal"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: "#FFF", flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary },
  headerSub: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  addBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  tabsRow: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 10, backgroundColor: "#FFF", borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 12, backgroundColor: Colors.surfaceAlt },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  tabTextActive: { color: "#FFF" },
  tabCount: { backgroundColor: Colors.borderLight, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, minWidth: 24, alignItems: "center" },
  tabCountActive: { backgroundColor: "rgba(255,255,255,0.25)" },
  tabCountText: { fontFamily: "Poppins_700Bold", fontSize: 11, color: Colors.textSecondary },
  tabCountTextActive: { color: "#FFF" },
  empty: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontFamily: "Poppins_500Medium", fontSize: 16, color: Colors.textSecondary },
  emptyAddBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 11 },
  emptyAddBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#FFF" },
  bannerCard: { backgroundColor: "#FFF", borderRadius: 16, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  bannerPreview: { padding: 20, minHeight: 120 },
  bannerPreviewBrand: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 8 },
  bannerPreviewBrandText: { fontFamily: "Poppins_500Medium", fontSize: 11, color: "rgba(255,255,255,0.8)" },
  bannerPreviewTitle: { fontFamily: "Poppins_700Bold", fontSize: 22, color: "#FFF", marginBottom: 4 },
  bannerPreviewSub: { fontFamily: "Poppins_400Regular", fontSize: 13, color: "rgba(255,255,255,0.85)", marginBottom: 12 },
  bannerPreviewCta: { backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 20, alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 7 },
  bannerPreviewCtaText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#FFF" },
  bannerInfo: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  bannerCardTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  bannerCardSub: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary },
  cardActions: { flexDirection: "row", borderTopWidth: 1, borderTopColor: Colors.borderLight },
  editBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11 },
  editBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.primary },
  deleteBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderLeftWidth: 1, borderLeftColor: Colors.borderLight },
  deleteBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.error },
  dealCard: { backgroundColor: "#FFF", borderRadius: 16, flexDirection: "row", overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  dealImage: { width: 100, height: 100 },
  dealInfo: { flex: 1, padding: 12 },
  dealInfoTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  dealName: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text },
  dealPriceRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" },
  dealPrice: { fontFamily: "Poppins_700Bold", fontSize: 15, color: Colors.primary },
  dealOriginal: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textLight, textDecorationLine: "line-through" },
  discountBadge: { backgroundColor: Colors.success + "18", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  discountText: { fontFamily: "Poppins_700Bold", fontSize: 10, color: Colors.success },
  dealMeta: { flexDirection: "row", gap: 8, marginTop: 8 },
  dealMetaChip: { flexDirection: "row", alignItems: "center", gap: 3 },
  dealMetaText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "85%" as any },
  modalHandle: { width: 40, height: 4, backgroundColor: Colors.borderLight, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  modalTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary, marginBottom: 16 },
  fieldLabel: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textSecondary, marginBottom: 6 },
  input: { backgroundColor: Colors.surfaceAlt, borderRadius: 12, padding: 13, fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.text, marginBottom: 14 },
  row2: { flexDirection: "row", gap: 10 },
  colorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  colorChip: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  colorChipSelected: { borderWidth: 3, borderColor: "#FFF", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
  hoursRow: { flexDirection: "row", gap: 8, paddingVertical: 4 },
  hourChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.surfaceAlt },
  hourChipActive: { backgroundColor: Colors.primary },
  hourChipText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textSecondary },
  hourChipTextActive: { color: "#FFF" },
  discountPreview: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.success + "12", borderRadius: 8, padding: 10, marginBottom: 14 },
  discountPreviewText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.success },
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 16 },
  cancelBtn: { flex: 1, backgroundColor: Colors.surfaceAlt, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  cancelBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.textSecondary },
  saveBtn: { flex: 1, backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  saveBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#FFF" },
});
