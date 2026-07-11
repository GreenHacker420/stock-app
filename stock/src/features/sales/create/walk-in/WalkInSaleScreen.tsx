import { useMemo, useState, useCallback, useEffect } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { AppHeader } from "../../../../components/ui/AppHeader";
import { Screen } from "../../../../components/Screen";
import { useNavigation } from "@react-navigation/native";
import { useShopStore } from "../../../../auth/shop-store";
import { useAuthStore } from "../../../../auth/auth-store";
import { useNetworkStatus } from "../../../../hooks/useNetworkStatus";
import { useShopsQuery } from "../../../../hooks/useShops";
import { useItemsQuery } from "../../../../hooks/useItems";
import { useCustomersQuery } from "../../../../hooks/useCustomers";
import { useCreateSaleMutation } from "../../../../hooks/useSales";
import { useSaleDraft } from "../core/useSaleDraft";
import { requireActiveShopId } from "../../../../hooks/useActiveShop";
import {
  adaptItemToSnapshot,
  fromMinorUnits,
  toMinorUnits,
  getSettlementPaidMinor,
  getSettlementCreditMinor,
} from "../core/sale-calculations";
import { createSaleFingerprint } from "../core/sale-fingerprint";
import { buildSalePayload } from "../core/sale-payload";
import { adaptSaleToInvoice } from "../core/sale-invoice-adapter";
import { shareSaleInvoicePdf, printSaleInvoiceDirect } from "../../../../utils/pdf";
import { triggerLightHaptic } from "../../../../utils/haptics";
import { fetchItems, type Customer, type Item } from "../../../../api/client";

// Import Shared Components
import { CustomerSelector } from "../components/CustomerSelector";
import { SaleCartLine } from "../components/SaleCartLine";
import { SaleProductRow } from "../components/SaleProductRow";
import { SaleProductPicker } from "../components/SaleProductPicker";
import { SaleStickyFooter } from "../components/SaleStickyFooter";
import { SaleSuccessView } from "../components/SaleSuccessView";
import { WalkInCheckoutSheet } from "./WalkInCheckoutSheet";
import { SerialNumberScannerModal } from "../../../../components/items/SerialNumberScannerModal";
import { ProductSkuScannerModal } from "../../../../components/items/ProductSkuScannerModal";
import { Text } from "react-native-paper";
import { colors, spacing, fontSize, fontWeight, radius, shadow } from "../../../../theme";

const internetRequiredMessage = "Internet connection required. Please connect to the internet to complete this action.";

export function WalkInSaleScreen() {
  const navigation = useNavigation<any>();
  const { activeShopId } = useShopStore();
  const [draftShopId, setDraftShopId] = useState(() => requireActiveShopId(activeShopId));
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const network = useNetworkStatus();

  const shopsQuery = useShopsQuery();
  const draftShop = useMemo(() =>
    shopsQuery.data?.find((s: any) => s.id === draftShopId),
    [shopsQuery.data, draftShopId]
  );

  // Steps: 1 = Picker/Cart, 2 = Settle (bottom sheet opens, step remains 1 visually), 3 = Success
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [footerHeight, setFooterHeight] = useState(85);

  const [search, setSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMode, setPaymentMode] = useState<"CASH" | "UPI">("CASH");
  const [amountReceived, setAmountReceived] = useState("");
  const [notes, setNotes] = useState("");
  const [upiConfirmedFingerprint, setUpiConfirmedFingerprint] = useState<string | null>(null);
  const [skuScannerVisible, setSkuScannerVisible] = useState(false);
  const [activeSerialScanItemId, setActiveSerialScanItemId] = useState<string | null>(null);

  const [completedSaleNumber, setCompletedSaleNumber] = useState<string | null>(null);
  const [completedSaleSnapshot, setCompletedSaleSnapshot] = useState<{
    completedSale: any;
    submittedDraft: any;
  } | null>(null);

  const [isPrinting, setIsPrinting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  // useSaleDraft Hook
  const { draft, dispatch, totalMinor, validation } = useSaleDraft({
    mode: "WALK_IN",
    shopId: draftShopId,
  });

  // Sync draftShopId to useSaleDraft reducer
  useEffect(() => {
    dispatch({ type: "RESET_DRAFT", shopId: draftShopId });
  }, [draftShopId, dispatch]);

  // Sync customer state to draft
  useEffect(() => {
    if (customerId && selectedCustomer) {
      dispatch({
        type: "SET_CUSTOMER",
        customer: {
          kind: "EXISTING",
          customer: {
            id: selectedCustomer.id,
            name: selectedCustomer.name,
            phone: selectedCustomer.phone,
            address: selectedCustomer.address,
            gstin: selectedCustomer.gstin,
          },
        },
      });
    } else if (customerName.trim() || customerPhone.trim()) {
      dispatch({
        type: "SET_CUSTOMER",
        customer: {
          kind: "QUICK_WALK_IN",
          name: customerName.trim() || undefined,
          phone: customerPhone.trim() || undefined,
        },
      });
    } else {
      dispatch({
        type: "SET_CUSTOMER",
        customer: { kind: "ANONYMOUS" },
      });
    }
  }, [customerId, selectedCustomer, customerName, customerPhone, dispatch]);

  // Sync notes to draft
  useEffect(() => {
    dispatch({ type: "SET_NOTES", notes });
  }, [notes, dispatch]);

  // Sync settlement to draft
  useEffect(() => {
    if (paymentMode === "UPI") {
      dispatch({
        type: "SET_SETTLEMENT",
        settlement: {
          kind: "WALK_IN_UPI",
          paidMinor: totalMinor,
          upiId: draftShop?.upiId ?? "",
          confirmedFingerprint: upiConfirmedFingerprint,
        },
      });
    } else {
      const paidMinorVal = toMinorUnits(amountReceived);
      dispatch({
        type: "SET_SETTLEMENT",
        settlement: {
          kind: "FULL_PAYMENT",
          mode: "CASH",
          paidMinor: paidMinorVal,
          changeMinor: Math.max(0, paidMinorVal - totalMinor),
        },
      });
    }
  }, [paymentMode, amountReceived, totalMinor, upiConfirmedFingerprint, draftShop?.upiId, dispatch]);

  const itemsQuery = useItemsQuery({
    search,
    limit: 50,
    enabled: !network.isOffline && activeShopId === draftShopId,
  });

  const customersQuery = useCustomersQuery({
    search: customerSearch,
    limit: 10,
    enabled: !network.isOffline,
  });

  const cartTotal = useMemo(() => fromMinorUnits(totalMinor), [totalMinor]);

  const cartArray = useMemo(() => {
    return Object.values(draft.lines).map((line) => {
      const hasCustomRate = line.rateMinor !== line.item.defaultRateMinor;
      return {
        item: line.item,
        quantity: line.quantity,
        customRate: hasCustomRate ? fromMinorUnits(line.rateMinor) : undefined,
        serialNumbers: line.serialNumbers,
      };
    });
  }, [draft.lines]);

  const cartItemCount = useMemo(() => {
    return cartArray.reduce((sum, line) => sum + line.quantity, 0);
  }, [cartArray]);

  const displayItems = useMemo(() => {
    const items = !network.isOffline ? itemsQuery.data?.items ?? [] : [];
    // Sort selected items to the top to preserve easy access, but do not aggressively trigger layout shifts
    return [...items].sort((a, b) => {
      const aSelected = (draft.lines[a.id]?.quantity ?? 0) > 0;
      const bSelected = (draft.lines[b.id]?.quantity ?? 0) > 0;
      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;
      return 0;
    });
  }, [itemsQuery.data, network.isOffline, draft.lines]);

  const hasMissingPrice = useMemo(() => {
    return Object.values(draft.lines).some((line) => line.rateMinor <= 0);
  }, [draft.lines]);

  // UPI proposal fingerprint computation for confirm lock
  const proposedUpiSettlement = useMemo(() => {
    return {
      kind: "WALK_IN_UPI" as const,
      paidMinor: totalMinor,
      upiId: draftShop?.upiId ?? "",
      confirmedFingerprint: null,
    };
  }, [totalMinor, draftShop?.upiId]);

  const proposedDraftForUpi = useMemo(() => {
    return { ...draft, settlement: proposedUpiSettlement };
  }, [draft, proposedUpiSettlement]);

  const upiProposalFingerprint = useMemo(() => {
    return createSaleFingerprint(proposedDraftForUpi);
  }, [proposedDraftForUpi]);

  const handleProductScanned = useCallback(
    async (sku: string) => {
      try {
        let found = displayItems.find((i) => i.sku === sku);
        if (!found) {
          const res = await fetchItems(token ?? "", draftShopId, { search: sku, limit: 1 });
          found = res.items?.find((i) => i.sku === sku || i.name === sku);
        }

        if (found) {
          dispatch({ type: "ADD_QUANTITY", item: adaptItemToSnapshot(found), delta: 1 });
          return { success: true, name: found.name };
        } else {
          return { success: false, name: "", msg: "Product not found" };
        }
      } catch (err: any) {
        return { success: false, name: "", msg: err.message || "Failed to lookup product" };
      }
    },
    [displayItems, token, draftShopId, dispatch]
  );

  const saleMutation = useCreateSaleMutation();

  const handleCompleteSale = () => {
    if (saleMutation.isPending) return;
    if (network.isOffline) {
      Alert.alert("Internet required", internetRequiredMessage);
      return;
    }
    if (activeShopId !== draftShopId) {
      Alert.alert(
        "Shop Changed",
        "This sale was started in another shop. Discard it and start a new sale."
      );
      return;
    }

    if (!validation.isValid) {
      const firstErr = Object.values(validation.errors)[0];
      Alert.alert("Validation Error", firstErr || "Verify sale details.");
      return;
    }

    const payload = buildSalePayload(draft);

    saleMutation.mutate(payload, {
      onSuccess: (res: any) => {
        setCompletedSaleSnapshot({
          completedSale: res,
          submittedDraft: { ...draft },
        });
        setCompletedSaleNumber(res?.saleNumber || "N/A");
        dispatch({ type: "RESET_DRAFT", shopId: requireActiveShopId(activeShopId) });
        setCheckoutVisible(false);
        setCurrentStep(3);
      },
      onError: (error: any) => {
        if (String(error?.message || "").toLowerCase().includes("network")) {
          Alert.alert("Internet required", internetRequiredMessage);
        } else {
          Alert.alert("Failed to Complete Sale", error?.message || "Something went wrong.");
        }
      },
    });
  };

  const invoiceSale = useMemo(() => {
    if (!completedSaleSnapshot) return null;
    return adaptSaleToInvoice(
      completedSaleSnapshot.submittedDraft,
      completedSaleSnapshot.completedSale
    );
  }, [completedSaleSnapshot]);

  const receiptCustomerName = useMemo(() => {
    if (!completedSaleSnapshot) return "Walk-in Customer";
    const draftCust = completedSaleSnapshot.submittedDraft.customer;
    if (draftCust.kind === "EXISTING") return draftCust.customer.name;
    if (draftCust.kind === "QUICK_WALK_IN") return draftCust.name || "Walk-in Customer";
    return "Walk-in Customer";
  }, [completedSaleSnapshot]);

  const receiptCustomerPhone = useMemo(() => {
    if (!completedSaleSnapshot) return null;
    const draftCust = completedSaleSnapshot.submittedDraft.customer;
    if (draftCust.kind === "EXISTING") return draftCust.customer.phone;
    if (draftCust.kind === "QUICK_WALK_IN") return draftCust.phone || null;
    return null;
  }, [completedSaleSnapshot]);

  const receiptPaymentMode = useMemo(() => {
    if (!completedSaleSnapshot) return "CASH";
    const draftSettlement = completedSaleSnapshot.submittedDraft.settlement;
    if (draftSettlement.kind === "WALK_IN_UPI") return "UPI";
    return "CASH";
  }, [completedSaleSnapshot]);

  const handleHeaderBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate(user?.role === "OWNER" ? "OwnerDashboard" : "StaffWork");
    }
  };

  const handlePrint = async () => {
    if (!invoiceSale || isPrinting) return;
    setIsPrinting(true);
    try {
      await printSaleInvoiceDirect({
        sale: invoiceSale,
        shop: draftShop,
      });
    } catch (err) {
      console.warn("Direct print failed", err);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleShare = async () => {
    if (!invoiceSale || isSharing) return;
    setIsSharing(true);
    try {
      await shareSaleInvoicePdf({
        sale: invoiceSale,
        shop: draftShop,
      });
    } catch (err) {
      console.warn("Pdf share failed", err);
    } finally {
      setIsSharing(false);
    }
  };

  const startNewSale = () => {
    setSelectedCustomer(null);
    setCustomerId(null);
    setCustomerSearch("");
    setSearch("");
    setAmountReceived("");
    setNotes("");
    setCustomerName("");
    setCustomerPhone("");
    setUpiConfirmedFingerprint(null);
    setDraftShopId(requireActiveShopId(activeShopId));
    saleMutation.reset();
    setCompletedSaleSnapshot(null);
    setCompletedSaleNumber(null);
    setCurrentStep(1);
  };

  // Header components for list scrolling
  const renderListHeader = () => (
    <View style={styles.listHeader}>
      <CustomerSelector
        mode="WALK_IN"
        customerId={customerId}
        selectedCustomer={selectedCustomer}
        customerSearch={customerSearch}
        setCustomerSearch={setCustomerSearch}
        filteredCustomers={customersQuery.data ?? []}
        isCustomerSearchPending={customersQuery.isFetching}
        canOfferCustomerCreation={
          !customersQuery.isFetching &&
          customerSearch.trim() !== "" &&
          (customersQuery.data ?? []).length === 0
        }
        onSelectCustomer={(c) => {
          setSelectedCustomer(c);
          setCustomerId(c.id);
        }}
        onClearCustomer={() => {
          setSelectedCustomer(null);
          setCustomerId(null);
        }}
        customerName={customerName}
        setCustomerName={setCustomerName}
        customerPhone={customerPhone}
        setCustomerPhone={setCustomerPhone}
        onCreateCustomerPress={() => navigation.navigate("AddEditCustomer")}
        isOffline={network.isOffline}
      />

      {cartItemCount > 0 && (
        <View style={styles.cartSection}>
          <Text style={styles.sectionHeader}>Selected Cart Items</Text>
          <View style={styles.cartBox}>
            {cartArray.map(({ item, quantity, customRate, serialNumbers }) => (
              <SaleCartLine
                key={item.id}
                item={item}
                quantity={quantity}
                customRate={customRate}
                serialNumbers={serialNumbers}
                onScanPress={() => setActiveSerialScanItemId(item.id)}
                onUpdateRate={(rate) => {
                  dispatch({
                    type: "SET_RATE",
                    itemId: item.id,
                    rateMinor: rate !== undefined ? toMinorUnits(rate) : toMinorUnits(item.defaultRateMinor),
                  });
                }}
                onAdjustQuantity={(delta) => {
                  dispatch({ type: "ADD_QUANTITY", item: adaptItemToSnapshot(item), delta });
                }}
                userRole={user?.role}
              />
            ))}
          </View>
        </View>
      )}

      <Text style={styles.sectionHeader}>Select Products Catalog</Text>
    </View>
  );

  if (currentStep === 3 && invoiceSale) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <AppHeader title="Walk-in Sale" subtitle="Receipt Summary" showBack={false} />
        <SaleSuccessView
          invoiceSale={invoiceSale}
          customerName={receiptCustomerName}
          customerPhone={receiptCustomerPhone}
          paymentMode={receiptPaymentMode}
          paidAmount={fromMinorUnits(getSettlementPaidMinor(completedSaleSnapshot?.submittedDraft.settlement))}
          changeAmount={
            completedSaleSnapshot?.submittedDraft.settlement.kind === "FULL_PAYMENT"
              ? fromMinorUnits(completedSaleSnapshot.submittedDraft.settlement.changeMinor)
              : 0
          }
          creditAmount={fromMinorUnits(getSettlementCreditMinor(completedSaleSnapshot?.submittedDraft.settlement))}
          onStartNewSale={startNewSale}
          onViewInvoice={() => {
            navigation.navigate("InvoiceViewer", { sale: invoiceSale, shop: draftShop });
          }}
          onSharePdf={handleShare}
          onPrintDirect={handlePrint}
          isSharing={isSharing}
          isPrinting={isPrinting}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "left", "right"]}>
      <AppHeader title="Walk-in Sale" subtitle="Step 1 of 2 • Cart Details" showBack={true} onBack={handleHeaderBack} />

      <View style={styles.mainContainer}>
        <SaleProductPicker
          data={displayItems}
          renderItem={({ item }: { item: Item }) => (
            <SaleProductRow
              item={adaptItemToSnapshot(item)}
              quantity={draft.lines[item.id]?.quantity ?? 0}
              serialNumbers={draft.lines[item.id]?.serialNumbers}
              onScanPress={() => setActiveSerialScanItemId(item.id)}
              onAdd={() => {
                dispatch({ type: "ADD_QUANTITY", item: adaptItemToSnapshot(item), delta: 1 });
              }}
              onRemove={() => {
                dispatch({ type: "ADD_QUANTITY", item: adaptItemToSnapshot(item), delta: -1 });
              }}
            />
          )}
          search={search}
          setSearch={setSearch}
          onScanPress={() => {
            triggerLightHaptic();
            setSkuScannerVisible(true);
          }}
          isLoading={itemsQuery.isLoading}
          isOffline={network.isOffline}
          ListHeaderComponent={renderListHeader()}
          footerHeight={footerHeight}
          onCreateProductPress={() => navigation.navigate("AddEditItem")}
        />

        <SaleStickyFooter
          count={cartItemCount}
          total={cartTotal}
          onPress={() => setCheckoutVisible(true)}
          disabled={cartItemCount === 0 || hasMissingPrice}
          label="Proceed to Payment →"
          onLayout={setFooterHeight}
        />
      </View>

      {/* Checkout Bottom Sheet */}
      <WalkInCheckoutSheet
        visible={checkoutVisible}
        onClose={() => setCheckoutVisible(false)}
        cartTotal={cartTotal}
        paymentMode={paymentMode}
        onChangePaymentMode={setPaymentMode}
        amountReceived={amountReceived}
        onChangeAmountReceived={setAmountReceived}
        notes={notes}
        onChangeNotes={setNotes}
        upiConfirmedFingerprint={upiConfirmedFingerprint}
        upiProposalFingerprint={upiProposalFingerprint}
        onConfirmUpi={() => setUpiConfirmedFingerprint(upiProposalFingerprint)}
        onCompleteSale={handleCompleteSale}
        isPending={saleMutation.isPending}
        draftShop={draftShop as any}
      />

      {/* Scanners modals */}
      {!!activeSerialScanItemId && !!draft.lines[activeSerialScanItemId] && (
        <SerialNumberScannerModal
          visible={!!activeSerialScanItemId}
          itemName={draft.lines[activeSerialScanItemId].item.name}
          quantity={draft.lines[activeSerialScanItemId].quantity}
          serialNumbers={draft.lines[activeSerialScanItemId].serialNumbers || []}
          onDismiss={() => setActiveSerialScanItemId(null)}
          onSave={(serials) => {
            dispatch({ type: "SET_SERIALS", itemId: activeSerialScanItemId, serialNumbers: serials });
            setActiveSerialScanItemId(null);
          }}
        />
      )}

      {skuScannerVisible && (
        <ProductSkuScannerModal
          visible={skuScannerVisible}
          onDismiss={() => setSkuScannerVisible(false)}
          onProductScanned={handleProductScanned}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    position: "relative",
  },
  listHeader: {
    paddingBottom: spacing.sm,
  },
  cartSection: {
    marginVertical: spacing.sm,
  },
  sectionHeader: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  cartBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadow.sm,
  },
});
