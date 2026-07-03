import React, { useState, useMemo } from "react";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from "react-native";
import { Text, TextInput, Card, Button, Portal, Dialog, Divider, List, Icon } from "react-native-paper";
import { useCustomersQuery } from "../../hooks/useCustomers";
import { useItemsQuery } from "../../hooks/useItems";
import { useCreateDeliveryMemoMutation } from "../../hooks/useDeliveryMemos";
import { useAuthStore } from "../../auth/auth-store";
import { FormScreen } from "../../components/layout/FormScreen";
import { ScreenSection } from "../../components/layout/ScreenSection";
import { StickyFooterActions } from "../../components/layout/StickyFooterActions";
import { FormTextField } from "../../components/forms/FormTextField";
import { SearchablePicker } from "../../components/forms/SearchablePicker";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { goBack } from "../navigation-ref";

const money = (value?: string | number | null) => "₹" + Number(value ?? 0).toLocaleString("en-IN");

interface SelectedItem {
  id: string;
  name: string;
  sku: string;
  unit: string;
  mrp: number;
  minimumPrice: number;
  defaultSellingPrice: number;
  quantity: number;
  rate: number;
}

export function CreateDeliveryMemo() {
  const user = useAuthStore((state) => state.user);
  const isStaff = user?.role === "STAFF";

  const customersQuery = useCustomersQuery();
  const itemsQuery = useItemsQuery();
  const createMutation = useCreateDeliveryMemoMutation();

  const [customerSearch, setCustomerSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");

  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [cart, setCart] = useState<SelectedItem[]>([]);
  const [expectedPaymentDate, setExpectedPaymentDate] = useState("");

  // Dialog / Picker States
  const [customerPickerVisible, setCustomerPickerVisible] = useState(false);
  const [productPickerVisible, setProductPickerVisible] = useState(false);

  // Filtered lists
  const filteredCustomers = useMemo(() => {
    const list = customersQuery.data ?? [];
    if (!customerSearch) return list;
    return list.filter((c: any) =>
      c.name?.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.phone?.includes(customerSearch)
    );
  }, [customersQuery.data, customerSearch]);

  const filteredProducts = useMemo(() => {
    const list = itemsQuery.data?.items ?? [];
    if (!productSearch) return list;
    return list.filter((p: any) =>
      p.name?.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.sku?.toLowerCase().includes(productSearch.toLowerCase())
    );
  }, [itemsQuery.data, productSearch]);

  // Calculations
  const totals = useMemo(() => {
    const totalAmount = cart.reduce((sum, item) => sum + item.quantity * item.rate, 0);
    const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);
    return { totalAmount, totalQty };
  }, [cart]);

  const handleSelectCustomer = (customer: any) => {
    setSelectedCustomer(customer);
    setCustomerPickerVisible(false);
  };

  const handleAddProduct = (product: any) => {
    const exists = cart.find((item) => item.id === product.id);
    if (exists) {
      Alert.alert("Already Added", `${product.name} is already in the cart.`);
      return;
    }

    setCart([
      ...cart,
      {
        id: product.id,
        name: product.name,
        sku: product.sku || "",
        unit: product.unit || "pcs",
        mrp: Number(product.mrp || 0),
        minimumPrice: Number(product.minimumPrice || 0),
        defaultSellingPrice: Number(product.defaultSellingPrice || 0),
        quantity: 1,
        rate: Number(product.defaultSellingPrice || 0),
      },
    ]);
    setProductPickerVisible(false);
  };

  const handleUpdateQty = (id: string, qtyStr: string) => {
    const num = Number(qtyStr);
    if (isNaN(num) || num <= 0) return;
    setCart(cart.map((item) => (item.id === id ? { ...item, quantity: num } : item)));
  };

  const handleUpdateRate = (id: string, rateStr: string) => {
    const num = Number(rateStr);
    if (isNaN(num)) return;
    setCart(cart.map((item) => (item.id === id ? { ...item, rate: num } : item)));
  };

  const handleRemoveProduct = (id: string) => {
    setCart(cart.filter((item) => item.id !== id));
  };

  const handleSave = () => {
    if (!selectedCustomer) {
      Alert.alert("Validation Error", "Please select a customer.");
      return;
    }

    if (cart.length === 0) {
      Alert.alert("Validation Error", "Please add at least one item to the cart.");
      return;
    }

    // Verify pricing rules for STAFF
    if (isStaff) {
      for (const item of cart) {
        if (item.rate < item.minimumPrice) {
          Alert.alert(
            "Pricing Error",
            `${item.name} rate (${money(item.rate)}) is below its minimum price (${money(item.minimumPrice)}). Staff cannot sell below minimum price.`
          );
          return;
        }
      }
    }

    // Prepare expected payment date
    let parsedDate: Date | undefined = undefined;
    if (expectedPaymentDate) {
      const dateVal = Date.parse(expectedPaymentDate);
      if (isNaN(dateVal)) {
        Alert.alert("Validation Error", "Please enter expected date in YYYY-MM-DD format.");
        return;
      }
      parsedDate = new Date(dateVal);
    }

    createMutation.mutate(
      {
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerPhone: selectedCustomer.phone ?? undefined,
        customerAddress: selectedCustomer.address ?? undefined,
        expectedPaymentDate: parsedDate,
        items: cart.map((item) => ({
          itemId: item.id,
          quantity: item.quantity,
          rate: item.rate,
        })),
        payments: [], // Direct DM creates in outstanding, payments can be accepted later
      },
      {
        onSuccess: () => {
          Alert.alert("Success", "Delivery Memo created successfully!");
          goBack();
        },
        onError: (err: any) => {
          Alert.alert("API Error", err?.message || "Failed to create Delivery Memo.");
        },
      }
    );
  };

  return (
    <>
      <FormScreen
        title="Create Memo"
        subtitle="Draft direct customer delivery memo."
        showBack
        footer={
          <StickyFooterActions
            primary={{
              label: "Generate Delivery Memo",
              onPress: handleSave,
              loading: createMutation.isPending,
              disabled: createMutation.isPending || cart.length === 0,
              haptic: "medium",
            }}
          />
        }
      >
        {/* Step 1: Customer Selection */}
        <ScreenSection title="Customer Details" card>
          {selectedCustomer ? (
            <View style={styles.selectedRow}>
              <View style={styles.infoCol}>
                <Text style={styles.selectedName}>{selectedCustomer.name}</Text>
                {selectedCustomer.phone && <Text style={styles.selectedPhone}>{selectedCustomer.phone}</Text>}
              </View>
              <Button
                mode="text"
                compact
                onPress={() => setCustomerPickerVisible(true)}
                textColor={colors.primary}
              >
                Change
              </Button>
            </View>
          ) : (
            <Button
              mode="outlined"
              icon="account-search-outline"
              style={styles.pickerBtn}
              onPress={() => setCustomerPickerVisible(true)}
            >
              Pick Customer
            </Button>
          )}
        </ScreenSection>

        {/* Step 2: Item List */}
        <ScreenSection
          title="Items & Pricing"
          card
          action={
            <Button mode="text" compact icon="plus" onPress={() => setProductPickerVisible(true)}>
              Add Item
            </Button>
          }
        >
          {cart.length > 0 ? (
            <View style={styles.cartList}>
              {cart.map((item) => {
                const subtotal = item.quantity * item.rate;
                const isBelowMin = item.rate < item.minimumPrice;

                return (
                  <View key={item.id} style={styles.cartItem}>
                    <View style={styles.cartItemHeader}>
                      <View style={styles.flex1}>
                        <Text style={styles.cartItemName}>{item.name}</Text>
                        <Text style={styles.cartItemSku}>{item.sku || "No SKU"} • Min: {money(item.minimumPrice)}</Text>
                      </View>
                      <Pressable onPress={() => handleRemoveProduct(item.id)} hitSlop={8}>
                        <Icon source="delete-outline" size={20} color={colors.danger} />
                      </Pressable>
                    </View>

                    <View style={styles.inputsRow}>
                      <View style={[styles.flex1, styles.inputCol]}>
                        <Text style={styles.inputLabel}>Qty ({item.unit})</Text>
                        <TextInput
                          mode="flat"
                          dense
                          keyboardType="numeric"
                          value={String(item.quantity)}
                          onChangeText={(val) => handleUpdateQty(item.id, val)}
                          style={styles.textInputDense}
                          activeUnderlineColor={colors.primary}
                        />
                      </View>
                      <View style={[styles.flex1, styles.inputCol]}>
                        <Text style={styles.inputLabel}>Rate (₹)</Text>
                        <TextInput
                          mode="flat"
                          dense
                          keyboardType="numeric"
                          value={String(item.rate)}
                          onChangeText={(val) => handleUpdateRate(item.id, val)}
                          style={[styles.textInputDense, isBelowMin && styles.inputError]}
                          activeUnderlineColor={isBelowMin ? colors.danger : colors.primary}
                        />
                      </View>
                      <View style={styles.itemSubtotalCol}>
                        <Text style={styles.subtotalLabel}>Line Total</Text>
                        <Text style={styles.subtotalValue}>{money(subtotal)}</Text>
                      </View>
                    </View>

                    {isBelowMin && (
                      <View style={styles.priceWarningBadge}>
                        <Icon source="alert-circle-outline" size={14} color={isStaff ? colors.danger : colors.warning} />
                        <Text style={[styles.priceWarningText, { color: isStaff ? colors.danger : colors.warning }]}>
                          {isStaff
                            ? "Rate below minimum! Staff cannot save."
                            : "Below minimum price. Owner approval overridden."}
                        </Text>
                      </View>
                    )}
                    <Divider style={styles.divider} />
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyCart}>
              <Icon source="basket-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyCartText}>Cart is empty. Add products to generate memo.</Text>
            </View>
          )}
        </ScreenSection>

        {/* Step 3: Terms & Dates */}
        <ScreenSection title="Memo Conditions" card>
          <FormTextField
            label="Expected Payment Date (YYYY-MM-DD)"
            placeholder="e.g. 2026-07-15"
            value={expectedPaymentDate}
            onChangeText={setExpectedPaymentDate}
          />
        </ScreenSection>

        {/* Checkout Summary Card */}
        {cart.length > 0 && (
          <Card style={[styles.card, styles.summaryCard]}>
            <Card.Content style={styles.cardContent}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total Items Selected</Text>
                <Text style={styles.summaryValue}>{totals.totalQty} Units</Text>
              </View>
              <Divider style={{ marginVertical: spacing.sm, backgroundColor: "rgba(255, 255, 255, 0.15)" }} />
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, styles.grandLabel]}>Grand Total</Text>
                <Text style={[styles.summaryValue, styles.grandValue]}>{money(totals.totalAmount)}</Text>
              </View>
            </Card.Content>
          </Card>
        )}
      </FormScreen>

      {/* Customer Picker Dialog */}
      <Portal>
        <Dialog
          visible={customerPickerVisible}
          onDismiss={() => setCustomerPickerVisible(false)}
          style={styles.dialog}
        >
          <Dialog.Title style={styles.dialogTitle}>Select Customer</Dialog.Title>
          <Dialog.Content style={styles.dialogContent}>
            <SearchablePicker query={customerSearch} onQueryChange={setCustomerSearch}>
              {customersQuery.isLoading ? (
                <ActivityIndicator style={{ marginVertical: spacing.lg }} />
              ) : (
                filteredCustomers.map((cust: any) => (
                  <List.Item
                    key={cust.id}
                    title={cust.name}
                    description={cust.phone || "No phone listed"}
                    left={(props) => <List.Icon {...props} icon="account-outline" />}
                    onPress={() => handleSelectCustomer(cust)}
                    style={styles.listItem}
                  />
                ))
              )}
            </SearchablePicker>
          </Dialog.Content>
        </Dialog>

        {/* Product Picker Dialog */}
        <Dialog
          visible={productPickerVisible}
          onDismiss={() => setProductPickerVisible(false)}
          style={styles.dialog}
        >
          <Dialog.Title style={styles.dialogTitle}>Select Product</Dialog.Title>
          <Dialog.Content style={styles.dialogContent}>
            <SearchablePicker query={productSearch} onQueryChange={setProductSearch}>
              {itemsQuery.isLoading ? (
                <ActivityIndicator style={{ marginVertical: spacing.lg }} />
              ) : (
                filteredProducts.map((prod: any) => (
                  <List.Item
                    key={prod.id}
                    title={prod.name}
                    description={`${prod.sku || "No SKU"} • Min: ${money(prod.minimumPrice)}`}
                    right={() => <Text style={styles.listPrice}>{money(prod.defaultSellingPrice)}</Text>}
                    onPress={() => handleAddProduct(prod)}
                    style={styles.listItem}
                  />
                ))
              )}
            </SearchablePicker>
          </Dialog.Content>
        </Dialog>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
    elevation: 2,
  },
  cardContent: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  pickerBtn: {
    borderColor: colors.primary,
    borderRadius: radius.lg,
  },
  selectedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  infoCol: {
    flex: 1,
    gap: 2,
  },
  selectedName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  selectedPhone: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
  },
  cartList: {
    marginTop: spacing.sm,
  },
  cartItem: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  cartItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cartItemName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  cartItemSku: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
  },
  inputsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.md,
  },
  inputCol: {
    gap: 4,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: fontWeight.extrabold,
    color: colors.textMuted,
  },
  textInputDense: {
    height: 40,
    backgroundColor: colors.surfaceOffset,
    fontSize: 13,
  },
  inputError: {
    backgroundColor: "rgba(220, 38, 38, 0.04)",
  },
  itemSubtotalCol: {
    alignItems: "flex-end",
    gap: 4,
    minWidth: 80,
  },
  subtotalLabel: {
    fontSize: 10,
    fontWeight: fontWeight.extrabold,
    color: colors.textMuted,
  },
  subtotalValue: {
    fontSize: 14,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    height: 40,
    lineHeight: 40,
  },
  priceWarningBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  priceWarningText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
  },
  divider: {
    marginVertical: spacing.md,
    backgroundColor: colors.border,
  },
  emptyCart: {
    padding: spacing.huge,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  emptyCartText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: "center",
    fontWeight: fontWeight.semibold,
  },
  summaryCard: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: fontSize.xs,
    color: "rgba(255, 255, 255, 0.8)",
    fontWeight: fontWeight.bold,
  },
  summaryValue: {
    fontSize: fontSize.sm,
    color: "#ffffff",
    fontWeight: fontWeight.black,
  },
  grandLabel: {
    fontSize: fontSize.sm,
    color: "#ffffff",
    fontWeight: fontWeight.extrabold,
  },
  grandValue: {
    fontSize: fontSize.lg,
    color: "#ffffff",
    fontWeight: fontWeight.black,
  },
  dialog: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    maxHeight: "80%",
  },
  dialogTitle: {
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  dialogContent: {
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  listItem: {
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listPrice: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    alignSelf: "center",
  },
  flex1: {
    flex: 1,
  },
});
