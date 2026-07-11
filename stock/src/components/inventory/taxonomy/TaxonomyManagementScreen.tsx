import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Platform,
  Alert,
  Pressable,
} from "react-native";
import { Text, Divider, Icon } from "react-native-paper";
import { useFocusEffect } from "@react-navigation/native";
import { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";

import { TaxonomyEntity, TaxonomyManagementProps, EditorSession } from "./taxonomy.types";
import { TaxonomyListItem } from "./TaxonomyListItem";
import { TaxonomyEditorSheet } from "./TaxonomyEditorSheet";
import { TaxonomyActionsSheet } from "./TaxonomyActionsSheet";
import { getApiErrorMessage } from "./taxonomy.utils";
import { Screen } from "../../Screen";
import { AppHeader } from "../../ui/AppHeader";
import { AppSearchBar } from "../../ui/AppSearchBar";
import { EmptyState } from "../../ui/EmptyState";
import { SkeletonList } from "../../ui/SkeletonCard";
import { Button } from "../../ui/Button";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../../theme";
import { triggerLightHaptic } from "../../../utils/haptics";

export function TaxonomyManagementScreen<T extends TaxonomyEntity>({
  items,
  copy,
  icons,
  queryState,
  onCreate,
  onUpdate,
  onDelete,
  onOpen,
  getItemCount,
}: TaxonomyManagementProps<T>) {
  const [search, setSearch] = useState("");
  const [activeSession, setActiveSession] = useState<EditorSession<T> | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionsEntity, setActionsEntity] = useState<T | null>(null);

  const activeSwipeRef = useRef<SwipeableMethods | null>(null);
  const activeSessionRef = useRef<EditorSession<T> | null>(null);

  useEffect(() => {
    activeSwipeRef.current?.close();
  }, [actionsEntity]);

  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  // Swipe handle setup
  const handleSwipeOpen = useCallback((nextRef: SwipeableMethods) => {
    if (activeSwipeRef.current && activeSwipeRef.current !== nextRef) {
      activeSwipeRef.current.close();
    }
    activeSwipeRef.current = nextRef;
  }, []);

  // Close swipe on screen blur
  useFocusEffect(
    useCallback(() => {
      return () => {
        activeSwipeRef.current?.close();
      };
    }, [])
  );

  // Close swipe when search query or active session changes
  useEffect(() => {
    activeSwipeRef.current?.close();
  }, [search, activeSession]);

  // Sorting: Alphabetical & Locale-aware (does not mutate query data)
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, {
        sensitivity: "base",
      })
    );
  }, [items]);

  // Search Filter: Localized name match
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sortedItems;
    return sortedItems.filter((item) =>
      item.name.toLowerCase().includes(query)
    );
  }, [sortedItems, search]);

  const handleOpenCreate = () => {
    triggerLightHaptic();
    setActiveSession({
      sessionId: Date.now(),
      mode: "create",
      entity: null,
    });
  };

  const handleOpenEdit = (entity: T) => {
    triggerLightHaptic();
    setActiveSession({
      sessionId: Date.now(),
      mode: "edit",
      entity,
    });
  };

  const handleSave = async (name: string, session: EditorSession<T>) => {
    if (activeSessionRef.current?.sessionId !== session.sessionId) return;

    if (session.mode === "create") {
      await onCreate(name);
    } else {
      await onUpdate(session.entity, name);
    }

    // Guard success closing via active session ID verification
    if (activeSessionRef.current?.sessionId === session.sessionId) {
      setActiveSession(null);
    }
  };

  const handleDelete = (entity: T) => {
    activeSwipeRef.current?.close();
    triggerLightHaptic();
    Alert.alert(
      `Delete "${entity.name}"?`,
      `Products and historical records may still reference this ${copy.singular.toLowerCase()}.\nThis action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeletingId(entity.id);
            try {
              await onDelete(entity);
            } catch (err: any) {
              const msg = getApiErrorMessage(err, copy.deleteErrorFallback);
              Alert.alert("Cannot Delete", msg);
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  // Header count indicator text
  const countIndicator = useMemo(() => {
    if (queryState.isLoading) return "";
    if (search.trim()) {
      return `${filteredItems.length} of ${items.length}`;
    }
    return `${items.length}`;
  }, [filteredItems.length, items.length, search, queryState.isLoading]);

  return (
    <Screen edges={["top", "left", "right"]} scroll={false}>
      <AppHeader
        title={copy.screenTitle}
        subtitle={copy.screenSubtitle}
        fallbackRoute="ItemList"
      />

      {/* Search and Action Bar */}
      <View style={styles.topBar}>
        <View style={styles.searchWrap}>
          <AppSearchBar
            placeholder={copy.searchPlaceholder}
            value={search}
            onChangeText={setSearch}
            loading={queryState.isFetching}
          />
        </View>
        <Pressable
          onPress={handleOpenCreate}
          style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel={`Add ${copy.singular}`}
          accessibilityHint={`Opens a form sheet to create a new ${copy.singular}`}
        >
          <Icon source={icons.add} size={22} color="white" />
        </Pressable>
      </View>

      {/* Main Content Area */}
      <View style={styles.listContainer}>
        {queryState.isLoading ? (
          <View style={styles.paddingContainer}>
            <SkeletonList count={6} itemHeight={54} />
          </View>
        ) : queryState.isError ? (
          <View style={styles.centerContainer}>
            <EmptyState
              icon="alert-circle-outline"
              title="Connection Error"
              subtitle="We couldn't retrieve the list. Please check your network and try again."
            />
            <Button
              label="Retry"
              onPress={queryState.onRetry}
              style={styles.retryBtn}
            />
          </View>
        ) : items.length === 0 ? (
          <View style={styles.centerContainer}>
            <EmptyState
              icon={icons.empty}
              title={copy.emptyTitle}
              subtitle={copy.emptySubtitle}
            />
          </View>
        ) : filteredItems.length === 0 ? (
          <View style={styles.centerContainer}>
            <EmptyState
              icon="magnify-close"
              title={copy.noMatchesTitle}
              subtitle={copy.noMatchesSubtitle}
            />
            {search.trim().length > 0 && (
              <Button
                label="Clear search"
                variant="secondary"
                onPress={() => setSearch("")}
                style={styles.retryBtn}
              />
            )}
          </View>
        ) : (
          <FlatList
            data={filteredItems}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={() => activeSwipeRef.current?.close()}
            refreshing={queryState.isFetching}
            onRefresh={() => {
              activeSwipeRef.current?.close();
              queryState.onRefresh();
            }}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <Divider style={styles.separator} />}
            renderItem={({ item }) => (
              <TaxonomyListItem
                key={item.id}
                entity={item}
                iconName={icons.row}
                productCount={getItemCount ? getItemCount(item) : item.productCount}
                onPress={() => onOpen(item)}
                onLongPress={() => {
                  activeSwipeRef.current?.close();
                  setActionsEntity(item);
                }}
                onOverflowPress={() => {
                  activeSwipeRef.current?.close();
                  setActionsEntity(item);
                }}
                onEdit={() => handleOpenEdit(item)}
                onDelete={() => handleDelete(item)}
                onSwipeableWillOpen={handleSwipeOpen}
                isMutating={deletingId === item.id}
              />
            )}
            ListHeaderComponent={
              <View style={styles.listHeader}>
                <View style={styles.headerLabelRow}>
                  <Text style={styles.sectionLabel}>EXISTING {copy.plural.toUpperCase()}</Text>
                  {countIndicator ? (
                    <View style={styles.countBadge}>
                      <Text style={styles.countText}>{countIndicator}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            }
            ListFooterComponent={
              <View style={styles.tipCard}>
                <Icon source="information-outline" size={16} color={colors.info} />
                <Text style={styles.tipText}>{copy.infoText}</Text>
              </View>
            }
          />
        )}
      </View>

      {/* Editor Sheet Modal */}
      <TaxonomyEditorSheet
        session={activeSession}
        copy={copy}
        existingItems={items}
        onClose={() => setActiveSession(null)}
        onSave={handleSave}
      />

      {/* Actions bottom sheet menu */}
      <TaxonomyActionsSheet
        visible={actionsEntity !== null}
        entity={actionsEntity}
        copy={copy}
        busy={actionsEntity !== null && deletingId === actionsEntity.id}
        onClose={() => setActionsEntity(null)}
        onEdit={() => {
          if (actionsEntity) {
            handleOpenEdit(actionsEntity);
          }
        }}
        onDelete={() => {
          if (actionsEntity) {
            handleDelete(actionsEntity);
          }
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.md,
    backgroundColor: colors.bg,
  },
  searchWrap: {
    flex: 1,
  },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.md,
  },
  addBtnPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.96 }],
  },
  listContainer: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  paddingContainer: {
    padding: spacing.lg,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  retryBtn: {
    marginTop: spacing.md,
    minWidth: 120,
  },
  listContent: {
    paddingBottom: 40,
  },
  separator: {
    height: 0.5,
    backgroundColor: colors.border,
  },
  listHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  headerLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  countBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  countText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  tipCard: {
    flexDirection: "row",
    backgroundColor: colors.infoLight,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(2, 132, 199, 0.15)",
    margin: spacing.lg,
    marginTop: spacing.xl,
  },
  tipText: {
    flex: 1,
    fontSize: 11,
    color: colors.info,
    fontWeight: fontWeight.medium,
    lineHeight: 17,
  },
});
