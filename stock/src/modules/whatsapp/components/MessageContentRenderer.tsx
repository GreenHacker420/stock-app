import { memo, useEffect, useState, useMemo, type ComponentProps, type ComponentType } from "react";
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { ActivityIndicator, IconButton, Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import { colors as Colors } from "../../../theme";
import type { WaContact, WaMessage, WaMessageType } from "../../../api/whatsapp.api";
import { formatWhatsAppPhone } from "../whatsapp-ui";
import { parseCoordinate, sanitizeEmail } from "../../../utils/validation";
import { AudioMessagePlayer } from "./AudioMessagePlayer";

type RendererProps = {
  message: WaMessage;
  onOpenImage?: (url: string) => void;
};

type MaterialIconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

const ALLOWED_SCHEMES = new Set(["https:", "http:", "tel:", "sms:", "mailto:"]);

function openUrl(rawUrl?: string, failureMessage = "This item cannot be opened.") {
  if (!rawUrl) {
    Alert.alert("Unavailable", failureMessage);
    return;
  }
  try {
    const parsed = new URL(rawUrl);
    if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
      throw new Error("Unsupported URL scheme");
    }
    Linking.openURL(rawUrl).catch(() => Alert.alert("Open failed", failureMessage));
  } catch {
    Alert.alert("Open failed", failureMessage);
  }
}

function AssetUnavailable({ message }: RendererProps) {
  const assetStatus = message.asset?.status;
  const processing =
    assetStatus === "UPLOADING" ||
    assetStatus === "DELETED" ? false : (
      message.operationState === "SUBMITTING" ||
      message.operationState === "QUEUED" ||
      message.operationState === "PROCESSING" ||
      message.operationState === "UPLOADING" ||
      message.operationState === "WAITING_FOR_NETWORK"
    );

  if (processing) {
    return (
      <View style={styles.processingRow}>
        <ActivityIndicator size={20} color={Colors.primary} />
        <View style={styles.infoText}>
          <Text style={[styles.infoTitle, styles.muted]}>Preparing media…</Text>
          <Text style={styles.infoDetail}>This will update automatically.</Text>
        </View>
      </View>
    );
  }

  if (assetStatus === "FAILED" || message.operationState === "TERMINALLY_FAILED") {
    return (
      <View style={styles.processingRow}>
        <MaterialCommunityIcons name="cloud-alert-outline" size={24} color={Colors.danger} />
        <View style={styles.infoText}>
          <Text style={[styles.infoTitle, styles.muted]}>Media processing failed</Text>
        </View>
      </View>
    );
  }

  if (assetStatus === "DELETED") {
    return (
      <View style={styles.processingRow}>
        <MaterialCommunityIcons name="delete-outline" size={24} color={Colors.textSecondary} />
        <View style={styles.infoText}>
          <Text style={[styles.infoTitle, styles.muted]}>Media no longer available</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.processingRow}>
      <MaterialCommunityIcons name="cloud-off-outline" size={24} color={Colors.textSecondary} />
      <View style={styles.infoText}>
        <Text style={[styles.infoTitle, styles.muted]}>Media unavailable</Text>
      </View>
    </View>
  );
}

function TextRenderer({ message }: RendererProps) {
  return <Text selectable style={styles.messageText}>{message.content?.text || ""}</Text>;
}

const ImageRenderer = memo(function ImageRenderer({ message, onOpenImage }: RendererProps) {
  const url = message.asset?.url;
  const [failed, setFailed] = useState(false);

  const rawWidth = message.asset?.width;
  const rawHeight = message.asset?.height;
  const { width: frameWidth, height: frameHeight } = useMemo(() => {
    const MAX_W = 240;
    const MAX_H = 320;
    if (!rawWidth || !rawHeight || rawWidth <= 0 || rawHeight <= 0) {
      return { width: 220, height: 220 };
    }
    const ratio = rawWidth / rawHeight;
    if (ratio >= 1) {
      const w = Math.min(MAX_W, rawWidth);
      return { width: w, height: Math.max(120, Math.round(w / ratio)) };
    }
    const h = Math.min(MAX_H, rawHeight);
    return { width: Math.max(120, Math.round(h * ratio)), height: h };
  }, [rawWidth, rawHeight]);

  if (!url) return <AssetUnavailable message={message} />;

  const caption = message.content?.caption || message.content?.text;

  return (
    <View>
      <Pressable
        disabled={failed}
        accessibilityRole="button"
        accessibilityLabel="Open image"
        onPress={() => onOpenImage?.(url)}
      >
        <View style={[styles.imageFrame, { width: frameWidth, height: frameHeight }]}>
          <Image
            source={{ uri: url }}
            style={styles.image}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={message.id}
            priority="high"
            transition={0}
            onError={() => setFailed(true)}
          />
          {failed && (
            <View style={styles.imageLoading}>
              <MaterialCommunityIcons name="image-off-outline" size={28} color={Colors.textSecondary} />
              <Text style={styles.infoDetail}>Image unavailable</Text>
            </View>
          )}
        </View>
      </Pressable>
      {Boolean(caption) && (
        <Text selectable style={styles.messageText}>
          {caption}
        </Text>
      )}
    </View>
  );
}, (prev, next) => (
  prev.message.id === next.message.id &&
  prev.message.asset?.url === next.message.asset?.url &&
  prev.onOpenImage === next.onOpenImage
));

function MountedVideoPlayer({ url, mediaWidth }: { url: string; mediaWidth: number }) {
  const player = useVideoPlayer({ uri: url });
  return (
    <VideoView
      player={player}
      style={[styles.video, { width: mediaWidth, aspectRatio: 16 / 9 }]}
      nativeControls
      contentFit="contain"
      fullscreenOptions={{ enable: true }}
    />
  );
}

const VideoRenderer = memo(function VideoRenderer({ message }: RendererProps) {
  const [opened, setOpened] = useState(false);
  const url = message.asset?.url;
  const mediaWidth = 250;

  useEffect(() => {
    setOpened(false);
  }, [message.id, url]);

  if (!url) return <AssetUnavailable message={message} />;

  return (
    <>
      {!opened ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Play video"
          onPress={() => setOpened(true)}
        >
          <InfoRow icon="video-outline" text="Tap to play video" actionIcon="play-circle-outline" />
        </Pressable>
      ) : (
        <MountedVideoPlayer key={url} url={url} mediaWidth={mediaWidth} />
      )}
      {!!message.content?.caption && (
        <Text selectable style={styles.messageText}>{message.content.caption}</Text>
      )}
    </>
  );
});

function DocumentRenderer({ message }: RendererProps) {
  if (!message.asset?.url) return <AssetUnavailable message={message} />;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open document"
        onPress={() => openUrl(message.asset!.url, "This document is not available.")}
      >
        <InfoRow
          icon="file-document-outline"
          text={message.asset.fileName || message.content?.filename || "Document"}
          detail={message.asset.size ? formatFileSize(message.asset.size) : undefined}
          actionIcon="open-in-new"
        />
      </Pressable>
      {!!message.content?.caption && (
        <Text selectable style={styles.messageText}>{message.content.caption}</Text>
      )}
    </>
  );
}

function StickerRenderer({ message }: RendererProps) {
  if (!message.asset?.url) return <AssetUnavailable message={message} />;
  return (
    <Image
      source={{ uri: message.asset.url }}
      style={styles.sticker}
      contentFit="contain"
      cachePolicy="memory-disk"
      recyclingKey={message.id}
    />
  );
}

function AudioRenderer({ message }: RendererProps) {
  if (!message.asset?.url) return <AssetUnavailable message={message} />;
  return (
    <AudioMessagePlayer
      url={message.asset.url}
      voice={Boolean(message.payload?.voice ?? message.content?.voice)}
      fallbackDurationMs={message.asset.durationMs}
    />
  );
}

function LocationRenderer({ message }: RendererProps) {
  const latitude = parseCoordinate(message.content?.latitude, -90, 90);
  const longitude = parseCoordinate(message.content?.longitude, -180, 180);
  const hasCoordinates = latitude !== null && longitude !== null;
  const label = message.content?.name || message.content?.address || "Shared location";
  const mapUrl = hasCoordinates
    ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
    : undefined;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open shared location"
      onPress={() => openUrl(mapUrl, "Coordinates were not included with this location.")}
    >
      <InfoRow
        icon="map-marker-outline"
        text={label}
        detail={hasCoordinates ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` : undefined}
        actionIcon="map-outline"
      />
    </Pressable>
  );
}

function isRecord(val: unknown): val is Record<string, any> {
  return typeof val === "object" && val !== null;
}

function normalizeContacts(content: unknown): WaContact[] {
  const candidate = Array.isArray(content)
    ? content
    : isRecord(content) && Array.isArray(content.contacts)
      ? content.contacts
      : [];

  return candidate.filter(
    (item): item is WaContact => isRecord(item) && isRecord(item.name),
  );
}

function ContactRenderer({ message }: RendererProps) {
  const contacts = normalizeContacts(message.content);

  if (contacts.length === 0) {
    return (
      <InfoRow
        icon="account-alert-outline"
        text="Contact unavailable"
        muted
      />
    );
  }

  if (contacts.length > 1) {
    return (
      <InfoRow
        icon="account-multiple-outline"
        text={`${contacts.length} shared contacts`}
        detail="Shared contact list"
      />
    );
  }

  const contact = contacts[0];
  const rawPhone = contact?.phones?.[0]?.phone;
  const phone = formatWhatsAppPhone(rawPhone);
  const rawEmail = contact?.emails?.[0]?.email;
  const email = sanitizeEmail(rawEmail);

  return (
    <View style={styles.contact}>
      <InfoRow
        icon="account-box-outline"
        text={contact?.name?.formatted_name || "Shared contact"}
        detail={rawPhone || rawEmail}
      />
      {(phone || email) && (
        <View style={styles.contactActions}>
          {!!phone && (
            <IconButton
              icon="phone-outline"
              size={20}
              accessibilityLabel="Call contact"
              onPress={() => openUrl(`tel:${phone}`, "This phone number cannot be called.")}
            />
          )}
          {!!phone && (
            <IconButton
              icon="message-text-outline"
              size={20}
              accessibilityLabel="Send SMS"
              onPress={() => openUrl(`sms:${phone}`, "Messaging is not available for this number.")}
            />
          )}
          {!!email && (
            <IconButton
              icon="email-outline"
              size={20}
              accessibilityLabel="Email contact"
              onPress={() => openUrl(`mailto:${email}`, "Email is not available for this contact.")}
            />
          )}
        </View>
      )}
    </View>
  );
}

function InteractiveRenderer({ message }: RendererProps) {
  return (
    <InfoRow
      icon="gesture-tap-button"
      text={message.content?.body || message.content?.title || message.content?.text || "Interactive response"}
      detail={message.content?.description}
    />
  );
}

function FlowRenderer({ message }: RendererProps) {
  return (
    <InfoRow
      icon="form-select"
      text={message.content?.body || message.content?.title || "Flow response"}
      detail={message.payload?.subtype}
    />
  );
}

function OrderRenderer({ message }: RendererProps) {
  const itemCount = Array.isArray(message.content?.product_items)
    ? message.content.product_items.length
    : 0;
  return (
    <InfoRow
      icon="cart-outline"
      text={itemCount ? `WhatsApp order · ${itemCount} item${itemCount === 1 ? "" : "s"}` : "WhatsApp order"}
      detail={message.content?.catalog_id}
    />
  );
}

function SystemRenderer({ message }: RendererProps) {
  return (
    <InfoRow
      icon="information-outline"
      text={message.content?.body || message.content?.type || "WhatsApp system message"}
      muted
    />
  );
}

function TemplateRenderer({ message }: RendererProps) {
  const preview = message.content?.localPreview;
  if (preview?.body) {
    return (
      <View style={styles.templateCard}>
        <View style={styles.templateHeader}>
          <MaterialCommunityIcons name="receipt-text-outline" size={20} color={Colors.primary} />
          <Text style={styles.templateTitle}>{preview.title || "Template message"}</Text>
        </View>
        <Text selectable style={styles.templateBody}>{preview.body}</Text>
        {preview.documentFilename ? (
          <Pressable
            accessibilityRole={message.asset?.url ? "button" : undefined}
            accessibilityLabel={message.asset?.url ? `Open ${preview.documentFilename}` : undefined}
            disabled={!message.asset?.url}
            onPress={() => openUrl(message.asset?.url, "This PDF is not available.")}
            style={({ pressed }) => [
              styles.templateDocument,
              message.asset?.url && styles.templateDocumentOpenable,
              pressed && message.asset?.url ? styles.templateDocumentPressed : null,
            ]}
          >
            <MaterialCommunityIcons name="file-pdf-box" size={20} color={Colors.danger} />
            <Text numberOfLines={1} style={styles.templateDocumentName}>
              {preview.documentFilename}
            </Text>
            <MaterialCommunityIcons
              name={message.asset?.url ? "open-in-new" : "cloud-off-outline"}
              size={17}
              color={message.asset?.url ? Colors.primary : Colors.textSecondary}
            />
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <InfoRow
      icon="card-text-outline"
      text={message.templateName || message.content?.template?.name || "Template message"}
      detail={message.templateLanguage}
    />
  );
}

function ReactionRenderer({ message }: RendererProps) {
  return <InfoRow icon="emoticon-outline" text={message.content?.emoji || "Reaction"} />;
}

function UnsupportedRenderer({ message }: RendererProps) {
  const sourceType = message.content?.type || message.payload?.subtype || "unknown";
  return (
    <InfoRow
      icon="message-question-outline"
      text="New WhatsApp message type"
      detail={`Type: ${sourceType}`}
      muted
    />
  );
}

function InfoRow({
  icon,
  text,
  detail,
  actionIcon,
  muted,
}: {
  icon: MaterialIconName;
  text: string;
  detail?: string;
  actionIcon?: MaterialIconName;
  muted?: boolean;
}) {
  return (
    <View style={styles.infoRow}>
      <MaterialCommunityIcons
        name={icon}
        size={28}
        color={muted ? Colors.textSecondary : Colors.primary}
      />
      <View style={styles.infoText}>
        <Text selectable style={[styles.infoTitle, muted && styles.muted]} numberOfLines={2}>
          {text}
        </Text>
        {!!detail && (
          <Text selectable style={styles.infoDetail} numberOfLines={1}>{detail}</Text>
        )}
      </View>
      {!!actionIcon && (
        <MaterialCommunityIcons name={actionIcon} size={18} color={Colors.textSecondary} />
      )}
    </View>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const RENDERERS: Record<WaMessageType, ComponentType<RendererProps>> = {
  TEXT: TextRenderer,
  IMAGE: ImageRenderer,
  DOCUMENT: DocumentRenderer,
  AUDIO: AudioRenderer,
  VIDEO: VideoRenderer,
  STICKER: StickerRenderer,
  TEMPLATE: TemplateRenderer,
  FLOW: FlowRenderer,
  INTERACTIVE: InteractiveRenderer,
  LOCATION: LocationRenderer,
  CONTACT_CARD: ContactRenderer,
  REACTION: ReactionRenderer,
  ORDER: OrderRenderer,
  SYSTEM: SystemRenderer,
  UNSUPPORTED: UnsupportedRenderer,
};

// ponytail: identity equality ensures React Query immutable message updates re-render properly
export const MessageContentRenderer = memo(
  function MessageContentRenderer({ message, onOpenImage }: RendererProps) {
    const Renderer = RENDERERS[message.type] || UnsupportedRenderer;
    return <Renderer message={message} onOpenImage={onOpenImage} />;
  },
  (prev, next) => prev.message === next.message && prev.onOpenImage === next.onOpenImage
);

const styles = StyleSheet.create({
  messageText: {
    color: "#1F2937",
    fontSize: 16,
  },
  imageFrame: {
    width: 220,
    height: 220,
    borderRadius: 8,
    marginBottom: 6,
    backgroundColor: Colors.surfaceOffset,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imageLoading: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(243, 244, 246, 0.7)",
  },
  video: {
    borderRadius: 8,
    marginBottom: 6,
    backgroundColor: Colors.surfaceOffset,
  },
  sticker: {
    width: 150,
    height: 150,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
    paddingHorizontal: 4,
    maxWidth: "100%",
  },
  infoText: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1F2937",
  },
  infoDetail: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  muted: {
    color: Colors.textSecondary,
  },
  processingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    maxWidth: "100%",
  },
  templateCard: {
    gap: 8,
    minWidth: 230,
    maxWidth: 290,
    paddingVertical: 4,
  },
  templateHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  templateTitle: {
    color: "#1F2937",
    fontSize: 15,
    fontWeight: "700",
  },
  templateBody: {
    color: "#374151",
    fontSize: 14,
    lineHeight: 20,
  },
  templateDocument: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: Colors.surfaceOffset,
  },
  templateDocumentOpenable: {
    borderWidth: 1,
    borderColor: Colors.border,
  },
  templateDocumentPressed: {
    opacity: 0.72,
  },
  templateDocumentName: {
    flex: 1,
    color: "#1F2937",
    fontSize: 12,
    fontWeight: "600",
  },
  contact: {
    gap: 6,
    maxWidth: "100%",
  },
  contactActions: {
    flexDirection: "row",
    gap: 4,
  },
  viewer: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  viewerImage: {
    width: "100%",
    height: "100%",
  },
  viewerClose: {
    position: "absolute",
    top: 48,
    right: 16,
  },
});
