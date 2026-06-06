import React, { useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Searchbar, Text, Icon, SegmentedButtons, Divider, Card } from "react-native-paper";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { useSalesQuery } from "../../hooks/useSales";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { EmptyState } from "../../components/ui/EmptyState";

function money(value?: string | number | null) {
  return `₹${Number(value ?? 0).toLocaleString("en-IN")}`;
}

export function NewSaleType() {
  const navigation = useNavigation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL"); // ALL, PAID, PENDING, PARTIAL

  const { data: sales, isLoading } = useSalesQuery();

  const handleStartWalkIn = () => {
    navigation.navigate("WalkInSale" as never);
  };

  const handleStartRegular = () => {
    navigation.navigate("RegularSale" as never);
  };

  const filteredSales = useMemo(() => {
    if (!sales) return [];
    return sales.filter(s => {
      const query = search.toLowerCase();
      const numMatch = s.saleNumber.toLowerCase().includes(query);
      const nameMatch = s.isWalkin 
        ? "walk-in".includes(query)
        : s.customer?.name.toLowerCase().includes(query);

      const matchesSearch = numMatch || nameMatch;
      const matchesStatus = statusFilter === "ALL" || s.paymentStatus === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [sales, search, statusFilter]);

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "PAID":
        return { text: colors.success, bg: colors.successLight };
      case "PARTIAL":
        return { text: colors.warning, bg: colors.warningLight };
      default:
        return { text: colors.danger, bg: colors.dangerLight };
    }
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title="Sales Hub" subtitle="Register payments and log customer transactions" />

      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={styles.scrollContent}
      >
        {/* Action Grid */}
        <View style={styles.actionGrid}>
          <Pressable 
            onPress={handleStartWalkIn} 
            style={({ pressed }) => [
              styles.actionCard, 
              styles.walkinCard,
              pressed && styles.pressedCard
            ]}
          >
            <View style={[styles.iconContainer, styles.walkinIconContainer]}>
              <Icon source="walk" size={28} color="#15803d" />
            </View>
            <View style={styles.cardTextContent}>
              <Text style={styles.cardTitle}>Walk-in Sale</Text>
              <Text style={styles.cardSubtitle}>
                No customer account required. Paid instantly.
              </Text>
            </View>
            <View style={styles.arrowIcon}>
              <Icon source="chevron-right" size={20} color="#15803d" />
            </View>
          </Pressable>

          <Pressable 
            onPress={handleStartRegular}
            style={({ pressed }) => [
              styles.actionCard,
              styles.regularCard,
              pressed && styles.pressedCard
            ]}
          >
            <View style={[styles.iconContainer, styles.regularIconContainer]}>
              <Icon source="account-cash-outline" size={28} color="#1d4ed8" />
            </View>
            <View style={styles.cardTextContent}>
              <Text style={styles.cardTitle}>Regular Sale</Text>
              <Text style={styles.cardSubtitle}>
                Link to customer. Allows credit, terms, or split payment.
              </Text>
            </View>
            <View style={styles.arrowIcon}>
              <Icon source="chevron-right" size={20} color="#1d4ed8" />
            </View>
          </Pressable>
        </View>

        {/* History Section */}
        <View style={styles.historyHeader}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
        </View>

        <View style={styles.filterSection}>
          <Searchbar
            placeholder="Search invoice or customer..."
            onChangeText={setSearch}
            value={search}
            style={styles.searchBar}
            inputStyle={styles.searchInput}
            placeholderTextColor={colors.textMuted}
            iconColor={colors.primary}
          />
          <SegmentedButtons
            value={statusFilter}
            onValueChange={setStatusFilter}
            buttons={[
              { value: "ALL", label: "All" },
              { value: "PAID", label: "Paid" },
              { value: "PENDING", label: "Pending" },
              { value: "PARTIAL", label: "Partial" },
            ]}
            style={styles.segmentedFilter}
            theme={{ colors: { primary: colors.primary } }}
          />
        </View>

        {isLoading ? (
          <View style={styles.loaderContainer}>
            <SkeletonList count={5} itemHeight={76} />
          </View>
        ) : filteredSales.length === 0 ? (
          <View style={styles.emptyContainer}>
            <EmptyState 
              icon="receipt"
              title="No transactions found"
              subtitle={search || statusFilter !== "ALL" ? "Try adjusting your filters" : "Start by registering a new sale above"}
            />
          </View>
        ) : (
          <View style={styles.salesListContainer}>
            {filteredSales.map((sale, idx) => {
              const statusColors = getStatusColor(sale.paymentStatus);
              const initials = sale.isWalkin 
                ? "WK" 
                : (sale.customer?.name ? sale.customer.name.substring(0, 2).toUpperCase() : "SL");

              const saleDate = new Date(sale.createdAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit"
              });

              return (
                <View key={sale.id}>
                  {idx > 0 && <Divider style={styles.divider} />}
                  <Pressable 
                    onPress={() => (navigation as any).navigate("SaleDetail", { id: sale.id })}
                    style={({ pressed }) => [
                      styles.saleItemRow,
                      pressed && styles.pressedRow
                    ]}
                  >
                    <View style={[styles.avatarCircle, sale.isWalkin ? styles.walkinAvatar : styles.customerAvatar]}>
                      <Text style={styles.avatarText}>{initials}</Text>
                    </View>

                    <View style={styles.saleInfo}>
                      <Text style={styles.saleCustomer} numberOfLines={1}>
                        {sale.isWalkin ? "Walk-in Customer" : sale.customer?.name}
                      </Text>
                      <Text style={styles.saleDetails}>
                        {sale.saleNumber} • {saleDate}
                      </Text>
                    </View>

                    <View style={styles.salePriceInfo}>
                      <Text style={styles.saleAmount}>{money(sale.totalAmount)}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: statusColors.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: statusColors.text }]}>
                          {sale.paymentStatus}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 40,
  },
  actionGrid: {
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    ...shadow.sm,
  },
  walkinCard: {
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0",
  },
  regularCard: {
    backgroundColor: "#eff6ff",
    borderColor: "#bfdbfe",
  },
  pressedCard: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  walkinIconContainer: {
    backgroundColor: "#dcfce7",
  },
  regularIconContainer: {
    backgroundColor: "#dbeafe",
  },
  cardTextContent: {
    flex: 1,
    paddingRight: spacing.xs,
  },
  cardTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  cardSubtitle: {
    fontSize: fontSize.sm - 1,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 16,
  },
  arrowIcon: {
    paddingLeft: spacing.xs,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  historyHeader: {
    marginBottom: spacing.md,
  },
  filterSection: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  searchBar: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    elevation: 0,
    height: 52,
    justifyContent: 'center',
    shadowOpacity: 0,
  },
  searchInput: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  segmentedFilter: {
    borderRadius: radius.md,
  },
  loaderContainer: {
    marginTop: spacing.md,
  },
  emptyContainer: {
    marginTop: spacing.xl,
  },
  salesListContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadow.sm,
  },
  saleItemRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    backgroundColor: colors.surface,
  },
  pressedRow: {
    backgroundColor: colors.surfaceOffset,
  },
  divider: {
    backgroundColor: colors.border,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  walkinAvatar: {
    backgroundColor: "#dcfce7",
  },
  customerAvatar: {
    backgroundColor: "#dbeafe",
  },
  avatarText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  saleInfo: {
    flex: 1,
    justifyContent: "center",
  },
  saleCustomer: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  saleDetails: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 4,
  },
  salePriceInfo: {
    alignItems: "flex-end",
    gap: 4,
  },
  saleAmount: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  statusBadgeText: {
    fontSize: fontSize.xs - 1,
    fontWeight: fontWeight.bold,
  },
});
