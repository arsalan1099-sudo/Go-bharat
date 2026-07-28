import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Linking,
  Alert,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Crypto from "expo-crypto";
import Colors from "@/constants/colors";

interface Message {
  id: string;
  text: string;
  sender: "user" | "vendor";
  timestamp: Date;
}

const REPLY_MAP: { keywords: string[]; replies: string[] }[] = [
  {
    keywords: ["price", "cost", "rate", "kitna", "kitne", "kya price", "how much", "charges", "fees"],
    replies: [
      "Prices vary by product. Please check the product page for exact pricing, or tell me which item you're interested in!",
      "Our prices are very competitive. Which product would you like to know the price of?",
      "We offer the best prices in the area. Please share the product name for exact pricing.",
    ],
  },
  {
    keywords: ["delivery", "deliver", "shipping", "ship", "kab milega", "time", "how long", "kitna time"],
    replies: [
      "Delivery usually takes 30-60 minutes for nearby areas. Free delivery on orders above ₹500!",
      "We deliver within 1 hour in Malegaon city. For outside areas, it takes 1-2 hours.",
      "Express delivery available! Most orders reach within 45 minutes. Free delivery above ₹500.",
    ],
  },
  {
    keywords: ["bulk", "wholesale", "quantity", "large order", "jyada", "bahut"],
    replies: [
      "Bulk orders get 15-20% discount. Please share the quantity you need and we'll give you the best rate!",
      "Yes, we offer special bulk pricing! Orders above 50 units get flat 20% off. Share your requirements.",
      "Great choice! For bulk orders, we provide extra discount + free delivery. How much quantity do you need?",
    ],
  },
  {
    keywords: ["available", "stock", "hai kya", "milega", "in stock"],
    replies: [
      "Yes, this item is currently available and in stock! Would you like to place an order?",
      "Available! We have fresh stock ready. Shall I add it to your cart?",
      "Yes, it's available. We update our stock daily to ensure fresh availability.",
    ],
  },
  {
    keywords: ["payment", "pay", "upi", "card", "cash", "cod", "online"],
    replies: [
      "We accept all payment methods - UPI (GPay, PhonePe, Paytm), Cards, Net Banking, and Cash on Delivery!",
      "Payment is easy! You can pay via UPI, Card, or Cash on Delivery. Whatever suits you best.",
    ],
  },
  {
    keywords: ["open", "timing", "hours", "time kya", "kab band", "kab khulta"],
    replies: [
      "Our store timings are 9 AM to 9 PM, Monday to Saturday. Sunday: 10 AM to 6 PM.",
      "We're open 9 AM - 9 PM (Mon-Sat). Feel free to visit or order anytime!",
    ],
  },
  {
    keywords: ["return", "refund", "exchange", "wapas", "badal"],
    replies: [
      "We have a hassle-free 7-day return policy. If you're not satisfied, we'll exchange or refund immediately.",
      "Returns are accepted within 7 days with original packaging. Refund processed within 2-3 business days.",
    ],
  },
  {
    keywords: ["offer", "discount", "coupon", "deal", "sale"],
    replies: [
      "We have exciting offers running! Check our Daily Deals section for the latest discounts up to 40% off.",
      "Use code GOBHARAT10 for 10% off on your first order! Plus, free delivery above ₹500.",
    ],
  },
  {
    keywords: ["hello", "hi", "hey", "namaste", "namaskar"],
    replies: [
      "Namaste! Welcome to our store. How can I help you today?",
      "Hello! Thank you for reaching out. What are you looking for?",
    ],
  },
  {
    keywords: ["thank", "thanks", "dhanyavad", "shukriya"],
    replies: [
      "You're welcome! Feel free to reach out anytime. Happy shopping!",
      "Thank you for choosing us! We're always here to help.",
    ],
  },
];

const DEFAULT_REPLIES = [
  "Thank you for your message! Let me help you with that. Could you share more details?",
  "I'd be happy to assist you. Can you tell me more about what you're looking for?",
  "Sure! Let me check that for you. Is there anything specific you'd like to know?",
  "Great question! Please give me a moment and I'll get you the best answer.",
];

function getSmartReply(userMessage: string): string {
  const lower = userMessage.toLowerCase();
  for (const entry of REPLY_MAP) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return entry.replies[Math.floor(Math.random() * entry.replies.length)];
    }
  }
  return DEFAULT_REPLIES[Math.floor(Math.random() * DEFAULT_REPLIES.length)];
}

const QUICK_ACTIONS = [
  "What's the price?",
  "Delivery time?",
  "Bulk order?",
];

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function VendorChatScreen() {
  const { vendorId, vendorName, vendorPhone } = useLocalSearchParams<{
    vendorId: string;
    vendorName: string;
    vendorPhone: string;
  }>();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const userMessage: Message = {
        id: Crypto.randomUUID(),
        text: text.trim(),
        sender: "user",
        timestamp: new Date(),
      };

      setMessages((prev) => [userMessage, ...prev]);
      setInputText("");

      setIsTyping(true);
      const delay = 1000 + Math.random() * 1000;
      setTimeout(() => {
        const vendorMessage: Message = {
          id: Crypto.randomUUID(),
          text: getSmartReply(text),
          sender: "vendor",
          timestamp: new Date(),
        };
        setIsTyping(false);
        setMessages((prev) => [vendorMessage, ...prev]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }, delay);
    },
    []
  );

  const handleSend = useCallback(() => {
    sendMessage(inputText);
  }, [inputText, sendMessage]);

  const handleQuickAction = useCallback(
    (action: string) => {
      sendMessage(action);
    },
    [sendMessage]
  );

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => {
      const isUser = item.sender === "user";
      return (
        <View
          style={[
            styles.messageBubbleContainer,
            isUser ? styles.userBubbleContainer : styles.vendorBubbleContainer,
          ]}
        >
          <View
            style={[
              styles.messageBubble,
              isUser ? styles.userBubble : styles.vendorBubble,
            ]}
          >
            <Text
              style={[
                styles.messageText,
                isUser ? styles.userMessageText : styles.vendorMessageText,
              ]}
            >
              {item.text}
            </Text>
            <Text
              style={[
                styles.timestamp,
                isUser ? styles.userTimestamp : styles.vendorTimestamp,
              ]}
            >
              {formatTime(item.timestamp)}
            </Text>
          </View>
        </View>
      );
    },
    []
  );

  const renderEmptyState = useCallback(() => {
    return (
      <View style={styles.emptyState}>
        <Ionicons
          name="chatbubbles-outline"
          size={64}
          color={Colors.textLight}
        />
        <Text style={styles.emptyStateText}>
          Start a conversation with {vendorName || "Vendor"}
        </Text>
      </View>
    );
  }, [vendorName]);

  const renderTypingIndicator = useCallback(() => {
    if (!isTyping) return null;
    return (
      <View style={[styles.messageBubbleContainer, styles.vendorBubbleContainer]}>
        <View style={[styles.messageBubble, styles.vendorBubble, styles.typingBubble]}>
          <Text style={styles.typingText}>typing...</Text>
        </View>
      </View>
    );
  }, [isTyping]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          testID="chat-back-button"
        >
          <Ionicons name="chevron-back" size={28} color={Colors.white} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <View style={styles.headerNameRow}>
            <Text style={styles.headerName} numberOfLines={1}>
              {vendorName || "Vendor"}
            </Text>
            <View style={styles.onlineIndicator} />
          </View>
          <Text style={styles.headerStatus}>Online</Text>
        </View>
        <TouchableOpacity
          style={styles.headerAction}
          onPress={() => {
            const phone = (vendorPhone || "").replace(/\D/g, "");
            if (!phone) {
              Alert.alert("Unavailable", "This vendor has not shared a phone number.");
              return;
            }
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
            Linking.openURL(`tel:${phone}`);
          }}
        >
          <Ionicons name="call-outline" size={22} color={Colors.white} />
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        inverted
        style={styles.messageList}
        contentContainerStyle={[
          styles.messageListContent,
          messages.length === 0 && styles.emptyListContent,
        ]}
        ListEmptyComponent={renderEmptyState}
        ListHeaderComponent={renderTypingIndicator}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />

      <View style={[styles.bottomContainer, { paddingBottom: bottomInset + 4 }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.quickActionsScroll}
          contentContainerStyle={styles.quickActionsContent}
          keyboardShouldPersistTaps="handled"
        >
          {QUICK_ACTIONS.map((action) => (
            <TouchableOpacity
              key={action}
              style={styles.quickActionChip}
              onPress={() => handleQuickAction(action)}
              testID={`quick-action-${action}`}
            >
              <Text style={styles.quickActionText}>{action}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Type a message..."
            placeholderTextColor={Colors.textLight}
            multiline
            maxLength={500}
            testID="chat-input"
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              !inputText.trim() && styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={!inputText.trim()}
            testID="chat-send-button"
          >
            <Ionicons
              name="send"
              size={20}
              color={inputText.trim() ? Colors.white : Colors.textLight}
            />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    backgroundColor: Colors.secondary,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 14,
    gap: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerInfo: {
    flex: 1,
  },
  headerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 17,
    color: Colors.white,
    flexShrink: 1,
  },
  onlineIndicator: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: Colors.success,
    borderWidth: 1.5,
    borderColor: Colors.white,
  },
  headerStatus: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
    marginTop: -2,
  },
  headerAction: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  emptyListContent: {
    flex: 1,
    justifyContent: "center",
  },
  messageBubbleContainer: {
    marginVertical: 3,
    maxWidth: "80%",
  },
  userBubbleContainer: {
    alignSelf: "flex-end",
  },
  vendorBubbleContainer: {
    alignSelf: "flex-start",
  },
  messageBubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  userBubble: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  vendorBubble: {
    backgroundColor: Colors.surfaceAlt,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    lineHeight: 21,
  },
  userMessageText: {
    color: Colors.white,
  },
  vendorMessageText: {
    color: Colors.text,
  },
  timestamp: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
    marginTop: 4,
  },
  userTimestamp: {
    color: "rgba(255,255,255,0.7)",
    textAlign: "right",
  },
  vendorTimestamp: {
    color: Colors.textLight,
  },
  typingBubble: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  typingText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    fontStyle: "italic",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    transform: [{ scaleY: -1 }],
  },
  emptyStateText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  bottomContainer: {
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 6,
  },
  quickActionsScroll: {
    maxHeight: 44,
  },
  quickActionsContent: {
    paddingHorizontal: 14,
    gap: 8,
    alignItems: "center",
  },
  quickActionChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: "rgba(255,107,0,0.06)",
  },
  quickActionText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: Colors.primary,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 10,
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    color: Colors.text,
    maxHeight: 100,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    backgroundColor: Colors.surfaceAlt,
  },
});
