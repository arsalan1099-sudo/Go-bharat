import React, { useState, useRef, useCallback } from "react";
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
} from "react-native";
import { fetch } from "expo/fetch";
import { router } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";

let _idCounter = 0;
const genId = () => `msg_${Date.now()}_${++_idCounter}`;

function getApiBase() {
  const host = process.env.EXPO_PUBLIC_DOMAIN;
  if (!host) return "";
  return `https://${host}`;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const QUICK_PROMPTS = [
  { icon: "rocket-outline" as const, label: "5-Year Growth Roadmap", prompt: "Create a detailed 5-year growth roadmap to achieve ₹40 trillion GMV. Break it down year by year with specific milestones, city expansion targets, vendor acquisition goals, and revenue projections." },
  { icon: "cash-outline" as const, label: "Revenue Strategy", prompt: "What revenue strategies should GO BHARAT adopt to scale from current ₹2.45L GMV to ₹40 trillion? Include commission optimization, subscription models, ad revenue, fintech opportunities, and unit economics." },
  { icon: "business-outline" as const, label: "Franchise Scaling", prompt: "Design a franchise expansion strategy for GO BHARAT. How many franchises do we need, what territories to target first, revenue sharing model, and training programs to scale across India?" },
  { icon: "people-outline" as const, label: "Vendor Acquisition", prompt: "Propose a vendor acquisition strategy to onboard 10 million+ vendors across India. Include outreach channels, onboarding process optimization, retention tactics, and city-wise rollout plan." },
  { icon: "trending-up-outline" as const, label: "Funding Roadmap", prompt: "Create a fundraising roadmap for GO BHARAT from current stage to IPO. Include funding rounds (Seed, Series A-E), valuation milestones, investor targets, and capital allocation strategy." },
  { icon: "globe-outline" as const, label: "Market Expansion", prompt: "Plan a market expansion strategy from Malegaon to pan-India coverage. Which cities/states to target first? What's the optimal expansion sequence considering logistics, demand, and competition?" },
];

export default function StrategyAIScreen() {
  const insets = useSafeAreaInsets();
  const { orders } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showPrompts, setShowPrompts] = useState(true);
  const flatListRef = useRef<FlatList>(null);
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const totalRevenue = orders.reduce((s, o) => s + o.totalAmount, 0);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    const userMsg: Message = {
      id: genId(),
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setShowPrompts(false);
    setIsStreaming(true);

    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}

    const assistantId = genId();
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const allMessages = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const context = {
        totalRevenue: totalRevenue + 245000,
        totalOrders: orders.length + 1842,
        activeUsers: 15420,
        activeVendors: 12,
        franchises: 3,
        commission: Math.round((totalRevenue + 245000) * 0.12),
      };

      const response = await fetch(`${getApiBase()}/api/ai/strategy-assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: allMessages, context }),
      });

      if (!response.ok) throw new Error("Failed to get response");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let accumulated = "";

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
              if (parsed.content) {
                accumulated += parsed.content;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: accumulated } : m
                  )
                );
              }
            } catch {}
          }
        }
      }
    } catch (error) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: "I apologize, but I'm unable to process your request right now. Please try again in a moment." }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  }, [messages, isStreaming, orders, totalRevenue]);

  const clearChat = () => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
    setMessages([]);
    setShowPrompts(true);
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === "user";
    return (
      <View style={[styles.msgRow, isUser && styles.msgRowUser]}>
        {!isUser && (
          <View style={styles.avatarAI}>
            <MaterialCommunityIcons name="robot-outline" size={18} color="#FFF" />
          </View>
        )}
        <View style={[styles.msgBubble, isUser ? styles.msgBubbleUser : styles.msgBubbleAI]}>
          <Text style={[styles.msgText, isUser && styles.msgTextUser]}>{item.content || "..."}</Text>
          <Text style={[styles.msgTime, isUser && styles.msgTimeUser]}>
            {item.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </Text>
        </View>
        {isUser && (
          <View style={styles.avatarUser}>
            <Ionicons name="person" size={16} color="#FFF" />
          </View>
        )}
      </View>
    );
  };

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
              <MaterialCommunityIcons name="robot-happy-outline" size={22} color={Colors.primary} />
              <Text style={styles.headerTitle}>AI Strategy Advisor</Text>
            </View>
            <Text style={styles.headerSub}>Goal: ₹40T GMV in 5 Years</Text>
          </View>
          {messages.length > 0 && (
            <Pressable onPress={clearChat} hitSlop={12} style={styles.clearBtn}>
              <Ionicons name="trash-outline" size={20} color="#FF6B6B" />
            </Pressable>
          )}
        </View>
      </LinearGradient>

      {showPrompts && messages.length === 0 ? (
        <View style={styles.promptsContainer}>
          <View style={styles.welcomeSection}>
            <View style={styles.welcomeIcon}>
              <MaterialCommunityIcons name="chart-timeline-variant-shimmer" size={48} color={Colors.primary} />
            </View>
            <Text style={styles.welcomeTitle}>AI Strategy Advisor</Text>
            <Text style={styles.welcomeDesc}>
              Your McKinsey-level AI consultant to help GO BHARAT achieve ₹40 Trillion GMV goal. Ask anything about growth, revenue, expansion, or operations.
            </Text>
          </View>

          <Text style={styles.promptsLabel}>Quick Strategy Topics</Text>
          <FlatList
            data={QUICK_PROMPTS}
            keyExtractor={(_, i) => i.toString()}
            scrollEnabled={true}
            contentContainerStyle={styles.promptsList}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [styles.promptCard, pressed && styles.promptCardPressed]}
                onPress={() => sendMessage(item.prompt)}
              >
                <View style={styles.promptIconWrap}>
                  <Ionicons name={item.icon} size={20} color={Colors.primary} />
                </View>
                <Text style={styles.promptLabel}>{item.label}</Text>
                <Ionicons name="arrow-forward" size={16} color={Colors.textLight} />
              </Pressable>
            )}
          />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
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
          <Text style={styles.streamingText}>AI is thinking...</Text>
        </View>
      )}

      <View style={[styles.inputBar, { paddingBottom: Math.max(bottomInset, 8) + 4 }]}>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask about growth strategy..."
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
            <Ionicons name="send" size={18} color="#FFF" />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 16, paddingBottom: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerCenter: { flex: 1 },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#FFF" },
  headerSub: { fontSize: 11, color: Colors.primary, fontWeight: "600", marginTop: 2 },
  clearBtn: { padding: 6, borderRadius: 8, backgroundColor: "rgba(255,107,107,0.15)" },
  welcomeSection: { alignItems: "center", paddingHorizontal: 30, paddingTop: 30, paddingBottom: 20 },
  welcomeIcon: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: Colors.primary + "15",
    alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  welcomeTitle: { fontSize: 22, fontWeight: "800", color: Colors.text, marginBottom: 8 },
  welcomeDesc: { fontSize: 13, color: Colors.textSecondary, textAlign: "center", lineHeight: 20 },
  promptsContainer: { flex: 1 },
  promptsLabel: { fontSize: 14, fontWeight: "700", color: Colors.text, marginHorizontal: 16, marginBottom: 10 },
  promptsList: { paddingHorizontal: 16, paddingBottom: 16 },
  promptCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#FFF", borderRadius: 14, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: Colors.borderLight,
  },
  promptCardPressed: { backgroundColor: Colors.primary + "08", borderColor: Colors.primary + "30" },
  promptIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.primary + "12", alignItems: "center", justifyContent: "center",
  },
  promptLabel: { flex: 1, fontSize: 14, fontWeight: "600", color: Colors.text },
  messagesList: { paddingHorizontal: 12, paddingTop: 12 },
  msgRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: 12, gap: 8 },
  msgRowUser: { justifyContent: "flex-end" },
  avatarAI: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.secondary, alignItems: "center", justifyContent: "center",
  },
  avatarUser: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center",
  },
  msgBubble: { maxWidth: "75%", borderRadius: 16, padding: 12 },
  msgBubbleAI: {
    backgroundColor: "#FFF", borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  msgBubbleUser: {
    backgroundColor: Colors.secondary, borderBottomRightRadius: 4,
  },
  msgText: { fontSize: 14, lineHeight: 21, color: Colors.text },
  msgTextUser: { color: "#FFF" },
  msgTime: { fontSize: 10, color: Colors.textLight, marginTop: 4, textAlign: "right" },
  msgTimeUser: { color: "rgba(255,255,255,0.6)" },
  streamingBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: Colors.primary + "08",
  },
  streamingText: { fontSize: 12, color: Colors.primary, fontWeight: "500" },
  inputBar: {
    paddingHorizontal: 12, paddingTop: 8,
    backgroundColor: "#FFF", borderTopWidth: 1, borderTopColor: Colors.borderLight,
  },
  inputContainer: {
    flexDirection: "row", alignItems: "flex-end", gap: 8,
    backgroundColor: Colors.background, borderRadius: 20, paddingLeft: 16, paddingRight: 4, paddingVertical: 4,
  },
  textInput: {
    flex: 1, fontSize: 14, color: Colors.text,
    maxHeight: 100, paddingVertical: Platform.OS === "ios" ? 8 : 6,
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center",
  },
  sendBtnDisabled: { backgroundColor: Colors.textLight },
});
