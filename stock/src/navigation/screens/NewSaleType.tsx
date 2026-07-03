import React, { useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { Text, Icon, SegmentedButtons, Divider } from "react-native-paper";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { AppSearchBar } from "../../components/ui/AppSearchBar";
import { useSalesQuery } from "../../hooks/useSales";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { EmptyState } from "../../components/ui/EmptyState";
import { navigate } from "../navigation-ref";

function money(value?: string | number | null) {
  return `₹${Number(value ?? 0).toLocaleString("en-IN")}`;
}

export function NewSaleType() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL"); // ALL, PAID, PENDING, PARTIAL

  const { data: sales, isLoading } = useSalesQuery();

  const handleStartWalkIn = () => {
    navigate("WalkInSale");
  };

  const handleStartRegular = () => {
    navigate("RegularSale");
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
      <AppHeader title="Sales Hub" subtitle="Register payments and log customer transactions" showBack />

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
              <Icon source="walk" size={28} color={colors.primary} />
            </View>
            <View style={styles.cardTextContent}>
              <Text style={styles.cardTitle}>Walk-in Sale</Text>
              <Text style={styles.cardSubtitle}>
                No customer account required. Paid instantly.
              </Text>
            </View>
            <View style={styles.arrowIcon}>
              <Icon source="chevron-right" size={20} color={colors.primary} />
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
              <Icon source="account-cash-outline" size={28} color="#0d9488" />
            </View>
            <View style={styles.cardTextContent}>
              <Text style={styles.cardTitle}>Regular Sale</Text>
              <Text style={styles.cardSubtitle}>
                Link to customer. Allows credit, terms, or split payment.
              </Text>
            </View>
            <View style={styles.arrowIcon}>
              <Icon source="chevron-right" size={20} color="#0d9488" />
            </View>
          </Pressable>
        </View>

        {/* History Section */}
        <View style={styles.historyHeader}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
        </View>

        <View style={styles.filterSection}>
          <AppSearchBar
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
                    onPress={() => navigate("SaleDetail", { id: sale.id })}
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
    paddingBottom: 100,
  },
  actionGrid: {
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.xl,
    borderRadius: 24,
    borderWidth: 1,
    ...shadow.sm,
  },
  walkinCard: {
    backgroundColor: '#f0fdf4',
    borderColor: 'rgba(22, 163, 74, 0.25)',
  },
  regularCard: {
    backgroundColor: '#f0fdfa',
    borderColor: 'rgba(13, 148, 136, 0.25)',
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walkinIconContainer: {
    backgroundColor: colors.primaryLight,
  },
  regularIconContainer: {
    backgroundColor: '#ccfbf1',
  },
  cardTextContent: {
    flex: 1,
    marginLeft: spacing.lg,
    gap: 2,
  },
  cardTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  cardSubtitle: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 16,
    paddingRight: spacing.sm,
  },
  arrowIcon: {
    opacity: 0.5,
  },
  historyHeader: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  filterSection: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  searchBar: {
    height: 48,
  },
  searchInput: {
    fontSize: 14,
  },
  segmentedFilter: {
    height: 40,
  },
  salesListContainer: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.sm,
  },
  saleItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walkinAvatar: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#dcfce7',
  },
  customerAvatar: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  avatarText: {
    fontSize: 12,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  saleInfo: {
    flex: 1,
    marginLeft: spacing.md,
    gap: 2,
  },
  saleCustomer: {
    fontSize: fontSize.md - 1,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  saleDetails: {
    fontSize: 11,
    color: colors.textMuted,
  },
  salePriceInfo: {
    alignItems: 'flex-end',
    gap: 6,
  },
  saleAmount: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: fontWeight.black,
  },
  divider: {
    backgroundColor: colors.surfaceOffset,
  },
  loaderContainer: {
    paddingTop: spacing.md,
  },
  emptyContainer: {
    paddingVertical: spacing.huge,
  },
  pressedCard: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  pressedRow: {
    backgroundColor: colors.surfaceOffset,
  }
});
