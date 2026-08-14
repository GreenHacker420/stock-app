import { useState } from "react";
import { View, StyleSheet, TouchableOpacity, Image, Alert } from "react-native";
import { Text, ActivityIndicator, IconButton } from "react-native-paper";
import {
  launchImageLibraryAsync,
  launchCameraAsync,
  useMediaLibraryPermissions,
  useCameraPermissions,
} from "expo-image-picker";
import { getDocumentAsync } from "expo-document-picker";
import { File, UploadType } from "expo-file-system";
import * as Crypto from "expo-crypto";
import { createUploadIntent, completeAssetUpload } from "../../api/ledger.api";
import { colors, spacing, radius, fontSize } from "../../theme";

export interface UploadedAttachment {
  assetId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uri: string;
  purpose?: string;
  checksumSha256?: string;
}

interface AttachmentUploaderProps {
  shopId: string;
  domain?: string;
  attachments: UploadedAttachment[];
  onAttachmentsChange: (attachments: UploadedAttachment[]) => void;
  maxFiles?: number;
}

async function resolveFileMetadata(uri: string, fallbackSize?: number | null) {
  const localFile = new File(uri);
  let sizeBytes = Number(fallbackSize || 0);
  try {
    const info = typeof (localFile as any).info === "function" ? await (localFile as any).info() : null;
    if (info?.size && Number(info.size) > 0) sizeBytes = Number(info.size);
  } catch {
    // fall through
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new Error("Could not determine file size. Please reselect the file.");
  }

  const bytes = await localFile.bytes();
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
  const checksumSha256 = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return { sizeBytes, checksumSha256, localFile };
}

export function AttachmentUploader({
  shopId,
  domain = "CUSTOMER_LEDGER",
  attachments,
  onAttachmentsChange,
  maxFiles = 5,
}: AttachmentUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [permissionResponse, requestPermission] = useMediaLibraryPermissions();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const handleTakePhoto = async () => {
    if (attachments.length >= maxFiles) {
      Alert.alert("Limit Reached", `You can attach up to ${maxFiles} files.`);
      return;
    }

    if (!cameraPermission?.granted) {
      const perm = await requestCameraPermission();
      if (!perm.granted) {
        Alert.alert("Permission Required", "Camera permission is required to capture photo.");
        return;
      }
    }

    const result = await launchCameraAsync({
      quality: 0.8,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets && result.assets[0]) {
      const asset = result.assets[0];
      await uploadFile({
        uri: asset.uri,
        fileName: asset.fileName || `camera_${Date.now()}.jpg`,
        mimeType: asset.mimeType || "image/jpeg",
        sizeBytes: asset.fileSize ?? null,
      });
    }
  };

  const handlePickImage = async () => {
    if (attachments.length >= maxFiles) {
      Alert.alert("Limit Reached", `You can attach up to ${maxFiles} files.`);
      return;
    }

    if (!permissionResponse?.granted) {
      const perm = await requestPermission();
      if (!perm.granted) {
        Alert.alert("Permission Required", "Permission to access photo library is required.");
        return;
      }
    }

    const result = await launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets[0]) {
      const asset = result.assets[0];
      await uploadFile({
        uri: asset.uri,
        fileName: asset.fileName || `photo_${Date.now()}.jpg`,
        mimeType: asset.mimeType || "image/jpeg",
        sizeBytes: asset.fileSize ?? null,
      });
    }
  };

  const handlePickDocument = async () => {
    if (attachments.length >= maxFiles) {
      Alert.alert("Limit Reached", `You can attach up to ${maxFiles} files.`);
      return;
    }

    const result = await getDocumentAsync({
      type: ["image/*", "application/pdf"],
      copyToCacheDirectory: true,
    });

    if (!result.canceled && result.assets && result.assets[0]) {
      const doc = result.assets[0];
      await uploadFile({
        uri: doc.uri,
        fileName: doc.name || `doc_${Date.now()}`,
        mimeType: doc.mimeType || "application/pdf",
        sizeBytes: doc.size ?? null,
      });
    }
  };

  const uploadFile = async (fileInfo: {
    uri: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number | null;
  }) => {
    try {
      setUploading(true);
      setUploadProgress("Preparing...");

      const { sizeBytes, checksumSha256, localFile } = await resolveFileMetadata(
        fileInfo.uri,
        fileInfo.sizeBytes,
      );

      const intent = await createUploadIntent({
        shopId,
        domain,
        fileName: fileInfo.fileName,
        mimeType: fileInfo.mimeType,
        sizeBytes,
        checksumSha256,
      });

      setUploadProgress("Uploading...");

      const uploadTask = localFile.createUploadTask(intent.uploadUrl, {
        httpMethod: "PUT",
        headers: {
          "Content-Type": fileInfo.mimeType,
          ...(intent.headers || {}),
        },
        uploadType: UploadType.BINARY_CONTENT,
        onProgress: ({ bytesSent, totalBytes }) => {
          if (totalBytes > 0) {
            const pct = Math.round((bytesSent / totalBytes) * 100);
            setUploadProgress(`Uploading ${pct}%...`);
          }
        },
      });

      const uploadResult = await uploadTask.uploadAsync();

      if (!uploadResult || uploadResult.status < 200 || uploadResult.status >= 300) {
        throw new Error(`Upload failed with status ${uploadResult?.status ?? "unknown"}`);
      }

      setUploadProgress("Completing...");
      await completeAssetUpload(intent.assetId, { shopId });

      const newAttachment: UploadedAttachment = {
        assetId: intent.assetId,
        fileName: fileInfo.fileName,
        mimeType: fileInfo.mimeType,
        sizeBytes,
        uri: fileInfo.uri,
        checksumSha256,
      };

      onAttachmentsChange([...attachments, newAttachment]);
    } catch (err: any) {
      Alert.alert("Upload Failed", err?.message || "Could not upload attachment");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleRemove = (index: number) => {
    const next = [...attachments];
    next.splice(index, 1);
    onAttachmentsChange(next);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Attachments ({attachments.length}/{maxFiles})</Text>

      {attachments.length > 0 && (
        <View style={styles.attachmentList}>
          {attachments.map((item, idx) => (
            <View key={item.assetId || idx} style={styles.attachmentChip}>
              {item.mimeType.startsWith("image/") ? (
                <Image source={{ uri: item.uri }} style={styles.thumbnail} />
              ) : (
                <IconButton icon="file-pdf-box" size={24} iconColor={colors.primary} />
              )}
              <Text style={styles.fileName} numberOfLines={1}>
                {item.fileName}
              </Text>
              <IconButton icon="close-circle" size={18} onPress={() => handleRemove(idx)} />
            </View>
          ))}
        </View>
      )}

      {uploading ? (
        <View style={styles.uploadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.uploadingText}>{uploadProgress}</Text>
        </View>
      ) : attachments.length < maxFiles ? (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionButton} onPress={handleTakePhoto}>
            <IconButton icon="camera" size={18} iconColor={colors.primary} style={{ margin: 0, marginRight: 2 }} />
            <Text style={styles.actionText}>Camera</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handlePickImage}>
            <IconButton icon="image-outline" size={18} iconColor={colors.primary} style={{ margin: 0, marginRight: 2 }} />
            <Text style={styles.actionText}>Gallery</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handlePickDocument}>
            <IconButton icon="file-document-outline" size={18} iconColor={colors.primary} style={{ margin: 0, marginRight: 2 }} />
            <Text style={styles.actionText}>Document</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.sm,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  attachmentList: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  attachmentChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  thumbnail: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    marginRight: spacing.xs,
  },
  fileName: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.textPrimary,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    borderRadius: radius.md,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  actionText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  uploadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    padding: spacing.sm,
  },
  uploadingText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
});
