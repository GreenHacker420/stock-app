import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Alert,
  Modal,
  ScrollView,
  TextInput as RNTextInput,
  Dimensions,
} from "react-native";
import { Text, ActivityIndicator, Icon, Divider, Searchbar } from "react-native-paper";
import { Image } from "expo-image";
import * as Sharing from "expo-sharing";
import { File, Directory, Paths } from "expo-file-system";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { ScrollScreen } from "../../components/layout/ScrollScreen";
import { LoadingState } from "../../components/feedback/LoadingState";
import { useStorageObjectsQuery, useDeleteStorageObjectMutation, useBulkDeleteOrphansMutation } from "../../hooks/useDashboard";
import { useUpdateItemMutation } from "../../hooks/useItems";
import { invalidateAssetCache } from "../../hooks/useAssetCache";
import { useShopStore } from "../../auth/shop-store";
import type { StorageObject } from "../../api/client";
import { FlashList } from "@shopify/flash-list";
const FlashListAny = FlashList as any;

const SCREEN_WIDTH = Dimensions.get("window").width;
const NUM_COLS = 2;
const CARD_GAP = spacing.sm;
const CARD_WIDTH = (SCREEN_WIDTH - spacing.md * 2 - CARD_GAP) / NUM_COLS;

type SortKey = "date_desc" | "date_asc" | "size_desc" | "size_asc" | "name_asc";
type FileTypeFilter = "ALL" | "IMAGE" | "DOC" | "VIDEO" | "AUDIO";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function mimeLabel(mime: string): string {
  if (mime.startsWith("image/")) return mime.replace("image/", "").toUpperCase() + " Image";
  if (mime.startsWith("video/")) return mime.replace("video/", "").toUpperCase() + " Video";
  if (mime.startsWith("audio/")) return mime.replace("audio/", "").toUpperCase() + " Audio";
  if (mime === "application/pdf") return "PDF Document";
  return mime;
}

function isImage(mime: string) { return mime.startsWith("image/"); }

// ── Main Component ────────────────────────────────────────────────────────────

export function StorageManagement() {
  const activeShopId = useShopStore((s) => s.activeShopId);

  // ── Filter / Sort state ───────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"ALL" | "ORPHANED">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("ALL");
  const [filterBrand, setFilterBrand] = useState<string>("ALL");
  const [filterType, setFilterType] = useState<FileTypeFilter>("ALL");
  const [sortBy, setSortBy] = useState<SortKey>("date_desc");

  // ── Picker sheet state ────────────────────────────────────────────────────
  const [showCatSheet, setShowCatSheet] = useState(false);
  const [showBrandSheet, setShowBrandSheet] = useState(false);
  const [showTypeSheet, setShowTypeSheet] = useState(false);
  const [showSortSheet, setShowSortSheet] = useState(false);

  // ── Action state ─────────────────────────────────────────────────────────
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Info sheet / price edit state ─────────────────────────────────────────
  const [infoFile, setInfoFile] = useState<StorageObject | null>(null);
  const [editFile, setEditFile] = useState<StorageObject | null>(null);
  const [editMrp, setEditMrp] = useState("");
  const [editSelling, setEditSelling] = useState("");
  const [editMin, setEditMin] = useState("");

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data, isLoading, refetch } = useStorageObjectsQuery();
  const deleteMutation = useDeleteStorageObjectMutation();
  const bulkDeleteMutation = useBulkDeleteOrphansMutation();
  const updateItemMutation = useUpdateItemMutation();

  const allAssets = data?.assets ?? [];
  const categories = data?.categories ?? [];
  const brands = data?.brands ?? [];

  // ── Filter + Sort pipeline (all client-side) ──────────────────────────────
  const filtered = useMemo(() => {
    let list = allAssets;

    if (activeTab === "ORPHANED") {
      list = list.filter((a) => !a.productName && a.waMessagesCount === 0);
    }
    if (filterCategory !== "ALL") {
      list = list.filter((a) => a.categoryId === filterCategory);
    }
    if (filterBrand !== "ALL") {
      list = list.filter((a) => a.brandId === filterBrand);
    }
    if (filterType !== "ALL") {
      list = list.filter((a) => {
        switch (filterType) {
          case "IMAGE": return a.mimeType.startsWith("image/");
          case "VIDEO": return a.mimeType.startsWith("video/");
          case "AUDIO": return a.mimeType.startsWith("audio/");
          case "DOC":   return !a.mimeType.startsWith("image/") && !a.mimeType.startsWith("video/") && !a.mimeType.startsWith("audio/");
          default: return true;
        }
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((a) =>
        a.productName?.toLowerCase().includes(q) ||
        a.fileName.toLowerCase().includes(q) ||
        a.categoryName?.toLowerCase().includes(q) ||
        a.brandName?.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      switch (sortBy) {
        case "date_asc":  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "size_desc": return b.sizeBytes - a.sizeBytes;
        case "size_asc":  return a.sizeBytes - b.sizeBytes;
        case "name_asc":  return (a.productName || a.fileName).localeCompare(b.productName || b.fileName);
        default:          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
  }, [allAssets, activeTab, filterCategory, filterBrand, filterType, searchQuery, sortBy]);

  const totalSize = filtered.reduce((s, a) => s + a.sizeBytes, 0);
  const orphanCount = allAssets.filter((a) => !a.productName && a.waMessagesCount === 0).length;

  // ── Share — downloads file locally, shares actual bytes (not S3 URL) ──────
  const handleShare = useCallback(async (file: StorageObject) => {
    if (!file.url) { Alert.alert("Share Failed", "File URL unavailable."); return; }
    const ext = file.mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "bin";
    setSharingId(file.id);
    try {
      const cacheDir = new Directory(Paths.cache, "asset-share");
      cacheDir.create();          // idempotent — no-op if already exists
      const localFile = new File(cacheDir, `${file.id}.${ext}`);
      if (!localFile.exists) {
        // Download from S3 to local cache — recipient never sees the S3 URL
        await File.downloadFileAsync(file.url, cacheDir);
      }
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) { Alert.alert("Share", "Sharing is not available on this device."); return; }
      await Sharing.shareAsync(localFile.uri, {
        mimeType: file.mimeType,
        dialogTitle: file.productName || file.fileName,
      });
    } catch (err: any) {
      Alert.alert("Share Failed", err?.message || "Could not share file.");
    } finally {
      setSharingId(null);
    }
  }, []);

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = useCallback((file: StorageObject) => {
    Alert.alert(
      "Delete File",
      `Permanently delete "${file.productName || file.fileName}"?\n\nThis removes the file from S3 and the database.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: () => {
            setDeletingId(file.id);
            deleteMutation.mutate(file.id, {
              onSuccess: () => { setDeletingId(null); setInfoFile(null); },
              onError: (e: any) => { setDeletingId(null); Alert.alert("Error", e?.message || "Delete failed."); },
            });
          },
        },
      ]
    );
  }, [deleteMutation]);

  // ── Bulk delete ───────────────────────────────────────────────────────────
  const handleBulkDelete = () => {
    if (orphanCount === 0) { Alert.alert("No Orphans", "There are no unreferenced files to clean up."); return; }
    Alert.alert(
      "Clean Up Orphaned Files",
      `Delete all ${orphanCount} unreferenced file(s)? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete All", style: "destructive", onPress: () => bulkDeleteMutation.mutate() },
      ]
    );
  };

  // ── Price edit ────────────────────────────────────────────────────────────
  const openPriceEdit = (file: StorageObject) => {
    setEditFile(file);
    setEditMrp(file.mrp || "");
    setEditSelling(file.sellingPrice || "");
    setEditMin(file.minPrice || "");
    setInfoFile(null);
  };

  const handleSavePrices = () => {
    if (!editFile?.itemId) return;
    updateItemMutation.mutate(
      {
        id: editFile.itemId,
        data: {
          ...(editMrp ? { mrp: Number(editMrp) } : {}),
          ...(editSelling ? { defaultSellingPrice: Number(editSelling) } : {}),
          ...(editMin ? { minimumAllowedPrice: Number(editMin) } : {}),
        },
      },
      {
        onSuccess: () => {
          setEditFile(null);
          if (activeShopId) invalidateAssetCache(activeShopId);
          refetch();
          Alert.alert("Saved", "Prices updated successfully.");
        },
        onError: (e: any) => Alert.alert("Error", e?.message || "Could not save prices."),
      }
    );
  };

  // ── Card ──────────────────────────────────────────────────────────────────
  const renderItem = useCallback(({ item }: { item: StorageObject }) => {
    const isImg = isImage(item.mimeType);
    const isSharing = sharingId === item.id;
    const isDeleting = deletingId === item.id;
    const isOrphan = !item.productName && item.waMessagesCount === 0;

    return (
      <View style={[styles.card, { width: CARD_WIDTH }]}>
        <View style={styles.thumbnailContainer}>
          {isImg && item.url ? (
            <Image source={{ uri: item.url }} style={styles.thumbnail} contentFit="cover" cachePolicy="disk" transition={200} />
          ) : (
            <View style={styles.thumbnailFallback}>
              <Icon
                source={
                  item.mimeType.startsWith("video/") ? "video-outline" :
                  item.mimeType.startsWith("audio/") ? "music-note" :
                  item.mimeType === "application/pdf" ? "file-pdf-box" : "file-outline"
                }
                size={36}
                color={colors.primary}
              />
            </View>
          )}

          {/* Info badge — tap to open info sheet */}
          <Pressable style={styles.infoBadge} onPress={() => setInfoFile(item)} hitSlop={8}>
            <Icon source="information-outline" size={16} color="#fff" />
          </Pressable>

          {isOrphan && (
            <View style={styles.orphanBadge}>
              <Text style={styles.orphanBadgeText}>Unused</Text>
            </View>
          )}

          {(isSharing || isDeleting) && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="small" color="#fff" />
            </View>
          )}
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={2}>{item.productName || item.fileName}</Text>
          {item.categoryName && <Text style={styles.cardMeta} numberOfLines={1}>{item.categoryName}</Text>}
          <Text style={styles.cardSize}>{formatBytes(item.sizeBytes)}</Text>
        </View>

        <View style={styles.cardActions}>
          <Pressable style={[styles.actionBtn, styles.shareBtn]} onPress={() => handleShare(item)} disabled={isSharing || isDeleting}>
            <Icon source="share-variant" size={14} color={colors.primary} />
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={() => handleDelete(item)} disabled={isSharing || isDeleting}>
            <Icon source="delete-outline" size={14} color={colors.danger} />
          </Pressable>
        </View>
      </View>
    );
  }, [sharingId, deletingId, handleShare, handleDelete]);

  const activeFilterCount = [
    filterCategory !== "ALL", filterBrand !== "ALL", filterType !== "ALL", sortBy !== "date_desc",
  ].filter(Boolean).length;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <ScrollScreen title="Cloud Assets" subtitle={`${filtered.length} files · ${formatBytes(totalSize)}`} showBack>

        {/* Tabs */}
        <View style={styles.tabRow}>
          {(["ALL", "ORPHANED"] as const).map((tab) => (
            <Pressable key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === "ALL" ? `All Files (${allAssets.length})` : `Unreferenced (${orphanCount})`}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Search */}
        <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xs }}>
          <Searchbar
            placeholder="Search by product, file, category…"
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchBar}
            inputStyle={{ fontSize: fontSize.sm }}
            elevation={0}
          />
        </View>

        {/* Filter pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll} contentContainerStyle={styles.pillRow}>
          <Pressable style={[styles.pill, filterCategory !== "ALL" && styles.pillActive]} onPress={() => setShowCatSheet(true)}>
            <Text style={[styles.pillText, filterCategory !== "ALL" && styles.pillTextActive]}>
              {filterCategory === "ALL" ? "Category ▾" : categories.find((c) => c.id === filterCategory)?.name || "Category"}
            </Text>
          </Pressable>
          <Pressable style={[styles.pill, filterBrand !== "ALL" && styles.pillActive]} onPress={() => setShowBrandSheet(true)}>
            <Text style={[styles.pillText, filterBrand !== "ALL" && styles.pillTextActive]}>
              {filterBrand === "ALL" ? "Brand ▾" : brands.find((b) => b.id === filterBrand)?.name || "Brand"}
            </Text>
          </Pressable>
          <Pressable style={[styles.pill, filterType !== "ALL" && styles.pillActive]} onPress={() => setShowTypeSheet(true)}>
            <Text style={[styles.pillText, filterType !== "ALL" && styles.pillTextActive]}>
              {filterType === "ALL" ? "Type ▾" : filterType}
            </Text>
          </Pressable>
          <Pressable style={[styles.pill, sortBy !== "date_desc" && styles.pillActive]} onPress={() => setShowSortSheet(true)}>
            <Text style={[styles.pillText, sortBy !== "date_desc" && styles.pillTextActive]}>
              {sortBy === "date_desc" ? "Sort ▾" : sortBy === "date_asc" ? "↑ Date" : sortBy === "size_desc" ? "↓ Size" : sortBy === "size_asc" ? "↑ Size" : "A–Z"}
            </Text>
          </Pressable>
          {activeFilterCount > 0 && (
            <Pressable
              style={[styles.pill, { backgroundColor: colors.dangerLight, borderColor: colors.danger }]}
              onPress={() => { setFilterCategory("ALL"); setFilterBrand("ALL"); setFilterType("ALL"); setSortBy("date_desc"); }}
            >
              <Text style={[styles.pillText, { color: colors.danger }]}>✕ Clear ({activeFilterCount})</Text>
            </Pressable>
          )}
        </ScrollView>

        {/* Orphan cleanup banner */}
        {orphanCount > 0 && (
          <View style={styles.bulkRow}>
            <Text style={styles.bulkText}>{orphanCount} unreferenced file(s)</Text>
            <Pressable style={styles.bulkBtn} onPress={handleBulkDelete} disabled={bulkDeleteMutation.isPending}>
              {bulkDeleteMutation.isPending
                ? <ActivityIndicator size="small" color={colors.danger} />
                : <Text style={styles.bulkBtnText}>🗑 Clean Up</Text>
              }
            </Pressable>
          </View>
        )}

        {/* Grid */}
        {isLoading && allAssets.length === 0 ? (
          <LoadingState label="Loading cloud assets…" />
        ) : filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Icon source="cloud-off-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No assets found</Text>
            <Text style={styles.emptySubtitle}>Try adjusting your filters.</Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xxl }}>
            <FlashListAny
              data={filtered}
              keyExtractor={(item: StorageObject) => item.id}
              renderItem={renderItem}
              numColumns={NUM_COLS}
              estimatedItemSize={220}
              ItemSeparatorComponent={() => <View style={{ height: CARD_GAP }} />}
              scrollEnabled={false}
            />
          </View>
        )}
      </ScrollScreen>

      {/* ── Picker Sheets ────────────────────────────────────────────────── */}
      <PickerSheet visible={showCatSheet} title="Filter by Category"
        items={[{ id: "ALL", name: "All Categories" }, ...categories]}
        selected={filterCategory} onSelect={(id) => { setFilterCategory(id); setShowCatSheet(false); }} onClose={() => setShowCatSheet(false)} />
      <PickerSheet visible={showBrandSheet} title="Filter by Brand"
        items={[{ id: "ALL", name: "All Brands" }, ...brands]}
        selected={filterBrand} onSelect={(id) => { setFilterBrand(id); setShowBrandSheet(false); }} onClose={() => setShowBrandSheet(false)} />
      <PickerSheet visible={showTypeSheet} title="Filter by File Type"
        items={[
          { id: "ALL", name: "All Types" }, { id: "IMAGE", name: "🖼  Images" },
          { id: "DOC", name: "📄  Documents" }, { id: "VIDEO", name: "🎬  Videos" }, { id: "AUDIO", name: "🎵  Audio" },
        ]}
        selected={filterType} onSelect={(id) => { setFilterType(id as FileTypeFilter); setShowTypeSheet(false); }} onClose={() => setShowTypeSheet(false)} />
      <PickerSheet visible={showSortSheet} title="Sort By"
        items={[
          { id: "date_desc", name: "Newest First" }, { id: "date_asc", name: "Oldest First" },
          { id: "size_desc", name: "Largest Files" }, { id: "size_asc", name: "Smallest Files" },
          { id: "name_asc", name: "Name A – Z" },
        ]}
        selected={sortBy} onSelect={(id) => { setSortBy(id as SortKey); setShowSortSheet(false); }} onClose={() => setShowSortSheet(false)} />

      {/* ── Info Sheet ───────────────────────────────────────────────────── */}
      {infoFile && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setInfoFile(null)}>
          <Pressable style={styles.modalOverlay} onPress={() => setInfoFile(null)} />
          <View style={styles.infoSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>File Info</Text>
            <Divider style={{ marginVertical: spacing.sm }} />
            {isImage(infoFile.mimeType) && infoFile.url && (
              <Image source={{ uri: infoFile.url }} style={styles.infoPreview} contentFit="cover" cachePolicy="disk" />
            )}
            <InfoRow label="Product" value={infoFile.productName || "Not linked to any product"} />
            {infoFile.categoryName && <InfoRow label="Category" value={infoFile.categoryName} />}
            {infoFile.brandName && <InfoRow label="Brand" value={infoFile.brandName} />}
            <InfoRow label="Type" value={mimeLabel(infoFile.mimeType)} />
            {!!(infoFile.width && infoFile.height) && (
              <InfoRow label="Dimensions" value={`${infoFile.width} × ${infoFile.height} px`} />
            )}
            <InfoRow label="Size" value={formatBytes(infoFile.sizeBytes)} />
            <InfoRow label="WA Usage" value={`${infoFile.waMessagesCount} message(s)`} />
            <InfoRow label="Uploaded" value={formatDate(infoFile.createdAt)} />
            <InfoRow label="Status"
              value={infoFile.productName ? "✅ Linked to product" : "⚠ Unreferenced"}
              valueColor={infoFile.productName ? colors.success : colors.warning}
            />
            {infoFile.productName && (
              <>
                <Divider style={{ marginVertical: spacing.sm }} />
                {infoFile.mrp && <InfoRow label="MRP" value={`₹ ${infoFile.mrp}`} />}
                {infoFile.sellingPrice && <InfoRow label="Selling Price" value={`₹ ${infoFile.sellingPrice}`} />}
                {infoFile.minPrice && <InfoRow label="Min Price" value={`₹ ${infoFile.minPrice}`} />}
              </>
            )}
            <Divider style={{ marginVertical: spacing.sm }} />
            <View style={styles.infoActions}>
              {infoFile.itemId && (
                <Pressable style={[styles.infoActionBtn, { backgroundColor: colors.primaryLight }]} onPress={() => openPriceEdit(infoFile)}>
                  <Icon source="tag-edit-outline" size={16} color={colors.primary} />
                  <Text style={[styles.infoActionText, { color: colors.primary }]}>Edit Prices</Text>
                </Pressable>
              )}
              <Pressable style={[styles.infoActionBtn, { backgroundColor: colors.successLight }]} onPress={() => { setInfoFile(null); handleShare(infoFile); }}>
                <Icon source="share-variant" size={16} color={colors.success} />
                <Text style={[styles.infoActionText, { color: colors.success }]}>Share File</Text>
              </Pressable>
              <Pressable style={[styles.infoActionBtn, { backgroundColor: colors.dangerLight }]} onPress={() => { setInfoFile(null); handleDelete(infoFile); }}>
                <Icon source="delete-outline" size={16} color={colors.danger} />
                <Text style={[styles.infoActionText, { color: colors.danger }]}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}

      {/* ── Price Edit Modal ─────────────────────────────────────────────── */}
      {editFile && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setEditFile(null)}>
          <View style={styles.priceOverlay}>
            <View style={styles.priceModal}>
              <Text style={styles.sheetTitle}>Edit Prices</Text>
              <Text style={styles.priceSubtitle} numberOfLines={1}>{editFile.productName}</Text>
              <Divider style={{ marginVertical: spacing.md }} />
              <PriceField label="MRP (Max Retail Price)" value={editMrp} onChange={setEditMrp} />
              <PriceField label="Selling Price" value={editSelling} onChange={setEditSelling} />
              <PriceField label="Min Allowed Price" value={editMin} onChange={setEditMin} />
              <Divider style={{ marginVertical: spacing.md }} />
              <View style={styles.priceActions}>
                <Pressable style={styles.cancelBtn} onPress={() => setEditFile(null)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.saveBtn} onPress={handleSavePrices} disabled={updateItemMutation.isPending}>
                  {updateItemMutation.isPending
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.saveBtnText}>Save Prices</Text>
                  }
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueColor ? { color: valueColor } : undefined]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function PriceField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.priceField}>
      <Text style={styles.priceLabel}>{label}</Text>
      <View style={styles.priceInputRow}>
        <Text style={styles.priceRupee}>₹</Text>
        <RNTextInput style={styles.priceInput} value={value} onChangeText={onChange}
          keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textMuted} />
      </View>
    </View>
  );
}

function PickerSheet({
  visible, title, items, selected, onSelect, onClose,
}: {
  visible: boolean; title: string;
  items: { id: string; name: string }[];
  selected: string; onSelect: (id: string) => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose} />
      <View style={styles.pickerSheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>{title}</Text>
        <Divider style={{ marginVertical: spacing.sm }} />
        <ScrollView>
          {items.map((item) => (
            <Pressable key={item.id} style={[styles.pickerRow, selected === item.id && styles.pickerRowActive]} onPress={() => onSelect(item.id)}>
              <Text style={[styles.pickerRowText, selected === item.id && styles.pickerRowTextActive]}>{item.name}</Text>
              {selected === item.id && <Icon source="check" size={18} color={colors.primary} />}
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  tabRow: {
    flexDirection: "row",
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  tab: { flex: 1, paddingVertical: spacing.sm, alignItems: "center" },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: colors.textMuted },
  tabTextActive: { color: "#fff", fontWeight: fontWeight.bold },
  searchBar: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  pillScroll: { flexGrow: 0 },
  pillRow: { flexDirection: "row", paddingHorizontal: spacing.md, paddingVertical: spacing.xs, gap: spacing.xs },
  pill: { paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  pillActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  pillText: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: fontWeight.medium },
  pillTextActive: { color: colors.primary, fontWeight: fontWeight.bold },
  bulkRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginHorizontal: spacing.md, marginBottom: spacing.sm,
    padding: spacing.sm, borderRadius: radius.md,
    backgroundColor: colors.dangerLight, borderWidth: 1, borderColor: colors.danger + "55",
  },
  bulkText: { fontSize: fontSize.xs, color: colors.danger, fontWeight: fontWeight.medium },
  bulkBtn: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: colors.danger + "20" },
  bulkBtnText: { fontSize: fontSize.xs, color: colors.danger, fontWeight: fontWeight.bold },
  // Cards
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, overflow: "hidden",
    marginHorizontal: CARD_GAP / 2, ...shadow.sm,
  },
  thumbnailContainer: { width: "100%", aspectRatio: 1, backgroundColor: colors.surfaceOffset, position: "relative" },
  thumbnail: { width: "100%", height: "100%" },
  thumbnailFallback: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryLight },
  infoBadge: {
    position: "absolute", top: 6, right: 6, width: 24, height: 24,
    borderRadius: 12, backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center", justifyContent: "center",
  },
  orphanBadge: { position: "absolute", top: 6, left: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full, backgroundColor: colors.warning },
  orphanBadgeText: { fontSize: 9, fontWeight: fontWeight.bold, color: "#fff" },
  loadingOverlay: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  cardBody: { padding: spacing.sm },
  cardName: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.textPrimary, marginBottom: 2 },
  cardMeta: { fontSize: 10, color: colors.textMuted },
  cardSize: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  cardActions: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.border },
  actionBtn: { flex: 1, paddingVertical: 8, alignItems: "center", justifyContent: "center" },
  shareBtn: { borderRightWidth: 1, borderRightColor: colors.border },
  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textSecondary },
  emptySubtitle: { fontSize: fontSize.sm, color: colors.textMuted },
  // Modals
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  infoSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, maxHeight: "85%" },
  pickerSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, maxHeight: "60%" },
  sheetHandle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: "center", marginBottom: spacing.md },
  sheetTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary },
  infoPreview: { width: "100%", height: 160, borderRadius: radius.md, marginBottom: spacing.sm },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 5 },
  infoLabel: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: fontWeight.medium, flex: 1 },
  infoValue: { fontSize: fontSize.xs, color: colors.textPrimary, fontWeight: fontWeight.bold, flex: 2, textAlign: "right" },
  infoActions: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  infoActionBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, flex: 1, justifyContent: "center" },
  infoActionText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold },
  pickerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.sm, borderRadius: radius.md },
  pickerRowActive: { backgroundColor: colors.primaryLight },
  pickerRowText: { fontSize: fontSize.sm, color: colors.textPrimary },
  pickerRowTextActive: { color: colors.primary, fontWeight: fontWeight.bold },
  // Price modal
  priceOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  priceModal: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, width: "100%", ...shadow.lg },
  priceSubtitle: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  priceField: { marginBottom: spacing.md },
  priceLabel: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: fontWeight.medium, marginBottom: 4 },
  priceInputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, backgroundColor: colors.surfaceOffset },
  priceRupee: { fontSize: fontSize.md, color: colors.textSecondary, marginRight: 4 },
  priceInput: { flex: 1, fontSize: fontSize.md, color: colors.textPrimary, paddingVertical: spacing.sm },
  priceActions: { flexDirection: "row", gap: spacing.md },
  cancelBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  cancelBtnText: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: fontWeight.medium },
  saveBtn: { flex: 2, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center" },
  saveBtnText: { fontSize: fontSize.sm, color: "#fff", fontWeight: fontWeight.bold },
});
