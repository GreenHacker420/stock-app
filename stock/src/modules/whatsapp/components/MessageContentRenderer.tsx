import { type ComponentType, useRef, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { IconButton, Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";
import { colors as Colors } from "../../../theme";
import type { WaContact, WaMessage, WaMessageType } from "../../../api/whatsapp.api";
import { AudioMessagePlayer } from "./AudioMessagePlayer";

type RendererProps = {
  message: WaMessage;
};

function openUrl(url?: string, failureMessage = "This item cannot be opened.") {
  if (!url) {
    Alert.alert("Unavailable", failureMessage);
    return;
  }
  Linking.openURL(url).catch(() => Alert.alert("Open failed", failureMessage));
}

function AssetUnavailable({ message }: RendererProps) {
  const label = message.asset?.status === "FAILED"
    ? "Media processing failed"
    : "Media is still processing";
  return <InfoRow icon="cloud-alert" text={label} muted />;
}

function TextRenderer({ message }: RendererProps) {
  return <Text selectable style={styles.messageText}>{message.content?.text || ""}</Text>;
}

function ImageRenderer({ message }: RendererProps) {
  const [visible, setVisible] = useState(false);
  const url = message.asset?.url;
  if (!url) return <AssetUnavailable message={message} />;

  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel="Open image" onPress={() => setVisible(true)}>
        <Image source={{ uri: url }} style={styles.image} resizeMode="cover" />
      </Pressable>
      {!!(message.content?.caption || message.content?.text) && (
        <Text selectable style={styles.messageText}>
          {message.content.caption || message.content.text}
        </Text>
      )}
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={styles.viewer}>
          <Image source={{ uri: url }} style={styles.viewerImage} resizeMode="contain" />
          <IconButton
            icon="close"
            iconColor="#fff"
            size={28}
            accessibilityLabel="Close image"
            onPress={() => setVisible(false)}
            style={styles.viewerClose}
          />
        </View>
      </Modal>
    </>
  );
}

function VideoRenderer({ message }: RendererProps) {
  const url = message.asset?.url;
  const player = useVideoPlayer(url ? { uri: url } : null);
  if (!url) return <AssetUnavailable message={message} />;

  return (
    <>
      <VideoView
        player={player}
        style={styles.video}
        nativeControls
        contentFit="contain"
        fullscreenOptions={{ enable: true }}
      />
      {!!message.content?.caption && (
        <Text selectable style={styles.messageText}>{message.content.caption}</Text>
      )}
    </>
  );
}

function DocumentRenderer({ message }: RendererProps) {
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open document"
        onPress={() => openUrl(message.asset?.url, "This document is not available.")}
      >
        <InfoRow
          icon="file-document-outline"
          text={message.asset?.fileName || message.content?.filename || "Document"}
          detail={message.asset?.size ? formatFileSize(message.asset.size) : undefined}
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
  return <Image source={{ uri: message.asset.url }} style={styles.sticker} resizeMode="contain" />;
}

function AudioRenderer({ message }: RendererProps) {
  return (
    <AudioMessagePlayer
      url={message.asset?.url}
      voice={message.payload?.voice}
      fallbackDurationMs={message.asset?.durationMs}
    />
  );
}

function LocationRenderer({ message }: RendererProps) {
  const latitude = Number(message.content?.latitude);
  const longitude = Number(message.content?.longitude);
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
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

function normalizeContacts(content: unknown): WaContact[] {
  if (Array.isArray(content)) return content as WaContact[];
  if (Array.isArray((content as any)?.contacts)) return (content as any).contacts;
  return [];
}

function ContactRenderer({ message }: RendererProps) {
  const contacts = normalizeContacts(message.content);
  const contact = contacts[0];
  const phone = contact?.phones?.[0]?.phone;
  const email = contact?.emails?.[0]?.email;

  return (
    <View style={styles.contact}>
      <InfoRow
        icon="account-box-outline"
        text={contact?.name?.formatted_name || (contacts.length > 1 ? `${contacts.length} contacts` : "Shared contact")}
        detail={phone || email}
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
  icon: string;
  text: string;
  detail?: string;
  actionIcon?: string;
  muted?: boolean;
}) {
  return (
    <View style={styles.infoRow}>
      <MaterialCommunityIcons
        name={icon as any}
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
        <MaterialCommunityIcons name={actionIcon as any} size={18} color={Colors.textSecondary} />
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

export function MessageContentRenderer({ message }: RendererProps) {
  const Renderer = RENDERERS[message.type] || UnsupportedRenderer;
  return <Renderer message={message} />;
}

const styles = StyleSheet.create({
  messageText: {
    color: "#1F2937",
    fontSize: 16,
  },
  image: {
    width: 230,
    height: 230,
    borderRadius: 8,
    marginBottom: 6,
    backgroundColor: Colors.surfaceOffset,
  },
  sticker: {
    width: 180,
    height: 180,
  },
  video: {
    width: 250,
    height: 180,
    borderRadius: 8,
    backgroundColor: "#000",
  },
  viewer: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerImage: {
    width: "100%",
    height: "100%",
  },
  viewerClose: {
    position: "absolute",
    top: 48,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  infoRow: {
    width: 240,
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 9,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  infoText: {
    flex: 1,
    gap: 2,
  },
  infoTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  infoDetail: {
    color: Colors.textSecondary,
    fontSize: 11,
  },
  muted: {
    color: Colors.textSecondary,
    fontWeight: "500",
  },
  contact: {
    gap: 2,
  },
  contactActions: {
    height: 38,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
});
