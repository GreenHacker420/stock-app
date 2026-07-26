import {
  type ReactNode,
  useCallback,
  useEffect,
  useState,
  useRef,
  useMemo,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { KeyboardController } from "react-native-keyboard-controller";
import * as Crypto from "expo-crypto";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import NetInfo from "@react-native-community/netinfo";
import { useRoute, useNavigation, useIsFocused, type RouteProp } from "@react-navigation/native";
import { useHeaderHeight } from "@react-navigation/elements";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  deleteScopedWaMessage,
  markScopedWaConversationRead,
  reactToScopedWaMessage,
  retryScopedWaMessage,
  sendScopedWaMessage,
  uploadWaMedia,
  WaLocalMedia,
  WaMessage,
  WaOutboundMessage,
} from "../../../api/whatsapp.api";
import { useAuthStore } from "../../../auth/auth-store";
import { useCustomerDetailQuery } from "../../../hooks/useCustomers";
import { KeyboardAwareFooter } from "../../../components/keyboard/KeyboardAwareFooter";
import { KeyboardChatListScrollComponent } from "../../../components/keyboard/KeyboardChatListScrollComponent";
import { AppBottomSheetModal } from "../../../components/overlays/AppBottomSheetModal";
import type { RootStackParamList } from "../../../navigation";
import { colors as Colors } from "../../../theme";
import { triggerMediumHaptic, triggerSelectionHaptic } from "../../../utils/haptics";
import { format } from "date-fns";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { MessageActionSheet } from "../components/MessageActionSheet";
import { MediaAttachmentSheet } from "../components/MediaAttachmentSheet";
import { VoiceRecorderSheet } from "../components/VoiceRecorderSheet";
import { MessageContentRenderer } from "../components/MessageContentRenderer";
import { MessageReactionOverlay } from "../components/MessageReactionOverlay";
import { TemplateSendSheet } from "../components/TemplateSendSheet";
import { FlowSendSheet } from "../components/FlowSendSheet";
import { formatWhatsAppPhone, initialsFor, waColors } from "../whatsapp-ui";
import { queryKeys } from "../../../hooks/query-keys";
import { useWhatsAppScope } from "../whatsapp-scope";
import { useWhatsAppMessages } from "../hooks/use-whatsapp-data";
import { whatsappDb } from "../services/whatsapp-db";
import {
  appendWhatsAppMessage,
  replaceWhatsAppMessage,
  type WhatsAppMessagePages,
} from "../whatsapp-query-cache";
import { getWhatsAppMediaRule } from "../whatsapp-runtime-config";
import {
  persistWhatsAppMedia,
  removePersistedWhatsAppMedia,
} from "../services/whatsapp-media-files";

const MEDIA_MESSAGE_TYPES = new Set<WaMessage["type"]>([
  "IMAGE",
  "VIDEO",
  "AUDIO",
  "DOCUMENT",
  "STICKER",
]);

function toMessageType(message: WaOutboundMessage): WaMessage["type"] {
  switch (message.kind) {
    case "text": return "TEXT";
    case "image": return "IMAGE";
    case "video": return "VIDEO";
    case "document": return "DOCUMENT";
    case "audio": return "AUDIO";
    case "sticker": return "STICKER";
    case "location": return "LOCATION";
    case "contacts": return "CONTACT_CARD";
    case "template": return "TEMPLATE";
    case "flow": return "FLOW";
    case "reply_buttons":
    case "list":
      return "INTERACTIVE";
  }
}

function toMessageContent(message: WaOutboundMessage) {
  const { kind: _kind, ...content } = message;
  return content;
}

function isServerMessage(message: WaMessage) {
  return !message.id.startsWith("local:") && Boolean(message.metaMessageId);
}

function getReplyPreview(message: WaMessage) {
  const text = message.content?.text || message.content?.caption;
  if (text) return text;

  switch (message.type) {
    case "IMAGE": return "📷 Photo";
    case "VIDEO": return "🎥 Video";
    case "AUDIO": return "🎤 Voice message";
    case "DOCUMENT": return `📄 ${message.asset?.fileName || "Document"}`;
    case "LOCATION": return "📍 Location";
    case "CONTACT_CARD": return "👤 Contact";
    case "STICKER": return "Sticker";
    default: return "Message";
  }
}

function SwipeReplyRow({
  messageId,
  replyEnabled,
  actionsEnabled,
  children,
  onReply,
  onLongPress,
}: {
  messageId: string;
  replyEnabled: boolean;
  actionsEnabled: boolean;
  children: ReactNode;
  onReply: () => void;
  onLongPress: (x: number, y: number) => void;
}) {
  const translateX = useSharedValue(0);
  const crossedThreshold = useSharedValue(false);
  const onReplyRef = useRef(onReply);
  const onLongPressRef = useRef(onLongPress);
  onReplyRef.current = onReply;
  onLongPressRef.current = onLongPress;

  const replyFromGesture = useCallback(() => {
    onReplyRef.current();
  }, []);

  const longPressFromGesture = useCallback((x: number, y: number) => {
    onLongPressRef.current(x, y);
  }, []);

  useEffect(() => {
    translateX.value = 0;
    crossedThreshold.value = false;
  }, [crossedThreshold, messageId, translateX]);

  const swipeGesture = useMemo(
    () => Gesture.Pan()
      .enabled(replyEnabled)
      .activeOffsetX([-8, 8])
      .failOffsetY([-16, 16])
      .shouldCancelWhenOutside(false)
      .onBegin(() => {
        crossedThreshold.value = false;
      })
      .onUpdate((event) => {
        const distance = Math.min(Math.abs(event.translationX), 82);
        translateX.value = event.translationX < 0 ? -distance : distance;
        if (distance >= 38 && !crossedThreshold.value) {
          crossedThreshold.value = true;
          scheduleOnRN(triggerSelectionHaptic);
        }
      })
      .onEnd((event) => {
        if (Math.abs(event.translationX) >= 38 || Math.abs(event.velocityX) >= 600) {
          scheduleOnRN(replyFromGesture);
        }
        translateX.value = withSpring(0, {
          damping: 22,
          stiffness: 260,
          overshootClamping: true,
        });
      })
      .onFinalize(() => {
        crossedThreshold.value = false;
        translateX.value = withSpring(0, {
          damping: 22,
          stiffness: 260,
          overshootClamping: true,
        });
      }),
    [crossedThreshold, replyEnabled, replyFromGesture, translateX],
  );

  const longPressGesture = useMemo(
    () => Gesture.LongPress()
      .enabled(actionsEnabled)
      .minDuration(240)
      .maxDistance(28)
      .onStart((event) => {
        scheduleOnRN(triggerMediumHaptic);
        scheduleOnRN(longPressFromGesture, event.absoluteX, event.absoluteY);
      }),
    [actionsEnabled, longPressFromGesture],
  );

  const messageGesture = useMemo(
    () => Gesture.Race(swipeGesture, longPressGesture),
    [longPressGesture, swipeGesture],
  );

  const messageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const leftReplyActionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [8, 38], [0, 1], "clamp"),
    transform: [{
      scale: interpolate(translateX.value, [8, 38], [0.72, 1], "clamp"),
    }],
  }));

  const rightReplyActionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-38, -8], [1, 0], "clamp"),
    transform: [{
      scale: interpolate(translateX.value, [-38, -8], [1, 0.72], "clamp"),
    }],
  }));

  return (
    <View style={styles.swipeableMessage}>
      <Animated.View
        pointerEvents="none"
        style={[styles.swipeReplyAction, styles.swipeReplyActionLeft, leftReplyActionStyle]}
      >
        <View style={styles.swipeReplyIcon}>
            <MaterialCommunityIcons name="reply" size={20} color="#fff" />
        </View>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[styles.swipeReplyAction, styles.swipeReplyActionRight, rightReplyActionStyle]}
      >
        <View style={styles.swipeReplyIcon}>
          <MaterialCommunityIcons name="reply" size={20} color="#fff" />
        </View>
      </Animated.View>
      <GestureDetector gesture={messageGesture}>
        <Animated.View style={messageStyle}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export const ChatDetailScreen = () => {
  const route = useRoute<RouteProp<RootStackParamList, "ChatDetail">>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { conversationId, phone, conversation } = route.params;
  const recipientPhone = conversation?.phone || phone || "";
  const {
    shopId: activeShopId,
    integrationId,
  } = useWhatsAppScope();
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const isFocused = useIsFocused();

  const [inputText, setInputText] = useState("");
  const [replyingTo, setReplyingTo] = useState<WaMessage | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<WaMessage | null>(null);
  const [reactionMenuVisible, setReactionMenuVisible] = useState(false);
  const [reactionAnchor, setReactionAnchor] = useState({ x: 180, y: 320 });
  const [customEmojiVisible, setCustomEmojiVisible] = useState(false);
  const [showMessageActions, setShowMessageActions] = useState(false);
  const [locating, setLocating] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<WaLocalMedia | null>(null);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [mediaCaption, setMediaCaption] = useState("");
  const [mediaUploadProgress, setMediaUploadProgress] = useState(0);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [isNearBottom, setIsNearBottom] = useState(true);

  // Template Picker State
  const [showTemplateSheet, setShowTemplateSheet] = useState(false);
  const [showFlowSheet, setShowFlowSheet] = useState(false);

  const flatListRef = useRef<any>(null);
  const emojiInputRef = useRef<TextInput>(null);
  const mediaUploadControllerRef = useRef<AbortController | null>(null);
  const openCustomEmojiAfterReactionRef = useRef(false);
  const activeUploadRef = useRef<{ operationId: string; mediaUri: string } | null>(null);

  // Mark conversation as read on focus / load
  useEffect(() => {
    if (isFocused && activeShopId && conversationId) {
      if (!token) return;
      markScopedWaConversationRead(token, integrationId, conversationId)
        .then(() => {
          queryClient.setQueriesData<any>(
            { queryKey: ["whatsapp", "conversations", activeShopId, integrationId] },
            (current: any) => {
              if (!current?.pages) return current;
              return {
                ...current,
                pages: current.pages.map((page: any) => ({
                  ...page,
                  items: page.items.map((conversation: any) =>
                    conversation.id === conversationId
                      ? { ...conversation, unreadCount: 0 }
                      : conversation,
                  ),
                })),
              };
            },
          );
        })
        .catch((err) => {
          console.warn("Failed to mark conversation read", err);
        });
    }
  }, [activeShopId, conversationId, integrationId, isFocused, queryClient, token]);

  const { data: customerRecord } = useCustomerDetailQuery(conversation?.customerId || "");

  // Set custom header with contact name, avatar, and linked customer shortcut
  useEffect(() => {
    const contactName = conversation?.contactName || formatWhatsAppPhone(recipientPhone);
    const initials = initialsFor(conversation?.contactName || recipientPhone);

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
              {conversation?.customerId ? "Linked customer" : formatWhatsAppPhone(recipientPhone)}
            </Text>
          </View>
        </View>
      ),
      headerRight: () => conversation?.customerId ? (
        <TouchableOpacity
          onPress={() => navigation.navigate("CustomerDetail", { customerId: conversation.customerId! })}
          style={{ marginRight: 12, padding: 4 }}
        >
          <MaterialCommunityIcons name="account-details" size={23} color="#fff" />
        </TouchableOpacity>
      ) : null,
      headerTitleAlign: "left",
    });
  }, [navigation, conversation, recipientPhone]);

  const messageQuery = useWhatsAppMessages(conversationId);
  const messages = messageQuery.messages;
  const isLoading = messageQuery.isPending;
  const inboundReplyName = conversation?.contactName
    || customerRecord?.name
    || formatWhatsAppPhone(recipientPhone)
    || "Customer";
  const replySenderName = (message: WaMessage) => (
    message.direction === "OUTBOUND" ? "You" : inboundReplyName
  );
  const draftLoaded = useRef(false);
  const pendingDraftReplyId = useRef<string | null>(null);

  const hasProcessingMedia = messages.some((message) => (
    message.asset?.status === "UPLOADING"
    || message.operationState === "PROCESSING"
    || (
      MEDIA_MESSAGE_TYPES.has(message.type)
      && !message.asset?.url
      && message.asset?.status !== "FAILED"
      && message.asset?.status !== "DELETED"
    )
  ));

  useEffect(() => {
    if (!isFocused || !hasProcessingMedia) return;
    let attempts = 1;
    void messageQuery.refetch();
    const timer = setInterval(() => {
      if (attempts >= 24) {
        clearInterval(timer);
        return;
      }
      attempts += 1;
      void messageQuery.refetch();
    }, 2_500);
    return () => clearInterval(timer);
  }, [hasProcessingMedia, isFocused, messageQuery.refetch]);

  useEffect(() => {
    let cancelled = false;
    setInputText("");
    setReplyingTo(null);
    pendingDraftReplyId.current = null;
    draftLoaded.current = false;
    void whatsappDb.getDraft(activeShopId, integrationId, conversationId)
      .then((draft) => {
        if (cancelled) return;
        setInputText(draft?.text ?? "");
        pendingDraftReplyId.current = draft?.reply_to_message_id ?? null;
        draftLoaded.current = true;
      })
      .catch(() => {
        if (!cancelled) draftLoaded.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [activeShopId, conversationId, integrationId]);

  useEffect(() => {
    const replyId = pendingDraftReplyId.current;
    if (!replyId) return;
    const message = messages.find((item) => item.id === replyId);
    if (message) {
      setReplyingTo(message);
      pendingDraftReplyId.current = null;
    }
  }, [messages]);

  useEffect(() => {
    if (!draftLoaded.current) return;
    const timer = setTimeout(() => {
      void whatsappDb.saveDraft(
        { shopId: activeShopId, integrationId, conversationId },
        inputText,
        replyingTo?.id,
      ).catch(() => undefined);
    }, 350);
    return () => clearTimeout(timer);
  }, [activeShopId, conversationId, inputText, integrationId, replyingTo?.id]);

  // Intentionally disabled by product policy. The backend remains authoritative.
  const messagingWindowOpen = true;
  // Send Message Mutation
  type SendVariables = {
    clientMessageId: string;
    message: WaOutboundMessage;
    replyToMessageId?: string;
  };
  const messagesKey = queryKeys.whatsapp.messages(activeShopId!, integrationId, conversationId);
  const buildOptimisticMessage = (
    input: SendVariables,
    operationState: WaMessage["operationState"],
  ): WaMessage => ({
    id: `local:${input.clientMessageId}`,
    clientMessageId: input.clientMessageId,
    conversationId,
    direction: "OUTBOUND",
    operationState,
    providerStatus: "PENDING",
    contentState: "VISIBLE",
    attempt: 0,
    entityVersion: 0,
    type: toMessageType(input.message),
    content: toMessageContent(input.message),
    createdAt: new Date().toISOString(),
  });

  const persistQueuedSend = async (
    input: SendVariables,
    operationState: "WAITING_FOR_NETWORK" | "TERMINALLY_FAILED",
    errorMessage?: string,
  ) => {
    const now = Date.now();
    const optimistic = {
      ...buildOptimisticMessage(input, operationState),
      providerStatus: operationState === "TERMINALLY_FAILED" ? "FAILED" as const : "PENDING" as const,
      errorMessage,
    };
    await whatsappDb.persistPendingMessageAndOperation(
      { shopId: activeShopId, integrationId, conversationId },
      optimistic,
      {
        id: `send:${input.clientMessageId}`,
        shopId: activeShopId,
        integrationId,
        conversationId,
        clientMessageId: input.clientMessageId,
        operationType: "SEND_MESSAGE",
        operationState,
        payload: {
          message: input.message,
          replyToMessageId: input.replyToMessageId,
        },
        attempt: 0,
        nextAttemptAt: now,
        lastError: errorMessage,
        createdAt: now,
        updatedAt: now,
      },
    );
    return { message: optimistic };
  };

  const sendMutation = useMutation({
    mutationFn: async (input: SendVariables) => {
      if (!token) throw new Error("Your session expired. Sign in again.");
      const network = await NetInfo.fetch();
      if (network.isConnected === false) return persistQueuedSend(input, "WAITING_FOR_NETWORK");
      try {
        return await sendScopedWaMessage(token, {
          shopId: activeShopId,
          integrationId,
          conversationId,
        }, input);
      } catch (error) {
        const latestNetwork = await NetInfo.fetch();
        if (latestNetwork.isConnected === false) {
          return persistQueuedSend(input, "WAITING_FOR_NETWORK");
        }
        throw error;
      }
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: messagesKey });
      const previous = queryClient.getQueryData<WhatsAppMessagePages>(messagesKey);
      const optimistic = buildOptimisticMessage(input, "SUBMITTING");
      queryClient.setQueryData<WhatsAppMessagePages>(
        messagesKey,
        (current) => appendWhatsAppMessage(current, optimistic),
      );
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 30);
      return { previous };
    },
    onSuccess: async ({ message }, input) => {
      queryClient.setQueryData<WhatsAppMessagePages>(
        messagesKey,
        (current) => replaceWhatsAppMessage(current, input.clientMessageId, message),
      );
      await whatsappDb.upsertMessages(
        { shopId: activeShopId, integrationId, conversationId },
        [message],
      );
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "conversations", activeShopId, integrationId] });
    },
    onError: async (err: Error, input, context) => {
      const message = err.message || "Failed to send message";
      queryClient.setQueryData<WhatsAppMessagePages>(
        messagesKey,
        (current) => replaceWhatsAppMessage(current, input.clientMessageId, (failed) => ({
          ...failed,
          operationState: "TERMINALLY_FAILED",
          providerStatus: "FAILED",
          errorMessage: message,
        })),
      );
      try {
        await persistQueuedSend(input, "TERMINALLY_FAILED", message);
      } catch {
        if (context?.previous) {
          queryClient.setQueryData(messagesKey, context.previous);
        }
        Alert.alert("Message not saved", "The message could not be saved locally. Please try again.");
        return;
      }
      Alert.alert("Message not sent", `${message}\n\nTap the failed message to retry.`);
    }
  });

  const displayedMessages = messages;
  const messagesByMetaId = useMemo(
    () => new Map(
      messages
        .filter((message) => Boolean(message.metaMessageId))
        .map((message) => [message.metaMessageId!, message]),
    ),
    [messages],
  );

  const previousLastMessageId = useRef<string | undefined>(undefined);
  const previousMessageCount = useRef(0);
  useEffect(() => {
    const lastMessage = displayedMessages.at(-1);
    const stableMessageKey = lastMessage?.clientMessageId || lastMessage?.id;
    if (!lastMessage || previousLastMessageId.current === stableMessageKey) return;
    const isInitialLoad = !previousLastMessageId.current;
    const addedCount = Math.max(1, displayedMessages.length - previousMessageCount.current);
    previousLastMessageId.current = stableMessageKey;
    previousMessageCount.current = displayedMessages.length;
    if (isInitialLoad || isNearBottom || lastMessage.direction === "OUTBOUND") {
      setNewMessageCount(0);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: !isInitialLoad }), 50);
      return;
    }
    setNewMessageCount((count) => count + addedCount);
  }, [displayedMessages, isNearBottom]);

  const lastInboundMessageId = useMemo(
    () => [...messages].reverse().find((message) => message.direction === "INBOUND")?.id,
    [messages],
  );

  useEffect(() => {
    if (!isFocused || !lastInboundMessageId || !activeShopId || !integrationId || !token) return;
    markScopedWaConversationRead(token, integrationId, conversationId).catch((err) => {
      console.warn("Failed to mark conversation read on new message", err);
    });
  }, [
    activeShopId,
    conversationId,
    integrationId,
    isFocused,
    lastInboundMessageId,
    token,
  ]);

  // Send Reaction Mutation
  const reactionMutation = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!token) throw new Error("Your session expired. Sign in again.");
      return reactToScopedWaMessage(token, integrationId, messageId, emoji);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesKey });
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
      if (!token) throw new Error("Your session expired. Sign in again.");
      return deleteScopedWaMessage(token, integrationId, messageId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesKey });
      setReactionMenuVisible(false);
      setSelectedMessage(null);
    },
    onError: (err) => {
      Alert.alert("Delete Error", err.message || "Failed to delete message");
    }
  });

  const retryMutation = useMutation({
    mutationFn: async (message: WaMessage) => {
      if (!token) throw new Error("Your session expired. Sign in again.");
      if (message.id.startsWith("local:")) {
        if (!message.clientMessageId) throw new Error("This local message cannot be retried.");
        const requeued = await whatsappDb.requeueOperationByClientMessageId(
          integrationId,
          message.clientMessageId,
        );
        if (!requeued) throw new Error("The saved send operation is missing.");
        return { message: { ...message, operationState: "RETRY_SCHEDULED" as const, providerStatus: "PENDING" as const } };
      }
      return retryScopedWaMessage(token, integrationId, message.id);
    },
    onSuccess: ({ message }) => {
      queryClient.setQueryData<WhatsAppMessagePages>(
        messagesKey,
        (current) => message.clientMessageId
          ? replaceWhatsAppMessage(current, message.clientMessageId, message)
          : current,
      );
      void whatsappDb.upsertMessages(
        { shopId: activeShopId, integrationId, conversationId },
        [message],
      ).catch(() => undefined);
    },
    onError: (error) => Alert.alert("Couldn’t retry message", error.message),
  });

  const handleSend = () => {
    if (!inputText.trim() || !activeShopId || !token || !messagingWindowOpen) return;

    const replyToMessageId = replyingTo?.id;
    setReplyingTo(null);
    sendMutation.mutate({
      clientMessageId: Crypto.randomUUID(),
      message: {
        kind: "text",
        text: inputText.trim(),
        previewUrl: /https?:\/\/\S+/i.test(inputText),
      },
      replyToMessageId,
    });

    setInputText("");
    void whatsappDb.saveDraft(
      { shopId: activeShopId, integrationId, conversationId },
      "",
    ).catch(() => undefined);
  };

  const sendStructuredMessage = (
    message: WaOutboundMessage,
    clientMessageId = Crypto.randomUUID(),
  ) => {
    if (!activeShopId) return;
    const replyToMessageId = replyingTo?.id;
    setReplyingTo(null);
    sendMutation.mutate({
      clientMessageId,
      message,
      replyToMessageId,
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

  const pickMedia = async (
    kind: "image" | "video" | "document",
    source: "camera" | "library" = "library",
  ) => {
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
        const documentRule = getWhatsAppMediaRule("document");
        if (asset.size && asset.size > documentRule.maxBytes) {
          Alert.alert(
            "File too large",
            `WhatsApp documents must be ${Math.floor(documentRule.maxBytes / 1024 / 1024)} MB or smaller.`,
          );
          return;
        }
        setSelectedMedia(await persistWhatsAppMedia(integrationId, {
          kind,
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType || "application/octet-stream",
          size: asset.size,
        }));
        return;
      }

      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            "Camera access required",
            `Allow camera access to ${kind === "image" ? "take photos" : "record videos"}.`,
          );
          return;
        }
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            "Photo access required",
            "Allow photo library access to select WhatsApp attachments.",
          );
          return;
        }
      }

      const pickerOptions: ImagePicker.ImagePickerOptions = {
        mediaTypes: [kind === "image" ? "images" : "videos"],
        allowsMultipleSelection: false,
        quality: 1,
        ...(kind === "video" ? { videoMaxDuration: 5 * 60 } : {}),
      };
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync(pickerOptions)
        : await ImagePicker.launchImageLibraryAsync(pickerOptions);
      if (result.canceled) return;

      const asset = result.assets[0];
      const maxBytes = getWhatsAppMediaRule(kind).maxBytes;
      if (asset.fileSize && asset.fileSize > maxBytes) {
        Alert.alert(
          "File too large",
          `WhatsApp ${kind === "image" ? "images must be 5 MB" : "videos must be 16 MB"} or smaller.`,
        );
        return;
      }
      const defaultExtension = kind === "image" ? "jpg" : "mp4";
      setSelectedMedia(await persistWhatsAppMedia(integrationId, {
        kind,
        uri: asset.uri,
        name: asset.fileName || `whatsapp-${Date.now()}.${defaultExtension}`,
        mimeType: asset.mimeType || (kind === "image" ? "image/jpeg" : "video/mp4"),
        size: asset.fileSize,
        width: asset.width,
        height: asset.height,
        durationMs: asset.duration ? Math.round(asset.duration) : undefined,
      }));
    } catch (error) {
      Alert.alert(
        "Attachment unavailable",
        error instanceof Error ? error.message : "Could not open the attachment picker.",
      );
    }
  };

  const closeMediaPreview = () => {
    if (uploadingMedia) return;
    removePersistedWhatsAppMedia(selectedMedia?.uri);
    setSelectedMedia(null);
    setMediaCaption("");
    setMediaUploadProgress(0);
  };

  const uploadAndSendMedia = async () => {
    if (!selectedMedia || !integrationId || !token || uploadingMedia) return;

    const media = selectedMedia;
    const clientMessageId = Crypto.randomUUID();
    const operationId = `upload:${clientMessageId}`;
    const now = Date.now();
    const mediaMessage = {
      kind: media.kind,
      caption: mediaCaption.trim() || undefined,
      filename: media.kind === "document" ? media.name : undefined,
    } as const;
    setUploadingMedia(true);
    setMediaUploadProgress(0);
    const controller = new AbortController();
    mediaUploadControllerRef.current = controller;
    activeUploadRef.current = { operationId, mediaUri: media.uri };
    try {
      await whatsappDb.enqueueOperation({
        id: operationId,
        shopId: activeShopId,
        integrationId,
        conversationId,
        clientMessageId,
        operationType: "UPLOAD_MEDIA",
        operationState: "UPLOADING",
        payload: {
          replyToMessageId: replyingTo?.id,
          media,
          mediaMessage,
        },
        attempt: 0,
        nextAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      });
      const uploaded = await uploadWaMedia(
        token,
        integrationId,
        media,
        setMediaUploadProgress,
        controller.signal,
      );

      if (media.kind === "document") {
        await sendMutation.mutateAsync({
          clientMessageId,
          replyToMessageId: replyingTo?.id,
          message: {
            kind: "document",
            assetId: uploaded.id,
            filename: uploaded.fileName || media.name,
            caption: mediaCaption.trim() || undefined,
          },
        });
      } else {
        await sendMutation.mutateAsync({
          clientMessageId,
          replyToMessageId: replyingTo?.id,
          message: {
            kind: media.kind,
            assetId: uploaded.id,
            caption: mediaCaption.trim() || undefined,
          },
        });
      }
      await whatsappDb.deleteOperation(operationId);
      removePersistedWhatsAppMedia(media.uri);
      setSelectedMedia(null);
      setMediaCaption("");
      setMediaUploadProgress(0);
    } catch (error) {
      if (controller.signal.aborted) return;
      await whatsappDb.updateOperation(operationId, {
        operationState: "RETRY_SCHEDULED",
        attempt: 1,
        nextAttemptAt: Date.now() + 2_000,
        lastError: error instanceof Error ? error.message : "Media upload failed",
      }).catch(() => undefined);
      Alert.alert(
        "Upload failed",
        "The attachment is saved and will retry when the connection is available.",
      );
    } finally {
      activeUploadRef.current = null;
      mediaUploadControllerRef.current = null;
      setUploadingMedia(false);
    }
  };

  const uploadAndSendVoice = async (media: WaLocalMedia) => {
    if (!integrationId || !token || uploadingMedia) return;

    const clientMessageId = Crypto.randomUUID();
    const operationId = `upload:${clientMessageId}`;
    const now = Date.now();
    setUploadingMedia(true);
    setMediaUploadProgress(0);
    const controller = new AbortController();
    mediaUploadControllerRef.current = controller;
    try {
      const persistedMedia = await persistWhatsAppMedia(integrationId, media);
      activeUploadRef.current = { operationId, mediaUri: persistedMedia.uri };
      await whatsappDb.enqueueOperation({
        id: operationId,
        shopId: activeShopId,
        integrationId,
        conversationId,
        clientMessageId,
        operationType: "UPLOAD_MEDIA",
        operationState: "UPLOADING",
        payload: {
          replyToMessageId: replyingTo?.id,
          media: persistedMedia,
          mediaMessage: { kind: "audio", voice: true },
        },
        attempt: 0,
        nextAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      });
      const uploaded = await uploadWaMedia(
        token,
        integrationId,
        persistedMedia,
        setMediaUploadProgress,
        controller.signal,
      );
      await sendMutation.mutateAsync({
        clientMessageId,
        replyToMessageId: replyingTo?.id,
        message: {
          kind: "audio",
          assetId: uploaded.id,
          voice: true,
        },
      });
      await whatsappDb.deleteOperation(operationId);
      setShowVoiceRecorder(false);
      setMediaUploadProgress(0);
      removePersistedWhatsAppMedia(persistedMedia.uri);
    } catch (error) {
      if (controller.signal.aborted) return;
      await whatsappDb.updateOperation(operationId, {
        operationState: "RETRY_SCHEDULED",
        attempt: 1,
        nextAttemptAt: Date.now() + 2_000,
        lastError: error instanceof Error ? error.message : "Voice upload failed",
      }).catch(() => undefined);
      Alert.alert(
        "Upload failed",
        "The voice note is saved and will retry when the connection is available.",
      );
    } finally {
      activeUploadRef.current = null;
      mediaUploadControllerRef.current = null;
      setUploadingMedia(false);
    }
  };

  const cancelMediaUpload = async () => {
    mediaUploadControllerRef.current?.abort();
    const activeUpload = activeUploadRef.current;
    activeUploadRef.current = null;
    if (activeUpload) {
      await whatsappDb.deleteOperation(activeUpload.operationId).catch(() => undefined);
      removePersistedWhatsAppMedia(activeUpload.mediaUri);
    }
    setSelectedMedia(null);
    setShowVoiceRecorder(false);
    setMediaUploadProgress(0);
    setUploadingMedia(false);
  };

  const handleLongPress = (message: WaMessage, x: number, y: number) => {
    if (message.contentState === "DELETED") return;
    setSelectedMessage(message);
    setReactionAnchor({ x, y: Math.max(0, y - headerHeight) });
    setReactionMenuVisible(true);
  };

  const handleCopyText = async () => {
    if (selectedMessage?.content?.text) {
      await Clipboard.setStringAsync(selectedMessage.content.text);
    }
    setReactionMenuVisible(false);
    setSelectedMessage(null);
  };

  const beginReply = (message: WaMessage) => {
    setReplyingTo(message);
    if (isNearBottom) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 40);
    }
  };

  const handleReplyPress = () => {
    if (selectedMessage && isServerMessage(selectedMessage)) {
      beginReply(selectedMessage);
    }
    setReactionMenuVisible(false);
    setSelectedMessage(null);
  };

  const handleReactionPress = (emoji: string) => {
    if (!selectedMessage || !isServerMessage(selectedMessage)) return;
    // Toggle reaction off if tapping the same one
    const myExistingReaction = selectedMessage.payload?.reactions?.find(r => r.from === "me");
    const resolvedEmoji = myExistingReaction?.emoji === emoji ? "" : emoji;

    reactionMutation.mutate({
      messageId: selectedMessage.id,
      emoji: resolvedEmoji,
    });
  };

  const handleCustomEmojiSelect = (emoji: string) => {
    if (!selectedMessage || !isServerMessage(selectedMessage)) return;
    reactionMutation.mutate({
      messageId: selectedMessage.id,
      emoji,
    });
  };

  const handleDeleteMessage = () => {
    if (!selectedMessage || !isServerMessage(selectedMessage)) return;
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

  const renderMessageStatus = (message: WaMessage) => {
    if (
      message.operationState === "SUBMITTING"
      || message.operationState === "PROCESSING"
    ) {
      return <ActivityIndicator size="small" color={Colors.primary} style={{ width: 14, height: 14 }} />;
    }
    if (
      message.operationState === "QUEUED"
      || message.providerStatus === "PENDING"
    ) {
      return <MaterialCommunityIcons name="clock-outline" size={14} color={Colors.textSecondary} />;
    }

    switch (message.providerStatus) {
      case "ACCEPTED":
      case "SENT":
        return <MaterialCommunityIcons name="check" size={14} color={Colors.textSecondary} />;
      case "DELIVERED":
        return <MaterialCommunityIcons name="check-all" size={14} color={Colors.textSecondary} />;
      case "READ":
        return <MaterialCommunityIcons name="check-all" size={14} color="#34B7F1" />;
      case "FAILED":
        return <MaterialCommunityIcons name="alert-circle-outline" size={14} color="#EF4444" />;
      default:
        if (message.operationState === "TERMINALLY_FAILED") {
          return <MaterialCommunityIcons name="alert-circle-outline" size={14} color="#EF4444" />;
        }
        return null;
    }
  };

  const renderMessage = ({ item, index }: { item: WaMessage; index: number }) => {
    const isOutbound = item.direction === "OUTBOUND";
    const isDeleted = item.contentState === "DELETED";
    const previous = displayedMessages[index - 1];
    const showDate = !previous
      || format(new Date(previous.createdAt), "yyyy-MM-dd") !== format(new Date(item.createdAt), "yyyy-MM-dd");

    // Find parent message for reply rendering
    const parentMessage = item.replyToMetaMessageId
      ? messagesByMetaId.get(item.replyToMetaMessageId)
      : undefined;

    // Aggregate reaction emojis and counts
    const reactions = item.payload?.reactions || [];
    const reactionSummary = reactions.reduce((acc: { [emoji: string]: number }, cur) => {
      acc[cur.emoji] = (acc[cur.emoji] || 0) + 1;
      return acc;
    }, {});

    const uniqueEmojis = Object.keys(reactionSummary);

    return (
      <>
        {showDate && (
          <View style={styles.dateSeparator}>
            <Text style={styles.dateSeparatorText}>
              {format(new Date(item.createdAt), "EEE, d MMM")}
            </Text>
          </View>
        )}
        <SwipeReplyRow
          messageId={item.id}
          replyEnabled={!isDeleted && isServerMessage(item)}
          actionsEnabled={!isDeleted}
          onReply={() => beginReply(item)}
          onLongPress={(x, y) => handleLongPress(item, x, y)}
        >
          <View style={[styles.messageRow, isOutbound ? { justifyContent: "flex-end" } : { justifyContent: "flex-start" }]}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => {
                if (
                  item.operationState === "TERMINALLY_FAILED"
                  || item.providerStatus === "FAILED"
                ) {
                  retryMutation.mutate(item);
                }
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
                    {replySenderName(parentMessage)}
                  </Text>
                  <Text style={styles.replyQuoteText} numberOfLines={1}>
                    {getReplyPreview(parentMessage)}
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
                  {renderMessageStatus(item)}
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
        </SwipeReplyRow>
      </>
    );
  };

  const handleTimelineScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    const nearBottom = distanceFromBottom < 110;
    setIsNearBottom(nearBottom);
    if (nearBottom && newMessageCount) setNewMessageCount(0);
  };

  return (
    <View style={styles.container}>
      <FlashList
        ref={flatListRef}
        data={displayedMessages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.clientMessageId || item.id}
        renderScrollComponent={KeyboardChatListScrollComponent}
        scrollEnabled={!reactionMenuVisible}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        maintainVisibleContentPosition={{
          startRenderingFromBottom: true,
          autoscrollToBottomThreshold: 0.15,
          animateAutoScrollToBottom: true,
        }}
        onScroll={handleTimelineScroll}
        scrollEventThrottle={32}
        onStartReached={() => {
          if (messageQuery.hasNextPage && !messageQuery.isFetchingNextPage) {
            void messageQuery.fetchNextPage();
          }
        }}
        onStartReachedThreshold={0.25}
        ListHeaderComponent={
          messageQuery.isFetchingNextPage
            ? <ActivityIndicator color={waColors.green} style={{ paddingVertical: 12 }} />
            : null
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.timelineState}>
              <ActivityIndicator color={waColors.green} />
              <Text style={styles.timelineStateText}>Loading messages…</Text>
            </View>
          ) : messageQuery.isError ? (
            <View style={styles.timelineState}>
              <MaterialCommunityIcons name="cloud-alert-outline" size={38} color={waColors.danger} />
              <Text style={styles.timelineStateTitle}>Messages couldn’t be loaded</Text>
              <Text style={styles.timelineStateText}>{messageQuery.error.message}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={() => messageQuery.refetch()}>
                <Text style={styles.retryButtonText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.timelineState}>
              <View style={styles.emptyConversationIcon}>
                <MaterialCommunityIcons name="message-text-outline" size={34} color={waColors.green} />
              </View>
              <Text style={styles.timelineStateTitle}>Start the conversation</Text>
              <Text style={styles.timelineStateText}>
                Messages are securely synchronized with your business WhatsApp account.
              </Text>
            </View>
          )
        }
      />

      {newMessageCount > 0 && (
        <TouchableOpacity
          style={styles.newMessageButton}
          onPress={() => {
            setNewMessageCount(0);
            flatListRef.current?.scrollToEnd({ animated: true });
          }}
        >
          <MaterialCommunityIcons name="chevron-down" size={20} color={waColors.greenDark} />
          <Text style={styles.newMessageText}>
            {newMessageCount} new {newMessageCount === 1 ? "message" : "messages"}
          </Text>
        </TouchableOpacity>
      )}

      <KeyboardAwareFooter>
        {/* Reply Quoting Bar (if replying) */}
        {replyingTo && (
          <View style={styles.replyingBar}>
            <View style={styles.replyingBorder} />
            <View style={{ flex: 1, paddingHorizontal: 10 }}>
              <Text style={styles.replyingTitle}>
                Replying to {replySenderName(replyingTo)}
              </Text>
              <Text style={styles.replyingText} numberOfLines={1}>
                {getReplyPreview(replyingTo)}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setReplyingTo(null)} style={styles.replyingClose}>
              <MaterialCommunityIcons name="close" size={20} color={waColors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}

        {!messagingWindowOpen && (
          <View style={styles.windowNotice}>
            <View style={styles.windowNoticeIcon}>
              <MaterialCommunityIcons name="clock-alert-outline" size={20} color="#9a6700" />
            </View>
            <View style={styles.windowNoticeBody}>
              <Text style={styles.windowNoticeTitle}>24-hour reply window closed</Text>
              <Text style={styles.windowNoticeText}>Send an approved template to restart the conversation.</Text>
            </View>
            <TouchableOpacity style={styles.windowTemplateButton} onPress={() => setShowTemplateSheet(true)}>
              <Text style={styles.windowTemplateText}>Templates</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Message Input Bar */}
        <View style={[styles.inputToolbar, { paddingBottom: Math.max(insets.bottom, 7) }]}>
          <TouchableOpacity
            style={styles.templateToolbarBtn}
            onPress={() => {
              if (KeyboardController.isVisible()) {
                void KeyboardController.dismiss().then(() => setShowMessageActions(true));
                return;
              }
              setShowMessageActions(true);
            }}
            accessibilityLabel="Add attachment or structured message"
          >
            <MaterialCommunityIcons name="plus-circle" size={27} color={waColors.green} />
          </TouchableOpacity>
          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              placeholder={messagingWindowOpen ? "Message" : "Use a template to reply"}
              placeholderTextColor={waColors.textMuted}
              value={inputText}
              onChangeText={setInputText}
              multiline
              editable={messagingWindowOpen}
              maxLength={4096}
            />
            {messagingWindowOpen && !inputText.trim() && (
              <TouchableOpacity
                style={styles.cameraButton}
                accessibilityLabel="Attach a photo"
                onPress={() => pickMedia("image")}
              >
                <MaterialCommunityIcons name="camera-outline" size={22} color={waColors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[styles.sendButton, !messagingWindowOpen && styles.sendButtonDisabled]}
            onPress={inputText.trim() ? handleSend : () => setShowVoiceRecorder(true)}
            disabled={!messagingWindowOpen}
            accessibilityLabel={inputText.trim() ? "Send message" : "Record voice message"}
          >
            <MaterialCommunityIcons name={inputText.trim() ? "send" : "microphone"} size={21} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAwareFooter>

      <MessageActionSheet
        visible={showMessageActions}
        canShareContact={Boolean(customerRecord?.name && customerRecord?.phone)}
        locating={locating}
        sending={sendMutation.isPending}
        onClose={() => setShowMessageActions(false)}
        onOpenTemplates={() => setShowTemplateSheet(true)}
        onOpenFlows={() => setShowFlowSheet(true)}
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

      <MessageReactionOverlay
        visible={reactionMenuVisible}
        message={selectedMessage}
        anchor={reactionAnchor}
        busy={reactionMutation.isPending || deleteMutation.isPending}
        onDismiss={() => {
          setReactionMenuVisible(false);
          setSelectedMessage(null);
        }}
        onReaction={handleReactionPress}
        onMoreReactions={() => {
          openCustomEmojiAfterReactionRef.current = true;
          setReactionMenuVisible(false);
          setTimeout(() => {
            openCustomEmojiAfterReactionRef.current = false;
            setCustomEmojiVisible(true);
          }, 120);
        }}
        onReply={
          selectedMessage && isServerMessage(selectedMessage)
            ? handleReplyPress
            : undefined
        }
        onCopy={selectedMessage?.content?.text ? handleCopyText : undefined}
        onRecall={
          selectedMessage?.direction === "OUTBOUND" && isServerMessage(selectedMessage)
            ? handleDeleteMessage
            : undefined
        }
      />

      <AppBottomSheetModal
        visible={customEmojiVisible}
        title="React with emoji"
        subtitle="Choose any emoji from your keyboard"
        onDismiss={() => setCustomEmojiVisible(false)}
        maxHeight={0.5}
      >
        <View style={styles.nativeEmojiContainer}>
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
          <Text style={styles.nativeEmojiSub}>Tap the emoji key on your keyboard, then choose a reaction.</Text>
        </View>
      </AppBottomSheetModal>

      <TemplateSendSheet
        visible={showTemplateSheet}
        shopId={activeShopId}
        integrationId={integrationId}
        conversationId={conversationId}
        to={recipientPhone}
        replyToMessageId={replyingTo?.id}
        onClose={() => setShowTemplateSheet(false)}
      />
      <FlowSendSheet
        visible={showFlowSheet}
        shopId={activeShopId}
        integrationId={integrationId}
        conversationId={conversationId}
        to={recipientPhone}
        onClose={() => setShowFlowSheet(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#e9efec" },
  listContent: { paddingHorizontal: 10, paddingTop: 12, paddingBottom: 16 },
  timelineState: {
    minHeight: 420,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
    gap: 9,
  },
  emptyConversationIcon: {
    width: 66,
    height: 66,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#dff3e8",
  },
  timelineStateTitle: { marginTop: 5, color: waColors.text, fontSize: 17, fontWeight: "800" },
  timelineStateText: { color: waColors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: "center" },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: waColors.green,
  },
  retryButtonText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  dateSeparator: { alignItems: "center", paddingVertical: 9 },
  dateSeparatorText: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    overflow: "hidden",
    color: "#52615d",
    fontSize: 11,
    fontWeight: "700",
    backgroundColor: "rgba(255,255,255,0.84)",
  },
  messageRow: { flexDirection: "row", width: "100%", paddingHorizontal: 1 },
  swipeableMessage: {
    width: "100%",
    position: "relative",
  },
  swipeReplyAction: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 62,
    justifyContent: "center",
    alignItems: "center",
  },
  swipeReplyActionLeft: {
    left: 5,
  },
  swipeReplyActionRight: {
    right: 5,
  },
  swipeReplyIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: waColors.green,
  },
  bubble: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    marginVertical: 3,
    maxWidth: "84%",
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08)",
  },
  inboundBubble: { backgroundColor: "#fff", borderTopLeftRadius: 5 },
  outboundBubble: { backgroundColor: "#d9fdd3", borderTopRightRadius: 5 },
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
    boxShadow: "0 1px 3px rgba(15, 23, 42, 0.16)",
  },
  reactionBadgeEmoji: { fontSize: 12, marginHorizontal: 0.5 },
  reactionBadgeCount: { fontSize: 10, fontWeight: "600", marginLeft: 2, color: Colors.textSecondary },

  // Reply Bar (Above Keyboard Input)
  replyingBar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginHorizontal: 8,
    padding: 10,
    alignItems: "center",
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  replyingBorder: { width: 4, height: "100%", backgroundColor: waColors.green, borderRadius: 2 },
  replyingTitle: { fontSize: 12, fontWeight: "bold", color: waColors.greenDark },
  replyingText: { fontSize: 13, color: Colors.textSecondary },
  replyingClose: { padding: 4 },

  newMessageButton: {
    position: "absolute",
    right: 14,
    bottom: 82,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fff",
    boxShadow: "0 4px 14px rgba(15, 23, 42, 0.16)",
  },
  newMessageText: { color: waColors.greenDark, fontSize: 12, fontWeight: "800" },
  windowNotice: {
    marginHorizontal: 8,
    marginBottom: 4,
    minHeight: 62,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderColor: "#f2d38b",
    backgroundColor: "#fff8e7",
  },
  windowNoticeIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#feefc3",
  },
  windowNoticeBody: { flex: 1, minWidth: 0 },
  windowNoticeTitle: { color: "#6b4f00", fontSize: 12, fontWeight: "800" },
  windowNoticeText: { marginTop: 2, color: "#806617", fontSize: 11, lineHeight: 15 },
  windowTemplateButton: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 11, backgroundColor: "#fce7a8" },
  windowTemplateText: { color: "#6b4f00", fontSize: 11, fontWeight: "800" },

  // Input Toolbar
  inputToolbar: {
    flexDirection: "row",
    paddingHorizontal: 6,
    paddingTop: 5,
    backgroundColor: "#e9efec",
    alignItems: "flex-end",
  },
  composer: {
    flex: 1,
    minHeight: 44,
    maxHeight: 116,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "#fff",
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 116,
    paddingLeft: 15,
    paddingRight: 6,
    paddingTop: 11,
    paddingBottom: 10,
    fontSize: 15,
    color: waColors.textPrimary,
  },
  cameraButton: { width: 40, height: 44, alignItems: "center", justifyContent: "center" },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: waColors.green,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 6,
  },
  sendButtonDisabled: { backgroundColor: waColors.textMuted },

  nativeEmojiContainer: {
    alignItems: "center",
    gap: 14,
  },
  nativeEmojiSub: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.textSecondary,
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
