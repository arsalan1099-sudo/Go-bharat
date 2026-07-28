import React, { useState, useRef, useCallback } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, FlatList, Platform, KeyboardAvoidingView, ActivityIndicator, Modal, ScrollView, Alert } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { fetch } from "expo/fetch";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { useApp } from "@/lib/store";
import { products as allProducts } from "@/lib/data";
import { moderateImage } from "@/lib/moderateImage";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUri?: string;
  generatedAdImage?: string;
}

const QUICK_PROMPTS = [
  "Write a description for my product",
  "Suggest pricing for Indian market",
  "Help me create a new listing",
  "Improve my product titles",
];

const AD_STYLES = [
  { label: "Modern", value: "modern promotional" },
  { label: "Festival Sale", value: "Indian festival sale with decorative elements" },
  { label: "Minimalist", value: "minimalist clean" },
  { label: "Bold & Vibrant", value: "bold vibrant colorful" },
  { label: "Premium", value: "luxury premium elegant" },
];

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}>
      {!isUser && (
        <View style={styles.aiAvatar}>
          <Ionicons name="sparkles" size={14} color="#FFF" />
        </View>
      )}
      <View style={[styles.messageContent, isUser ? styles.userContent : styles.assistantContent]}>
        {message.imageUri && (
          <Image source={{ uri: message.imageUri }} style={styles.chatImage} contentFit="cover" accessibilityLabel="Uploaded image" />
        )}
        {message.generatedAdImage && (
          <Image source={{ uri: `data:image/png;base64,${message.generatedAdImage}` }} style={styles.generatedAdImage} contentFit="contain" accessibilityLabel="AI generated advertisement" />
        )}
        <Text style={[styles.messageText, isUser ? styles.userText : styles.assistantText]}>
          {message.content}
        </Text>
      </View>
    </View>
  );
}

export default function AIAssistantScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isGeneratingAd, setIsGeneratingAd] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [showAdModal, setShowAdModal] = useState(false);
  const [adImage, setAdImage] = useState<string | null>(null);
  const [adImageBase64, setAdImageBase64] = useState<string | null>(null);
  const [adProductName, setAdProductName] = useState("");
  const [adProductPrice, setAdProductPrice] = useState("");
  const [adProductDesc, setAdProductDesc] = useState("");
  const [adStyle, setAdStyle] = useState("modern promotional");

  const vendorProducts = allProducts.filter(
    (p) => p.vendorId === (user?.id || "v2") || p.vendorId === "v2"
  );

  const [isCheckingImage, setIsCheckingImage] = useState(false);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });

    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      try {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        setIsCheckingImage(true);
        const modResult = await moderateImage(base64);
        setIsCheckingImage(false);
        if (!modResult.safe) {
          Alert.alert(
            "Content Restricted",
            modResult.reason || "This image contains inappropriate content. Please choose a different image."
          );
          return;
        }
        setAdImage(uri);
        setAdImageBase64(base64);
      } catch {
        setIsCheckingImage(false);
        setAdImage(uri);
        setAdImageBase64(null);
      }
    }
  };

  const generateAd = async () => {
    if (!adImageBase64) {
      Alert.alert("No Image", "Please select a product photo first");
      return;
    }

    setShowAdModal(false);
    setIsGeneratingAd(true);

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: `Generate a professional ad for: ${adProductName || "My Product"} - ${adProductPrice ? "₹" + adProductPrice : ""}`,
      imageUri: adImage || undefined,
    };
    setMessages((prev) => [...prev, userMsg]);

    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [...prev, {
      id: assistantId,
      role: "assistant",
      content: "Creating your professional advertisement...",
    }]);

    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/ai/generate-ad", baseUrl);

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: adImageBase64,
          productName: adProductName,
          productPrice: adProductPrice,
          productDescription: adProductDesc,
          style: adStyle,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error((errData as any).error || `Server error ${response.status}`);
      }
      const data = await response.json();

      if (data.image) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: "Here's your professional advertisement! You can save it and use it on social media, WhatsApp, or your online store.", generatedAdImage: data.image }
              : m
          )
        );
      } else {
        throw new Error(data.error || "Failed to generate");
      }
    } catch (error) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: "Sorry, I couldn't generate the ad image. Please try again with a different photo." }
            : m
        )
      );
    } finally {
      setIsGeneratingAd(false);
      setAdImage(null);
      setAdImageBase64(null);
      setAdProductName("");
      setAdProductPrice("");
      setAdProductDesc("");
      setAdStyle("modern promotional");
    }
  };

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: text.trim(),
    };

    const currentMessages = [...messages, userMessage];
    setMessages(currentMessages);
    setInputText("");
    setIsStreaming(true);

    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/ai/product-assistant", baseUrl);

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: currentMessages.map((m) => ({ role: m.role, content: m.content })),
          products: vendorProducts.map((p) => ({
            name: p.name,
            price: p.price,
            category: p.category,
            isAvailable: p.isAvailable,
          })),
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error((errData as any).error || `Server error ${response.status}`);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.done) break;
              if (data.error) {
                fullContent += "\n[Error occurred]";
                break;
              }
              if (data.content) {
                fullContent += data.content;
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantId ? { ...m, content: fullContent } : m))
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
            ? { ...m, content: "Sorry, I couldn't process your request. Please check your connection and try again." }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  }, [messages, isStreaming, vendorProducts]);

  const renderItem = useCallback(({ item }: { item: ChatMessage }) => (
    <MessageBubble message={item} />
  ), []);

  const isBusy = isStreaming || isGeneratingAd;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.secondary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={styles.headerIcon}>
            <Ionicons name="sparkles" size={16} color="#FFF" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Go Bharat AI</Text>
            <Text style={styles.headerSubtitle}>{vendorProducts.length} products loaded</Text>
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {messages.length === 0 ? (
        <ScrollView contentContainerStyle={styles.emptyState} showsVerticalScrollIndicator={false}>
          <View style={styles.emptyIcon}>
            <Ionicons name="sparkles" size={40} color={Colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Go Bharat AI</Text>
          <Text style={styles.emptySubtitle}>
            I can help you write descriptions, suggest pricing, and optimize your product listings
          </Text>

          <Pressable style={styles.adBannerBtn} onPress={() => setShowAdModal(true)}>
            <View style={styles.adBannerIcon}>
              <Ionicons name="image" size={22} color="#FFF" />
            </View>
            <View style={styles.adBannerTextWrap}>
              <Text style={styles.adBannerTitle}>Create Ad from Photo</Text>
              <Text style={styles.adBannerDesc}>Upload a product photo and AI will design a professional ad</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
          </Pressable>

          <View style={styles.quickPrompts}>
            {QUICK_PROMPTS.map((prompt, i) => (
              <Pressable
                key={i}
                style={styles.quickPromptBtn}
                onPress={() => sendMessage(prompt)}
              >
                <Ionicons name="chatbubble-outline" size={14} color={Colors.primary} />
                <Text style={styles.quickPromptText}>{prompt}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
        />
      )}

      <View style={[styles.inputContainer, { paddingBottom: bottomInset + 8 }]}>
        <View style={styles.inputRow}>
          <Pressable
            style={styles.attachBtn}
            onPress={() => setShowAdModal(true)}
            disabled={isBusy}
          >
            <Ionicons name="image-outline" size={22} color={isBusy ? Colors.textLight : Colors.primary} />
          </Pressable>
          <TextInput
            style={styles.input}
            placeholder="Ask about product listings..."
            placeholderTextColor={Colors.textLight}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
            editable={!isBusy}
            onSubmitEditing={() => sendMessage(inputText)}
          />
          <Pressable
            style={[styles.sendBtn, (!inputText.trim() || isBusy) && styles.sendBtnDisabled]}
            onPress={() => sendMessage(inputText)}
            disabled={!inputText.trim() || isBusy}
          >
            {isBusy ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="send" size={18} color="#FFF" />
            )}
          </Pressable>
        </View>
      </View>

      <Modal visible={showAdModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Ad from Photo</Text>
              <Pressable onPress={() => setShowAdModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Pressable style={styles.imagePickerBtn} onPress={pickImage} disabled={isCheckingImage}>
                {isCheckingImage ? (
                  <View style={styles.imagePickerPlaceholder}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                    <Text style={styles.imagePickerText}>Checking content safety...</Text>
                  </View>
                ) : adImage ? (
                  <Image source={{ uri: adImage }} style={styles.pickedImage} contentFit="cover" accessibilityLabel="Selected advertisement image" />
                ) : (
                  <View style={styles.imagePickerPlaceholder}>
                    <Ionicons name="camera" size={32} color={Colors.primary} />
                    <Text style={styles.imagePickerText}>Tap to select product photo</Text>
                  </View>
                )}
              </Pressable>

              <Text style={styles.fieldLabel}>Product Name</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="e.g. Organic Turmeric Powder"
                placeholderTextColor={Colors.textLight}
                value={adProductName}
                onChangeText={setAdProductName}
              />

              <Text style={styles.fieldLabel}>Price (optional)</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="e.g. 299"
                placeholderTextColor={Colors.textLight}
                value={adProductPrice}
                onChangeText={setAdProductPrice}
                keyboardType="numeric"
              />

              <Text style={styles.fieldLabel}>Short Description (optional)</Text>
              <TextInput
                style={[styles.fieldInput, { minHeight: 60, textAlignVertical: "top" as const }]}
                placeholder="e.g. 100% natural, farm fresh"
                placeholderTextColor={Colors.textLight}
                value={adProductDesc}
                onChangeText={setAdProductDesc}
                multiline
              />

              <Text style={styles.fieldLabel}>Ad Style</Text>
              <View style={styles.styleRow}>
                {AD_STYLES.map((s) => (
                  <Pressable
                    key={s.value}
                    style={[styles.styleChip, adStyle === s.value && styles.styleChipActive]}
                    onPress={() => setAdStyle(s.value)}
                  >
                    <Text style={[styles.styleChipText, adStyle === s.value && styles.styleChipTextActive]}>
                      {s.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                style={[styles.generateBtn, !adImageBase64 && styles.generateBtnDisabled]}
                onPress={generateAd}
                disabled={!adImageBase64}
              >
                <Ionicons name="sparkles" size={18} color="#FFF" />
                <Text style={styles.generateBtnText}>Generate Ad</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: "#FFF",
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "flex-end",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.secondary },
  headerSubtitle: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary },
  emptyState: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 40,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Colors.primary + "14",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: Colors.secondary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  adBannerBtn: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: Colors.primary + "30",
    gap: 12,
  },
  adBannerIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  adBannerTextWrap: { flex: 1 },
  adBannerTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text },
  adBannerDesc: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  quickPrompts: { width: "100%", gap: 10 },
  quickPromptBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFF",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickPromptText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: Colors.text,
    flex: 1,
  },
  messagesList: { padding: 16, paddingBottom: 8 },
  messageBubble: {
    flexDirection: "row",
    marginBottom: 12,
    alignItems: "flex-start",
    gap: 8,
  },
  userBubble: { justifyContent: "flex-end" },
  assistantBubble: { justifyContent: "flex-start" },
  aiAvatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  messageContent: {
    maxWidth: "78%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  userContent: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
    marginLeft: "auto",
  },
  assistantContent: {
    backgroundColor: "#FFF",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  messageText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    lineHeight: 20,
  },
  userText: { color: "#FFF" },
  assistantText: { color: Colors.text },
  chatImage: {
    width: 180,
    height: 180,
    borderRadius: 12,
    marginBottom: 8,
  },
  generatedAdImage: {
    width: 260,
    height: 260,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: Colors.background,
  },
  inputContainer: {
    backgroundColor: "#FFF",
    paddingTop: 10,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
  },
  attachBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.text,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.5 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.text },
  imagePickerBtn: {
    width: "100%",
    height: 200,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: "dashed",
  },
  pickedImage: { width: "100%", height: "100%" },
  imagePickerPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
    gap: 8,
  },
  imagePickerText: { fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textSecondary },
  fieldLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: Colors.text,
    marginBottom: 6,
    marginTop: 10,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 12,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.text,
  },
  styleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  styleChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "#FFF",
  },
  styleChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  styleChipText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: Colors.text,
  },
  styleChipTextActive: { color: "#FFF" },
  generateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    padding: 16,
    marginTop: 20,
    marginBottom: 20,
  },
  generateBtnDisabled: { opacity: 0.5 },
  generateBtnText: { fontFamily: "Poppins_700Bold", fontSize: 16, color: "#FFF" },
});
