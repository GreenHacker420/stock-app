import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon, Text } from "react-native-paper";

import type { Item } from "../../api/client";
import { colors, fontSize, fontWeight, radius, shadow, spacing } from "../../theme";
import { triggerSelectionHaptic, triggerWarningHaptic } from "../../utils/haptics";
import { AppBottomSheetModal } from "../overlays/AppBottomSheetModal";
import { Button } from "../ui/Button";
import { CachedThumbnail } from "../ui/CachedThumbnail";

type Props = {
  visible: boolean;
  products: Item[];
  loading?: boolean;
  onDismiss: () => void;
  onConfirm: (targetItemId: string, sourceItemIds: string[]) => void;
};

function firstImage(item: Item) {
  return item.imageUrl?.split(",").map((url) => url.trim()).find(Boolean) ?? null;
}

function label(item: Item) {
  return item.brand?.name ? `${item.brand.name} · ${item.name}` : item.name;
}

function compatibilityIssue(products: Item[]) {
  if (products.length < 2) return "Select at least two products.";
  const [first] = products;
  if (products.some((item) => item.status && item.status !== "ACTIVE")) {
    return "Only active products can be merged.";
  }
  if (products.some((item) => item.unit.trim().toLowerCase() !== first.unit.trim().toLowerCase())) {
    return "These products use different units. Make the units match before merging.";
  }
  if (products.some((item) => Boolean(item.requiresSerialNumber) !== Boolean(first.requiresSerialNumber))) {
    return "Serial-number tracking differs. Make the tracking setting match before merging.";
  }
  if (products.some((item) => (item.bundleComponents?.length ?? 0) > 0)) {
    return "Bundle products cannot be merged until their bundle components are removed.";
  }
  return null;
}

export function ProductMergeSheet({
  visible,
  products,
  loading = false,
  onDismiss,
  onConfirm,
}: Props) {
  const [targetItemId, setTargetItemId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    if (!visible) {
      setTargetItemId(null);
      setReviewing(false);
    }
  }, [visible]);

  const target = products.find((item) => item.id === targetItemId) ?? null;
  const sources = products.filter((item) => item.id !== targetItemId);
  const issue = useMemo(() => compatibilityIssue(products), [products]);
  const combinedAvailable = products.reduce(
    (sum, item) => sum + Number(item.availableStock ?? item.currentStock ?? 0),
    0,
  );
  const combinedPhysical = products.reduce(
    (sum, item) => sum + Number(item.physicalStock ?? item.currentStock ?? 0),
    0,
  );
  const imageCount = new Set(
    products.flatMap((item) => item.imageUrl?.split(",").map((url) => url.trim()).filter(Boolean) ?? []),
  ).size;
  const classificationDiffers = products.some(
    (item) => item.categoryId !== products[0]?.categoryId || item.brandId !== products[0]?.brandId,
  );

  const chooseTarget = (itemId: string) => {
    triggerSelectionHaptic();
    setTargetItemId(itemId);
  };

  const review = () => {
    if (issue) {
      triggerWarningHaptic();
      return;
    }
    setReviewing(true);
  };

  return (
    <AppBottomSheetModal
      visible={visible}
      title={reviewing ? "Review product merge" : "Choose the product to keep"}
      subtitle={
        reviewing
          ? "Confirm the survivor and everything that will move into it."
          : "The product you keep controls the name, SKU, prices, category, and cover photo."
      }
      onDismiss={onDismiss}
      isBusy={loading}
      maxHeight={0.92}
      scrollable
    >
      {!reviewing ? (
        <View style={styles.content}>
          <View style={styles.instructionCard}>
            <Icon source="cursor-default-click-outline" size={20} color={colors.info} />
            <Text style={styles.instructionText}>
              Tap one product to mark it as the primary product that stays active.
            </Text>
          </View>

          <View style={styles.productList}>
            {products.map((item) => {
              const selected = item.id === targetItemId;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Keep ${label(item)}`}
                  onPress={() => chooseTarget(item.id)}
                  style={({ pressed }) => [
                    styles.productCard,
                    selected && styles.productCardSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <CachedThumbnail
                    uri={firstImage(item)}
                    fallbackText={item.name.slice(0, 2).toUpperCase()}
                    fallbackIcon="package-variant"
                    color={selected ? colors.primary : colors.textMuted}
                    style={styles.thumbnail}
                  />
                  <View style={styles.productText}>
                    <Text style={styles.productName} numberOfLines={2}>{label(item)}</Text>
                    <Text style={styles.productMeta} numberOfLines={1}>
                      {item.sku || "No SKU"} · {Number(item.availableStock ?? 0)} {item.unit} available
                    </Text>
                    <Text style={styles.productMeta} numberOfLines={1}>
                      {item.category?.name || "Uncategorised"} · {item.requiresSerialNumber ? "Serial tracked" : "No serial tracking"}
                    </Text>
                  </View>
                  <View style={[styles.radio, selected && styles.radioSelected]}>
                    {selected ? <View style={styles.radioDot} /> : null}
                  </View>
                  {selected ? (
                    <View style={styles.keepBadge}>
                      <Text style={styles.keepBadgeText}>KEEP</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          {target ? (
            <View style={styles.directionRow}>
              <View style={styles.directionBlock}>
                <Text style={styles.directionLabel}>STAYS ACTIVE</Text>
                <Text style={styles.directionName} numberOfLines={1}>{target.name}</Text>
              </View>
              <Icon source="arrow-left" size={20} color={colors.primary} />
              <View style={styles.directionBlock}>
                <Text style={styles.directionLabel}>DEACTIVATED</Text>
                <Text style={styles.directionName} numberOfLines={1}>
                  {sources.map((item) => item.name).join(", ")}
                </Text>
              </View>
            </View>
          ) : null}

          {issue ? (
            <View style={styles.issueCard}>
              <Icon source="alert-circle-outline" size={20} color={colors.danger} />
              <Text style={styles.issueText}>{issue}</Text>
            </View>
          ) : null}

          <View style={styles.footerActions}>
            <Button label="Cancel" variant="ghost" onPress={onDismiss} style={styles.actionButton} />
            <Button
              label="Review merge"
              icon="arrow-right"
              onPress={review}
              disabled={!target || Boolean(issue)}
              style={styles.actionButton}
            />
          </View>
        </View>
      ) : target ? (
        <View style={styles.content}>
          <View style={styles.survivorCard}>
            <View style={styles.survivorHeader}>
              <CachedThumbnail
                uri={firstImage(target)}
                fallbackText={target.name.slice(0, 2).toUpperCase()}
                fallbackIcon="package-variant"
                color={colors.primary}
                style={styles.survivorThumbnail}
              />
              <View style={styles.productText}>
                <Text style={styles.eyebrow}>PRIMARY PRODUCT · WILL STAY</Text>
                <Text style={styles.survivorName}>{label(target)}</Text>
                <Text style={styles.productMeta}>{target.sku || "No SKU"} · {target.unit}</Text>
              </View>
              <Icon source="check-decagram" size={26} color={colors.primary} />
            </View>
          </View>

          <View style={styles.previewGrid}>
            <PreviewCell label="Available stock" value={`${combinedAvailable} ${target.unit}`} icon="warehouse" />
            <PreviewCell label="Physical stock" value={`${combinedPhysical} ${target.unit}`} icon="package-variant-closed" />
            <PreviewCell label="Photos preserved" value={`${imageCount} unique`} icon="image-multiple-outline" />
            <PreviewCell label="Products removed" value={`${sources.length}`} icon="archive-arrow-down-outline" />
          </View>

          <View style={styles.detailCard}>
            <MergeDetail icon="swap-horizontal" text="Sales, orders, dispatches, delivery memos, returns, stock history, and reservations move to the primary product." />
            <MergeDetail icon="image-multiple-outline" text="Primary photos stay first and every unique duplicate photo is preserved." />
            <MergeDetail icon="tag-outline" text="The primary name, SKU, prices, category, and brand win. Empty optional fields can be filled from a duplicate." />
            <MergeDetail icon="archive-outline" text={`${sources.map((item) => item.name).join(", ")} will be deactivated and removed from the active catalog.`} />
          </View>

          {classificationDiffers ? (
            <View style={styles.warningCard}>
              <Icon source="alert-outline" size={20} color={colors.warning} />
              <Text style={styles.warningText}>
                Category or brand differs. The primary product’s classification will be used.
              </Text>
            </View>
          ) : null}

          <View style={styles.irreversibleCard}>
            <Icon source="lock-alert-outline" size={21} color={colors.danger} />
            <View style={styles.productText}>
              <Text style={styles.irreversibleTitle}>This merge cannot be undone in the app</Text>
              <Text style={styles.irreversibleText}>
                Verify the primary product and combined stock before continuing.
              </Text>
            </View>
          </View>

          <View style={styles.footerActions}>
            <Button label="Back" variant="ghost" onPress={() => setReviewing(false)} disabled={loading} style={styles.actionButton} />
            <Button
              label={`Merge into ${target.name}`}
              variant="danger"
              icon="call-merge"
              loading={loading}
              onPress={() => onConfirm(target.id, sources.map((item) => item.id))}
              style={styles.confirmButton}
            />
          </View>
        </View>
      ) : null}
    </AppBottomSheetModal>
  );
}

function PreviewCell({ label: cellLabel, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <View style={styles.previewCell}>
      <Icon source={icon} size={18} color={colors.primary} />
      <Text style={styles.previewValue}>{value}</Text>
      <Text style={styles.previewLabel}>{cellLabel}</Text>
    </View>
  );
}

function MergeDetail({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}><Icon source={icon} size={17} color={colors.primary} /></View>
      <Text style={styles.detailText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  instructionCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.infoLight },
  instructionText: { flex: 1, color: colors.textSecondary, fontSize: fontSize.sm, lineHeight: 19 },
  productList: { gap: spacing.md },
  productCard: { minHeight: 96, flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, backgroundColor: colors.surface, position: "relative", ...shadow.sm },
  productCardSelected: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primaryLight },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  thumbnail: { width: 66, height: 66, borderRadius: radius.lg },
  survivorThumbnail: { width: 58, height: 58, borderRadius: radius.lg },
  productText: { flex: 1, minWidth: 0, gap: 3 },
  productName: { color: colors.textPrimary, fontSize: fontSize.md, fontWeight: fontWeight.extrabold },
  productMeta: { color: colors.textSecondary, fontSize: fontSize.xs },
  radio: { width: 23, height: 23, borderRadius: radius.full, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 11, height: 11, borderRadius: radius.full, backgroundColor: colors.primary },
  keepBadge: { position: "absolute", top: 0, right: spacing.xl, paddingHorizontal: spacing.sm, paddingVertical: 3, borderBottomLeftRadius: radius.sm, borderBottomRightRadius: radius.sm, backgroundColor: colors.primary },
  keepBadgeText: { color: colors.textInverse, fontSize: 9, fontWeight: fontWeight.black, letterSpacing: 0.8 },
  directionRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceOffset },
  directionBlock: { flex: 1, minWidth: 0 },
  directionLabel: { color: colors.textMuted, fontSize: 9, fontWeight: fontWeight.black, letterSpacing: 0.7 },
  directionName: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  issueCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.dangerLight, borderWidth: 1, borderColor: "#fecaca" },
  issueText: { flex: 1, color: colors.danger, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  footerActions: { flexDirection: "row", gap: spacing.sm },
  actionButton: { flex: 1 },
  confirmButton: { flex: 2 },
  survivorCard: { padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: "#86efac" },
  survivorHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  eyebrow: { color: colors.primaryDark, fontSize: 9, fontWeight: fontWeight.black, letterSpacing: 0.7 },
  survivorName: { color: colors.textPrimary, fontSize: fontSize.lg, fontWeight: fontWeight.extrabold },
  previewGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  previewCell: { width: "48.5%", minHeight: 92, justifyContent: "center", padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  previewValue: { color: colors.textPrimary, fontSize: fontSize.md, fontWeight: fontWeight.extrabold, marginTop: spacing.xs },
  previewLabel: { color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2 },
  detailCard: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.surfaceOffset },
  detailRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  detailIcon: { width: 30, height: 30, borderRadius: radius.full, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryLight },
  detailText: { flex: 1, color: colors.textSecondary, fontSize: fontSize.sm, lineHeight: 19 },
  warningCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.warningLight },
  warningText: { flex: 1, color: colors.warning, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  irreversibleCard: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: "#fecaca", backgroundColor: "#fff7f7" },
  irreversibleTitle: { color: colors.danger, fontSize: fontSize.sm, fontWeight: fontWeight.extrabold },
  irreversibleText: { color: colors.textSecondary, fontSize: fontSize.xs, lineHeight: 17 },
});
