import React, { useEffect, useState, useRef } from "react";
import {
  FlatList,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Image,
  Modal,
  Clipboard,
  Alert,
  Dimensions
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchWaMessages, sendWaMessage, whatsappApi, WaMessage } from "../../../api/whatsapp.api";
import { useShopStore } from "../../../auth/shop-store";
import { useAuthStore } from "../../../auth/auth-store";
import { colors as Colors } from "../../../theme";
import { format } from "date-fns";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useWhatsAppRealtime } from "../hooks/useWhatsAppRealtime";

const EMOJI_PICKER_LIST = [
  "🔥", "👏", "🎉", "🚀", "👀", "💯", "🤔", "😭",
  "💀", "💩", "🤷", "🤦", "🎈", "✨", "💔", "❤️‍🔥",
  "✅", "❌", "💰", "📦"
];

const STANDARD_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export const ChatDetailScreen = () => {
  const route = useRoute<any>();
  const navigation = useNavigation();
  const { conversationId, phone } = route.params;
  const activeShopId = useShopStore((state) => state.activeShopId);
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  const [inputText, setInputText] = useState("");
  const [replyingTo, setReplyingTo] = useState<WaMessage | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<WaMessage | null>(null);
  const [reactionMenuVisible, setReactionMenuVisible] = useState(false);
  const [customEmojiVisible, setCustomEmojiVisible] = useState(false);

  const flatListRef = useRef<FlatList>(null);

  // Subscribe to real-time events for this conversation
  useWhatsAppRealtime(conversationId);

  // Fetch messages via React Query (uses offline cache from MMKV)
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["wa-messages", conversationId],
    queryFn: async () => {
      if (!token) return [];
      const res = await fetchWaMessages(token, conversationId);
      return res;
    },
    enabled: !!conversationId && !!token,
  });

  // Automatically scroll to end on load or when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 300);
    }
  }, [messages.length]);

  // Send Message Mutation
  const sendMutation = useMutation({
    mutationFn: async (payload: {
      shopId: string;
      conversationId: string;
      to: string;
      type: "TEXT";
      content: { text: string };
      replyToMessageId?: string;
    }) => {
      if (!token) throw new Error("No auth token");
      return sendWaMessage(token, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wa-messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["wa-conversations", activeShopId] });
      setReplyingTo(null);
    },
    onError: (err) => {
      Alert.alert("Send Error", err.message || "Failed to send message");
    }
  });

  // Send Reaction Mutation
  const reactionMutation = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!activeShopId) throw new Error("No active shop");
      return whatsappApi.sendReaction({
        shopId: activeShopId,
        to: phone,
        messageId,
        emoji,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wa-messages", conversationId] });
      setReactionMenuVisible(false);
      setCustomEmojiVisible(false);
      setSelectedMessage(null);
    },
    onError: (err) => {
      Alert.alert("Reaction Error", err.message || "Failed to add reaction");
    }
  });

  // Delete Message Mutation
  const deleteMutation = useMutation({
    mutationFn: async (messageId: string) => {
      if (!activeShopId) throw new Error("No active shop");
      return whatsappApi.deleteMessage(activeShopId, messageId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wa-messages", conversationId] });
      setReactionMenuVisible(false);
      setSelectedMessage(null);
    },
    onError: (err) => {
      Alert.alert("Delete Error", err.message || "Failed to delete message");
    }
  });

  const handleSend = () => {
    if (!inputText.trim() || !activeShopId || !token) return;

    sendMutation.mutate({
      shopId: activeShopId,
      conversationId,
      to: phone,
      type: "TEXT",
      content: { text: inputText.trim() },
      replyToMessageId: replyingTo?.id,
    });

    setInputText("");
  };

  const handleLongPress = (message: WaMessage) => {
    if (message.status === "DELETED") return; // No actions on recalled messages
    setSelectedMessage(message);
    setReactionMenuVisible(true);
  };

  const handleCopyText = () => {
    if (selectedMessage?.content?.text) {
      Clipboard.setString(selectedMessage.content.text);
    }
    setReactionMenuVisible(false);
    setSelectedMessage(null);
  };

  const handleReplyPress = () => {
    if (selectedMessage) {
      setReplyingTo(selectedMessage);
    }
    setReactionMenuVisible(false);
    setSelectedMessage(null);
  };

  const handleReactionPress = (emoji: string) => {
    if (!selectedMessage) return;
    // Toggle reaction off if tapping the same one
    const myExistingReaction = selectedMessage.payload?.reactions?.find(r => r.from === "me");
    const resolvedEmoji = myExistingReaction?.emoji === emoji ? "" : emoji;

    reactionMutation.mutate({
      messageId: selectedMessage.id,
      emoji: resolvedEmoji,
    });
  };

  const handleCustomEmojiSelect = (emoji: string) => {
    if (!selectedMessage) return;
    reactionMutation.mutate({
      messageId: selectedMessage.id,
      emoji,
    });
  };

  const handleDeleteMessage = () => {
    if (!selectedMessage) return;
    Alert.alert(
      "Recall Message",
      "Are you sure you want to recall/delete this message? It will be deleted for everyone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate(selectedMessage.id),
        },
      ]
    );
  };

  const scrollToParent = (replyToMetaId: string) => {
    const index = messages.findIndex((m) => m.metaMessageId === replyToMetaId);
    if (index !== -1) {
      try {
        flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
      } catch (err) {
        // Fallback if layout hasn't computed yet
        flatListRef.current?.scrollToOffset({
          offset: index * 80,
          animated: true,
        });
      }
    }
  };

  const renderMessageStatus = (status: string) => {
    switch (status) {
      case "QUEUED":
        return <MaterialCommunityIcons name="clock-outline" size={14} color={Colors.textSecondary} />;
      case "SENT":
        return <MaterialCommunityIcons name="check" size={14} color={Colors.textSecondary} />;
      case "DELIVERED":
        return <MaterialCommunityIcons name="check-all" size={14} color={Colors.textSecondary} />;
      case "READ":
        return <MaterialCommunityIcons name="check-all" size={14} color="#34B7F1" />;
      case "FAILED":
        return <MaterialCommunityIcons name="alert-circle-outline" size={14} color="#EF4444" />;
      default:
        return null;
    }
  };

  const renderMessage = ({ item }: { item: WaMessage }) => {
    const isOutbound = item.direction === "OUTBOUND";
    const isDeleted = item.status === "DELETED";

    // Find parent message for reply rendering
    const parentMessage = item.replyToMetaMessageId
      ? messages.find((m) => m.metaMessageId === item.replyToMetaMessageId)
      : null;

    // Aggregate reaction emojis and counts
    const reactions = item.payload?.reactions || [];
    const reactionSummary = reactions.reduce((acc: { [emoji: string]: number }, cur) => {
      acc[cur.emoji] = (acc[cur.emoji] || 0) + 1;
      return acc;
    }, {});

    const uniqueEmojis = Object.keys(reactionSummary);

    return (
      <View style={[styles.messageRow, isOutbound ? { justifyContent: "flex-end" } : { justifyContent: "flex-start" }]}>
        <TouchableOpacity
          activeOpacity={0.9}
          onLongPress={() => handleLongPress(item)}
          onPress={() => {
            // Tapping a deleted message does nothing
          }}
          style={[
            styles.bubble,
            isOutbound ? styles.outboundBubble : styles.inboundBubble,
            isDeleted && styles.deletedBubble,
            { marginBottom: uniqueEmojis.length > 0 ? 12 : 6 }
          ]}
        >
          {/* Reply Quote Display */}
          {!isDeleted && parentMessage && (
            <TouchableOpacity
              style={styles.replyQuoteBox}
              onPress={() => scrollToParent(item.replyToMetaMessageId!)}
            >
              <View style={styles.replyQuoteBorder} />
              <View style={{ flex: 1 }}>
                <Text style={styles.replyQuoteSender} numberOfLines={1}>
                  {parentMessage.direction === "OUTBOUND" ? "You" : "Customer"}
                </Text>
                <Text style={styles.replyQuoteText} numberOfLines={1}>
                  {parentMessage.content?.text || "[Media/Attachment]"}
                </Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Main Message Content */}
          {isDeleted ? (
            <View style={styles.deletedRow}>
              <MaterialCommunityIcons name="block-helper" size={15} color={Colors.textSecondary} style={{ marginRight: 6 }} />
              <Text style={styles.deletedText}>This message was deleted</Text>
            </View>
          ) : (
            <>
              {item.type === "TEXT" && <Text style={styles.messageText}>{item.content?.text}</Text>}
              {item.type === "IMAGE" && (
                <Image source={{ uri: item.mediaUrl }} style={styles.messageImage} resizeMode="cover" />
              )}
              {item.type === "DOCUMENT" && (
                <View style={styles.docRow}>
                  <MaterialCommunityIcons name="file-document-outline" size={28} color={Colors.primary} />
                  <Text style={styles.docText} numberOfLines={1}>{item.fileName || "Document"}</Text>
                </View>
              )}
            </>
          )}

          <View style={styles.messageFooter}>
            <Text style={styles.messageTime}>{format(new Date(item.createdAt), "hh:mm a")}</Text>
            {isOutbound && (
              <View style={{ marginLeft: 4 }}>
                {renderMessageStatus(item.status)}
              </View>
            )}
          </View>

          {/* Corner Reaction Badges */}
          {!isDeleted && uniqueEmojis.length > 0 && (
            <View style={[styles.reactionBadgeContainer, isOutbound ? { right: 8 } : { left: 8 }]}>
              {uniqueEmojis.map((emoji) => (
                <Text key={emoji} style={styles.reactionBadgeEmoji}>{emoji}</Text>
              ))}
              {reactions.length > 1 && (
                <Text style={styles.reactionBadgeCount}>{reactions.length}</Text>
              )}
            </View>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
      />

      {/* Reply Quoting Bar (if replying) */}
      {replyingTo && (
        <View style={styles.replyingBar}>
          <View style={styles.replyingBorder} />
          <View style={{ flex: 1, paddingHorizontal: 10 }}>
            <Text style={styles.replyingTitle}>
              Replying to {replyingTo.direction === "OUTBOUND" ? "You" : "Customer"}
            </Text>
            <Text style={styles.replyingText} numberOfLines={1}>
              {replyingTo.content?.text || "[Media/Attachment]"}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setReplyingTo(null)} style={styles.replyingClose}>
            <MaterialCommunityIcons name="close-circle" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Message Input Bar */}
      <View style={styles.inputToolbar}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          value={inputText}
          onChangeText={setInputText}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendButton, !inputText.trim() && { backgroundColor: Colors.borderStrong }]}
          onPress={handleSend}
          disabled={!inputText.trim()}
        >
          <MaterialCommunityIcons name="send" size={20} color={"#fff"} />
        </TouchableOpacity>
      </View>

      {/* Long Press Reaction Overlay Modal */}
      <Modal
        visible={reactionMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReactionMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setReactionMenuVisible(false)}
        >
          <View style={styles.reactionBarContainer}>
            {/* Quick Reactions */}
            <View style={styles.quickReactionsRow}>
              {STANDARD_REACTIONS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  onPress={() => handleReactionPress(emoji)}
                  style={styles.reactionPill}
                >
                  <Text style={styles.reactionText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
              {/* + Icon for Custom Emoji Grid */}
              <TouchableOpacity
                onPress={() => setCustomEmojiVisible(true)}
                style={[styles.reactionPill, { backgroundColor: "#F3F4F6" }]}
              >
                <MaterialCommunityIcons name="plus" size={22} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Actions Menu */}
            <View style={styles.actionMenu}>
              <TouchableOpacity style={styles.menuItem} onPress={handleReplyPress}>
                <MaterialCommunityIcons name="reply" size={22} color={Colors.textPrimary} />
                <Text style={styles.menuItemText}>Reply</Text>
              </TouchableOpacity>

              {selectedMessage?.content?.text && (
                <TouchableOpacity style={styles.menuItem} onPress={handleCopyText}>
                  <MaterialCommunityIcons name="content-copy" size={22} color={Colors.textPrimary} />
                  <Text style={styles.menuItemText}>Copy Text</Text>
                </TouchableOpacity>
              )}

              {selectedMessage?.direction === "OUTBOUND" && (
                <TouchableOpacity style={styles.menuItem} onPress={handleDeleteMessage}>
                  <MaterialCommunityIcons name="trash-can-outline" size={22} color="#DC2626" />
                  <Text style={[styles.menuItemText, { color: "#DC2626" }]}>Recall Message</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Custom Emoji Picker Grid Modal */}
      <Modal
        visible={customEmojiVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCustomEmojiVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setCustomEmojiVisible(false)}
        >
          <View style={styles.customEmojiContainer}>
            <Text style={styles.customEmojiHeader}>Select Reaction</Text>
            <View style={styles.emojiGrid}>
              {EMOJI_PICKER_LIST.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.emojiGridItem}
                  onPress={() => handleCustomEmojiSelect(emoji)}
                >
                  <Text style={styles.emojiGridText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const { width } = Dimensions.get("window");

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#E5DDD5" },
  listContent: { padding: 10, paddingBottom: 20 },
  messageRow: { flexDirection: "row", width: "100%" },
  bubble: {
    padding: 10,
    borderRadius: 12,
    marginVertical: 4,
    maxWidth: "80%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  inboundBubble: { backgroundColor: "#fff" },
  outboundBubble: { backgroundColor: "#DCF8C6" },
  deletedBubble: { backgroundColor: "#E1E1E6", borderStyle: "dashed" },
  messageText: { fontSize: 16, color: "#1F2937" },
  messageImage: { width: 220, height: 220, borderRadius: 8, marginBottom: 5 },
  docRow: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.05)", padding: 8, borderRadius: 8, maxWidth: 220 },
  docText: { marginLeft: 8, fontSize: 14, fontWeight: "500", flex: 1 },
  messageFooter: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", marginTop: 4 },
  messageTime: { fontSize: 10, color: Colors.textSecondary },
  deletedRow: { flexDirection: "row", alignItems: "center" },
  deletedText: { fontStyle: "italic", color: Colors.textSecondary, fontSize: 14 },
  
  // Reply Quote Box Inside Message Bubble
  replyQuoteBox: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: 6,
    padding: 6,
    marginBottom: 6,
  },
  replyQuoteBorder: {
    width: 4,
    backgroundColor: Colors.primary,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
    marginRight: 6,
  },
  replyQuoteSender: { fontSize: 12, fontWeight: "bold", color: Colors.primary },
  replyQuoteText: { fontSize: 13, color: Colors.textSecondary },

  // Reaction Badge Layout on Bubble Corner
  reactionBadgeContainer: {
    position: "absolute",
    bottom: -10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 1,
    elevation: 2,
  },
  reactionBadgeEmoji: { fontSize: 12, marginHorizontal: 0.5 },
  reactionBadgeCount: { fontSize: 10, fontWeight: "600", marginLeft: 2, color: Colors.textSecondary },

  // Reply Bar (Above Keyboard Input)
  replyingBar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    padding: 10,
    alignItems: "center",
  },
  replyingBorder: { width: 4, height: "100%", backgroundColor: Colors.primary, borderRadius: 2 },
  replyingTitle: { fontSize: 12, fontWeight: "bold", color: Colors.primary },
  replyingText: { fontSize: 13, color: Colors.textSecondary },
  replyingClose: { padding: 4 },

  // Input Toolbar
  inputToolbar: {
    flexDirection: "row",
    padding: 10,
    backgroundColor: "#fff",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    borderRadius: 22,
    paddingHorizontal: 15,
    paddingVertical: 8,
    fontSize: 16,
    maxHeight: 100,
    color: "#1F2937",
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 10,
  },

  // Modal Overlays
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "flex-end",
  },
  reactionBarContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === "ios" ? 40 : 20,
  },
  quickReactionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  reactionPill: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  reactionText: { fontSize: 24 },
  actionMenu: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
  },
  menuItemText: {
    fontSize: 16,
    marginLeft: 15,
    color: Colors.textPrimary,
    fontWeight: "500",
  },

  // Custom Emoji Grid Picker
  customEmojiContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "50%",
    paddingBottom: Platform.OS === "ios" ? 40 : 20,
  },
  customEmojiHeader: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
    color: Colors.textPrimary,
    textAlign: "center",
  },
  emojiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  emojiGridItem: {
    width: (width - 60) / 5,
    height: 60,
    justifyContent: "center",
    alignItems: "center",
  },
  emojiGridText: { fontSize: 32 },
});
