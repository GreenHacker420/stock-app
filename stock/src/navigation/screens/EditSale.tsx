import { useMemo, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Alert, ActivityIndicator, Switch, Platform } from "react-native";
import { Divider, Text, Icon, TextInput as PaperTextInput } from "react-native-paper";
import { useRoute, useNavigation } from "@react-navigation/native";

import { useSaleQuery, useAmendSaleMutation, useUpdateSaleMutation } from "../../hooks/useSales";
import { useItemsQuery } from "../../hooks/useItems";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Button } from "../../components/ui/Button";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { triggerLightHaptic, triggerSuccessHaptic } from "../../utils/haptics";

const money = (value?: string | number | null) => `₹${Number(value ?? 0).toLocaleString("en-IN")}`;

export function EditSale() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const saleId = route.params?.saleId;

  const saleQuery = useSaleQuery(saleId);
  const sale = saleQuery.data;

  const itemsQuery = useItemsQuery({ limit: 1000 });
  const amendSaleMutation = useAmendSaleMutation();
  const updateSaleMutation = useUpdateSaleMutation();
  const isDraft = sale?.saleStatus === "DRAFT";

  const [editItems, setEditItems] = useState<any[]>([]);
  const [editDiscountAmount, setEditDiscountAmount] = useState("0");
  const [reason, setReason] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [gstRequired, setGstRequired] = useState(false);

  // Initialize form fields once sale data is loaded
  if (sale && !initialized) {
    setEditItems(
      (sale.items || []).map((item: any) => ({
        itemId: item.itemId,
        name: item.item.name,
        quantity: String(item.quantity),
        rate: String(item.rate),
        unit: item.item.unit,
        defaultSellingPrice: item.item.defaultSellingPrice,
        minimumPrice: item.item.minimumPrice,
      }))
    );
    setEditDiscountAmount(String(sale.discountAmount || 0));
    setGstRequired(sale.gstRequired || false);
    setInitialized(true);
  }

  const allProducts = itemsQuery.data?.items ?? [];
  const filteredProducts = useMemo(() => {
    if (!productSearch) return [];
    return allProducts.filter((p: any) => 
      p.name.toLowerCase().includes(productSearch.toLowerCase()) || 
      (p.sku && p.sku.toLowerCase().includes(productSearch.toLowerCase()))
    ).slice(0, 5);
  }, [productSearch, allProducts]);

  const handleAddProduct = (prod: any) => {
    triggerLightHaptic();
    setEditItems(prev => {
      const existing = prev.find(item => item.itemId === prod.id);
      if (existing) {
        return prev.map(item => 
          item.itemId === prod.id 
            ? { ...item, quantity: String(Number(item.quantity) + 1) } 
            : item
        );
      } else {
        return [
          ...prev,
          {
            itemId: prod.id,
            name: prod.name,
            quantity: "1",
            rate: String(prod.defaultSellingPrice),
            unit: prod.unit,
            defaultSellingPrice: prod.defaultSellingPrice,
            minimumPrice: prod.minimumPrice,
          }
        ];
      }
    });
    setProductSearch("");
  };

  // Calculations for current workspace totals
  const subtotal = useMemo(() => {
    return editItems.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.rate || 0)), 0);
  }, [editItems]);

  const totalAmount = useMemo(() => {
    return Math.max(0, subtotal - Number(editDiscountAmount || 0));
  }, [subtotal, editDiscountAmount]);

  const previousTotal = Number(sale?.totalAmount || 0);
  const financialChange = totalAmount - previousTotal;

  // Delta calculation for items
  const itemDeltas = useMemo(() => {
    if (!sale) return [];
    const beforeMap = new Map((sale.items || []).map((item: any) => [item.itemId, item]));
    const afterMap = new Map(editItems.map(item => [item.itemId, item]));
    const allIds = new Set([...beforeMap.keys(), ...afterMap.keys()]);
    
    const deltas = [];
    for (const itemId of allIds) {
      const before = beforeMap.get(itemId);
      const after = afterMap.get(itemId);

      const beforeQty = before ? Number(before.quantity) : 0;
      const afterQty = after ? Number(after.quantity) : 0;
      const deltaQty = afterQty - beforeQty;

      const beforeRate = before ? Number(before.rate) : 0;
      const afterRate = after ? Number(after.rate) : 0;

      if (deltaQty !== 0 || beforeRate !== afterRate) {
        deltas.push({
          itemId,
          name: after?.name || before?.item?.name || "Product",
          beforeQty,
          afterQty,
          deltaQty,
          beforeRate,
          afterRate,
        });
      }
    }
    return deltas;
  }, [sale, editItems]);

  const handleSaveAmendment = () => {
    if (!sale) return;

    const formattedItems = editItems.map(item => ({
      itemId: item.itemId,
      quantity: Number(item.quantity),
      rate: Number(item.rate),
    }));

    if (formattedItems.length === 0) {
      Alert.alert("Error", "Sale must contain at least one item.");
      return;
    }

    for (const item of formattedItems) {
      if (isNaN(item.quantity) || item.quantity <= 0) {
        Alert.alert("Error", "All quantities must be greater than 0.");
        return;
      }
      if (isNaN(item.rate) || item.rate < 0) {
        Alert.alert("Error", "All rates must be greater than or equal to 0.");
        return;
      }
    }

    if (!isDraft && !reason.trim()) {
      Alert.alert("Error", "Please provide a reason for the amendment.");
      return;
    }

    if (isDraft) {
      updateSaleMutation.mutate({
        saleId: sale.id,
        data: {
          items: formattedItems,
          discountAmount: Number(editDiscountAmount || 0),
          gstRequired,
        }
      }, {
        onSuccess: () => {
          triggerSuccessHaptic();
          Alert.alert("Success", "Draft updated successfully!", [
            { text: "OK", onPress: () => navigation.goBack() }
          ]);
        },
        onError: (err: any) => {
          Alert.alert("Error", err.message || "Failed to update draft");
        }
      });
      return;
    }

    amendSaleMutation.mutate({
      saleId: sale.id,
      data: {
        expectedVersion: sale.version,
        reason: reason.trim(),
        items: formattedItems,
        discountAmount: Number(editDiscountAmount || 0),
        notes: sale.notes || undefined,
        gstRequired,
      }
    }, {
      onSuccess: () => {
        triggerSuccessHaptic();
        Alert.alert("Success", "Amendment confirmed successfully!", [
          { text: "OK", onPress: () => navigation.goBack() }
        ]);
      },
      onError: (err: any) => {
        Alert.alert("Error", err.message || "Failed to confirm amendment");
      }
    });
  };

  if (saleQuery.isLoading) {
    return (
      <Screen>
        <AppHeader title="Edit Sale Workspace" showBack />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (!sale) {
    return (
      <Screen>
        <AppHeader title="Edit Sale Workspace" showBack />
        <View style={styles.center}>
          <Text>Sale not found</Text>
        </View>
      </Screen>
    );
  }

  if (isReviewing) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <AppHeader title="Review Sale Changes" showBack onBack={() => setIsReviewing(false)} />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>ITEM CHANGES</Text>
          </View>
          
          <View style={styles.card}>
            {itemDeltas.map((change, idx) => (
              <View key={change.itemId + idx} style={change.deltaQty !== 0 || change.beforeRate !== change.afterRate ? styles.changeRow : styles.noChangeRow}>
                <Text style={styles.itemName}>{change.name}</Text>
                
                {change.deltaQty !== 0 && (
                  <Text style={styles.changeLabel}>
                    Quantity: <Text style={styles.boldText}>{change.beforeQty} → {change.afterQty}</Text> (Delta: {change.deltaQty > 0 ? `+${change.deltaQty}` : change.deltaQty})
                  </Text>
                )}

                {change.beforeRate !== change.afterRate && (
                  <Text style={styles.changeLabel}>
                    Rate: <Text style={styles.boldText}>{money(change.beforeRate)} → {money(change.afterRate)}</Text>
                  </Text>
                )}
                {idx < itemDeltas.length - 1 && <Divider style={styles.divider} />}
              </View>
            ))}
            {itemDeltas.length === 0 && (
              <Text style={styles.emptyText}>No items changed.</Text>
            )}
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>FINANCIAL IMPACT</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.impactRow}>
              <Text style={styles.impactLabel}>Previous Total</Text>
              <Text style={styles.impactValue}>{money(previousTotal)}</Text>
            </View>
            <Divider style={styles.divider} />
            <View style={styles.impactRow}>
              <Text style={styles.impactLabel}>New Total</Text>
              <Text style={styles.impactValue}>{money(totalAmount)}</Text>
            </View>
            <Divider style={styles.divider} />
            <View style={styles.impactRow}>
              <Text style={styles.impactLabel}>Receivable Difference</Text>
              <Text style={[styles.impactValue, { color: financialChange >= 0 ? colors.success : colors.danger }]}>
                {financialChange >= 0 ? `+${money(financialChange)}` : `-${money(Math.abs(financialChange))}`}
              </Text>
            </View>
          </View>

          {!isDraft && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>REASON FOR CHANGE</Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.reasonText}>"{reason}"</Text>
              </View>
            </>
          )}

          {sale.gstInvoiceNumber && (
            <View style={[styles.card, { borderColor: colors.warning, borderWidth: 1, backgroundColor: colors.warningLight }]}>
              <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
                <Icon source="alert-circle-outline" size={24} color={colors.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.boldText, { color: colors.warning }]}>GST Invoice Already Issued</Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                    Invoice #{sale.gstInvoiceNumber} is active. Modifying these items will require re-issuing or canceling the invoice in Tally.
                  </Text>
                </View>
              </View>
            </View>
          )}

          <View style={styles.btnRow}>
            <Button label="BACK TO EDIT" variant="ghost" onPress={() => setIsReviewing(false)} style={{ flex: 1 }} />
            <Button
              label={isDraft ? "SAVE DRAFT" : "CONFIRM AMENDMENT"}
              variant="primary"
              loading={isDraft ? updateSaleMutation.isPending : amendSaleMutation.isPending}
              onPress={handleSaveAmendment}
              style={{ flex: 1.5 }}
            />
          </View>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "left", "right"]}>
      <AppHeader title={`Edit Sale #${sale.saleNumber}`} showBack />
      
      {/* Product Search & Autocomplete suggestions */}
      <View style={styles.searchContainer}>
        <PaperTextInput
          mode="outlined"
          label="Search products to add..."
          value={productSearch}
          onChangeText={setProductSearch}
          placeholder="Type product name or SKU"
          outlineColor={colors.border}
          activeOutlineColor={colors.primary}
          textColor={colors.textPrimary}
          style={styles.searchInput}
          right={<PaperTextInput.Icon icon="magnify" color={colors.textSecondary} />}
        />
        {filteredProducts.length > 0 && (
          <View style={styles.suggestionsContainer}>
            {filteredProducts.map((prod: any) => (
              <Pressable
                key={prod.id}
                onPress={() => handleAddProduct(prod)}
                style={({ pressed }) => [
                  styles.suggestionRow,
                  pressed && styles.suggestionRowPressed
                ]}
              >
                <Text style={styles.suggestionName}>{prod.name}</Text>
                <Text style={styles.suggestionPrice}>{money(prod.defaultSellingPrice)}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>ITEMS LIST</Text>
        </View>

        <View style={styles.card}>
          {editItems.map((item, index) => {
            const handleQtyChange = (val: string) => {
              setEditItems(prev => prev.map((it, idx) => idx === index ? { ...it, quantity: val } : it));
            };
            const handleRateChange = (val: string) => {
              setEditItems(prev => prev.map((it, idx) => idx === index ? { ...it, rate: val } : it));
            };
            const handleRemove = () => {
              setEditItems(prev => prev.filter((_, idx) => idx !== index));
            };
            const handleIncrement = () => {
              const cur = Number(item.quantity) || 0;
              handleQtyChange(String(cur + 1));
            };
            const handleDecrement = () => {
              const cur = Number(item.quantity) || 0;
              handleQtyChange(String(Math.max(1, cur - 1)));
            };

            return (
              <View key={item.itemId + index} style={styles.editItemRow}>
                <View style={{ flex: 1, gap: spacing.xs }}>
                  <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                  
                  <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center", marginTop: 4 }}>
                    {/* Quantity Selector */}
                    <View style={styles.qtyContainer}>
                      <Pressable onPress={handleDecrement} style={styles.qtyBtn}>
                        <Text style={styles.qtyBtnText}>-</Text>
                      </Pressable>
                      <PaperTextInput
                        mode="flat"
                        value={item.quantity}
                        onChangeText={handleQtyChange}
                        keyboardType="numeric"
                        style={styles.qtyInput}
                        underlineColor="transparent"
                        activeUnderlineColor="transparent"
                        dense
                      />
                      <Pressable onPress={handleIncrement} style={styles.qtyBtn}>
                        <Text style={styles.qtyBtnText}>+</Text>
                      </Pressable>
                    </View>

                    {/* Rate Input */}
                    <PaperTextInput
                      mode="outlined"
                      label="Rate (₹)"
                      value={item.rate}
                      onChangeText={handleRateChange}
                      keyboardType="numeric"
                      style={styles.rateInput}
                      outlineColor={colors.border}
                      activeOutlineColor={colors.primary}
                      dense
                    />
                  </View>
                </View>

                <Pressable onPress={handleRemove} style={styles.removeBtn}>
                  <Icon source="trash-can-outline" size={24} color={colors.danger} />
                </Pressable>
              </View>
            );
          })}
          {editItems.length === 0 && (
            <Text style={styles.emptyText}>No items added yet. Search above to add items.</Text>
          )}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>SUMMARY</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.impactRow}>
            <Text style={styles.impactLabel}>Subtotal</Text>
            <Text style={styles.impactValue}>{money(subtotal)}</Text>
          </View>
          <Divider style={styles.divider} />
          <PaperTextInput
            mode="outlined"
            label="Overall Discount (₹)"
            value={editDiscountAmount}
            onChangeText={setEditDiscountAmount}
            keyboardType="numeric"
            style={styles.overallDiscountInput}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
            textColor={colors.textPrimary}
          />
          <Divider style={styles.divider} />
          <View style={[styles.impactRow, { paddingVertical: spacing.xs, alignItems: "center" }]}>
            <Text style={styles.impactLabel}>GST Invoice Required</Text>
            <Switch
              value={gstRequired}
              onValueChange={setGstRequired}
              trackColor={{ false: colors.border, true: colors.warning }}
              thumbColor={Platform.OS === 'android' ? (gstRequired ? colors.warning : '#f4f3f4') : undefined}
            />
          </View>
          <Divider style={styles.divider} />
          <View style={styles.impactRow}>
            <Text style={styles.boldText}>New Total</Text>
            <Text style={styles.impactValue}>{money(totalAmount)}</Text>
          </View>
        </View>

        {!isDraft && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>AMENDMENT REASON</Text>
            </View>
            
            <View style={styles.card}>
              <PaperTextInput
                mode="outlined"
                label="Reason for change"
                value={reason}
                onChangeText={setReason}
                placeholder="e.g. Customer added units / rate correction"
                style={styles.overallDiscountInput}
                outlineColor={colors.border}
                activeOutlineColor={colors.primary}
                textColor={colors.textPrimary}
                multiline
                numberOfLines={2}
              />
            </View>
          </>
        )}

        <Button
          label={isDraft ? "REVIEW DRAFT" : "REVIEW CHANGES"}
          variant="primary"
          disabled={editItems.length === 0 || (!isDraft && !reason.trim())}
          onPress={() => setIsReviewing(true)}
          style={{ marginVertical: spacing.lg }}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: 60 },
  searchContainer: { paddingHorizontal: spacing.lg, zIndex: 1000, marginVertical: spacing.sm },
  searchInput: { backgroundColor: colors.surface },
  card: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    ...shadow.sm,
  },
  sectionHeader: { marginTop: spacing.lg, marginBottom: spacing.xs },
  sectionTitle: { fontSize: 11, fontWeight: fontWeight.black, color: colors.textMuted, letterSpacing: 1 },
  editItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  itemName: { fontSize: 14, fontWeight: fontWeight.bold, color: colors.textPrimary },
  qtyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceOffset,
    height: 38,
    width: 90,
    overflow: 'hidden',
  },
  qtyBtn: {
    width: 26,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.border,
  },
  qtyBtnText: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  qtyInput: {
    flex: 1,
    height: '100%',
    backgroundColor: 'transparent',
    textAlign: 'center',
    fontSize: 12,
    paddingHorizontal: 0,
  },
  rateInput: {
    width: 100,
    height: 38,
    backgroundColor: colors.surface,
  },
  removeBtn: { padding: spacing.sm },
  divider: { marginVertical: spacing.xs, backgroundColor: colors.surfaceOffset },
  impactRow: { flexDirection: "row", justifyContent: "space-between" },
  impactLabel: { fontSize: 13, color: colors.textSecondary },
  impactValue: { fontSize: 14, fontWeight: fontWeight.bold, color: colors.textPrimary },
  boldText: { fontWeight: fontWeight.bold, color: colors.textPrimary },
  reasonText: { fontStyle: "italic", color: colors.textPrimary, fontSize: 13 },
  btnRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xl },
  overallDiscountInput: { backgroundColor: colors.surface, fontSize: 13 },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: "center", paddingVertical: spacing.md },
  changeRow: { paddingVertical: spacing.xs },
  noChangeRow: { paddingVertical: spacing.xs, opacity: 0.5 },
  changeLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  suggestionsContainer: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginTop: 2,
    position: 'absolute',
    top: 50,
    zIndex: 2000,
    ...shadow.sm,
  },
  suggestionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceOffset,
  },
  suggestionRowPressed: { backgroundColor: colors.surfaceOffset },
  suggestionName: { fontSize: 13, color: colors.textPrimary, fontWeight: fontWeight.bold, flex: 1 },
  suggestionPrice: { fontSize: 13, color: colors.primary, fontWeight: fontWeight.bold },
});
