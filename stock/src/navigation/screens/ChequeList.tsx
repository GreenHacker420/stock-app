import { useMemo, useState } from "react";
import { View, StyleSheet, Pressable, FlatList, ActivityIndicator } from "react-native";
import { Text, Icon } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import { useDebounce } from "use-debounce";

import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { AppSearchBar } from "../../components/ui/AppSearchBar";
import { AppSegmentedControl } from "../../components/ui/AppSegmentedControl";
import { StatusPill } from "../../components/ui/StatusPill";
import { EmptyState } from "../../components/ui/EmptyState";
import { useChequesQuery } from "../../hooks/useCheques";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { triggerLightHaptic } from "../../utils/haptics";

const money = (value?: string | number | null) => `₹${Number(value ?? 0).toLocaleString("en-IN")}`;

const haptic = () => {
  triggerLightHaptic();
};

export function ChequeList() {
  const navigation = useNavigation<any>();
  const [activeTab, setActiveTab] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch] = useDebounce(searchQuery, 300);

  const { data: cheques, isLoading, isRefetching, refetch } = useChequesQuery({
    status: activeTab === "ALL" ? undefined : activeTab,
  });

  const filteredCheques = useMemo(() => {
    if (!cheques) return [];
    const query = debouncedSearch.trim().toLowerCase();
    if (!query) return cheques;
    return cheques.filter(c => {
      const chequeNo = c.details?.chequeNumber || "";
      const bankName = c.details?.chequeBankName || "";
      const custName = c.customer?.name || "Walk-In Customer";
      return (
        chequeNo.toLowerCase().includes(query) ||
        bankName.toLowerCase().includes(query) ||
        custName.toLowerCase().includes(query)
      );
    });
  }, [cheques, debouncedSearch]);

  const handleChequePress = (chequeId: string) => {
    haptic();
    navigation.navigate("ChequeDetail", { chequeId });
  };

  const getStatusConfig = (status?: string | null) => {
    switch (status) {
      case "RECEIVED":
        return { label: "Received", tone: "neutral" as const, icon: "file-document-outline" };
      case "DEPOSITED":
        return { label: "Deposited", tone: "blue" as const, icon: "bank-transfer" };
      case "CLEARED":
        return { label: "Cleared", tone: "green" as const, icon: "check-circle-outline" };
      case "BOUNCED":
        return { label: "Bounced", tone: "red" as const, icon: "alert-circle-outline" };
      case "RETURNED":
        return { label: "Returned", tone: "amber" as const, icon: "keyboard-backspace" };
      case "CANCELLED":
        return { label: "Cancelled", tone: "neutral" as const, icon: "close-circle-outline" };
      default:
        return { label: "Unknown", tone: "neutral" as const, icon: "help-circle-outline" };
    }
  };

  return (
    <Screen edges={["top", "left", "right"]}>
      <AppHeader title="Cheque Tracking" subtitle="Monitor received and pending cheques" />

      {/* Search and filter controls */}
      <View style={styles.controlsContainer}>
        <AppSearchBar
          placeholder="Search cheque no., bank, or customer..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />

        <AppSegmentedControl
          options={[
            { label: "All", value: "ALL" },
            { label: "Received", value: "RECEIVED" },
            { label: "Deposited", value: "DEPOSITED" },
            { label: "Cleared", value: "CLEARED" },
            { label: "Bounced", value: "BOUNCED" },
          ]}
          value={activeTab}
          onChange={(val) => {
            haptic();
            setActiveTab(val);
          }}
        />
      </View>

      {/* Main List Area */}
      {isLoading && !isRefetching ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loaderText}>Loading cheques...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredCheques}
          keyExtractor={(item) => item.id}
          onRefresh={refetch}
          refreshing={isRefetching}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const statusConfig = getStatusConfig(item.details?.chequeStatus);
            const formattedDate = item.details?.chequeDate
              ? new Date(item.details.chequeDate).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "No date";

            return (
              <Pressable
                onPress={() => handleChequePress(item.id)}
                style={({ pressed }) => [styles.chequeCard, pressed && styles.chequeCardPressed]}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.chequeInfo}>
                    <Icon source="bank-outline" size={18} color={colors.textSecondary} />
                    <Text style={styles.chequeNoText}>
                      Cheque #{item.details?.chequeNumber || "—"}
                    </Text>
                  </View>
                  <StatusPill label={statusConfig.label} tone={statusConfig.tone} />
                </View>

                <View style={styles.cardBody}>
                  <View style={styles.leftCol}>
                    <Text style={styles.bankName}>{item.details?.chequeBankName || "Unknown Bank"}</Text>
                    <Text style={styles.customerName}>
                      {item.customer?.name || "Walk-In Customer"}
                    </Text>
                  </View>

                  <View style={styles.rightCol}>
                    <Text style={styles.amount}>{money(item.amount)}</Text>
                    <Text style={styles.dateText}>{formattedDate}</Text>
                  </View>
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon="file-document-edit-outline"
              title="No cheques found"
              subtitle={
                searchQuery
                  ? "Try adjusting your search terms."
                  : activeTab !== "ALL"
                  ? `There are no cheques currently in "${activeTab.toLowerCase()}" status.`
                  : "No cheque payments have been recorded yet."
              }
            />
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  controlsContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loaderText: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  chequeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  chequeCardPressed: {
    backgroundColor: colors.surfaceOffset,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  chequeInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  chequeNoText: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  cardBody: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  leftCol: {
    flex: 1,
    gap: 4,
  },
  rightCol: {
    alignItems: "flex-end",
    gap: 4,
  },
  bankName: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  customerName: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  amount: {
    fontSize: 16,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  dateText: {
    fontSize: 11,
    color: colors.textMuted,
  },
});
