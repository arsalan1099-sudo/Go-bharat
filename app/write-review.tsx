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
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { products, vendors } from "@/lib/data";

const STAR_LABELS = ["", "Terrible", "Poor", "Average", "Good", "Excellent"];

export default function WriteReviewScreen() {
  const { productId, vendorId } = useLocalSearchParams<{ productId?: string; vendorId: string }>();
  const insets = useSafeAreaInsets();
  const { addReview, user } = useApp();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const product = productId ? products.find((p) => p.id === productId) : null;
  const vendor = vendors.find((v) => v.id === vendorId);

  if (!vendor) return null;

  const handlePickPhoto = async () => {
    if (photos.length >= 5) {
      Alert.alert("Limit Reached", "You can add up to 5 photos per review.");
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.7,
        allowsMultipleSelection: true,
        selectionLimit: 5 - photos.length,
      });
      if (!result.canceled && result.assets) {
        setPhotos((prev) => [...prev, ...result.assets.map((a) => a.uri)].slice(0, 5));
      }
    } catch {}
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (rating === 0) {
      Alert.alert("Rating Required", "Please select a star rating.");
      return;
    }
    if (comment.trim().length < 10) {
      Alert.alert("Review Too Short", "Please write at least 10 characters.");
      return;
    }
    setSubmitting(true);
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}

    addReview({
      userId: user?.id || "guest",
      userName: user?.name || "Guest User",
      productId: productId || undefined,
      vendorId: vendorId || vendor.id,
      rating,
      comment: comment.trim(),
      photos,
    });

    setTimeout(() => {
      setSubmitting(false);
      Alert.alert("Review Submitted", "Thank you for your review!", [
        { text: "OK", onPress: () => router.back() },
      ]);
    }, 600);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <Pressable style={styles.headerBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Write a Review</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120 + bottomInset }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.targetCard}>
          {product ? (
            <View style={styles.targetRow}>
              <Image source={{ uri: product.image }} style={styles.targetImage} contentFit="cover" accessibilityLabel={product.name} />
              <View style={styles.targetInfo}>
                <Text style={styles.targetName} numberOfLines={2}>{product.name}</Text>
                <Text style={styles.targetVendor}>from {vendor.name}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.targetRow}>
              <Image source={{ uri: vendor.image }} style={styles.targetImage} contentFit="cover" accessibilityLabel={vendor.name} />
              <View style={styles.targetInfo}>
                <Text style={styles.targetName} numberOfLines={2}>{vendor.name}</Text>
                <Text style={styles.targetVendor}>Store Review</Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.ratingSection}>
          <Text style={styles.sectionTitle}>Your Rating</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Pressable
                key={star}
                onPress={() => {
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                  setRating(star);
                }}
                style={styles.starBtn}
              >
                <Ionicons
                  name={star <= rating ? "star" : "star-outline"}
                  size={40}
                  color={star <= rating ? Colors.warning : Colors.border}
                />
              </Pressable>
            ))}
          </View>
          {rating > 0 && (
            <Text style={styles.ratingLabel}>{STAR_LABELS[rating]}</Text>
          )}
        </View>

        <View style={styles.commentSection}>
          <Text style={styles.sectionTitle}>Your Review</Text>
          <TextInput
            style={styles.commentInput}
            placeholder="Share your experience with this product or store..."
            placeholderTextColor={Colors.textLight}
            multiline
            numberOfLines={5}
            maxLength={500}
            value={comment}
            onChangeText={setComment}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{comment.length}/500</Text>
        </View>

        <View style={styles.photosSection}>
          <Text style={styles.sectionTitle}>Add Photos</Text>
          <Text style={styles.photoHint}>Up to 5 photos (optional)</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photosList}
          >
            {photos.map((uri, i) => (
              <View key={i} style={styles.photoThumb}>
                <Image source={{ uri }} style={styles.photoImage} contentFit="cover" accessibilityLabel="Review photo" />
                <Pressable style={styles.photoRemove} onPress={() => handleRemovePhoto(i)}>
                  <Ionicons name="close-circle" size={22} color={Colors.error} />
                </Pressable>
              </View>
            ))}
            {photos.length < 5 && (
              <Pressable style={styles.addPhotoBtn} onPress={handlePickPhoto}>
                <Ionicons name="camera-outline" size={28} color={Colors.primary} />
                <Text style={styles.addPhotoText}>Add</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: bottomInset + 10 }]}>
        <Pressable
          style={[styles.submitBtn, (rating === 0 || comment.trim().length < 10 || submitting) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={rating === 0 || comment.trim().length < 10 || submitting}
        >
          <Ionicons name="send" size={18} color="#FFF" />
          <Text style={styles.submitText}>{submitting ? "Submitting..." : "Submit Review"}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 17, color: Colors.secondary },
  targetCard: {
    margin: 16,
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  targetRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  targetImage: { width: 64, height: 64, borderRadius: 12 },
  targetInfo: { flex: 1 },
  targetName: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.text },
  targetVendor: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  ratingSection: { marginHorizontal: 16, marginTop: 8, alignItems: "center" },
  sectionTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.secondary, alignSelf: "flex-start", marginBottom: 12 },
  starsRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  starBtn: { padding: 4 },
  ratingLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: Colors.warning,
    marginTop: 4,
  },
  commentSection: { marginHorizontal: 16, marginTop: 24 },
  commentInput: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 16,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.text,
    minHeight: 120,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  charCount: { fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight, textAlign: "right", marginTop: 6 },
  photosSection: { marginHorizontal: 16, marginTop: 24 },
  photoHint: { fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textSecondary, marginBottom: 12 },
  photosList: { gap: 10 },
  photoThumb: { position: "relative" },
  photoImage: { width: 90, height: 90, borderRadius: 12 },
  photoRemove: { position: "absolute", top: -6, right: -6, backgroundColor: "#FFF", borderRadius: 12 },
  addPhotoBtn: {
    width: 90,
    height: 90,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.primary + "40",
    borderStyle: "dashed" as any,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary + "08",
  },
  addPhotoText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.primary, marginTop: 4 },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFF",
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 8,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 16,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtnDisabled: { backgroundColor: Colors.textLight },
  submitText: { fontFamily: "Poppins_600SemiBold", fontSize: 16, color: "#FFF" },
});
