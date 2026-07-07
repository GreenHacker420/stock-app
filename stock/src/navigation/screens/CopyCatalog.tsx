import { useState, useEffect, useMemo } from "react";
import { View, StyleSheet, Alert, Pressable, ScrollView } from "react-native";
import { Text, Divider, Switch, Portal, Dialog, Icon, SegmentedButtons, ActivityIndicator, Searchbar } from "react-native-paper";
import { ScrollScreen } from "../../components/layout/ScrollScreen";
import { ScreenSection } from "../../components/layout/ScreenSection";
import { StickyFooterActions } from "../../components/layout/StickyFooterActions";
import { LoadingState } from "../../components/feedback/LoadingState";
import { Button } from "../../components/ui/Button";
import { ShopCard } from "../../components/domain/shops/ShopCard";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { useShopsQuery, useCopyCatalogMutation } from "../../hooks/useShops";
import { goBack } from "../navigation-ref";
import { Shop, fetchCategories, fetchItems, Item } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";

export function CopyCatalog() {
  const { data: shops, isLoading: loadingShops } = useShopsQuery();

  const copyMutation = useCopyCatalogMutation();

  const token = useAuthStore((state) => state.token);

  const [sourceShopId, setSourceShopId] = useState("");
  const [targetShopId, setTargetShopId] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [splitColors, setSplitColors] = useState(true);

  const [transferMode, setTransferMode] = useState<"ALL" | "CATEGORY" | "CUSTOM">("ALL");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  const [sourceCategories, setSourceCategories] = useState<any[]>([]);
  const [sourceItems, setSourceItems] = useState<Item[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [itemSearch, setItemSearch] = useState("");

  const [sourceDialogVisible, setSourceDialogVisible] = useState(false);
  const [targetDialogVisible, setTargetDialogVisible] = useState(false);

  const sourceShop = (shops || []).find((s: Shop) => s.id === sourceShopId);
  const targetShop = (shops || []).find((s: Shop) => s.id === targetShopId);

  function money(value?: string | number | null) {
    return `₹${Number(value ?? 0).toLocaleString("en-IN")}`;
  }

  useEffect(() => {
    if (!sourceShopId) {
      setSourceCategories([]);
      setSourceItems([]);
      return;
    }
    setLoadingDetails(true);
    Promise.all([
      fetchCategories(token ?? "", sourceShopId),
      fetchItems(token ?? "", sourceShopId, { limit: 1000 })
    ])
      .then(([cats, itemsRes]) => {
        setSourceCategories(cats);
        setSourceItems(itemsRes.items || []);
        setSelectedCategoryIds([]);
        setSelectedItemIds([]);
      })
      .catch((err) => {
        Alert.alert("Error", "Failed to fetch source shop details: " + err.message);
      })
      .finally(() => {
        setLoadingDetails(false);
      });
  }, [sourceShopId, token]);

  const filteredSourceItems = useMemo(() => {
    if (!itemSearch.trim()) return sourceItems;
    return sourceItems.filter(item => 
      item.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
      (item.sku && item.sku.toLowerCase().includes(itemSearch.toLowerCase()))
    );
  }, [sourceItems, itemSearch]);

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
    if (transferMode === "CATEGORY" && selectedCategoryIds.length === 0) {
      Alert.alert("Error", "Please select at least one category to transfer.");
      return;
    }
    if (transferMode === "CUSTOM" && selectedItemIds.length === 0) {
      Alert.alert("Error", "Please select at least one product to transfer.");
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
                ...(transferMode === "CATEGORY" ? { categoryIds: selectedCategoryIds } : {}),
                ...(transferMode === "CUSTOM" ? { itemIds: selectedItemIds } : {}),
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
              <Pressable
                onPress={() => setSourceDialogVisible(true)}
                style={({ pressed }) => [styles.selectorRow, pressed && styles.pressed]}
              >
                <View style={styles.selectorIconBg}>
                  <Icon source="export" size={20} color={colors.primary} />
                </View>
                <View style={styles.selectorContent}>
                  <Text style={styles.selectorLabel}>Source Shop (Copy From)</Text>
                  <Text style={styles.selectorValue}>
                    {sourceShop ? `${sourceShop.name} (${sourceShop.code})` : "Select shop"}
                  </Text>
                </View>
                <Icon source="chevron-right" size={20} color={colors.textMuted} />
              </Pressable>

              <Divider style={styles.divider} />

              {/* Target Shop Selector */}
              <Pressable
                onPress={() => setTargetDialogVisible(true)}
                style={({ pressed }) => [styles.selectorRow, pressed && styles.pressed]}
              >
                <View style={styles.selectorIconBg}>
                  <Icon source="import" size={20} color={colors.success} />
                </View>
                <View style={styles.selectorContent}>
                  <Text style={styles.selectorLabel}>Target Shop (Copy To)</Text>
                  <Text style={styles.selectorValue}>
                    {targetShop ? `${targetShop.name} (${targetShop.code})` : "Select shop"}
                  </Text>
                </View>
                <Icon source="chevron-right" size={20} color={colors.textMuted} />
              </Pressable>
            </ScreenSection>

            {!!sourceShopId && (
              <ScreenSection title="Transfer Mode" contentStyle={styles.card}>
                <View style={{ padding: spacing.md }}>
                  <SegmentedButtons
                    value={transferMode}
                    onValueChange={(val: any) => setTransferMode(val)}
                    buttons={[
                      { value: "ALL", label: "All Items" },
                      { value: "CATEGORY", label: "Category Wise" },
                      { value: "CUSTOM", label: "Custom Select" },
                    ]}
                    theme={{ colors: { primary: colors.primary } }}
                  />
                </View>
              </ScreenSection>
            )}

            {transferMode === "CATEGORY" && !!sourceShopId && (
              <ScreenSection title="Select Categories to Copy" contentStyle={styles.card}>
                {loadingDetails ? (
                  <View style={{ padding: spacing.xl, alignItems: "center" }}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                ) : sourceCategories.length === 0 ? (
                  <View style={{ padding: spacing.xl, alignItems: "center" }}>
                    <Text style={{ color: colors.textMuted }}>No categories found in source shop.</Text>
                  </View>
                ) : (
                  sourceCategories.map((cat) => {
                    const isSelected = selectedCategoryIds.includes(cat.id);
                    return (
                      <Pressable
                        key={cat.id}
                        onPress={() => {
                          setSelectedCategoryIds(prev => 
                            isSelected ? prev.filter(id => id !== cat.id) : [...prev, cat.id]
                          );
                        }}
                        style={styles.selectionRow}
                      >
                        <Text style={styles.selectionLabel}>{cat.name}</Text>
                        <Switch
                          value={isSelected}
                          onValueChange={(val) => {
                            setSelectedCategoryIds(prev => 
                              val ? [...prev, cat.id] : prev.filter(id => id !== cat.id)
                            );
                          }}
                          color={colors.primary}
                        />
                      </Pressable>
                    );
                  })
                )}
              </ScreenSection>
            )}

            {transferMode === "CUSTOM" && !!sourceShopId && (
              <ScreenSection title="Select Products to Copy" contentStyle={styles.card}>
                <Searchbar
                  placeholder="Search products..."
                  value={itemSearch}
                  onChangeText={setItemSearch}
                  style={[styles.searchBar, { margin: spacing.md, marginBottom: 0 }]}
                  inputStyle={styles.searchInput}
                  elevation={0}
                />
                {loadingDetails ? (
                  <View style={{ padding: spacing.xl, alignItems: "center" }}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                ) : sourceItems.length === 0 ? (
                  <View style={{ padding: spacing.xl, alignItems: "center" }}>
                    <Text style={{ color: colors.textMuted }}>No products found in source shop.</Text>
                  </View>
                ) : (
                  <View style={{ maxHeight: 300, paddingBottom: spacing.sm }}>
                    <ScrollView nestedScrollEnabled style={{ maxHeight: 300 }}>
                      {filteredSourceItems.map((item) => {
                        const isSelected = selectedItemIds.includes(item.id);
                        return (
                          <Pressable
                            key={item.id}
                            onPress={() => {
                              setSelectedItemIds(prev => 
                                isSelected ? prev.filter(id => id !== item.id) : [...prev, item.id]
                              );
                            }}
                            style={styles.selectionRow}
                          >
                            <View style={{ flex: 1, marginRight: spacing.md }}>
                              <Text style={styles.selectionLabel} numberOfLines={1}>{item.name}</Text>
                              <Text style={styles.selectionSubtitle} numberOfLines={1}>
                                {item.sku || "No SKU"} • {money(item.defaultSellingPrice)} / {item.unit}
                              </Text>
                            </View>
                            <Switch
                              value={isSelected}
                              onValueChange={(val) => {
                                setSelectedItemIds(prev => 
                                  val ? [...prev, item.id] : prev.filter(id => id !== item.id)
                                );
                              }}
                              color={colors.primary}
                            />
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </ScreenSection>
            )}

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
          <Dialog.ScrollArea style={styles.dialogScrollArea}>
            <ScrollView contentContainerStyle={styles.dialogContent}>
              {(shops || []).map((shop: Shop) => (
                <ShopCard
                  key={shop.id}
                  name={shop.name}
                  subtitle={shop.code}
                  selected={shop.id === sourceShopId}
                  onPress={() => { setSourceShopId(shop.id); setSourceDialogVisible(false); }}
                />
              ))}
            </ScrollView>
          </Dialog.ScrollArea>
        </Dialog>

        <Dialog visible={targetDialogVisible} onDismiss={() => setTargetDialogVisible(false)} style={styles.dialog}>
          <Dialog.Title>Select Target Shop</Dialog.Title>
          <Dialog.ScrollArea style={styles.dialogScrollArea}>
            <ScrollView contentContainerStyle={styles.dialogContent}>
              {(shops || []).map((shop: Shop) => (
                <ShopCard
                  key={shop.id}
                  name={shop.name}
                  subtitle={shop.code}
                  selected={shop.id === targetShopId}
                  onPress={() => { setTargetShopId(shop.id); setTargetDialogVisible(false); }}
                />
              ))}
            </ScrollView>
          </Dialog.ScrollArea>
        </Dialog>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  selectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceOffset,
  },
  selectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  selectionSubtitle: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  searchBar: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
  },
  searchInput: {
    fontSize: fontSize.md,
  },
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
  dialogScrollArea: {
    paddingHorizontal: 0,
    maxHeight: 300,
  },
  pressed: {
    opacity: 0.7,
    backgroundColor: colors.surfaceOffset,
  },
});
