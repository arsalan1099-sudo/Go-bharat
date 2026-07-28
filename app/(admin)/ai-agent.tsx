import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  TextInput,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Animated as RNAnimated,
} from "react-native";
import { fetch } from "expo/fetch";
import { router } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { vendors, products, categories } from "@/lib/data";

let _idCounter = 0;
const genId = () => `msg_${Date.now()}_${++_idCounter}`;

function getApiBase() {
  const host = process.env.EXPO_PUBLIC_DOMAIN;
  if (!host) return "";
  return `https://${host}`;
}

interface ToolExecution {
  tool: string;
  args?: any;
  result?: any;
  status: "running" | "done";
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  toolExecutions?: ToolExecution[];
}

const TOOL_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  get_platform_analytics: { label: "Fetching Analytics", icon: "analytics", color: "#3B82F6" },
  manage_vendor: { label: "Managing Vendors", icon: "storefront", color: Colors.primary },
  send_notification: { label: "Sending Notification", icon: "notifications", color: "#8B5CF6" },
  manage_deals: { label: "Managing Deals", icon: "flash", color: "#EF4444" },
  manage_coupons: { label: "Managing Coupons", icon: "pricetag", color: "#14B8A6" },
  manage_users: { label: "Analyzing Users", icon: "people", color: "#6366F1" },
  manage_content: { label: "Reviewing Content", icon: "images", color: "#F59E0B" },
  generate_report: { label: "Generating Report", icon: "document-text", color: "#0EA5E9" },
  manage_franchise: { label: "Checking Franchises", icon: "business", color: "#EC4899" },
};

const QUICK_ACTIONS = [
  { icon: "analytics" as const, label: "Platform Overview", prompt: "Give me a complete platform overview with all key metrics - revenue, orders, users, vendors, and growth trends.", gradient: ["#3B82F6", "#2563EB"] },
  { icon: "checkmark-circle" as const, label: "Pending Approvals", prompt: "Check all pending items - vendor applications, deal bookings, and ad requests. Show me what needs my attention.", gradient: ["#10B981", "#059669"] },
  { icon: "document-text" as const, label: "Daily Report", prompt: "Generate a comprehensive daily summary report covering all platform activity, key metrics, and action items.", gradient: ["#8B5CF6", "#7C3AED"] },
  { icon: "megaphone" as const, label: "Send Promotion", prompt: "Help me craft and send a promotional notification to all customers about today's best deals.", gradient: ["#F59E0B", "#D97706"] },
  { icon: "pricetag" as const, label: "Create Coupon", prompt: "Help me create a new coupon code. Suggest a good code name, discount percentage, and minimum order value based on our platform data.", gradient: ["#14B8A6", "#0D9488"] },
  { icon: "trending-up" as const, label: "Growth Analysis", prompt: "Analyze our growth metrics and give me actionable recommendations to improve user acquisition, vendor onboarding, and revenue.", gradient: ["#EC4899", "#DB2777"] },
];

const PulsingDot = () => {
  const opacity = useRef(new RNAnimated.Value(0.3)).current;
  useEffect(() => {
    const anim = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        RNAnimated.timing(opacity, { toValue: 0.3, duration: 600, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);
  return (
    <View style={{ flexDirection: "row", gap: 4, paddingVertical: 4, paddingHorizontal: 2 }}>
      {[0, 1, 2].map((i) => (
        <RNAnimated.View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary, opacity }} />
      ))}
    </View>
  );
};

export default function AIAgentScreen() {
  const insets = useSafeAreaInsets();
  const { orders, vendorApplications, reels, adminCoupons, bannedUsers, teamMembers, adRequests, communityPosts, reviews, customerStories, dealBookings, leads } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const flatListRef = useRef<FlatList>(null);
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const getPlatformData = useCallback(() => ({
    orders: orders.map(o => ({ id: o.id, status: o.status, totalAmount: o.totalAmount, vendorName: o.vendorName, createdAt: o.createdAt, deliveredAt: o.deliveredAt, vendorCategoryId: o.vendorCategoryId })),
    vendors: vendors.map(v => ({ id: v.id, name: v.name, categoryId: v.categoryId, isOpen: v.isOpen, rating: v.rating })),
    vendorApplications: vendorApplications.map(a => ({ id: a.id, businessName: a.businessName, ownerName: a.ownerName, category: a.category, status: a.status, phone: a.phone, submittedAt: a.submittedAt })),
    reels: reels.map(r => ({ id: r.id, userRole: r.userRole, likes: r.likes })),
    coupons: adminCoupons.map(c => ({ id: c.id, code: c.code, discountType: c.discountType, value: c.value, isActive: c.isActive, usedCount: c.usedCount })),
    bannedUsers: bannedUsers.map(b => ({ phone: b.phone, role: b.role, reason: b.reason, bannedAt: b.bannedAt })),
    teamMembers: teamMembers.map(t => ({ id: t.id, name: t.name, role: t.role, city: t.city, territory: t.territory, isActive: t.isActive })),
    adRequests: adRequests.map(a => ({ id: a.id, vendorName: a.vendorName, type: a.type, status: a.status, duration: a.duration })),
    communityPosts: communityPosts.map(p => ({ id: p.id, isHidden: p.isHidden, isPinned: p.isPinned })),
    customerStories: customerStories.map(s => ({ id: s.id, isFeatured: s.isFeatured, rating: s.rating })),
    dealBookings: dealBookings.map(d => ({ id: d.id, vendorName: d.vendorName, productName: d.productName, duration: d.duration, amount: d.amount, status: d.status, createdAt: d.createdAt })),
    reviews: reviews.map(r => ({ id: r.id, rating: r.rating })),
    leads: leads.map(l => ({ id: l.id, status: l.status })),
  }), [orders, vendorApplications, reels, adminCoupons, bannedUsers, teamMembers, adRequests, communityPosts, customerStories, dealBookings, reviews, leads]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    const userMsg: Message = { id: genId(), role: "user", content: text.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInputText("");
    setShowWelcome(false);
    setIsStreaming(true);
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}

    const assistantId = genId();
    const assistantMsg: Message = { id: assistantId, role: "assistant", content: "", timestamp: new Date(), toolExecutions: [] };
    setMessages(prev => [...prev, assistantMsg]);

    try {
      const allMessages = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));
      const platformData = getPlatformData();

      const response = await fetch(`${getApiBase()}/api/ai/admin-agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: allMessages, platformData }),
      });

      if (!response.ok) throw new Error("Failed to get response");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let accumulated = "";
      let toolExecs: ToolExecution[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") break;

            try {
              const parsed = JSON.parse(data);

              if (parsed.type === "tool_call") {
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
                toolExecs = [...toolExecs, { tool: parsed.tool, args: parsed.args, status: "running" }];
                setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, toolExecutions: [...toolExecs] } : m));
              } else if (parsed.type === "tool_result") {
                toolExecs = toolExecs.map(t => t.tool === parsed.tool && t.status === "running" ? { ...t, result: parsed.result, status: "done" as const } : t);
                setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, toolExecutions: [...toolExecs] } : m));
              } else if (parsed.type === "content" && parsed.content) {
                accumulated += parsed.content;
                setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: accumulated } : m));
              } else if (parsed.type === "error") {
                accumulated = parsed.content || "An error occurred.";
                setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: accumulated } : m));
              }
            } catch {}
          }
        }
      }
    } catch (error) {
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: "I encountered an issue processing your request. Please try again." } : m));
    } finally {
      setIsStreaming(false);
    }
  }, [messages, isStreaming, getPlatformData]);

  const clearChat = () => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
    setMessages([]);
    setShowWelcome(true);
  };

  const renderToolExecution = (tool: ToolExecution, index: number) => {
    const info = TOOL_LABELS[tool.tool] || { label: tool.tool, icon: "code-slash", color: Colors.textSecondary };
    return (
      <Animated.View key={`${tool.tool}_${index}`} entering={FadeInDown.duration(200).delay(index * 80)} style={[styles.toolCard, { borderLeftColor: info.color }]}>
        <View style={styles.toolHeader}>
          <View style={[styles.toolIconWrap, { backgroundColor: info.color + "15" }]}>
            <Ionicons name={info.icon as any} size={14} color={info.color} />
          </View>
          <Text style={[styles.toolLabel, { color: info.color }]}>{info.label}</Text>
          {tool.status === "running" ? (
            <ActivityIndicator size="small" color={info.color} />
          ) : (
            <Ionicons name="checkmark-circle" size={16} color="#10B981" />
          )}
        </View>
        {tool.args && Object.keys(tool.args).length > 0 && (
          <View style={styles.toolArgs}>
            {Object.entries(tool.args).map(([key, val]) => (
              <View key={key} style={styles.toolArgItem}>
                <Text style={styles.toolArgKey}>{key}:</Text>
                <Text style={styles.toolArgValue}>{String(val)}</Text>
              </View>
            ))}
          </View>
        )}
      </Animated.View>
    );
  };

  const formatContent = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <Text key={i} style={{ fontFamily: "Poppins_700Bold", color: Colors.secondary }}>{part.slice(2, -2)}</Text>;
      }
      return <Text key={i}>{part}</Text>;
    });
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isUser = item.role === "user";
    return (
      <Animated.View entering={FadeInDown.duration(250).delay(50)} style={[styles.msgRow, isUser && styles.msgRowUser]}>
        {!isUser && (
          <View style={styles.avatarAI}>
            <MaterialCommunityIcons name="robot-happy-outline" size={16} color="#FFF" />
          </View>
        )}
        <View style={{ flex: 1, maxWidth: isUser ? "80%" : "88%" }}>
          {!isUser && item.toolExecutions && item.toolExecutions.length > 0 && (
            <View style={styles.toolsContainer}>
              {item.toolExecutions.map((tool, i) => renderToolExecution(tool, i))}
            </View>
          )}
          <View style={[styles.msgBubble, isUser ? styles.msgBubbleUser : styles.msgBubbleAI]}>
            {!isUser && !item.content && isStreaming && (!item.toolExecutions || item.toolExecutions.length === 0) ? (
              <PulsingDot />
            ) : (
              <Text style={[styles.msgText, isUser && styles.msgTextUser]}>
                {isUser ? item.content : formatContent(item.content || "...")}
              </Text>
            )}
          </View>
          <Text style={[styles.msgTime, isUser && styles.msgTimeUser]}>
            {item.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </Text>
        </View>
        {isUser && (
          <View style={styles.avatarUser}>
            <Ionicons name="person" size={14} color="#FFF" />
          </View>
        )}
      </Animated.View>
    );
  };

  const renderWelcome = () => (
    <View style={styles.welcomeContainer}>
      <Animated.View entering={FadeIn.duration(500)} style={styles.welcomeHeader}>
        <LinearGradient colors={[Colors.primary + "20", "#8B5CF615"]} style={styles.welcomeIconWrap}>
          <MaterialCommunityIcons name="robot-happy-outline" size={44} color={Colors.primary} />
        </LinearGradient>
        <Text style={styles.welcomeTitle}>GO BHARAT AI Agent</Text>
        <Text style={styles.welcomeSub}>
          Your intelligent admin assistant. I can analyze data, manage vendors, send notifications, generate reports, and execute platform actions — all through natural conversation.
        </Text>
      </Animated.View>

      <View style={styles.capabilitiesRow}>
        <View style={styles.capBadge}>
          <Ionicons name="flash" size={12} color={Colors.primary} />
          <Text style={styles.capText}>Real-time Data</Text>
        </View>
        <View style={styles.capBadge}>
          <Ionicons name="construct" size={12} color="#8B5CF6" />
          <Text style={styles.capText}>Action Execution</Text>
        </View>
        <View style={styles.capBadge}>
          <Ionicons name="analytics" size={12} color="#10B981" />
          <Text style={styles.capText}>Smart Reports</Text>
        </View>
      </View>

      <Text style={styles.quickActionsLabel}>Quick Actions</Text>
      <FlatList
        data={QUICK_ACTIONS}
        keyExtractor={(_, i) => i.toString()}
        numColumns={2}
        scrollEnabled={true}
        contentContainerStyle={styles.quickActionsGrid}
        columnWrapperStyle={{ gap: 10 }}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.duration(300).delay(index * 60)} style={{ flex: 1 }}>
            <Pressable
              style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
              onPress={() => sendMessage(item.prompt)}
            >
              <LinearGradient colors={item.gradient} style={styles.quickActionIcon}>
                <Ionicons name={item.icon} size={20} color="#FFF" />
              </LinearGradient>
              <Text style={styles.quickActionLabel}>{item.label}</Text>
              <Ionicons name="arrow-forward-circle" size={16} color={Colors.textLight} />
            </Pressable>
          </Animated.View>
        )}
      />
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <LinearGradient colors={["#0B1E3D", "#142F5E"]} style={[styles.header, { paddingTop: topInset + 8 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </Pressable>
          <View style={styles.headerCenter}>
            <View style={styles.headerTitleRow}>
              <View style={styles.agentDot} />
              <Text style={styles.headerTitle}>AI Agent</Text>
            </View>
            <Text style={styles.headerSub}>Admin Control Center</Text>
          </View>
          <View style={styles.headerActions}>
            {messages.length > 0 && (
              <Pressable onPress={clearChat} hitSlop={12} style={styles.clearBtn}>
                <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
              </Pressable>
            )}
            <View style={styles.statusBadge}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>Online</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      {showWelcome && messages.length === 0 ? renderWelcome() : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          contentContainerStyle={[styles.messagesList, { paddingBottom: 12 }]}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!messages.length}
        />
      )}

      {isStreaming && (
        <View style={styles.streamingBar}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.streamingText}>Agent is working...</Text>
        </View>
      )}

      <View style={[styles.inputBar, { paddingBottom: Math.max(bottomInset, 8) + 4 }]}>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask anything or give a command..."
            placeholderTextColor={Colors.textLight}
            multiline
            maxLength={2000}
            editable={!isStreaming}
          />
          <Pressable
            style={[styles.sendBtn, (!inputText.trim() || isStreaming) && styles.sendBtnDisabled]}
            onPress={() => sendMessage(inputText)}
            disabled={!inputText.trim() || isStreaming}
          >
            <Ionicons name="arrow-up" size={20} color="#FFF" />
          </Pressable>
        </View>
        <Text style={styles.disclaimer}>AI Agent can access platform data and execute actions</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FB" },
  header: { paddingHorizontal: 16, paddingBottom: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerCenter: { flex: 1 },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  agentDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary, borderWidth: 2, borderColor: Colors.primary + "40" },
  headerTitle: { fontSize: 18, fontFamily: "Poppins_700Bold", color: "#FFF" },
  headerSub: { fontSize: 11, color: "rgba(255,255,255,0.6)", fontFamily: "Poppins_500Medium", marginTop: 1 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  clearBtn: { padding: 6, borderRadius: 8, backgroundColor: "rgba(255,107,107,0.15)" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(16,185,129,0.15)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#10B981" },
  statusText: { fontSize: 10, color: "#10B981", fontFamily: "Poppins_600SemiBold" },

  welcomeContainer: { flex: 1 },
  welcomeHeader: { alignItems: "center", paddingHorizontal: 30, paddingTop: 24, paddingBottom: 16 },
  welcomeIconWrap: { width: 88, height: 88, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  welcomeTitle: { fontSize: 22, fontFamily: "Poppins_700Bold", color: Colors.text, marginBottom: 8 },
  welcomeSub: { fontSize: 13, fontFamily: "Poppins_400Regular", color: Colors.textSecondary, textAlign: "center", lineHeight: 20 },

  capabilitiesRow: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 20, paddingHorizontal: 16 },
  capBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FFF", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.borderLight },
  capText: { fontSize: 11, fontFamily: "Poppins_500Medium", color: Colors.textSecondary },

  quickActionsLabel: { fontSize: 14, fontFamily: "Poppins_700Bold", color: Colors.text, marginHorizontal: 16, marginBottom: 10 },
  quickActionsGrid: { paddingHorizontal: 16, paddingBottom: 20 },
  quickAction: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#FFF", borderRadius: 14, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: Colors.borderLight,
  },
  quickActionIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  quickActionLabel: { flex: 1, fontSize: 13, fontFamily: "Poppins_600SemiBold", color: Colors.text },

  messagesList: { paddingHorizontal: 12, paddingTop: 12 },
  msgRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 16, gap: 8 },
  msgRowUser: { justifyContent: "flex-end" },
  avatarAI: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: Colors.secondary, alignItems: "center", justifyContent: "center", marginTop: 2,
  },
  avatarUser: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center", marginTop: 2,
  },

  toolsContainer: { marginBottom: 8, gap: 6 },
  toolCard: {
    backgroundColor: "#FFF", borderRadius: 10, padding: 10,
    borderLeftWidth: 3, borderWidth: 1, borderColor: Colors.borderLight,
  },
  toolHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  toolIconWrap: { width: 26, height: 26, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  toolLabel: { flex: 1, fontSize: 12, fontFamily: "Poppins_600SemiBold" },
  toolArgs: { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#F0F1F5", gap: 2 },
  toolArgItem: { flexDirection: "row", gap: 4 },
  toolArgKey: { fontSize: 10, fontFamily: "Poppins_500Medium", color: Colors.textLight },
  toolArgValue: { fontSize: 10, fontFamily: "Poppins_600SemiBold", color: Colors.textSecondary },

  msgBubble: { borderRadius: 16, padding: 12 },
  msgBubbleAI: {
    backgroundColor: "#FFF",
    borderBottomLeftRadius: 4, borderWidth: 1, borderColor: Colors.borderLight,
  },
  msgBubbleUser: {
    backgroundColor: Colors.secondary, borderBottomRightRadius: 4,
  },
  msgText: { fontSize: 14, lineHeight: 22, color: Colors.text, fontFamily: "Poppins_400Regular" },
  msgTextUser: { color: "#FFF" },
  msgTime: { fontSize: 9, color: Colors.textLight, marginTop: 3, fontFamily: "Poppins_400Regular" },
  msgTimeUser: { textAlign: "right" },

  streamingBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingVertical: 6,
    backgroundColor: Colors.primary + "08", borderTopWidth: 1, borderTopColor: Colors.primary + "15",
  },
  streamingText: { fontSize: 12, color: Colors.primary, fontFamily: "Poppins_500Medium" },

  inputBar: {
    paddingHorizontal: 12, paddingTop: 8,
    backgroundColor: "#FFF", borderTopWidth: 1, borderTopColor: Colors.borderLight,
  },
  inputContainer: {
    flexDirection: "row", alignItems: "flex-end", gap: 8,
    backgroundColor: "#F3F4F6", borderRadius: 20, paddingLeft: 16, paddingRight: 4, paddingVertical: 4,
  },
  textInput: {
    flex: 1, fontSize: 14, color: Colors.text, fontFamily: "Poppins_400Regular",
    maxHeight: 100, paddingVertical: Platform.OS === "ios" ? 8 : 6,
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center",
  },
  sendBtnDisabled: { backgroundColor: Colors.textLight },
  disclaimer: { fontSize: 9, fontFamily: "Poppins_400Regular", color: Colors.textLight, textAlign: "center", marginTop: 6 },
});
