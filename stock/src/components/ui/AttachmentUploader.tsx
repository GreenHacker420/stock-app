import { useState } from "react";
import { View, StyleSheet, TouchableOpacity, Image, Alert } from "react-native";
import { Text, ActivityIndicator, IconButton } from "react-native-paper";
import { launchImageLibraryAsync, useMediaLibraryPermissions } from "expo-image-picker";
import { getDocumentAsync } from "expo-document-picker";
import { File, UploadType } from "expo-file-system";
import { createUploadIntent, completeAssetUpload } from "../../api/ledger.api";
import { colors, spacing, radius, fontSize } from "../../theme";

export interface UploadedAttachment {
  assetId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uri: string;
  purpose?: string;
}

interface AttachmentUploaderProps {
  shopId: string;
  domain?: string;
  attachments: UploadedAttachment[];
  onAttachmentsChange: (attachments: UploadedAttachment[]) => void;
  maxFiles?: number;
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
        sizeBytes: asset.fileSize || 1024,
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
        sizeBytes: doc.size || 1024,
      });
    }
  };

  const uploadFile = async (fileInfo: { uri: string; fileName: string; mimeType: string; sizeBytes: number }) => {
    try {
      setUploading(true);
      setUploadProgress("Preparing...");

      // 1. Create upload intent
      const intent = await createUploadIntent({
        shopId,
        domain,
        fileName: fileInfo.fileName,
        mimeType: fileInfo.mimeType,
        sizeBytes: fileInfo.sizeBytes,
      });

      setUploadProgress("Uploading...");

      // 2. Direct binary upload to S3 presigned URL using modern SDK 56 File class upload task
      const localFile = new File(fileInfo.uri);
      const uploadTask = localFile.createUploadTask(intent.uploadUrl, {
        httpMethod: "PUT",
        headers: {
          "Content-Type": fileInfo.mimeType,
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

      // 3. Complete asset intent on server
      await completeAssetUpload(intent.assetId, { shopId });

      const newAttachment: UploadedAttachment = {
        assetId: intent.assetId,
        fileName: fileInfo.fileName,
        mimeType: fileInfo.mimeType,
        sizeBytes: fileInfo.sizeBytes,
        uri: fileInfo.uri,
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
          <TouchableOpacity style={styles.actionButton} onPress={handlePickImage}>
            <IconButton icon="camera" size={20} iconColor={colors.primary} />
            <Text style={styles.actionText}>Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={handlePickDocument}>
            <IconButton icon="file-document" size={20} iconColor={colors.primary} />
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
    gap: spacing.sm,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    borderRadius: radius.md,
    paddingRight: spacing.md,
  },
  actionText: {
    fontSize: fontSize.xs,
    fontWeight: "500",
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
