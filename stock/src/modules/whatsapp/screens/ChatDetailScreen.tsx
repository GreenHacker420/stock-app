import { useEffect, useState, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Image,
  Modal,
  Alert,
  Dimensions,
  ScrollView,
  ActivityIndicator
} from "react-native";
import { FlashList } from "@shopify/flash-list";

const FlashListAny = FlashList as any;
import { Card, Button } from "react-native-paper";
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
import { variableResolverRegistry } from "../services/variableResolver";
import { MessageActionSheet } from "../components/MessageActionSheet";
import { MediaAttachmentSheet } from "../components/MediaAttachmentSheet";



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
  const [mediaCaption, setMediaCaption] = useState("");
  const [mediaUploadProgress, setMediaUploadProgress] = useState(0);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  // Template Picker State
  const [showTemplateSheet, setShowTemplateSheet] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const [templateParams, setTemplateParams] = useState<Record<string, string>>({});

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
    const initials = conversation?.contactName
      ? conversation.contactName.split(" ").map((n: string) => n.charAt(0)).join("").toUpperCase().slice(0, 2)
      : phone.slice(-2);

    navigation.setOptions({
      headerShown: true,
      headerTitle: () => (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: Colors.primaryLight,
            justifyContent: "center",
            alignItems: "center",
            marginRight: 10,
          }}>
            <Text style={{ color: Colors.primaryDark, fontWeight: "bold", fontSize: 13 }}>{initials}</Text>
          </View>
          <View style={{ maxWidth: Dimensions.get("window").width * 0.5 }}>
            <Text style={{ fontWeight: "bold", fontSize: 15, color: Colors.textPrimary }} numberOfLines={1}>
              {contactName}
            </Text>
            <Text style={{ fontSize: 11, color: Colors.textSecondary }}>
              {conversation?.customer ? "Linked Customer" : `+${phone}`}
            </Text>
          </View>
        </View>
      ),
      headerRight: () => conversation?.customerId ? (
        <TouchableOpacity
          onPress={() => (navigation as any).navigate("CustomerDetail", { customerId: conversation.customerId })}
          style={{ marginRight: 10 }}
        >
          <MaterialCommunityIcons name="account-details" size={24} color={Colors.primary} />
        </TouchableOpacity>
      ) : null,
      headerTitleAlign: "left",
    });
  }, [navigation, conversation, phone]);

  // Synced Templates Query
  const { data: templates = [], isLoading: loadingTemplates } = useQuery({
    queryKey: ["wa-templates", activeShopId],
    queryFn: async () => {
      if (!activeShopId) return [];
      const res = await whatsappApi.getTemplates(activeShopId);
      return res.data?.data || [];
    },
    enabled: !!activeShopId,
  });

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
          id: uploaded.id,
          mimeType: uploaded.mimeType,
          localUrl: uploaded.previewUrl,
          storageKey: uploaded.storageKey,
          storageBucket: uploaded.storageBucket,
          filename: uploaded.fileName,
          caption: mediaCaption.trim() || undefined,
        });
      } else {
        sendStructuredMessage({
          kind: selectedMedia.kind,
          id: uploaded.id,
          mimeType: uploaded.mimeType,
          localUrl: uploaded.previewUrl,
          storageKey: uploaded.storageKey,
          storageBucket: uploaded.storageBucket,
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

  // Helper to extract body placeholders sorted numerically
  const templatePlaceholders = useMemo(() => {
    if (!selectedTemplate) return [];
    const bodyComp = selectedTemplate.components?.find((c: any) => c.type === "BODY");
    const bodyText = bodyComp?.text || "";
    const matches: string[] = [];
    const regex = /\{\{(\d+)\}\}/g;
    let match;
    while ((match = regex.exec(bodyText)) !== null) {
      if (!matches.includes(match[1])) {
        matches.push(match[1]);
      }
    }
    return matches.sort((a, b) => Number(a) - Number(b));
  }, [selectedTemplate]);

  const autofillParam = (paramNum: string, key: string) => {
    const value = variableResolverRegistry.resolve(key, {
      conversation,
      customerRecord,
      phone,
    });
    
    setTemplateParams((prev) => ({
      ...prev,
      [paramNum]: value,
    }));
  };


  const handleSendTemplate = () => {
    if (!selectedTemplate || !activeShopId || !token) return;

    // Check if any variable is missing
    const missing = templatePlaceholders.some((p: string) => !(templateParams[p] || "").trim());
    if (missing) {
      Alert.alert("Missing Parameters", "Please fill in all template parameters.");
      return;
    }

    const parameters = templatePlaceholders.map((p: string) => ({
      type: "text",
      text: templateParams[p] || "",
    }));

    const payload = {
      shopId: activeShopId,
      conversationId,
      to: phone,
      message: {
        kind: "template" as const,
        template: {
          name: selectedTemplate.name,
          language: {
            code: selectedTemplate.language,
          },
          components: parameters.length > 0 ? [
            {
              type: "body",
              parameters: parameters,
            },
          ] : [],
        },
      },
    };

    sendMutation.mutate(payload);

    // Reset template sheet and selection states
    setSelectedTemplate(null);
    setTemplateParams({});
    setShowTemplateSheet(false);
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
                <>
                  <Image source={{ uri: item.mediaUrl }} style={styles.messageImage} resizeMode="cover" />
                  {!!(item.content?.caption || item.content?.text) && (
                    <Text style={styles.messageText}>{item.content.caption || item.content.text}</Text>
                  )}
                </>
              )}
              {item.type === "DOCUMENT" && (
                <>
                  <View style={styles.docRow}>
                    <MaterialCommunityIcons name="file-document-outline" size={28} color={Colors.primary} />
                    <Text style={styles.docText} numberOfLines={1}>{item.fileName || "Document"}</Text>
                  </View>
                  {!!item.content?.caption && <Text style={styles.messageText}>{item.content.caption}</Text>}
                </>
              )}
              {item.type === "STICKER" && (
                <Image source={{ uri: item.mediaUrl }} style={styles.messageImage} resizeMode="contain" />
              )}
              {item.type === "AUDIO" && (
                <View style={styles.docRow}>
                  <MaterialCommunityIcons name={item.payload?.voice ? "microphone" : "volume-high"} size={28} color={Colors.primary} />
                  <Text style={styles.docText}>{item.payload?.voice ? "Voice message" : "Audio message"}</Text>
                </View>
              )}
              {item.type === "VIDEO" && (
                <>
                  <View style={styles.docRow}>
                    <MaterialCommunityIcons name="video-outline" size={28} color={Colors.primary} />
                    <Text style={styles.docText}>Video message</Text>
                  </View>
                  {!!item.content?.caption && <Text style={styles.messageText}>{item.content.caption}</Text>}
                </>
              )}
              {item.type === "LOCATION" && (
                <View style={styles.docRow}>
                  <MaterialCommunityIcons name="map-marker-outline" size={28} color={Colors.primary} />
                  <Text style={styles.docText} numberOfLines={2}>
                    {item.content?.name || item.content?.address || "Shared location"}
                  </Text>
                </View>
              )}
              {item.type === "CONTACT_CARD" && (
                <View style={styles.docRow}>
                  <MaterialCommunityIcons name="account-box-outline" size={28} color={Colors.primary} />
                  <Text style={styles.docText}>
                    {Array.isArray(item.content?.contacts) && item.content.contacts.length > 1
                      ? `${item.content.contacts.length} contacts`
                      : Array.isArray(item.content) && item.content.length > 1
                        ? `${item.content.length} contacts`
                      : "Shared contact"}
                  </Text>
                </View>
              )}
              {item.type === "INTERACTIVE" && (
                <View style={styles.docRow}>
                  <MaterialCommunityIcons name="gesture-tap-button" size={28} color={Colors.primary} />
                  <Text style={styles.docText} numberOfLines={2}>
                    {item.content?.body || item.content?.title || item.content?.text || "Interactive response"}
                  </Text>
                </View>
              )}
              {item.type === "FLOW" && (
                <View style={styles.docRow}>
                  <MaterialCommunityIcons name="form-select" size={28} color={Colors.primary} />
                  <Text style={styles.docText}>Flow response</Text>
                </View>
              )}
              {item.type === "ORDER" && (
                <View style={styles.docRow}>
                  <MaterialCommunityIcons name="cart-outline" size={28} color={Colors.primary} />
                  <Text style={styles.docText}>
                    {Array.isArray(item.content?.product_items)
                      ? `Order with ${item.content.product_items.length} item${item.content.product_items.length === 1 ? "" : "s"}`
                      : "WhatsApp order"}
                  </Text>
                </View>
              )}
              {item.type === "SYSTEM" && (
                <View style={styles.docRow}>
                  <MaterialCommunityIcons name="information-outline" size={28} color={Colors.textSecondary} />
                  <Text style={styles.docText} numberOfLines={2}>
                    {item.content?.body || item.content?.type || "WhatsApp system message"}
                  </Text>
                </View>
              )}
              {item.type === "TEMPLATE" && (
                <View style={styles.docRow}>
                  <MaterialCommunityIcons name="card-text-outline" size={28} color={Colors.primary} />
                  <Text style={styles.docText} numberOfLines={2}>
                    {item.templateName || item.content?.template?.name || "Template message"}
                  </Text>
                </View>
              )}
              {item.type === "UNSUPPORTED" && (
                <View style={styles.docRow}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={28} color={Colors.textSecondary} />
                  <Text style={styles.docText}>Unsupported WhatsApp message</Text>
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
            <MaterialCommunityIcons name="close-circle" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Message Input Bar */}
      <View style={styles.inputToolbar}>
        <TouchableOpacity
          style={styles.templateToolbarBtn}
          onPress={() => setShowMessageActions(true)}
        >
          <MaterialCommunityIcons name="plus" size={26} color={Colors.primary} />
        </TouchableOpacity>
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

      <MessageActionSheet
        visible={showMessageActions}
        canShareContact={Boolean(customerRecord?.name && customerRecord?.phone)}
        locating={locating}
        sending={sendMutation.isPending}
        onClose={() => setShowMessageActions(false)}
        onOpenTemplates={() => setShowTemplateSheet(true)}
        onPickMedia={pickMedia}
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

      {/* Template Picker & Variable Editor Bottom Sheet Modal */}
      <Modal
        visible={showTemplateSheet}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowTemplateSheet(false);
          setSelectedTemplate(null);
          setTemplateParams({});
        }}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowTemplateSheet(false);
            setSelectedTemplate(null);
            setTemplateParams({});
          }}
        >
          <View style={styles.bottomSheetContainer}>
            {selectedTemplate ? (
              // Variables Form Editor
              <View style={styles.formContainer}>
                <View style={styles.sheetHeader}>
                  <TouchableOpacity onPress={() => setSelectedTemplate(null)}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.textPrimary} />
                  </TouchableOpacity>
                  <Text style={styles.sheetTitle} numberOfLines={1}>{selectedTemplate.name}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowTemplateSheet(false);
                      setSelectedTemplate(null);
                      setTemplateParams({});
                    }}
                  >
                    <MaterialCommunityIcons name="close" size={24} color={Colors.textPrimary} />
                  </TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={styles.sheetContent}>
                  <Text style={styles.formHeading}>Resolve Template Variables</Text>
                  <Text style={styles.formSub}>Fill parameters for dynamic placeholders.</Text>
                  
                  {/* Template body preview */}
                  <Card style={styles.previewCard}>
                    <Card.Content>
                      <Text style={styles.previewLabel}>Template Body:</Text>
                      <Text style={styles.previewText}>
                        {selectedTemplate.components?.find((c: any) => c.type === "BODY")?.text || ""}
                      </Text>
                    </Card.Content>
                  </Card>

                  {templatePlaceholders.map((num: string) => (
                    <View key={num} style={styles.paramInputGroup}>
                      <Text style={styles.paramLabel}>Variable {"{{"}{num}{"}}"}</Text>
                      <TextInput
                        style={styles.paramInput}
                        value={templateParams[num] || ""}
                        onChangeText={(val) =>
                          setTemplateParams((prev) => ({ ...prev, [num]: val }))
                        }
                        placeholder={`Value for {{${num}}}`}
                      />
                      {/* Autofill tags */}
                      <View style={styles.autofillRow}>
                        {variableResolverRegistry.getVariables().map((v) => (
                          <TouchableOpacity
                            key={v.key}
                            style={styles.autofillPill}
                            onPress={() => autofillParam(num, v.key)}
                          >
                            <Text style={styles.autofillPillText}>Autofill {v.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                    </View>
                  ))}

                  <Button
                    mode="contained"
                    style={styles.sendTemplateBtn}
                    textColor="#fff"
                    onPress={handleSendTemplate}
                    loading={sendMutation.isPending}
                  >
                    Send Template Message
                  </Button>
                </ScrollView>
              </View>
            ) : (
              // Synced Templates List
              <View style={styles.listContainer}>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>Select Template</Text>
                  <TouchableOpacity
                    onPress={() => setShowTemplateSheet(false)}
                  >
                    <MaterialCommunityIcons name="close" size={24} color={Colors.textPrimary} />
                  </TouchableOpacity>
                </View>

                {loadingTemplates ? (
                  <ActivityIndicator size="large" color={Colors.primary} style={{ margin: 40 }} />
                ) : templates.length === 0 ? (
                  <View style={styles.emptyTemplates}>
                    <MaterialCommunityIcons name="card-text-outline" size={48} color={Colors.textSecondary} />
                    <Text style={styles.emptyTemplatesText}>No approved templates synced.</Text>
                    <Text style={styles.emptyTemplatesSub}>Sync templates in the settings screen.</Text>
                  </View>
                ) : (
                  <FlashListAny
                    data={templates}
                    keyExtractor={(item: any) => item.id}
                    renderItem={({ item }: { item: any }) => {
                      const bodyComp = item.components?.find((c: any) => c.type === "BODY");
                      const preview = bodyComp?.text || "";
                      return (
                        <TouchableOpacity
                          style={styles.templateItem}
                          onPress={() => {
                            setSelectedTemplate(item);
                            setTemplateParams({});
                          }}
                        >
                          <View style={styles.templateItemHeader}>
                            <Text style={styles.templateItemName} numberOfLines={1}>{item.name}</Text>
                            <View style={styles.templateCategoryBadge}>
                              <Text style={styles.templateCategoryBadgeText}>{item.category}</Text>
                            </View>
                          </View>
                          <Text style={styles.templateItemPreview} numberOfLines={2}>
                            {preview}
                          </Text>
                        </TouchableOpacity>
                      );
                    }}
                    estimatedItemSize={72}
                    contentContainerStyle={{ paddingBottom: 40 }}
                  />
                )}
              </View>
            )}
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
