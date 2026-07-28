import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Alert, Modal, TextInput, FlatList } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { products as allProducts } from "@/lib/data";
import { LiveSession, Product, TaggedProduct } from "@/lib/types";

type TabKey = "active" | "past";

export default function VendorLiveScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, liveSessions, startLiveSession, endLiveSession } = useApp();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const [activeTab, setActiveTab] = useState<TabKey>("active");
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [productSearchQuery, setProductSearchQuery] = useState("");

  const vendorId = user?.id || "v2";

  const vendorSessions = useMemo(() =>
    liveSessions.filter(s => s.vendorId === vendorId),
    [liveSessions, vendorId]
  );

  const activeSessions = useMemo(() =>
    vendorSessions.filter(s => s.status === "LIVE" || s.status === "SCHEDULED"),
    [vendorSessions]
  );

  const pastSessions = useMemo(() =>
    vendorSessions.filter(s => s.status === "ENDED"),
    [vendorSessions]
  );

  const vendorProducts = useMemo(() =>
    allProducts.filter(p => p.vendorId === vendorId),
    [vendorId]
  );

  const filteredProducts = useMemo(() => {
    if (!productSearchQuery.trim()) return vendorProducts;
    const q = productSearchQuery.toLowerCase();
    return vendorProducts.filter(p => p.name.toLowerCase().includes(q));
  }, [vendorProducts, productSearchQuery]);

  const toggleProduct = (productId: string) => {
    setSelectedProducts(prev =>
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const handleCreateSession = () => {
    if (!newTitle.trim()) {
      Alert.alert("Required", "Please enter a session title.");
      return;
    }

    const taggedProducts: TaggedProduct[] = selectedProducts
      .map(pid => {
        const p = allProducts.find(pr => pr.id === pid);
        if (!p) return null;
        return {
          productId: p.id,
          productName: p.name,
          productImage: p.image,
          price: p.price,
          originalPrice: p.originalPrice,
          vendorId: p.vendorId,
          vendorName: user?.name || "Vendor",
        };
      })
      .filter(Boolean) as TaggedProduct[];

    startLiveSession({
      vendorId,
      vendorName: user?.name || "Vendor",
      vendorImage: user?.avatar,
      title: newTitle.trim(),
      description: newDescription.trim() || "Live product demonstration",
      thumbnail: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=600",
      videoUrl: "https://videos.pexels.com/video-files/3015510/3015510-hd_1920_1080_24fps.mp4",
      taggedProducts,
      scheduledAt: undefined,
      endedAt: undefined,
    });

    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    setCreateModalVisible(false);
    setNewTitle("");
    setNewDescription("");
    setSelectedProducts([]);
    setProductSearchQuery("");
  };

  const handleEndSession = (sessionId: string) => {
    Alert.alert(
      "End Live Session",
      "Are you sure you want to end this live session?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "End Session",
          style: "destructive",
          onPress: () => {
            endLiveSession(sessionId);
            try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
          },
        },
      ]
    );
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const formatDuration = (start?: string, end?: string) => {
    if (!start || !end) return "--";
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  const renderActiveSession = (session: LiveSession) => (
    <View key={session.id} style={styles.sessionCard}>
      <View style={styles.sessionCardHeader}>
        <Image source={{ uri: session.thumbnail }} style={styles.sessionThumb} accessibilityLabel="Live session thumbnail" />
        <View style={styles.sessionInfo}>
          <View style={styles.sessionTitleRow}>
            <Text style={styles.sessionTitle} numberOfLines={1}>{session.title}</Text>
            <View style={[styles.statusPill, session.status === "LIVE" ? styles.livePill : styles.scheduledPill]}>
              {session.status === "LIVE" && <View style={styles.liveDot} />}
              <Text style={[styles.statusPillText, session.status === "LIVE" ? styles.liveText : styles.scheduledText]}>
                {session.status}
              </Text>
            </View>
          </View>
          <Text style={styles.sessionDesc} numberOfLines={1}>{session.description}</Text>
          {session.startedAt && (
            <Text style={styles.sessionTime}>Started {formatDate(session.startedAt)}</Text>
          )}
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Ionicons name="eye" size={16} color={Colors.info} />
          <Text style={styles.statNumber}>{session.viewers}</Text>
          <Text style={styles.statLabel}>Viewers</Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="people" size={16} color="#8B5CF6" />
          <Text style={styles.statNumber}>{session.peakViewers}</Text>
          <Text style={styles.statLabel}>Peak</Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="heart" size={16} color="#EF4444" />
          <Text style={styles.statNumber}>{session.likes}</Text>
          <Text style={styles.statLabel}>Likes</Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="chatbubble" size={16} color={Colors.success} />
          <Text style={styles.statNumber}>{session.chatMessages.length}</Text>
          <Text style={styles.statLabel}>Chats</Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="pricetag" size={16} color={Colors.primary} />
          <Text style={styles.statNumber}>{session.taggedProducts.length}</Text>
          <Text style={styles.statLabel}>Products</Text>
        </View>
      </View>

      {session.taggedProducts.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.taggedProductsScroll}>
          {session.taggedProducts.map(tp => (
            <View key={tp.productId} style={styles.taggedProductChip}>
              <Image source={{ uri: tp.productImage }} style={styles.taggedProductImg} accessibilityLabel={tp.productName} />
              <Text style={styles.taggedProductName} numberOfLines={1}>{tp.productName}</Text>
              <Text style={styles.taggedProductPrice}>{"\u20B9"}{tp.price}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      {session.status === "LIVE" && (
        <Pressable style={styles.endBtn} onPress={() => handleEndSession(session.id)}>
          <Ionicons name="stop-circle" size={18} color="#FFF" />
          <Text style={styles.endBtnText}>End Live Session</Text>
        </Pressable>
      )}
    </View>
  );

  const renderPastSession = (session: LiveSession) => (
    <View key={session.id} style={styles.pastCard}>
      <View style={styles.pastCardHeader}>
        <Image source={{ uri: session.thumbnail }} style={styles.pastThumb} accessibilityLabel="Past session thumbnail" />
        <View style={styles.pastInfo}>
          <Text style={styles.pastTitle} numberOfLines={1}>{session.title}</Text>
          <Text style={styles.pastDate}>{formatDate(session.startedAt)}</Text>
        </View>
        <View style={styles.endedBadge}>
          <Text style={styles.endedBadgeText}>Ended</Text>
        </View>
      </View>

      <View style={styles.pastStatsRow}>
        <View style={styles.pastStat}>
          <Ionicons name="eye-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.pastStatText}>{session.peakViewers} peak viewers</Text>
        </View>
        <View style={styles.pastStat}>
          <Ionicons name="heart-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.pastStatText}>{session.likes} likes</Text>
        </View>
        <View style={styles.pastStat}>
          <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.pastStatText}>{formatDuration(session.startedAt, session.endedAt)}</Text>
        </View>
      </View>
    </View>
  );

  const renderProductItem = ({ item }: { item: Product }) => {
    const isSelected = selectedProducts.includes(item.id);
    return (
      <Pressable
        style={[styles.productSelectItem, isSelected && styles.productSelectItemActive]}
        onPress={() => toggleProduct(item.id)}
      >
        <Image source={{ uri: item.image }} style={styles.productSelectImg} accessibilityLabel={item.name} />
        <View style={styles.productSelectInfo}>
          <Text style={styles.productSelectName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.productSelectPrice}>{"\u20B9"}{item.price}</Text>
        </View>
        <View style={[styles.productCheckbox, isSelected && styles.productCheckboxActive]}>
          {isSelected && <Ionicons name="checkmark" size={14} color="#FFF" />}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0B1E3D", "#142F5E"]} style={[styles.header, { paddingTop: topInset + 12 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#FFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Live Sessions</Text>
          <Pressable
            style={styles.newSessionBtn}
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
              setCreateModalVisible(true);
            }}
          >
            <Ionicons name="add" size={20} color="#FFF" />
          </Pressable>
        </View>
      </LinearGradient>

      <View style={styles.tabRow}>
        {(["active", "past"] as TabKey[]).map(tab => (
          <Pressable
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === "active" ? `Active (${activeSessions.length})` : `Past (${pastSessions.length})`}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        {activeTab === "active" ? (
          activeSessions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="videocam-outline" size={48} color={Colors.textLight} />
              <Text style={styles.emptyTitle}>No Active Sessions</Text>
              <Text style={styles.emptyDesc}>Start a live session to showcase your products to customers in real-time</Text>
              <Pressable
                style={styles.createBtn}
                onPress={() => {
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
                  setCreateModalVisible(true);
                }}
              >
                <Ionicons name="videocam" size={18} color="#FFF" />
                <Text style={styles.createBtnText}>Go Live</Text>
              </Pressable>
            </View>
          ) : (
            activeSessions.map(renderActiveSession)
          )
        ) : (
          pastSessions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="film-outline" size={48} color={Colors.textLight} />
              <Text style={styles.emptyTitle}>No Past Sessions</Text>
              <Text style={styles.emptyDesc}>Your completed live sessions will appear here with replay stats</Text>
            </View>
          ) : (
            pastSessions.map(renderPastSession)
          )
        )}
      </ScrollView>

      <Modal visible={createModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Start Live Session</Text>
              <Pressable onPress={() => setCreateModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll}>
              <Text style={styles.inputLabel}>Session Title</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Summer Collection Showcase"
                placeholderTextColor={Colors.textLight}
                value={newTitle}
                onChangeText={setNewTitle}
                maxLength={80}
              />

              <Text style={styles.inputLabel}>Description (optional)</Text>
              <TextInput
                style={[styles.textInput, styles.textAreaInput]}
                placeholder="Tell viewers what to expect..."
                placeholderTextColor={Colors.textLight}
                value={newDescription}
                onChangeText={setNewDescription}
                multiline
                numberOfLines={3}
                maxLength={200}
                textAlignVertical="top"
              />

              <Text style={styles.inputLabel}>
                Tag Products ({selectedProducts.length} selected)
              </Text>
              {vendorProducts.length > 5 && (
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search your products..."
                  placeholderTextColor={Colors.textLight}
                  value={productSearchQuery}
                  onChangeText={setProductSearchQuery}
                />
              )}

              {filteredProducts.length === 0 ? (
                <View style={styles.noProductsBox}>
                  <Text style={styles.noProductsText}>No products found</Text>
                </View>
              ) : (
                <FlatList
                  data={filteredProducts}
                  renderItem={renderProductItem}
                  keyExtractor={item => item.id}
                  scrollEnabled={false}
                  style={styles.productList}
                />
              )}
            </ScrollView>

            <Pressable
              style={[styles.goLiveBtn, !newTitle.trim() && styles.goLiveBtnDisabled]}
              onPress={handleCreateSession}
              disabled={!newTitle.trim()}
            >
              <Ionicons name="videocam" size={20} color="#FFF" />
              <Text style={styles.goLiveBtnText}>Go Live Now</Text>
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
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: "#FFF" },
  newSessionBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  tabRow: { flexDirection: "row", paddingHorizontal: 20, paddingVertical: 12, gap: 10 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: "#FFF", alignItems: "center" },
  tabActive: { backgroundColor: Colors.secondary },
  tabText: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  tabTextActive: { color: "#FFF" },
  content: { flex: 1, paddingHorizontal: 20 },
  emptyState: { alignItems: "center", paddingVertical: 60, paddingHorizontal: 32 },
  emptyTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.secondary, marginTop: 16 },
  emptyDesc: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center", marginTop: 8, lineHeight: 20 },
  createBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#EF4444", borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14, marginTop: 24 },
  createBtnText: { fontFamily: "Poppins_700Bold", fontSize: 15, color: "#FFF" },
  sessionCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 16, marginBottom: 14, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  sessionCardHeader: { flexDirection: "row", gap: 12, marginBottom: 14 },
  sessionThumb: { width: 80, height: 80, borderRadius: 12, backgroundColor: Colors.borderLight },
  sessionInfo: { flex: 1, justifyContent: "center" },
  sessionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sessionTitle: { fontFamily: "Poppins_700Bold", fontSize: 15, color: Colors.secondary, flex: 1 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  livePill: { backgroundColor: "#EF4444" + "18" },
  scheduledPill: { backgroundColor: Colors.info + "18" },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#EF4444" },
  statusPillText: { fontFamily: "Poppins_700Bold", fontSize: 10 },
  liveText: { color: "#EF4444" },
  scheduledText: { color: Colors.info },
  sessionDesc: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
  sessionTime: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight, marginTop: 2 },
  statsRow: { flexDirection: "row", justifyContent: "space-between", backgroundColor: Colors.background, borderRadius: 12, padding: 12, marginBottom: 12 },
  statItem: { alignItems: "center", gap: 2 },
  statNumber: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.secondary },
  statLabel: { fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textSecondary },
  taggedProductsScroll: { marginBottom: 14 },
  taggedProductChip: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.background, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6, marginRight: 8, gap: 6 },
  taggedProductImg: { width: 28, height: 28, borderRadius: 6, backgroundColor: Colors.borderLight },
  taggedProductName: { fontFamily: "Poppins_500Medium", fontSize: 11, color: Colors.text, maxWidth: 80 },
  taggedProductPrice: { fontFamily: "Poppins_700Bold", fontSize: 11, color: Colors.primary },
  endBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#EF4444", borderRadius: 12, paddingVertical: 12 },
  endBtnText: { fontFamily: "Poppins_700Bold", fontSize: 14, color: "#FFF" },
  pastCard: { backgroundColor: "#FFF", borderRadius: 14, padding: 14, marginBottom: 10 },
  pastCardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  pastThumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: Colors.borderLight },
  pastInfo: { flex: 1 },
  pastTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.secondary },
  pastDate: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  endedBadge: { backgroundColor: Colors.textLight + "20", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  endedBadgeText: { fontFamily: "Poppins_600SemiBold", fontSize: 10, color: Colors.textSecondary },
  pastStatsRow: { flexDirection: "row", gap: 16, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  pastStat: { flexDirection: "row", alignItems: "center", gap: 4 },
  pastStatText: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 20, paddingHorizontal: 20, maxHeight: "85%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, color: Colors.secondary },
  modalScroll: { maxHeight: 450 },
  inputLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text, marginBottom: 8, marginTop: 12 },
  textInput: { backgroundColor: Colors.background, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.text, borderWidth: 1, borderColor: Colors.borderLight },
  textAreaInput: { minHeight: 80 },
  searchInput: { backgroundColor: Colors.background, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.text, borderWidth: 1, borderColor: Colors.borderLight, marginBottom: 8 },
  productList: { maxHeight: 200 },
  productSelectItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, marginBottom: 4 },
  productSelectItemActive: { backgroundColor: Colors.primary + "08" },
  productSelectImg: { width: 40, height: 40, borderRadius: 8, backgroundColor: Colors.borderLight },
  productSelectInfo: { flex: 1 },
  productSelectName: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.text },
  productSelectPrice: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.primary },
  productCheckbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.borderLight, alignItems: "center", justifyContent: "center" },
  productCheckboxActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  noProductsBox: { paddingVertical: 20, alignItems: "center" },
  noProductsText: { fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textLight },
  goLiveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#EF4444", borderRadius: 14, paddingVertical: 14, marginTop: 16 },
  goLiveBtnDisabled: { opacity: 0.5 },
  goLiveBtnText: { fontFamily: "Poppins_700Bold", fontSize: 16, color: "#FFF" },
});
