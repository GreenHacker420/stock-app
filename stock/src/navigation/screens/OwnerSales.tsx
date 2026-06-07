import { useMemo, useState } from "react";
import { Pressable, ScrollView, View, StyleSheet, ActivityIndicator } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Divider, Searchbar, SegmentedButtons, Text, TextInput, Card, Icon } from "react-native-paper";
import { useSalesQuery, useSaleDetailQuery, useUpdateGstMutation } from "../../hooks/useSales";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { StatusPill } from "../../components/ui/StatusPill";
import { Button } from "../../components/ui/Button";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";

const money = (value?: string | number | null) => `₹${Number(value ?? 0).toLocaleString("en-IN")}`;

export function SalesList() {
  const navigation = useNavigation();
  const route = useRoute();
  const [search, setSearch] = useState("");
  
  // Support initial filter state from route params (e.g. gst_pending from dashboard)
  const initialFilter = (route.params as { filter?: string } | undefined)?.filter || "ALL";
  const [filter, setFilter] = useState(initialFilter);

  const salesQuery = useSalesQuery();

  const rows = useMemo(() => {
    return (salesQuery.data ?? []).filter((sale) => {
      const customerName = sale.customer?.name || "Walk-in customer";
      const text = `${sale.saleNumber} ${customerName} ${sale.paymentStatus ?? ""}`.toLowerCase();
      const matches = text.includes(search.toLowerCase());
      
      if (filter === "WALKIN") return matches && sale.isWalkin;
      if (filter === "REGULAR") return matches && !sale.isWalkin;
      if (filter === "CREDIT") return matches && Number(sale.balanceAmount) > 0;
      if (filter === "gst_pending") return matches && sale.gstRequired && sale.gstInvoiceStatus === "PENDING";
      
      return matches;
    });
  }, [filter, salesQuery.data, search]);

  const total = useMemo(() => rows.reduce((sum, sale) => sum + Number(sale.totalAmount), 0), [rows]);
  const balance = useMemo(() => rows.reduce((sum, sale) => sum + Number(sale.balanceAmount), 0), [rows]);

  return (
    <Screen scroll={false} edges={['top', 'left', 'right']}>
      <AppHeader title="Sales Management" subtitle="All walk-in, regular, paid, and pending sales." />
      
      <View style={styles.container}>
        {/* Premium Stats Grid */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>SALES COUNT</Text>
            <Text style={styles.statValue}>{rows.length}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: 'rgba(22, 163, 74, 0.03)', borderColor: 'rgba(22, 163, 74, 0.1)' }]}>
            <Text style={[styles.statLabel, { color: colors.primary }]}>REVENUE VALUE</Text>
            <Text style={[styles.statValue, { color: colors.primary }]}>{money(total)}</Text>
          </View>
        </View>

        <Searchbar 
          value={search} 
          onChangeText={setSearch} 
          placeholder="Search sale number or customer" 
          style={styles.searchBar} 
          inputStyle={styles.searchInput}
          iconColor={colors.textSecondary}
        />

        {/* Customized Filter Segmented buttons including GST pending filter */}
        <SegmentedButtons 
          value={filter} 
          onValueChange={setFilter} 
          buttons={[
            { value: "ALL", label: "All" }, 
            { value: "REGULAR", label: "Regular" }, 
            { value: "CREDIT", label: "Credit" },
            { value: "gst_pending", label: "Pending GST" }
          ]} 
          style={styles.segmentedBtn}
          theme={{ colors: { primary: colors.primary } }}
        />

        <Text style={styles.outstandingText}>
          Outstanding in filter: <Text style={styles.boldText}>{money(balance)}</Text>
        </Text>

        {salesQuery.isLoading ? (
          <View style={styles.loadingWrapper}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.loadingText}>Loading sales records...</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <View style={styles.listGap}>
              {rows.map((sale) => (
                <Pressable key={sale.id} onPress={() => (navigation as any).navigate("SaleDetail", { saleId: sale.id })}>
                  <View style={styles.saleCard}>
                    <View style={styles.cardHeader}>
                      <View style={styles.flex1}>
                        <View style={styles.saleNumberRow}>
                          <Text style={styles.saleNumberText}>{sale.saleNumber}</Text>
                          {sale.gstRequired && (
                            <View style={styles.gstTag}>
                              <Text style={styles.gstTagText}>GST</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.customerNameText}>{sale.isWalkin ? "Walk-in customer" : sale.customer?.name ?? "Regular sale"}</Text>
                        <Text style={styles.dateText}>{new Date(sale.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                      </View>
                      
                      <View style={{ alignItems: 'flex-end', gap: 6 }}>
                        <StatusPill 
                          label={sale.paymentStatus ?? (Number(sale.balanceAmount) > 0 ? "PENDING" : "PAID")} 
                          tone={Number(sale.balanceAmount) > 0 ? "amber" : "green"} 
                        />
                        {sale.gstRequired && (
                          <StatusPill 
                            label={sale.gstInvoiceStatus === 'GENERATED' ? 'TALLY OK' : 'TALLY PENDING'} 
                            tone={sale.gstInvoiceStatus === 'GENERATED' ? 'green' : 'red'} 
                          />
                        )}
                      </View>
                    </View>
                    
                    <Divider style={styles.cardDivider} />
                    
                    <View style={styles.cardFooter}>
                      <View>
                        <Text style={styles.footerLabel}>TOTAL</Text>
                        <Text style={styles.footerValue}>{money(sale.totalAmount)}</Text>
                      </View>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={styles.footerLabel}>PAID</Text>
                        <Text style={[styles.footerValue, { color: colors.success }]}>{money(sale.paidAmount)}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.footerLabel}>OUTSTANDING</Text>
                        <Text style={[styles.footerValue, { color: Number(sale.balanceAmount) > 0 ? colors.warning : colors.textPrimary }]}>{money(sale.balanceAmount)}</Text>
                      </View>
                    </View>
                  </View>
                </Pressable>
              ))}
              {rows.length === 0 ? <Text style={styles.emptyText}>No sales found.</Text> : null}
            </View>
          </ScrollView>
        )}
      </View>
    </Screen>
  );
}

export function SaleDetail() {
  const saleId = (useRoute().params as { saleId?: string } | undefined)?.saleId;
  const saleQuery = useSaleDetailQuery(saleId ?? "");
  const updateGstMutation = useUpdateGstMutation();
  const sale = saleQuery.data;

  const [tallyInvoiceNumber, setTallyInvoiceNumber] = useState("");

  const handleRegisterGst = () => {
    if (!tallyInvoiceNumber.trim() || !saleId) return;
    updateGstMutation.mutate({
      saleId,
      gstInvoiceNumber: tallyInvoiceNumber.trim(),
    }, {
      onSuccess: () => {
        setTallyInvoiceNumber("");
      }
    });
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader 
        title={sale?.saleNumber ?? "Sale Detail"} 
        subtitle="Items, payments, customer, and status." 
        fallbackRoute="SalesList"
      />
      
      {!saleId ? (
        <Text style={styles.errorText}>Missing sale id.</Text>
      ) : saleQuery.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : sale ? (
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Main Info Card */}
          <View style={styles.saleDetailCard}>
            <View style={styles.cardHeader}>
              <View style={styles.flex1}>
                <Text style={styles.detailCustomerName}>
                  {sale.isWalkin ? "Walk-in Customer" : sale.customer?.name ?? "Customer not linked"}
                </Text>
                <Text style={styles.detailSaleNumber}>Sale: {sale.saleNumber}</Text>
                <Text style={styles.detailDateText}>Date: {new Date(sale.createdAt).toLocaleString('en-IN')}</Text>
              </View>
              <View style={{ gap: 4 }}>
                <StatusPill label={sale.saleStatus ?? "SALE"} tone="blue" />
                {sale.gstRequired && (
                  <StatusPill 
                    label={sale.gstInvoiceStatus === 'GENERATED' ? 'TALLY INVOICED' : 'TALLY PENDING'} 
                    tone={sale.gstInvoiceStatus === 'GENERATED' ? 'green' : 'red'} 
                  />
                )}
              </View>
            </View>
            
            <Divider style={styles.detailDivider} />
            
            <View style={styles.detailMetricsRow}>
              <View style={styles.detailMetricCol}>
                <Text style={styles.detailMetricLabel}>TOTAL AMOUNT</Text>
                <Text style={styles.detailMetricVal}>{money(sale.totalAmount)}</Text>
              </View>
              <View style={styles.detailMetricCol}>
                <Text style={styles.detailMetricLabel}>PAID AMOUNT</Text>
                <Text style={[styles.detailMetricVal, { color: colors.success }]}>{money(sale.paidAmount)}</Text>
              </View>
              <View style={[styles.detailMetricCol, { alignItems: 'flex-end' }]}>
                <Text style={styles.detailMetricLabel}>BALANCE</Text>
                <Text style={[styles.detailMetricVal, { color: Number(sale.balanceAmount) > 0 ? colors.warning : colors.textPrimary }]}>{money(sale.balanceAmount)}</Text>
              </View>
            </View>
          </View>

          {/* GST Assignation Billing Queue Box (If pending) */}
          {sale.gstRequired && (
            <Card style={[styles.gstBillingCard, sale.gstInvoiceStatus === 'PENDING' ? styles.gstPendingBorder : styles.gstGeneratedBorder]}>
              <Card.Content>
                <View style={styles.gstBillingHeader}>
                  <Icon 
                    source={sale.gstInvoiceStatus === 'GENERATED' ? "file-check-outline" : "file-clock-outline"} 
                    size={24} 
                    color={sale.gstInvoiceStatus === 'GENERATED' ? colors.success : colors.danger} 
                  />
                  <Text style={styles.gstBillingTitle}>Tally GST Invoice Reference</Text>
                </View>

                {sale.gstInvoiceStatus === 'PENDING' ? (
                  <View style={styles.gstFormWrapper}>
                    <Text style={styles.gstFormDesc}>
                      This sale is marked as GST required. Create the invoice in Tally and register the invoice number below to complete.
                    </Text>
                    <View style={styles.gstFormInputRow}>
                      <TextInput
                        mode="outlined"
                        dense
                        label="Tally Invoice Number"
                        value={tallyInvoiceNumber}
                        onChangeText={setTallyInvoiceNumber}
                        style={styles.gstInput}
                        outlineStyle={{ borderRadius: radius.md }}
                      />
                      <Button
                        label="Submit"
                        size="md"
                        onPress={handleRegisterGst}
                        loading={updateGstMutation.isPending}
                        disabled={!tallyInvoiceNumber.trim()}
                        style={styles.gstSubmitBtn}
                      />
                    </View>
                  </View>
                ) : (
                  <View style={styles.gstSuccessWrapper}>
                    <View style={styles.gstInvoiceRow}>
                      <Text style={styles.gstSuccessLabel}>Invoice Number:</Text>
                      <Text style={styles.gstSuccessValue}>{sale.gstInvoiceNumber}</Text>
                    </View>
                    {sale.gstInvoiceGeneratedAt && (
                      <View style={styles.gstInvoiceRow}>
                        <Text style={styles.gstSuccessLabel}>Registered On:</Text>
                        <Text style={styles.gstSuccessDate}>
                          {new Date(sale.gstInvoiceGeneratedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </Card.Content>
            </Card>
          )}

          {/* Items Section */}
          <Section title="Items Summary">
            <View style={styles.sectionListCard}>
              {(sale.items ?? []).map((row, index) => (
                <View key={row.id}>
                  {index > 0 ? <Divider style={styles.itemDivider} /> : null}
                  <View style={styles.itemRow}>
                    <View style={styles.flex1}>
                      <Text style={styles.itemNameText}>{row.item.name}</Text>
                      <Text style={styles.itemSubText}>Qty: {row.quantity} {row.item.unit} • Rate: {money(row.rate)}</Text>
                    </View>
                    <Text style={styles.itemTotalText}>{money(row.totalAmount)}</Text>
                  </View>
                </View>
              ))}
            </View>
          </Section>

          {/* Payments Section */}
          <Section title="Payment History">
            <View style={styles.sectionListCard}>
              {(sale.payments ?? []).map((payment, index) => (
                <View key={payment.id}>
                  {index > 0 ? <Divider style={styles.itemDivider} /> : null}
                  <View style={styles.paymentRow}>
                    <View style={styles.flex1}>
                      <View style={styles.paymentModeRow}>
                        <Text style={styles.paymentModeText}>{payment.paymentMode}</Text>
                        <StatusPill 
                          label={payment.verificationStatus} 
                          tone={payment.verificationStatus === 'VERIFIED' ? 'green' : payment.verificationStatus === 'REJECTED' ? 'red' : 'amber'} 
                        />
                      </View>
                      <Text style={styles.paymentDateText}>Recorded: {new Date(payment.receivedAt).toLocaleDateString('en-IN')}</Text>
                      {payment.referenceNumber && (
                        <Text style={styles.paymentRefText}>Ref: {payment.referenceNumber}</Text>
                      )}
                    </View>
                    <Text style={styles.paymentAmountText}>{money(payment.amount)}</Text>
                  </View>
                </View>
              ))}
              {!sale.payments?.length && (
                <Text style={styles.emptyPaymentsText}>No payments recorded against this sale</Text>
              )}
            </View>
          </Section>
        </ScrollView>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    ...shadow.sm,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: fontWeight.black,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 20,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    marginTop: 4,
  },
  searchBar: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 0,
    height: 44,
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  searchInput: {
    fontSize: 14,
  },
  segmentedBtn: {
    marginBottom: spacing.md,
  },
  outstandingText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginBottom: spacing.lg,
  },
  boldText: {
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  scrollContent: {
    paddingBottom: 130,
  },
  listGap: {
    gap: spacing.md,
  },
  saleCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.05)',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    ...shadow.sm,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  flex1: {
    flex: 1,
  },
  saleNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 2,
  },
  saleNumberText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  gstTag: {
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  gstTagText: {
    fontSize: 8,
    fontWeight: fontWeight.bold,
    color: '#6366f1',
  },
  customerNameText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  dateText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  cardDivider: {
    marginVertical: spacing.md,
    backgroundColor: colors.border,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerLabel: {
    fontSize: 8,
    color: colors.textMuted,
    fontWeight: fontWeight.black,
    letterSpacing: 0.3,
  },
  footerValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
    marginTop: 2,
  },
  emptyText: {
    textAlign: "center",
    color: colors.textSecondary,
    padding: spacing.xxl,
  },
  errorText: {
    color: colors.danger,
    padding: spacing.lg,
    textAlign: 'center',
  },
  loadingWrapper: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  // Details Styles
  saleDetailCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    ...shadow.sm,
  },
  detailCustomerName: {
    fontSize: 18,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  detailSaleNumber: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    marginTop: 2,
  },
  detailDateText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  detailDivider: {
    marginVertical: spacing.xl,
  },
  detailMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailMetricCol: {
    flex: 1,
  },
  detailMetricLabel: {
    fontSize: 9,
    color: colors.textMuted,
    fontWeight: fontWeight.black,
    letterSpacing: 0.5,
  },
  detailMetricVal: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    marginTop: 4,
  },
  // GST Card Billing styles
  gstBillingCard: {
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: spacing.lg,
    ...shadow.sm,
    backgroundColor: colors.surface,
  },
  gstPendingBorder: {
    borderColor: 'rgba(220, 38, 38, 0.15)',
  },
  gstGeneratedBorder: {
    borderColor: 'rgba(22, 163, 74, 0.15)',
  },
  gstBillingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  gstBillingTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  gstFormWrapper: {
    marginTop: 4,
  },
  gstFormDesc: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  gstFormInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  gstInput: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  gstSubmitBtn: {
    height: 40,
  },
  gstSuccessWrapper: {
    marginTop: spacing.md,
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  gstInvoiceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gstSuccessLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
  },
  gstSuccessValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.extrabold,
    color: colors.success,
  },
  gstSuccessDate: {
    fontSize: fontSize.xs,
    color: colors.textPrimary,
    fontWeight: fontWeight.semibold,
  },
  // Section summary styles
  sectionListCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    ...shadow.sm,
  },
  itemDivider: {
    marginVertical: spacing.md,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  itemNameText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  itemSubText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  itemTotalText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  paymentModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: 2,
  },
  paymentModeText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  paymentDateText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  paymentRefText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 1,
  },
  paymentAmountText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  emptyPaymentsText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
});
