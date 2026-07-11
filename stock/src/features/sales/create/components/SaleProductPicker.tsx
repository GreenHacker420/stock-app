import React from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { Icon } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";
import { colors, spacing, radius, shadow } from "../../../../theme";
import { AppSearchBar } from "../../../../components/ui/AppSearchBar";
import { SkeletonList } from "../../../../components/ui/SkeletonCard";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { Button } from "../../../../components/ui/Button";
import type { Item } from "../../../../api/client";

interface SaleProductPickerProps {
  data: Item[];
  renderItem: any;
  search: string;
  setSearch: (val: string) => void;
  onScanPress: () => void;
  isLoading: boolean;
  isOffline: boolean;
  ListHeaderComponent?: React.ReactElement;
  footerHeight?: number;
  onCreateProductPress?: () => void;
}

export function SaleProductPicker({
  data,
  renderItem,
  search,
  setSearch,
  onScanPress,
  isLoading,
  isOffline,
  ListHeaderComponent,
  footerHeight = 80,
  onCreateProductPress,
}: SaleProductPickerProps) {
  const renderEmpty = () => {
    if (isLoading && !isOffline) {
      return (
        <View style={styles.emptyContainer}>
          <SkeletonList count={4} itemHeight={100} />
        </View>
      );
    }

    if (isOffline) {
      return (
        <View style={styles.emptyContainer}>
          <EmptyState
            icon="cloud-off-outline"
            title="Items unavailable offline"
            subtitle="Open this shop online once to sync items."
          />
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <EmptyState
          icon="magnify"
          title="No products found"
          subtitle="Try searching by name or SKU"
          action={
            onCreateProductPress ? (
              <Button
                label="Create Product"
                icon="plus"
                onPress={onCreateProductPress}
              />
            ) : undefined
          }
        />
      </View>
    );
  };

  const renderPickerHeader = () => (
    <View style={styles.headerContainer}>
      {ListHeaderComponent}
      <View style={styles.searchRow}>
        <AppSearchBar
          placeholder="Search name or SKU..."
          onChangeText={setSearch}
          value={search}
          style={styles.flex1}
        />
        <Pressable
          onPress={onScanPress}
          accessibilityRole="button"
          accessibilityLabel="Scan SKU barcode"
          style={({ pressed }) => [styles.scanBtn, pressed && styles.pressed]}
        >
          <Icon source="barcode-scan" size={24} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlashList
        data={data}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderPickerHeader()}
        ListEmptyComponent={renderEmpty()}
        ListFooterComponent={<View style={{ height: footerHeight }} />}
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  headerContainer: {
    marginBottom: spacing.md,
  },
  searchRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  scanBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    ...shadow.sm,
  },
  emptyContainer: {
    paddingVertical: spacing.xl,
  },
  flex1: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
