import React, { useMemo, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Searchbar, Divider, Text, Icon } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";
import { useDebounce } from "use-debounce";
import { useRoute } from "@react-navigation/native";

import { useSalesQuery, useSaleQuery } from "../../hooks/useSales";
import { type Sale } from "../../api/client";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { navigate, goBack } from "../navigation-ref";

const money = (value?: string | number | null) => `₹${Number(value ?? 0).toLocaleString("en-IN")}`;

export function SalesList() {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const route = useRoute<any>();
  const initialFilter = route.params?.filter || "ALL"; // ALL, PAID, PENDING, PARTIAL
  const [activeTab, setActiveTab] = useState(initialFilter);

  const salesQuery = useSalesQuery({ search: debouncedSearch });
  const allSales = salesQuery.data ?? [];

  const filteredSales = useMemo(() => {
    if (activeTab === "ALL") return allSales;
    if (activeTab === "gst_pending") return allSales.filter(s => s.isGstRequired && !s.gstInvoiceNumber);
    return allSales.filter(s => s.paymentStatus === activeTab);
  }, [allSales, activeTab]);

  const List = FlashList as any;

  return (
    <Screen scroll={false} edges={['top', 'left', 'right']}>
      <AppHeader title="Sales History" subtitle="Monitor revenue and collections" />

      <View style={styles.container}>
        <Searchbar
          placeholder="Search invoice or customer"
          onChangeText={setSearch}
          value={search}
          style={styles.searchBar}
          inputStyle={styles.searchInput}
        />

        <View style={styles.tabContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
            {[
              { key: "ALL", label: "All Sales" },
              { key: "PAID", label: "Paid" },
              { key: "PENDING", label: "Pending" },
              { key: "gst_pending", label: "GST Pending" },
            ].map(tab => (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[styles.tabButton, activeTab === tab.key && styles.tabButtonActive]}
              >
                <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label.toUpperCase()}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.listWrapper}>
          {salesQuery.isLoading ? (
            <SkeletonList count={6} itemHeight={100} />
          ) : (
            <List
              data={filteredSales}
              keyExtractor={(item: Sale) => item.id}
              estimatedItemSize={110}
              renderItem={({ item }: { item: Sale }) => (
                <Pressable
                  onPress={() => navigate("SaleDetail", { id: item.id })}
                  style={({ pressed }) => [styles.saleCard, pressed && styles.pressed]}
                >
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.saleNumber}>#{item.saleNumber}</Text>
                      <Text style={styles.customerName}>{item.isWalkin ? "Walk-in Customer" : item.customer?.name}</Text>
                    </View>
                    <StatusPill 
                      label={item.paymentStatus} 
                      tone={item.paymentStatus === 'PAID' ? 'green' : 'amber'} 
                    />
                  </View>
                  <Divider style={styles.divider} />
                  <View style={styles.cardFooter}>
                    <View>
                      <Text style={styles.footerLabel}>TOTAL AMOUNT</Text>
                      <Text style={styles.footerValue}>{money(item.totalAmount)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.footerLabel}>DATE</Text>
                      <Text style={styles.footerValue}>{new Date(item.createdAt).toLocaleDateString()}</Text>
                    </View>
                  </View>
                </Pressable>
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
  const saleId = route.params?.id;
  const saleQuery = useSaleQuery(saleId);
  const sale = saleQuery.data;

  if (saleQuery.isLoading) return <SkeletonList count={5} />;
  if (!sale) return <EmptyState title="Sale not found" />;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title={`Sale #${sale.saleNumber}`} subtitle="Transaction Details" showBack />
      
      <ScrollView contentContainerStyle={styles.detailScroll}>
        <View style={styles.detailCard}>
           <View style={styles.detailRow}>
              <View>
                 <Text style={styles.customerNameBig}>{sale.isWalkin ? "Walk-in Customer" : sale.customer?.name}</Text>
                 <Text style={styles.dateText}>{new Date(sale.createdAt).toLocaleString()}</Text>
              </View>
              <StatusPill label={sale.paymentStatus} tone={sale.paymentStatus === 'PAID' ? 'green' : 'amber'} />
           </View>

           <Divider style={styles.detailDivider} />

           <View style={styles.amountBox}>
              <Text style={styles.amountLabel}>Total Sale Value</Text>
              <Text style={styles.amountValue}>{money(sale.totalAmount)}</Text>
           </View>

           {sale.isGstRequired && (
             <View style={styles.gstBox}>
                <Icon source="file-percent-outline" size={20} color={colors.warning} />
                <View style={{ flex: 1 }}>
                   <Text style={styles.gstTitle}>GST Invoice Required</Text>
                   <Text style={styles.gstDesc}>
                      {sale.gstInvoiceNumber ? `Invoice: ${sale.gstInvoiceNumber}` : "Pending entry in Tally"}
                   </Text>
                </View>
             </View>
           )}
        </View>

        <Section title="Items Summary">
           <View style={styles.itemsCard}>
              {sale.items.map((item, idx) => (
                <View key={item.id}>
                  <View style={styles.itemRow}>
                     <View style={{ flex: 1 }}>
                        <Text style={styles.itemName}>{item.item.name}</Text>
                        <Text style={styles.itemSub}>{item.quantity} {item.item.unit} @ {money(item.rate)}</Text>
                     </View>
                     <Text style={styles.itemTotal}>{money(item.quantity * Number(item.rate))}</Text>
                  </View>
                  {idx < sale.items.length - 1 && <Divider style={styles.divider} />}
                </View>
              ))}
           </View>
        </Section>

        <Section title="Payment History">
           <View style={styles.itemsCard}>
              {sale.payments.map((p, idx) => (
                <View key={p.id}>
                  <View style={styles.itemRow}>
                     <View style={{ flex: 1 }}>
                        <Text style={styles.itemName}>{p.paymentMode} Payment</Text>
                        <Text style={styles.itemSub}>{new Date(p.receivedAt).toLocaleDateString()}</Text>
                     </View>
                     <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.itemTotal}>{money(p.amount)}</Text>
                        <Text style={styles.miniStatus}>{p.verificationStatus}</Text>
                     </View>
                  </View>
                  {idx < sale.payments.length - 1 && <Divider style={styles.divider} />}
                </View>
              ))}
              {sale.payments.length === 0 && <Text style={styles.emptyText}>No payments recorded yet.</Text>}
           </View>
        </Section>
        
        {sale.notes && (
          <Section title="Operational Notes">
             <View style={styles.notesCard}>
                <Text style={styles.notesText}>{sale.notes}</Text>
             </View>
          </Section>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  searchBar: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, elevation: 0, height: 44, marginBottom: spacing.md },
  searchInput: { fontSize: 14 },
  tabContainer: { height: 38, marginBottom: spacing.lg },
  tabScroll: { gap: spacing.xs },
  tabButton: { paddingHorizontal: spacing.xl, borderRadius: radius.full, backgroundColor: colors.surfaceOffset, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', height: 34 },
  tabButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 10, fontWeight: fontWeight.bold, color: colors.textSecondary },
  tabTextActive: { color: 'white' },
  listWrapper: { flex: 1 },
  listContent: { paddingBottom: 100 },
  saleCard: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md, ...shadow.sm },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  saleNumber: { fontSize: 12, fontWeight: fontWeight.bold, color: colors.primary },
  customerName: { fontSize: 15, fontWeight: fontWeight.black, color: colors.textPrimary, marginTop: 2 },
  divider: { marginVertical: spacing.md, backgroundColor: colors.surfaceOffset },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  footerLabel: { fontSize: 8, fontWeight: fontWeight.black, color: colors.textMuted, letterSpacing: 0.5 },
  footerValue: { fontSize: 12, fontWeight: fontWeight.bold, color: colors.textSecondary, marginTop: 2 },
  detailScroll: { paddingHorizontal: spacing.lg, paddingBottom: 60 },
  detailCard: { backgroundColor: colors.surface, borderRadius: 24, padding: spacing.xl, borderWidth: 1, borderColor: colors.border, ...shadow.sm, marginTop: spacing.md },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  customerNameBig: { fontSize: 18, fontWeight: fontWeight.black, color: colors.textPrimary },
  dateText: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  detailDivider: { marginVertical: spacing.xl, backgroundColor: colors.border },
  amountBox: { alignItems: 'center', gap: 4 },
  amountLabel: { fontSize: 10, fontWeight: fontWeight.bold, color: colors.textSecondary, letterSpacing: 1 },
  amountValue: { fontSize: 28, fontWeight: fontWeight.black, color: colors.primary },
  gstBox: { flexDirection: 'row', gap: spacing.md, backgroundColor: 'rgba(217, 119, 6, 0.05)', padding: spacing.md, borderRadius: 14, marginTop: spacing.xl, borderWidth: 1, borderColor: 'rgba(217, 119, 6, 0.1)' },
  gstTitle: { fontSize: 13, fontWeight: fontWeight.bold, color: colors.warning },
  gstDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  itemsCard: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.lg },
  itemName: { fontSize: 14, fontWeight: fontWeight.bold, color: colors.textPrimary },
  itemSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  itemTotal: { fontSize: 14, fontWeight: fontWeight.black, color: colors.textPrimary },
  miniStatus: { fontSize: 10, fontWeight: fontWeight.bold, color: colors.textMuted, marginTop: 2 },
  emptyText: { textAlign: 'center', padding: spacing.xl, color: colors.textMuted, fontSize: 12 },
  notesCard: { backgroundColor: colors.surfaceOffset, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  notesText: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 }
});
