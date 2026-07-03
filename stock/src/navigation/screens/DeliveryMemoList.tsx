import React from "react";
import { View, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { FAB } from "react-native-paper";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { useDeliveryMemosQuery } from "../../hooks/useDeliveryMemos";
import { DeliveryMemoCard } from "../../components/domain/delivery/DeliveryMemoCard";
import { colors, spacing, radius } from "../../theme";
import { navigate } from "../navigation-ref";

const money = (value?: string | number | null) => "₹" + Number(value ?? 0).toLocaleString("en-IN");

export function DeliveryMemoList() {
  const { data: dms, isLoading, isFetching, refetch } = useDeliveryMemosQuery();

  const handlePress = (id: string) => {
    navigate("DeliveryMemoDetail", { id });
  };

  const getStatusTone = (status?: string) => {
    switch (status) {
      case "PAID":
      case "FULLY_PAID":
      case "CONVERTED":
        return "green";
      case "PARTIALLY_PAID":
      case "CREATED":
        return "amber";
      case "CANCELLED":
        return "red";
      case "OVERDUE":
        return "red";
      default:
        return "neutral";
    }
  };

  return (
    <Screen edges={["top", "left", "right"]}>
      <AppHeader 
        title="Delivery Memos" 
        subtitle="Manage kachha bills and collections." 
        showBack
      />

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : dms && dms.length > 0 ? (
        <View style={styles.flex1}>
          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl 
                refreshing={isFetching} 
                onRefresh={refetch} 
                colors={[colors.primary]} 
              />
            }
          >
            {dms.map((dm: any) => {
              const dateStr = new Date(dm.createdAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric"
              });

              return (
                <DeliveryMemoCard
                  key={dm.id}
                  number={dm.dmNumber}
                  date={dateStr}
                  customerName={dm.customer?.name || "Walk-in Customer"}
                  status={dm.status || "CREATED"}
                  statusTone={getStatusTone(dm.status)}
                  estimatedAmount={money(dm.estimatedAmount)}
                  paidAmount={money(dm.paidAmount)}
                  balanceAmount={money(dm.balanceAmount)}
                  balanceTone={Number(dm.balanceAmount) > 0 ? "red" : "default"}
                  itemCount={dm.items?.length || 0}
                  onPress={() => handlePress(dm.id)}
                />
              );
            })}
          </ScrollView>

          <FAB
            icon="plus"
            style={styles.fab}
            color="#ffffff"
            onPress={() => navigate("CreateDeliveryMemo")}
            label="New Memo"
          />
        </View>
      ) : (
        <View style={styles.flex1}>
          <EmptyState 
            title="No Delivery Memos" 
            subtitle="Create your first kachha bill / delivery memo to get started."
            icon="truck-delivery"
          />
          <FAB
            icon="plus"
            style={styles.fab}
            color="#ffffff"
            onPress={() => navigate("CreateDeliveryMemo")}
            label="New Memo"
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 110,
    gap: spacing.md,
  },
  fab: {
    position: "absolute",
    margin: 24,
    right: 0,
    bottom: 24,
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
  },
});
