import { useState, useMemo } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator } from "react-native";
import { Text, TextInput, Icon, Divider } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { useStorageObjectsQuery, useDeleteStorageObjectMutation } from "../../hooks/useDashboard";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { goBack } from "../navigation-ref";

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

export function StorageManagement() {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: files, isLoading, isFetching, refetch } = useStorageObjectsQuery();
  const deleteMutation = useDeleteStorageObjectMutation();

  const filteredFiles = useMemo(() => {
    const list = files || [];
    if (!searchQuery) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (f) =>
        f.fileName.toLowerCase().includes(q) ||
        f.storageKey.toLowerCase().includes(q)
    );
  }, [files, searchQuery]);

  const handleDelete = (file: any) => {
    Alert.alert(
      "Confirm Deletion",
      `Are you sure you want to permanently delete "${file.fileName}" from S3 storage? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Permanent",
          style: "destructive",
          onPress: () => {
            deleteMutation.mutate(file.id, {
              onSuccess: () => {
                Alert.alert("Success", "File deleted successfully from storage.");
              },
              onError: (err: any) => {
                Alert.alert("Error", err.message || "Failed to delete file.");
              },
            });
          },
        },
      ]
    );
  };

  const getMimeIcon = (mime: string) => {
    if (mime.startsWith("image/")) return "image-outline";
    if (mime.startsWith("audio/")) return "music-note-outline";
    if (mime.startsWith("video/")) return "video-outline";
    if (mime === "application/pdf") return "file-pdf-box";
    return "file-outline";
  };

  const List = FlashList as any;

  return (
    <Screen edges={["top", "left", "right"]} scroll={false}>
      <AppHeader
        title="S3 Cloud Assets"
        subtitle="Manage and delete uploaded media, invoices & images."
        showBack
        onBack={goBack}
      />

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <TextInput
          placeholder="Search S3 files by name..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          mode="outlined"
          dense
          outlineColor={colors.border}
          activeOutlineColor={colors.primary}
          style={styles.searchInput}
          left={<TextInput.Icon icon="magnify" color={colors.textSecondary} />}
          right={
            searchQuery ? (
              <TextInput.Icon
                icon="close"
                color={colors.textSecondary}
                onPress={() => setSearchQuery("")}
              />
            ) : null
          }
        />
      </View>

      <View style={styles.listWrapper}>
        {isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <List
            data={filteredFiles}
            keyExtractor={(item: any) => item.id}
            estimatedItemSize={72}
            onRefresh={refetch}
            refreshing={isFetching || deleteMutation.isPending}
            renderItem={({ item: file }: { item: any }) => {
              const dateStr = new Date(file.createdAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <View style={styles.fileCard}>
                  <View style={styles.iconContainer}>
                    <Icon source={getMimeIcon(file.mimeType)} size={24} color={colors.primary} />
                  </View>
                  <View style={styles.detailsContainer}>
                    <Text style={styles.fileName} numberOfLines={1}>
                      {file.fileName}
                    </Text>
                    <Text style={styles.fileKey} numberOfLines={1}>
                      {file.storageKey}
                    </Text>
                    <Text style={styles.metaText}>
                      {formatBytes(file.sizeBytes)} • {dateStr}
                    </Text>
                  </View>
                  <Pressable
                    style={({ pressed }) => [
                      styles.deleteBtn,
                      pressed && styles.deleteBtnPressed,
                    ]}
                    onPress={() => handleDelete(file)}
                    disabled={deleteMutation.isPending}
                  >
                    <Icon source="trash-can-outline" size={20} color={colors.danger} />
                  </Pressable>
                </View>
              );
            }}
            ListEmptyComponent={
              <EmptyState
                title="No storage items found"
                subtitle={
                  searchQuery
                    ? "Try resetting search query to view all items."
                    : "No uploaded files tracked in S3 cloud storage."
                }
                icon="cloud-off-outline"
              />
            }
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInput: {
    backgroundColor: colors.surface,
    fontSize: fontSize.sm,
  },
  listWrapper: {
    flex: 1,
    backgroundColor: colors.surfaceOffset,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  fileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  detailsContainer: {
    flex: 1,
    minWidth: 0,
  },
  fileName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  fileKey: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  metaText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
    marginTop: 2,
  },
  deleteBtn: {
    padding: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: "rgba(220, 38, 38, 0.05)",
    marginLeft: spacing.sm,
  },
  deleteBtnPressed: {
    backgroundColor: "rgba(220, 38, 38, 0.15)",
  },
});
