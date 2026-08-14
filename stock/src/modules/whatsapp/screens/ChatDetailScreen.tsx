import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
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
  type ScrollViewProps,
  BackHandler,
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
import { ChatProfileSheet } from "../components/ChatProfileSheet";
import {
  WhatsAppImageViewer,
  type WhatsAppViewerImage,
} from "../components/WhatsAppImageViewer";
import { formatWhatsAppPhone, initialsFor, waColors } from "../whatsapp-ui";
import { queryKeys } from "../../../hooks/query-keys";
import { useWhatsAppScope } from "../whatsapp-scope";
import { useWhatsAppMessages } from "../hooks/use-whatsapp-data";
import {
  whatsappDb,
  type PendingWhatsAppOperation,
} from "../services/whatsapp-db";
import { contactsDb } from "../services/contactsDb";
import {
  appendWhatsAppMessage,
  replaceWhatsAppMessage,
  type WhatsAppMessagePages,
} from "../whatsapp-query-cache";
import {
  isRetryableWhatsAppClientError,
  whatsappClientRetryDelayMs,
} from "../whatsapp-retry";
import { getWhatsAppMediaRule } from "../whatsapp-runtime-config";
import {
  persistWhatsAppMedia,
  removePersistedWhatsAppMedia,
} from "../services/whatsapp-media-files";
import { markWhatsAppOpenMeasurement } from "../whatsapp-open-performance";

const DATE_KEY_CACHE = new Map<string, string>();
const DATE_SEP_CACHE = new Map<string, string>();
const TIME_SEP_CACHE = new Map<string, string>();

function getFastDateKey(isoString?: string): string {
  if (!isoString) return "";
  let value = DATE_KEY_CACHE.get(isoString);
  if (!value) {
    value = isoString.slice(0, 10);
    if (DATE_KEY_CACHE.size > 300) DATE_KEY_CACHE.clear();
    DATE_KEY_CACHE.set(isoString, value);
  }
  return value;
}

function getFastDateSep(isoString?: string): string {
  if (!isoString) return "";
  let value = DATE_SEP_CACHE.get(isoString);
  if (!value) {
    value = format(new Date(isoString), "EEE, d MMM");
    if (DATE_SEP_CACHE.size > 300) DATE_SEP_CACHE.clear();
    DATE_SEP_CACHE.set(isoString, value);
  }
  return value;
}

function getFastTimeSep(isoString?: string): string {
  if (!isoString) return "";
  let value = TIME_SEP_CACHE.get(isoString);
  if (!value) {
    value = format(new Date(isoString), "hh:mm a");
    if (TIME_SEP_CACHE.size > 300) TIME_SEP_CACHE.clear();
    TIME_SEP_CACHE.set(isoString, value);
  }
  return value;
}

function messageKey(item: WaMessage) {
  return item.clientMessageId || item.id;
}

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
      .activeOffsetX([-12, 12])
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
      .minDuration(360)
      .maxDistance(12)
      .onStart((event) => {
        scheduleOnRN(triggerMediumHaptic);
        scheduleOnRN(longPressFromGesture, event.absoluteX, event.absoluteY);
      }),
    [actionsEnabled, longPressFromGesture],
  );

  const composedGesture = useMemo(
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
      <GestureDetector gesture={composedGesture}>
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
  const [composerHeight, setComposerHeight] = useState(0);
  const [linkedCustomerId, setLinkedCustomerId] = useState(conversation?.customerId || "");

  const [showTemplateSheet, setShowTemplateSheet] = useState(false);
  const [templateReplyToMessageId, setTemplateReplyToMessageId] = useState<string>();
  const [showFlowSheet, setShowFlowSheet] = useState(false);
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [profilePreloaded, setProfilePreloaded] = useState(false);
  const [viewerImage, setViewerImage] = useState<WhatsAppViewerImage | null>(null);

  const flatListRef = useRef<any>(null);
  const emojiInputRef = useRef<TextInput>(null);
  const mediaUploadControllerRef = useRef<AbortController | null>(null);
  const activeUploadRef = useRef<{ operationId: string; mediaUri: string } | null>(null);
  const didMarkInitialRender = useRef(false);
  const isNearBottomRef = useRef(true);
  const mountedOverlays = useRef({
    actions: false,
    media: false,
    voice: false,
    reactions: false,
    customEmoji: false,
    templates: false,
    flows: false,
    profile: false,
  }).current;
  if (showMessageActions) mountedOverlays.actions = true;
  if (selectedMedia) mountedOverlays.media = true;
  if (showVoiceRecorder) mountedOverlays.voice = true;
  if (reactionMenuVisible) mountedOverlays.reactions = true;
  if (customEmojiVisible) mountedOverlays.customEmoji = true;
  if (showTemplateSheet) mountedOverlays.templates = true;
  if (showFlowSheet) mountedOverlays.flows = true;
  if (showProfileSheet) mountedOverlays.profile = true;
  if (!didMarkInitialRender.current) {
    didMarkInitialRender.current = true;
    markWhatsAppOpenMeasurement(conversationId, "detail-render");
  }

  useEffect(() => {
    setLinkedCustomerId(conversation?.customerId || "");
  }, [conversation?.customerId, conversationId]);

  useEffect(() => {
    if (!isFocused || profilePreloaded) return;
    const unsubscribe = navigation.addListener("transitionEnd", (event) => {
      if (!event.data?.closing) setProfilePreloaded(true);
    });
    return unsubscribe;
  }, [isFocused, navigation, profilePreloaded]);

  const { data: customerRecord } = useCustomerDetailQuery(linkedCustomerId);
  const [deviceContactName, setDeviceContactName] = useState(
    () => contactsDb.getFastContactByPhone(recipientPhone)?.name?.trim() || "",
  );

  useEffect(() => {
    let active = true;
    if (!recipientPhone) {
      setDeviceContactName("");
      return () => {
        active = false;
      };
    }
    setDeviceContactName(
      contactsDb.getFastContactByPhone(recipientPhone)?.name?.trim() || "",
    );
    contactsDb.getContactByPhone(recipientPhone)
      .then((contact) => {
        if (active) setDeviceContactName(contact?.name?.trim() || "");
      })
      .catch(() => {
        if (active) setDeviceContactName("");
      });
    return () => {
      active = false;
    };
  }, [recipientPhone]);

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate("WhatsAppChats", {
        shopId: activeShopId,
        integrationId,
      });
    }
  }, [navigation, activeShopId, integrationId]);

  useEffect(() => {
    const onHardwareBack = () => {
      handleBack();
      return true;
    };
    const subscription = BackHandler.addEventListener("hardwareBackPress", onHardwareBack);
    return () => subscription.remove();
  }, [handleBack]);

  useLayoutEffect(() => {
    const resolvedDisplayName = deviceContactName
      || conversation?.contactName
      || customerRecord?.name
      || conversation?.customer?.name
      || formatWhatsAppPhone(recipientPhone);
    const initials = initialsFor(resolvedDisplayName || recipientPhone);

    navigation.setOptions({
      headerShown: true,
      headerStyle: { backgroundColor: waColors.greenDark },
      headerTintColor: "#fff",
      headerShadowVisible: false,
      headerLeft: () => (
        <TouchableOpacity
          onPress={handleBack}
          style={{ marginRight: 8, padding: 4 }}
          accessibilityRole="button"
          accessibilityLabel="Go back to chat list"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
      ),
      headerTitle: () => (
        <TouchableOpacity
          onPress={() => {
            setProfilePreloaded(true);
            setShowProfileSheet(true);
          }}
          style={{ flexDirection: "row", alignItems: "center" }}
        >
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
              {resolvedDisplayName}
            </Text>
            <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.78)" }} numberOfLines={1}>
              {linkedCustomerId ? "Linked customer" : formatWhatsAppPhone(recipientPhone)}
            </Text>
          </View>
        </TouchableOpacity>
      ),
      headerRight: () => linkedCustomerId ? (
        <TouchableOpacity
          onPress={() => navigation.navigate("CustomerDetail", { customerId: linkedCustomerId })}
          style={{ marginRight: 12, padding: 4 }}
          accessibilityRole="button"
          accessibilityLabel="Open linked customer"
        >
          <MaterialCommunityIcons name="account-details" size={23} color="#fff" />
        </TouchableOpacity>
      ) : null,
      headerTitleAlign: "left",
    });
  }, [
    conversation?.contactName,
    conversation?.customer?.name,
    customerRecord?.name,
    deviceContactName,
    handleBack,
    linkedCustomerId,
    navigation,
    recipientPhone,
  ]);

  const messageQuery = useWhatsAppMessages(conversationId);
  const messages = messageQuery.messages;
  const isLoading = messageQuery.isPending;
  const inboundReplyName = conversation?.contactName
    || customerRecord?.name
    || formatWhatsAppPhone(recipientPhone)
    || "Customer";
  const replySenderName = useCallback((message: WaMessage) => (
    message.direction === "OUTBOUND" ? "You" : inboundReplyName
  ), [inboundReplyName]);
  const draftLoaded = useRef(false);
  const pendingDraftReplyId = useRef<string | null>(null);

  const hasProcessingMedia = messages.some(
    (message) => message.asset?.status === "UPLOADING",
  );

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

  const messagingWindowOpen = true;
  type SendVariables = {
    clientMessageId: string;
    message: WaOutboundMessage;
    replyToMessageId?: string;
    operationId?: string;
    operationType?: PendingWhatsAppOperation["operationType"];
    operationPayload?: PendingWhatsAppOperation["payload"];
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

  const persistSendIntent = async (
    input: SendVariables,
    operationState: NonNullable<WaMessage["operationState"]>,
    errorMessage?: string,
    retry?: { attempt?: number; nextAttemptAt?: number },
  ) => {
    const now = Date.now();
    const operationId = input.operationId || `send:${input.clientMessageId}`;
    const optimistic = {
      ...buildOptimisticMessage(input, operationState),
      providerStatus: operationState === "TERMINALLY_FAILED" ? "FAILED" as const : "PENDING" as const,
      attempt: retry?.attempt ?? 0,
      errorMessage,
    };
    await whatsappDb.persistPendingMessageAndOperation(
      { shopId: activeShopId, integrationId, conversationId },
      optimistic,
      {
        id: operationId,
        shopId: activeShopId,
        integrationId,
        conversationId,
        clientMessageId: input.clientMessageId,
        operationType: input.operationType || "SEND_MESSAGE",
        operationState,
        payload: input.operationPayload || {
          message: input.message,
          replyToMessageId: input.replyToMessageId,
        },
        attempt: retry?.attempt ?? 0,
        nextAttemptAt: retry?.nextAttemptAt
          ?? (operationState === "SUBMITTING" ? now + 60_000 : now),
        lastError: errorMessage,
        createdAt: now,
        updatedAt: now,
      },
    );
    return { message: optimistic, operationId };
  };

  const sendMutation = useMutation({
    mutationFn: async (input: SendVariables) => {
      if (!token) throw new Error("Your session expired. Sign in again.");
      const network = await NetInfo.fetch();
      if (network.isConnected === false || network.isInternetReachable === false) {
        return {
          message: buildOptimisticMessage(input, "WAITING_FOR_NETWORK"),
          queued: true,
        };
      }
      const response = await sendScopedWaMessage(token, {
        shopId: activeShopId,
        integrationId,
        conversationId,
      }, input);
      return { ...response, queued: false };
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: messagesKey });
      const previous = queryClient.getQueryData<WhatsAppMessagePages>(messagesKey);
      const persisted = await persistSendIntent(input, "SUBMITTING");
      queryClient.setQueryData<WhatsAppMessagePages>(
        messagesKey,
        (current) => appendWhatsAppMessage(current, persisted.message),
      );
      requestAnimationFrame(() => flatListRef.current?.scrollToEnd({ animated: true }));
      return { previous, operationId: persisted.operationId };
    },
    onSuccess: ({ message, queued }, input, context) => {
      queryClient.setQueryData<WhatsAppMessagePages>(
        messagesKey,
        (current) => replaceWhatsAppMessage(current, input.clientMessageId, message),
      );
      if (queued) {
        void persistSendIntent(input, "WAITING_FOR_NETWORK").catch((error) => {
          console.warn("Could not queue WhatsApp message locally", error);
        });
        return;
      }
      if (context?.operationId) {
        void whatsappDb.updateOperation(context.operationId, {
          operationState: "COMPLETED",
          attempt: 0,
          nextAttemptAt: Date.now(),
        }).then(() => whatsappDb.deleteOperation(context.operationId))
          .catch((error) => {
            console.warn("Could not complete local WhatsApp operation", error);
          });
      }
      void whatsappDb.upsertMessages(
        { shopId: activeShopId, integrationId, conversationId },
        [message],
      ).catch((error) => {
        console.warn("Could not persist accepted WhatsApp message", error);
      });
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "conversations", activeShopId, integrationId] });
    },
    onError: async (err: Error, input, context) => {
      const message = err.message || "Failed to send message";
      const network = await NetInfo.fetch();
      const offline = network.isConnected === false || network.isInternetReachable === false;
      const retryable = !offline && isRetryableWhatsAppClientError(err);
      const operationState = offline
        ? "WAITING_FOR_NETWORK" as const
        : retryable
          ? "RETRY_SCHEDULED" as const
          : "TERMINALLY_FAILED" as const;
      const attempt = retryable ? 1 : 0;
      const nextAttemptAt = retryable
        ? Date.now() + whatsappClientRetryDelayMs(attempt)
        : Date.now();

      queryClient.setQueryData<WhatsAppMessagePages>(
        messagesKey,
        (current) => replaceWhatsAppMessage(current, input.clientMessageId, (failed) => ({
          ...failed,
          attempt,
          operationState,
          providerStatus: operationState === "TERMINALLY_FAILED" ? "FAILED" : "PENDING",
          errorMessage: message,
        })),
      );
      try {
        await persistSendIntent(input, operationState, message, { attempt, nextAttemptAt });
      } catch {
        if (context?.previous) {
          queryClient.setQueryData(messagesKey, context.previous);
        }
        Alert.alert("Message not saved", "The message could not be saved locally. Please try again.");
        return;
      }
      if (operationState === "TERMINALLY_FAILED") {
        Alert.alert("Message not sent", `${message}\n\nTap the failed message to retry.`);
      }
    },
  });

  const displayedMessages = messages;

  const maintainVisibleContentConfig = useMemo(() => ({
    startRenderingFromBottom: true,
    autoscrollToBottomThreshold: 100,
    animateAutoScrollToBottom: false,
  }), []);

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
    previousLastMessageId.current = undefined;
    previousMessageCount.current = 0;
    isNearBottomRef.current = true;
    setNewMessageCount(0);
  }, [conversationId]);

  useEffect(() => {
    const lastMessage = displayedMessages.at(-1);
    const stableMessageKey = lastMessage?.clientMessageId || lastMessage?.id;
    if (!lastMessage) {
      previousMessageCount.current = 0;
      return;
    }
    if (previousLastMessageId.current === stableMessageKey) {
      previousMessageCount.current = displayedMessages.length;
      return;
    }
    const isInitialLoad = !previousLastMessageId.current;
    const addedCount = Math.max(1, displayedMessages.length - previousMessageCount.current);
    previousLastMessageId.current = stableMessageKey;
    previousMessageCount.current = displayedMessages.length;

    if (!isInitialLoad && !isNearBottomRef.current && lastMessage.direction !== "OUTBOUND") {
      setNewMessageCount((count) => count + addedCount);
    } else {
      setNewMessageCount(0);
    }
  }, [displayedMessages]);

  const lastInboundMessageId = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].direction === "INBOUND") return messages[index].id;
    }
    return undefined;
  }, [messages]);

  useEffect(() => {
    if (!isFocused || !lastInboundMessageId || !activeShopId || !integrationId || !token) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      void markScopedWaConversationRead(token, activeShopId, integrationId, conversationId)
        .then(() => {
          if (cancelled) return;
          queryClient.setQueriesData<any>(
            { queryKey: ["whatsapp", "conversations", activeShopId, integrationId] },
            (current: any) => {
              if (!current?.pages) return current;
              return {
                ...current,
                pages: current.pages.map((page: any) => ({
                  ...page,
                  items: page.items.map((item: any) =>
                    item.id === conversationId ? { ...item, unreadCount: 0 } : item,
                  ),
                })),
              };
            },
          );
        })
        .catch(() => undefined);
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    activeShopId,
    conversationId,
    integrationId,
    isFocused,
    lastInboundMessageId,
    queryClient,
    token,
  ]);

  const reactionMutation = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!token) throw new Error("Your session expired. Sign in again.");
      return reactToScopedWaMessage(token, activeShopId, integrationId, messageId, emoji);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesKey });
      setReactionMenuVisible(false);
      setCustomEmojiVisible(false);
      setSelectedMessage(null);
    },
    onError: (err) => {
      Alert.alert("Reaction Error", err.message || "Failed to add reaction");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (messageId: string) => {
      if (!token) throw new Error("Your session expired. Sign in again.");
      return deleteScopedWaMessage(token, activeShopId, integrationId, messageId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesKey });
      setReactionMenuVisible(false);
      setSelectedMessage(null);
    },
    onError: (err) => {
      Alert.alert("Delete Error", err.message || "Failed to delete message");
    },
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
        return {
          message: {
            ...message,
            operationState: "RETRY_SCHEDULED" as const,
            providerStatus: "PENDING" as const,
          },
        };
      }
      return retryScopedWaMessage(token, activeShopId, integrationId, message.id);
    },
    onSuccess: ({ message }) => {
      if (message.clientMessageId) {
        queryClient.setQueryData<WhatsAppMessagePages>(
          messagesKey,
          (current) => replaceWhatsAppMessage(
            current,
            message.clientMessageId!,
            message,
          ),
        );
      } else {
        void queryClient.invalidateQueries({ queryKey: messagesKey });
      }
      void whatsappDb.upsertMessages(
        { shopId: activeShopId, integrationId, conversationId },
        [message],
      ).catch(() => undefined);
    },
    onError: (error) => Alert.alert("Couldn’t retry message", error.message),
  });

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || !activeShopId || !token || !messagingWindowOpen) return;

    const replyToMessageId = replyingTo?.id;
    setReplyingTo(null);
    sendMutation.mutate({
      clientMessageId: Crypto.randomUUID(),
      message: {
        kind: "text",
        text,
        previewUrl: /https?:\/\/\S+/i.test(text),
      },
      replyToMessageId,
    });

    setInputText("");
    void whatsappDb.saveDraft(
      { shopId: activeShopId, integrationId, conversationId },
      "",
    ).catch(() => undefined);
  }, [activeShopId, conversationId, inputText, integrationId, replyingTo?.id, sendMutation.mutate, token]);

  const sendStructuredMessage = useCallback((
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
  }, [activeShopId, replyingTo?.id, sendMutation.mutate]);

  const openTemplateSheet = useCallback(() => {
    setTemplateReplyToMessageId(replyingTo?.id);
    setReplyingTo(null);
    setShowTemplateSheet(true);
  }, [replyingTo?.id]);

  const shareLinkedContact = useCallback(() => {
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
  }, [customerRecord?.name, customerRecord?.phone, sendStructuredMessage]);

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
    const replyToMessageId = replyingTo?.id;
    const caption = mediaCaption.trim() || undefined;
    const clientMessageId = Crypto.randomUUID();
    const operationId = `upload:${clientMessageId}`;
    const now = Date.now();
    const mediaMessage = {
      kind: media.kind,
      caption,
      filename: media.kind === "document" ? media.name : undefined,
    } as const;
    setReplyingTo(null);
    setUploadingMedia(true);
    setMediaUploadProgress(0);
    const controller = new AbortController();
    let sendStarted = false;
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
          replyToMessageId,
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
        activeShopId,
        integrationId,
        media,
        setMediaUploadProgress,
        controller.signal,
      );

      const message: WaOutboundMessage = media.kind === "document"
        ? {
            kind: "document",
            assetId: uploaded.id,
            filename: uploaded.fileName || media.name,
            caption,
          }
        : {
            kind: media.kind,
            assetId: uploaded.id,
            caption,
          };
      mediaUploadControllerRef.current = null;
      activeUploadRef.current = null;
      sendStarted = true;
      await sendMutation.mutateAsync({
        clientMessageId,
        replyToMessageId,
        message,
        operationId,
        operationType: "UPLOAD_MEDIA",
        operationPayload: {
          message,
          replyToMessageId,
          media,
          mediaMessage,
        },
      });
      removePersistedWhatsAppMedia(media.uri);
      setSelectedMedia(null);
      setMediaCaption("");
      setMediaUploadProgress(0);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (sendStarted) return;
      await whatsappDb.updateOperation(operationId, {
        operationState: "RETRY_SCHEDULED",
        attempt: 1,
        nextAttemptAt: Date.now() + whatsappClientRetryDelayMs(1),
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

    const replyToMessageId = replyingTo?.id;
    const clientMessageId = Crypto.randomUUID();
    const operationId = `upload:${clientMessageId}`;
    const now = Date.now();
    setReplyingTo(null);
    setUploadingMedia(true);
    setMediaUploadProgress(0);
    const controller = new AbortController();
    let sendStarted = false;
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
          replyToMessageId,
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
        activeShopId,
        integrationId,
        persistedMedia,
        setMediaUploadProgress,
        controller.signal,
      );
      mediaUploadControllerRef.current = null;
      activeUploadRef.current = null;
      sendStarted = true;
      const message: WaOutboundMessage = {
        kind: "audio",
        assetId: uploaded.id,
        voice: true,
      };
      await sendMutation.mutateAsync({
        clientMessageId,
        replyToMessageId,
        message,
        operationId,
        operationType: "UPLOAD_MEDIA",
        operationPayload: {
          message,
          replyToMessageId,
          media: persistedMedia,
          mediaMessage: { kind: "audio", voice: true },
        },
      });
      setShowVoiceRecorder(false);
      setMediaUploadProgress(0);
      removePersistedWhatsAppMedia(persistedMedia.uri);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (sendStarted) return;
      await whatsappDb.updateOperation(operationId, {
        operationState: "RETRY_SCHEDULED",
        attempt: 1,
        nextAttemptAt: Date.now() + whatsappClientRetryDelayMs(1),
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
    if (activeUpload) {
      await whatsappDb.deleteOperation(activeUpload.operationId).catch(() => undefined);
      removePersistedWhatsAppMedia(activeUpload.mediaUri);
    }
    setSelectedMedia(null);
    setShowVoiceRecorder(false);
    setMediaUploadProgress(0);
  };

  const handleLongPress = useCallback((message: WaMessage, x: number, y: number) => {
    if (message.contentState === "DELETED") return;
    setSelectedMessage(message);
    setReactionAnchor({ x, y: Math.max(0, y - headerHeight) });
    setReactionMenuVisible(true);
  }, [headerHeight]);

  const handleCopyText = async () => {
    if (selectedMessage?.content?.text) {
      await Clipboard.setStringAsync(selectedMessage.content.text);
    }
    setReactionMenuVisible(false);
    setSelectedMessage(null);
  };

  const beginReply = useCallback((message: WaMessage) => {
    setReplyingTo(message);
  }, []);

  const handleReplyPress = () => {
    if (selectedMessage && isServerMessage(selectedMessage)) {
      beginReply(selectedMessage);
    }
    setReactionMenuVisible(false);
    setSelectedMessage(null);
  };

  const handleReactionPress = (emoji: string) => {
    if (!selectedMessage || !isServerMessage(selectedMessage)) return;
    const myExistingReaction = selectedMessage.payload?.reactions?.find((reaction) => reaction.from === "me");
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
      ],
    );
  };

  const scrollToParent = useCallback((replyToMetaId: string) => {
    const index = messages.findIndex((message) => message.metaMessageId === replyToMetaId);
    if (index !== -1) {
      try {
        flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
      } catch {
        flatListRef.current?.scrollToOffset({
          offset: index * 80,
          animated: true,
        });
      }
    }
  }, [messages]);

  const renderMessageStatus = useCallback((message: WaMessage) => {
    if (
      message.operationState === "SUBMITTING"
      || message.operationState === "PROCESSING"
    ) {
      return <ActivityIndicator size="small" color={Colors.primary} style={{ width: 14, height: 14 }} />;
    }
    if (
      message.operationState === "WAITING_FOR_NETWORK"
      || message.operationState === "QUEUED"
      || message.operationState === "RETRY_SCHEDULED"
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
  }, []);

  const getItemType = useCallback((item: WaMessage) => {
    if (item.contentState === "DELETED") return "DELETED";
    return `${item.direction || "IN"}_${item.type || "TEXT"}`;
  }, []);

  const renderMessage = useCallback(({ item, index }: { item: WaMessage; index: number }) => {
    const isOutbound = item.direction === "OUTBOUND";
    const isDeleted = item.contentState === "DELETED";
    const previous = messages[index - 1];
    const showDate = !previous || getFastDateKey(previous.createdAt) !== getFastDateKey(item.createdAt);
    const parentMessage = item.replyToMetaMessageId
      ? messagesByMetaId.get(item.replyToMetaMessageId)
      : undefined;
    const reactions = item.payload?.reactions || [];
    const reactionSummary = reactions.reduce((summary: Record<string, number>, reaction) => {
      summary[reaction.emoji] = (summary[reaction.emoji] || 0) + 1;
      return summary;
    }, {});
    const uniqueEmojis = Object.keys(reactionSummary);

    return (
      <>
        {showDate && (
          <View style={styles.dateSeparator}>
            <Text style={styles.dateSeparatorText}>{getFastDateSep(item.createdAt)}</Text>
          </View>
        )}
        <SwipeReplyRow
          messageId={item.id}
          replyEnabled={!isDeleted && isServerMessage(item)}
          actionsEnabled={!isDeleted}
          onReply={() => beginReply(item)}
          onLongPress={(x, y) => handleLongPress(item, x, y)}
        >
          <View style={[styles.messageRow, isOutbound ? styles.outboundRow : styles.inboundRow]}>
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
                uniqueEmojis.length > 0 ? styles.bubbleWithReaction : styles.bubbleWithoutReaction,
              ]}
            >
              {!isDeleted && parentMessage && (
                <TouchableOpacity
                  style={styles.replyQuoteBox}
                  onPress={() => scrollToParent(item.replyToMetaMessageId!)}
                >
                  <View style={styles.replyQuoteBorder} />
                  <View style={styles.flexOne}>
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
                  <MaterialCommunityIcons name="block-helper" size={15} color={Colors.textSecondary} style={styles.deletedIcon} />
                  <Text style={styles.deletedText}>This message was deleted</Text>
                </View>
              ) : (
                <MessageContentRenderer message={item} onOpenImage={setViewerImage} />
              )}

              <View style={styles.messageFooter}>
                <Text style={styles.messageTime}>{getFastTimeSep(item.createdAt)}</Text>
                {isOutbound && (
                  <View style={styles.statusIcon}>
                    {renderMessageStatus(item)}
                  </View>
                )}
              </View>

              {!isDeleted && uniqueEmojis.length > 0 && (
                <View style={[
                  styles.reactionBadgeContainer,
                  isOutbound ? styles.reactionBadgeRight : styles.reactionBadgeLeft,
                ]}>
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
  }, [
    beginReply,
    handleLongPress,
    messages,
    messagesByMetaId,
    renderMessageStatus,
    replySenderName,
    retryMutation.mutate,
    scrollToParent,
  ]);

  const handleTimelineScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    const nearBottom = distanceFromBottom < 110;
    isNearBottomRef.current = nearBottom;
    if (nearBottom) {
      setNewMessageCount((count) => count === 0 ? count : 0);
    }
  }, []);

  const renderKeyboardAwareScroll = useCallback(
    (props: ScrollViewProps) => (
      <KeyboardChatListScrollComponent
        {...props}
        keyboardOffset={composerHeight}
      />
    ),
    [composerHeight],
  );

  const handleStartReached = useCallback(() => {
    if (messageQuery.hasNextPage && !messageQuery.isFetchingNextPage) {
      void messageQuery.fetchNextPage();
    }
  }, [messageQuery.fetchNextPage, messageQuery.hasNextPage, messageQuery.isFetchingNextPage]);

  const handleListLoad = useCallback(({ elapsedTimeInMs }: { elapsedTimeInMs: number }) => {
    markWhatsAppOpenMeasurement(
      conversationId,
      "timeline-drawn",
      `flashList=${Math.round(elapsedTimeInMs)}`,
    );
  }, [conversationId]);

  return (
    <View style={styles.container}>
      <FlashList
        ref={flatListRef}
        style={styles.timeline}
        data={displayedMessages}
        renderItem={renderMessage}
        getItemType={getItemType}
        drawDistance={1500}
        keyExtractor={messageKey}
        scrollEnabled={!reactionMenuVisible}
        contentInsetAdjustmentBehavior="never"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        renderScrollComponent={renderKeyboardAwareScroll}
        contentContainerStyle={styles.listContent}
        maintainVisibleContentPosition={maintainVisibleContentConfig}
        onScroll={handleTimelineScroll}
        onLoad={handleListLoad}
        scrollEventThrottle={32}
        onStartReached={handleStartReached}
        onStartReachedThreshold={0.25}
        ListHeaderComponent={
          messageQuery.isFetchingNextPage
            ? <ActivityIndicator color={waColors.green} style={styles.pageHeaderLoader} />
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
              <Text style={styles.timelineStateTitle}>Messages couldn't be loaded</Text>
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
            isNearBottomRef.current = true;
            flatListRef.current?.scrollToEnd({ animated: true });
          }}
        >
          <MaterialCommunityIcons name="chevron-down" size={20} color={waColors.greenDark} />
          <Text style={styles.newMessageText}>
            {newMessageCount} new {newMessageCount === 1 ? "message" : "messages"}
          </Text>
        </TouchableOpacity>
      )}

      <KeyboardAwareFooter
        onLayout={(event) => {
          const nextHeight = Math.round(event.nativeEvent.layout.height);
          setComposerHeight((current) => current === nextHeight ? current : nextHeight);
        }}
      >
        {replyingTo && (
          <View style={styles.replyingBar}>
            <View style={styles.replyingBorder} />
            <View style={styles.replyingBody}>
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
            <TouchableOpacity style={styles.windowTemplateButton} onPress={openTemplateSheet}>
              <Text style={styles.windowTemplateText}>Templates</Text>
            </TouchableOpacity>
          </View>
        )}

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
                onPress={() => pickMedia("image", "camera")}
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

      {mountedOverlays.actions && <MessageActionSheet
        visible={showMessageActions}
        canShareContact={Boolean(customerRecord?.name && customerRecord?.phone)}
        locating={locating}
        sending={sendMutation.isPending}
        onClose={() => setShowMessageActions(false)}
        onOpenTemplates={openTemplateSheet}
        onOpenFlows={() => setShowFlowSheet(true)}
        onPickMedia={pickMedia}
        onRecordVoice={() => setShowVoiceRecorder(true)}
        onShareContact={shareLinkedContact}
        onShareLocation={shareCurrentLocation}
        onSend={sendStructuredMessage}
      />}

      {mountedOverlays.media && <MediaAttachmentSheet
        media={selectedMedia}
        caption={mediaCaption}
        progress={mediaUploadProgress}
        uploading={uploadingMedia}
        onCaptionChange={setMediaCaption}
        onCancelUpload={cancelMediaUpload}
        onClose={closeMediaPreview}
        onSend={uploadAndSendMedia}
      />}

      {mountedOverlays.voice && <VoiceRecorderSheet
        visible={showVoiceRecorder}
        uploading={uploadingMedia}
        uploadProgress={mediaUploadProgress}
        onClose={() => {
          if (!uploadingMedia) setShowVoiceRecorder(false);
        }}
        onCancelUpload={cancelMediaUpload}
        onSend={uploadAndSendVoice}
      />}

      {mountedOverlays.reactions && <MessageReactionOverlay
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
          setReactionMenuVisible(false);
          setCustomEmojiVisible(true);
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
      />}

      {mountedOverlays.customEmoji && <AppBottomSheetModal
        visible={customEmojiVisible}
        title="React with emoji"
        subtitle="Choose any emoji from your keyboard"
        onDismiss={() => {
          setCustomEmojiVisible(false);
          setSelectedMessage(null);
        }}
        maxHeight={0.5}
      >
        <View style={styles.nativeEmojiContainer}>
          <TextInput
            ref={emojiInputRef}
            style={styles.nativeEmojiInput}
            placeholder="😊"
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
      </AppBottomSheetModal>}

      {mountedOverlays.templates && <TemplateSendSheet
        visible={showTemplateSheet}
        shopId={activeShopId}
        integrationId={integrationId}
        conversationId={conversationId}
        to={recipientPhone}
        replyToMessageId={templateReplyToMessageId}
        onClose={() => {
          setShowTemplateSheet(false);
          setTemplateReplyToMessageId(undefined);
        }}
      />}
      {mountedOverlays.flows && <FlowSendSheet
        visible={showFlowSheet}
        shopId={activeShopId}
        integrationId={integrationId}
        conversationId={conversationId}
        to={recipientPhone}
        onClose={() => setShowFlowSheet(false)}
      />}
      {(profilePreloaded || mountedOverlays.profile) && <ChatProfileSheet
        shopId={activeShopId}
        integrationId={integrationId}
        visible={showProfileSheet}
        onDismiss={() => setShowProfileSheet(false)}
        conversation={conversation || null}
        customerRecord={customerRecord}
        deviceContactName={deviceContactName}
        messages={messages}
        onCustomerLinked={(customer) => setLinkedCustomerId(customer.id)}
        onDeleteChat={() => navigation.goBack()}
      />}

      <WhatsAppImageViewer
        image={viewerImage}
        token={token}
        onClose={() => setViewerImage(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#e9efec" },
  timeline: { flex: 1 },
  listContent: { paddingHorizontal: 10, paddingTop: 12, paddingBottom: 16 },
  pageHeaderLoader: { paddingVertical: 12 },
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
  inboundRow: { justifyContent: "flex-start" },
  outboundRow: { justifyContent: "flex-end" },
  swipeableMessage: { width: "100%", position: "relative" },
  swipeReplyAction: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 62,
    justifyContent: "center",
    alignItems: "center",
  },
  swipeReplyActionLeft: { left: 5 },
  swipeReplyActionRight: { right: 5 },
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
    minWidth: 80,
    maxWidth: "84%",
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08)",
  },
  bubbleWithReaction: { marginBottom: 12 },
  bubbleWithoutReaction: { marginBottom: 6 },
  inboundBubble: { backgroundColor: "#fff", borderTopLeftRadius: 5 },
  outboundBubble: { backgroundColor: "#d9fdd3", borderTopRightRadius: 5 },
  deletedBubble: { backgroundColor: waColors.surfaceMuted, borderStyle: "dashed" },
  messageFooter: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", marginTop: 4 },
  messageTime: { fontSize: 10, color: Colors.textSecondary },
  statusIcon: { marginLeft: 4 },
  deletedRow: { flexDirection: "row", alignItems: "center" },
  deletedIcon: { marginRight: 6 },
  deletedText: { fontStyle: "italic", color: Colors.textSecondary, fontSize: 14 },
  flexOne: { flex: 1 },
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
  reactionBadgeRight: { right: 8 },
  reactionBadgeLeft: { left: 8 },
  reactionBadgeEmoji: { fontSize: 12, marginHorizontal: 0.5 },
  reactionBadgeCount: { fontSize: 10, fontWeight: "600", marginLeft: 2, color: Colors.textSecondary },
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
  replyingBody: { flex: 1, paddingHorizontal: 10 },
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
  nativeEmojiContainer: { alignItems: "center", gap: 14 },
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
  templateToolbarBtn: { padding: 6, marginRight: 4 },
});