import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  TextInput,
  Image,
  Modal,
  FlatList,
  TouchableOpacity,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApp } from "@/lib/store";
import { CommunityPost } from "@/lib/types";

type FilterTab = "All" | "Vendor" | "Customer" | "Pinned" | "Hidden";
const POST_TYPE_COLORS: Record<string, string> = {
  UPDATE: "#3B82F6",
  OFFER: "#10B981",
  REVIEW: "#F59E0B",
  QUESTION: "#8B5CF6",
  ANNOUNCEMENT: "#EF4444",
};
const POST_TYPE_ICONS: Record<string, string> = {
  UPDATE: "information-circle",
  OFFER: "pricetag",
  REVIEW: "star",
  QUESTION: "help-circle",
  ANNOUNCEMENT: "megaphone",
};

export default function AdminCommunityScreen() {
  const insets = useSafeAreaInsets();
  const {
    communityPosts,
    communityComments,
    vendorFollows,
    deleteCommunityPost,
    deletePostComment,
    togglePinPost,
    toggleHidePost,
  } = useApp();

  const [activeFilter, setActiveFilter] = useState<FilterTab>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPost, setSelectedPost] = useState<CommunityPost | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const filteredPosts = useMemo(() => {
    let result = [...communityPosts];
    if (activeFilter === "Vendor") result = result.filter((p) => p.userRole === "VENDOR");
    else if (activeFilter === "Customer") result = result.filter((p) => p.userRole === "CUSTOMER");
    else if (activeFilter === "Pinned") result = result.filter((p) => p.isPinned);
    else if (activeFilter === "Hidden") result = result.filter((p) => p.isHidden);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) => p.userName.toLowerCase().includes(q) || p.content.toLowerCase().includes(q)
      );
    }
    return result;
  }, [communityPosts, activeFilter, searchQuery]);

  const totalPosts = communityPosts.length;
  const vendorPosts = communityPosts.filter((p) => p.userRole === "VENDOR").length;
  const customerPosts = communityPosts.filter((p) => p.userRole === "CUSTOMER").length;
  const totalComments = communityComments.length;
  const totalFollows = vendorFollows.length;
  const pinnedPosts = communityPosts.filter((p) => p.isPinned).length;
  const hiddenPosts = communityPosts.filter((p) => p.isHidden).length;
  const totalLikes = communityPosts.reduce((s, p) => s + p.likes, 0);

  const formatTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
  };

  const handleDeletePost = (postId: string, userName: string) => {
    Alert.alert(
      "Delete Post",
      `Are you sure you want to delete this post by ${userName}? This will also remove all comments on this post.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteCommunityPost(postId);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            if (selectedPost?.id === postId) {
              setShowDetailModal(false);
              setSelectedPost(null);
            }
          },
        },
      ]
    );
  };

  const handlePinPost = (postId: string) => {
    togglePinPost(postId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleHidePost = (postId: string) => {
    toggleHidePost(postId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleDeleteComment = (commentId: string, postId: string) => {
    Alert.alert("Delete Comment", "Remove this comment?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deletePostComment(commentId, postId);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      },
    ]);
  };

  const openPostDetail = (post: CommunityPost) => {
    setSelectedPost(post);
    setShowDetailModal(true);
  };

  const postComments = selectedPost
    ? communityComments.filter((c) => c.postId === selectedPost.id)
    : [];

  const tabs: FilterTab[] = ["All", "Vendor", "Customer", "Pinned", "Hidden"];

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background, paddingTop: topInset }}>
      <LinearGradient
        colors={[Colors.secondary, "#1a2d4d"]}
        style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
          <Pressable onPress={() => router.back()} style={{ marginRight: 12 }}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 20, color: "#FFF" }}>
              Community Management
            </Text>
            <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 12, color: "#FFF", opacity: 0.7 }}>
              Moderate posts, comments & follows
            </Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          {[
            { label: "Posts", value: totalPosts, icon: "chatbubbles", color: "#3B82F6" },
            { label: "Comments", value: totalComments, icon: "chatbubble-ellipses", color: "#10B981" },
            { label: "Follows", value: totalFollows, icon: "people", color: "#F59E0B" },
            { label: "Likes", value: totalLikes, icon: "heart", color: "#EF4444" },
            { label: "Pinned", value: pinnedPosts, icon: "pin", color: "#8B5CF6" },
            { label: "Hidden", value: hiddenPosts, icon: "eye-off", color: "#6B7280" },
          ].map((stat) => (
            <View
              key={stat.label}
              style={{
                backgroundColor: "#FFFFFF15",
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 10,
                marginRight: 8,
                alignItems: "center",
                minWidth: 80,
              }}
            >
              <Ionicons name={stat.icon as any} size={18} color={stat.color} />
              <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 18, color: "#FFF", marginTop: 2 }}>
                {stat.value}
              </Text>
              <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 10, color: "#FFF", opacity: 0.7 }}>
                {stat.label}
              </Text>
            </View>
          ))}
        </ScrollView>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "#FFFFFF20",
            borderRadius: 10,
            paddingHorizontal: 12,
          }}
        >
          <Ionicons name="search" size={18} color="#FFF" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search posts by user or content..."
            placeholderTextColor="#FFFFFF80"
            style={{
              flex: 1,
              fontFamily: "Poppins_400Regular",
              fontSize: 14,
              color: "#FFF",
              paddingVertical: 10,
              marginLeft: 8,
            }}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={18} color="#FFF" />
            </Pressable>
          )}
        </View>
      </LinearGradient>

      <View style={{ backgroundColor: "#FFF", borderBottomWidth: 1, borderBottomColor: Colors.border }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 10 }}>
          {tabs.map((tab) => {
            const isActive = activeFilter === tab;
            const count =
              tab === "All" ? totalPosts :
              tab === "Vendor" ? vendorPosts :
              tab === "Customer" ? customerPosts :
              tab === "Pinned" ? pinnedPosts : hiddenPosts;
            return (
              <Pressable
                key={tab}
                onPress={() => setActiveFilter(tab)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: 20,
                  marginRight: 8,
                  backgroundColor: isActive ? Colors.primary : Colors.background,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Poppins_600SemiBold",
                    fontSize: 13,
                    color: isActive ? "#FFF" : Colors.textLight,
                  }}
                >
                  {tab}
                </Text>
                <View
                  style={{
                    backgroundColor: isActive ? "#FFFFFF30" : Colors.border,
                    borderRadius: 10,
                    paddingHorizontal: 6,
                    paddingVertical: 1,
                    marginLeft: 6,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Poppins_600SemiBold",
                      fontSize: 11,
                      color: isActive ? "#FFF" : Colors.textLight,
                    }}
                  >
                    {count}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: bottomInset + 20 }}
        showsVerticalScrollIndicator={false}
      >
        {filteredPosts.length === 0 ? (
          <View style={{ alignItems: "center", paddingTop: 60 }}>
            <Ionicons name="chatbubbles-outline" size={48} color={Colors.textLight} />
            <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 14, color: Colors.textLight, marginTop: 12 }}>
              No posts found
            </Text>
          </View>
        ) : (
          filteredPosts.map((post) => {
            const isVendor = post.userRole === "VENDOR";
            const commentCount = communityComments.filter((c) => c.postId === post.id).length;
            return (
              <Pressable
                key={post.id}
                onPress={() => openPostDetail(post)}
                style={{
                  backgroundColor: "#FFF",
                  borderRadius: 14,
                  marginBottom: 10,
                  overflow: "hidden",
                  borderWidth: post.isPinned ? 2 : post.isHidden ? 1 : 0,
                  borderColor: post.isPinned ? "#8B5CF6" : post.isHidden ? "#EF4444" : "transparent",
                  opacity: post.isHidden ? 0.65 : 1,
                }}
              >
                {(post.isPinned || post.isHidden) && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 12,
                      paddingVertical: 4,
                      backgroundColor: post.isPinned ? "#8B5CF620" : "#EF444420",
                    }}
                  >
                    <Ionicons
                      name={post.isPinned ? "pin" : "eye-off"}
                      size={12}
                      color={post.isPinned ? "#8B5CF6" : "#EF4444"}
                    />
                    <Text
                      style={{
                        fontFamily: "Poppins_600SemiBold",
                        fontSize: 10,
                        color: post.isPinned ? "#8B5CF6" : "#EF4444",
                        marginLeft: 4,
                      }}
                    >
                      {post.isPinned ? "PINNED" : "HIDDEN FROM FEED"}
                    </Text>
                  </View>
                )}

                <View style={{ padding: 14 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        backgroundColor: isVendor ? Colors.primary : Colors.secondary,
                        justifyContent: "center",
                        alignItems: "center",
                        marginRight: 10,
                      }}
                    >
                      <Ionicons name={isVendor ? "storefront" : "person"} size={16} color="#FFF" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text }}>
                          {post.userName}
                        </Text>
                        {isVendor && (
                          <View
                            style={{
                              backgroundColor: Colors.primary + "20",
                              paddingHorizontal: 5,
                              paddingVertical: 1,
                              borderRadius: 4,
                              marginLeft: 6,
                            }}
                          >
                            <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 9, color: Colors.primary }}>
                              VENDOR
                            </Text>
                          </View>
                        )}
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            backgroundColor: POST_TYPE_COLORS[post.postType] + "15",
                            paddingHorizontal: 5,
                            paddingVertical: 1,
                            borderRadius: 4,
                            marginRight: 6,
                          }}
                        >
                          <Ionicons
                            name={POST_TYPE_ICONS[post.postType] as any}
                            size={9}
                            color={POST_TYPE_COLORS[post.postType]}
                          />
                          <Text
                            style={{
                              fontFamily: "Poppins_500Medium",
                              fontSize: 9,
                              color: POST_TYPE_COLORS[post.postType],
                              marginLeft: 2,
                            }}
                          >
                            {post.postType}
                          </Text>
                        </View>
                        <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textLight }}>
                          {formatTime(post.createdAt)} ago
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textLight }}>
                      ID: {post.id}
                    </Text>
                  </View>

                  <Text
                    style={{ fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.text, lineHeight: 19 }}
                    numberOfLines={3}
                  >
                    {post.content}
                  </Text>

                  {post.images && post.images.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                      {post.images.map((img, idx) => (
                        <Image
                          key={idx}
                          source={{ uri: img }}
                          style={{ width: 80, height: 60, borderRadius: 8, marginRight: 6 }}
                          resizeMode="cover"
                          accessibilityLabel="Community post image"
                        />
                      ))}
                    </ScrollView>
                  )}

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginTop: 10,
                      paddingTop: 10,
                      borderTopWidth: 1,
                      borderTopColor: Colors.border + "50",
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", marginRight: 14 }}>
                        <Ionicons name="heart" size={14} color="#EF4444" />
                        <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.textLight, marginLeft: 3 }}>
                          {post.likes}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", marginRight: 14 }}>
                        <Ionicons name="chatbubble" size={14} color="#3B82F6" />
                        <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.textLight, marginLeft: 3 }}>
                          {commentCount}
                        </Text>
                      </View>
                      {post.taggedProducts && post.taggedProducts.length > 0 && (
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <Ionicons name="cube" size={14} color="#10B981" />
                          <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 12, color: Colors.textLight, marginLeft: 3 }}>
                            {post.taggedProducts.length}
                          </Text>
                        </View>
                      )}
                    </View>

                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Pressable
                        onPress={() => handlePinPost(post.id)}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          backgroundColor: post.isPinned ? "#8B5CF620" : Colors.background,
                          justifyContent: "center",
                          alignItems: "center",
                          marginRight: 6,
                        }}
                      >
                        <Ionicons name="pin" size={16} color={post.isPinned ? "#8B5CF6" : Colors.textLight} />
                      </Pressable>
                      <Pressable
                        onPress={() => handleHidePost(post.id)}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          backgroundColor: post.isHidden ? "#F59E0B20" : Colors.background,
                          justifyContent: "center",
                          alignItems: "center",
                          marginRight: 6,
                        }}
                      >
                        <Ionicons name={post.isHidden ? "eye" : "eye-off"} size={16} color={post.isHidden ? "#F59E0B" : Colors.textLight} />
                      </Pressable>
                      <Pressable
                        onPress={() => handleDeletePost(post.id, post.userName)}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          backgroundColor: "#FEE2E2",
                          justifyContent: "center",
                          alignItems: "center",
                        }}
                      >
                        <Ionicons name="trash" size={16} color="#EF4444" />
                      </Pressable>
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <Modal visible={showDetailModal} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: "#00000060", justifyContent: "flex-end" }}>
          <View
            style={{
              backgroundColor: "#FFF",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              maxHeight: "85%",
              paddingBottom: bottomInset + 8,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 16,
                paddingTop: 14,
                paddingBottom: 10,
                borderBottomWidth: 1,
                borderBottomColor: Colors.border,
              }}
            >
              <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 18, color: Colors.text }}>
                Post Details
              </Text>
              <Pressable onPress={() => setShowDetailModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textLight} />
              </Pressable>
            </View>

            {selectedPost && (
              <ScrollView contentContainerStyle={{ padding: 16 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: selectedPost.userRole === "VENDOR" ? Colors.primary : Colors.secondary,
                      justifyContent: "center",
                      alignItems: "center",
                      marginRight: 12,
                    }}
                  >
                    <Ionicons
                      name={selectedPost.userRole === "VENDOR" ? "storefront" : "person"}
                      size={20}
                      color="#FFF"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 15, color: Colors.text }}>
                      {selectedPost.userName}
                    </Text>
                    <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 11, color: Colors.textLight }}>
                      {selectedPost.userRole} | {selectedPost.postType} | {formatTime(selectedPost.createdAt)} ago
                    </Text>
                  </View>
                </View>

                <Text
                  style={{
                    fontFamily: "Poppins_400Regular",
                    fontSize: 14,
                    color: Colors.text,
                    lineHeight: 21,
                    marginBottom: 12,
                  }}
                >
                  {selectedPost.content}
                </Text>

                {selectedPost.images && selectedPost.images.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                    {selectedPost.images.map((img, idx) => (
                      <Image
                        key={idx}
                        source={{ uri: img }}
                        style={{ width: 160, height: 120, borderRadius: 10, marginRight: 8 }}
                        resizeMode="cover"
                        accessibilityLabel="Community post image"
                      />
                    ))}
                  </ScrollView>
                )}

                {selectedPost.taggedProducts && selectedPost.taggedProducts.length > 0 && (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.text, marginBottom: 6 }}>
                      Tagged Products
                    </Text>
                    {selectedPost.taggedProducts.map((product) => (
                      <View
                        key={product.productId}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          backgroundColor: Colors.background,
                          borderRadius: 10,
                          padding: 8,
                          marginBottom: 4,
                        }}
                      >
                        <Image
                          source={{ uri: product.image }}
                          style={{ width: 40, height: 40, borderRadius: 8, marginRight: 10 }}
                          resizeMode="cover"
                          accessibilityLabel={product.productName}
                        />
                        <Text style={{ fontFamily: "Poppins_500Medium", fontSize: 13, color: Colors.text, flex: 1 }}>
                          {product.productName}
                        </Text>
                        <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 13, color: Colors.primary }}>
                          ₹{product.price}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: Colors.background,
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 14,
                  }}
                >
                  <View style={{ alignItems: "center", flex: 1 }}>
                    <Ionicons name="heart" size={18} color="#EF4444" />
                    <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.text }}>
                      {selectedPost.likes}
                    </Text>
                    <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textLight }}>Likes</Text>
                  </View>
                  <View style={{ width: 1, height: 30, backgroundColor: Colors.border }} />
                  <View style={{ alignItems: "center", flex: 1 }}>
                    <Ionicons name="chatbubble" size={18} color="#3B82F6" />
                    <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.text }}>
                      {postComments.length}
                    </Text>
                    <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textLight }}>Comments</Text>
                  </View>
                  <View style={{ width: 1, height: 30, backgroundColor: Colors.border }} />
                  <View style={{ alignItems: "center", flex: 1 }}>
                    <Ionicons name="images" size={18} color="#10B981" />
                    <Text style={{ fontFamily: "Poppins_700Bold", fontSize: 16, color: Colors.text }}>
                      {selectedPost.images?.length || 0}
                    </Text>
                    <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textLight }}>Images</Text>
                  </View>
                </View>

                <View style={{ flexDirection: "row", marginBottom: 16 }}>
                  <Pressable
                    onPress={() => handlePinPost(selectedPost.id)}
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      paddingVertical: 10,
                      borderRadius: 10,
                      marginRight: 6,
                      backgroundColor: selectedPost.isPinned ? "#8B5CF6" : Colors.background,
                    }}
                  >
                    <Ionicons name="pin" size={16} color={selectedPost.isPinned ? "#FFF" : "#8B5CF6"} />
                    <Text
                      style={{
                        fontFamily: "Poppins_600SemiBold",
                        fontSize: 13,
                        color: selectedPost.isPinned ? "#FFF" : "#8B5CF6",
                        marginLeft: 6,
                      }}
                    >
                      {selectedPost.isPinned ? "Unpin" : "Pin"}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleHidePost(selectedPost.id)}
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      paddingVertical: 10,
                      borderRadius: 10,
                      marginRight: 6,
                      backgroundColor: selectedPost.isHidden ? "#F59E0B" : Colors.background,
                    }}
                  >
                    <Ionicons
                      name={selectedPost.isHidden ? "eye" : "eye-off"}
                      size={16}
                      color={selectedPost.isHidden ? "#FFF" : "#F59E0B"}
                    />
                    <Text
                      style={{
                        fontFamily: "Poppins_600SemiBold",
                        fontSize: 13,
                        color: selectedPost.isHidden ? "#FFF" : "#F59E0B",
                        marginLeft: 6,
                      }}
                    >
                      {selectedPost.isHidden ? "Unhide" : "Hide"}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleDeletePost(selectedPost.id, selectedPost.userName)}
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      paddingVertical: 10,
                      borderRadius: 10,
                      backgroundColor: "#FEE2E2",
                    }}
                  >
                    <Ionicons name="trash" size={16} color="#EF4444" />
                    <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 13, color: "#EF4444", marginLeft: 6 }}>
                      Delete
                    </Text>
                  </Pressable>
                </View>

                <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 14, color: Colors.text, marginBottom: 8 }}>
                  Comments ({postComments.length})
                </Text>
                {postComments.length === 0 ? (
                  <View
                    style={{
                      backgroundColor: Colors.background,
                      borderRadius: 10,
                      padding: 20,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 13, color: Colors.textLight }}>
                      No comments on this post
                    </Text>
                  </View>
                ) : (
                  postComments.map((comment) => (
                    <View
                      key={comment.id}
                      style={{
                        flexDirection: "row",
                        backgroundColor: Colors.background,
                        borderRadius: 10,
                        padding: 10,
                        marginBottom: 6,
                      }}
                    >
                      <View
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 15,
                          backgroundColor: Colors.secondary,
                          justifyContent: "center",
                          alignItems: "center",
                          marginRight: 10,
                          marginTop: 2,
                        }}
                      >
                        <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 11, color: "#FFF" }}>
                          {comment.userName.charAt(0)}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 12, color: Colors.text }}>
                            {comment.userName}
                          </Text>
                          <Text
                            style={{
                              fontFamily: "Poppins_400Regular",
                              fontSize: 10,
                              color: Colors.textLight,
                              marginLeft: 8,
                            }}
                          >
                            {formatTime(comment.createdAt)}
                          </Text>
                        </View>
                        <Text
                          style={{
                            fontFamily: "Poppins_400Regular",
                            fontSize: 13,
                            color: Colors.text,
                            marginTop: 2,
                          }}
                        >
                          {comment.text}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => handleDeleteComment(comment.id, comment.postId)}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 14,
                          backgroundColor: "#FEE2E2",
                          justifyContent: "center",
                          alignItems: "center",
                          alignSelf: "center",
                        }}
                      >
                        <Ionicons name="trash" size={14} color="#EF4444" />
                      </Pressable>
                    </View>
                  ))
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
