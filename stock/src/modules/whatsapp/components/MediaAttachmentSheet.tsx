import { Image, StyleSheet, View } from "react-native";
import { Button, ProgressBar, Text, TextInput } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";
import { colors as Colors } from "../../../theme";
import { AppBottomSheetModal } from "../../../components/overlays/AppBottomSheetModal";
import type { WaLocalMedia } from "../../../api/whatsapp.api";

type Props = {
  media: WaLocalMedia | null;
  caption: string;
  progress: number;
  uploading: boolean;
  onCaptionChange: (caption: string) => void;
  onCancelUpload: () => void;
  onClose: () => void;
  onSend: () => void;
};

function formatSize(size?: number) {
  if (!size) return "";
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function VideoAttachmentPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri });

  return (
    <VideoView
      player={player}
      style={styles.preview}
      nativeControls
      contentFit="contain"
      fullscreenOptions={{ enable: true }}
    />
  );
}

export function MediaAttachmentSheet({
  media,
  caption,
  progress,
  uploading,
  onCaptionChange,
  onCancelUpload,
  onClose,
  onSend,
}: Props) {
  const subtitle = media
    ? `${media.name}${media.size ? ` · ${formatSize(media.size)}` : ""}`
    : undefined;

  return (
    <AppBottomSheetModal
      visible={Boolean(media)}
      title="Send attachment"
      subtitle={subtitle}
      onDismiss={onClose}
      isBusy={uploading}
      minHeight={0.88}
      maxHeight={0.95}
      scrollable
    >
      <View style={styles.content}>
        {media?.kind === "image" ? (
          <Image source={{ uri: media.uri }} style={styles.preview} resizeMode="contain" />
        ) : media?.kind === "video" ? (
          <VideoAttachmentPreview uri={media.uri} />
        ) : (
          <View style={styles.filePreview}>
            <MaterialCommunityIcons
              name="file-document-outline"
              size={48}
              color={Colors.primary}
            />
            <Text style={styles.fileName} numberOfLines={2}>{media?.name}</Text>
          </View>
        )}

        <TextInput
          mode="outlined"
          label="Caption (optional)"
          value={caption}
          onChangeText={onCaptionChange}
          maxLength={1024}
          multiline
          disabled={uploading}
          returnKeyType="default"
        />

        {uploading && (
          <View style={styles.progressRow}>
            <ProgressBar progress={progress} color={Colors.primary} style={styles.progress} />
            <Text style={styles.progressText}>{Math.round(progress * 100)}%</Text>
          </View>
        )}

        {uploading ? (
          <Button mode="outlined" icon="close" onPress={onCancelUpload}>
            Cancel upload
          </Button>
        ) : (
          <Button mode="contained" icon="send" onPress={onSend}>
            Upload and send
          </Button>
        )}
      </View>
    </AppBottomSheetModal>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
  },
  preview: {
    width: "100%",
    height: 260,
    backgroundColor: Colors.surfaceOffset,
    borderRadius: 12,
  },
  filePreview: {
    height: 150,
    gap: 12,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 12,
    backgroundColor: Colors.surfaceOffset,
  },
  fileName: { color: Colors.textPrimary, textAlign: "center", fontWeight: "600" },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  progress: { flex: 1, height: 6, borderRadius: 3 },
  progressText: {
    width: 42,
    color: Colors.textSecondary,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
});
