import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  Image,
  TouchableOpacity,
  Platform,
  Pressable,
  ScrollView,
  Modal,
  Linking,
  Share,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
} from "react-native";
import { Ionicons, MaterialCommunityIcons, FontAwesome5, FontAwesome } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Video, ResizeMode } from "expo-av";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { Reel, TaggedProduct, ReelComment } from "@/lib/types";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const isWeb = Platform.OS === "web";

function formatCount(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toString();
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function ProductCard({ product, onAddToCart }: { product: TaggedProduct; onAddToCart: (p: TaggedProduct) => void }) {
  return (
    <TouchableOpacity style={styles.productCard} onPress={() => onAddToCart(product)} activeOpacity={0.85}>
      <Image source={{ uri: product.productImage }} style={styles.productImage} accessibilityLabel={product.productName} />
      <View style={styles.productInfo}>
        <Text style={styles.productName} numberOfLines={1}>{product.productName}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.productPrice}>₹{product.price}</Text>
          {product.originalPrice && (
            <Text style={styles.originalPrice}>₹{product.originalPrice}</Text>
          )}
        </View>
        <Text style={styles.productVendor} numberOfLines={1}>{product.vendorName}</Text>
      </View>
      <View style={styles.addBtn}>
        <Ionicons name="cart" size={16} color="#FFF" />
      </View>
    </TouchableOpacity>
  );
}

function ReelItem({ reel, onLike, onAddToCart, onViewStore, onComment, comments, isActive }: {
  reel: Reel;
  onLike: (id: string) => void;
  onAddToCart: (p: TaggedProduct) => void;
  onViewStore: (vendorId: string) => void;
  onComment: (reelId: string, text: string) => void;
  comments: ReelComment[];
  isActive: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [showProducts, setShowProducts] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [videoLoaded, setVideoLoaded] = useState(false);
  const videoRef = useRef<Video>(null);

  const shareText = `Check out this reel by ${reel.userName} on GO BHARAT! "${reel.caption}"`;
  const shareUrl = "https://gobharat.in";

  const handleShare = async (platform: string) => {
    try { Haptics.selectionAsync(); } catch {}
    const message = `${shareText}\n${shareUrl}`;
    const encodedMessage = encodeURIComponent(message);
    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedText = encodeURIComponent(shareText);

    let url = "";
    switch (platform) {
      case "whatsapp":
        url = `whatsapp://send?text=${encodedMessage}`;
        break;
      case "instagram":
        url = "instagram://app";
        break;
      case "facebook":
        url = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`;
        break;
      case "twitter":
        url = `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`;
        break;
      case "telegram":
        url = `tg://msg_url?url=${encodedUrl}&text=${encodedText}`;
        break;
      case "tiktok":
        url = "https://www.tiktok.com";
        break;
      case "native":
        try {
          await Share.share({ message, title: "Share Reel" });
        } catch {}
        setShowShareSheet(false);
        return;
      case "copy":
        Alert.alert("Link Copied", "Reel link has been copied to clipboard!");
        setShowShareSheet(false);
        return;
    }

    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else if (platform === "instagram") {
        await Linking.openURL("https://instagram.com");
      } else {
        await Linking.openURL(url);
      }
    } catch {
      Alert.alert("Unavailable", `Could not open ${platform}. Please make sure the app is installed.`);
    }
    setShowShareSheet(false);
  };

  const handleSubmitComment = () => {
    if (!commentText.trim()) return;
    try { Haptics.selectionAsync(); } catch {}
    onComment(reel.id, commentText.trim());
    setCommentText("");
  };

  useEffect(() => {
    if (videoRef.current) {
      if (isActive && reel.videoUrl) {
        videoRef.current.playAsync();
      } else {
        videoRef.current.pauseAsync();
      }
    }
  }, [isActive, reel.videoUrl]);

  const topInset = isWeb ? 67 : insets.top;
  const bottomInset = isWeb ? 34 : insets.bottom;

  const reelComments = comments.filter((c) => c.reelId === reel.id);

  return (
    <View style={[styles.reelContainer, { height: SCREEN_HEIGHT }]}>
      <Image source={{ uri: reel.thumbnail }} style={styles.reelBackground} blurRadius={20} accessibilityLabel={reel.caption} />

      {reel.videoUrl ? (
        <>
          {!videoLoaded && (
            <View style={styles.videoLoading}>
              <Image source={{ uri: reel.thumbnail }} style={styles.reelImage} resizeMode="cover" accessibilityLabel={reel.caption} />
              <ActivityIndicator size="large" color={Colors.primary} style={styles.loadingSpinner} />
            </View>
          )}
          <Video
            ref={videoRef}
            source={{ uri: reel.videoUrl }}
            style={styles.reelImage}
            resizeMode={ResizeMode.COVER}
            shouldPlay={isActive}
            isLooping
            isMuted={false}
            onLoad={() => setVideoLoaded(true)}
          />
        </>
      ) : (
        <Image source={{ uri: reel.thumbnail }} style={styles.reelImage} resizeMode="cover" accessibilityLabel={reel.caption} />
      )}

      <LinearGradient
        colors={["rgba(0,0,0,0.3)", "transparent", "transparent", "rgba(0,0,0,0.7)"]}
        locations={[0, 0.2, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.sideActions, { bottom: 140 + bottomInset }]}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{reel.userName[0]}</Text>
          </View>
          {reel.userRole === "VENDOR" && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark" size={8} color="#FFF" />
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.actionBtn} onPress={() => onLike(reel.id)}>
          <Ionicons
            name={reel.isLiked ? "heart" : "heart-outline"}
            size={30}
            color={reel.isLiked ? "#FF4458" : "#FFF"}
          />
          <Text style={styles.actionText}>{formatCount(reel.likes)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={() => { try { Haptics.selectionAsync(); } catch {} setShowComments(true); }}>
          <Ionicons name="chatbubble-outline" size={27} color="#FFF" />
          <Text style={styles.actionText}>{formatCount(reel.comments)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={() => { try { Haptics.selectionAsync(); } catch {} setShowShareSheet(true); }}>
          <Ionicons name="paper-plane-outline" size={26} color="#FFF" />
          <Text style={styles.actionText}>{formatCount(reel.shares)}</Text>
        </TouchableOpacity>

        {reel.taggedProducts.length > 0 && (
          <TouchableOpacity style={styles.actionBtn} onPress={() => setShowProducts(!showProducts)}>
            <Ionicons name="pricetag" size={24} color={Colors.primary} />
            <Text style={[styles.actionText, { color: Colors.primary }]}>
              {reel.taggedProducts.length}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={[styles.bottomContent, { paddingBottom: 100 + bottomInset }]}>
        <View style={styles.userRow}>
          <Text style={styles.userName}>{reel.userName}</Text>
          {reel.userRole === "VENDOR" && (
            <View style={styles.vendorBadge}>
              <Ionicons name="storefront" size={10} color="#FFF" />
              <Text style={styles.vendorBadgeText}>Vendor</Text>
            </View>
          )}
          <Text style={styles.timeText}>{timeAgo(reel.createdAt)}</Text>
        </View>

        <Pressable onPress={() => setCaptionExpanded(!captionExpanded)}>
          <Text style={styles.caption} numberOfLines={captionExpanded ? undefined : 2}>
            {reel.caption}
          </Text>
        </Pressable>

        {reel.vendorId && (
          <TouchableOpacity style={styles.visitStore} onPress={() => onViewStore(reel.vendorId!)}>
            <Ionicons name="storefront-outline" size={14} color="#FFF" />
            <Text style={styles.visitStoreText}>Visit Store</Text>
            <Ionicons name="chevron-forward" size={14} color="#FFF" />
          </TouchableOpacity>
        )}

        {reel.taggedProducts.length > 0 && !showProducts && (
          <TouchableOpacity style={styles.productPeek} onPress={() => setShowProducts(true)}>
            <Image source={{ uri: reel.taggedProducts[0].productImage }} style={styles.peekImage} accessibilityLabel={reel.taggedProducts[0].productName} />
            <View style={styles.peekInfo}>
              <Text style={styles.peekName} numberOfLines={1}>{reel.taggedProducts[0].productName}</Text>
              <Text style={styles.peekPrice}>₹{reel.taggedProducts[0].price}</Text>
            </View>
            {reel.taggedProducts.length > 1 && (
              <View style={styles.peekMore}>
                <Text style={styles.peekMoreText}>+{reel.taggedProducts.length - 1}</Text>
              </View>
            )}
            <Ionicons name="chevron-up" size={18} color="#FFF" />
          </TouchableOpacity>
        )}
      </View>

      {showProducts && (
        <Pressable style={styles.productsOverlay} onPress={() => setShowProducts(false)}>
          <Pressable style={styles.productsSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Tagged Products</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productsScroll}>
              {reel.taggedProducts.map((p) => (
                <ProductCard key={p.productId} product={p} onAddToCart={onAddToCart} />
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      )}

      {showShareSheet && (
        <Pressable style={styles.productsOverlay} onPress={() => setShowShareSheet(false)}>
          <Pressable style={styles.shareSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Share to Social Media</Text>
            <Text style={styles.shareCaption} numberOfLines={2}>{reel.caption}</Text>
            <View style={styles.shareGrid}>
              <TouchableOpacity style={styles.shareItem} onPress={() => handleShare("whatsapp")}>
                <View style={[styles.shareIconCircle, { backgroundColor: "#25D366" }]}>
                  <Ionicons name="logo-whatsapp" size={24} color="#FFF" />
                </View>
                <Text style={styles.shareLabel}>WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareItem} onPress={() => handleShare("instagram")}>
                <LinearGradient colors={["#F58529", "#DD2A7B", "#8134AF"]} style={styles.shareIconCircle}>
                  <Ionicons name="logo-instagram" size={24} color="#FFF" />
                </LinearGradient>
                <Text style={styles.shareLabel}>Instagram</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareItem} onPress={() => handleShare("facebook")}>
                <View style={[styles.shareIconCircle, { backgroundColor: "#1877F2" }]}>
                  <FontAwesome5 name="facebook-f" size={22} color="#FFF" />
                </View>
                <Text style={styles.shareLabel}>Facebook</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareItem} onPress={() => handleShare("twitter")}>
                <View style={[styles.shareIconCircle, { backgroundColor: "#000" }]}>
                  <FontAwesome5 name="twitter" size={22} color="#FFF" />
                </View>
                <Text style={styles.shareLabel}>X (Twitter)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareItem} onPress={() => handleShare("telegram")}>
                <View style={[styles.shareIconCircle, { backgroundColor: "#0088CC" }]}>
                  <FontAwesome5 name="telegram-plane" size={22} color="#FFF" />
                </View>
                <Text style={styles.shareLabel}>Telegram</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareItem} onPress={() => handleShare("tiktok")}>
                <View style={[styles.shareIconCircle, { backgroundColor: "#000" }]}>
                  <Ionicons name="musical-notes" size={22} color="#FFF" />
                </View>
                <Text style={styles.shareLabel}>TikTok</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareItem} onPress={() => handleShare("copy")}>
                <View style={[styles.shareIconCircle, { backgroundColor: "#6B7280" }]}>
                  <Ionicons name="copy-outline" size={22} color="#FFF" />
                </View>
                <Text style={styles.shareLabel}>Copy Link</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.shareMoreBtn} onPress={() => handleShare("native")}>
              <Ionicons name="share-outline" size={20} color="#FFF" />
              <Text style={styles.shareMoreText}>More Options</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      )}

      {showComments && (
        <Pressable style={styles.productsOverlay} onPress={() => setShowComments(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ justifyContent: "flex-end", flex: 1 }}>
            <Pressable style={styles.commentsSheet} onPress={(e) => e.stopPropagation()}>
              <View style={styles.sheetHandle} />
              <View style={styles.commentsHeader}>
                <Text style={styles.sheetTitle}>Comments ({reel.comments})</Text>
                <Pressable onPress={() => setShowComments(false)}>
                  <Ionicons name="close" size={22} color="rgba(255,255,255,0.6)" />
                </Pressable>
              </View>

              <ScrollView style={styles.commentsList} showsVerticalScrollIndicator={false}>
                {reelComments.length === 0 ? (
                  <View style={styles.noComments}>
                    <Ionicons name="chatbubble-ellipses-outline" size={40} color="rgba(255,255,255,0.2)" />
                    <Text style={styles.noCommentsText}>No comments yet</Text>
                    <Text style={styles.noCommentsSub}>Be the first to comment!</Text>
                  </View>
                ) : (
                  reelComments.map((c) => (
                    <View key={c.id} style={styles.commentItem}>
                      <View style={styles.commentAvatar}>
                        <Text style={styles.commentAvatarText}>{c.userName[0]}</Text>
                      </View>
                      <View style={styles.commentBody}>
                        <View style={styles.commentNameRow}>
                          <Text style={styles.commentName}>{c.userName}</Text>
                          <Text style={styles.commentTime}>{timeAgo(c.createdAt)}</Text>
                        </View>
                        <Text style={styles.commentTextStyle}>{c.text}</Text>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>

              <View style={styles.commentInputRow}>
                <TextInput
                  style={styles.commentInput}
                  value={commentText}
                  onChangeText={setCommentText}
                  placeholder="Add a comment..."
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  maxLength={200}
                  returnKeyType="send"
                  onSubmitEditing={handleSubmitComment}
                />
                <TouchableOpacity
                  style={[styles.commentSendBtn, !commentText.trim() && { opacity: 0.4 }]}
                  onPress={handleSubmitComment}
                  disabled={!commentText.trim()}
                >
                  <Ionicons name="send" size={18} color="#FFF" />
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      )}
    </View>
  );
}

export default function CustomerReelsScreen() {
  const { reels, toggleReelLike, addToCart, reelComments, addReelComment } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const topInset = isWeb ? 67 : insets.top;

  const handleLike = useCallback((reelId: string) => {
    toggleReelLike(reelId);
  }, [toggleReelLike]);

  const handleAddToCart = useCallback((product: TaggedProduct) => {
    addToCart({
      product: {
        id: product.productId,
        vendorId: product.vendorId,
        name: product.productName,
        description: "",
        price: product.price,
        originalPrice: product.originalPrice,
        image: product.productImage,
        isAvailable: true,
        category: "",
      },
      quantity: 1,
      vendorId: product.vendorId,
      vendorName: product.vendorName,
    });
  }, [addToCart]);

  const handleViewStore = useCallback((vendorId: string) => {
    router.push(`/store/${vendorId}`);
  }, [router]);

  const handleComment = useCallback((reelId: string, text: string) => {
    addReelComment(reelId, text);
  }, [addReelComment]);

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setActiveIndex(viewableItems[0].index ?? 0);
    }
  }).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const renderItem = useCallback(({ item, index }: { item: Reel; index: number }) => (
    <ReelItem
      reel={item}
      onLike={handleLike}
      onAddToCart={handleAddToCart}
      onViewStore={handleViewStore}
      onComment={handleComment}
      comments={reelComments}
      isActive={index === activeIndex}
    />
  ), [handleLike, handleAddToCart, handleViewStore, handleComment, reelComments, activeIndex]);

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={reels}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={SCREEN_HEIGHT}
        decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: SCREEN_HEIGHT,
          offset: SCREEN_HEIGHT * index,
          index,
        })}
      />

      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <Text style={styles.headerTitle}>Reels</Text>
        <TouchableOpacity style={styles.cameraBtn} onPress={() => router.push("/upload-reel")}>
          <Ionicons name="camera-outline" size={26} color="#FFF" />
        </TouchableOpacity>
      </View>

      <View style={[styles.progressContainer, { top: topInset + 48 }]}>
        {reels.map((_, i) => (
          <View
            key={i}
            style={[styles.progressDot, i === activeIndex && styles.progressDotActive]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    zIndex: 10,
  },
  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    color: "#FFF",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  cameraBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  progressContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 4,
    zIndex: 10,
  },
  progressDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  progressDotActive: {
    backgroundColor: Colors.primary,
    width: 18,
    borderRadius: 3,
  },
  reelContainer: {
    width: SCREEN_WIDTH,
    backgroundColor: "#000",
    position: "relative",
  },
  reelBackground: {
    ...StyleSheet.absoluteFillObject,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  reelImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    position: "absolute",
  },
  sideActions: {
    position: "absolute",
    right: 12,
    alignItems: "center",
    gap: 18,
    zIndex: 5,
  },
  avatarContainer: {
    marginBottom: 8,
    position: "relative",
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFF",
  },
  avatarText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: "#FFF",
  },
  verifiedBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#FFF",
  },
  actionBtn: {
    alignItems: "center",
    gap: 2,
  },
  actionText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: "#FFF",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  bottomContent: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 60,
    paddingHorizontal: 16,
    zIndex: 5,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  userName: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    color: "#FFF",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  vendorBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(255,107,0,0.8)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  vendorBadgeText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 9,
    color: "#FFF",
  },
  timeText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
  },
  caption: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "#FFF",
    lineHeight: 19,
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    marginBottom: 8,
  },
  visitStore: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  visitStoreText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: "#FFF",
  },
  productPeek: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 12,
    padding: 8,
    gap: 10,
    backdropFilter: "blur(10px)",
  },
  peekImage: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  peekInfo: {
    flex: 1,
  },
  peekName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: "#FFF",
  },
  peekPrice: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: Colors.primary,
  },
  peekMore: {
    backgroundColor: "rgba(255,107,0,0.8)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  peekMoreText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    color: "#FFF",
  },
  productsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
    zIndex: 20,
  },
  productsSheet: {
    backgroundColor: Colors.secondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    paddingBottom: 32,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
    alignSelf: "center",
    marginBottom: 16,
  },
  sheetTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: "#FFF",
    marginBottom: 12,
  },
  productsScroll: {
    gap: 12,
    paddingRight: 12,
  },
  productCard: {
    width: 150,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    overflow: "hidden",
  },
  productImage: {
    width: 150,
    height: 120,
  },
  productInfo: {
    padding: 10,
    gap: 2,
  },
  productName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: "#FFF",
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  productPrice: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    color: Colors.primary,
  },
  originalPrice: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.5)",
    textDecorationLine: "line-through",
  },
  productVendor: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
    color: "rgba(255,255,255,0.6)",
  },
  addBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  shareSheet: {
    backgroundColor: Colors.secondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
  },
  shareCaption: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
    marginBottom: 20,
    lineHeight: 18,
  },
  shareGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 16,
    paddingHorizontal: 8,
  },
  shareItem: {
    alignItems: "center",
    width: "28%",
    gap: 8,
  },
  shareIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  shareLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
  },
  shareMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  shareMoreText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "#FFF",
  },
  videoLoading: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  loadingSpinner: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginLeft: -18,
    marginTop: -18,
  },
  commentsSheet: {
    backgroundColor: Colors.secondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    paddingBottom: 12,
    maxHeight: SCREEN_HEIGHT * 0.55,
  },
  commentsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  commentsList: {
    flex: 1,
    marginBottom: 12,
  },
  noComments: {
    alignItems: "center",
    paddingVertical: 30,
    gap: 6,
  },
  noCommentsText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: "rgba(255,255,255,0.5)",
  },
  noCommentsSub: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.3)",
  },
  commentItem: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  commentAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  commentAvatarText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    color: "#FFF",
  },
  commentBody: {
    flex: 1,
  },
  commentNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  commentName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: "#FFF",
  },
  commentTime: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
    color: "rgba(255,255,255,0.4)",
  },
  commentTextStyle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
    marginTop: 2,
    lineHeight: 18,
  },
  commentInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 8 : 4,
  },
  commentInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "#FFF",
  },
  commentSendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
