import { memo } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Text, Icon } from "react-native-paper";

import { ItemCategory } from "../../api/client";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { getCatPalette, getCatIcon } from "../../utils/items/display";

export const CategoryCard = memo(({
  category,
  itemCount,
  onPress,
}: {
  category: ItemCategory;
  itemCount: number;
  onPress: () => void;
}) => {
  const pal = getCatPalette(category.name);
  const icon = getCatIcon(category.name);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.catCard, { borderColor: pal.border }, pressed && styles.catCardPressed]}
    >
      <View style={[styles.catIconBg, { backgroundColor: pal.bg }]}>
        <Icon source={icon} size={24} color={pal.icon} />
      </View>
      <Text style={styles.catName} numberOfLines={2}>{category.name}</Text>
      <Text style={styles.catCount}>
        <Text style={[styles.catCountNum, { color: pal.icon }]}>{itemCount}</Text>
        <Text style={styles.catCountLabel}> items</Text>
      </Text>
    </Pressable>
  );
});

export const AllItemsCard = memo(({ count, onPress }: { count: number; onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [styles.catCard, styles.catCardAll, pressed && styles.catCardPressed]}
  >
    <View style={[styles.catIconBg, { backgroundColor: colors.primaryLight }]}>
      <Icon source="package-variant-closed" size={24} color={colors.primary} />
    </View>
    <Text style={styles.catName}>All Items</Text>
    <Text style={styles.catCount}>
      <Text style={[styles.catCountNum, { color: colors.primary }]}>{count}</Text>
      <Text style={styles.catCountLabel}> total</Text>
    </Text>
  </Pressable>
));

export const UncatCard = memo(({ count, onPress }: { count: number; onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [styles.catCard, { borderColor: colors.border }, pressed && styles.catCardPressed]}
  >
    <View style={[styles.catIconBg, { backgroundColor: colors.surfaceOffset }]}>
      <Icon source="tag-off-outline" size={24} color={colors.textMuted} />
    </View>
    <Text style={styles.catName}>Uncategorised</Text>
    <Text style={styles.catCount}>
      <Text style={[styles.catCountNum, { color: colors.textSecondary }]}>{count}</Text>
      <Text style={styles.catCountLabel}> items</Text>
    </Text>
  </Pressable>
));

const styles = StyleSheet.create({
  catCard: {
    width: "47%",
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow.sm,
  },
  catCardAll: {
    borderColor: colors.primary,
  },
  catCardPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.97 }],
  },
  catIconBg: {
    width: 46,
    height: 46,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  catName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  catCount: {
    fontSize: fontSize.xs,
  },
  catCountNum: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.black,
  },
  catCountLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
});
