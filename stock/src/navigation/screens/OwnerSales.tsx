import { useMemo, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Alert, Modal as RNModal } from "react-native";
import { Divider, Text, Icon, Portal, Modal, Switch, TextInput as PaperTextInput } from "react-native-paper";
import { useAuthStore } from "../../auth/auth-store";
import { FlashList } from "@shopify/flash-list";
import { useDebounce } from "use-debounce";
import { useRoute, useNavigation } from "@react-navigation/native";
import Svg, { Path } from "react-native-svg";
import { useSalesQuery, useSaleQuery, useAmendSaleMutation, useIssueInvoiceMutation, useCancelInvoiceMutation, useUpdateSaleMutation } from "../../hooks/useSales";
import { useItemsQuery } from "../../hooks/useItems";
import { usePaymentsQuery, useAttachPaymentMutation } from "../../hooks/usePayments";
import { type Sale } from "../../api/client";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { AppSearchBar } from "../../components/ui/AppSearchBar";
import { AppSegmentedControl } from "../../components/ui/AppSegmentedControl";
import { StatusPill } from "../../components/ui/StatusPill";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { Section } from "../../components/ui/Section";
import { SaleCard } from "../../components/domain/sales/SaleCard";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { navigate } from "../navigation-ref";
import { useShopStore } from "../../auth/shop-store";
import { useShopsQuery } from "../../hooks/useShops";
import { shareSaleInvoicePdf } from "../../utils/pdf";

const money = (value?: string | number | null) => `₹${Number(value ?? 0).toLocaleString("en-IN")}`;

const getSignatureViewBox = (paths: string[]): string => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  paths.forEach(path => {
    const matches = path.match(/[-+]?[0-9]*\.?[0-9]+/g);
    if (matches) {
      for (let i = 0; i < matches.length; i += 2) {
        const x = parseFloat(matches[i]);
        const y = parseFloat(matches[i+1]);
        if (!isNaN(x) && !isNaN(y)) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
  });
  if (minX === Infinity || minY === Infinity || maxX === -Infinity || maxY === -Infinity) {
    return "0 0 300 150";
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const padding = 10;
  return `${minX - padding} ${minY - padding} ${width + padding * 2} ${height + padding * 2}`;
};

export function SalesList() {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const route = useRoute<any>();
  const initialFilter = route.params?.filter || "ALL"; // ALL, PAID, PENDING, PARTIAL
  const [activeTab, setActiveTab] = useState(initialFilter);

  const salesQuery = useSalesQuery();
  const allSales = salesQuery.data ?? [];

  const filteredSales = useMemo(() => {
    let data = allSales;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      data = data.filter(s =>
        s.saleNumber.toLowerCase().includes(q) ||
        (s.customer?.name || "").toLowerCase().includes(q)
      );
    }
    if (activeTab === "ALL") return data;
    if (activeTab === "gst_pending") return data.filter(s => (s.isGstRequired || s.gstRequired) && !s.gstInvoiceNumber);
    if (activeTab === "PENDING") {
      return data.filter(s => s.paymentStatus !== "PAID");
    }
    return data.filter(s => s.paymentStatus === activeTab);
  }, [allSales, activeTab, debouncedSearch]);

  const List = FlashList as any;

  return (
    <Screen scroll={false} edges={['top', 'left', 'right']}>
      <AppHeader title="Sales History" subtitle="Monitor revenue and collections" />

      <View style={styles.container}>
        <AppSearchBar
          placeholder="Search invoice or customer"
          onChangeText={setSearch}
          value={search}
          style={styles.searchBar}
          inputStyle={styles.searchInput}
        />

        <AppSegmentedControl
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { value: "ALL", label: "All" },
            { value: "PAID", label: "Paid" },
            { value: "PENDING", label: "Due" },
            { value: "gst_pending", label: "GST" },
          ]}
          style={styles.tabs}
        />

        <View style={styles.listWrapper}>
          {salesQuery.isLoading ? (
            <SkeletonList count={6} itemHeight={100} />
          ) : (
            <List
              data={filteredSales}
              keyExtractor={(item: Sale) => item.id}
              renderItem={({ item }: { item: Sale & { staff?: { name: string } | null } }) => (
                <SaleCard
                  saleNumber={item.saleNumber}
                  customerName={item.isWalkin ? "Walk-in Customer" : item.customer?.name}
                  subtitle={`Billed by: ${item.staff?.name || "System"}`}
                  amount={money(item.totalAmount)}
                  paymentStatus={item.paymentStatus || "PENDING"}
                  statusTone={item.paymentStatus === "PAID" ? "green" : "amber"}
                  date={new Date(item.createdAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                  onPress={() => navigate("SaleDetail", { id: item.id })}
                />
              )}
              ListEmptyComponent={<EmptyState icon="receipt" title="No sales found" />}
              contentContainerStyle={styles.listContent}
            />
          )}
        </View>
      </View>
    </Screen>
  );
}

export function SaleDetail() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const saleId = route.params?.id;

  const user = useAuthStore((state) => state.user);
  const { activeShopId } = useShopStore();
  const shopsQuery = useShopsQuery();
  const activeShop = useMemo(() =>
    shopsQuery.data?.find(s => s.id === activeShopId),
    [shopsQuery.data, activeShopId]
  );

  const saleQuery = useSaleQuery(saleId);
  const sale = saleQuery.data as (Sale & { staff?: { name: string } | null }) | undefined;

  const unlinkedPaymentsQuery = usePaymentsQuery(activeShopId || undefined, {
    customerId: sale?.customerId ? (sale.customerId as string) : undefined,
    unlinked: true,
  });

  const attachPaymentMutation = useAttachPaymentMutation();

  const [sharing, setSharing] = useState(false);

  // GST Invoice Mutations
  const issueInvoiceMutation = useIssueInvoiceMutation();
  const cancelInvoiceMutation = useCancelInvoiceMutation();
  const updateSaleMutation = useUpdateSaleMutation();

  const [isInvoiceModalVisible, setIsInvoiceModalVisible] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");

  const [isGstModalVisible, setIsGstModalVisible] = useState(false);
  const [editGstRequired, setEditGstRequired] = useState(false);
  const [editGstInvoiceNumber, setEditGstInvoiceNumber] = useState("");

  const [selectedItemDetails, setSelectedItemDetails] = useState<any | null>(null);

  const handleOpenGstModal = () => {
    if (!sale) return;
    setEditGstRequired(sale.isGstRequired || sale.gstRequired || false);
    setEditGstInvoiceNumber(sale.gstInvoiceNumber || "");
    setIsGstModalVisible(true);
  };

  const handleSaveGstDetails = () => {
    if (!sale) return;
    updateSaleMutation.mutate({
      saleId: sale.id,
      data: {
        gstRequired: editGstRequired,
        gstInvoiceNumber: editGstRequired ? (editGstInvoiceNumber.trim() || null) : null
      }
    }, {
      onSuccess: () => {
        setIsGstModalVisible(false);
        Alert.alert("Success", "GST details updated successfully!");
      },
      onError: (err: any) => {
        Alert.alert("Error", err.message || "Failed to update GST details");
      }
    });
  };

  const handleOpenIssueInvoice = () => {
    setInvoiceNumber("");
    setIsInvoiceModalVisible(true);
  };

  const handleConfirmIssueInvoice = () => {
    if (!sale) return;
    if (!invoiceNumber.trim()) {
      Alert.alert("Error", "Please enter a valid invoice number");
      return;
    }
    issueInvoiceMutation.mutate({
      saleId: sale.id,
      data: { invoiceNumber: invoiceNumber.trim() }
    }, {
      onSuccess: () => {
        setIsInvoiceModalVisible(false);
        Alert.alert("Success", "GST Invoice issued successfully!");
      },
      onError: (err: any) => {
        Alert.alert("Error", err.message || "Failed to issue invoice");
      }
    });
  };

  const handleCancelInvoice = () => {
    if (!sale || !sale.gstInvoiceNumber) return;
    Alert.alert(
      "Cancel GST Invoice",
      `Are you sure you want to cancel the invoice #${sale.gstInvoiceNumber}?`,
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: () => {
            cancelInvoiceMutation.mutate({
              saleId: sale.id
            }, {
              onSuccess: () => {
                Alert.alert("Success", "GST Invoice cancelled.");
              },
              onError: (err: any) => {
                Alert.alert("Error", err.message || "Failed to cancel invoice");
              }
            });
          }
        }
      ]
    );
  };

  if (saleQuery.isLoading) return <SkeletonList count={5} />;
  if (!sale) return <EmptyState title="Sale not found" />;

  const handleSharePdf = async () => {
    setSharing(true);
    await shareSaleInvoicePdf({
      sale: sale,
      shop: activeShop,
    });
    setSharing(false);
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title={`Sale #${sale.saleNumber}`} subtitle="Transaction Details" showBack />

      <ScrollView contentContainerStyle={styles.detailScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.detailCard}>
          <View style={styles.detailRow}>
            <View style={styles.flex1}>
              <Text style={styles.customerNameBig}>{sale.isWalkin ? "Walk-in Customer" : sale.customer?.name}</Text>
              <Text style={styles.dateText}>
                Date: {new Date(sale.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
              </Text>
              <Text style={styles.billedByText}>Billed by: <Text style={styles.boldText}>{sale.staff?.name || "System"}</Text></Text>
            </View>
            <StatusPill label={sale.paymentStatus || "PENDING"} tone={sale.paymentStatus === 'PAID' ? 'green' : 'amber'} />
          </View>

          <Divider style={styles.detailDivider} />

          <View style={styles.amountBox}>
            <Text style={styles.amountLabel}>Total Sale Value</Text>
            <Text style={styles.amountValue}>{money(sale.totalAmount)}</Text>
          </View>

          <View style={styles.gstBox}>
            <Icon 
              source={sale.isGstRequired ? (sale.gstInvoiceNumber ? "file-check-outline" : "file-percent-outline") : "file-percent-outline"} 
              size={20} 
              color={sale.isGstRequired ? (sale.gstInvoiceNumber ? colors.success : colors.warning) : colors.textSecondary} 
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.gstTitle}>
                {sale.isGstRequired 
                  ? (sale.gstInvoiceNumber ? "GST Invoice Created" : "GST Invoice Required") 
                  : "GST Not Required"}
              </Text>
              <Text style={styles.gstDesc}>
                {sale.isGstRequired 
                  ? (sale.gstInvoiceNumber ? `Invoice: ${sale.gstInvoiceNumber}` : "Pending entry in Tally")
                  : "No GST invoice required for this transaction"}
              </Text>
            </View>
            {user?.role === "OWNER" && (
              <Button
                label="EDIT"
                variant="ghost"
                onPress={handleOpenGstModal}
                style={styles.gstEditBtn}
              />
            )}
          </View>
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Items Summary</Text>
          {user?.role === "OWNER" && (
            <Button
              label="EDIT ITEMS"
              variant="ghost"
              onPress={() => navigation.navigate("EditSale", { saleId: sale.id })}
              style={styles.itemsEditBtn}
            />
          )}
        </View>
        <View style={styles.itemsCard}>
            {sale.items?.map((item: any, idx: number) => {
              const isPriceModified = Number(item.rate) !== Number(item.item?.defaultSellingPrice);
              return (
                <View key={item.id}>
                  <Pressable 
                    onPress={() => setSelectedItemDetails(item)}
                    style={({ pressed }) => [styles.itemRowPressable, pressed && { backgroundColor: colors.surfaceOffset }]}
                  >
                    <View style={styles.itemRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemName}>{item.item.name}</Text>
                        <Text style={styles.itemSub}>
                          {item.quantity} {item.item.unit} @ {money(item.rate)}
                          {isPriceModified && (
                            <Text style={styles.priceModifiedText}>
                              {" "}• List: {money(item.item?.defaultSellingPrice)}
                            </Text>
                          )}
                        </Text>
                      </View>
                      <Text style={styles.itemTotal}>{money(Number(item.quantity) * Number(item.rate))}</Text>
                    </View>
                  </Pressable>
                  {idx < (sale.items?.length ?? 0) - 1 && <Divider style={styles.divider} />}
                </View>
              );
            })}
          </View>

        <Section title="Payment Streams & Verifications">
          <View style={styles.itemsCard}>
            {sale.payments?.map((p: any, idx: number) => {
              const collectedBy = p.receivedBy?.name ? `Collected by: ${p.receivedBy.name}` : "";
              const verifiedBy = p.verifiedBy?.name ? `Verified by: ${p.verifiedBy.name}` : "";

              const upiRef = p.details?.upiReference ? `UPI Ref: ${p.details.upiReference}` : null;
              const bankUtr = p.details?.bankUtr ? `UTR: ${p.details.bankUtr}` : null;
              const cheque = p.details?.chequeNumber ? `Cheque #${p.details.chequeNumber} (${p.details.chequeBankName || "N/A"})` : null;

              return (
                <View key={p.id} style={styles.paymentRowBlock}>
                  <View style={styles.itemRow}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.itemName}>{p.paymentMode} Payment</Text>
                      <Text style={styles.itemSub}>
                        {new Date(p.receivedAt).toLocaleString("en-IN")}
                      </Text>

                      {collectedBy ? <Text style={styles.paymentMetaText}>{collectedBy}</Text> : null}

                      {upiRef ? <Text style={styles.paymentDetailsText}>{upiRef}</Text> : null}
                      {bankUtr ? <Text style={styles.paymentDetailsText}>{bankUtr}</Text> : null}
                      {cheque ? <Text style={styles.paymentDetailsText}>{cheque}</Text> : null}

                      {verifiedBy ? (
                        <Text style={styles.paymentVerificationText}>
                          {verifiedBy} {p.verifiedAt ? `on ${new Date(p.verifiedAt).toLocaleString("en-IN")}` : ""}
                        </Text>
                      ) : null}

                      {p.notes ? (
                        <View style={styles.paymentNoteCard}>
                          <Text style={styles.paymentNoteText}>Notes: {p.notes}</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                      <Text style={styles.itemTotal}>{money(p.amount)}</Text>
                      <View style={{ marginTop: 4 }}>
                        <StatusPill
                          label={p.status}
                          tone={p.status === 'VERIFIED' ? 'green' : p.status === 'REJECTED' ? 'red' : 'amber'}
                        />
                      </View>
                    </View>
                  </View>
                  {idx < (sale.payments?.length ?? 0) - 1 && <Divider style={styles.divider} />}
                </View>
              );
            })}
            {sale.payments?.length === 0 && <Text style={styles.emptyText}>No payments recorded yet.</Text>}
          </View>
        </Section>

        {sale.customerSignature ? (() => {
          try {
            const parsed = JSON.parse(sale.customerSignature);
            let signaturePaths: string[] = [];
            let signatureViewBox = "0 0 300 150";
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              signaturePaths = parsed.paths || [];
              signatureViewBox = parsed.viewBox || "0 0 300 150";
            } else if (Array.isArray(parsed)) {
              signaturePaths = parsed;
              signatureViewBox = getSignatureViewBox(parsed);
            }
            if (signaturePaths.length > 0) {
              return (
                <Section title="Customer Signature">
                  <View style={styles.signatureDisplayCard}>
                    <Svg style={styles.signatureSvg} viewBox={signatureViewBox}>
                      {signaturePaths.map((path: string, index: number) => (
                        <Path
                          key={index}
                          d={path}
                          stroke={colors.textPrimary}
                          strokeWidth={3}
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ))}
                    </Svg>
                    <Text style={styles.signatureDisplayHint}>
                      Acknowledgment signature collected at billing
                    </Text>
                  </View>
                </Section>
              );
            }
          } catch (e) {
            console.error("Failed to parse signature:", e);
          }
          return null;
        })() : null}

        {sale.paymentStatus !== "PAID" && (
          <Section title="Attach Existing Payment">
            <View style={styles.itemsCard}>
              {unlinkedPaymentsQuery.isLoading ? (
                <Text style={styles.emptyText}>Loading unlinked payments...</Text>
              ) : !unlinkedPaymentsQuery.data || unlinkedPaymentsQuery.data.length === 0 ? (
                <Text style={styles.emptyText}>No unlinked payments found for this customer.</Text>
              ) : (
                unlinkedPaymentsQuery.data.map((p: any, idx: number) => (
                  <View key={p.id} style={styles.paymentRowBlock}>
                    <View style={styles.itemRow}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.itemName}>{p.paymentMode} Payment</Text>
                        <Text style={styles.itemSub}>
                          {new Date(p.receivedAt).toLocaleString("en-IN")}
                        </Text>
                        {p.notes ? <Text style={styles.paymentMetaText}>Notes: {p.notes}</Text> : null}
                      </View>
                      <View style={{ alignItems: 'flex-end', justifyContent: 'center', gap: 6 }}>
                        <Text style={styles.itemTotal}>{money(p.amount)}</Text>
                        <Button
                          label="ATTACH"
                          variant="ghost"
                          loading={attachPaymentMutation.isPending && attachPaymentMutation.variables?.paymentId === p.id}
                          disabled={attachPaymentMutation.isPending}
                          onPress={() => {
                            Alert.alert(
                              "Attach Payment",
                              `Are you sure you want to attach this payment of ${money(p.amount)} to this sale?`,
                              [
                                { text: "Cancel", style: "cancel" },
                                {
                                  text: "Attach",
                                  onPress: () => {
                                    attachPaymentMutation.mutate({
                                      paymentId: p.id,
                                      saleId: sale.id
                                    }, {
                                      onSuccess: () => {
                                        Alert.alert("Success", "Payment successfully attached!");
                                      },
                                      onError: (err: any) => {
                                        Alert.alert("Error", err.message || "Failed to attach payment");
                                      }
                                    });
                                  }
                                }
                              ]
                            );
                          }}
                        />
                      </View>
                    </View>
                    {idx < (unlinkedPaymentsQuery.data?.length ?? 0) - 1 && <Divider style={styles.divider} />}
                  </View>
                ))
              )}
            </View>
          </Section>
        )}

        {sale.notes && (
          <Section title="Operational Notes">
            <View style={styles.notesCard}>
              <Text style={styles.notesText}>{sale.notes}</Text>
            </View>
          </Section>
        )}

        {sale.paymentStatus !== "PAID" && (
          <Button
            label="COLLECT PAYMENT"
            variant="primary"
            icon="currency-inr"
            onPress={() => navigation.navigate("TakePayment", {
              customerId: sale.customerId,
              customer: sale.customer,
              saleId: sale.id,
              amount: sale.balanceAmount
            })}
            style={{ marginTop: spacing.md, backgroundColor: colors.success }}
          />
        )}

        <View style={[styles.shareBtnContainer, { flexDirection: "row", gap: spacing.md, marginTop: sale.paymentStatus !== "PAID" ? spacing.sm : spacing.lg }]}>
          <Button
            label="VIEW"
            variant="ghost"
            icon="eye-outline"
            onPress={() => navigation.navigate("InvoiceViewer", { sale, shop: activeShop })}
            style={{ flex: 1 }}
          />
          <Button
            label="SHARE PDF"
            variant="primary"
            icon="share-variant-outline"
            loading={sharing}
            disabled={sharing}
            onPress={handleSharePdf}
            style={{ flex: 1.5 }}
          />
        </View>
      </ScrollView>

      {/* Product Details Modal */}
      <RNModal
        visible={!!selectedItemDetails}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedItemDetails(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.detailsModalContent}>
            <View style={styles.detailsModalHeader}>
              <Text style={styles.detailsModalTitle}>Item Specification</Text>
              <Pressable onPress={() => setSelectedItemDetails(null)} style={styles.closeBtn}>
                <Icon source="close" size={20} color={colors.textPrimary} />
              </Pressable>
            </View>

            {selectedItemDetails && (
              <ScrollView style={styles.detailsModalBody}>
                <Text style={styles.detailsModalName}>{selectedItemDetails.item.name}</Text>
                
                <View style={styles.detailsGrid}>
                  <View style={styles.detailsGridRow}>
                    <Text style={styles.detailsLabel}>SKU Code</Text>
                    <Text style={styles.detailsValue}>{selectedItemDetails.item.sku || "—"}</Text>
                  </View>
                  <View style={styles.detailsGridRow}>
                    <Text style={styles.detailsLabel}>Company / Brand</Text>
                    <Text style={styles.detailsValue}>{selectedItemDetails.item.brand?.name || "—"}</Text>
                  </View>
                  <View style={styles.detailsGridRow}>
                    <Text style={styles.detailsLabel}>Category</Text>
                    <Text style={styles.detailsValue}>{selectedItemDetails.item.category?.name || "—"}</Text>
                  </View>
                  <View style={styles.detailsGridRow}>
                    <Text style={styles.detailsLabel}>Measurement Unit</Text>
                    <Text style={styles.detailsValue}>{selectedItemDetails.item.unit || "—"}</Text>
                  </View>
                  
                  <Divider style={{ marginVertical: spacing.sm, backgroundColor: colors.border }} />

                  <View style={styles.detailsGridRow}>
                    <Text style={styles.detailsLabel}>Maximum Retail Price (MRP)</Text>
                    <Text style={[styles.detailsValue, { fontWeight: fontWeight.bold }]}>{money(selectedItemDetails.item.mrp)}</Text>
                  </View>
                  <View style={styles.detailsGridRow}>
                    <Text style={styles.detailsLabel}>Original Selling Price</Text>
                    <Text style={styles.detailsValue}>{money(selectedItemDetails.item.defaultSellingPrice)}</Text>
                  </View>
                  <View style={styles.detailsGridRow}>
                    <Text style={styles.detailsLabel}>Billed Selling Rate</Text>
                    <Text style={[styles.detailsValue, { color: colors.primary, fontWeight: fontWeight.black }]}>{money(selectedItemDetails.rate)}</Text>
                  </View>
                  <View style={styles.detailsGridRow}>
                    <Text style={styles.detailsLabel}>Minimum Allowed Price</Text>
                    <Text style={styles.detailsValue}>{money(selectedItemDetails.item.minPrice)}</Text>
                  </View>
                </View>
              </ScrollView>
            )}

            <Button
              label="CLOSE DETAILS"
              variant="secondary"
              onPress={() => setSelectedItemDetails(null)}
              style={{ marginTop: spacing.md }}
              fullWidth
            />
          </View>
        </View>
      </RNModal>

      <Portal>
        <Modal
          visible={isInvoiceModalVisible}
          onDismiss={() => setIsInvoiceModalVisible(false)}
          contentContainerStyle={styles.editModal}
        >
          <View style={styles.modalIcon}>
            <Icon source="file-percent-outline" size={48} color={colors.primary} />
          </View>
          <Text style={styles.modalTitle}>Issue GST Invoice</Text>
          <Divider style={styles.modalDivider} />

          <View style={styles.modalForm}>
            <PaperTextInput
              mode="outlined"
              label="Tally Invoice Number"
              value={invoiceNumber}
              onChangeText={setInvoiceNumber}
              style={styles.modalInput}
              outlineColor={colors.border}
              activeOutlineColor={colors.primary}
              textColor={colors.textPrimary}
              placeholder="e.g. VS-2026-145"
              autoCapitalize="characters"
            />
          </View>

          <View style={styles.modalActionsRow}>
            <Button
              label="CANCEL"
              variant="ghost"
              onPress={() => setIsInvoiceModalVisible(false)}
              style={{ flex: 1 }}
            />
            <Button
              label="ISSUE"
              variant="primary"
              loading={issueInvoiceMutation.isPending}
              disabled={issueInvoiceMutation.isPending || !invoiceNumber.trim()}
              onPress={handleConfirmIssueInvoice}
              style={{ flex: 1.5 }}
            />
          </View>
        </Modal>

        <Modal
          visible={isGstModalVisible}
          onDismiss={() => setIsGstModalVisible(false)}
          contentContainerStyle={styles.editModal}
        >
          <View style={styles.modalIcon}>
            <Icon source="file-percent-outline" size={48} color={colors.warning} />
          </View>
          <Text style={styles.modalTitle}>Edit GST Details</Text>
          <Divider style={styles.modalDivider} />

          <View style={styles.modalForm}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }}>
              <Text style={{ fontSize: 16, fontWeight: fontWeight.bold, color: colors.textPrimary }}>GST Invoice Required</Text>
              <Switch
                value={editGstRequired}
                onValueChange={setEditGstRequired}
                color={colors.warning}
              />
            </View>

            {editGstRequired && (
              <PaperTextInput
                mode="outlined"
                label="Tally Invoice Number"
                value={editGstInvoiceNumber}
                onChangeText={setEditGstInvoiceNumber}
                style={styles.modalInput}
                outlineColor={colors.border}
                activeOutlineColor={colors.primary}
                textColor={colors.textPrimary}
                placeholder="e.g. VS-2026-145"
                autoCapitalize="characters"
              />
            )}
          </View>

          <View style={styles.modalActionsRow}>
            <Button
              label="CANCEL"
              variant="ghost"
              onPress={() => setIsGstModalVisible(false)}
              style={{ flex: 1 }}
            />
            <Button
              label="SAVE"
              variant="primary"
              loading={updateSaleMutation.isPending}
              disabled={updateSaleMutation.isPending}
              onPress={handleSaveGstDetails}
              style={{ flex: 1.5 }}
            />
          </View>
        </Modal>
      </Portal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  searchBar: { height: 44, marginBottom: spacing.md },
  searchInput: { fontSize: 14 },
  tabs: { marginBottom: spacing.lg },
  listWrapper: { flex: 1 },
  listContent: { paddingBottom: 100 },
  saleCard: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md, ...shadow.sm },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  saleNumber: { fontSize: 12, fontWeight: fontWeight.bold, color: colors.primary },
  customerName: { fontSize: 15, fontWeight: fontWeight.black, color: colors.textPrimary, marginTop: 2 },
  staffBilledText: { fontSize: 11, color: colors.textSecondary, marginTop: 2, fontStyle: 'italic' },
  divider: { marginVertical: spacing.md, backgroundColor: colors.surfaceOffset },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  footerLabel: { fontSize: 8, fontWeight: fontWeight.black, color: colors.textMuted, letterSpacing: 0.5 },
  footerValue: { fontSize: 12, fontWeight: fontWeight.bold, color: colors.textSecondary, marginTop: 2 },
  detailScroll: { paddingHorizontal: spacing.lg, paddingBottom: 80, gap: spacing.lg },
  detailCard: { backgroundColor: colors.surface, borderRadius: 24, padding: spacing.xl, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  customerNameBig: { fontSize: 18, fontWeight: fontWeight.black, color: colors.textPrimary },
  dateText: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  billedByText: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  boldText: { fontWeight: fontWeight.bold, color: colors.textPrimary },
  priceModifiedText: { color: colors.warning, fontWeight: fontWeight.semibold, fontSize: 11 },
  detailDivider: { marginVertical: spacing.xl, backgroundColor: colors.border },
  amountBox: { alignItems: 'center', gap: 4 },
  amountLabel: { fontSize: 10, fontWeight: fontWeight.bold, color: colors.textSecondary, letterSpacing: 1 },
  amountValue: { fontSize: 28, fontWeight: fontWeight.black, color: colors.primary },
  gstBox: { flexDirection: 'row', gap: spacing.md, backgroundColor: 'rgba(217, 119, 6, 0.05)', padding: spacing.md, borderRadius: 14, marginTop: spacing.xl, borderWidth: 1, borderColor: 'rgba(217, 119, 6, 0.1)' },
  gstTitle: { fontSize: 13, fontWeight: fontWeight.bold, color: colors.warning },
  gstDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  itemsCard: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.lg },
  paymentRowBlock: { paddingVertical: spacing.xs },
  itemName: { fontSize: 14, fontWeight: fontWeight.bold, color: colors.textPrimary },
  itemSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  paymentMetaText: { fontSize: 11, color: colors.textSecondary, marginTop: 1, fontWeight: fontWeight.medium },
  paymentDetailsText: { fontSize: 11, color: colors.primary, fontWeight: fontWeight.bold, marginTop: 1 },
  paymentVerificationText: { fontSize: 11, color: colors.success, fontStyle: 'italic', marginTop: 1 },
  paymentNoteCard: { backgroundColor: colors.surfaceOffset, padding: 6, borderRadius: radius.sm, marginTop: 4, borderWidth: 1, borderColor: colors.border },
  paymentNoteText: { fontSize: 11, color: colors.textSecondary },
  itemTotal: { fontSize: 14, fontWeight: fontWeight.black, color: colors.textPrimary },
  emptyText: { textAlign: 'center', padding: spacing.xl, color: colors.textMuted, fontSize: 12 },
  notesCard: { backgroundColor: colors.surfaceOffset, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  notesText: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  shareBtnContainer: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg, marginBottom: spacing.xl },
  halfBtn: { flex: 1, height: 50 },
  flex1: { flex: 1 },
  signatureDisplayCard: {
    backgroundColor: 'white',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    height: 140,
    ...shadow.sm,
  },
  signatureSvg: {
    width: '100%',
    height: 100,
  },
  signatureDisplayHint: {
    fontSize: 10,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: 4,
  },
  gstEditBtn: {
    paddingHorizontal: spacing.sm,
    height: 32,
    alignSelf: "center",
  },
  itemsEditBtn: {
    paddingHorizontal: spacing.sm,
    height: 32,
  },
  editModal: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    margin: spacing.xl,
    borderRadius: 28,
    alignItems: 'center',
    gap: spacing.md,
  },
  editItemsModal: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    margin: spacing.xl,
    borderRadius: 28,
    alignItems: 'center',
    gap: spacing.md,
    maxHeight: '90%',
  },
  editItemsScroll: {
    width: '100%',
    maxHeight: 280,
    marginTop: spacing.sm,
  },
  editItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceOffset,
  },
  editItemName: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  qtyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceOffset,
    height: 40,
    width: 100,
    overflow: 'hidden',
  },
  qtyBtn: {
    width: 28,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.border,
  },
  qtyBtnText: {
    fontSize: 16,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  qtyInput: {
    flex: 1,
    height: '100%',
    backgroundColor: 'transparent',
    textAlign: 'center',
    fontSize: 13,
    paddingHorizontal: 0,
  },
  rateInput: {
    width: 110,
    height: 40,
    backgroundColor: colors.surface,
  },
  removeBtn: {
    padding: spacing.sm,
  },
  suggestionsContainer: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginTop: 2,
    position: 'absolute',
    top: 50,
    zIndex: 1000,
    ...shadow.sm,
  },
  suggestionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceOffset,
  },
  suggestionRowPressed: {
    backgroundColor: colors.surfaceOffset,
  },
  suggestionName: {
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: fontWeight.bold,
    flex: 1,
  },
  suggestionPrice: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: fontWeight.bold,
  },
  modalForm: {
    width: '100%',
    gap: spacing.md,
    marginVertical: spacing.md,
  },
  modalSwitchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  modalLabel: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: fontWeight.bold,
  },
  modalInput: {
    backgroundColor: colors.surface,
    fontSize: 14,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
    marginTop: spacing.md,
  },
  modalIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  modalDivider: {
    width: '100%',
    marginVertical: spacing.sm,
    backgroundColor: colors.border,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  detailsModalContent: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    width: "100%",
    maxHeight: "80%",
    padding: spacing.lg,
    ...shadow.lg,
  },
  detailsModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.sm,
    marginBottom: spacing.md,
  },
  detailsModalTitle: {
    fontSize: 16,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  closeBtn: {
    padding: 4,
  },
  detailsModalBody: {
    marginBottom: spacing.sm,
  },
  detailsModalName: {
    fontSize: 15,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  detailsGrid: {
    gap: spacing.sm,
  },
  detailsGridRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  detailsLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  detailsValue: {
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: fontWeight.medium,
  },
  itemRowPressable: {
    borderRadius: radius.md,
  },
});
