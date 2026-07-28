import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
  Alert,
  KeyboardAvoidingView,
} from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { vendors } from "@/lib/data";

export default function SubmitStoryScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const { user, addCustomerStory } = useApp();

  const [title, setTitle] = useState("");
  const [story, setStory] = useState("");
  const [rating, setRating] = useState(5);
  const [photos, setPhotos] = useState<string[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [showVendorPicker, setShowVendorPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const vendor = selectedVendor ? vendors.find((v) => v.id === selectedVendor) : null;

  const pickImage = async () => {
    if (photos.length >= 4) {
      Alert.alert("Limit Reached", "You can add up to 4 photos");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotos((prev) => [...prev, result.assets[0].uri]);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!title.trim()) {
      Alert.alert("Missing Title", "Please add a title for your story");
      return;
    }
    if (!story.trim()) {
      Alert.alert("Missing Story", "Please write your experience");
      return;
    }
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    setSubmitting(true);

    setTimeout(() => {
      addCustomerStory({
        userId: user?.id || "guest",
        userName: user?.name || "Go Bharat User",
        location: "Malegaon",
        rating,
        title: title.trim(),
        story: story.trim(),
        photos,
        vendorId: selectedVendor || undefined,
        vendorName: vendor?.name,
        productName: productName.trim() || undefined,
      });
      setSubmitting(false);
      Alert.alert(
        "Story Submitted!",
        "Thank you for sharing your experience. Your story will appear on the home page.",
        [{ text: "OK", onPress: () => router.back() }]
      );
    }, 800);
  };

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Share Your Story</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 100 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <Ionicons name="chatbubble-ellipses" size={28} color={Colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>Tell us about your experience!</Text>
              <Text style={styles.heroSub}>Your story helps others discover great services in Malegaon</Text>
            </View>
          </View>

          <Text style={styles.label}>Rating</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((s) => (
              <Pressable key={s} onPress={() => { setRating(s); try { Haptics.selectionAsync(); } catch {} }}>
                <Ionicons name={s <= rating ? "star" : "star-outline"} size={32} color="#F59E0B" />
              </Pressable>
            ))}
            <Text style={styles.ratingLabel}>
              {rating === 5 ? "Excellent!" : rating === 4 ? "Very Good" : rating === 3 ? "Good" : rating === 2 ? "Fair" : "Poor"}
            </Text>
          </View>

          <Text style={styles.label}>Title *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Best biryani in town!"
            placeholderTextColor="#B0B5BC"
            value={title}
            onChangeText={setTitle}
            maxLength={60}
          />
          <Text style={styles.charCount}>{title.length}/60</Text>

          <Text style={styles.label}>Your Experience *</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Share what made your experience special..."
            placeholderTextColor="#B0B5BC"
            value={story}
            onChangeText={setStory}
            multiline
            numberOfLines={5}
            maxLength={300}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{story.length}/300</Text>

          <Text style={styles.label}>Photos (optional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            <View style={styles.photosRow}>
              {photos.map((photo, i) => (
                <View key={i} style={styles.photoThumb}>
                  <Image source={{ uri: photo }} style={styles.photoImage} contentFit="cover" accessibilityLabel="Story photo" />
                  <Pressable style={styles.photoRemove} onPress={() => removePhoto(i)}>
                    <Ionicons name="close-circle" size={20} color="#EF4444" />
                  </Pressable>
                </View>
              ))}
              {photos.length < 4 && (
                <Pressable style={styles.addPhotoBtn} onPress={pickImage}>
                  <Ionicons name="camera-outline" size={24} color={Colors.primary} />
                  <Text style={styles.addPhotoText}>Add Photo</Text>
                </Pressable>
              )}
            </View>
          </ScrollView>

          <Text style={styles.label}>Store (optional)</Text>
          <Pressable style={styles.vendorPicker} onPress={() => setShowVendorPicker(!showVendorPicker)}>
            <Ionicons name="storefront-outline" size={18} color={vendor ? Colors.primary : Colors.textSecondary} />
            <Text style={[styles.vendorPickerText, vendor && { color: Colors.text }]}>
              {vendor ? vendor.name : "Select a store you visited"}
            </Text>
            <Ionicons name={showVendorPicker ? "chevron-up" : "chevron-down"} size={16} color={Colors.textSecondary} />
          </Pressable>

          {showVendorPicker && (
            <View style={styles.vendorList}>
              <Pressable
                style={[styles.vendorOption, !selectedVendor && styles.vendorOptionActive]}
                onPress={() => { setSelectedVendor(null); setShowVendorPicker(false); }}
              >
                <Text style={styles.vendorOptionText}>None</Text>
              </Pressable>
              {vendors.map((v) => (
                <Pressable
                  key={v.id}
                  style={[styles.vendorOption, selectedVendor === v.id && styles.vendorOptionActive]}
                  onPress={() => {
                    setSelectedVendor(v.id);
                    setShowVendorPicker(false);
                    try { Haptics.selectionAsync(); } catch {}
                  }}
                >
                  <Text style={[styles.vendorOptionText, selectedVendor === v.id && { color: Colors.primary }]}>{v.name}</Text>
                  {selectedVendor === v.id && <Ionicons name="checkmark" size={16} color={Colors.primary} />}
                </Pressable>
              ))}
            </View>
          )}

          {vendor && (
            <>
              <Text style={[styles.label, { marginTop: 12 }]}>Product/Service Name (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Chicken Biryani, Kurta Set..."
                placeholderTextColor="#B0B5BC"
                value={productName}
                onChangeText={setProductName}
                maxLength={40}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.bottomBar, { paddingBottom: bottomInset + 8 }]}>
        <Pressable
          style={[styles.submitBtn, (!title.trim() || !story.trim()) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!title.trim() || !story.trim() || submitting}
        >
          <LinearGradient
            colors={title.trim() && story.trim() ? ["#FF6B00", "#FF8A33"] : ["#FFD4B0", "#FFD4B0"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.submitGradient}
          >
            {submitting ? (
              <Text style={styles.submitText}>Submitting...</Text>
            ) : (
              <>
                <Ionicons name="send" size={18} color="#FFF" />
                <Text style={styles.submitText}>Submit Your Story</Text>
              </>
            )}
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FB" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#F5F5F5", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.secondary },
  content: { padding: 16 },
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.primary + "0A",
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.primary + "20",
  },
  heroTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.text },
  heroSub: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  label: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text, marginBottom: 8 },
  starsRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 20 },
  ratingLabel: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.primary, marginLeft: 8 },
  input: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1,
    borderColor: "#E8E8E8",
  },
  textArea: { height: 120, textAlignVertical: "top" },
  charCount: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight, textAlign: "right", marginTop: 4, marginBottom: 12 },
  photosRow: { flexDirection: "row", gap: 10 },
  photoThumb: { width: 90, height: 90, borderRadius: 12, overflow: "hidden", position: "relative" },
  photoImage: { width: "100%", height: "100%" },
  photoRemove: { position: "absolute", top: 4, right: 4 },
  addPhotoBtn: {
    width: 90,
    height: 90,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.primary + "30",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: Colors.primary + "05",
  },
  addPhotoText: { fontFamily: "Poppins_500Medium", fontSize: 10, color: Colors.primary },
  vendorPicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFF",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#E8E8E8",
  },
  vendorPickerText: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.textLight },
  vendorList: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    maxHeight: 200,
  },
  vendorOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F5F5F5",
  },
  vendorOptionActive: { backgroundColor: Colors.primary + "08" },
  vendorOptionText: { fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.text },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFF",
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  submitBtn: { borderRadius: 14, overflow: "hidden" },
  submitBtnDisabled: { opacity: 0.7 },
  submitGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, gap: 8 },
  submitText: { fontFamily: "Poppins_700Bold", fontSize: 16, color: "#FFF" },
});
