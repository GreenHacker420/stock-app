import { useMemo, useState, useCallback, useEffect } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Modal as RNModal,
  Platform,
  Alert,
} from "react-native";
import { Text, Divider, Icon } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";
import DateTimePicker from "@react-native-community/datetimepicker";

import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { ActionTile } from "../../components/ui/ActionTile";
import { Button } from "../../components/ui/Button";
import { useSalesQuery } from "../../hooks/useSales";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { EmptyState } from "../../components/ui/EmptyState";
import { navigate } from "../navigation-ref";
import { type Sale } from "../../api/client";
import { triggerLightHaptic, triggerMediumHaptic } from "../../utils/haptics";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import {
  countSalesByStatus,
  effectiveSaleStatus,
  filterSalesForPeriod,
  getSalePeriodRange,
  saleMatchesSearch,
  type SaleDateFilter,
  type SaleStatusFilter,
} from "../../features/sales/create/core/sales-list-filter";
import {
  clearLocalSaleDraft,
  listLocalSaleDrafts,
  type StoredSaleDraft,
} from "../../features/sales/create/core/sale-draft-storage";

function money(value?: string | number | null) {
  return `₹${Number(value ?? 0).toLocaleString("en-IN")}`;
}

const haptic = (s: "light" | "medium" = "light") => {
  if (s === "medium") triggerMediumHaptic();
  else triggerLightHaptic();
};

const TypedFlashList = FlashList as any;

function localDraftCustomerName(localDraft: StoredSaleDraft) {
  const customer = localDraft.draft.customer;
  if (customer.kind === "EXISTING") return customer.customer.name;
  if (customer.kind === "QUICK_WALK_IN") return customer.name || "Customer";
  return "Customer";
}

function localDraftTotal(localDraft: StoredSaleDraft) {
  return Object.values(localDraft.draft.lines)
    .reduce((total, line) => total + line.quantity * line.rateMinor, 0) / 100;
}

export function NewSaleType() {
  const userId = useAuthStore((state) => state.user?.id);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const [search, setSearch] = useState("");
  const [debSearch, setDebSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SaleStatusFilter>("ALL");
  const [dateFilter, setDateFilter] = useState<SaleDateFilter>("TODAY");

  // Custom date picker states
  const [customStartDate, setCustomStartDate] = useState<Date>(new Date());
  const [customEndDate, setCustomEndDate] = useState<Date>(new Date());
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [activePickerField, setActivePickerField] = useState<"start" | "end" | null>(null);
  const [localDrafts, setLocalDrafts] = useState<StoredSaleDraft[]>([]);

  const refreshLocalDrafts = useCallback(() => {
    if (!userId || !activeShopId) {
      setLocalDrafts([]);
      return;
    }
    setLocalDrafts(listLocalSaleDrafts(userId, activeShopId));
  }, [activeShopId, userId]);

  useFocusEffect(useCallback(() => {
    refreshLocalDrafts();
  }, [refreshLocalDrafts]));

  const periodRange = useMemo(
    () => getSalePeriodRange(dateFilter, new Date(), customStartDate, customEndDate),
    [customEndDate, customStartDate, dateFilter],
  );
  const salesQueryOptions = useMemo(() => ({
    dateFrom: periodRange?.start.toISOString(),
    dateTo: periodRange?.end.toISOString(),
    limit: 200,
  }), [periodRange]);
  const { data: sales, isLoading, refetch, isRefetching } = useSalesQuery(salesQueryOptions);

  // Debounce search input for performance
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebSearch(search);
    }, 180);
    return () => clearTimeout(handler);
  }, [search]);

  const handleStartWalkIn = () => {
    haptic("medium");
    navigate("WalkInSale");
  };

  const handleStartRegular = () => {
    haptic("medium");
    navigate("RegularSale");
  };

  const handleResumeDraft = useCallback((localDraft: StoredSaleDraft) => {
    haptic("medium");
    if (localDraft.mode === "REGULAR") {
      navigate("RegularSale", { draftId: localDraft.id });
    } else {
      navigate("WalkInSale", { draftId: localDraft.id });
    }
  }, []);

  const handleDiscardDraft = useCallback((localDraft: StoredSaleDraft) => {
    if (!userId || !activeShopId) return;
    Alert.alert(
      "Discard unfinished sale?",
      "This only removes the saved checkout from this device.",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            clearLocalSaleDraft(userId, activeShopId, localDraft.mode, localDraft.id);
            refreshLocalDrafts();
          },
        },
      ],
    );
  }, [activeShopId, refreshLocalDrafts, userId]);

  const periodSales = useMemo(
    () => filterSalesForPeriod(sales ?? [], periodRange),
    [periodRange, sales],
  );
  const searchedPeriodSales = useMemo(
    () => periodSales.filter((sale) => saleMatchesSearch(sale, debSearch)),
    [debSearch, periodSales],
  );
  const filteredSales = useMemo(
    () => searchedPeriodSales.filter(
      (sale) => statusFilter === "ALL" || effectiveSaleStatus(sale) === statusFilter,
    ),
    [searchedPeriodSales, statusFilter],
  );

  // Calculate summary metrics for active period (excluding cancelled sales)
  const summaryMetrics = useMemo(() => {
    let totalRevenue = 0;
    let paidTotal = 0;
    let pendingTotal = 0;
    let activeCount = 0;
    let cancelledCount = 0;

    for (const s of periodSales) {
      const isCancelled = s.saleStatus === "CANCELLED" || (s as any).status === "CANCELLED";
      if (isCancelled) {
        cancelledCount++;
        continue;
      }

      activeCount++;
      const total = Number(s.totalAmount) || 0;
      const paid = Number(s.paidAmount) || (s.paymentStatus === "PAID" ? total : 0);
      const balance = Number(s.balanceAmount) || (s.paymentStatus === "PAID" ? 0 : Math.max(0, total - paid));

      totalRevenue += total;
      paidTotal += paid;
      pendingTotal += balance;
    }

    return {
      count: periodSales.length,
      activeCount,
      cancelledCount,
      totalRevenue,
      paidTotal,
      pendingTotal,
    };
  }, [periodSales]);

  const counts = useMemo(
    () => countSalesByStatus(searchedPeriodSales),
    [searchedPeriodSales],
  );

  const getStatusColors = (paymentStatus?: string, saleStatus?: string) => {
    if (saleStatus === "CANCELLED" || paymentStatus === "CANCELLED") {
      return { label: "CANCELLED", text: colors.danger, bg: colors.dangerLight, border: "rgba(220,38,38,0.25)" };
    }
    switch (paymentStatus) {
      case "PAID":
        return { label: "PAID", text: colors.success, bg: colors.successLight, border: "rgba(22,163,74,0.15)" };
      case "PARTIAL":
        return { label: "PARTIAL", text: colors.warning, bg: colors.warningLight, border: "rgba(217,119,6,0.15)" };
      default:
        return { label: paymentStatus || "PENDING", text: colors.danger, bg: colors.dangerLight, border: "rgba(220,38,38,0.15)" };
    }
  };

  const onRefresh = useCallback(async () => {
    haptic("medium");
    await refetch();
  }, [refetch]);

  const renderSaleRow = useCallback(({ item, index }: { item: Sale; index: number }) => {
    const isCancelled = item.saleStatus === "CANCELLED" || (item as any).status === "CANCELLED";
    const statusColors = getStatusColors(item.paymentStatus, item.saleStatus);
    const initials = isCancelled
      ? "✕"
      : item.isWalkin
      ? "WK"
      : item.customer?.name
      ? item.customer.name.substring(0, 2).toUpperCase()
      : "SL";

    const saleDate = new Date(item.saleDate || item.createdAt).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

    const isFirst = index === 0;
    const isLast = index === filteredSales.length - 1;

    return (
      <View>
        <Pressable
          onPress={() => navigate("SaleDetail", { id: item.id })}
          style={({ pressed }) => [
            styles.saleItemRow,
            pressed && styles.pressedRow,
            isCancelled && styles.cancelledRow,
            isFirst && styles.roundedTop,
            isLast && styles.roundedBottom,
          ]}
        >
          <View style={[styles.avatarCircle, isCancelled ? styles.cancelledAvatar : item.isWalkin ? styles.walkinAvatar : styles.customerAvatar]}>
            <Text style={[styles.avatarText, isCancelled && { color: colors.danger }]}>{initials}</Text>
          </View>

          <View style={styles.saleInfo}>
            <Text style={[styles.saleCustomer, isCancelled && styles.cancelledText]} numberOfLines={1}>
              {item.isWalkin ? "Walk-in Customer" : item.customer?.name}
            </Text>
            <Text style={styles.saleDetails}>
              {item.saleNumber} • {saleDate}
            </Text>
          </View>

          <View style={styles.salePriceInfo}>
            <Text style={[styles.saleAmount, isCancelled && styles.cancelledText]}>{money(item.totalAmount)}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColors.bg, borderColor: statusColors.border }]}>
              <Text style={[styles.statusBadgeText, { color: statusColors.text }]}>
                {statusColors.label}
              </Text>
            </View>
          </View>
        </Pressable>
        {!isLast && <Divider style={styles.rowDivider} />}
      </View>
    );
  }, [filteredSales]);

  const ListHeader = useMemo(() => {
    const dateLabel =
      dateFilter === "TODAY" ? "Today" :
      dateFilter === "WEEK" ? "This Week" :
      dateFilter === "CUSTOM"
        ? `${customStartDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} - ${customEndDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
        : "All Time";

    const countLabel = summaryMetrics.cancelledCount > 0
      ? `${summaryMetrics.activeCount} Active • ${summaryMetrics.cancelledCount} Cancelled`
      : `${summaryMetrics.count} Sales`;

    return (
      <View style={styles.headerContainer}>
        {/* Action Grid */}
        <View style={styles.actionGrid}>
          <View style={styles.actionTileWrapper}>
            <ActionTile
              title="Walk-in Sale"
              subtitle="Counter checkout"
              icon="walk"
              tone="green"
              variant="grid"
              onPress={handleStartWalkIn}
            />
          </View>

          <View style={styles.actionTileWrapper}>
            <ActionTile
              title="Regular Sale"
              subtitle="Logged customer"
              icon="account-cash-outline"
              tone="blue"
              variant="grid"
              onPress={handleStartRegular}
            />
          </View>
        </View>

        {localDrafts.length > 0 && (
          <View style={styles.localDraftSection}>
            <View style={styles.localDraftHeader}>
              <Text style={styles.localDraftTitle}>Unfinished sales</Text>
              <Text style={styles.localDraftCount}>{localDrafts.length} saved on this device</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.localDraftScroll}
            >
              {localDrafts.map((localDraft) => {
                const itemCount = Object.values(localDraft.draft.lines)
                  .reduce((count, line) => count + line.quantity, 0);
                const step = localDraft.view.kind === "REGULAR"
                  ? localDraft.view.currentStep
                  : 1;
                return (
                  <Pressable
                    key={localDraft.id}
                    onPress={() => handleResumeDraft(localDraft)}
                    style={({ pressed }) => [
                      styles.localDraftCard,
                      pressed && styles.pressedRow,
                    ]}
                  >
                    <View style={styles.localDraftCardHeader}>
                      <View style={styles.localDraftModeBadge}>
                        <Text style={styles.localDraftModeText}>
                          {localDraft.mode === "REGULAR" ? "REGULAR" : "WALK-IN"}
                        </Text>
                      </View>
                      <Pressable
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel="Discard unfinished sale"
                        onPress={(event) => {
                          event.stopPropagation();
                          handleDiscardDraft(localDraft);
                        }}
                      >
                        <Icon source="trash-can-outline" size={17} color={colors.danger} />
                      </Pressable>
                    </View>
                    <Text style={styles.localDraftCustomer} numberOfLines={1}>
                      {localDraftCustomerName(localDraft)}
                    </Text>
                    <Text style={styles.localDraftDetails}>
                      {itemCount} item{itemCount === 1 ? "" : "s"} • {money(localDraftTotal(localDraft))}
                    </Text>
                    <View style={styles.localDraftFooter}>
                      <Text style={styles.localDraftSavedAt}>
                        Step {step} • {new Date(localDraft.savedAt).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                      <Icon source="arrow-right" size={16} color={colors.primary} />
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Date Filter Segmented Bar */}
        <View style={styles.dateFilterContainer}>
          {(["TODAY", "WEEK", "CUSTOM", "ALL"] as const).map((df) => {
            const active = dateFilter === df;
            let label = "Today";
            if (df === "WEEK") label = "This Week";
            else if (df === "CUSTOM") label = "Custom";
            else if (df === "ALL") label = "All";

            return (
              <Pressable
                key={df}
                onPress={() => {
                  haptic();
                  if (df === "CUSTOM") {
                    setShowCustomModal(true);
                    return;
                  }
                  setDateFilter(df);
                }}
                style={[styles.dateFilterTab, active && styles.dateFilterTabActive]}
              >
                <Text style={[styles.dateFilterTabText, active && styles.dateFilterTabTextActive]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Sales Summary Banner */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeaderRow}>
            <Text style={styles.summaryPeriodLabel}>{dateLabel} Overview</Text>
            <View style={styles.summaryCountBadge}>
              <Text style={styles.summaryCountText}>{countLabel}</Text>
            </View>
          </View>
          <Text style={styles.summaryRevenueVal}>{money(summaryMetrics.totalRevenue)}</Text>

          <View style={styles.summaryBreakdownRow}>
            <View style={styles.summaryBreakdownCol}>
              <Text style={styles.summaryBreakdownLabel}>Collected Paid</Text>
              <Text style={[styles.summaryBreakdownVal, { color: colors.success }]}>
                {money(summaryMetrics.paidTotal)}
              </Text>
            </View>
            <View style={styles.summaryDividerVert} />
            <View style={styles.summaryBreakdownCol}>
              <Text style={styles.summaryBreakdownLabel}>Outstanding Balance</Text>
              <Text style={[styles.summaryBreakdownVal, { color: summaryMetrics.pendingTotal > 0 ? colors.danger : colors.textMuted }]}>
                {money(summaryMetrics.pendingTotal)}
              </Text>
            </View>
          </View>
        </View>

        {/* Section Title */}
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>Transactions ({filteredSales.length})</Text>
        </View>

        {/* Search Bar */}
        <View style={styles.searchBox}>
          <Icon source="magnify" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search invoice or customer..."
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Icon source="close-circle" size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </View>

        {/* Status Filter Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {(["ALL", "PAID", "PENDING", "PARTIAL", "CANCELLED"] as const).map((filter) => {
            const active = statusFilter === filter;
            let label = "All";
            let pillColor: string = colors.textSecondary;
            let pillBg: string = colors.surfaceOffset;

            if (filter === "PAID") {
              label = "Paid";
              pillColor = colors.success;
              pillBg = colors.successLight;
            } else if (filter === "PENDING") {
              label = "Pending";
              pillColor = colors.danger;
              pillBg = colors.dangerLight;
            } else if (filter === "PARTIAL") {
              label = "Partial";
              pillColor = colors.warning;
              pillBg = colors.warningLight;
            } else if (filter === "CANCELLED") {
              label = "Cancelled";
              pillColor = colors.danger;
              pillBg = "rgba(220,38,38,0.1)";
            } else {
              pillColor = colors.primary;
              pillBg = colors.primaryLight;
            }

            return (
              <Pressable
                key={filter}
                onPress={() => {
                  haptic();
                  setStatusFilter(filter);
                }}
                style={[
                  styles.filterPill,
                  active && {
                    backgroundColor: pillBg,
                    borderColor: pillColor,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    active && { color: pillColor, fontWeight: fontWeight.bold },
                  ]}
                >
                  {label}
                </Text>
                <View
                  style={[
                    styles.countBadge,
                    active
                      ? { backgroundColor: pillColor }
                      : { backgroundColor: colors.borderStrong },
                  ]}
                >
                  <Text
                    style={[
                      styles.countBadgeText,
                      active ? { color: "#fff" } : { color: colors.textSecondary },
                    ]}
                  >
                    {counts[filter]}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  }, [
    search,
    statusFilter,
    dateFilter,
    customStartDate,
    customEndDate,
    summaryMetrics,
    counts,
    filteredSales.length,
    handleDiscardDraft,
    handleResumeDraft,
    localDrafts,
  ]);

  return (
    <Screen scroll={false} edges={["top", "left", "right"]}>
      <AppHeader
        title="Sales Hub"
        subtitle="Register payments and log transactions"
        fallbackRoute="Home"
      />

      <View style={styles.listContainer}>
        {isLoading ? (
          <View style={{ paddingHorizontal: spacing.lg }}>
            <SkeletonList count={5} itemHeight={80} />
          </View>
        ) : filteredSales.length === 0 ? (
          <TypedFlashList
            data={[]}
            keyExtractor={(item: Sale) => item.id}
            ListHeaderComponent={ListHeader}
            ListEmptyComponent={
              <EmptyState
                icon="receipt"
                title="No transactions found"
                subtitle={
                  search || statusFilter !== "ALL" || dateFilter !== "ALL"
                    ? "Try adjusting your date or status filters"
                    : "Start by registering a new sale above"
                }
              />
            }
            contentContainerStyle={styles.listContent}
          />
        ) : (
          <TypedFlashList
            data={filteredSales}
            keyExtractor={(item: Sale) => item.id}
            refreshing={isRefetching}
            onRefresh={onRefresh}
            renderItem={renderSaleRow}
            ListHeaderComponent={ListHeader}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>

      {/* Custom Date Range Selection Modal */}
      <RNModal
        visible={showCustomModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCustomModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Custom Date Range</Text>
              <Pressable onPress={() => setShowCustomModal(false)} hitSlop={8}>
                <Icon source="close" size={20} color={colors.textPrimary} />
              </Pressable>
            </View>

            <View style={styles.datePickerRow}>
              <Text style={styles.datePickerLabel}>Start Date</Text>
              <Pressable
                onPress={() => setActivePickerField("start")}
                style={styles.dateDisplayBtn}
              >
                <Text style={styles.dateDisplayText}>
                  {customStartDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </Text>
                <Icon source="calendar" size={18} color={colors.primary} />
              </Pressable>
            </View>

            <View style={styles.datePickerRow}>
              <Text style={styles.datePickerLabel}>End Date</Text>
              <Pressable
                onPress={() => setActivePickerField("end")}
                style={styles.dateDisplayBtn}
              >
                <Text style={styles.dateDisplayText}>
                  {customEndDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </Text>
                <Icon source="calendar" size={18} color={colors.primary} />
              </Pressable>
            </View>

            {activePickerField && (
              <DateTimePicker
                value={activePickerField === "start" ? customStartDate : customEndDate}
                mode="date"
                display={Platform.OS === "ios" ? "inline" : "default"}
                onChange={(event, selectedDate) => {
                  if (Platform.OS === "android") {
                    setActivePickerField(null);
                  }
                  if (selectedDate) {
                    if (activePickerField === "start") setCustomStartDate(selectedDate);
                    else setCustomEndDate(selectedDate);
                  }
                }}
              />
            )}

            <Button
              label="APPLY FILTER"
              variant="primary"
              onPress={() => {
                if (customStartDate.getTime() > customEndDate.getTime()) {
                  Alert.alert("Invalid date range", "The start date must be before the end date.");
                  return;
                }
                setDateFilter("CUSTOM");
                setShowCustomModal(false);
                setActivePickerField(null);
              }}
              style={{ marginTop: spacing.md }}
              fullWidth
            />
          </View>
        </View>
      </RNModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 100,
  },
  headerContainer: {
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  actionGrid: {
    flexDirection: "row",
    gap: spacing.sm,
    width: "100%",
    marginTop: spacing.xs,
  },
  actionTileWrapper: {
    flex: 1,
    minWidth: 0,
  },
  localDraftSection: {
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  localDraftHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  localDraftTitle: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  localDraftCount: {
    fontSize: 10,
    color: colors.textMuted,
  },
  localDraftScroll: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  localDraftCard: {
    width: 190,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 4,
    ...shadow.sm,
  },
  localDraftCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  localDraftModeBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  localDraftModeText: {
    color: colors.primary,
    fontSize: 8,
    fontWeight: fontWeight.black,
  },
  localDraftCustomer: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: fontWeight.bold,
  },
  localDraftDetails: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  localDraftFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 2,
  },
  localDraftSavedAt: {
    color: colors.textMuted,
    fontSize: 9,
  },
  dateFilterContainer: {
    flexDirection: "row",
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.md,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.xs,
  },
  dateFilterTab: {
    flex: 1,
    paddingVertical: spacing.xs + 2,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm - 2,
  },
  dateFilterTabActive: {
    backgroundColor: colors.surface,
    ...shadow.sm,
  },
  dateFilterTabText: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  dateFilterTabTextActive: {
    color: colors.primary,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  summaryHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryPeriodLabel: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryCountBadge: {
    backgroundColor: colors.surfaceOffset,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryCountText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  summaryRevenueVal: {
    fontSize: 22,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    marginVertical: spacing.xs,
  },
  summaryBreakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  summaryBreakdownCol: {
    flex: 1,
    alignItems: "center",
  },
  summaryDividerVert: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
  },
  summaryBreakdownLabel: {
    fontSize: 9,
    color: colors.textMuted,
    fontWeight: fontWeight.semibold,
    textTransform: "uppercase",
  },
  summaryBreakdownVal: {
    fontSize: 12,
    fontWeight: fontWeight.bold,
    marginTop: 2,
  },
  sectionTitleRow: {
    marginTop: spacing.xs,
    marginBottom: -spacing.xs,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    height: 40,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    ...shadow.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    height: "100%",
    padding: 0,
  },
  filterScroll: {
    gap: spacing.sm,
    paddingVertical: 2,
  },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  countBadge: {
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeText: {
    fontSize: 9,
    fontWeight: fontWeight.black,
  },

  /* Grouped list design details */
  saleItemRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 68,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
  },
  cancelledRow: {
    backgroundColor: "rgba(241,245,249,0.7)",
  },
  roundedTop: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
  },
  roundedBottom: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    borderBottomWidth: 1,
    ...shadow.sm,
  },
  rowDivider: {
    backgroundColor: colors.border,
  },
  pressedRow: {
    backgroundColor: colors.surfaceOffset,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  walkinAvatar: {
    backgroundColor: colors.successLight,
    borderWidth: 1,
    borderColor: "rgba(22,163,74,0.1)",
  },
  customerAvatar: {
    backgroundColor: colors.infoLight,
    borderWidth: 1,
    borderColor: "rgba(2,132,199,0.1)",
  },
  cancelledAvatar: {
    backgroundColor: "rgba(220,38,38,0.1)",
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.2)",
  },
  avatarText: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  saleInfo: {
    flex: 1,
    marginLeft: spacing.md,
    gap: 1,
  },
  saleCustomer: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  cancelledText: {
    color: colors.textMuted,
    textDecorationLine: "line-through",
  },
  saleDetails: {
    fontSize: 10,
    color: colors.textMuted,
  },
  salePriceInfo: {
    alignItems: "flex-end",
    gap: 3,
  },
  saleAmount: {
    fontSize: 13,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 8,
    fontWeight: fontWeight.black,
  },

  /* Custom Date Picker Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  datePickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  datePickerLabel: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  dateDisplayBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  dateDisplayText: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
});
