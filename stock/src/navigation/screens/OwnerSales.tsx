import { useMemo, useState, useRef, useEffect } from "react";
import { View, StyleSheet, Pressable, Alert, Modal as RNModal } from "react-native";
import { Divider, Text, Icon, Portal, Modal, Switch, TextInput as PaperTextInput } from "react-native-paper";
import { useAuthStore } from "../../auth/auth-store";
import { FlashList } from "@shopify/flash-list";
import { useDebounce } from "use-debounce";
import { useRoute, useNavigation, type RouteProp } from "@react-navigation/native";
import { type NativeStackNavigationProp } from "@react-navigation/native-stack";
import Svg, { Path } from "react-native-svg";
import { useSalesQuery, useSaleQuery, useAmendSaleMutation, useIssueInvoiceMutation, useCancelInvoiceMutation, useUpdateSaleMutation } from "../../hooks/useSales";
import { useItemsQuery } from "../../hooks/useItems";
import { usePaymentsQuery, useAttachPaymentMutation, useVerifyPaymentMutation, useMarkPaymentMismatchMutation } from "../../hooks/usePayments";
import { parseMoneyToMinor, fromMinorUnits } from "../../features/sales/create/core/sale-calculations";
import { AppBottomSheetModal } from "../../components/overlays/AppBottomSheetModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { useShopsQuery } from "../../hooks/useShops";
import { shareSaleInvoicePdf } from "../../utils/pdf";
import { triggerLightHaptic, triggerMediumHaptic } from "../../utils/haptics";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { ScrollView } from "react-native-gesture-handler";
import Reanimated, { useSharedValue, useAnimatedStyle, LinearTransition, type SharedValue, FadeInUp } from "react-native-reanimated";

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

type PaymentSwipeActionProps = {
  progress: SharedValue<number>;
  type: "VERIFY" | "REJECT";
};

function PaymentSwipeAction({ progress, type }: PaymentSwipeActionProps) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: Math.max(0.8, progress.value),
      },
    ],
  }));

  const isVerify = type === "VERIFY";

  return (
    <View style={isVerify ? styles.swipeLeftAction : styles.swipeRightAction}>
      <Reanimated.View style={animatedStyle}>
        <Icon
          source={isVerify ? "check-bold" : "close-thick"}
          size={24}
          color="white"
        />
      </Reanimated.View>
    </View>
  );
}

type SaleDetailRoute = RouteProp<Record<string, { id: string }>, "SaleDetail">;
type SaleDetailNavigation = NativeStackNavigationProp<any, "SaleDetail">;

const formatMinorUnits = (valueMinor?: number | null) => {
  if (valueMinor === null || valueMinor === undefined || isNaN(valueMinor)) return "₹0.00";
  const absolutePaise = Math.abs(valueMinor);
  const rupees = Math.floor(absolutePaise / 100);
  const paise = absolutePaise % 100;
  const formatted = `${rupees}.${String(paise).padEnd(2, "0")}`;
  const localized = Number(formatted).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return valueMinor < 0 ? `-₹${localized}` : `₹${localized}`;
};


const formatRawMoney = (value?: string | number | null) => {
  if (value === null || value === undefined) return "—";
  const minor = parseMoneyToMinor(value);
  if (minor === null) return "—";
  return formatMinorUnits(minor);
};

export function SaleDetail() {
  const route = useRoute<SaleDetailRoute>();
  const navigation = useNavigation<SaleDetailNavigation>();
  const saleId = route.params?.id;
  const insets = useSafeAreaInsets();

  const user = useAuthStore((state) => state.user);
  const shopsQuery = useShopsQuery();

  const saleQuery = useSaleQuery(saleId);
  const sale = saleQuery.data as (Sale & { staff?: { name: string } | null }) | undefined;

  const saleShopId = sale?.shopId;
  const saleShop = useMemo(() =>
    shopsQuery.data?.find(s => s.id === saleShopId),
    [shopsQuery.data, saleShopId]
  );

  const unlinkedPaymentsQuery = usePaymentsQuery(
    saleShopId || undefined,
    {
      customerId: sale?.customerId ? (sale.customerId as string) : undefined,
      unlinked: true,
    },
    {
      enabled: Boolean(saleShopId) && Boolean(sale?.customerId) && sale?.paymentStatus !== "PAID" && !sale?.isWalkin,
    }
  );

  const attachPaymentMutation = useAttachPaymentMutation(saleShopId || undefined);
  const verifyPaymentMutation = useVerifyPaymentMutation(saleShopId || undefined);
  const rejectPaymentMutation = useMarkPaymentMismatchMutation(saleShopId || undefined);
  
  const swipeableRefs = useRef<Record<string, any>>({});

  const handleVerifyPayment = (paymentId: string) => {
    // Close the swipeable row before mutation so UI doesn't linger in swiped state
    swipeableRefs.current[paymentId]?.close();
    triggerMediumHaptic();
    verifyPaymentMutation.mutate({ paymentId }, {
      onSuccess: () => {
        saleQuery.refetch();
        Alert.alert("Success", "Payment verified successfully!");
      },
      onError: (err: any) => {
        Alert.alert("Error", err.message || "Failed to verify payment");
      }
    });
  };

  const handleRejectPayment = (paymentId: string) => {
    // Close the swipeable row before mutation
    swipeableRefs.current[paymentId]?.close();
    triggerMediumHaptic();
    rejectPaymentMutation.mutate({ paymentId, note: "Rejected by owner" }, {
      onSuccess: () => {
        saleQuery.refetch();
        Alert.alert("Success", "Payment marked as mismatch.");
      },
      onError: (err: any) => {
        Alert.alert("Error", err.message || "Failed to reject payment");
      }
    });
  };

  const requestVerifyPayment = (payment: any) => {
    Alert.alert(
      "Verify Payment",
      `Confirm that payment of ${formatRawMoney(payment.amount)} was received?`,
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => {
            swipeableRefs.current[payment.id]?.close();
          }
        },
        {
          text: "Verify",
          onPress: () => handleVerifyPayment(payment.id)
        }
      ]
    );
  };

  const requestRejectPayment = (payment: any) => {
    Alert.alert(
      "Mark Mismatch",
      `Are you sure you want to mark payment of ${formatRawMoney(payment.amount)} as mismatch/rejected?`,
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => {
            swipeableRefs.current[payment.id]?.close();
          }
        },
        {
          text: "Reject",
          style: "destructive",
          onPress: () => handleRejectPayment(payment.id)
        }
      ]
    );
  };

  const [sharing, setSharing] = useState(false);

  // GST Invoice Mutations
  const issueInvoiceMutation = useIssueInvoiceMutation();
  const cancelInvoiceMutation = useCancelInvoiceMutation();
  const updateSaleMutation = useUpdateSaleMutation();

  const [isInvoiceModalVisible, setIsInvoiceModalVisible] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");

  const [isGstModalVisible, setIsGstModalVisible] = useState(false);
  const [editGstRequired, setEditGstRequired] = useState(false);

  const [selectedItemDetails, setSelectedItemDetails] = useState<any | null>(null);
  const [footerHeight, setFooterHeight] = useState(0);

  // Parse customer signature once — avoids IIFE on every render
  const parsedSignature = useMemo(() => {
    if (!sale?.customerSignature) return null;
    try {
      const parsed = JSON.parse(sale.customerSignature);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { paths: (parsed.paths || []) as string[], viewBox: (parsed.viewBox || "0 0 300 150") as string };
      } else if (Array.isArray(parsed)) {
        return { paths: parsed as string[], viewBox: getSignatureViewBox(parsed) };
      }
      return null;
    } catch (e) {
      console.error("Failed to parse signature:", e);
      return null;
    }
  }, [sale?.customerSignature]);

  const handleOpenGstModal = () => {
    if (!sale) return;
    setEditGstRequired(sale.isGstRequired || sale.gstRequired || false);
    setIsGstModalVisible(true);
  };

  const handleSaveGstDetails = () => {
    if (!sale) return;
    updateSaleMutation.mutate({
      saleId: sale.id,
      data: {
        gstRequired: editGstRequired,
      }
    }, {
      onSuccess: () => {
        setIsGstModalVisible(false);
        saleQuery.refetch();
        Alert.alert("Success", "GST requirement updated successfully!");
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
        saleQuery.refetch();
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
              saleId: sale.id,
              data: { reason: "Cancelled by owner" }
            }, {
              onSuccess: () => {
                saleQuery.refetch();
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

  const handleSharePdf = async () => {
    if (!sale) return;
    if (sharing) return;
    setSharing(true);
    try {
      await shareSaleInvoicePdf({
        sale,
        shop: saleShop ?? undefined,
      });
    } catch (error) {
      Alert.alert(
        "Unable to share invoice",
        error instanceof Error ? error.message : "Invoice sharing failed."
      );
    } finally {
      setSharing(false);
    }
  };

  const renderLeftActions = (progress: SharedValue<number>) => {
    return <PaymentSwipeAction progress={progress} type="VERIFY" />;
  };

  const renderRightActions = (progress: SharedValue<number>) => {
    return <PaymentSwipeAction progress={progress} type="REJECT" />;
  };

  if (saleQuery.isLoading) {
    return (
      <Screen edges={["top", "left", "right", "bottom"]}>
        <AppHeader title="Loading Details..." showBack />
        <SkeletonList />
      </Screen>
    );
  }

  if (saleQuery.isError) {
    return (
      <Screen edges={["top", "left", "right", "bottom"]}>
        <AppHeader title="Error" showBack />
        <EmptyState
          title="Error loading sale"
          subtitle={saleQuery.error?.message || "Something went wrong."}
          action={
            <Button
              label="Retry"
              variant="secondary"
              onPress={() => saleQuery.refetch()}
            />
          }
        />
      </Screen>
    );
  }

  if (!sale) {
    return (
      <Screen edges={["top", "left", "right", "bottom"]}>
        <AppHeader title="Not Found" showBack />
        <EmptyState
          title="Sale not found"
          subtitle="The requested transaction record could not be found or has been deleted."
        />
      </Screen>
    );
  }

  // Financial locking policies
  const totalAmountMinor = parseMoneyToMinor(sale.totalAmount) ?? 0;

  // Verified payments only — these are settled
  const verifiedPaymentMinor = sale.payments?.reduce((sum, p) =>
    p.status === "VERIFIED" ? sum + (parseMoneyToMinor(p.amount) ?? 0) : sum, 0) ?? 0;

  // Recorded (unverified) payments — received by staff but not yet confirmed by owner
  const recordedPaymentMinor = sale.payments?.reduce((sum, p) =>
    p.status === "RECORDED" ? sum + (parseMoneyToMinor(p.amount) ?? 0) : sum, 0) ?? 0;

  // Pending verification = recorded but not verified (same data, clearer naming for display)
  const pendingPaymentMinor = recordedPaymentMinor;

  // Balance = total minus verified AND recorded (both reduce the outstanding)
  const balanceDueMinor = Math.max(0, totalAmountMinor - verifiedPaymentMinor - recordedPaymentMinor);

  // Only verified amount is "settled" — for the Collect button, show full unverified remainder
  const trulyOutstandingMinor = Math.max(0, totalAmountMinor - verifiedPaymentMinor);

  const gstRequired = Boolean(sale.isGstRequired || sale.gstRequired);
  const hasIssuedInvoice = Boolean(sale.gstInvoiceNumber);
  const canEditGstRequirement = user?.role === "OWNER" && !hasIssuedInvoice;
  const canIssueInvoice = user?.role === "OWNER" && gstRequired && !hasIssuedInvoice;
  const canCancelInvoice = user?.role === "OWNER" && hasIssuedInvoice;

  const hasVerifiedPayment = sale.payments?.some(p => p.status === "VERIFIED");
  const isFinanciallyLocked = sale.paymentStatus === "PAID" || hasVerifiedPayment || hasIssuedInvoice;
  const canDirectEdit = user?.role === "OWNER" && !isFinanciallyLocked;
  const canAmend = user?.role === "OWNER" && isFinanciallyLocked;

  const canAttachExistingPayment =
    Boolean(sale.customerId) &&
    !sale.isWalkin &&
    sale.paymentStatus !== "PAID" &&
    user?.role === "OWNER";

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <AppHeader title={`Sale #${sale.saleNumber}`} subtitle="Transaction Details" showBack />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          paddingBottom: footerHeight + spacing.lg,
          gap: spacing.lg
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* REDESIGNED Hero Summary Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroHeaderRow}>
            <Text style={styles.heroSaleNumber}>Sale #{sale.saleNumber}</Text>
            <StatusPill
              label={sale.paymentStatus || "PENDING"}
              tone={sale.paymentStatus === "PAID" ? "green" : "amber"}
            />
          </View>

          {/* Large Hero Amount */}
          <View style={styles.heroCenterBlock}>
            <Text style={[
              styles.heroMainAmountVal,
              { color: trulyOutstandingMinor > 0 ? colors.warning : colors.success, fontVariant: ['tabular-nums'] }
            ]}>
              {trulyOutstandingMinor > 0 ? formatMinorUnits(trulyOutstandingMinor) : formatRawMoney(sale.totalAmount)}
            </Text>
            <Text style={styles.heroMainAmountLabel}>
              {trulyOutstandingMinor > 0 ? "Outstanding" : "Total Sale Value (Settled)"}
            </Text>
          </View>

          {/* Financial Breakdown Grid */}
          <View style={styles.heroBreakdownRow}>
            <View style={styles.heroBreakdownCell}>
              <Text style={styles.heroBreakdownLabel}>Total Value</Text>
              <Text style={[styles.heroBreakdownVal, { fontVariant: ['tabular-nums'] }]}>
                {formatRawMoney(sale.totalAmount)}
              </Text>
            </View>
            <View style={styles.heroBreakdownDivider} />
            <View style={styles.heroBreakdownCell}>
              <Text style={styles.heroBreakdownLabel}>Verified Paid</Text>
              <Text style={[styles.heroBreakdownVal, { color: colors.success, fontVariant: ['tabular-nums'] }]}>
                {formatMinorUnits(verifiedPaymentMinor)}
              </Text>
            </View>
          </View>

          {/* Pending verification row — only shown when there are pending payments */}
          {pendingPaymentMinor > 0 && (
            <View style={[styles.heroBreakdownRow, { marginTop: spacing.xs }]}>
              <View style={styles.heroBreakdownCell}>
                <Text style={[styles.heroBreakdownLabel, { color: colors.warning }]}>Pending Verification</Text>
                <Text style={[styles.heroBreakdownVal, { color: colors.warning, fontVariant: ['tabular-nums'] }]}>
                  {formatMinorUnits(pendingPaymentMinor)}
                </Text>
              </View>
              <View style={styles.heroBreakdownDivider} />
              <View style={styles.heroBreakdownCell}>
                <Text style={[styles.heroBreakdownLabel, { color: colors.warning }]}>Balance Due</Text>
                <Text style={[styles.heroBreakdownVal, { color: colors.warning, fontVariant: ['tabular-nums'] }]}>
                  {formatMinorUnits(balanceDueMinor)}
                </Text>
              </View>
            </View>
          )}

          <Divider style={styles.heroDivider} />

          <View style={styles.metaGrid}>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Customer</Text>
              <Text style={styles.metaVal}>{sale.isWalkin ? "Walk-in Customer" : sale.customer?.name}</Text>
            </View>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Date & Time</Text>
              <Text style={styles.metaVal}>
                {new Date(sale.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
              </Text>
            </View>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Billed By</Text>
              <Text style={styles.metaVal}>{sale.staff?.name || "System"}</Text>
            </View>
          </View>
        </View>

        {/* GST Invoice Row — uses normalized gstRequired throughout */}
        <View style={styles.gstStatusCard}>
          <View style={styles.gstStatusHeader}>
            <Icon
              source={
                gstRequired
                  ? (hasIssuedInvoice ? "file-check-outline" : "file-percent-outline")
                  : "file-percent-outline"
              }
              size={22}
              color={
                gstRequired
                  ? (hasIssuedInvoice ? colors.success : colors.warning)
                  : colors.textSecondary
              }
            />
            <View style={styles.gstStatusInfo}>
              <Text style={styles.gstStatusTitle}>
                {!gstRequired
                  ? "GST Not Required"
                  : hasIssuedInvoice
                    ? "GST Invoice Generated"
                    : "GST Invoice Required"}
              </Text>
              <Text style={styles.gstStatusDesc}>
                {!gstRequired
                  ? "No GST invoice required for this sale"
                  : hasIssuedInvoice
                    ? `Tally Ref: ${sale.gstInvoiceNumber}`
                    : "Pending creation in Tally"}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 6 }}>
              {gstRequired ? (
                hasIssuedInvoice ? (
                  <View style={[styles.complianceBadge, styles.complianceBadgeVerified]}>
                    <Text style={styles.complianceBadgeText}>Issued</Text>
                  </View>
                ) : (
                  <View style={[styles.complianceBadge, styles.complianceBadgeWarning]}>
                    <Text style={styles.complianceBadgeText}>Pending Tally</Text>
                  </View>
                )
              ) : (
                <View style={[styles.complianceBadge, styles.complianceBadgeMuted]}>
                  <Text style={styles.complianceBadgeText}>Exempt</Text>
                </View>
              )}
              {/* GST action buttons — Edit, Issue, Cancel */}
              <View style={{ flexDirection: "row", gap: spacing.xs }}>
                {canEditGstRequirement && (
                  <Button
                    label="Edit"
                    variant="ghost"
                    onPress={handleOpenGstModal}
                    style={styles.gstActionBtn}
                    size="sm"
                  />
                )}
                {canIssueInvoice && (
                  <Button
                    label="Issue"
                    variant="primary"
                    onPress={handleOpenIssueInvoice}
                    style={styles.gstActionBtn}
                    size="sm"
                  />
                )}
                {canCancelInvoice && (
                  <Button
                    label="Cancel"
                    variant="ghost"
                    onPress={handleCancelInvoice}
                    style={styles.gstActionBtn}
                    size="sm"
                  />
                )}
              </View>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Items Billed</Text>
          {canDirectEdit ? (
            <Button
              label="Edit Sale"
              variant="ghost"
              onPress={() => navigation.navigate("EditSale", { saleId: sale.id })}
              style={styles.itemsEditBtn}
              size="sm"
            />
          ) : null
          /* Amend hidden until a real amendment workflow (separate route, audit record,
             reason capture) is implemented. canAmend is intentionally unused here. */}
        </View>
        <View style={styles.itemsCard}>
          {sale.items?.map((item: any, idx: number) => {
            const billedRateMinor = parseMoneyToMinor(item.rate);
            const defaultRateMinor = parseMoneyToMinor(item.item?.defaultSellingPrice);
            const isPriceModified = billedRateMinor !== null && defaultRateMinor !== null && billedRateMinor !== defaultRateMinor;
            const itemName = item.item?.name || item.itemName || "Deleted product";
            const itemUnit = item.item?.unit || item.itemUnit || "units";
            const quantity = Number(item.quantity);

            const lineTotalMinor = billedRateMinor !== null ? quantity * billedRateMinor : 0;

            return (
              <View key={item.id}>
                <Pressable
                  onPress={() => setSelectedItemDetails(item)}
                  style={({ pressed }) => [styles.itemRowPressable, pressed && { backgroundColor: colors.surfaceOffset }]}
                >
                  <View style={styles.itemRow}>
                    <View style={{ flex: 1, marginRight: spacing.md }}>
                      <Text style={styles.itemName}>{itemName}</Text>
                      <View style={styles.itemMetaRow}>
                        <Text style={styles.itemSub}>
                          {quantity} {itemUnit} × {formatRawMoney(item.rate)}
                        </Text>
                        {isPriceModified && (
                          <View style={styles.rateAdjustedBadge}>
                            <Text style={styles.rateAdjustedText}>Rate Adjusted</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[styles.itemTotal, { fontVariant: ["tabular-nums"] }]}>
                        {formatMinorUnits(lineTotalMinor)}
                      </Text>
                      {isPriceModified && (
                        <Text style={styles.itemOriginalText}>
                          List: {formatRawMoney(item.item?.defaultSellingPrice)}
                        </Text>
                      )}
                    </View>
                  </View>
                </Pressable>
                {idx < (sale.items?.length ?? 0) - 1 && <Divider style={styles.divider} />}
              </View>
            );
          })}
        </View>

        {/* Payments Ledger Section */}
        <Section title="Payment Timeline">
          <Reanimated.View layout={LinearTransition} style={styles.timelineContainer}>
            {sale.payments?.map((p: any, index: number) => {
              const collectedBy = p.staff?.name ? `Collected by ${p.staff.name}` : null;
              const verifiedBy = p.verifiedBy?.name ? `Verified by ${p.verifiedBy.name}` : null;
              const upiRef = p.upiTransactionId ? `UPI Ref: ${p.upiTransactionId}` : null;
              const bankUtr = p.bankTransactionUtr ? `UTR: ${p.bankTransactionUtr}` : null;
              const cheque = p.chequeNumber ? `Cheque #${p.chequeNumber}` : null;
              const isPending = p.status === "RECORDED";
              const isRejected = p.status === "REJECTED";

              const iconName =
                p.paymentMode === "CASH" ? "cash" :
                p.paymentMode === "UPI" ? "qrcode" :
                p.paymentMode === "BANK_TRANSFER" ? "bank" : "file-document-outline";

              const lineTone = p.status === "VERIFIED" ? "verified" : "pending";

              return (
                <View style={styles.timelineNode} key={p.id}>
                  {index < (sale.payments?.length ?? 0) - 1 && (
                    <View style={[styles.timelineLine, lineTone === "verified" && styles.timelineLineActive]} />
                  )}

                  <View style={[styles.timelineDot, p.status === "VERIFIED" && styles.timelineDotActive, isRejected && styles.timelineDotRejected]}>
                    <Icon source={iconName} size={12} color={p.status === "VERIFIED" ? colors.primary : isRejected ? colors.danger : colors.textSecondary} />
                  </View>

                  <ReanimatedSwipeable
                    ref={(el) => { swipeableRefs.current[p.id] = el; }}
                    enabled={user?.role === "OWNER" && p.status === "RECORDED"}
                    renderLeftActions={renderLeftActions}
                    renderRightActions={renderRightActions}
                    onSwipeableOpen={(direction) => {
                      if (direction === "right") {
                        requestVerifyPayment(p);
                      } else if (direction === "left") {
                        requestRejectPayment(p);
                      }
                    }}
                  >
                    <View style={[styles.paymentCard, isPending && styles.paymentCardPending, isRejected && styles.paymentCardRejected]}>
                      <View style={styles.paymentCardRow}>
                        <View style={styles.paymentInfo}>
                          <Text style={styles.paymentTitle}>{p.paymentMode} Payment</Text>
                          <Text style={styles.paymentTime}>
                            {new Date(p.receivedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                          </Text>

                          {collectedBy ? <Text style={styles.paymentMeta}>{collectedBy}</Text> : null}
                          {upiRef ? <Text style={styles.paymentDetails}>{upiRef}</Text> : null}
                          {bankUtr ? <Text style={styles.paymentDetails}>{bankUtr}</Text> : null}
                          {cheque ? <Text style={styles.paymentDetails}>{cheque}</Text> : null}

                          {p.status === "VERIFIED" ? (
                            <Text style={styles.paymentVerification}>
                              ✓ {verifiedBy || "Verified"} {p.verifiedAt ? `on ${new Date(p.verifiedAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}` : ""}
                            </Text>
                          ) : isRejected ? (
                            <Text style={[styles.paymentMeta, { color: colors.danger }]}>
                              ✗ Rejected / Mismatch
                            </Text>
                          ) : (
                            <Text style={[styles.paymentMeta, styles.paymentVerificationPending]}>
                              ⚠ Pending Verification {user?.role === "OWNER" ? "• Swipe to verify" : ""}
                            </Text>
                          )}

                          {p.notes ? (
                            <Text style={styles.paymentNotes}>Note: {p.notes}</Text>
                          ) : null}
                        </View>

                        <View style={{ alignItems: 'flex-end', justifyContent: 'space-between', gap: 6 }}>
                          <Text style={[styles.itemTotal, { fontVariant: ["tabular-nums"] }]}>{formatRawMoney(p.amount)}</Text>
                          <StatusPill
                            label={p.status}
                            tone={p.status === 'VERIFIED' ? 'green' : p.status === 'REJECTED' ? 'red' : 'amber'}
                          />
                        </View>
                      </View>

                      {isPending && user?.role === "OWNER" && (
                        <View style={styles.paymentInlineActionsRow}>
                          <Button
                            label="Verify"
                            variant="primary"
                            size="sm"
                            onPress={() => requestVerifyPayment(p)}
                            disabled={verifyPaymentMutation.isPending || rejectPaymentMutation.isPending}
                            style={styles.paymentInlineActionBtn}
                          />
                          <Button
                            label="Mismatch"
                            variant="secondary"
                            size="sm"
                            onPress={() => requestRejectPayment(p)}
                            disabled={verifyPaymentMutation.isPending || rejectPaymentMutation.isPending}
                            style={styles.paymentInlineActionBtn}
                          />
                        </View>
                      )}
                    </View>
                  </ReanimatedSwipeable>
                </View>
              );
            })}
            {sale.payments?.length === 0 && <Text style={styles.emptyText}>No payments recorded yet.</Text>}
          </Reanimated.View>
        </Section>

        {/* Unlinked Payments Attachment Block */}
        {canAttachExistingPayment && (
          <Section title="Link Existing Payments">
            <Reanimated.View layout={LinearTransition} style={styles.itemsCard}>
              {unlinkedPaymentsQuery.isLoading ? (
                <Text style={styles.emptyText}>Loading unlinked payments...</Text>
              ) : !unlinkedPaymentsQuery.data || unlinkedPaymentsQuery.data.length === 0 ? (
                <Text style={styles.emptyText}>No unlinked payments found for this customer.</Text>
              ) : (
                unlinkedPaymentsQuery.data.map((p: any, idx: number) => {
                  const paymentAmountMinor = parseMoneyToMinor(p.amount) ?? 0;
                  const excessMinor = Math.max(0, paymentAmountMinor - balanceDueMinor);

                  return (
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
                          <Text style={[styles.itemTotal, { fontVariant: ["tabular-nums"] }]}>{formatRawMoney(p.amount)}</Text>
                          <Button
                            label="ATTACH"
                            variant="ghost"
                            loading={attachPaymentMutation.isPending && attachPaymentMutation.variables?.paymentId === p.id}
                            disabled={attachPaymentMutation.isPending}
                            onPress={() => {
                              Alert.alert(
                                "Attach Payment",
                                `Confirm attachment of this payment?
                                
Payment Amount: ${formatMinorUnits(paymentAmountMinor)}
Sale Balance: ${formatMinorUnits(balanceDueMinor)}
Excess: ${formatMinorUnits(excessMinor)}
Payment Method: ${p.paymentMode}
Payment Date: ${new Date(p.receivedAt).toLocaleString("en-IN")}`,
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
                                          saleQuery.refetch();
                                          unlinkedPaymentsQuery.refetch();
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
                  );
                })
              )}
            </Reanimated.View>
          </Section>
        )}

        {/* Customer signature — parsed once via useMemo, not on every render */}
        {parsedSignature && parsedSignature.paths.length > 0 && (
          <Section title="Customer Signature">
            <View style={styles.signatureDisplayCard}>
              <View style={styles.signaturePaperGrid}>
                <Svg style={styles.signatureSvg} viewBox={parsedSignature.viewBox}>
                  {parsedSignature.paths.map((path: string, index: number) => (
                    <Path
                      key={index}
                      d={path}
                      stroke={colors.primary}
                      strokeWidth={3}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                </Svg>
                <View style={styles.signatureLineWrapper}>
                  <Text style={styles.signatureX}>X</Text>
                  <View style={styles.signatureLineDashed} />
                </View>
              </View>
              <Text style={styles.signatureDisplayHint}>
                Acknowledgment signature collected at billing
              </Text>
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
      </ScrollView>

      {/* Sticky Bottom Actions Footer */}
      <View
        onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
        style={[styles.stickyBottomBar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}
      >
        {/* Only show Collect when there is a genuine outstanding amount */}
        {trulyOutstandingMinor > 0 && sale.paymentStatus !== "PAID" && (sale as any).status !== "CANCELLED" && (
          <Button
            label={`Collect ${formatMinorUnits(trulyOutstandingMinor)}`}
            variant="success"
            icon="currency-inr"
            onPress={() => navigation.navigate("TakePayment", {
              customerId: sale.customerId,
              customer: sale.customer,
              saleId: sale.id,
              amount: fromMinorUnits(trulyOutstandingMinor)
            })}
            style={styles.collectBtn}
            fullWidth
          />
        )}
        <View style={styles.shareRow}>
          <Button
            label="View Invoice"
            variant="ghost"
            icon="eye-outline"
            onPress={() => navigation.navigate("InvoiceViewer", { sale, shop: saleShop })}
            style={styles.viewBtn}
          />
          <Button
            label="Share"
            variant="primary"
            icon="share-variant-outline"
            loading={sharing}
            disabled={sharing}
            onPress={handleSharePdf}
            style={styles.shareBtn}
          />
        </View>
      </View>

      {/* Specification Bottom Sheet */}
      <AppBottomSheetModal
        visible={selectedItemDetails !== null}
        title="Item Specification"
        onDismiss={() => setSelectedItemDetails(null)}
      >
        {selectedItemDetails && (() => {
          const item = selectedItemDetails.item;
          const itemName = item?.name || selectedItemDetails.itemName || "Deleted product";
          const sku = item?.sku || "—";
          const brandName = item?.brand?.name || "—";
          const categoryName = item?.category?.name || "—";
          const unitName = item?.unit || selectedItemDetails.itemUnit || "—";
          const mrpVal = item?.mrp || selectedItemDetails.mrp || 0;
          const defaultPriceVal = item?.defaultSellingPrice || selectedItemDetails.defaultPrice || 0;
          const minPriceVal = item?.minimumAllowedPrice || item?.minPrice || 0;

          return (
            <View style={{ gap: spacing.sm }}>
              <Text style={[styles.itemName, { fontSize: 16, marginBottom: spacing.md }]}>{itemName}</Text>
              
              <View style={styles.metaCell}>
                <Text style={styles.metaLabel}>SKU Code</Text>
                <Text style={styles.metaVal}>{sku}</Text>
              </View>
              <View style={styles.metaCell}>
                <Text style={styles.metaLabel}>Company / Brand</Text>
                <Text style={styles.metaVal}>{brandName}</Text>
              </View>
              <View style={styles.metaCell}>
                <Text style={styles.metaLabel}>Category</Text>
                <Text style={styles.metaVal}>{categoryName}</Text>
              </View>
              <View style={styles.metaCell}>
                <Text style={styles.metaLabel}>Measurement Unit</Text>
                <Text style={styles.metaVal}>{unitName}</Text>
              </View>
              
              <Divider style={{ marginVertical: spacing.sm, backgroundColor: colors.border }} />

              <View style={styles.metaCell}>
                <Text style={styles.metaLabel}>Maximum Retail Price (MRP)</Text>
                <Text style={[styles.metaVal, { fontWeight: fontWeight.bold }]}>{formatRawMoney(mrpVal)}</Text>
              </View>
              <View style={styles.metaCell}>
                <Text style={styles.metaLabel}>Original Selling Price</Text>
                <Text style={styles.metaVal}>{formatRawMoney(defaultPriceVal)}</Text>
              </View>
              <View style={styles.metaCell}>
                <Text style={styles.metaLabel}>Billed Selling Rate</Text>
                <Text style={[styles.metaVal, { color: colors.primary, fontWeight: fontWeight.black }]}>{formatRawMoney(selectedItemDetails.rate)}</Text>
              </View>
              <View style={styles.metaCell}>
                <Text style={styles.metaLabel}>Minimum Allowed Price</Text>
                <Text style={styles.metaVal}>{formatRawMoney(minPriceVal)}</Text>
              </View>
            </View>
          );
        })()}
      </AppBottomSheetModal>

      {/* Edit GST Details Bottom Sheet */}
      <AppBottomSheetModal
        visible={isGstModalVisible}
        title="Edit GST Details"
        onDismiss={() => setIsGstModalVisible(false)}
        isBusy={updateSaleMutation.isPending}
      >
        <View style={{ marginVertical: spacing.md, gap: spacing.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 14, fontWeight: fontWeight.bold, color: colors.textPrimary }}>GST Invoice Required</Text>
            <Switch
              value={editGstRequired}
              onValueChange={setEditGstRequired}
              color={colors.primary}
            />
          </View>
        </View>

        <View style={styles.shareRow}>
          <Button
            label="Cancel"
            variant="ghost"
            onPress={() => setIsGstModalVisible(false)}
            style={{ flex: 1 }}
          />
          <Button
            label="Save"
            variant="primary"
            loading={updateSaleMutation.isPending}
            disabled={updateSaleMutation.isPending}
            onPress={handleSaveGstDetails}
            style={{ flex: 1.5 }}
          />
        </View>
      </AppBottomSheetModal>

      {/* Issue GST Invoice Bottom Sheet */}
      <AppBottomSheetModal
        visible={isInvoiceModalVisible}
        title="Issue GST Invoice"
        onDismiss={() => setIsInvoiceModalVisible(false)}
        isBusy={issueInvoiceMutation.isPending}
      >
        <View style={{ marginVertical: spacing.md }}>
          <PaperTextInput
            mode="outlined"
            label="Tally Invoice Number"
            value={invoiceNumber}
            onChangeText={setInvoiceNumber}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
            textColor={colors.textPrimary}
            placeholder="e.g. VS-2026-145"
            autoCapitalize="characters"
            style={{ backgroundColor: colors.surface }}
          />
        </View>

        <View style={styles.shareRow}>
          <Button
            label="Cancel"
            variant="ghost"
            onPress={() => setIsInvoiceModalVisible(false)}
            style={{ flex: 1 }}
          />
          <Button
            label="Issue"
            variant="primary"
            loading={issueInvoiceMutation.isPending}
            disabled={issueInvoiceMutation.isPending || !invoiceNumber.trim()}
            onPress={handleConfirmIssueInvoice}
            style={{ flex: 1.5 }}
          />
        </View>
      </AppBottomSheetModal>
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
  detailScroll: { paddingHorizontal: spacing.lg, paddingBottom: 180, gap: spacing.lg },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  heroCenterBlock: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: spacing.md,
    width: "100%",
  },
  heroMainAmountVal: {
    fontSize: 34,
    fontWeight: fontWeight.black,
    textAlign: "center",
  },
  heroMainAmountLabel: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 4,
  },
  heroBreakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    backgroundColor: colors.surfaceOffset,
    borderRadius: 16,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroBreakdownCell: {
    flex: 1,
    alignItems: "center",
  },
  heroBreakdownDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
  },
  heroBreakdownLabel: {
    fontSize: 9,
    color: colors.textSecondary,
    fontWeight: fontWeight.bold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  heroBreakdownVal: {
    fontSize: 14,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  heroCurrencySymbol: {
    fontSize: 18,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
    marginRight: 2,
  },
  barcodeWrapper: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    alignItems: "flex-end",
    opacity: 0.6,
  },
  barcodeLines: {
    flexDirection: "row",
    height: 18,
    alignItems: "stretch",
  },
  barcodeBar: {
    backgroundColor: colors.textPrimary,
    height: "100%",
  },
  barcodeText: {
    fontSize: 7,
    fontFamily: "monospace",
    color: colors.textMuted,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  heroBadgeRow: {
    marginBottom: spacing.md,
  },
  heroDivider: {
    width: "100%",
    marginVertical: spacing.md,
    backgroundColor: colors.border,
  },
  metaGrid: {
    width: "100%",
    gap: spacing.sm,
  },
  metaCell: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 4,
    gap: spacing.md,
  },
  metaLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
    minWidth: 80,
  },
  metaVal: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    flex: 1,
    textAlign: "right",
  },
  ticketTearWrapper: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 8,
    overflow: "hidden",
  },
  ticketTearDashed: {
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    marginTop: 3,
    marginHorizontal: -10,
  },
  complianceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  complianceBadgeVerified: {
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    borderColor: "rgba(16, 185, 129, 0.4)",
  },
  complianceBadgeWarning: {
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    borderColor: "rgba(245, 158, 11, 0.4)",
  },
  complianceBadgeMuted: {
    backgroundColor: colors.surfaceOffset,
    borderColor: colors.border,
  },
  complianceBadgeText: {
    fontSize: 9,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },

  gstStatusCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadow.sm,
  },
  gstStatusHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  gstStatusInfo: {
    flex: 1,
  },
  gstStatusTitle: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  gstStatusDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  gstActionBtn: {
    minHeight: 32,
    paddingHorizontal: spacing.sm,
  },

  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  itemHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  itemMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: 2,
  },
  itemSubText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  rateAdjustedBadge: {
    backgroundColor: colors.warningLight || "rgba(217, 119, 6, 0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  rateAdjustedText: {
    fontSize: 9,
    fontWeight: fontWeight.bold,
    color: colors.warning,
  },
  itemTotalText: {
    fontSize: 14,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  itemOriginalText: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },

  timelineContainer: {
    position: "relative",
    paddingLeft: spacing.xl + 4,
    marginTop: spacing.sm,
  },
  timelineLine: {
    position: "absolute",
    left: 9,
    top: 24,
    bottom: 24,
    width: 2,
    backgroundColor: colors.border,
  },
  timelineNode: {
    position: "relative",
    marginBottom: spacing.md,
  },
  timelineDot: {
    position: "absolute",
    left: -spacing.xl - 5,
    top: 18,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.surfaceOffset,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  timelineDotActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight || "rgba(79, 70, 229, 0.1)",
  },
  paymentCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadow.sm,
  },
  paymentCardPending: {
    borderColor: colors.warning,
    backgroundColor: "rgba(217, 119, 6, 0.02)",
  },
  paymentCardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  paymentInfo: {
    flex: 1,
    gap: 2,
  },
  paymentTitle: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  paymentTime: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  paymentMeta: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  paymentDetails: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: fontWeight.bold,
    marginTop: 2,
  },
  paymentVerification: {
    fontSize: 11,
    color: colors.success,
    fontStyle: "italic",
    marginTop: 2,
  },
  paymentVerificationPending: {
    color: colors.warning,
    fontSize: 11,
    marginTop: 2,
  },
  paymentNoteCard: {
    backgroundColor: colors.surfaceOffset,
    padding: 6,
    borderRadius: radius.sm,
    marginTop: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  paymentNoteText: {
    fontSize: 11,
    color: colors.textSecondary,
  },

  swipeLeftAction: {
    width: 80,
    backgroundColor: colors.success,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 16,
    height: "100%",
  },
  swipeRightAction: {
    width: 80,
    backgroundColor: colors.danger,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 16,
    height: "100%",
  },

  stickyBottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    ...shadow.lg,
  },
  collectBtn: {
    marginBottom: spacing.sm,
  },
  shareRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  viewBtn: {
    flex: 1,
  },
  shareBtn: {
    flex: 1,
  },

  gestureRoot: {
    flex: 1,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.lg,
  },
  sheetHandle: {
    width: 40,
    height: 5,
    backgroundColor: colors.border,
    borderRadius: 3,
    alignSelf: "center",
    marginBottom: spacing.lg,
  },
  overlay: {
    width: "100%",
  },

  itemsCard: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  itemName: { fontSize: 14, fontWeight: fontWeight.bold, color: colors.textPrimary },
  emptyText: { textAlign: 'center', padding: spacing.xl, color: colors.textMuted, fontSize: 12 },
  notesCard: { backgroundColor: colors.surfaceOffset, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  notesText: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  itemRowPressable: { borderRadius: radius.md },
  signatureDisplayCard: {
    backgroundColor: 'white',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  signaturePaperGrid: {
    width: "100%",
    backgroundColor: "rgba(243, 244, 246, 0.4)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  signatureLineWrapper: {
    flexDirection: "row",
    alignItems: "center",
    width: "80%",
    marginTop: spacing.sm,
  },
  signatureX: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    marginRight: 6,
  },
  signatureLineDashed: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    borderStyle: "dashed",
    height: 1,
    marginTop: 6,
  },
  signatureSvg: {
    width: '100%',
    height: 80,
  },
  signatureDisplayHint: {
    fontSize: 10,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: 8,
  },
  itemsEditBtn: {
    paddingHorizontal: spacing.sm,
    height: 32,
  },
  paymentRowBlock: { paddingVertical: spacing.xs },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.lg },
  itemSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  paymentMetaText: { fontSize: 11, color: colors.textSecondary, marginTop: 1, fontWeight: fontWeight.medium },
  itemTotal: { fontSize: 14, fontWeight: fontWeight.black, color: colors.textPrimary },
  heroHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: spacing.md,
  },
  heroSaleNumber: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  heroMainRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    width: "100%",
    marginBottom: spacing.md,
  },
  timelineLineActive: {
    backgroundColor: colors.primary,
  },
  timelineDotRejected: {
    borderColor: colors.danger,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  paymentCardRejected: {
    borderColor: colors.danger,
    backgroundColor: "rgba(239, 68, 68, 0.02)",
  },
  paymentInlineActionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  paymentInlineActionBtn: {
    flex: 1,
    minHeight: 36,
  },
  paymentNotes: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
    fontStyle: "italic",
  },
});
