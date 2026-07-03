import { ReactElement, ReactNode } from "react";
import { RefreshControl, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { FlashList, FlashListProps } from "@shopify/flash-list";

import { ScreenScaffold } from "./ScreenScaffold";
import { EmptyState } from "../ui/EmptyState";
import { SkeletonList } from "../ui/SkeletonCard";
import { colors, spacing } from "../../theme";

type ListScreenProps<T> = Omit<FlashListProps<T>, "refreshControl"> & {
  title: string;
  subtitle?: string;
  header?: ReactNode;
  footer?: ReactNode;
  isLoading?: boolean;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  empty?: ReactElement;
  skeletonCount?: number;
  skeletonItemHeight?: number;
  showBack?: boolean;
  fallbackRoute?: string;
  contentStyle?: StyleProp<ViewStyle>;
};

export function ListScreen<T>({
  title,
  subtitle,
  header,
  footer,
  isLoading,
  isRefreshing,
  onRefresh,
  empty,
  skeletonCount = 6,
  skeletonItemHeight = 88,
  showBack,
  fallbackRoute,
  contentStyle,
  contentContainerStyle,
  ...listProps
}: ListScreenProps<T>) {
  return (
    <ScreenScaffold title={title} subtitle={subtitle} showBack={showBack} fallbackRoute={fallbackRoute} footer={footer}>
      <View style={[styles.content, contentStyle]}>
        {header}
        <View style={styles.list}>
          {isLoading ? (
            <SkeletonList count={skeletonCount} itemHeight={skeletonItemHeight} />
          ) : (
            <FlashList
              {...listProps}
              refreshControl={
                onRefresh ? (
                  <RefreshControl refreshing={!!isRefreshing} onRefresh={onRefresh} colors={[colors.primary]} />
                ) : undefined
              }
              ListEmptyComponent={empty ?? <EmptyState title="No records found" />}
              contentContainerStyle={[styles.listContent, contentContainerStyle]}
            />
          )}
        </View>
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 100,
  },
});
