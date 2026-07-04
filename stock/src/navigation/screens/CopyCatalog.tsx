import { useState } from "react";
import { View, StyleSheet, Alert } from "react-native";
import { Text, Divider, Switch, Portal, Dialog, Icon } from "react-native-paper";
import { ScrollScreen } from "../../components/layout/ScrollScreen";
import { ScreenSection } from "../../components/layout/ScreenSection";
import { StickyFooterActions } from "../../components/layout/StickyFooterActions";
import { LoadingState } from "../../components/feedback/LoadingState";
import { Button } from "../../components/ui/Button";
import { ShopCard } from "../../components/domain/shops/ShopCard";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { useShopsQuery, useCopyCatalogMutation } from "../../hooks/useShops";
import { goBack } from "../navigation-ref";
import { Shop } from "../../api/client";

export function CopyCatalog() {
  const { data: shops, isLoading: loadingShops } = useShopsQuery();

  const copyMutation = useCopyCatalogMutation();

  const [sourceShopId, setSourceShopId] = useState("");
  const [targetShopId, setTargetShopId] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [splitColors, setSplitColors] = useState(true);

  const [sourceDialogVisible, setSourceDialogVisible] = useState(false);
  const [targetDialogVisible, setTargetDialogVisible] = useState(false);

  const sourceShop = (shops || []).find((s: Shop) => s.id === sourceShopId);
  const targetShop = (shops || []).find((s: Shop) => s.id === targetShopId);

  const handleCopy = () => {
    if (!sourceShopId) {
      Alert.alert("Error", "Please select a source shop.");
      return;
    }
    if (!targetShopId) {
      Alert.alert("Error", "Please select a target shop.");
      return;
    }
    if (sourceShopId === targetShopId) {
      Alert.alert("Error", "Source and Target shop cannot be the same.");
      return;
    }

    Alert.alert(
      "Confirm Import/Export",
      `Are you sure you want to copy the product catalog from "${sourceShop?.name}" to "${targetShop?.name}"?${
        overwrite ? "\n\nWarning: This will overwrite existing items with the same name/SKU." : ""
      }`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Copy Catalog",
          onPress: () => {
            copyMutation.mutate(
              {
                sourceShopId,
                targetShopId,
                overwrite,
                splitColors,
              },
              {
                onSuccess: (res) => {
                  Alert.alert(
                    "Success",
                    `Catalog copied successfully.\n\nItems copied: ${res.copiedCount}\nItems skipped: ${res.skippedCount}`,
                    [{ text: "OK", onPress: () => goBack() }]
                  );
                },
                onError: (err: any) => {
                  Alert.alert("Error", err?.message || "Failed to copy catalog.");
                },
              }
            );
          },
        },
      ]
    );
  };

  return (
    <>
      <ScrollScreen
        title="Import/Export Catalog"
        subtitle="Copy products between your shops."
        showBack
        footer={
          !loadingShops ? (
            <StickyFooterActions
              primary={{
                label: "Start Catalog Transfer",
                onPress: handleCopy,
                loading: copyMutation.isPending,
              }}
            />
          ) : undefined
        }
      >
        {loadingShops ? (
          <LoadingState label="Loading shops..." />
        ) : (
          <>
            <ScreenSection title="Source & Target Selection" contentStyle={styles.card}>
              {/* Source Shop Selector */}
              <View style={styles.selectorRow}>
                <View style={styles.selectorIconBg}>
                  <Icon source="export" size={20} color={colors.primary} />
                </View>
                <View style={styles.selectorContent}>
                  <Text style={styles.selectorLabel}>Source Shop (Copy From)</Text>
                  <Text style={styles.selectorValue}>
                    {sourceShop ? `${sourceShop.name} (${sourceShop.code})` : "Select shop"}
                  </Text>
                </View>
                <Button
                  variant="ghost"
                  label="Select"
                  onPress={() => setSourceDialogVisible(true)}
                  style={styles.selectBtn}
                />
              </View>

              <Divider style={styles.divider} />

              {/* Target Shop Selector */}
              <View style={styles.selectorRow}>
                <View style={styles.selectorIconBg}>
                  <Icon source="import" size={20} color={colors.success || colors.primary} />
                </View>
                <View style={styles.selectorContent}>
                  <Text style={styles.selectorLabel}>Target Shop (Copy To)</Text>
                  <Text style={styles.selectorValue}>
                    {targetShop ? `${targetShop.name} (${targetShop.code})` : "Select shop"}
                  </Text>
                </View>
                <Button
                  variant="ghost"
                  label="Select"
                  onPress={() => setTargetDialogVisible(true)}
                  style={styles.selectBtn}
                />
              </View>
            </ScreenSection>

            <ScreenSection title="Copy Options" contentStyle={styles.card}>
              <View style={styles.switchRow}>
                <View style={styles.switchContent}>
                  <Text style={styles.switchTitle}>Auto-Split Color Variants</Text>
                  <Text style={styles.switchDesc}>
                    Automatically split generic color items (like Epson 003 Colour or Epson 057) into separate Cyan, Magenta, Yellow, etc. products.
                  </Text>
                </View>
                <Switch
                  value={splitColors}
                  onValueChange={setSplitColors}
                  color={colors.primary}
                />
              </View>

              <Divider style={styles.divider} />

              <View style={styles.switchRow}>
                <View style={styles.switchContent}>
                  <Text style={styles.switchTitle}>Overwrite Existing Products</Text>
                  <Text style={styles.switchDesc}>
                    Overwrite prices and details of products in target shop if they share the same name or SKU.
                  </Text>
                </View>
                <Switch
                  value={overwrite}
                  onValueChange={setOverwrite}
                  color={colors.primary}
                />
              </View>
            </ScreenSection>
          </>
        )}
      </ScrollScreen>

      {/* Dialogs */}
      <Portal>
        <Dialog visible={sourceDialogVisible} onDismiss={() => setSourceDialogVisible(false)} style={styles.dialog}>
          <Dialog.Title>Select Source Shop</Dialog.Title>
          <Dialog.Content style={styles.dialogContent}>
            {(shops || []).map((shop: Shop) => (
              <ShopCard
                key={shop.id}
                name={shop.name}
                subtitle={shop.code}
                selected={shop.id === sourceShopId}
                onPress={() => { setSourceShopId(shop.id); setSourceDialogVisible(false); }}
              />
            ))}
          </Dialog.Content>
        </Dialog>

        <Dialog visible={targetDialogVisible} onDismiss={() => setTargetDialogVisible(false)} style={styles.dialog}>
          <Dialog.Title>Select Target Shop</Dialog.Title>
          <Dialog.Content style={styles.dialogContent}>
            {(shops || []).map((shop: Shop) => (
              <ShopCard
                key={shop.id}
                name={shop.name}
                subtitle={shop.code}
                selected={shop.id === targetShopId}
                onPress={() => { setTargetShopId(shop.id); setTargetDialogVisible(false); }}
              />
            ))}
          </Dialog.Content>
        </Dialog>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadow.sm,
  },
  selectorRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  selectorIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  selectorContent: {
    flex: 1,
  },
  selectorLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  selectorValue: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginTop: 2,
  },
  selectBtn: {
    alignSelf: "center",
  },
  divider: {
    backgroundColor: colors.surfaceOffset,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
    gap: spacing.md,
  },
  switchContent: {
    flex: 1,
  },
  switchTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  switchDesc: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 4,
    lineHeight: 16,
  },
  dialog: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
  },
  dialogContent: {
    gap: spacing.sm,
  },
});
