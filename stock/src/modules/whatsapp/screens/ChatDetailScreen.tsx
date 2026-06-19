import { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Alert,
} from "react-native";
import { FlashList } from "@shopify/flash-list";

const FlashListAny = FlashList as any;
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useRoute, useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchWaMessages,
  sendWaMessage,
  uploadWaMedia,
  whatsappApi,
  WaLocalMedia,
  WaMessage,
  WaOutboundMessage,
  WaSendCommand,
} from "../../../api/whatsapp.api";
import { useShopStore } from "../../../auth/shop-store";
import { useAuthStore } from "../../../auth/auth-store";
import { useCustomersQuery } from "../../../hooks/useCustomers";
import { colors as Colors } from "../../../theme";
import { format } from "date-fns";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useWhatsAppRealtime } from "../hooks/useWhatsAppRealtime";
import { MessageActionSheet } from "../components/MessageActionSheet";
import { MediaAttachmentSheet } from "../components/MediaAttachmentSheet";
import { VoiceRecorderSheet } from "../components/VoiceRecorderSheet";
import { MessageContentRenderer } from "../components/MessageContentRenderer";
import { TemplateSendSheet } from "../components/TemplateSendSheet";
import { initialsFor, waColors } from "../whatsapp-ui";

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
  const [showMessageActions, setShowMessageActions] = useState(false);
  const [locating, setLocating] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<WaLocalMedia | null>(null);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [mediaCaption, setMediaCaption] = useState("");
  const [mediaUploadProgress, setMediaUploadProgress] = useState(0);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  // Template Picker State
  const [showTemplateSheet, setShowTemplateSheet] = useState(false);

  const flatListRef = useRef<any>(null);
  const emojiInputRef = useRef<TextInput>(null);
  const mediaUploadControllerRef = useRef<AbortController | null>(null);

  // Mark conversation as read on focus / load
  useEffect(() => {
    if (activeShopId && conversationId) {
      whatsappApi.markConversationRead(activeShopId, conversationId)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["wa-conversations", activeShopId] });
        })
        .catch((err) => {
          console.warn("Failed to mark conversation read", err);
        });
    }
  }, [activeShopId, conversationId]);

  // Load wa-conversations cache to find active conversation metadata
  const { data: conversations = [] } = useQuery<any[]>({
    queryKey: ["wa-conversations", activeShopId],
    enabled: false,
  });

  const conversation = conversations.find((c: any) => c.id === conversationId);

  // Load server-side customers to resolve dynamic variables (e.g. outstandingAmount)
  const { data: customers = [] } = useCustomersQuery();
  const customerRecord = customers.find((c: any) => c.id === conversation?.customerId);

  // Set custom header with contact name, avatar, and linked customer shortcut
  useEffect(() => {
    const contactName = conversation?.contactName || `+${phone}`;
    const initials = initialsFor(conversation?.contactName || phone);

    navigation.setOptions({
      headerShown: true,
      headerStyle: { backgroundColor: waColors.greenDark },
      headerTintColor: "#fff",
      headerShadowVisible: false,
      headerTitle: () => (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: "rgba(255,255,255,0.2)",
            justifyContent: "center",
            alignItems: "center",
            marginRight: 10,
          }}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{initials}</Text>
          </View>
          <View style={{ maxWidth: 190 }}>
            <Text style={{ fontWeight: "700", fontSize: 16, color: "#fff" }} numberOfLines={1}>
              {contactName}
            </Text>
            <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.78)" }} numberOfLines={1}>
              {conversation?.customer ? "Linked Customer" : `+${phone}`}
            </Text>
          </View>
        </View>
      ),
      headerRight: () => conversation?.customerId ? (
        <TouchableOpacity
          onPress={() => (navigation as any).navigate("CustomerDetail", { customerId: conversation.customerId })}
          style={{ marginRight: 12, padding: 4 }}
        >
          <MaterialCommunityIcons name="account-details" size={23} color="#fff" />
        </TouchableOpacity>
      ) : null,
      headerTitleAlign: "left",
    });
  }, [navigation, conversation, phone]);

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
    mutationFn: async (payload: WaSendCommand) => {
      if (!token) throw new Error("No auth token");
      return sendWaMessage(token, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wa-messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["wa-conversations", activeShopId] });
      setReplyingTo(null);
    },
    onError: (err: any) => {
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
      message: {
        kind: "text",
        text: inputText.trim(),
        previewUrl: /https?:\/\/\S+/i.test(inputText),
      },
      replyToMessageId: replyingTo?.id,
    });

    setInputText("");
  };

  const sendStructuredMessage = (message: WaOutboundMessage) => {
    if (!activeShopId) return;
    sendMutation.mutate({
      shopId: activeShopId,
      conversationId,
      to: phone,
      message,
      replyToMessageId: replyingTo?.id,
    });
  };

  const shareLinkedContact = () => {
    if (!customerRecord?.name || !customerRecord?.phone) {
      Alert.alert("Contact unavailable", "Link this conversation to a customer with a phone number first.");
      return;
    }

    sendStructuredMessage({
      kind: "contacts",
      contacts: [{
        name: { formatted_name: customerRecord.name },
        phones: [{ phone: customerRecord.phone, type: "WORK" }],
      }],
    });
  };

  const shareCurrentLocation = async () => {
    if (!activeShopId || locating) return false;

    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        Alert.alert(
          "Location permission required",
          "Allow location access to share your current position in this conversation.",
        );
        return false;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      sendStructuredMessage({
        kind: "location",
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      return true;
    } catch (error) {
      Alert.alert(
        "Location unavailable",
        error instanceof Error ? error.message : "Could not determine your current location.",
      );
      return false;
    } finally {
      setLocating(false);
    }
  };

  const pickMedia = async (kind: "image" | "video" | "document") => {
    try {
      if (kind === "document") {
        const result = await DocumentPicker.getDocumentAsync({
          type: [
            "application/pdf",
            "application/msword",
            "application/vnd.ms-excel",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "text/plain",
          ],
          copyToCacheDirectory: true,
          multiple: false,
        });
        if (result.canceled) return;
        const asset = result.assets[0];
        if (asset.size && asset.size > 100 * 1024 * 1024) {
          Alert.alert("File too large", "WhatsApp documents must be 100 MB or smaller.");
          return;
        }
        setSelectedMedia({
          kind,
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType || "application/octet-stream",
          size: asset.size,
        });
        return;
      }

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Photo access required",
          "Allow photo library access to select WhatsApp attachments.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: [kind === "image" ? "images" : "videos"],
        allowsMultipleSelection: false,
        quality: 1,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      const maxBytes = kind === "image" ? 5 * 1024 * 1024 : 16 * 1024 * 1024;
      if (asset.fileSize && asset.fileSize > maxBytes) {
        Alert.alert(
          "File too large",
          `WhatsApp ${kind === "image" ? "images must be 5 MB" : "videos must be 16 MB"} or smaller.`,
        );
        return;
      }
      const defaultExtension = kind === "image" ? "jpg" : "mp4";
      setSelectedMedia({
        kind,
        uri: asset.uri,
        name: asset.fileName || `whatsapp-${Date.now()}.${defaultExtension}`,
        mimeType: asset.mimeType || (kind === "image" ? "image/jpeg" : "video/mp4"),
        size: asset.fileSize,
        width: asset.width,
        height: asset.height,
      });
    } catch (error) {
      Alert.alert(
        "Attachment unavailable",
        error instanceof Error ? error.message : "Could not open the attachment picker.",
      );
    }
  };

  const closeMediaPreview = () => {
    if (uploadingMedia) return;
    setSelectedMedia(null);
    setMediaCaption("");
    setMediaUploadProgress(0);
  };

  const uploadAndSendMedia = async () => {
    if (!selectedMedia || !activeShopId || !token || uploadingMedia) return;

    setUploadingMedia(true);
    setMediaUploadProgress(0);
    const controller = new AbortController();
    mediaUploadControllerRef.current = controller;
    try {
      const uploaded = await uploadWaMedia(
        token,
        activeShopId,
        selectedMedia,
        setMediaUploadProgress,
        controller.signal,
      );

      if (selectedMedia.kind === "document") {
        sendStructuredMessage({
          kind: "document",
          assetId: uploaded.id,
          filename: uploaded.fileName || selectedMedia.name,
          caption: mediaCaption.trim() || undefined,
        });
      } else {
        sendStructuredMessage({
          kind: selectedMedia.kind,
          assetId: uploaded.id,
          caption: mediaCaption.trim() || undefined,
        });
      }
      setSelectedMedia(null);
      setMediaCaption("");
      setMediaUploadProgress(0);
    } catch (error) {
      if (controller.signal.aborted) return;
      Alert.alert(
        "Upload failed",
        error instanceof Error ? error.message : "Could not upload this attachment.",
      );
    } finally {
      mediaUploadControllerRef.current = null;
      setUploadingMedia(false);
    }
  };

  const uploadAndSendVoice = async (media: WaLocalMedia) => {
    if (!activeShopId || !token || uploadingMedia) return;

    setUploadingMedia(true);
    setMediaUploadProgress(0);
    const controller = new AbortController();
    mediaUploadControllerRef.current = controller;
    try {
      const uploaded = await uploadWaMedia(
        token,
        activeShopId,
        media,
        setMediaUploadProgress,
        controller.signal,
      );
      sendStructuredMessage({
        kind: "audio",
        assetId: uploaded.id,
        voice: true,
      });
      setShowVoiceRecorder(false);
      setMediaUploadProgress(0);
    } catch (error) {
      if (controller.signal.aborted) return;
      Alert.alert(
        "Upload failed",
        error instanceof Error ? error.message : "Could not upload this voice message.",
      );
    } finally {
      mediaUploadControllerRef.current = null;
      setUploadingMedia(false);
    }
  };

  const cancelMediaUpload = () => {
    mediaUploadControllerRef.current?.abort();
    setMediaUploadProgress(0);
  };

  const handleLongPress = (message: WaMessage) => {
    if (message.status === "DELETED") return; // No actions on recalled messages
    setSelectedMessage(message);
    setReactionMenuVisible(true);
  };

  const handleCopyText = async () => {
    if (selectedMessage?.content?.text) {
      await Clipboard.setStringAsync(selectedMessage.content.text);
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

          {isDeleted ? (
            <View style={styles.deletedRow}>
              <MaterialCommunityIcons name="block-helper" size={15} color={Colors.textSecondary} style={{ marginRight: 6 }} />
              <Text style={styles.deletedText}>This message was deleted</Text>
            </View>
          ) : (
            <MessageContentRenderer message={item} />
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
      <FlashListAny
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item: any) => item.id}
        estimatedItemSize={100}
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
            <MaterialCommunityIcons name="close" size={20} color={waColors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Message Input Bar */}
      <View style={styles.inputToolbar}>
        <TouchableOpacity
          style={styles.templateToolbarBtn}
          onPress={() => setShowMessageActions(true)}
        >
          <MaterialCommunityIcons name="plus" size={26} color={waColors.textSecondary} />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor={waColors.textMuted}
          value={inputText}
          onChangeText={setInputText}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim()}
        >
          <MaterialCommunityIcons name="send" size={20} color={"#fff"} />
        </TouchableOpacity>
      </View>

      <MessageActionSheet
        visible={showMessageActions}
        canShareContact={Boolean(customerRecord?.name && customerRecord?.phone)}
        locating={locating}
        sending={sendMutation.isPending}
        onClose={() => setShowMessageActions(false)}
        onOpenTemplates={() => setShowTemplateSheet(true)}
        onPickMedia={pickMedia}
        onRecordVoice={() => setShowVoiceRecorder(true)}
        onShareContact={shareLinkedContact}
        onShareLocation={shareCurrentLocation}
        onSend={sendStructuredMessage}
      />

      <MediaAttachmentSheet
        media={selectedMedia}
        caption={mediaCaption}
        progress={mediaUploadProgress}
        uploading={uploadingMedia}
        onCaptionChange={setMediaCaption}
        onCancelUpload={cancelMediaUpload}
        onClose={closeMediaPreview}
        onSend={uploadAndSendMedia}
      />

      <VoiceRecorderSheet
        visible={showVoiceRecorder}
        uploading={uploadingMedia}
        uploadProgress={mediaUploadProgress}
        onClose={() => {
          if (!uploadingMedia) setShowVoiceRecorder(false);
        }}
        onCancelUpload={cancelMediaUpload}
        onSend={uploadAndSendVoice}
      />

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

      {/* Native Emoji Picker Input Modal */}
      <Modal
        visible={customEmojiVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCustomEmojiVisible(false)}
        onShow={() => {
          setTimeout(() => emojiInputRef.current?.focus(), 150);
        }}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setCustomEmojiVisible(false)}
        >
          <View style={styles.nativeEmojiContainer}>
            <Text style={styles.nativeEmojiHeader}>React with Emoji</Text>
            <Text style={styles.nativeEmojiSub}>Use your system keyboard's emoji key to select any emoji</Text>
            <TextInput
              ref={emojiInputRef}
              style={styles.nativeEmojiInput}
              placeholder="😊"
              maxLength={4}
              onChangeText={(text) => {
                if (text.trim()) {
                  handleCustomEmojiSelect(text.trim());
                  setCustomEmojiVisible(false);
                }
              }}
              autoFocus
            />
            <TouchableOpacity
              style={styles.nativeEmojiCloseBtn}
              onPress={() => setCustomEmojiVisible(false)}
            >
              <Text style={styles.nativeEmojiCloseBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <TemplateSendSheet
        visible={showTemplateSheet}
        shopId={activeShopId}
        conversationId={conversationId}
        to={phone}
        replyToMessageId={replyingTo?.id}
        onClose={() => setShowTemplateSheet(false)}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: waColors.chatBackground },
  listContent: { paddingHorizontal: 8, paddingVertical: 10, paddingBottom: 14 },
  messageRow: { flexDirection: "row", width: "100%" },
  bubble: {
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 8,
    marginVertical: 2,
    maxWidth: "82%",
  },
  inboundBubble: { backgroundColor: "#fff" },
  outboundBubble: { backgroundColor: waColors.greenPale },
  deletedBubble: { backgroundColor: waColors.surfaceMuted, borderStyle: "dashed" },
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
    backgroundColor: waColors.green,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
    marginRight: 6,
  },
  replyQuoteSender: { fontSize: 12, fontWeight: "bold", color: waColors.greenDark },
  replyQuoteText: { fontSize: 13, color: Colors.textSecondary },

  // Reaction Badge Layout on Bubble Corner
  reactionBadgeContainer: {
    position: "absolute",
    bottom: -10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: waColors.surface,
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
  replyingBorder: { width: 4, height: "100%", backgroundColor: waColors.green, borderRadius: 2 },
  replyingTitle: { fontSize: 12, fontWeight: "bold", color: waColors.greenDark },
  replyingText: { fontSize: 13, color: Colors.textSecondary },
  replyingClose: { padding: 4 },

  // Input Toolbar
  inputToolbar: {
    flexDirection: "row",
    paddingHorizontal: 7,
    paddingVertical: 6,
    backgroundColor: waColors.chatBackground,
    alignItems: "center",
  },
  input: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 24,
    paddingHorizontal: 15,
    paddingVertical: 9,
    fontSize: 16,
    maxHeight: 100,
    color: waColors.textPrimary,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: waColors.green,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 7,
  },
  sendButtonDisabled: { backgroundColor: waColors.textMuted },

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

  // Native Emoji Picker Input
  nativeEmojiContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    alignItems: "center",
    paddingBottom: Platform.OS === "ios" ? 40 : 20,
  },
  nativeEmojiHeader: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 5,
    color: Colors.textPrimary,
  },
  nativeEmojiSub: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 20,
    textAlign: "center",
  },
  nativeEmojiInput: {
    width: 80,
    height: 80,
    backgroundColor: "#F3F4F6",
    borderRadius: 40,
    textAlign: "center",
    fontSize: 40,
    color: "#000",
    marginBottom: 20,
  },
  nativeEmojiCloseBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  nativeEmojiCloseBtnText: {
    color: Colors.textSecondary,
    fontSize: 16,
    fontWeight: "600",
  },
  templateToolbarBtn: {
    padding: 6,
    marginRight: 4,
  },
  bottomSheetContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: "80%",
    width: "100%",
  },
  formContainer: {
    flex: 1,
  },
  listContainer: {
    flex: 1,
    padding: 15,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: Colors.textPrimary,
    flex: 1,
    textAlign: "center",
    marginHorizontal: 10,
  },
  sheetContent: {
    padding: 15,
  },
  formHeading: {
    fontSize: 16,
    fontWeight: "bold",
    color: Colors.textPrimary,
  },
  formSub: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 15,
  },
  previewCard: {
    backgroundColor: "#F9FAFB",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  previewLabel: {
    fontSize: 11,
    fontWeight: "bold",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  previewText: {
    fontSize: 14,
    color: Colors.textPrimary,
  },
  paramInputGroup: {
    marginBottom: 20,
  },
  paramLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  paramInput: {
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.textPrimary,
  },
  autofillRow: {
    flexDirection: "row",
    marginTop: 8,
    flexWrap: "wrap",
  },
  autofillPill: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    marginRight: 6,
    marginBottom: 6,
  },
  autofillPillText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.primaryDark,
  },
  sendTemplateBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    marginTop: 10,
    paddingVertical: 4,
    marginBottom: 40,
  },
  emptyTemplates: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyTemplatesText: {
    fontSize: 16,
    fontWeight: "bold",
    color: Colors.textPrimary,
    marginTop: 10,
  },
  emptyTemplatesSub: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
    textAlign: "center",
  },
  templateItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  templateItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  templateItemName: {
    fontSize: 15,
    fontWeight: "bold",
    color: Colors.textPrimary,
    flex: 1,
    marginRight: 10,
  },
  templateCategoryBadge: {
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  templateCategoryBadgeText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#0369A1",
  },
  templateItemPreview: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
});
