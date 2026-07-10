import React, { useState, useMemo, useCallback, useDeferredValue, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import {
  View,
  StyleSheet,
  Alert,
  Modal,
  ScrollView,
  TextInput as RNTextInput,
  useWindowDimensions,
  Platform,
  KeyboardAvoidingView,
  BackHandler,
} from "react-native";
import { Pressable, GestureHandlerRootView, GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  SlideInDown,
  SlideOutDown,
  useReducedMotion,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Text,
  ActivityIndicator,
  Icon,
  Divider,
  Searchbar,
  IconButton,
} from "react-native-paper";
import * as Sharing from "expo-sharing";
import { File, Directory, Paths } from "expo-file-system";
import { triggerLightHaptic, triggerMediumHaptic, triggerSuccessHaptic, triggerWarningHaptic, triggerErrorHaptic } from "../../utils/haptics";

import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { ListScreen } from "../../components/layout/ListScreen";
import { CachedThumbnail } from "../../components/ui/CachedThumbnail";
import { SkeletonCard, SkeletonList } from "../../components/ui/SkeletonCard";
import {
  useStorageObjectsInfiniteQuery,
  useDeleteStorageObjectMutation,
  useBulkDeleteOrphansMutation,
} from "../../hooks/useDashboard";
import { useUpdateItemMutation, useItemsQuery } from "../../hooks/useItems";
import { invalidateAssetCache } from "../../hooks/useAssetCache";
import { useShopStore } from "../../auth/shop-store";
import { useAuthStore } from "../../auth/auth-store";
import { mmkvStorage } from "../../auth/mmkv-storage";
import type { StorageObject } from "../../api/client";

// ── Types ─────────────────────────────────────────────────────────────────────

type SortKey = "date_desc" | "date_asc" | "size_desc" | "size_asc" | "name_asc";
type FileTypeFilter = "ALL" | "IMAGE" | "DOC" | "VIDEO" | "AUDIO";
type AssetUsageStatus = "PRODUCT" | "WHATSAPP" | "UNUSED";

// ── Constants ─────────────────────────────────────────────────────────────────

const CARD_GAP = spacing.sm;

// ── Pure helpers ──────────────────────────────────────────────────────────────

function getUsageStatus(a: StorageObject): AssetUsageStatus {
  if (a.productName) return "PRODUCT";
  if (a.waMessagesCount > 0) return "WHATSAPP";
  return "UNUSED";
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mimeIcon(mime: string): string {
  if (mime.startsWith("image/")) return "image-outline";
  if (mime.startsWith("video/")) return "video-outline";
  if (mime.startsWith("audio/")) return "music-note-outline";
  if (mime === "application/pdf") return "file-pdf-box";
  return "file-document-outline";
}

function validatePrices(
  mrp: string,
  selling: string,
  min: string
): string | null {
  const parse = (s: string) =>
    s.trim() === "" ? null : Number(s.trim());
  const M = parse(mrp);
  const S = parse(selling);
  const m = parse(min);
  if (M !== null && (!Number.isFinite(M) || M < 0))
    return "MRP must be a valid positive number.";
  if (S !== null && (!Number.isFinite(S) || S < 0))
    return "Selling price must be a valid positive number.";
  if (m !== null && (!Number.isFinite(m) || m < 0))
    return "Min price must be a valid positive number.";
  if (M !== null && S !== null && S > M)
    return "Selling price cannot exceed MRP.";
  if (S !== null && m !== null && m > S)
    return "Min price cannot exceed selling price.";
  return null;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InfoRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text
        style={[styles.infoValue, valueColor ? { color: valueColor } : undefined]}
        numberOfLines={3}
      >
        {value}
      </Text>
    </View>
  );
}

// ── BottomSheet (shared, Reanimated + GestureDetector) ───────────────────────
export interface BottomSheetRef {
  dismiss: () => void;
}

const BottomSheet = forwardRef<
  BottomSheetRef,
  {
    visible: boolean;
    onClose: () => void;
    children: React.ReactNode;
    maxHeight?: number;
  }
>(function BottomSheet({ visible, onClose, children, maxHeight = 0.85 }, ref) {
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(screenH);
  const startY = useSharedValue(0);
  const sheetHeight = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  // Entrance / exit animation
  useEffect(() => {
    if (visible) {
      translateY.value = reduceMotion
        ? 0
        : withSpring(0, { damping: 28, stiffness: 300, mass: 0.8 });
    }
  }, [visible, translateY, reduceMotion]);

  const dismissOnUI = useCallback(() => {
    "worklet";
    if (reduceMotion) {
      translateY.value = screenH;
      scheduleOnRN(onClose);
    } else {
      translateY.value = withTiming(screenH, { duration: 260 }, (finished) => {
        if (finished) {
          scheduleOnRN(onClose);
        }
      });
    }
  }, [screenH, translateY, onClose, reduceMotion]);

  // Expose dismiss function to allow custom click triggers to animate slide down
  useImperativeHandle(ref, () => ({
    dismiss: () => {
      if (reduceMotion) {
        translateY.value = screenH;
        onClose();
      } else {
        translateY.value = withTiming(screenH, { duration: 260 }, (finished) => {
          if (finished) {
            scheduleOnRN(onClose);
          }
        });
      }
    },
  }));

  const panGesture = Gesture.Pan()
    .activeOffsetY(8)                 // valid downward offset contract
    .failOffsetX([-12, 12])           // yield horizontal scroll
    .onBegin(() => {
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateY.value = Math.max(0, startY.value + e.translationY);
    })
    .onEnd((e) => {
      const limit = sheetHeight.value ? sheetHeight.value * 0.35 : 150;
      if (e.velocityY > 600 || translateY.value > limit) {
        dismissOnUI();
      } else {
        translateY.value = reduceMotion
          ? 0
          : withSpring(0, { damping: 28, stiffness: 300 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const overlayStyle = useAnimatedStyle(() => {
    const h = sheetHeight.value || screenH;
    const opacity = Math.max(0, 0.48 * (1 - translateY.value / h));
    return {
      ...StyleSheet.absoluteFill,
      backgroundColor: "rgba(0,0,0,1)",
      opacity,
    };
  });

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={() => {
        if (reduceMotion) {
          translateY.value = screenH;
          onClose();
        } else {
          translateY.value = withTiming(screenH, { duration: 260 }, (finished) => {
            if (finished) {
              scheduleOnRN(onClose);
            }
          });
        }
      }}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <GestureDetector gesture={Gesture.Tap().onEnd(() => { "worklet"; dismissOnUI(); })}>
          <Animated.View style={overlayStyle} />
        </GestureDetector>
        <Animated.View
          style={[
            styles.sheetContainer,
            { maxHeight: screenH * maxHeight, paddingBottom: insets.bottom + spacing.md },
            sheetStyle,
          ]}
          onLayout={(e) => {
            sheetHeight.value = e.nativeEvent.layout.height;
          }}
          accessibilityViewIsModal
        >
          {/* Restrict pan only to the drag handle wrap to avoid scroll conflict (P1-B) */}
          <GestureDetector gesture={panGesture}>
            <View style={styles.dragHandleWrap} accessibilityLabel="Drag to dismiss">
              <View style={styles.dragHandle} />
            </View>
          </GestureDetector>
          {children}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
});

function PickerSheet({
  visible,
  title,
  items,
  selected,
  onClose,
}: {
  visible: boolean;
  title: string;
  items: { id: string; name: string }[];
  selected: string;
  onClose: (selectedId?: string) => void;
}) {
  const sheetRef = useRef<BottomSheetRef>(null);
  const pendingId = useRef<string | undefined>(undefined);

  // Reset pendingId when sheet opens to prevent applying stale selections (P1-F)
  useEffect(() => {
    if (visible) {
      pendingId.current = undefined;
    }
  }, [visible]);

  const handleClosed = () => {
    const selectedId = pendingId.current;
    pendingId.current = undefined;
    onClose(selectedId);
  };

  return (
    <BottomSheet ref={sheetRef} visible={visible} onClose={handleClosed}>
      <Text style={styles.sheetTitle}>{title}</Text>
      <Divider style={{ marginVertical: spacing.sm }} />
      <ScrollView keyboardShouldPersistTaps="handled">
        {items.map((item) => (
          <Pressable
            key={item.id}
            style={({ pressed }) => [
              styles.pickerRow,
              selected === item.id && styles.pickerRowActive,
              pressed && styles.pickerRowPressed,
            ]}
            onPress={() => {
              triggerLightHaptic();
              pendingId.current = item.id;
              sheetRef.current?.dismiss();
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: selected === item.id }}
            accessibilityLabel={item.name}
          >
            <Text
              style={[
                styles.pickerRowText,
                selected === item.id && styles.pickerRowTextActive,
              ]}
            >
              {item.name}
            </Text>
            {selected === item.id && (
              <Icon source="check-circle" size={18} color={colors.primary} />
            )}
          </Pressable>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

// ── StorageManagementHeader ───────────────────────────────────────────────────
// Rendered as the ListScreen `header` prop — scrolls with the list.

type HeaderProps = {
  allCount: number;
  unusedCount: number;
  unusedBytes: number;
  activeTab: "ALL" | "UNUSED";
  onTabChange: (t: "ALL" | "UNUSED") => void;
  searchQuery: string;
  onSearchChange: (s: string) => void;
  filterCategory: string;
  filterBrand: string;
  filterType: FileTypeFilter;
  sortBy: SortKey;
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
  activeFilterCount: number;
  onCategoryPress: () => void;
  onBrandPress: () => void;
  onTypePress: () => void;
  onSortPress: () => void;
  onClearFilters: () => void;
  onCleanUp: () => void;
  isCleaningUp: boolean;
  isOwner: boolean;
  viewMode: "grid" | "list";
  onToggleViewMode: () => void;
};

function StorageManagementHeader({
  allCount,
  unusedCount,
  unusedBytes,
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  filterCategory,
  filterBrand,
  filterType,
  sortBy,
  categories,
  brands,
  activeFilterCount,
  onCategoryPress,
  onBrandPress,
  onTypePress,
  onSortPress,
  onClearFilters,
  onCleanUp,
  isCleaningUp,
  isOwner,
  viewMode,
  onToggleViewMode,
}: HeaderProps) {
  return (
    <View style={styles.headerRoot}>
      {/* Search */}
      <View style={styles.searchRow}>
        <Searchbar
          placeholder="Search products, files, categories…"
          value={searchQuery}
          onChangeText={onSearchChange}
          style={[styles.searchBar, { flex: 1 }]}
          inputStyle={{ fontSize: fontSize.sm }}
          elevation={0}
          accessibilityLabel="Search assets"
        />
        <IconButton
          icon={viewMode === "grid" ? "view-list-outline" : "view-grid-outline"}
          size={24}
          onPress={onToggleViewMode}
          accessibilityLabel={viewMode === "grid" ? "Switch to list view" : "Switch to grid view"}
          style={{ margin: 0 }}
        />
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {(["ALL", "UNUSED"] as const).map((tab) => (
          <Pressable
            key={tab}
            style={({ pressed }) => [
              styles.tab,
              activeTab === tab && styles.tabActive,
              pressed && styles.tabPressed,
            ]}
            onPress={() => {
              triggerLightHaptic();
              onTabChange(tab);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === tab }}
            accessibilityLabel={
              tab === "ALL"
                ? `All files, ${allCount} total`
                : `Unused files, ${unusedCount} total`
            }
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab && styles.tabTextActive,
              ]}
            >
              {tab === "ALL" ? `All  ${allCount}` : `Unused  ${unusedCount}`}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillRow}
      >

        <FilterPill
          label={
            filterCategory === "ALL"
              ? "Category"
              : categories.find((c) => c.id === filterCategory)?.name ||
                "Category"
          }
          icon="tag-outline"
          active={filterCategory !== "ALL"}
          onPress={onCategoryPress}
        />
        <FilterPill
          label={
            filterBrand === "ALL"
              ? "Brand"
              : brands.find((b) => b.id === filterBrand)?.name || "Brand"
          }
          icon="label-outline"
          active={filterBrand !== "ALL"}
          onPress={onBrandPress}
        />
        <FilterPill
          label={
            filterType === "ALL"
              ? "Type"
              : filterType === "IMAGE"
              ? "Images"
              : filterType === "VIDEO"
              ? "Videos"
              : filterType === "AUDIO"
              ? "Audio"
              : "Documents"
          }
          icon={
            filterType === "IMAGE"
              ? "image-outline"
              : filterType === "VIDEO"
              ? "video-outline"
              : filterType === "AUDIO"
              ? "music-note-outline"
              : filterType === "DOC"
              ? "file-document-outline"
              : "filter-outline"
          }
          active={filterType !== "ALL"}
          onPress={onTypePress}
        />
        <FilterPill
          label={
            sortBy === "date_desc"
              ? "Newest"
              : sortBy === "date_asc"
              ? "Oldest"
              : sortBy === "size_desc"
              ? "Largest"
              : sortBy === "size_asc"
              ? "Smallest"
              : "A – Z"
          }
          icon="sort-variant"
          active={sortBy !== "date_desc"}
          onPress={onSortPress}
        />
        {activeFilterCount > 0 && (
          <FilterPill
            label={`Clear ${activeFilterCount}`}
            icon="close-circle-outline"
            active={false}
            danger
            onPress={onClearFilters}
          />
        )}
      </ScrollView>

      {/* Unused files banner — owner only */}
      {isOwner && unusedCount > 0 && (
        <Pressable
          style={({ pressed }) => [
            styles.cleanupBanner,
            pressed && { opacity: 0.85 },
          ]}
          onPress={() => {
            if (activeTab === "ALL") {
              onTabChange("UNUSED");
            } else {
              onCleanUp();
            }
          }}
          disabled={isCleaningUp}
          accessibilityRole="button"
          accessibilityLabel={
            activeTab === "ALL"
              ? `Review ${unusedCount} unused files`
              : `Clean up ${unusedCount} unused files, ${formatBytes(unusedBytes)}`
          }
        >
          <View style={styles.cleanupLeft}>
            <Icon source="delete-sweep-outline" size={20} color={colors.danger} />
            <View style={{ marginLeft: spacing.sm }}>
              <Text style={styles.cleanupTitle}>
                {unusedCount} unused{" "}
                {unusedCount === 1 ? "file" : "files"} · {formatBytes(unusedBytes)}
              </Text>
              <Text style={styles.cleanupSub}>
                {activeTab === "ALL"
                  ? "Tap to review unused files"
                  : "Tap to delete all unused files"}
              </Text>
            </View>
          </View>
          {isCleaningUp ? (
            <ActivityIndicator size="small" color={colors.danger} />
          ) : (
            <Icon
              source={activeTab === "ALL" ? "chevron-right" : "delete-forever-outline"}
              size={20}
              color={colors.danger}
            />
          )}
        </Pressable>
      )}
    </View>
  );
}

function FilterPill({
  label,
  icon,
  active,
  danger,
  onPress,
}: {
  label: string;
  icon: string;
  active: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.pill,
        active && styles.pillActive,
        danger && styles.pillDanger,
        pressed && styles.pillPressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Icon
        source={icon}
        size={13}
        color={
          danger ? colors.danger : active ? colors.primary : colors.textMuted
        }
      />
      <Text
        style={[
          styles.pillText,
          active && styles.pillTextActive,
          danger && { color: colors.danger },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ── Skeletons ─────────────────────────────────────────────────────────────────

function StorageSkeleton({ viewMode, numColumns }: { viewMode: "grid" | "list"; numColumns: number }) {
  if (viewMode === "list") {
    return (
      <View style={{ paddingHorizontal: spacing.lg }}>
        <SkeletonList count={6} itemHeight={72} />
      </View>
    );
  }

  return (
    <View style={styles.skeletonGridContainer}>
      {Array.from({ length: 6 }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.skeletonGridCard,
            { width: `${100 / numColumns}%` },
          ]}
        >
          <View style={styles.skeletonGridCardInner}>
            <SkeletonCard height={140} style={{ marginHorizontal: 0, borderRadius: radius.md }} />
            <View style={{ gap: 4, marginTop: spacing.sm }}>
              <SkeletonCard height={14} width="85%" style={{ marginHorizontal: 0 }} />
              <SkeletonCard height={10} width="45%" style={{ marginHorizontal: 0 }} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

function StorageEmptyState() {
  return (
    <View style={styles.emptyState}>
      <Icon source="cloud-off-outline" size={52} color={colors.textMuted} />
      <Text style={styles.emptyTitle}>No assets found</Text>
      <Text style={styles.emptySubtitle}>
        Try changing your filters or search query.
      </Text>
    </View>
  );
}

// ── Selection Action Bar ──────────────────────────────────────────────────────

function SelectionActionBar({
  count,
  onShare,
  onDelete,
  onCancel,
  canDelete,
  isBusy,
}: {
  count: number;
  onShare: () => void;
  onDelete: () => void;
  onCancel: () => void;
  canDelete: boolean;
  isBusy: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.selectionBar, { paddingBottom: spacing.sm + insets.bottom }]}>
      <Pressable
        style={styles.selectionCancel}
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Cancel selection"
      >
        <Icon source="close" size={20} color={colors.textSecondary} />
      </Pressable>
      <Text style={styles.selectionCount}>
        {count} selected
      </Text>
      <View style={styles.selectionActions}>
        <Pressable
          style={[
            styles.selectionBtn,
            styles.selectionBtnShare,
            (isBusy || count === 0) && { opacity: 0.4 },
          ]}
          onPress={onShare}
          disabled={isBusy || count === 0}
          accessibilityRole="button"
          accessibilityLabel="Share selected files"
          accessibilityState={{ disabled: isBusy || count === 0 }}
        >
          <Icon source="share-variant-outline" size={16} color={colors.primary} />
          <Text style={[styles.selectionBtnText, { color: colors.primary }]}>
            Share
          </Text>
        </Pressable>
        {canDelete && (
          <Pressable
            style={[styles.selectionBtn, styles.selectionBtnDelete]}
            onPress={onDelete}
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${count} selected files`}
            accessibilityState={{ disabled: isBusy }}
          >
            <Icon source="delete-outline" size={16} color={colors.danger} />
            <Text style={[styles.selectionBtnText, { color: colors.danger }]}>
              Delete
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function StorageManagement() {
  const activeShopId = useShopStore((s) => s.activeShopId);
  const reduceMotion = useReducedMotion();
  const user = useAuthStore((s) => s.user);
  const isOwner = user?.role === "OWNER";

  // ── Filter / Sort ─────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"ALL" | "UNUSED">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("ALL");
  const [filterBrand, setFilterBrand] = useState<string>("ALL");
  const [filterType, setFilterType] = useState<FileTypeFilter>("ALL");
  const [sortBy, setSortBy] = useState<SortKey>("date_desc");

  // Debounce search requests by 300ms to prevent heavy typing request spikes (P1-C)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Clear active selection on shop or filter context changes to prevent leaky states (P1-B)
  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeShopId, activeTab, filterCategory, filterBrand, filterType, sortBy, debouncedSearch]);

  // ── Picker sheet state ────────────────────────────────────────────────────
  const [showCatSheet, setShowCatSheet] = useState(false);
  const [showBrandSheet, setShowBrandSheet] = useState(false);
  const [showTypeSheet, setShowTypeSheet] = useState(false);
  const [showSortSheet, setShowSortSheet] = useState(false);

  // ── Selection mode ────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const isSelecting = selectedIds.size > 0;

  // ── Async action state ────────────────────────────────────────────────────
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Sheet state ───────────────────────────────────────────────────────────
  const [infoFile, setInfoFile] = useState<StorageObject | null>(null);
  const [editFile, setEditFile] = useState<StorageObject | null>(null);
  const [assignFile, setAssignFile] = useState<StorageObject | null>(null);
  const [editMrp, setEditMrp] = useState("");
  const [editSelling, setEditSelling] = useState("");
  const [editMin, setEditMin] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    return (mmkvStorage.getItem("storage-layout") as "grid" | "list") ?? "grid";
  });

  const toggleViewMode = useCallback(() => {
    triggerLightHaptic();
    setViewMode((prev) => {
      const next = prev === "grid" ? "list" : "grid";
      mmkvStorage.setItem("storage-layout", next);
      return next;
    });
  }, []);

  // ── Responsive grid ───────────────────────────────────────────────────────
  const { width: screenWidth } = useWindowDimensions();
  const calculatedColumns = screenWidth >= 700 ? 4 : screenWidth >= 480 ? 3 : 2;
  const numColumns = viewMode === "grid" ? calculatedColumns : 1;

  // ── Queries ───────────────────────────────────────────────────────────────
  const queryParams = useMemo(() => ({
    filter: activeTab === "UNUSED" ? ("ORPHANED" as const) : ("ALL" as const),
    search: debouncedSearch,
    categoryId: filterCategory,
    brandId: filterBrand,
    type: filterType,
    sortBy,
  }), [activeTab, debouncedSearch, filterCategory, filterBrand, filterType, sortBy]);

  const {
    data,
    isLoading,
    isRefetching,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useStorageObjectsInfiniteQuery(queryParams);

  const deleteMutation = useDeleteStorageObjectMutation();
  const bulkDeleteMutation = useBulkDeleteOrphansMutation();
  const updateItemMutation = useUpdateItemMutation();

  const allAssets = useMemo(() => {
    return data?.pages.flatMap((page) => page.assets) ?? [];
  }, [data]);

  const categories = useMemo(() => {
    return data?.pages[0]?.categories ?? [];
  }, [data]);

  const brands = useMemo(() => {
    return data?.pages[0]?.brands ?? [];
  }, [data]);

  const isBusy =
    sharingId !== null ||
    deletingId !== null ||
    bulkDeleteMutation.isPending;

  // ── Stats (single pass) ───────────────────────────────────────────────────
  const assetStats = useMemo(() => {
    const serverTotal = data?.pages[0]?.totalOrphanedCount;
    const serverBytes = data?.pages[0]?.totalOrphanedBytes;
    if (serverTotal !== undefined && serverBytes !== undefined) {
      return { unusedCount: serverTotal, unusedBytes: serverBytes, hasStats: true };
    }
    return { unusedCount: 0, unusedBytes: 0, hasStats: false };
  }, [data]);

  // ── Filter + Sort pipeline ────────────────────────────────────────────────
  const filtered = allAssets;

  const totalSize = useMemo(
    () => filtered.reduce((s, a) => s + a.sizeBytes, 0),
    [filtered]
  );

  const activeFilterCount = useMemo(
    () =>
      [
        filterCategory !== "ALL",
        filterBrand !== "ALL",
        filterType !== "ALL",
        sortBy !== "date_desc",
      ].filter(Boolean).length,
    [filterCategory, filterBrand, filterType, sortBy]
  );

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleShare = useCallback(
    async (file: StorageObject) => {
      if (!file.url || sharingId !== null) return;
      setSharingId(file.id);
      try {
        const canShare = await Sharing.isAvailableAsync();
        if (!canShare) {
          Alert.alert("Sharing unavailable", "Sharing is not available on this device.");
          return;
        }
        const ext =
          file.fileName.split(".").pop()?.replace(/[^a-z0-9]/gi, "") ||
          file.mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") ||
          "bin";
        const cacheDir = new Directory(Paths.cache, "asset-share");
        cacheDir.create({ idempotent: true, intermediates: true });
        const localFile = new File(cacheDir, `${file.id}.${ext}`);
        const shareFile = localFile.exists
          ? localFile
          : await File.downloadFileAsync(file.url, localFile, {
              idempotent: true,
            });
        await Sharing.shareAsync(shareFile.uri, {
          mimeType: file.mimeType,
          dialogTitle: file.productName || file.fileName,
        });
      } catch (err: unknown) {
        triggerErrorHaptic();
        const msg = err instanceof Error ? err.message : "Could not share file.";
        Alert.alert("Share failed", msg);
      } finally {
        setSharingId(null);
      }
    },
    [sharingId]
  );

  const handleDelete = useCallback(
    (file: StorageObject) => {
      if (deletingId !== null) return;
      if (getUsageStatus(file) !== "UNUSED") {
        Alert.alert(
          "Cannot delete",
          file.productName
            ? `This file is linked to "${file.productName}". Remove the product image first.`
            : "This file is referenced in messaging history."
        );
        return;
      }
      Alert.alert(
        "Delete file",
        `Permanently delete "${file.productName || file.fileName}"? This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              triggerWarningHaptic();
              setDeletingId(file.id);
              deleteMutation.mutate(file.id, {
                onSuccess: () => {
                  setDeletingId(null);
                  setInfoFile(null);
                  triggerSuccessHaptic();
                },
                onError: (e: unknown) => {
                  triggerErrorHaptic();
                  setDeletingId(null);
                  const msg =
                    e instanceof Error ? e.message : "Delete failed.";
                  Alert.alert("Error", msg);
                },
              });
            },
          },
        ]
      );
    },
    [deletingId, deleteMutation]
  );

  const handleBulkCleanup = useCallback(() => {
    const { unusedCount, unusedBytes, hasStats } = assetStats;
    if (!hasStats || unusedCount === 0) {
      Alert.alert("Nothing to clean up", "There are no unused files or stats are loading.");
      return;
    }
    const isFiltered = activeFilterCount > 0 || debouncedSearch !== "";
    const confirmationMsg = isFiltered
      ? `Delete ALL ${unusedCount} unused files across this shop? (Note: filters are currently active, but this will clean up all unused files shop-wide). This cannot be undone.`
      : `Delete ${unusedCount} unused file${unusedCount !== 1 ? "s" : ""} (${formatBytes(unusedBytes)})? This cannot be undone.`;

    Alert.alert(
      "Clean up unused files",
      confirmationMsg,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete all",
          style: "destructive",
          onPress: () => {
            triggerWarningHaptic();
            bulkDeleteMutation.mutate(undefined, {
              onSuccess: () => {
                triggerSuccessHaptic();
              },
              onError: (e: unknown) => {
                triggerErrorHaptic();
                const msg = e instanceof Error ? e.message : "Cleanup failed.";
                Alert.alert("Error", msg);
              },
            });
          },
        },
      ]
    );
  }, [assetStats, bulkDeleteMutation, activeFilterCount, debouncedSearch]);

  const handleLongPress = useCallback(
    (item: StorageObject) => {
      triggerMediumHaptic();
      setSelectedIds((prev) => {
        if (prev.size === 0) {
          // Enter selection mode with this item
          return new Set([item.id]);
        }
        // Already in selection mode — toggle this item (don't wipe other selections)
        const next = new Set(prev);
        if (next.has(item.id)) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
    },
    []
  );

  const handleToggleSelect = useCallback((id: string) => {
    triggerLightHaptic();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCancelSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // ── Android Back Handler ──────────────────────────────────────────────────
  // Clear selection if active; otherwise propagate back event to the navigator.
  // Open sheets are managed natively via Modal's onRequestClose configuration.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!isSelecting) return false;
      setSelectedIds(new Set());
      return true;
    });
    return () => sub.remove();
  }, [isSelecting]);

  const handleBulkShare = useCallback(async () => {
    const files = filtered.filter((f) => selectedIds.has(f.id));
    if (files.length === 0) return;

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      Alert.alert("Sharing unavailable", "Sharing is not available on this device.");
      return;
    }

    setSharingId("BULK");
    try {
      const cacheDir = new Directory(Paths.cache, "asset-share");
      cacheDir.create({ idempotent: true, intermediates: true });

      for (const file of files) {
        if (!file.url) continue;
        const ext =
          file.fileName.split(".").pop()?.replace(/[^a-z0-9]/gi, "") ||
          file.mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") ||
          "bin";
        const localFile = new File(cacheDir, `${file.id}.${ext}`);
        const shareFile = localFile.exists
          ? localFile
          : await File.downloadFileAsync(file.url, localFile, {
              idempotent: true,
            });

        await Sharing.shareAsync(shareFile.uri, {
          mimeType: file.mimeType,
          dialogTitle: file.productName || file.fileName,
        });
      }
    } catch (err: unknown) {
      triggerErrorHaptic();
      const msg = err instanceof Error ? err.message : "Could not share file.";
      Alert.alert("Share failed", msg);
    } finally {
      setSharingId(null);
      setSelectedIds(new Set());
    }
  }, [filtered, selectedIds]);

  const handleBulkDelete = useCallback(() => {
    const deletable = filtered.filter(
      (f) => selectedIds.has(f.id) && getUsageStatus(f) === "UNUSED"
    );
    if (deletable.length === 0) {
      Alert.alert(
        "Cannot delete",
        "None of the selected files are unused. Only unused files can be deleted."
      );
      return;
    }
    Alert.alert(
      "Delete selected",
      `Delete ${deletable.length} unused file${deletable.length !== 1 ? "s" : ""}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            triggerWarningHaptic();
            let successCount = 0;
            const failedIds: string[] = [];
            for (const file of deletable) {
              await new Promise<void>((res) => {
                deleteMutation.mutate(file.id, {
                  onSuccess: () => { successCount++; res(); },
                  onError: () => { failedIds.push(file.id); res(); },
                });
              });
            }
            // Keep failed items selected so user can retry
            setSelectedIds(new Set(failedIds));
            if (failedIds.length > 0) {
              triggerErrorHaptic();
              Alert.alert(
                "Partial delete",
                `${successCount} file${successCount !== 1 ? "s" : ""} deleted, ${failedIds.length} failed. Failed items remain selected.`
              );
            } else {
              triggerSuccessHaptic();
            }
          },
        },
      ]
    );
  }, [filtered, selectedIds, deleteMutation]);

  // ── Price edit ────────────────────────────────────────────────────────────

  const openPriceEdit = useCallback((file: StorageObject) => {
    setEditFile(file);
    setEditMrp(file.mrp || "");
    setEditSelling(file.sellingPrice || "");
    setEditMin(file.minPrice || "");
    setEditError(null);
    setInfoFile(null);
  }, []);

  const handleSavePrices = useCallback((onSuccessCallback?: () => void) => {
    if (!editFile?.itemId) return;
    const err = validatePrices(editMrp, editSelling, editMin);
    if (err) {
      setEditError(err);
      return;
    }
    const toNum = (s: string) =>
      s.trim() === "" ? undefined : Number(s.trim());
    updateItemMutation.mutate(
      {
        id: editFile.itemId,
        data: {
          ...(toNum(editMrp) !== undefined ? { mrp: toNum(editMrp) } : {}),
          ...(toNum(editSelling) !== undefined
            ? { defaultSellingPrice: toNum(editSelling) }
            : {}),
          ...(toNum(editMin) !== undefined
            ? { minimumAllowedPrice: toNum(editMin) }
            : {}),
        },
      },
      {
        onSuccess: () => {
          if (onSuccessCallback) {
            onSuccessCallback();
          } else {
            setEditFile(null);
          }
          setEditError(null);
          if (activeShopId) invalidateAssetCache(activeShopId);
          refetch();
          // Close without blocking Alert — success haptic is sufficient (P2-D)
          triggerSuccessHaptic();
        },
        onError: (e: unknown) => {
          const msg = e instanceof Error ? e.message : "Could not save prices.";
          Alert.alert("Error", msg);
        },
      }
    );
  }, [editFile, editMrp, editSelling, editMin, updateItemMutation, activeShopId, refetch]);

  // ── renderItem ────────────────────────────────────────────────────────────

  const keyExtractor = useCallback((item: StorageObject) => item.id, []);

  const renderItem = useCallback(
    ({ item }: { item: StorageObject }) => {
      const status = getUsageStatus(item);
      const isSharing = sharingId === item.id;
      const isDeleting = deletingId === item.id;
      const isSelected = selectedIds.has(item.id);
      const canDelete = isOwner && status === "UNUSED";

      if (viewMode === "list") {
        return (
          <Pressable
            style={({ pressed }) => [
              styles.listRow,
              isSelected && styles.listRowSelected,
              pressed && styles.listRowPressed,
            ]}
            onPress={() => {
              if (isSelecting) {
                handleToggleSelect(item.id);
              } else {
                setInfoFile(item);
              }
            }}
            onLongPress={() => handleLongPress(item)}
            delayLongPress={350}
            accessibilityRole="button"
            accessibilityLabel={`${item.productName || item.fileName}${isSelected ? ", selected" : ""}`}
            accessibilityState={{ selected: isSelected }}
          >
            <CachedThumbnail
              uri={item.url}
              fallbackIcon={mimeIcon(item.mimeType)}
              fallbackText={item.fileName.slice(0, 2).toUpperCase()}
              color={colors.primary}
              style={styles.listThumbnail}
            />

            <View style={styles.listRowBody}>
              <Text style={styles.listRowName} numberOfLines={1}>
                {item.productName || item.fileName}
              </Text>
              <Text style={styles.listRowMeta} numberOfLines={1}>
                {item.categoryName ? `${item.categoryName} • ` : ""}{formatBytes(item.sizeBytes)} • {formatDate(item.createdAt).split(",")[0]}
              </Text>
            </View>

            {/* Selection Checkbox in List Mode */}
            {isSelecting ? (
              <View style={styles.listCheckContainer}>
                <Icon
                  source={isSelected ? "check-circle" : "circle-outline"}
                  size={22}
                  color={isSelected ? colors.primary : colors.textMuted}
                />
              </View>
            ) : (
              <View style={styles.listActions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.listActionBtn,
                    pressed && styles.listActionBtnPressed,
                  ]}
                  onPress={() => handleShare(item)}
                  disabled={isBusy}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Share file"
                >
                  <Icon source="share-variant-outline" size={18} color={colors.primary} />
                </Pressable>

                {canDelete ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.listActionBtn,
                      pressed && styles.listActionBtnPressed,
                    ]}
                    onPress={() => handleDelete(item)}
                    disabled={isBusy}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Delete file"
                  >
                    <Icon source="delete-outline" size={18} color={colors.danger} />
                  </Pressable>
                ) : (
                  <View style={styles.listActionBtn}>
                    <Icon
                      source={status === "PRODUCT" ? "link-variant" : "message-text-outline"}
                      size={15}
                      color={colors.textMuted}
                    />
                  </View>
                )}
              </View>
            )}
          </Pressable>
        );
      }

      return (
        <Pressable
          style={({ pressed }) => [
            styles.card,
            isSelected && styles.cardSelected,
            pressed && styles.cardPressed,
          ]}
          onPress={() => {
            if (isSelecting) {
              handleToggleSelect(item.id);
            } else {
              setInfoFile(item);
            }
          }}
          onLongPress={() => handleLongPress(item)}
          delayLongPress={350}
          accessibilityRole="button"
          accessibilityLabel={`${item.productName || item.fileName}${isSelected ? ", selected" : ""}`}
          accessibilityState={{ selected: isSelected }}
        >
          {/* Thumbnail */}
          <View style={styles.thumbnailContainer}>
            <CachedThumbnail
              uri={item.url}
              fallbackIcon={mimeIcon(item.mimeType)}
              fallbackText={item.fileName.slice(0, 2).toUpperCase()}
              color={colors.primary}
              style={{ flex: 1 }}
            />

            {/* Usage badge */}
            {status === "UNUSED" && (
              <View style={styles.unusedBadge}>
                <Icon source="link-off" size={10} color="#fff" />
                <Text style={styles.unusedBadgeText}>Unused</Text>
              </View>
            )}
            {status === "WHATSAPP" && (
              <View style={[styles.unusedBadge, { backgroundColor: colors.primary }]}>
                <Icon source="message-text-outline" size={10} color="#fff" />
                <Text style={styles.unusedBadgeText}>
                  {item.waMessagesCount}x
                </Text>
              </View>
            )}

            {/* Loading overlay */}
            {(isSharing || isDeleting) && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.loadingText}>
                  {isSharing ? "Sharing…" : "Deleting…"}
                </Text>
              </View>
            )}

            {/* Selection checkbox */}
            {isSelecting && (
              <View
                style={[
                  styles.checkOverlay,
                  isSelected && styles.checkOverlaySelected,
                ]}
              >
                <Icon
                  source={isSelected ? "check-circle" : "circle-outline"}
                  size={22}
                  color={isSelected ? colors.primary : "rgba(255,255,255,0.8)"}
                />
              </View>
            )}
          </View>

          {/* Card body */}
          <View style={styles.cardBody}>
            <Text style={styles.cardName} numberOfLines={2}>
              {item.productName || item.fileName}
            </Text>
            {item.categoryName && (
              <Text style={styles.cardMeta} numberOfLines={1}>
                {item.categoryName}
              </Text>
            )}
            <Text style={styles.cardSize}>{formatBytes(item.sizeBytes)}</Text>
          </View>

          {/* Card actions — hidden during selection mode */}
          {!isSelecting && (
            <View style={styles.cardActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.actionBtn,
                  pressed && styles.actionBtnPressed,
                ]}
                onPress={() => handleShare(item)}
                disabled={isBusy}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel={`Share ${item.productName || item.fileName}`}
                accessibilityHint="Downloads and opens the system share sheet"
                accessibilityState={{ disabled: isBusy }}
              >
                <Icon
                  source="share-variant-outline"
                  size={15}
                  color={colors.primary}
                />
              </Pressable>

              {canDelete ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.actionBtn,
                    styles.actionBtnRight,
                    pressed && styles.actionBtnPressed,
                  ]}
                  onPress={() => handleDelete(item)}
                  disabled={isBusy}
                  hitSlop={4}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${item.productName || item.fileName}`}
                  accessibilityState={{ disabled: isBusy }}
                >
                  <Icon source="delete-outline" size={15} color={colors.danger} />
                </Pressable>
              ) : (
                <View style={[styles.actionBtn, styles.actionBtnRight]}>
                  <Icon
                    source={
                      status === "PRODUCT"
                        ? "link-variant"
                        : "message-outline"
                    }
                    size={13}
                    color={colors.textMuted}
                  />
                </View>
              )}
            </View>
          )}
        </Pressable>
      );
    },
    [
      sharingId,
      deletingId,
      selectedIds,
      isSelecting,
      isOwner,
      isBusy,
      handleShare,
      handleDelete,
      handleLongPress,
      handleToggleSelect,
      viewMode,
    ]
  );

  // ── Header memo ───────────────────────────────────────────────────────────

  const listHeader = useMemo(
    () => (
      <StorageManagementHeader
        allCount={data?.pages[0]?.totalAllCount ?? 0}
        unusedCount={assetStats.unusedCount}
        unusedBytes={assetStats.unusedBytes}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filterCategory={filterCategory}
        filterBrand={filterBrand}
        filterType={filterType}
        sortBy={sortBy}
        categories={categories}
        brands={brands}
        activeFilterCount={activeFilterCount}
        onCategoryPress={() => setShowCatSheet(true)}
        onBrandPress={() => setShowBrandSheet(true)}
        onTypePress={() => setShowTypeSheet(true)}
        onSortPress={() => setShowSortSheet(true)}
        onClearFilters={() => {
          setFilterCategory("ALL");
          setFilterBrand("ALL");
          setFilterType("ALL");
          setSortBy("date_desc");
        }}
        onCleanUp={handleBulkCleanup}
        isCleaningUp={bulkDeleteMutation.isPending}
        isOwner={isOwner && assetStats.hasStats}
        viewMode={viewMode}
        onToggleViewMode={toggleViewMode}
      />
    ),
    [
      allAssets.length,
      assetStats,
      activeTab,
      searchQuery,
      filterCategory,
      filterBrand,
      filterType,
      sortBy,
      categories,
      brands,
      activeFilterCount,
      handleBulkCleanup,
      bulkDeleteMutation.isPending,
      isOwner,
      viewMode,
      toggleViewMode,
    ]
  );

  // ── Selection footer ──────────────────────────────────────────────────────

  const selectionBar = isSelecting ? (
    <Animated.View
      entering={reduceMotion ? undefined : SlideInDown.springify().damping(28).stiffness(300).mass(0.8)}
      exiting={reduceMotion ? undefined : SlideOutDown.duration(200)}
    >
      <SelectionActionBar
        count={selectedIds.size}
        onShare={handleBulkShare}
        onDelete={handleBulkDelete}
        onCancel={handleCancelSelection}
        canDelete={
          isOwner &&
          Array.from(selectedIds).some((id) => {
            const f = allAssets.find((a: StorageObject) => a.id === id);
            return f ? getUsageStatus(f) === "UNUSED" : false;
          })
        }
        isBusy={isBusy}
      />
    </Animated.View>
  ) : undefined;

  if (!activeShopId) {
    return (
      <View style={styles.noShop}>
        <Icon source="store-off-outline" size={48} color={colors.textMuted} />
        <Text style={styles.noShopText}>No shop selected.</Text>
      </View>
    );
  }

  return (
    <>
      <ListScreen
        title="Cloud Assets"
        subtitle={`${data?.pages[0]?.totalCount ?? 0} files · ${formatBytes(data?.pages[0]?.totalBytes ?? 0)}`}
        showBack
        data={filtered}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        numColumns={numColumns}
        header={listHeader}
        isLoading={isLoading}
        isRefreshing={isRefetching}
        onRefresh={refetch}
        onEndReached={hasNextPage ? () => fetchNextPage() : undefined}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator style={{ marginVertical: spacing.md }} color={colors.primary} />
          ) : null
        }
        loadingView={<StorageSkeleton viewMode={viewMode} numColumns={calculatedColumns} />}
        empty={<StorageEmptyState />}
        footer={selectionBar}
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      {/* ── Picker sheets ─────────────────────────────────────────────── */}
      <PickerSheet
        visible={showCatSheet}
        title="Filter by Category"
        items={[{ id: "ALL", name: "All Categories" }, ...categories]}
        selected={filterCategory}
        onClose={(id) => {
          if (id) setFilterCategory(id);
          setShowCatSheet(false);
        }}
      />
      <PickerSheet
        visible={showBrandSheet}
        title="Filter by Brand"
        items={[{ id: "ALL", name: "All Brands" }, ...brands]}
        selected={filterBrand}
        onClose={(id) => {
          if (id) setFilterBrand(id);
          setShowBrandSheet(false);
        }}
      />
      <PickerSheet
        visible={showTypeSheet}
        title="Filter by File Type"
        items={[
          { id: "ALL", name: "All Types" },
          { id: "IMAGE", name: "Images" },
          { id: "DOC", name: "Documents" },
          { id: "VIDEO", name: "Videos" },
          { id: "AUDIO", name: "Audio" },
        ]}
        selected={filterType}
        onClose={(id) => {
          if (id) setFilterType(id as FileTypeFilter);
          setShowTypeSheet(false);
        }}
      />
      <PickerSheet
        visible={showSortSheet}
        title="Sort By"
        items={[
          { id: "date_desc", name: "Newest First" },
          { id: "date_asc", name: "Oldest First" },
          { id: "size_desc", name: "Largest Files" },
          { id: "size_asc", name: "Smallest Files" },
          { id: "name_asc", name: "Name A – Z" },
        ]}
        selected={sortBy}
        onClose={(id) => {
          if (id) setSortBy(id as SortKey);
          setShowSortSheet(false);
        }}
      />

      {/* ── Info sheet ─────────────────────────────────────────────────── */}
      {infoFile && (
        <InfoSheet
          file={infoFile}
          isOwner={isOwner}
          isBusy={isBusy}
          onClose={(action) => {
            setInfoFile(null);
            if (action === "share") {
              void handleShare(infoFile);
            } else if (action === "delete") {
              handleDelete(infoFile);
            } else if (action === "edit") {
              openPriceEdit(infoFile);
            } else if (action === "assign") {
              setAssignFile(infoFile);
            }
          }}
        />
      )}

      {/* ── Price edit modal ───────────────────────────────────────────── */}
      {editFile && (
        <PriceEditModal
          file={editFile}
          mrp={editMrp}
          selling={editSelling}
          min={editMin}
          error={editError}
          isSaving={updateItemMutation.isPending}
          onMrpChange={(v) => {
            setEditMrp(v);
            setEditError(null);
          }}
          onSellingChange={(v) => {
            setEditSelling(v);
            setEditError(null);
          }}
          onMinChange={(v) => {
            setEditMin(v);
            setEditError(null);
          }}
          onSave={handleSavePrices}
          onCancel={() => {
            setEditFile(null);
            setEditError(null);
          }}
        />
      )}

      {/* ── Product assign modal ───────────────────────────────────────── */}
      {assignFile && (
        <ProductAssignModal
          visible={!!assignFile}
          file={assignFile}
          onCancel={() => setAssignFile(null)}
          onSuccess={() => {
            setAssignFile(null);
            void refetch();
          }}
        />
      )}
    </>
  );
}

// ── InfoSheet ─────────────────────────────────────────────────────────────────

function InfoSheet({
  file,
  isOwner,
  isBusy,
  onClose,
}: {
  file: StorageObject;
  isOwner: boolean;
  isBusy: boolean;
  onClose: (action?: "share" | "delete" | "edit" | "assign") => void;
}) {
  const status = getUsageStatus(file);
  const canDelete = isOwner && status === "UNUSED";

  const statusLabel =
    status === "PRODUCT"
      ? "Linked to product"
      : status === "WHATSAPP"
      ? `Used in messaging (${file.waMessagesCount})`
      : "Not linked";

  const statusColor =
    status === "PRODUCT"
      ? colors.success
      : status === "WHATSAPP"
      ? colors.primary
      : colors.warning;

  const sheetRef = useRef<BottomSheetRef>(null);
  const pendingAction = useRef<"share" | "delete" | "edit" | "assign" | undefined>(undefined);

  return (
    <BottomSheet ref={sheetRef} visible onClose={() => onClose(pendingAction.current)}>
      <Text style={styles.sheetTitle}>File Info</Text>
      <Divider style={{ marginVertical: spacing.sm }} />

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Preview */}
        {file.mimeType.startsWith("image/") && file.url && (
          <View style={styles.infoPreviewContainer}>
            <CachedThumbnail
              uri={file.url}
              fallbackIcon="image-outline"
              fallbackText=""
              color={colors.primary}
              style={styles.infoPreview}
            />
          </View>
        )}

        <InfoRow label="Product" value={file.productName || "Not linked"} />
        {file.categoryName && (
          <InfoRow label="Category" value={file.categoryName} />
        )}
        {file.brandName && (
          <InfoRow label="Brand" value={file.brandName} />
        )}
        <InfoRow label="Type" value={file.mimeType} />
        {!!(file.width && file.height) && (
          <InfoRow
            label="Dimensions"
            value={`${file.width} × ${file.height} px`}
          />
        )}
        <InfoRow label="Size" value={formatBytes(file.sizeBytes)} />
        <InfoRow
          label="Uploaded"
          value={formatDate(file.createdAt)}
        />
        <InfoRow
          label="Status"
          value={statusLabel}
          valueColor={statusColor}
        />

        {/* Prices */}
        {file.productName && (
          <>
            <Divider style={{ marginVertical: spacing.sm }} />
            {file.mrp && <InfoRow label="MRP" value={`₹ ${file.mrp}`} />}
            {file.sellingPrice && (
              <InfoRow label="Selling" value={`₹ ${file.sellingPrice}`} />
            )}
            {file.minPrice && (
              <InfoRow label="Min Price" value={`₹ ${file.minPrice}`} />
            )}
          </>
        )}

        <Divider style={{ marginVertical: spacing.md }} />

        {/* Actions */}
        <View style={styles.infoActions}>
          <Pressable
            style={({ pressed }) => [
              styles.infoActionBtn,
              { backgroundColor: colors.primaryLight },
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => {
              pendingAction.current = "share";
              sheetRef.current?.dismiss();
            }}
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel="Share file"
          >
            <Icon source="share-variant-outline" size={18} color={colors.primary} />
            <Text style={[styles.infoActionText, { color: colors.primary }]}>
              Share
            </Text>
          </Pressable>

          {isOwner && file.itemId && (
            <Pressable
              style={({ pressed }) => [
                styles.infoActionBtn,
                { backgroundColor: colors.successLight },
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => {
                pendingAction.current = "edit";
                sheetRef.current?.dismiss();
              }}
              accessibilityRole="button"
              accessibilityLabel="Edit prices"
            >
              <Icon source="tag-edit-outline" size={18} color={colors.success} />
              <Text
                style={[styles.infoActionText, { color: colors.success }]}
              >
                Edit Prices
              </Text>
            </Pressable>
          )}

          {isOwner && !file.itemId && (
            <Pressable
              style={({ pressed }) => [
                styles.infoActionBtn,
                { backgroundColor: colors.successLight },
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => {
                pendingAction.current = "assign";
                sheetRef.current?.dismiss();
              }}
              accessibilityRole="button"
              accessibilityLabel="Assign to product"
            >
              <Icon source="link-variant" size={18} color={colors.success} />
              <Text
                style={[styles.infoActionText, { color: colors.success }]}
              >
                Assign Product
              </Text>
            </Pressable>
          )}

          {canDelete && (
            <Pressable
              style={({ pressed }) => [
                styles.infoActionBtn,
                { backgroundColor: colors.dangerLight },
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => {
                pendingAction.current = "delete";
                sheetRef.current?.dismiss();
              }}
              disabled={isBusy}
              accessibilityRole="button"
              accessibilityLabel="Delete file"
            >
              <Icon source="delete-outline" size={18} color={colors.danger} />
              <Text style={[styles.infoActionText, { color: colors.danger }]}>
                Delete
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

// ── ProductAssignModal ─────────────────────────────────────────────────────────

interface ProductAssignModalProps {
  visible: boolean;
  file: StorageObject;
  onCancel: () => void;
  onSuccess: () => void;
}

function ProductAssignModal({
  visible,
  file,
  onCancel,
  onSuccess,
}: ProductAssignModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDeferredValue(searchQuery);
  const activeShopId = useShopStore((state) => state.activeShopId);

  const { data, isLoading } = useItemsQuery({
    search: debouncedSearch.trim() || undefined,
    enabled: visible,
    limit: 10,
  });

  const products = data?.items || [];
  const updateItemMutation = useUpdateItemMutation();
  const sheetRef = useRef<BottomSheetRef>(null);

  const handleAssign = (item: any) => {
    triggerMediumHaptic();

    const existingUrls = item.imageUrl ? item.imageUrl.split(",").filter(Boolean) : [];
    const isAlreadyAssigned = existingUrls.includes(file.url);

    if (isAlreadyAssigned) {
      Alert.alert("Already assigned", `This image is already linked to ${item.name}.`);
      return;
    }

    const options: any[] = [];

    options.push({
      text: existingUrls.length > 0 ? "Add as Additional" : "Assign Image",
      onPress: async () => {
        try {
          const nextUrls = [...existingUrls, file.url];
          await updateItemMutation.mutateAsync({
            id: item.id,
            data: {
              imageUrl: nextUrls.join(","),
            },
          });
          triggerSuccessHaptic();
          Alert.alert("Success", `Image assigned to ${item.name} successfully!`);
          sheetRef.current?.dismiss();
          onSuccess();
        } catch (err: any) {
          triggerErrorHaptic();
          Alert.alert("Error", err.message || "Failed to assign image.");
        }
      }
    });

    if (existingUrls.length > 0) {
      options.push({
        text: "Replace Existing Images",
        style: "destructive",
        onPress: async () => {
          try {
            await updateItemMutation.mutateAsync({
              id: item.id,
              data: {
                imageUrl: file.url,
              },
            });
            triggerSuccessHaptic();
            Alert.alert("Success", `Image assigned to ${item.name} (existing replaced).`);
            sheetRef.current?.dismiss();
            onSuccess();
          } catch (err: any) {
            triggerErrorHaptic();
            Alert.alert("Error", err.message || "Failed to assign image.");
          }
        }
      });
    }

    options.push({
      text: "Cancel",
      style: "cancel"
    });

    Alert.alert(
      "Assign Image",
      existingUrls.length > 0
        ? `"${item.name}" already has ${existingUrls.length} image(s). Do you want to add this image as an additional photo or replace them all?`
        : `Are you sure you want to assign this image to "${item.name}"?`,
      options,
      { cancelable: true }
    );
  };

  return (
    <BottomSheet ref={sheetRef} visible={visible} onClose={onCancel}>
      <Text style={styles.sheetTitle}>Assign to Product</Text>
      <Text style={styles.priceSubtitle} numberOfLines={1}>
        {file.fileName}
      </Text>
      <Divider style={{ marginVertical: spacing.sm }} />

      <Searchbar
        placeholder="Search products by name/SKU..."
        onChangeText={setSearchQuery}
        value={searchQuery}
        style={styles.modalSearchbar}
        inputStyle={styles.modalSearchInput}
        placeholderTextColor={colors.textSecondary}
        iconColor={colors.primary}
        clearIcon="close"
      />

      <ScrollView 
        keyboardShouldPersistTaps="handled" 
        showsVerticalScrollIndicator={false}
        style={{ maxHeight: 350, marginTop: spacing.sm }}
      >
        {isLoading && (
          <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.primary} />
        )}

        {!isLoading && searchQuery.trim() === "" && products.length === 0 && (
          <Text style={styles.emptyText}>Type to search for products...</Text>
        )}

        {!isLoading && searchQuery.trim() !== "" && products.length === 0 && (
          <Text style={styles.emptyText}>No products found matching "{searchQuery}"</Text>
        )}

        {!isLoading && products.map((item) => (
          <Pressable
            key={item.id}
            style={({ pressed }) => [
              styles.pickerRow,
              pressed && styles.pickerRowPressed,
            ]}
            onPress={() => handleAssign(item)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.pickerRowText}>{item.name}</Text>
              <Text style={styles.pickerRowSubtext}>
                SKU: {item.sku || "No SKU"} • Price: ₹{item.defaultSellingPrice}
              </Text>
            </View>
            <Icon source="chevron-right" size={20} color={colors.textSecondary} />
          </Pressable>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

// ── PriceEditModal ────────────────────────────────────────────────────────────
// Uses BottomSheet (swipe-to-dismiss + tap-backdrop-dismiss).
// Form is in a ScrollView so it's reachable on small/landscape screens.
// Ref chain MRP → Selling → Min → Save for native keyboard flow.

function PriceEditModal({
  file,
  mrp,
  selling,
  min,
  error,
  isSaving,
  onMrpChange,
  onSellingChange,
  onMinChange,
  onSave,
  onCancel,
}: {
  file: StorageObject;
  mrp: string;
  selling: string;
  min: string;
  error: string | null;
  isSaving: boolean;
  onMrpChange: (v: string) => void;
  onSellingChange: (v: string) => void;
  onMinChange: (v: string) => void;
  onSave: (onSuccess: () => void) => void;
  onCancel: () => void;
}) {
  const sellingRef = useRef<RNTextInput>(null);
  const minRef = useRef<RNTextInput>(null);
  const sheetRef = useRef<BottomSheetRef>(null);

  const handleSave = () => {
    onSave(() => {
      sheetRef.current?.dismiss();
    });
  };

  return (
    <BottomSheet ref={sheetRef} visible onClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 0 }}
      >
        <Text style={styles.sheetTitle}>Edit Prices</Text>
        <Text style={styles.priceSubtitle} numberOfLines={1}>
          {file.productName}
        </Text>
        <Divider style={{ marginVertical: spacing.md }} />

        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {error && (
            <View style={styles.errorBanner}>
              <Icon source="alert-circle-outline" size={16} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <PriceField
            label="MRP (Max Retail Price)"
            value={mrp}
            onChange={onMrpChange}
            returnKeyType="next"
            onSubmit={() => sellingRef.current?.focus()}
          />
          <PriceField
            label="Selling Price"
            value={selling}
            onChange={onSellingChange}
            returnKeyType="next"
            ref={sellingRef}
            onSubmit={() => minRef.current?.focus()}
          />
          <PriceField
            label="Min Allowed Price"
            value={min}
            onChange={onMinChange}
            returnKeyType="done"
            ref={minRef}
            onSubmit={handleSave}
          />

          <Text style={styles.priceHint}>
            Leave a field blank to keep its current value.
          </Text>

          <Divider style={{ marginVertical: spacing.md }} />
          <View style={styles.priceActions}>
            <Pressable
              style={({ pressed }) => [
                styles.cancelBtn,
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => sheetRef.current?.dismiss()}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.saveBtn,
                isSaving && { opacity: 0.7 },
                pressed && { opacity: 0.85 },
              ]}
              onPress={handleSave}
              disabled={isSaving}
              accessibilityRole="button"
              accessibilityLabel="Save prices"
              accessibilityState={{ disabled: isSaving }}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Save Prices</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}

const PriceField = forwardRef<
  RNTextInput,
  {
    label: string;
    value: string;
    onChange: (v: string) => void;
    returnKeyType?: "next" | "done";
    onSubmit?: () => void;
  }
>(function PriceField({ label, value, onChange, returnKeyType, onSubmit }, ref) {
  return (
    <View style={styles.priceField}>
      <Text style={styles.priceLabel}>{label}</Text>
      <View style={styles.priceInputRow}>
        <Text style={styles.priceRupee}>₹</Text>
        <RNTextInput
          ref={ref}
          style={styles.priceInput}
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmit}
          placeholder="0.00"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={label}
          submitBehavior={returnKeyType === "done" ? "blurAndSubmit" : "submit"}
        />
      </View>
    </View>
  );
});

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // No-shop fallback
  noShop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  noShopText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    fontWeight: fontWeight.medium,
  },
  // Header
  headerRoot: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  searchBar: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  tabActive: { backgroundColor: colors.primary },
  tabPressed: { opacity: 0.8 },
  tabText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
  },
  tabTextActive: {
    color: "#fff",
    fontWeight: fontWeight.bold,
  },
  // Filter pills
  pillRow: {
    flexDirection: "row",
    gap: spacing.xs,
    paddingBottom: spacing.xs,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  pillDanger: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerLight,
  },
  pillPressed: { opacity: 0.75 },
  pillText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: fontWeight.medium,
  },
  pillTextActive: { color: colors.primary, fontWeight: fontWeight.bold },
  // Cleanup banner
  cleanupBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.dangerLight,
    borderWidth: 1,
    borderColor: colors.danger + "44",
  },
  cleanupLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  cleanupTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.danger,
  },
  cleanupSub: {
    fontSize: fontSize.xs,
    color: colors.danger,
    opacity: 0.8,
    marginTop: 1,
  },
  // Cards
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    margin: CARD_GAP / 2,
    ...shadow.sm,
  },
  cardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
    ...shadow.md,
  },
  cardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.976 }],
  },
  thumbnailContainer: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: colors.surfaceOffset,
    position: "relative",
  },
  unusedBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: colors.warning,
  },
  unusedBadgeText: {
    fontSize: 9,
    fontWeight: fontWeight.bold,
    color: "#fff",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  loadingText: {
    fontSize: 10,
    color: "#fff",
    fontWeight: fontWeight.medium,
  },
  checkOverlay: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkOverlaySelected: {
    backgroundColor: "#fff",
  },
  cardBody: {
    padding: spacing.sm,
  },
  cardName: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: 2,
    lineHeight: 16,
  },
  cardMeta: {
    fontSize: 10,
    color: colors.textMuted,
    marginBottom: 1,
  },
  cardSize: {
    fontSize: 10,
    color: colors.textMuted,
  },
  cardActions: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  actionBtn: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnRight: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
  },
  actionBtnPressed: { backgroundColor: colors.surfaceOffset },
  // Empty state
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  emptySubtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: "center",
  },
  // Selection bar
  selectionBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadow.md,
  },
  selectionCancel: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  selectionCount: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginLeft: spacing.xs,
  },
  selectionActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  selectionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  selectionBtnShare: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  selectionBtnDelete: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerLight,
  },
  selectionBtnText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  // Modals / BottomSheet
  modalOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.48)",
  },
  sheetContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: 0,
    // paddingBottom set dynamically from insets in BottomSheet
  },
  dragHandleWrap: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  dragHandle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
  },
  // Legacy — kept for any remaining reference
  infoSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    maxHeight: "88%",
  },
  dragArea: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    width: "100%",
  },
  sheetDragBar: {
    width: 36,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  infoPreviewContainer: {
    width: "100%",
    height: 180,
    borderRadius: radius.md,
    overflow: "hidden",
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceOffset,
  },
  infoPreview: {
    ...StyleSheet.absoluteFill,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 5,
  },
  infoLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: fontWeight.medium,
    flex: 1,
  },
  infoValue: {
    fontSize: fontSize.xs,
    color: colors.textPrimary,
    fontWeight: fontWeight.semibold,
    flex: 2,
    textAlign: "right",
  },
  infoActions: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
    paddingBottom: spacing.md,
  },
  infoActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
  },
  infoActionText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  // Picker sheet
  pickerSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    maxHeight: "65%",
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    minHeight: 48,
  },
  pickerRowActive: { backgroundColor: colors.primaryLight },
  pickerRowPressed: { backgroundColor: colors.surfaceOffset },
  pickerRowText: { fontSize: fontSize.sm, color: colors.textPrimary },
  pickerRowTextActive: {
    color: colors.primary,
    fontWeight: fontWeight.bold,
  },
  // Price sheet
  priceSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
  },
  priceSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.dangerLight,
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: fontSize.xs,
    color: colors.danger,
    fontWeight: fontWeight.medium,
    flex: 1,
  },
  priceHint: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  priceField: { marginBottom: spacing.md },
  priceLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: fontWeight.medium,
    marginBottom: 4,
  },
  priceInputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceOffset,
    minHeight: 44,
  },
  priceRupee: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginRight: 4,
  },
  priceInput: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
  },
  priceActions: {
    flexDirection: "row",
    gap: spacing.md,
    paddingBottom: Platform.OS === "ios" ? spacing.xl : spacing.sm,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: fontWeight.medium,
  },
  saveBtn: {
    flex: 2,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  saveBtnText: {
    fontSize: fontSize.sm,
    color: "#fff",
    fontWeight: fontWeight.bold,
  },
  // List Mode styles
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    marginHorizontal: CARD_GAP / 2,
    marginVertical: CARD_GAP / 2,
    gap: spacing.sm,
    ...shadow.sm,
  },
  listRowSelected: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  listRowPressed: {
    opacity: 0.88,
    backgroundColor: colors.surfaceOffset,
  },
  listThumbnail: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  listRowBody: {
    flex: 1,
    gap: 2,
  },
  listRowName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  listRowMeta: {
    fontSize: 11,
    color: colors.textMuted,
  },
  listCheckContainer: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  listActions: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
  },
  listActionBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  listActionBtnPressed: {
    opacity: 0.7,
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.full,
  },
  // Skeleton Grid styles
  skeletonGridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: spacing.lg - CARD_GAP / 2,
    paddingTop: spacing.md,
  },
  skeletonGridCard: {
    padding: CARD_GAP / 2,
  },
  skeletonGridCardInner: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    ...shadow.sm,
    overflow: "hidden",
  },
  modalSearchbar: {
    backgroundColor: colors.surfaceOffset,
    elevation: 0,
    shadowColor: "transparent",
    marginVertical: spacing.xs,
    borderRadius: radius.md,
    height: 44,
    justifyContent: "center",
  },
  modalSearchInput: {
    fontSize: fontSize.sm,
    minHeight: 0,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: "center",
    marginVertical: spacing.lg,
  },
  pickerRowSubtext: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
