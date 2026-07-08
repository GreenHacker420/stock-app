import { useState, useMemo } from "react";
import { View, StyleSheet, Pressable, Alert, ActivityIndicator } from "react-native";
import { Text, TextInput, Icon, Button } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";

import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { useStorageObjectsQuery, useDeleteStorageObjectMutation, useBulkDeleteOrphansMutation } from "../../hooks/useDashboard";
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
  const [activeTab, setActiveTab] = useState<"ALL" | "ORPHANED">("ALL");

  const { data: files, isLoading, isFetching, refetch } = useStorageObjectsQuery(activeTab);
  const deleteMutation = useDeleteStorageObjectMutation();
  const bulkDeleteOrphansMutation = useBulkDeleteOrphansMutation();

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

  // Calculate total size of orphans displayed
  const reclaimableSize = useMemo(() => {
    if (activeTab !== "ORPHANED") return 0;
    return filteredFiles.reduce((acc, f) => acc + (f.sizeBytes || 0), 0);
  }, [filteredFiles, activeTab]);

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
                Alert.alert("Success", "File deleted successfully.");
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

  const handleBulkDelete = () => {
    if (filteredFiles.length === 0) return;
    Alert.alert(
      "Clean Up Storage?",
      `Are you sure you want to permanently delete all ${filteredFiles.length} unreferenced files?\n\nThis will instantly free up ${formatBytes(reclaimableSize)} of cloud storage.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clean Up All",
          style: "destructive",
          onPress: () => {
            bulkDeleteOrphansMutation.mutate(undefined, {
              onSuccess: (res: any) => {
                Alert.alert(
                  "Cleanup Complete",
                  `Successfully deleted ${res.count || 0} orphaned files and freed ${formatBytes(res.sizeBytesFreed || 0)}.`
                );
              },
              onError: (err: any) => {
                Alert.alert("Error", err.message || "Bulk deletion failed.");
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

      {/* Tabs / Filters Segmented Bar */}
      <View style={styles.tabContainer}>
        <Pressable
          style={[styles.tabBtn, activeTab === "ALL" && styles.tabBtnActive]}
          onPress={() => {
            setSearchQuery("");
            setActiveTab("ALL");
          }}
        >
          <Icon source="cloud-outline" size={18} color={activeTab === "ALL" ? colors.primary : colors.textSecondary} />
          <Text style={[styles.tabText, activeTab === "ALL" && styles.tabTextActive]}>All Files</Text>
        </Pressable>
        <Pressable
          style={[styles.tabBtn, activeTab === "ORPHANED" && styles.tabBtnActive]}
          onPress={() => {
            setSearchQuery("");
            setActiveTab("ORPHANED");
          }}
        >
          <Icon source="link-off" size={18} color={activeTab === "ORPHANED" ? colors.primary : colors.textSecondary} />
          <Text style={[styles.tabText, activeTab === "ORPHANED" && styles.tabTextActive]}>Unreferenced</Text>
        </Pressable>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <TextInput
          placeholder={activeTab === "ORPHANED" ? "Search unreferenced files..." : "Search S3 files by name..."}
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

      {/* Content Area */}
      <View style={styles.listWrapper}>
        {isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <List
            data={filteredFiles}
            keyExtractor={(item: any) => item.id}
            estimatedItemSize={210}
            numColumns={2}
            key={activeTab} // Changing tab forces Layout re-evaluation safely
            columnWrapperStyle={styles.gridRow}
            onRefresh={refetch}
            refreshing={isFetching || deleteMutation.isPending || bulkDeleteOrphansMutation.isPending}
            renderItem={({ item: file }: { item: any }) => {
              const dateStr = new Date(file.createdAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              });

              const isImage = file.mimeType.startsWith("image/");

              return (
                <View style={styles.gridCard}>
                  {/* Image/File Thumbnail Container */}
                  <View style={styles.thumbnailContainer}>
                    {isImage && file.url ? (
                      <Image
                        source={{ uri: file.url }}
                        style={styles.imageThumbnail}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={styles.fileFallback}>
                        <Icon source={getMimeIcon(file.mimeType)} size={32} color={colors.textSecondary} />
                        <Text style={styles.mimeText} numberOfLines={1}>
                          {file.mimeType.split("/")[1] || "file"}
                        </Text>
                      </View>
                    )}
                    {/* Absolute Delete Button floating on top-right */}
                    <Pressable
                      style={({ pressed }) => [
                        styles.deleteBtnFloating,
                        pressed && styles.deleteBtnFloatingPressed,
                      ]}
                      onPress={() => handleDelete(file)}
                      disabled={deleteMutation.isPending || bulkDeleteOrphansMutation.isPending}
                    >
                      <Icon source="trash-can-outline" size={16} color={colors.danger} />
                    </Pressable>
                  </View>

                  {/* Card Details Footer */}
                  <View style={styles.cardDetails}>
                    <Text style={styles.fileName} numberOfLines={1}>
                      {file.fileName}
                    </Text>
                    <Text style={styles.metaText} numberOfLines={1}>
                      {formatBytes(file.sizeBytes)} • {dateStr}
                    </Text>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <EmptyState
                title={activeTab === "ORPHANED" ? "No unreferenced files" : "No storage items found"}
                subtitle={
                  searchQuery
                    ? "Try resetting search query to view all items."
                    : activeTab === "ORPHANED"
                    ? "All uploaded assets are actively linked to products."
                    : "No uploaded files tracked in S3 cloud storage."
                }
                icon={activeTab === "ORPHANED" ? "folder-heart-outline" : "cloud-off-outline"}
              />
            }
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>

      {/* Floating Reclaimable Storage Footer */}
      {activeTab === "ORPHANED" && filteredFiles.length > 0 && (
        <View style={styles.footerBar}>
          <View style={styles.footerTextContainer}>
            <Text style={styles.footerLabel}>Reclaimable Storage</Text>
            <Text style={styles.footerValue}>
              {formatBytes(reclaimableSize)} ({filteredFiles.length} files)
            </Text>
          </View>
          <Button
            mode="contained"
            buttonColor={colors.danger}
            textColor={colors.textInverse}
            onPress={handleBulkDelete}
            loading={bulkDeleteOrphansMutation.isPending}
            disabled={bulkDeleteOrphansMutation.isPending}
            style={styles.cleanupBtn}
            contentStyle={{ paddingVertical: spacing.xs }}
            icon="trash-can-sweep"
          >
            Clean Orphans
          </Button>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabContainer: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceOffset,
    gap: spacing.xs,
  },
  tabBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  tabText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.primary,
  },
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
    padding: spacing.md,
    paddingBottom: 120,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  gridRow: {
    justifyContent: "space-between",
    paddingHorizontal: spacing.xs,
  },
  gridCard: {
    width: "48%",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: "hidden",
    ...shadow.sm,
  },
  thumbnailContainer: {
    height: 110,
    width: "100%",
    backgroundColor: colors.surfaceOffset,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  imageThumbnail: {
    width: "100%",
    height: "100%",
  },
  fileFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  mimeText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 4,
    textTransform: "uppercase",
    fontWeight: fontWeight.semibold,
  },
  deleteBtnFloating: {
    position: "absolute",
    top: spacing.xs,
    right: spacing.xs,
    padding: 6,
    borderRadius: radius.full,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    ...shadow.sm,
  },
  deleteBtnFloatingPressed: {
    backgroundColor: "rgba(244, 244, 245, 0.95)",
  },
  cardDetails: {
    padding: spacing.sm,
  },
  fileName: {
    fontSize: fontSize.xs + 1,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  metaText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
    marginTop: 2,
  },
  footerBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadow.lg,
  },
  footerTextContainer: {
    flex: 1,
  },
  footerLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
  },
  footerValue: {
    fontSize: fontSize.sm + 1,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginTop: 2,
  },
  cleanupBtn: {
    borderRadius: radius.md,
  },
});
