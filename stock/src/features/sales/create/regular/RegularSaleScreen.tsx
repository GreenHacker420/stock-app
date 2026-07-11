import { useMemo, useState, useCallback, useEffect } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  parseMoneyToMinor,
  getSettlementPaidMinor,
  getSettlementCreditMinor,
  createRegularSettlement,
} from "../core/sale-calculations";
import { createSaleFingerprint } from "../core/sale-fingerprint";
import { buildSalePayload } from "../core/sale-payload";
import { adaptSaleToInvoice } from "../core/sale-invoice-adapter";
import { shareSaleInvoicePdf } from "../../../../utils/pdf";
import { triggerLightHaptic } from "../../../../utils/haptics";
import { Screen } from "../../../../components/Screen";
import { AppHeader } from "../../../../components/ui/AppHeader";
import { fetchItems, type Customer, type Item } from "../../../../api/client";

// Import Shared Components
import { CustomerSelector } from "../components/CustomerSelector";
import { SaleProductRow } from "../components/SaleProductRow";
import { SaleProductPicker } from "../components/SaleProductPicker";
import { SaleStickyFooter } from "../components/SaleStickyFooter";
import { SaleStepHeader } from "../components/SaleStepHeader";
import { SaleSuccessView } from "../components/SaleSuccessView";

// Import Flow-Specific Components
import { RegularReviewStep } from "./RegularReviewStep";
import { RegularPaymentStep } from "./RegularPaymentStep";
import { CreditAuthorizationSheet } from "./CreditAuthorizationSheet";

import { SerialNumberScannerModal } from "../../../../components/items/SerialNumberScannerModal";
import { ProductSkuScannerModal } from "../../../../components/items/ProductSkuScannerModal";
import { KeyboardAwareScreen } from "../../../../components/keyboard/KeyboardAwareScreen";
import { colors, spacing } from "../../../../theme";

const internetRequiredMessage = "Internet connection required. Please connect to the internet to complete this action.";

export function RegularSaleScreen() {
  const navigation = useNavigation<any>();
  const { activeShopId } = useShopStore();
  const [draftShopId, setDraftShopId] = useState(() => requireActiveShopId(activeShopId));
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const network = useNetworkStatus();
  const insets = useSafeAreaInsets();

  const shopsQuery = useShopsQuery();
  const draftShop = useMemo(() =>
    shopsQuery.data?.find((s: any) => s.id === draftShopId),
    [shopsQuery.data, draftShopId]
  );

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
  const [footerHeight, setFooterHeight] = useState(85);

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [activeSerialScanItemId, setActiveSerialScanItemId] = useState<string | null>(null);

  const [paymentType, setPaymentType] = useState<"CASH" | "UPI" | "BANK_TRANSFER" | "CREDIT">("CASH");
  const [partialPaymentMode, setPartialPaymentMode] = useState<"CASH" | "UPI">("CASH");
  const [amountPaid, setAmountPaid] = useState("");
  const [notes, setNotes] = useState("");
  const [isGstSale, setIsGstSale] = useState(false);
  const [isSigSheetVisible, setIsSigSheetVisible] = useState(false);
  const [skuScannerVisible, setSkuScannerVisible] = useState(false);

  const [completedSaleSnapshot, setCompletedSaleSnapshot] = useState<{
    completedSale: any;
    submittedDraft: any;
  } | null>(null);

  const [isSharing, setIsSharing] = useState(false);

  const customersQuery = useCustomersQuery({
    search: customerSearch,
    limit: 10,
    enabled: !network.isOffline,
  });

  const itemsQuery = useItemsQuery({
    search: itemSearch,
    limit: 50,
    enabled: !network.isOffline && activeShopId === draftShopId,
  });

  // useSaleDraft Hook
  const { draft, dispatch, totalMinor, validation } = useSaleDraft({
    mode: "REGULAR",
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
    } else {
      dispatch({
        type: "SET_CUSTOMER",
        customer: { kind: "ANONYMOUS" },
      });
    }
  }, [customerId, selectedCustomer, dispatch]);

  // Sync notes to draft
  useEffect(() => {
    dispatch({ type: "SET_NOTES", notes });
  }, [notes, dispatch]);

  // Sync GST to draft
  useEffect(() => {
    dispatch({ type: "SET_GST", required: isGstSale });
  }, [isGstSale, dispatch]);

  // Settlement error & sync
  const [settlementError, setSettlementError] = useState<string | null>(null);

  useEffect(() => {
    const paidMinor = parseMoneyToMinor(amountPaid);

    if (paidMinor === null) {
      setSettlementError(null);
      dispatch({ type: "SET_SETTLEMENT", settlement: { kind: "UNSETTLED" } });
      return;
    }

    const result = createRegularSettlement(
      paymentType,
      totalMinor,
      paidMinor,
      partialPaymentMode
    );

    if (result.ok) {
      setSettlementError(null);
      dispatch({ type: "SET_SETTLEMENT", settlement: result.settlement });
    } else {
      setSettlementError(result.error);
      dispatch({ type: "SET_SETTLEMENT", settlement: { kind: "UNSETTLED" } });
    }
  }, [paymentType, partialPaymentMode, amountPaid, totalMinor, dispatch]);

  // Derive display values from reducer
  const creditMinorFromDraft = getSettlementCreditMinor(draft.settlement);
  const paidMinorFromDraft = getSettlementPaidMinor(draft.settlement);
  const balance = fromMinorUnits(creditMinorFromDraft);
  const isCredit = creditMinorFromDraft > 0;

  const isCreditAuthorizationCurrent = Boolean(
    draft.creditAuthorization &&
      draft.creditAuthorization.transactionFingerprint === createSaleFingerprint(draft)
  );

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

  const isSerialsComplete = useMemo(() => !validation.errors.serialNumbers, [validation.errors.serialNumbers]);

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
        dispatch({ type: "RESET_DRAFT", shopId: requireActiveShopId(activeShopId) });
        setCurrentStep(4);
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
    if (!completedSaleSnapshot) return "Customer";
    const draftCust = completedSaleSnapshot.submittedDraft.customer;
    if (draftCust.kind === "EXISTING") return draftCust.customer.name;
    return "Customer";
  }, [completedSaleSnapshot]);

  const receiptPaymentMode = useMemo(() => {
    if (!completedSaleSnapshot) return "CASH";
    const draftSettlement = completedSaleSnapshot.submittedDraft.settlement;
    if (draftSettlement.kind === "FULL_CREDIT") return "CREDIT";
    if (draftSettlement.kind === "PARTIAL_CREDIT") return `CREDIT (+ ${draftSettlement.upfrontMode})`;
    if (draftSettlement.kind === "FULL_PAYMENT") return draftSettlement.mode;
    return "CASH";
  }, [completedSaleSnapshot]);

  const handleHeaderBack = () => {
    if (currentStep === 2) {
      setCurrentStep(1);
    } else if (currentStep === 3) {
      setCurrentStep(2);
    } else {
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate(user?.role === "OWNER" ? "OwnerDashboard" : "StaffWork");
      }
    }
  };

  const startNewSale = () => {
    setSelectedCustomer(null);
    setCustomerId(null);
    setCustomerSearch("");
    setItemSearch("");
    setAmountPaid("");
    setNotes("");
    setDraftShopId(requireActiveShopId(activeShopId));
    setIsGstSale(false);
    saleMutation.reset();
    setCompletedSaleSnapshot(null);
    setCurrentStep(1);
  };

  const handleFooterPress = () => {
    if (currentStep === 1) {
      setCurrentStep(2);
    } else if (currentStep === 2) {
      setCurrentStep(3);
    } else if (currentStep === 3) {
      handleCompleteSale();
    }
  };

  const getFooterLabel = () => {
    if (currentStep === 1) return "Proceed to Review →";
    if (currentStep === 2) return "Proceed to Payment →";
    return "Complete Sale ✓";
  };

  const isFooterDisabled = () => {
    if (currentStep === 1) {
      return !customerId || cartItemCount === 0;
    }
    if (currentStep === 2) {
      return !isSerialsComplete || hasMissingPrice;
    }
    return !validation.isValid;
  };

  const renderPickerHeader = () => (
    <CustomerSelector
      mode="REGULAR"
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
      onCreateCustomerPress={() => navigation.navigate("AddEditCustomer")}
    />
  );

  if (currentStep === 4 && invoiceSale) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <AppHeader title="Regular Sale" subtitle="Receipt Summary" showBack={false} />
        <SaleSuccessView
          invoiceSale={invoiceSale}
          customerName={receiptCustomerName}
          customerPhone={null}
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
          onSharePdf={async () => {
            setIsSharing(true);
            try {
              await shareSaleInvoicePdf({
                sale: invoiceSale,
                shop: draftShop,
              });
            } finally {
              setIsSharing(false);
            }
          }}
          isSharing={isSharing}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "left", "right"]}>
      <SaleStepHeader step={currentStep} onBack={handleHeaderBack} />

      <View style={styles.mainContainer}>
        {currentStep === 1 && (
          <SaleProductPicker
            data={displayItems}
            renderItem={({ item }: { item: Item }) => (
              <SaleProductRow
                item={adaptItemToSnapshot(item)}
                quantity={draft.lines[item.id]?.quantity ?? 0}
                onAdd={() => {
                  dispatch({ type: "ADD_QUANTITY", item: adaptItemToSnapshot(item), delta: 1 });
                }}
                onRemove={() => {
                  dispatch({ type: "ADD_QUANTITY", item: adaptItemToSnapshot(item), delta: -1 });
                }}
              />
            )}
            search={itemSearch}
            setSearch={setItemSearch}
            onScanPress={() => {
              triggerLightHaptic();
              setSkuScannerVisible(true);
            }}
            isLoading={itemsQuery.isLoading}
            isOffline={network.isOffline}
            ListHeaderComponent={renderPickerHeader()}
            footerHeight={footerHeight}
            onCreateProductPress={() => navigation.navigate("AddEditItem")}
          />
        )}

        {currentStep === 2 && (
          <KeyboardAwareScreen
            style={styles.keyboardScreen}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: footerHeight + 10 }]}
            bottomOffset={footerHeight}
          >
            <RegularReviewStep
              cartArray={cartArray}
              cartTotal={cartTotal}
              isGstSale={isGstSale}
              onChangeGstSale={setIsGstSale}
              notes={notes}
              onChangeNotes={setNotes}
              onScanPress={setActiveSerialScanItemId}
              onUpdateRate={(itemId, rate) => {
                const line = draft.lines[itemId];
                if (line) {
                  dispatch({
                    type: "SET_RATE",
                    itemId,
                    rateMinor: rate !== undefined ? toMinorUnits(rate) : toMinorUnits(line.item.defaultRateMinor),
                  });
                }
              }}
              onAdjustQuantity={(itemId, delta) => {
                const line = draft.lines[itemId];
                if (line) {
                  dispatch({ type: "ADD_QUANTITY", item: line.item, delta });
                }
              }}
              userRole={user?.role}
            />
          </KeyboardAwareScreen>
        )}

        {currentStep === 3 && (
          <KeyboardAwareScreen
            style={styles.keyboardScreen}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: footerHeight + 10 }]}
            bottomOffset={footerHeight}
          >
            <RegularPaymentStep
              paymentType={paymentType}
              onSelectPaymentType={setPaymentType}
              amountPaid={amountPaid}
              onChangeAmountPaid={setAmountPaid}
              cartTotal={cartTotal}
              partialPaymentMode={partialPaymentMode}
              onChangePartialPaymentMode={setPartialPaymentMode}
              balance={balance}
              isCredit={isCredit}
              isCreditAuthorizationCurrent={isCreditAuthorizationCurrent}
              onDrawSignaturePress={() => setIsSigSheetVisible(true)}
              draftShop={draftShop as any}
              settlementError={settlementError}
            />
          </KeyboardAwareScreen>
        )}

        <SaleStickyFooter
          count={cartItemCount}
          total={cartTotal}
          onPress={handleFooterPress}
          disabled={isFooterDisabled()}
          loading={saleMutation.isPending}
          label={getFooterLabel()}
          onLayout={setFooterHeight}
        />
      </View>

      {/* Credit Signature Drawing bottom sheet */}
      <CreditAuthorizationSheet
        visible={isSigSheetVisible}
        onClose={() => setIsSigSheetVisible(false)}
        balance={balance}
        initialSignature={
          isCreditAuthorizationCurrent ? draft.creditAuthorization?.signatureBase64 : undefined
        }
        onSaveSignature={(signature) => {
          const fingerprint = createSaleFingerprint(draft);
          dispatch({
            type: "AUTHORIZE_CREDIT",
            authorization: {
              signatureBase64: signature,
              customerId: customerId || "",
              transactionFingerprint: fingerprint,
              totalMinor,
              paidMinor: paidMinorFromDraft,
              creditMinor: creditMinorFromDraft,
              capturedAt: new Date().toISOString(),
            },
          });
        }}
      />

      {/* Scanner Modals */}
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
  keyboardScreen: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
  },
});
