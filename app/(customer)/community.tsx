import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  TextInput,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Alert,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Share,
} from "react-native";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Video, ResizeMode } from "expo-av";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { CommunityPost, CommunityComment, Reel, TaggedProduct, ReelComment } from "@/lib/types";
import { hapticSelection, hapticLight, hapticMedium, hapticSuccess } from "@/lib/haptics";
import PressableScale from "@/components/PressableScale";

const { width, height: SCREEN_HEIGHT } = Dimensions.get("window");
const SCREEN_WIDTH = width;
const isWeb = Platform.OS === "web";

const POST_TYPES = ["All", "UPDATE", "OFFER", "REVIEW", "QUESTION", "ANNOUNCEMENT"] as const;
const POST_TYPE_LABELS: Record<string, string> = {
  All: "All",
  UPDATE: "Updates",
  OFFER: "Offers",
  REVIEW: "Reviews",
  QUESTION: "Questions",
  ANNOUNCEMENT: "News",
};
const POST_TYPE_ICONS: Record<string, string> = {
  UPDATE: "information-circle",
  OFFER: "pricetag",
  REVIEW: "star",
  QUESTION: "help-circle",
  ANNOUNCEMENT: "megaphone",
};
const POST_TYPE_COLORS: Record<string, string> = {
  UPDATE: "#3B82F6",
  OFFER: "#10B981",
  REVIEW: "#F59E0B",
  QUESTION: "#8B5CF6",
  ANNOUNCEMENT: "#EF4444",
};

function formatCount(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toString();
}

function formatTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function ProductCard({ product, onAddToCart }: { product: TaggedProduct; onAddToCart: (p: TaggedProduct) => void }) {
  return (
    <PressableScale haptic="medium" style={reelStyles.productCard} onPress={() => onAddToCart(product)}>
      <Image source={{ uri: product.productImage }} style={reelStyles.productImage} accessibilityLabel={product.productName} />
      <View style={reelStyles.productInfo}>
        <Text style={reelStyles.productName} numberOfLines={1}>{product.productName}</Text>
        <View style={reelStyles.priceRow}>
          <Text style={reelStyles.productPrice}>₹{product.price}</Text>
          {product.originalPrice && (
            <Text style={reelStyles.originalPrice}>₹{product.originalPrice}</Text>
          )}
        </View>
        <Text style={reelStyles.productVendor} numberOfLines={1}>{product.vendorName}</Text>
      </View>
      <View style={reelStyles.addBtn}>
        <Ionicons name="cart" size={16} color="#FFF" />
      </View>
    </PressableScale>
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
    hapticSelection();
    const message = `${shareText}\n${shareUrl}`;
    const encodedMessage = encodeURIComponent(message);
    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedText = encodeURIComponent(shareText);

    let url = "";
    switch (platform) {
      case "whatsapp": url = `whatsapp://send?text=${encodedMessage}`; break;
      case "instagram": url = "instagram://app"; break;
      case "facebook": url = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`; break;
      case "twitter": url = `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`; break;
      case "telegram": url = `tg://msg_url?url=${encodedUrl}&text=${encodedText}`; break;
      case "tiktok": url = "https://www.tiktok.com"; break;
      case "native":
        try { await Share.share({ message, title: "Share Reel" }); } catch {}
        setShowShareSheet(false);
        return;
      case "copy":
        Alert.alert("Link Copied", "Reel link has been copied to clipboard!");
        setShowShareSheet(false);
        return;
    }
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) { await Linking.openURL(url); }
      else if (platform === "instagram") { await Linking.openURL("https://instagram.com"); }
      else { await Linking.openURL(url); }
    } catch {
      Alert.alert("Unavailable", `Could not open ${platform}. Please make sure the app is installed.`);
    }
    setShowShareSheet(false);
  };

  const handleSubmitComment = () => {
    if (!commentText.trim()) return;
    hapticSelection();
    onComment(reel.id, commentText.trim());
    setCommentText("");
  };

  useEffect(() => {
    if (videoRef.current) {
      if (isActive && reel.videoUrl) { videoRef.current.playAsync(); }
      else { videoRef.current.pauseAsync(); }
    }
  }, [isActive, reel.videoUrl]);

  const topInset = isWeb ? 67 : insets.top;
  const bottomInset = isWeb ? 34 : insets.bottom;
  const reelComments = comments.filter((c) => c.reelId === reel.id);

  return (
    <View style={[reelStyles.reelContainer, { height: SCREEN_HEIGHT }]}>
      <Image source={{ uri: reel.thumbnail }} style={reelStyles.reelBackground} blurRadius={20} accessibilityLabel={reel.caption} />

      {reel.videoUrl ? (
        <>
          {!videoLoaded && (
            <View style={reelStyles.videoLoading}>
              <Image source={{ uri: reel.thumbnail }} style={reelStyles.reelImage} resizeMode="cover" accessibilityLabel={reel.caption} />
              <ActivityIndicator size="large" color={Colors.primary} style={reelStyles.loadingSpinner} />
            </View>
          )}
          <Video
            ref={videoRef}
            source={{ uri: reel.videoUrl }}
            style={reelStyles.reelImage}
            resizeMode={ResizeMode.COVER}
            shouldPlay={isActive}
            isLooping
            isMuted={false}
            onLoad={() => setVideoLoaded(true)}
          />
        </>
      ) : (
        <Image source={{ uri: reel.thumbnail }} style={reelStyles.reelImage} resizeMode="cover" accessibilityLabel={reel.caption} />
      )}

      <LinearGradient
        colors={["rgba(0,0,0,0.3)", "transparent", "transparent", "rgba(0,0,0,0.7)"]}
        locations={[0, 0.2, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={[reelStyles.sideActions, { bottom: 140 + bottomInset }]}>
        <View style={reelStyles.avatarContainer}>
          <View style={reelStyles.avatarCircle}>
            <Text style={reelStyles.avatarText}>{reel.userName[0]}</Text>
          </View>
          {reel.userRole === "VENDOR" && (
            <View style={reelStyles.verifiedBadge}>
              <Ionicons name="checkmark" size={8} color="#FFF" />
            </View>
          )}
        </View>

        <PressableScale haptic="light" style={reelStyles.sideActionBtn} onPress={() => onLike(reel.id)}>
          <Ionicons name={reel.isLiked ? "heart" : "heart-outline"} size={30} color={reel.isLiked ? "#FF4458" : "#FFF"} />
          <Text style={reelStyles.actionText}>{formatCount(reel.likes)}</Text>
        </PressableScale>

        <PressableScale style={reelStyles.sideActionBtn} onPress={() => setShowComments(true)}>
          <Ionicons name="chatbubble-outline" size={27} color="#FFF" />
          <Text style={reelStyles.actionText}>{formatCount(reel.comments)}</Text>
        </PressableScale>

        <PressableScale style={reelStyles.sideActionBtn} onPress={() => setShowShareSheet(true)}>
          <Ionicons name="paper-plane-outline" size={26} color="#FFF" />
          <Text style={reelStyles.actionText}>{formatCount(reel.shares)}</Text>
        </PressableScale>

        {reel.taggedProducts.length > 0 && (
          <PressableScale style={reelStyles.sideActionBtn} onPress={() => setShowProducts(!showProducts)}>
            <Ionicons name="pricetag" size={24} color={Colors.primary} />
            <Text style={[reelStyles.actionText, { color: Colors.primary }]}>{reel.taggedProducts.length}</Text>
          </PressableScale>
        )}
      </View>

      <View style={[reelStyles.bottomContent, { paddingBottom: 100 + bottomInset }]}>
        <View style={reelStyles.userRow}>
          <Text style={reelStyles.userName}>{reel.userName}</Text>
          {reel.userRole === "VENDOR" && (
            <View style={reelStyles.vendorBadge}>
              <Ionicons name="storefront" size={10} color="#FFF" />
              <Text style={reelStyles.vendorBadgeText}>Vendor</Text>
            </View>
          )}
          <Text style={reelStyles.timeText}>{formatTime(reel.createdAt)}</Text>
        </View>

        <Pressable onPress={() => setCaptionExpanded(!captionExpanded)}>
          <Text style={reelStyles.caption} numberOfLines={captionExpanded ? undefined : 2}>{reel.caption}</Text>
        </Pressable>

        {reel.vendorId && (
          <PressableScale style={reelStyles.visitStore} onPress={() => onViewStore(reel.vendorId!)}>
            <Ionicons name="storefront-outline" size={14} color="#FFF" />
            <Text style={reelStyles.visitStoreText}>Visit Store</Text>
            <Ionicons name="chevron-forward" size={14} color="#FFF" />
          </PressableScale>
        )}

        {reel.taggedProducts.length > 0 && !showProducts && (
          <PressableScale style={reelStyles.productPeek} onPress={() => setShowProducts(true)}>
            <Image source={{ uri: reel.taggedProducts[0].productImage }} style={reelStyles.peekImage} accessibilityLabel={reel.taggedProducts[0].productName} />
            <View style={reelStyles.peekInfo}>
              <Text style={reelStyles.peekName} numberOfLines={1}>{reel.taggedProducts[0].productName}</Text>
              <Text style={reelStyles.peekPrice}>₹{reel.taggedProducts[0].price}</Text>
            </View>
            {reel.taggedProducts.length > 1 && (
              <View style={reelStyles.peekMore}>
                <Text style={reelStyles.peekMoreText}>+{reel.taggedProducts.length - 1}</Text>
              </View>
            )}
            <Ionicons name="chevron-up" size={18} color="#FFF" />
          </PressableScale>
        )}
      </View>

      {showProducts && (
        <Pressable style={reelStyles.productsOverlay} onPress={() => setShowProducts(false)}>
          <Pressable style={reelStyles.productsSheet} onPress={(e) => e.stopPropagation()}>
            <View style={reelStyles.sheetHandle} />
            <Text style={reelStyles.sheetTitle}>Tagged Products</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={reelStyles.productsScroll}>
              {reel.taggedProducts.map((p) => (
                <ProductCard key={p.productId} product={p} onAddToCart={onAddToCart} />
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      )}

      {showShareSheet && (
        <Pressable style={reelStyles.productsOverlay} onPress={() => setShowShareSheet(false)}>
          <Pressable style={reelStyles.shareSheet} onPress={(e) => e.stopPropagation()}>
            <View style={reelStyles.sheetHandle} />
            <Text style={reelStyles.sheetTitle}>Share to Social Media</Text>
            <Text style={reelStyles.shareCaption} numberOfLines={2}>{reel.caption}</Text>
            <View style={reelStyles.shareGrid}>
              <TouchableOpacity style={reelStyles.shareItem} onPress={() => handleShare("whatsapp")}>
                <View style={[reelStyles.shareIconCircle, { backgroundColor: "#25D366" }]}>
                  <Ionicons name="logo-whatsapp" size={24} color="#FFF" />
                </View>
                <Text style={reelStyles.shareLabel}>WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity style={reelStyles.shareItem} onPress={() => handleShare("instagram")}>
                <LinearGradient colors={["#F58529", "#DD2A7B", "#8134AF"]} style={reelStyles.shareIconCircle}>
                  <Ionicons name="logo-instagram" size={24} color="#FFF" />
                </LinearGradient>
                <Text style={reelStyles.shareLabel}>Instagram</Text>
              </TouchableOpacity>
              <TouchableOpacity style={reelStyles.shareItem} onPress={() => handleShare("facebook")}>
                <View style={[reelStyles.shareIconCircle, { backgroundColor: "#1877F2" }]}>
                  <FontAwesome5 name="facebook-f" size={22} color="#FFF" />
                </View>
                <Text style={reelStyles.shareLabel}>Facebook</Text>
              </TouchableOpacity>
              <TouchableOpacity style={reelStyles.shareItem} onPress={() => handleShare("twitter")}>
                <View style={[reelStyles.shareIconCircle, { backgroundColor: "#000" }]}>
                  <FontAwesome5 name="twitter" size={22} color="#FFF" />
                </View>
                <Text style={reelStyles.shareLabel}>X (Twitter)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={reelStyles.shareItem} onPress={() => handleShare("telegram")}>
                <View style={[reelStyles.shareIconCircle, { backgroundColor: "#0088CC" }]}>
                  <FontAwesome5 name="telegram-plane" size={22} color="#FFF" />
                </View>
                <Text style={reelStyles.shareLabel}>Telegram</Text>
              </TouchableOpacity>
              <TouchableOpacity style={reelStyles.shareItem} onPress={() => handleShare("tiktok")}>
                <View style={[reelStyles.shareIconCircle, { backgroundColor: "#000" }]}>
                  <Ionicons name="musical-notes" size={22} color="#FFF" />
                </View>
                <Text style={reelStyles.shareLabel}>TikTok</Text>
              </TouchableOpacity>
              <TouchableOpacity style={reelStyles.shareItem} onPress={() => handleShare("copy")}>
                <View style={[reelStyles.shareIconCircle, { backgroundColor: "#6B7280" }]}>
                  <Ionicons name="copy-outline" size={22} color="#FFF" />
                </View>
                <Text style={reelStyles.shareLabel}>Copy Link</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={reelStyles.shareMoreBtn} onPress={() => handleShare("native")}>
              <Ionicons name="share-outline" size={20} color="#FFF" />
              <Text style={reelStyles.shareMoreText}>More Options</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      )}

      {showComments && (
        <Pressable style={reelStyles.productsOverlay} onPress={() => setShowComments(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ justifyContent: "flex-end", flex: 1 }}>
            <Pressable style={reelStyles.commentsSheet} onPress={(e) => e.stopPropagation()}>
              <View style={reelStyles.sheetHandle} />
              <View style={reelStyles.commentsHeader}>
                <Text style={reelStyles.sheetTitle}>Comments ({reel.comments})</Text>
                <Pressable onPress={() => setShowComments(false)}>
                  <Ionicons name="close" size={22} color="rgba(255,255,255,0.6)" />
                </Pressable>
              </View>
              <ScrollView style={reelStyles.commentsList} showsVerticalScrollIndicator={false}>
                {reelComments.length === 0 ? (
                  <View style={reelStyles.noComments}>
                    <Ionicons name="chatbubble-ellipses-outline" size={40} color="rgba(255,255,255,0.2)" />
                    <Text style={reelStyles.noCommentsText}>No comments yet</Text>
                    <Text style={reelStyles.noCommentsSub}>Be the first to comment!</Text>
                  </View>
                ) : (
                  reelComments.map((c) => (
                    <View key={c.id} style={reelStyles.commentItem}>
                      <View style={reelStyles.commentAvatar}>
                        <Text style={reelStyles.commentAvatarText}>{c.userName[0]}</Text>
                      </View>
                      <View style={reelStyles.commentBody}>
                        <View style={reelStyles.commentNameRow}>
                          <Text style={reelStyles.commentName}>{c.userName}</Text>
                          <Text style={reelStyles.commentTime}>{formatTime(c.createdAt)}</Text>
                        </View>
                        <Text style={reelStyles.commentTextStyle}>{c.text}</Text>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
              <View style={reelStyles.commentInputRow}>
                <TextInput
                  style={reelStyles.commentInput}
                  value={commentText}
                  onChangeText={setCommentText}
                  placeholder="Add a comment..."
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  maxLength={200}
                  returnKeyType="send"
                  onSubmitEditing={handleSubmitComment}
                />
                <PressableScale
                  haptic="none"
                  style={[reelStyles.commentSendBtn, !commentText.trim() && { opacity: 0.4 }]}
                  onPress={handleSubmitComment}
                  disabled={!commentText.trim()}
                >
                  <Ionicons name="send" size={18} color="#FFF" />
                </PressableScale>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      )}
    </View>
  );
}

function ReelsView() {
  const { reels, toggleReelLike, addToCart, reelComments, addReelComment } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

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

  if (reels.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="videocam-outline" size={48} color="rgba(255,255,255,0.3)" />
        <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 15, color: "rgba(255,255,255,0.5)", marginTop: 12 }}>No reels yet</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
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
      <View style={[reelStyles.progressContainer, { top: (isWeb ? 67 : insets.top) + 56 }]}>
        {reels.map((_, i) => (
          <View key={i} style={[reelStyles.progressDot, i === activeIndex && reelStyles.progressDotActive]} />
        ))}
      </View>
    </View>
  );
}

export default function CommunityScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    user,
    communityPosts,
    communityComments,
    vendorFollows,
    reels,
    addCommunityPost,
    togglePostLike,
    addPostComment,
    followVendor,
    unfollowVendor,
    isFollowingVendor,
    setShowGuestLoginPrompt,
  } = useApp();

  useFocusEffect(
    useCallback(() => {
      if (user?.phone === "guest") {
        setShowGuestLoginPrompt(true);
        router.navigate("/(customer)/" as any);
      }
    }, [user?.phone])
  );

  const [activeTab, setActiveTab] = useState<"posts" | "reels">("reels");
  const [activeFilter, setActiveFilter] = useState<string>("All");
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [selectedPost, setSelectedPost] = useState<CommunityPost | null>(null);
  const [commentText, setCommentText] = useState("");
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [newPostContent, setNewPostContent] = useState("");
  const [newPostType, setNewPostType] = useState<CommunityPost["postType"]>("UPDATE");
  const [showFollowing, setShowFollowing] = useState(false);
  const [sharePostId, setSharePostId] = useState<string | null>(null);

  if (user?.phone === "guest") {
    return <View style={{ flex: 1, backgroundColor: "#FFF" }} />;
  }

  const topInset = isWeb ? 67 : insets.top;
  const bottomInset = isWeb ? 34 : insets.bottom;

  const visiblePosts = communityPosts.filter((p) => !p.isHidden);
  const sortedPosts = [...visiblePosts].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  const filteredPosts = activeFilter === "All"
    ? sortedPosts
    : sortedPosts.filter((p) => p.postType === activeFilter);

  const handleLike = (postId: string) => {
    hapticLight();
    togglePostLike(postId);
  };

  const handleComment = (post: CommunityPost) => {
    setSelectedPost(post);
    setShowCommentModal(true);
  };

  const submitComment = () => {
    if (!commentText.trim() || !selectedPost) return;
    addPostComment(selectedPost.id, commentText.trim());
    setCommentText("");
    hapticSuccess();
  };

  const handleSharePost = async (platform: string) => {
    const post = communityPosts.find((p) => p.id === sharePostId);
    if (!post) return;
    hapticSelection();
    const shareText = `Check out this post by ${post.userName} on GO BHARAT! "${post.content.slice(0, 100)}"`;
    const shareUrl = "https://gobharat.in";
    const message = `${shareText}\n${shareUrl}`;
    const encodedMessage = encodeURIComponent(message);
    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedText = encodeURIComponent(shareText);

    let url = "";
    switch (platform) {
      case "whatsapp": url = `whatsapp://send?text=${encodedMessage}`; break;
      case "instagram": url = "instagram://app"; break;
      case "facebook": url = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`; break;
      case "twitter": url = `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`; break;
      case "telegram": url = `tg://msg_url?url=${encodedUrl}&text=${encodedText}`; break;
      case "tiktok": url = "https://www.tiktok.com"; break;
      case "native":
        try { await Share.share({ message, title: "Share Post" }); } catch {}
        setSharePostId(null);
        return;
      case "copy":
        Alert.alert("Link Copied", "Post link has been copied to clipboard!");
        setSharePostId(null);
        return;
    }
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) { await Linking.openURL(url); }
      else if (platform === "instagram") { await Linking.openURL("https://instagram.com"); }
      else { await Linking.openURL(url); }
    } catch {
      Alert.alert("Unavailable", `Could not open ${platform}. Please make sure the app is installed.`);
    }
    setSharePostId(null);
  };

  const handleFollow = (vendorId: string, vendorName: string) => {
    hapticMedium();
    if (isFollowingVendor(vendorId)) {
      unfollowVendor(vendorId);
    } else {
      followVendor(vendorId, vendorName);
    }
  };

  const submitPost = () => {
    if (!newPostContent.trim()) return;
    addCommunityPost({
      userId: user?.id || "u1",
      userName: user?.name || "You",
      userRole: user?.role || "CUSTOMER",
      content: newPostContent.trim(),
      images: [],
      postType: newPostType,
    });
    setNewPostContent("");
    setShowCreatePost(false);
    hapticSuccess();
  };

  const postComments = selectedPost
    ? communityComments.filter((c) => c.postId === selectedPost.id)
    : [];

  const renderPostCard = ({ item }: { item: CommunityPost }) => {
    const isVendor = item.userRole === "VENDOR";
    const following = item.vendorId ? isFollowingVendor(item.vendorId) : false;

    return (
      <View style={{ backgroundColor: "#FFF", marginBottom: 8, paddingVertical: 14 }}>
        {item.isPinned && (
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 6 }}>
            <Ionicons name="pin" size={12} color="#8B5CF6" />
            <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 11, color: "#8B5CF6", marginLeft: 4 }}>
              Pinned Post
            </Text>
          </View>
        )}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, marginBottom: 10 }}>
          <View style={{
            width: 44, height: 44, borderRadius: 22, backgroundColor: isVendor ? Colors.primary : Colors.secondary,
            justifyContent: "center", alignItems: "center", marginRight: 10,
          }}>
            <Ionicons name={isVendor ? "storefront" : "person"} size={20} color="#FFF" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text }}>
                {item.userName}
              </Text>
              {isVendor && (
                <View style={{
                  backgroundColor: Colors.primary + "20", paddingHorizontal: 6, paddingVertical: 1,
                  borderRadius: 4, marginLeft: 6,
                }}>
                  <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 9, color: Colors.primary }}>VENDOR</Text>
                </View>
              )}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{
                flexDirection: "row", alignItems: "center", backgroundColor: POST_TYPE_COLORS[item.postType] + "15",
                paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, marginRight: 6,
              }}>
                <Ionicons name={POST_TYPE_ICONS[item.postType] as any} size={10} color={POST_TYPE_COLORS[item.postType]} />
                <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 10, color: POST_TYPE_COLORS[item.postType], marginLeft: 3 }}>
                  {POST_TYPE_LABELS[item.postType]}
                </Text>
              </View>
              <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight }}>
                {formatTime(item.createdAt)}
              </Text>
            </View>
          </View>
          {isVendor && item.vendorId && (
            <TouchableOpacity
              onPress={() => handleFollow(item.vendorId!, item.userName)}
              style={{
                paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
                backgroundColor: following ? Colors.background : Colors.primary,
                borderWidth: following ? 1 : 0, borderColor: Colors.border,
              }}
            >
              <Text style={{
                fontFamily: "Poppins_600SemiBold", fontSize: 12,
                color: following ? Colors.text : "#FFF",
              }}>
                {following ? "Following" : "Follow"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={{
          fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.text,
          lineHeight: 21, paddingHorizontal: 16, marginBottom: 10,
        }}>
          {item.content}
        </Text>

        {item.images && item.images.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10, paddingLeft: 16 }}>
            {item.images.map((img, idx) => (
              <Image
                key={idx}
                source={{ uri: img }}
                style={{
                  width: item.images!.length === 1 ? width - 32 : width * 0.7,
                  height: 220, borderRadius: 12, marginRight: 8,
                }}
                resizeMode="cover"
                accessibilityLabel="Community post image"
              />
            ))}
          </ScrollView>
        )}

        {item.taggedProducts && item.taggedProducts.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingLeft: 16, marginBottom: 10 }}>
            {item.taggedProducts.map((product) => (
              <TouchableOpacity
                key={product.productId}
                onPress={() => router.push(`/product/${product.productId}`)}
                style={{
                  flexDirection: "row", alignItems: "center", backgroundColor: Colors.background,
                  borderRadius: 10, paddingRight: 12, marginRight: 8, overflow: "hidden",
                }}
              >
                <Image source={{ uri: product.image }} style={{ width: 48, height: 48 }} resizeMode="cover" accessibilityLabel={product.productName} />
                <View style={{ marginLeft: 8 }}>
                  <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.text }} numberOfLines={1}>
                    {product.productName}
                  </Text>
                  <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.primary }}>
                    ₹{product.price}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <View style={{
          flexDirection: "row", alignItems: "center", paddingHorizontal: 16,
          paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.border + "40",
        }}>
          <PressableScale haptic="none" onPress={() => handleLike(item.id)} style={{ flexDirection: "row", alignItems: "center", marginRight: 20 }}>
            <Ionicons name={item.isLiked ? "heart" : "heart-outline"} size={22} color={item.isLiked ? "#EF4444" : Colors.textLight} />
            <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textLight, marginLeft: 5 }}>
              {item.likes}
            </Text>
          </PressableScale>
          <PressableScale onPress={() => handleComment(item)} style={{ flexDirection: "row", alignItems: "center", marginRight: 20 }}>
            <Ionicons name="chatbubble-outline" size={20} color={Colors.textLight} />
            <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textLight, marginLeft: 5 }}>
              {item.commentsCount}
            </Text>
          </PressableScale>
          <PressableScale style={{ flexDirection: "row", alignItems: "center" }} onPress={() => setSharePostId(item.id)}>
            <Ionicons name="share-social-outline" size={20} color={Colors.textLight} />
            <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.textLight, marginLeft: 5 }}>Share</Text>
          </PressableScale>
          {isVendor && item.vendorId && (
            <PressableScale
              onPress={() => router.push(`/store/${item.vendorId}`)}
              style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center" }}
            >
              <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.primary }}>Visit Store</Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
            </PressableScale>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: activeTab === "reels" ? "#000" : Colors.background, paddingTop: topInset }}>
      <View style={{
        backgroundColor: activeTab === "reels" ? "rgba(0,0,0,0.85)" : "#FFF",
        paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10,
        borderBottomWidth: activeTab === "reels" ? 0 : 1, borderBottomColor: Colors.border,
        zIndex: 20,
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 22, color: activeTab === "reels" ? "#FFF" : Colors.text }}>Community</Text>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {activeTab === "posts" && (
              <TouchableOpacity
                onPress={() => setShowFollowing(!showFollowing)}
                style={{
                  flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 6,
                  borderRadius: 16, backgroundColor: showFollowing ? Colors.primary : Colors.background, marginRight: 8,
                }}
              >
                <Ionicons name="people" size={16} color={showFollowing ? "#FFF" : Colors.textLight} />
                <Text style={{
                  fontFamily: "Poppins_500Medium", fontSize: 12, marginLeft: 4,
                  color: showFollowing ? "#FFF" : Colors.textLight,
                }}>
                  {vendorFollows.filter((f) => f.userId === user?.id).length}
                </Text>
              </TouchableOpacity>
            )}
            {activeTab === "reels" && (
              <TouchableOpacity
                onPress={() => router.push("/upload-reel")}
                style={{
                  backgroundColor: Colors.primary, width: 36, height: 36, borderRadius: 18,
                  justifyContent: "center", alignItems: "center", marginRight: 8,
                }}
              >
                <Ionicons name="camera-outline" size={20} color="#FFF" />
              </TouchableOpacity>
            )}
            {activeTab === "posts" && (
              <TouchableOpacity
                onPress={() => setShowCreatePost(true)}
                style={{
                  backgroundColor: Colors.primary, width: 36, height: 36, borderRadius: 18,
                  justifyContent: "center", alignItems: "center",
                }}
              >
                <Ionicons name="add" size={22} color="#FFF" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View style={{
            flexDirection: "row", backgroundColor: activeTab === "reels" ? "rgba(255,255,255,0.1)" : "#F1F5F9",
            borderRadius: 22, padding: 3, marginRight: 10,
          }}>
            <TouchableOpacity
              onPress={() => { setActiveTab("posts"); setShowFollowing(false); }}
              style={{
                flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 7,
                borderRadius: 20, gap: 5,
                backgroundColor: activeTab === "posts" ? Colors.primary : "transparent",
              }}
            >
              <Ionicons name="chatbubbles" size={14} color={activeTab === "posts" ? "#FFF" : (activeTab === "reels" ? "rgba(255,255,255,0.6)" : Colors.textLight)} />
              <Text style={{
                fontFamily: "Poppins_600SemiBold", fontSize: 13,
                color: activeTab === "posts" ? "#FFF" : (activeTab === "reels" ? "rgba(255,255,255,0.6)" : Colors.textLight),
              }}>Posts</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setActiveTab("reels"); setShowFollowing(false); }}
              style={{
                flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 7,
                borderRadius: 20, gap: 5,
                backgroundColor: activeTab === "reels" ? Colors.primary : "transparent",
              }}
            >
              <Ionicons name="play-circle" size={14} color={activeTab === "reels" ? "#FFF" : (activeTab === "reels" ? "rgba(255,255,255,0.6)" : Colors.textLight)} />
              <Text style={{
                fontFamily: "Poppins_600SemiBold", fontSize: 13,
                color: activeTab === "reels" ? "#FFF" : (activeTab === "reels" ? "rgba(255,255,255,0.6)" : Colors.textLight),
              }}>Reels</Text>
              {reels.length > 0 && (
                <View style={{
                  backgroundColor: activeTab === "reels" ? "rgba(255,255,255,0.3)" : Colors.primary + "20",
                  paddingHorizontal: 5, paddingVertical: 1, borderRadius: 8,
                }}>
                  <Text style={{
                    fontFamily: "Poppins_600SemiBold", fontSize: 10,
                    color: activeTab === "reels" ? "#FFF" : Colors.primary,
                  }}>{reels.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {activeTab === "posts" && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
              {POST_TYPES.map((type) => (
                <TouchableOpacity
                  key={type}
                  onPress={() => { setActiveFilter(type); setShowFollowing(false); }}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 6,
                    backgroundColor: activeFilter === type ? Colors.secondary : Colors.background,
                  }}
                >
                  <Text style={{
                    fontFamily: "Poppins_500Medium", fontSize: 11,
                    color: activeFilter === type ? "#FFF" : Colors.textLight,
                  }}>
                    {POST_TYPE_LABELS[type]}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </View>

      {activeTab === "reels" ? (
        <ReelsView />
      ) : showFollowing ? (
        <View style={{ flex: 1, padding: 16 }}>
          <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.text, marginBottom: 12 }}>
            Following ({vendorFollows.filter((f) => f.userId === user?.id).length})
          </Text>
          {vendorFollows.filter((f) => f.userId === user?.id).length === 0 ? (
            <View style={{ alignItems: "center", paddingTop: 60 }}>
              <Ionicons name="people-outline" size={48} color={Colors.textLight} />
              <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.textLight, marginTop: 12 }}>
                You're not following any vendors yet
              </Text>
              <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 12, color: Colors.textLight, marginTop: 4 }}>
                Follow vendors to see their updates first
              </Text>
            </View>
          ) : (
            <FlatList
              data={vendorFollows.filter((f) => f.userId === user?.id)}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={{
                  flexDirection: "row", alignItems: "center", backgroundColor: "#FFF",
                  padding: 14, borderRadius: 12, marginBottom: 8,
                }}>
                  <View style={{
                    width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary,
                    justifyContent: "center", alignItems: "center", marginRight: 12,
                  }}>
                    <Ionicons name="storefront" size={20} color="#FFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text }}>
                      {item.vendorName}
                    </Text>
                    <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight }}>
                      Following since {new Date(item.followedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => { hapticMedium(); unfollowVendor(item.vendorId); }}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
                      borderWidth: 1, borderColor: Colors.border,
                    }}
                  >
                    <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.textLight }}>Unfollow</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => router.push(`/store/${item.vendorId}`)}
                    style={{ marginLeft: 8 }}
                  >
                    <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
                  </TouchableOpacity>
                </View>
              )}
              scrollEnabled={!!vendorFollows.length}
            />
          )}
        </View>
      ) : (
        <FlatList
          data={filteredPosts}
          keyExtractor={(item) => item.id}
          renderItem={renderPostCard}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: isWeb ? 34 : 100 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: 60 }}>
              <Ionicons name="chatbubbles-outline" size={48} color={Colors.textLight} />
              <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.textLight, marginTop: 12 }}>
                No posts yet
              </Text>
            </View>
          }
        />
      )}

      <Modal visible={showCommentModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, justifyContent: "flex-end" }}
          keyboardVerticalOffset={10}
        >
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowCommentModal(false)} />
          <View style={{
            backgroundColor: "#FFF", borderTopLeftRadius: 20, borderTopRightRadius: 20,
            maxHeight: "60%", paddingBottom: isWeb ? 34 : insets.bottom + 8,
          }}>
            <View style={{
              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10,
              borderBottomWidth: 1, borderBottomColor: Colors.border,
            }}>
              <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.text }}>
                Comments ({selectedPost?.commentsCount || 0})
              </Text>
              <TouchableOpacity onPress={() => setShowCommentModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textLight} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={postComments}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 300 }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8 }}
              renderItem={({ item }) => (
                <View style={{ flexDirection: "row", marginBottom: 14 }}>
                  <View style={{
                    width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.secondary,
                    justifyContent: "center", alignItems: "center", marginRight: 10, marginTop: 2,
                  }}>
                    <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 12, color: "#FFF" }}>
                      {item.userName.charAt(0)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text }}>
                        {item.userName}
                      </Text>
                      <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight, marginLeft: 8 }}>
                        {formatTime(item.createdAt)}
                      </Text>
                    </View>
                    <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.text, marginTop: 2 }}>
                      {item.text}
                    </Text>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <View style={{ alignItems: "center", paddingVertical: 30 }}>
                  <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textLight }}>
                    No comments yet. Be the first!
                  </Text>
                </View>
              }
              scrollEnabled={!!postComments.length}
            />

            <View style={{
              flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 8,
              borderTopWidth: 1, borderTopColor: Colors.border,
            }}>
              <TextInput
                value={commentText}
                onChangeText={setCommentText}
                placeholder="Write a comment..."
                placeholderTextColor={Colors.textLight}
                style={{
                  flex: 1, backgroundColor: Colors.background, borderRadius: 20,
                  paddingHorizontal: 16, paddingVertical: 10, fontFamily: "Poppins_400Regular",
                  fontSize: 14, color: Colors.text, marginRight: 8,
                }}
              />
              <PressableScale
                haptic="none"
                onPress={submitComment}
                style={{
                  width: 38, height: 38, borderRadius: 19, backgroundColor: commentText.trim() ? Colors.primary : Colors.border,
                  justifyContent: "center", alignItems: "center",
                }}
                disabled={!commentText.trim()}
              >
                <Ionicons name="send" size={18} color="#FFF" />
              </PressableScale>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showCreatePost} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, justifyContent: "flex-end" }}
          keyboardVerticalOffset={10}
        >
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowCreatePost(false)} />
          <View style={{
            backgroundColor: "#FFF", borderTopLeftRadius: 20, borderTopRightRadius: 20,
            paddingBottom: isWeb ? 34 : insets.bottom + 8,
          }}>
            <View style={{
              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10,
              borderBottomWidth: 1, borderBottomColor: Colors.border,
            }}>
              <TouchableOpacity onPress={() => setShowCreatePost(false)}>
                <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.textLight }}>Cancel</Text>
              </TouchableOpacity>
              <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 16, color: Colors.text }}>New Post</Text>
              <TouchableOpacity onPress={submitPost} disabled={!newPostContent.trim()}>
                <Text style={{
                  fontFamily: "Poppins_600SemiBold", fontSize: 14,
                  color: newPostContent.trim() ? Colors.primary : Colors.textLight,
                }}>
                  Post
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {(["UPDATE", "REVIEW", "QUESTION"] as const).map((type) => (
                  <TouchableOpacity
                    key={type}
                    onPress={() => setNewPostType(type)}
                    style={{
                      flexDirection: "row", alignItems: "center",
                      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 8,
                      backgroundColor: newPostType === type ? POST_TYPE_COLORS[type] + "20" : Colors.background,
                      borderWidth: newPostType === type ? 1 : 0, borderColor: POST_TYPE_COLORS[type],
                    }}
                  >
                    <Ionicons name={POST_TYPE_ICONS[type] as any} size={14} color={POST_TYPE_COLORS[type]} />
                    <Text style={{
                      fontFamily: "Poppins_500Medium", fontSize: 12, color: POST_TYPE_COLORS[type], marginLeft: 4,
                    }}>
                      {POST_TYPE_LABELS[type]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TextInput
                value={newPostContent}
                onChangeText={setNewPostContent}
                placeholder="What's on your mind? Share a review, ask a question, or post an update..."
                placeholderTextColor={Colors.textLight}
                multiline
                style={{
                  backgroundColor: Colors.background, borderRadius: 12, padding: 14,
                  fontFamily: "Poppins_400Regular", fontSize: 14, color: Colors.text,
                  minHeight: 120, textAlignVertical: "top",
                }}
              />
              <Text style={{
                fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight,
                textAlign: "right", marginTop: 4, marginBottom: 8,
              }}>
                {newPostContent.length}/500
              </Text>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!sharePostId} transparent animationType="slide" onRequestClose={() => setSharePostId(null)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={() => setSharePostId(null)}>
          <Pressable style={{ backgroundColor: Colors.secondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: isWeb ? 50 : insets.bottom + 16 }} onPress={(e) => e.stopPropagation()}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.3)", alignSelf: "center", marginBottom: 16 }} />
            <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 18, color: "#FFF", marginBottom: 4 }}>Share to Social Media</Text>
            <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 20 }} numberOfLines={2}>
              {communityPosts.find((p) => p.id === sharePostId)?.content || ""}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 16, paddingHorizontal: 8 }}>
              <TouchableOpacity style={{ alignItems: "center", width: "28%" as any, gap: 8 }} onPress={() => handleSharePost("whatsapp")}>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#25D366", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="logo-whatsapp" size={24} color="#FFF" />
                </View>
                <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 11, color: "rgba(255,255,255,0.8)", textAlign: "center" }}>WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ alignItems: "center", width: "28%" as any, gap: 8 }} onPress={() => handleSharePost("instagram")}>
                <LinearGradient colors={["#F58529", "#DD2A7B", "#8134AF"]} style={{ width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="logo-instagram" size={24} color="#FFF" />
                </LinearGradient>
                <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 11, color: "rgba(255,255,255,0.8)", textAlign: "center" }}>Instagram</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ alignItems: "center", width: "28%" as any, gap: 8 }} onPress={() => handleSharePost("facebook")}>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#1877F2", alignItems: "center", justifyContent: "center" }}>
                  <FontAwesome5 name="facebook-f" size={22} color="#FFF" />
                </View>
                <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 11, color: "rgba(255,255,255,0.8)", textAlign: "center" }}>Facebook</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ alignItems: "center", width: "28%" as any, gap: 8 }} onPress={() => handleSharePost("tiktok")}>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="musical-notes" size={22} color="#FFF" />
                </View>
                <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 11, color: "rgba(255,255,255,0.8)", textAlign: "center" }}>TikTok</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ alignItems: "center", width: "28%" as any, gap: 8 }} onPress={() => handleSharePost("twitter")}>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}>
                  <FontAwesome5 name="twitter" size={22} color="#FFF" />
                </View>
                <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 11, color: "rgba(255,255,255,0.8)", textAlign: "center" }}>X (Twitter)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ alignItems: "center", width: "28%" as any, gap: 8 }} onPress={() => handleSharePost("telegram")}>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#0088CC", alignItems: "center", justifyContent: "center" }}>
                  <FontAwesome5 name="telegram-plane" size={22} color="#FFF" />
                </View>
                <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 11, color: "rgba(255,255,255,0.8)", textAlign: "center" }}>Telegram</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ alignItems: "center", width: "28%" as any, gap: 8 }} onPress={() => handleSharePost("copy")}>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#6B7280", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="copy-outline" size={22} color="#FFF" />
                </View>
                <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 11, color: "rgba(255,255,255,0.8)", textAlign: "center" }}>Copy Link</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)" }}
              onPress={() => handleSharePost("native")}
            >
              <Ionicons name="share-outline" size={20} color="#FFF" />
              <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#FFF" }}>More Options</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const reelStyles = StyleSheet.create({
  reelContainer: { width: SCREEN_WIDTH, backgroundColor: "#000", position: "relative" },
  reelBackground: { ...StyleSheet.absoluteFillObject, width: SCREEN_WIDTH, height: SCREEN_HEIGHT },
  reelImage: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT, position: "absolute" },
  sideActions: { position: "absolute", right: 12, alignItems: "center", gap: 18, zIndex: 5 },
  avatarContainer: { marginBottom: 8, position: "relative" },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFF" },
  avatarText: { fontFamily: "Poppins_700Bold", fontSize: 18, color: "#FFF" },
  verifiedBadge: { position: "absolute", bottom: -2, right: -2, width: 16, height: 16, borderRadius: 8, backgroundColor: "#3B82F6", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#FFF" },
  sideActionBtn: { alignItems: "center", gap: 2 },
  actionText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: "#FFF", textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  bottomContent: { position: "absolute", bottom: 0, left: 0, right: 60, paddingHorizontal: 16, zIndex: 5 },
  userRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  userName: { fontFamily: "Poppins_700Bold", fontSize: 15, color: "#FFF", textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  vendorBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(255,107,0,0.8)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  vendorBadgeText: { fontFamily: "Poppins_600SemiBold", fontSize: 9, color: "#FFF" },
  timeText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "rgba(255,255,255,0.7)" },
  caption: { fontFamily: "Poppins_400Regular", fontSize: 13, color: "#FFF", lineHeight: 19, textShadowColor: "rgba(0,0,0,0.4)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3, marginBottom: 8 },
  visitStore: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, alignSelf: "flex-start", marginBottom: 8 },
  visitStoreText: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: "#FFF" },
  productPeek: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 12, padding: 8, gap: 10 },
  peekImage: { width: 40, height: 40, borderRadius: 8 },
  peekInfo: { flex: 1 },
  peekName: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: "#FFF" },
  peekPrice: { fontFamily: "Poppins_700Bold", fontSize: 13, color: Colors.primary },
  peekMore: { backgroundColor: "rgba(255,107,0,0.8)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  peekMoreText: { fontFamily: "Poppins_600SemiBold", fontSize: 11, color: "#FFF" },
  productsOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end", zIndex: 20 },
  productsSheet: { backgroundColor: Colors.secondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 32 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.3)", alignSelf: "center", marginBottom: 16 },
  sheetTitle: { fontFamily: "Poppins_700Bold", fontSize: 16, color: "#FFF", marginBottom: 12 },
  productsScroll: { gap: 12, paddingRight: 12 },
  productCard: { width: 150, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 16, overflow: "hidden" },
  productImage: { width: 150, height: 120 },
  productInfo: { padding: 10, gap: 2 },
  productName: { fontFamily: "Poppins_600SemiBold", fontSize: 12, color: "#FFF" },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  productPrice: { fontFamily: "Poppins_700Bold", fontSize: 14, color: Colors.primary },
  originalPrice: { fontFamily: "Poppins_400Regular", fontSize: 11, color: "rgba(255,255,255,0.5)", textDecorationLine: "line-through" },
  productVendor: { fontFamily: "Poppins_400Regular", fontSize: 10, color: "rgba(255,255,255,0.6)" },
  addBtn: { position: "absolute", top: 8, right: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  shareSheet: { backgroundColor: Colors.secondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  shareCaption: { fontFamily: "Poppins_400Regular", fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 20, lineHeight: 18 },
  shareGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 16, paddingHorizontal: 8 },
  shareItem: { alignItems: "center", width: "28%" as any, gap: 8 },
  shareIconCircle: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  shareLabel: { fontFamily: "Poppins_500Medium", fontSize: 11, color: "rgba(255,255,255,0.8)", textAlign: "center" },
  shareMoreBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)" },
  shareMoreText: { fontFamily: "Poppins_600SemiBold", fontSize: 14, color: "#FFF" },
  videoLoading: { ...StyleSheet.absoluteFillObject, zIndex: 1 },
  loadingSpinner: { position: "absolute", top: "50%", left: "50%", marginLeft: -18, marginTop: -18 },
  commentsSheet: { backgroundColor: Colors.secondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 12, maxHeight: SCREEN_HEIGHT * 0.55 },
  commentsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  commentsList: { flex: 1, marginBottom: 12 },
  noComments: { alignItems: "center", paddingVertical: 30, gap: 6 },
  noCommentsText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "rgba(255,255,255,0.5)" },
  noCommentsSub: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "rgba(255,255,255,0.3)" },
  commentItem: { flexDirection: "row", gap: 10, marginBottom: 14 },
  commentAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  commentAvatarText: { fontFamily: "Poppins_700Bold", fontSize: 14, color: "#FFF" },
  commentBody: { flex: 1 },
  commentNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  commentName: { fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#FFF" },
  commentTime: { fontFamily: "Poppins_400Regular", fontSize: 10, color: "rgba(255,255,255,0.4)" },
  commentTextStyle: { fontFamily: "Poppins_400Regular", fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 2, lineHeight: 18 },
  commentInputRow: { flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)", paddingTop: 12, paddingBottom: Platform.OS === "ios" ? 8 : 4 },
  commentInput: { flex: 1, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontFamily: "Poppins_400Regular", fontSize: 13, color: "#FFF" },
  commentSendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  progressContainer: { position: "absolute", left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 4, zIndex: 10 },
  progressDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.3)" },
  progressDotActive: { backgroundColor: Colors.primary, width: 18, borderRadius: 3 },
});
