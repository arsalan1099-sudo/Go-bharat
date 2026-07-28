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
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Video, ResizeMode } from "expo-av";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { LiveSession, TaggedProduct, LiveChatMessage } from "@/lib/types";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const isWeb = Platform.OS === "web";

function formatCount(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toString();
}

function formatTime(dateStr?: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  if (diff < 0) {
    const ago = Math.abs(diff);
    const mins = Math.floor(ago / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 1) return `in ${Math.floor(diff / 60000)}m`;
  if (hrs < 24) return `in ${hrs}h`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

type TabKey = "live" | "upcoming" | "replay";

function LiveBadge() {
  return (
    <View style={badgeStyles.liveBadge}>
      <View style={badgeStyles.liveDot} />
      <Text style={badgeStyles.liveText}>LIVE</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EF4444",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    gap: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFF",
  },
  liveText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "700" as const,
    letterSpacing: 0.5,
  },
});

function SessionCard({
  session,
  onPress,
}: {
  session: LiveSession;
  onPress: (s: LiveSession) => void;
}) {
  return (
    <TouchableOpacity
      style={cardStyles.card}
      onPress={() => onPress(session)}
      activeOpacity={0.85}
    >
      <View style={cardStyles.thumbnailWrap}>
        <Image source={{ uri: session.thumbnail }} style={cardStyles.thumbnail} accessibilityLabel={session.title} />
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.7)"]}
          style={cardStyles.thumbnailGradient}
        />
        {session.status === "LIVE" && (
          <View style={cardStyles.badgeWrap}>
            <LiveBadge />
          </View>
        )}
        {session.status === "SCHEDULED" && (
          <View style={cardStyles.badgeWrap}>
            <View style={cardStyles.scheduledBadge}>
              <Ionicons name="time-outline" size={10} color="#FFF" />
              <Text style={cardStyles.scheduledText}>
                {formatTime(session.scheduledAt)}
              </Text>
            </View>
          </View>
        )}
        {session.status === "ENDED" && (
          <View style={cardStyles.badgeWrap}>
            <View style={cardStyles.replayBadge}>
              <Ionicons name="play" size={10} color="#FFF" />
              <Text style={cardStyles.replayText}>Replay</Text>
            </View>
          </View>
        )}
        <View style={cardStyles.viewerWrap}>
          <Ionicons name="eye-outline" size={12} color="#FFF" />
          <Text style={cardStyles.viewerCount}>
            {formatCount(session.status === "ENDED" ? session.peakViewers : session.viewers)}
          </Text>
        </View>
        {session.taggedProducts.length > 0 && (
          <View style={cardStyles.productCountWrap}>
            <Ionicons name="pricetag" size={10} color="#FFF" />
            <Text style={cardStyles.productCountText}>
              {session.taggedProducts.length}
            </Text>
          </View>
        )}
      </View>
      <View style={cardStyles.info}>
        <View style={cardStyles.vendorRow}>
          <View style={cardStyles.vendorAvatar}>
            <Text style={cardStyles.vendorAvatarText}>
              {session.vendorName[0]}
            </Text>
          </View>
          <Text style={cardStyles.vendorName} numberOfLines={1}>
            {session.vendorName}
          </Text>
        </View>
        <Text style={cardStyles.title} numberOfLines={2}>
          {session.title}
        </Text>
        {session.likes > 0 && (
          <View style={cardStyles.likesRow}>
            <Ionicons name="heart" size={12} color="#EF4444" />
            <Text style={cardStyles.likesText}>{formatCount(session.likes)}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    width: (SCREEN_WIDTH - 48) / 2,
    backgroundColor: "#FFF",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  thumbnailWrap: {
    width: "100%",
    aspectRatio: 9 / 12,
    position: "relative",
  },
  thumbnail: {
    width: "100%",
    height: "100%",
  },
  thumbnailGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "50%",
  },
  badgeWrap: {
    position: "absolute",
    top: 8,
    left: 8,
  },
  scheduledBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.info,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    gap: 4,
  },
  scheduledText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "600" as const,
  },
  replayBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    gap: 4,
  },
  replayText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "600" as const,
  },
  viewerWrap: {
    position: "absolute",
    bottom: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 3,
  },
  viewerCount: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "600" as const,
  },
  productCountWrap: {
    position: "absolute",
    bottom: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 3,
  },
  productCountText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "600" as const,
  },
  info: {
    padding: 10,
    gap: 4,
  },
  vendorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  vendorAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  vendorAvatarText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "700" as const,
  },
  vendorName: {
    flex: 1,
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: "500" as const,
  },
  title: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: Colors.text,
    lineHeight: 18,
  },
  likesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  likesText: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
});

function LiveChatBubble({ msg }: { msg: LiveChatMessage }) {
  return (
    <View style={[chatStyles.bubble, msg.isVendor && chatStyles.vendorBubble]}>
      <Text style={[chatStyles.chatUser, msg.isVendor && chatStyles.vendorUser]}>
        {msg.userName}
        {msg.isVendor ? " (Host)" : ""}
      </Text>
      <Text style={chatStyles.chatMsg}>{msg.message}</Text>
    </View>
  );
}

const chatStyles = StyleSheet.create({
  bubble: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: SCREEN_WIDTH * 0.65,
    marginBottom: 4,
  },
  vendorBubble: {
    backgroundColor: "rgba(255,107,0,0.25)",
    borderWidth: 1,
    borderColor: "rgba(255,107,0,0.4)",
  },
  chatUser: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 10,
    fontWeight: "600" as const,
  },
  vendorUser: {
    color: Colors.primary,
  },
  chatMsg: {
    color: "#FFF",
    fontSize: 13,
    lineHeight: 18,
  },
});

function TaggedProductCard({
  product,
  onBuy,
  isPinned,
}: {
  product: TaggedProduct;
  onBuy: (p: TaggedProduct) => void;
  isPinned?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[tpStyles.card, isPinned && tpStyles.pinnedCard]}
      onPress={() => onBuy(product)}
      activeOpacity={0.85}
    >
      <Image source={{ uri: product.productImage }} style={tpStyles.img} accessibilityLabel={product.productName} />
      <View style={tpStyles.info}>
        <Text style={tpStyles.name} numberOfLines={1}>
          {product.productName}
        </Text>
        <View style={tpStyles.priceRow}>
          <Text style={tpStyles.price}>₹{product.price}</Text>
          {product.originalPrice && (
            <Text style={tpStyles.origPrice}>₹{product.originalPrice}</Text>
          )}
        </View>
        <Text style={tpStyles.vendor} numberOfLines={1}>
          {product.vendorName}
        </Text>
      </View>
      <View style={tpStyles.buyBtn}>
        <Ionicons name="cart" size={14} color="#FFF" />
      </View>
    </TouchableOpacity>
  );
}

const tpStyles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 14,
    padding: 8,
    marginRight: 10,
    width: 220,
    gap: 8,
  },
  pinnedCard: {
    backgroundColor: "rgba(255,107,0,0.2)",
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  img: {
    width: 50,
    height: 50,
    borderRadius: 10,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "600" as const,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  price: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: "700" as const,
  },
  origPrice: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    textDecorationLine: "line-through" as const,
  },
  vendor: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 10,
  },
  buyBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});

function LikeButton({ isLiked, likes, onPress }: { isLiked: boolean; likes: number; onPress: () => void }) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = withSequence(
      withSpring(1.4, { damping: 4 }),
      withSpring(1, { damping: 6 })
    );
    onPress();
  };

  return (
    <TouchableOpacity onPress={handlePress} style={likeStyles.wrap}>
      <Animated.View style={animStyle}>
        <Ionicons
          name={isLiked ? "heart" : "heart-outline"}
          size={30}
          color={isLiked ? "#FF4458" : "#FFF"}
        />
      </Animated.View>
      <Text style={likeStyles.count}>{formatCount(likes)}</Text>
    </TouchableOpacity>
  );
}

const likeStyles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    gap: 2,
  },
  count: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "600" as const,
  },
});

function FullScreenSession({
  session,
  onClose,
  onLike,
  onChat,
  onBuy,
  onJoin,
}: {
  session: LiveSession;
  onClose: () => void;
  onLike: (id: string) => void;
  onChat: (id: string, msg: string) => void;
  onBuy: (p: TaggedProduct) => void;
  onJoin: (id: string) => void;
  onLeave: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [chatText, setChatText] = useState("");
  const [showProducts, setShowProducts] = useState(false);
  const [pinnedProductIdx, setPinnedProductIdx] = useState(0);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const videoRef = useRef<Video>(null);
  const chatScrollRef = useRef<ScrollView>(null);

  const topInset = isWeb ? 67 : insets.top;
  const bottomInset = isWeb ? 34 : insets.bottom;

  useEffect(() => {
    onJoin(session.id);
    return () => { onLeave(session.id); };
  }, [session.id]);

  useEffect(() => {
    if (session.taggedProducts.length > 1) {
      const interval = setInterval(() => {
        setPinnedProductIdx((prev) => (prev + 1) % session.taggedProducts.length);
      }, 8000);
      return () => clearInterval(interval);
    }
  }, [session.taggedProducts.length]);

  useEffect(() => {
    setTimeout(() => {
      chatScrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [session.chatMessages.length]);

  const handleSendChat = () => {
    if (!chatText.trim()) return;
    try {
      Haptics.selectionAsync();
    } catch {}
    onChat(session.id, chatText.trim());
    setChatText("");
  };

  const pinnedProduct = session.taggedProducts[pinnedProductIdx];

  return (
    <View style={fsStyles.container}>
      <Image
        source={{ uri: session.thumbnail }}
        style={fsStyles.bg}
        blurRadius={20}
        accessibilityLabel={session.title}
      />

      {session.videoUrl ? (
        <>
          {!videoLoaded && (
            <View style={fsStyles.videoLoading}>
              <Image
                source={{ uri: session.thumbnail }}
                style={fsStyles.video}
                resizeMode="cover"
                accessibilityLabel={session.title}
              />
              <ActivityIndicator
                size="large"
                color={Colors.primary}
                style={fsStyles.spinner}
              />
            </View>
          )}
          <Video
            ref={videoRef}
            source={{ uri: session.videoUrl }}
            style={fsStyles.video}
            resizeMode={ResizeMode.COVER}
            shouldPlay
            isLooping
            isMuted={false}
            onLoad={() => setVideoLoaded(true)}
          />
        </>
      ) : (
        <Image
          source={{ uri: session.thumbnail }}
          style={fsStyles.video}
          resizeMode="cover"
          accessibilityLabel={session.title}
        />
      )}

      <LinearGradient
        colors={[
          "rgba(0,0,0,0.5)",
          "transparent",
          "transparent",
          "rgba(0,0,0,0.8)",
        ]}
        locations={[0, 0.25, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={[fsStyles.topBar, { paddingTop: topInset + 8 }]}>
        <View style={fsStyles.topLeft}>
          <TouchableOpacity onPress={onClose} style={fsStyles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <View style={fsStyles.hostInfo}>
            <View style={fsStyles.hostAvatar}>
              <Text style={fsStyles.hostAvatarText}>
                {session.vendorName[0]}
              </Text>
            </View>
            <View>
              <Text style={fsStyles.hostName}>{session.vendorName}</Text>
              <Text style={fsStyles.hostLabel}>Host</Text>
            </View>
          </View>
        </View>
        <View style={fsStyles.topRight}>
          {session.status === "LIVE" && <LiveBadge />}
          <View style={fsStyles.viewerBadge}>
            <Ionicons name="eye" size={14} color="#FFF" />
            <Text style={fsStyles.viewerText}>
              {formatCount(session.viewers)}
            </Text>
          </View>
        </View>
      </View>

      <View style={[fsStyles.sideActions, { bottom: 200 + bottomInset }]}>
        <LikeButton
          isLiked={session.isLiked}
          likes={session.likes}
          onPress={() => onLike(session.id)}
        />

        <TouchableOpacity
          style={fsStyles.sideBtn}
          onPress={() => setShowProducts(!showProducts)}
        >
          <Ionicons
            name="pricetag"
            size={24}
            color={showProducts ? Colors.primary : "#FFF"}
          />
          <Text
            style={[
              fsStyles.sideBtnText,
              showProducts && { color: Colors.primary },
            ]}
          >
            {session.taggedProducts.length}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={fsStyles.sideBtn}>
          <Ionicons name="share-outline" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      {pinnedProduct && !showProducts && (
        <View style={[fsStyles.pinnedProduct, { bottom: 180 + bottomInset }]}>
          <TaggedProductCard
            product={pinnedProduct}
            onBuy={onBuy}
            isPinned
          />
        </View>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[fsStyles.bottomArea, { paddingBottom: bottomInset + 8 }]}
        keyboardVerticalOffset={0}
      >
        <View style={fsStyles.chatArea}>
          <ScrollView
            ref={chatScrollRef}
            style={fsStyles.chatScroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={fsStyles.chatContent}
          >
            {session.chatMessages.map((msg) => (
              <LiveChatBubble key={msg.id} msg={msg} />
            ))}
          </ScrollView>
        </View>

        <View style={fsStyles.chatInputRow}>
          <TextInput
            style={fsStyles.chatInput}
            value={chatText}
            onChangeText={setChatText}
            placeholder="Say something..."
            placeholderTextColor="rgba(255,255,255,0.4)"
            maxLength={200}
            returnKeyType="send"
            onSubmitEditing={handleSendChat}
          />
          <TouchableOpacity
            style={[
              fsStyles.sendBtn,
              !chatText.trim() && { opacity: 0.4 },
            ]}
            onPress={handleSendChat}
            disabled={!chatText.trim()}
          >
            <Ionicons name="send" size={18} color="#FFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {showProducts && (
        <Pressable
          style={fsStyles.productsOverlay}
          onPress={() => setShowProducts(false)}
        >
          <Pressable
            style={[fsStyles.productsSheet, { paddingBottom: bottomInset + 16 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={fsStyles.sheetHandle} />
            <Text style={fsStyles.sheetTitle}>
              Products in this session ({session.taggedProducts.length})
            </Text>
            <ScrollView showsVerticalScrollIndicator={false} style={fsStyles.productsList}>
              {session.taggedProducts.map((p, idx) => (
                <TouchableOpacity
                  key={p.productId}
                  style={fsStyles.productItem}
                  onPress={() => onBuy(p)}
                  activeOpacity={0.8}
                >
                  <Image source={{ uri: p.productImage }} style={fsStyles.productImg} accessibilityLabel={p.productName} />
                  <View style={fsStyles.productInfo}>
                    <Text style={fsStyles.productName} numberOfLines={1}>
                      {p.productName}
                    </Text>
                    <View style={fsStyles.productPriceRow}>
                      <Text style={fsStyles.productPrice}>₹{p.price}</Text>
                      {p.originalPrice && (
                        <Text style={fsStyles.productOrigPrice}>
                          ₹{p.originalPrice}
                        </Text>
                      )}
                      {p.originalPrice && (
                        <View style={fsStyles.discountBadge}>
                          <Text style={fsStyles.discountText}>
                            {Math.round(
                              ((p.originalPrice - p.price) / p.originalPrice) * 100
                            )}
                            % off
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={fsStyles.productVendor} numberOfLines={1}>
                      {p.vendorName}
                    </Text>
                  </View>
                  <View style={fsStyles.buyNowBtn}>
                    <Ionicons name="cart-outline" size={16} color="#FFF" />
                    <Text style={fsStyles.buyNowText}>Buy</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      )}
    </View>
  );
}

const fsStyles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#000",
    zIndex: 100,
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
  },
  video: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    position: "absolute",
  },
  videoLoading: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  spinner: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginLeft: -18,
    marginTop: -18,
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    zIndex: 10,
  },
  topLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  hostInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  hostAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFF",
  },
  hostAvatarText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "700" as const,
  },
  hostName: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "600" as const,
  },
  hostLabel: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 10,
  },
  topRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  viewerBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    gap: 4,
  },
  viewerText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "600" as const,
  },
  sideActions: {
    position: "absolute",
    right: 14,
    alignItems: "center",
    gap: 20,
    zIndex: 10,
  },
  sideBtn: {
    alignItems: "center",
    gap: 2,
  },
  sideBtnText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "600" as const,
  },
  pinnedProduct: {
    position: "absolute",
    left: 12,
    zIndex: 10,
  },
  bottomArea: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  chatArea: {
    maxHeight: 180,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  chatScroll: {
    flex: 1,
  },
  chatContent: {
    paddingTop: 8,
  },
  chatInputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 8,
  },
  chatInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: "#FFF",
    fontSize: 14,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  productsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
    zIndex: 50,
  },
  productsSheet: {
    backgroundColor: "#1A1A2E",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    maxHeight: SCREEN_HEIGHT * 0.55,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    marginBottom: 12,
  },
  sheetTitle: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700" as const,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  productsList: {
    paddingHorizontal: 16,
  },
  productItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
    gap: 10,
  },
  productImg: {
    width: 56,
    height: 56,
    borderRadius: 10,
  },
  productInfo: {
    flex: 1,
    gap: 2,
  },
  productName: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "600" as const,
  },
  productPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  productPrice: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: "700" as const,
  },
  productOrigPrice: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    textDecorationLine: "line-through" as const,
  },
  discountBadge: {
    backgroundColor: Colors.success,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  discountText: {
    color: "#FFF",
    fontSize: 9,
    fontWeight: "700" as const,
  },
  productVendor: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
  },
  buyNowBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 4,
  },
  buyNowText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "700" as const,
  },
});

export default function LiveShoppingScreen() {
  const {
    liveSessions,
    likeLiveSession,
    addLiveChatMessage,
    joinLiveSession,
    leaveLiveSession,
    addToCart,
  } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();
  const [activeTab, setActiveTab] = useState<TabKey>("live");
  const [selectedSession, setSelectedSession] = useState<LiveSession | null>(null);

  useEffect(() => {
    if (sessionId) {
      const session = liveSessions.find(s => s.id === sessionId);
      if (session) setSelectedSession(session);
    }
  }, [sessionId]);

  const topInset = isWeb ? 67 : insets.top;
  const bottomInset = isWeb ? 34 : insets.bottom;

  const liveSes = liveSessions.filter((s) => s.status === "LIVE");
  const upcomingSes = liveSessions.filter((s) => s.status === "SCHEDULED");
  const replaySes = liveSessions.filter((s) => s.status === "ENDED");

  const currentData =
    activeTab === "live" ? liveSes : activeTab === "upcoming" ? upcomingSes : replaySes;

  const handleBuy = useCallback(
    (product: TaggedProduct) => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {}
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
    },
    [addToCart]
  );

  const handleSelectSession = useCallback((session: LiveSession) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setSelectedSession(session);
  }, []);

  const activeSession = selectedSession
    ? liveSessions.find((s) => s.id === selectedSession.id) || selectedSession
    : null;

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "live", label: "Live Now", count: liveSes.length },
    { key: "upcoming", label: "Upcoming", count: upcomingSes.length },
    { key: "replay", label: "Replay", count: replaySes.length },
  ];

  const renderItem = useCallback(
    ({ item, index }: { item: LiveSession; index: number }) => (
      <View
        style={[
          styles.cardWrapper,
          index % 2 === 0 ? { paddingRight: 6 } : { paddingLeft: 6 },
        ]}
      >
        <SessionCard session={item} onPress={handleSelectSession} />
      </View>
    ),
    [handleSelectSession]
  );

  const emptyLabel =
    activeTab === "live"
      ? "No live sessions right now"
      : activeTab === "upcoming"
      ? "No upcoming sessions"
      : "No replays available";

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.secondary, "#0F172A"]}
        style={styles.headerGradient}
      >
        <View style={[styles.header, { paddingTop: topInset + 8 }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Live Shopping</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.tabBar}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.activeTab]}
              onPress={() => setActiveTab(tab.key)}
            >
              {tab.key === "live" && tab.count > 0 && (
                <View style={styles.tabDot} />
              )}
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab.key && styles.activeTabText,
                ]}
              >
                {tab.label}
              </Text>
              {tab.count > 0 && (
                <View
                  style={[
                    styles.tabCount,
                    activeTab === tab.key && styles.activeTabCount,
                  ]}
                >
                  <Text
                    style={[
                      styles.tabCountText,
                      activeTab === tab.key && styles.activeTabCountText,
                    ]}
                  >
                    {tab.count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>

      <FlatList
        data={currentData}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: bottomInset + 20 },
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons
              name={
                activeTab === "live"
                  ? "videocam-outline"
                  : activeTab === "upcoming"
                  ? "time-outline"
                  : "play-circle-outline"
              }
              size={48}
              color={Colors.textLight}
            />
            <Text style={styles.emptyText}>{emptyLabel}</Text>
            <Text style={styles.emptySubText}>
              Check back later for exciting live sessions
            </Text>
          </View>
        }
      />

      {activeSession && (
        <FullScreenSession
          session={activeSession}
          onClose={() => setSelectedSession(null)}
          onLike={likeLiveSession}
          onChat={addLiveChatMessage}
          onBuy={handleBuy}
          onJoin={joinLiveSession}
          onLeave={leaveLiveSession}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerGradient: {
    paddingBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: "#FFF",
  },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    gap: 6,
  },
  activeTab: {
    backgroundColor: Colors.primary,
  },
  tabDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#EF4444",
  },
  tabText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    fontWeight: "600" as const,
  },
  activeTabText: {
    color: "#FFF",
  },
  tabCount: {
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    minWidth: 20,
    alignItems: "center",
  },
  activeTabCount: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  tabCountText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    fontWeight: "700" as const,
  },
  activeTabCountText: {
    color: "#FFF",
  },
  listContent: {
    padding: 16,
  },
  cardWrapper: {
    flex: 1,
    marginBottom: 12,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: Colors.text,
  },
  emptySubText: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
  },
});
