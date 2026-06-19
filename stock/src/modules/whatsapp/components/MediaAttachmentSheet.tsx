import { Image, Modal, Pressable, StyleSheet, View } from "react-native";
import { Button, IconButton, ProgressBar, Text, TextInput } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors as Colors } from "../../../theme";
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
  return (
    <Modal visible={Boolean(media)} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.dismissArea} onPress={uploading ? undefined : onClose} />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <View>
              <Text variant="titleMedium" style={styles.title}>Send attachment</Text>
              <Text variant="bodySmall" style={styles.subtitle} numberOfLines={1}>
                {media?.name}{media?.size ? ` · ${formatSize(media.size)}` : ""}
              </Text>
            </View>
            <IconButton icon="close" disabled={uploading} onPress={onClose} />
          </View>

          {media?.kind === "image" ? (
            <Image source={{ uri: media.uri }} style={styles.preview} resizeMode="contain" />
          ) : (
            <View style={styles.filePreview}>
              <MaterialCommunityIcons
                name={media?.kind === "video" ? "video-outline" : "file-document-outline"}
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.35)",
  },
  dismissArea: { flex: 1 },
  sheet: {
    gap: 14,
    paddingHorizontal: 16,
    paddingBottom: 24,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.borderStrong,
    alignSelf: "center",
    marginTop: 8,
  },
  header: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { color: Colors.textPrimary, fontWeight: "700" },
  subtitle: { color: Colors.textSecondary, maxWidth: 280 },
  preview: {
    width: "100%",
    height: 260,
    backgroundColor: Colors.surfaceOffset,
    borderRadius: 8,
  },
  filePreview: {
    height: 150,
    gap: 12,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 8,
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
