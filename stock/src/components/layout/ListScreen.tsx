import { ReactElement, ReactNode } from "react";
import { RefreshControl, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { FlashList, FlashListProps } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenScaffold } from "./ScreenScaffold";
import { EmptyState } from "../ui/EmptyState";
import { SkeletonList } from "../ui/SkeletonCard";
import { colors, spacing } from "../../theme";
import { KeyboardAwareListScrollComponent } from "../keyboard/KeyboardAwareListScrollComponent";

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
  loadingView?: ReactNode;
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
  loadingView,
  renderScrollComponent,
  ...listProps
}: ListScreenProps<T>) {
  const insets = useSafeAreaInsets();

  return (
    <ScreenScaffold title={title} subtitle={subtitle} showBack={showBack} fallbackRoute={fallbackRoute} footer={footer}>
      <View style={[styles.content, contentStyle]}>
        {header}
        <View style={styles.list}>
          {isLoading ? (
            loadingView ?? <SkeletonList count={skeletonCount} itemHeight={skeletonItemHeight} />
          ) : (
            <FlashList
              {...listProps}
              renderScrollComponent={renderScrollComponent ?? KeyboardAwareListScrollComponent}
              refreshControl={
                onRefresh ? (
                  <RefreshControl refreshing={!!isRefreshing} onRefresh={onRefresh} colors={[colors.primary]} />
                ) : undefined
              }
              ListEmptyComponent={empty ?? <EmptyState title="No records found" />}
              contentContainerStyle={[
                styles.listContent,
                { paddingBottom: Math.max(insets.bottom, 0) + (footer ? 24 : 104) },
                contentContainerStyle,
              ]}
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
