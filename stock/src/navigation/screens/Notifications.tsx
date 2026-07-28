import { useState, useMemo } from "react";
import { View, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Text, Icon } from "react-native-paper";
import { useRoute } from "@react-navigation/native";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { AppSegmentedControl } from "../../components/ui/AppSegmentedControl";
import { ActivityRow } from "../../components/ui/ActivityRow";
import { VerificationCard } from "../../components/domain/verification/VerificationCard";
import { Button } from "../../components/ui/Button";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { Item } from "../../api/client";
import { useItemsQuery, useCurrentStockQuery } from "../../hooks/useItems";
import { 
  useNotificationsQuery, 
  useMarkNotificationReadMutation, 
  useMarkAllNotificationsReadMutation 
} from "../../hooks/useNotifications";
import { 
  GENERIC_APPROVAL_SUPPORTED_TYPES, 
  usePendingVerificationsQuery, 
  useStaffApprovalsQuery,
  useProcessVerificationMutation 
} from "../../hooks/useVerifications";

export function Notifications() {
  const route = useRoute<any>();
  const user = useAuthStore((state) => state.user);
  const isOwner = user?.role === "OWNER";
  const isTabBarVisible = route.name === "Notifications" || route.name === "OwnerAlerts";
  const showHeader = !isTabBarVisible || isOwner;

  // Items & Stock queries to resolve human-readable item names and stock levels
  const itemsQuery = useItemsQuery({ limit: 1000 });
  const stockQuery = useCurrentStockQuery();

  const itemsMap = useMemo(() => {
    const m = new Map<string, Item>();
    for (const it of itemsQuery.data?.items ?? []) {
      m.set(it.id, it);
    }
    return m;
  }, [itemsQuery.data?.items]);

  const stockMap = useMemo(() => {
    const m = new Map<string, { physicalStock: number }>();
    for (const lvl of stockQuery.data ?? []) {
      m.set(lvl.item.id, { physicalStock: lvl.physicalStock });
    }
    return m;
  }, [stockQuery.data]);

  // Pending Verifications query (for Owner)
  const pendingVerificationsQuery = usePendingVerificationsQuery();
  const processMutation = useProcessVerificationMutation();

  // Staff Requests query (for Staff)
  const staffApprovalsQuery = useStaffApprovalsQuery();

  const verificationsList = isOwner 
    ? (pendingVerificationsQuery.data ?? []) 
    : (staffApprovalsQuery.data ?? []);

  const verificationsCount = verificationsList.length;

  // Primary tab: APPROVALS (for Owner: "Pending Approvals", for Staff: "My Requests") vs ACTIVITY
  const [mainTab, setMainTab] = useState<"REQUESTS" | "ACTIVITY">("REQUESTS");
  const [filterUnread, setFilterUnread] = useState(false);

  const notificationsQuery = useNotificationsQuery();
  const markReadMutation = useMarkNotificationReadMutation();
  const markAllReadMutation = useMarkAllNotificationsReadMutation();

  const handleMarkRead = (id: string) => {
    markReadMutation.mutate(id);
  };

  const handleMarkAllRead = () => {
    markAllReadMutation.mutate();
  };

  const handleProcessVerification = (item: any, status: "APPROVED" | "REJECTED") => {
    processMutation.mutate({ id: item.id, status, type: item.type || item.action });
  };

  const filteredNotifications = useMemo(() => {
    const data = notificationsQuery.data ?? [];
    if (filterUnread) {
      return data.filter(n => !n.isRead);
    }
    return data;
  }, [notificationsQuery.data, filterUnread]);

  const unreadCount = useMemo(() => {
    return (notificationsQuery.data ?? []).filter(n => !n.isRead).length;
  }, [notificationsQuery.data]);

  // Format time ago
  const formatTimeAgo = (dateStr: string) => {
    if (!dateStr) return "";
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getNotificationStyle = (triggerEvent: string) => {
    const event = triggerEvent.toLowerCase();
    if (event.includes("sale") || event.includes("payment")) {
      return {
        icon: "cash-register",
        color: colors.success,
        bg: "rgba(22, 163, 74, 0.08)",
      };
    } else if (event.includes("stock") || event.includes("inventory")) {
      return {
        icon: "warehouse",
        color: colors.primary,
        bg: "rgba(34, 197, 94, 0.08)",
      };
    } else if (event.includes("correction") || event.includes("mismatch") || event.includes("bounce")) {
      return {
        icon: "alert-circle-outline",
        color: colors.danger,
        bg: "rgba(220, 38, 38, 0.08)",
      };
    } else if (event.includes("rate") || event.includes("price")) {
      return {
        icon: "tag-outline",
        color: colors.warning,
        bg: "rgba(217, 119, 6, 0.08)",
      };
    }
    return {
      icon: "bell-outline",
      color: colors.textSecondary,
      bg: colors.surfaceOffset,
    };
  };

  const renderStockDetails = (item: any) => {
    const payload = item.payloadJson || item.requestedChangeJson || item.details || {};
    const entries: Array<{
      itemId?: string;
      itemName?: string;
      name?: string;
      sku?: string;
      unit?: string;
      currentStock?: number;
      quantity?: number;
    }> = Array.isArray(payload.entries) ? payload.entries : payload.items || (payload.itemId ? [payload] : []);

    if (entries.length === 0) {
      return (
        <View style={styles.genericBody}>
          <Text style={styles.actionText}>{item.reason || item.type || "Stock Request"}</Text>
        </View>
      );
    }

    return (
      <View style={styles.stockDetailsContainer}>
        {entries.map((entry, idx) => {
          const targetId = entry.itemId || "";
          const itemObj = itemsMap.get(targetId);
          const stockObj = stockMap.get(targetId);

          const name = entry.itemName || entry.name || itemObj?.name || (targetId ? `Item #${targetId.slice(-6)}` : `Item ${idx + 1}`);
          const sku = entry.sku || itemObj?.sku;
          const current = entry.currentStock ?? stockObj?.physicalStock ?? 0;
          const qty = entry.quantity ?? 0;
          const proposed = current + qty;
          const unit = entry.unit || itemObj?.unit || "pcs";
          const isAddition = qty >= 0;

          return (
            <View key={targetId || idx} style={styles.itemStockRow}>
              <View style={styles.itemNameCol}>
                <Text style={styles.itemNameText} numberOfLines={2}>{name}</Text>
                {sku ? <Text style={styles.itemSkuText}>SKU: {sku}</Text> : null}
              </View>

              <View style={styles.stockBadgeContainer}>
                {/* Current Stock Pill */}
                <View style={styles.currentStockPill}>
                  <Text style={styles.currentStockPillText}>
                    Current: <Text style={styles.boldText}>{current} {unit}</Text>
                  </Text>
                </View>

                <Icon source="arrow-right" size={14} color={colors.textMuted} />

                {/* Proposed Stock Pill */}
                <View style={[styles.proposedStockPill, isAddition ? styles.proposedPositive : styles.proposedNegative]}>
                  <Icon source="clock-outline" size={11} color={isAddition ? colors.success : colors.danger} />
                  <Text style={[styles.proposedStockPillText, isAddition ? { color: colors.success } : { color: colors.danger }]}>
                    Proposed: <Text style={styles.boldText}>{proposed} {unit}</Text> ({isAddition ? `+${qty}` : qty})
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  const getStatusTone = (statusStr: string): "amber" | "green" | "red" | "neutral" => {
    const s = String(statusStr).toUpperCase();
    if (s.includes("APPROVED")) return "green";
    if (s.includes("REJECTED") || s.includes("CANCEL")) return "red";
    if (s.includes("PENDING")) return "amber";
    return "neutral";
  };

  const getStatusLabel = (statusStr: string): string => {
    const s = String(statusStr).toUpperCase();
    if (s.includes("APPROVED")) return "APPROVED";
    if (s.includes("REJECTED")) return "REJECTED";
    return "PENDING APPROVAL";
  };

  return (
    <Screen edges={["top", "left", "right"]}>
      {showHeader ? (
        <AppHeader title="Alerts & Requests" subtitle={isOwner ? "Review pending staff requests" : "Track your requests & activity"} hideAvatar />
      ) : (
        <View style={styles.headerSpacer}>
          <Text style={styles.pageTitle}>Alerts & Requests</Text>
          <Text style={styles.pageSubtitle}>{isOwner ? "Review pending staff requests" : "Track your requests & activity"}</Text>
        </View>
      )}

      {/* Main Mode Tabs: Requests vs Activity Logs */}
      <View style={styles.mainTabContainer}>
        <AppSegmentedControl
          value={mainTab}
          onChange={(val) => setMainTab(val as any)}
          options={[
            {
              value: "REQUESTS",
              label: isOwner ? "Pending Approvals" : "My Requests",
              icon: "shield-check-outline",
              badge: verificationsCount || undefined
            },
            {
              value: "ACTIVITY",
              label: "Activity Logs",
              icon: "bell-outline",
              badge: unreadCount || undefined
            },
          ]}
        />
      </View>

      {/* Secondary filter bar for Activity Logs tab */}
      {mainTab === "ACTIVITY" && (
        <View style={styles.tabContainer}>
          <AppSegmentedControl
            value={filterUnread ? "UNREAD" : "ALL"}
            onChange={(value) => setFilterUnread(value === "UNREAD")}
            options={[
              { value: "ALL", label: "All Logs", badge: notificationsQuery.data?.length || undefined },
              { value: "UNREAD", label: "Unread", badge: unreadCount || undefined },
            ]}
            style={styles.tabs}
          />

          {unreadCount > 0 && (
            <Pressable 
              onPress={handleMarkAllRead}
              disabled={markAllReadMutation.isPending}
              style={({ pressed }) => [styles.markAllReadBtn, pressed && styles.pressed]}
            >
              <Text style={styles.markAllReadText}>Mark all read</Text>
            </Pressable>
          )}
        </View>
      )}

      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* REQUESTS TAB CONTENT */}
        {mainTab === "REQUESTS" ? (
          (isOwner ? pendingVerificationsQuery.isLoading : staffApprovalsQuery.isLoading) ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>
                {isOwner ? "Fetching pending approvals..." : "Fetching your requests..."}
              </Text>
            </View>
          ) : verificationsList.length === 0 ? (
            <EmptyState 
              icon="check-circle-outline" 
              title={isOwner ? "No pending approvals!" : "No requests created yet"} 
              subtitle={isOwner ? "All staff requests have been processed." : "Requests you create for stock entries or adjustments will appear here with their results."} 
              action={
                <Button 
                  label="Refresh" 
                  onPress={() => isOwner ? pendingVerificationsQuery.refetch() : staffApprovalsQuery.refetch()} 
                />
              }
            />
          ) : (
            <View style={styles.listContainer}>
              {verificationsList.map((item: any) => {
                const approvalType = item.type || item.action || item.entityType || "APPROVAL";
                const statusStr = item.status || "PENDING";
                const canApprove = isOwner && GENERIC_APPROVAL_SUPPORTED_TYPES.has(approvalType) && statusStr === "PENDING";
                const isStockType = approvalType.includes("STOCK") || approvalType.includes("DAMAGE");
                const tone = getStatusTone(statusStr);
                const statusLabel = getStatusLabel(statusStr);

                return (
                  <VerificationCard
                    key={item.id}
                    title={approvalType.replace(/_/g, " ")}
                    subtitle={isOwner ? `Requested by: ${item.requestedBy?.name || "Staff"}` : `Created by you`}
                    status={statusLabel}
                    statusTone={tone}
                    createdAt={item.createdAt ? formatTimeAgo(item.createdAt) : undefined}
                    actions={canApprove ? (
                      <>
                        <Button
                          variant="danger"
                          icon="close-circle-outline"
                          label="Reject"
                          onPress={() => handleProcessVerification(item, 'REJECTED')}
                          loading={processMutation.isPending && processMutation.variables?.status === 'REJECTED' && processMutation.variables?.id === item.id}
                          style={{ flex: 1 }}
                        />
                        <Button
                          variant="success"
                          icon="check-decagram"
                          label="Approve"
                          onPress={() => handleProcessVerification(item, 'APPROVED')}
                          loading={processMutation.isPending && processMutation.variables?.status === 'APPROVED' && processMutation.variables?.id === item.id}
                          style={{ flex: 1 }}
                        />
                      </>
                    ) : undefined}
                  >
                    {isStockType ? renderStockDetails(item) : (
                      <View style={styles.genericBody}>
                        <Text style={styles.actionText}>{approvalType.replace(/_/g, " ")}</Text>
                      </View>
                    )}

                    {item.reason ? (
                      <View style={styles.reasonBox}>
                        <Icon source="text-box-outline" size={13} color={colors.textMuted} />
                        <Text style={styles.notes}>"{item.reason}"</Text>
                      </View>
                    ) : null}

                    {/* Show Rejection Reason if available */}
                    {statusStr === "REJECTED" && item.rejectedReason ? (
                      <View style={styles.rejectedReasonBox}>
                        <Icon source="alert-circle-outline" size={13} color={colors.danger} />
                        <Text style={styles.rejectedReasonText}>
                          Owner Note: "{item.rejectedReason}"
                        </Text>
                      </View>
                    ) : null}
                  </VerificationCard>
                );
              })}
            </View>
          )
        ) : (
          /* ACTIVITY LOGS TAB CONTENT */
          notificationsQuery.isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Fetching activity logs...</Text>
            </View>
          ) : filteredNotifications.length === 0 ? (
            <EmptyState 
              icon="bell-outline" 
              title={filterUnread ? "All caught up!" : "No notifications"} 
              subtitle={filterUnread ? "No unread alerts left to review." : "We'll let you know when new alerts arrive."} 
            />
          ) : (
            <View style={styles.listContainer}>
              {filteredNotifications.map((notification) => {
                const styleMeta = getNotificationStyle(notification.triggerEvent);
                return (
                  <Pressable
                    key={notification.id}
                    onPress={() => !notification.isRead && handleMarkRead(notification.id)}
                    style={({ pressed }) => [
                      styles.notificationCard,
                      !notification.isRead && styles.unreadCard,
                      pressed && styles.pressed
                    ]}
                  >
                    <ActivityRow
                      icon={styleMeta.icon}
                      title={notification.triggerEvent.replace(/_/g, " ").toUpperCase()}
                      subtitle={`${notification.message}${notification.shop ? ` • ${notification.shop.name} (${notification.shop.city})` : ""}`}
                      time={formatTimeAgo(notification.createdAt)}
                    />

                    {!notification.isRead && (
                      <View style={styles.unreadDot} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          )
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerSpacer: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
    marginTop: 2,
  },
  mainTabContainer: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  tabContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  tabs: {
    flex: 1,
    maxWidth: 220,
  },
  markAllReadBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  markAllReadText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: fontWeight.extrabold,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 120,
  },
  loadingContainer: {
    padding: spacing.huge,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  listContainer: {
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  notificationCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: spacing.lg,
    position: "relative",
    ...shadow.sm,
  },
  unreadCard: {
    borderColor: "rgba(22, 163, 74, 0.15)",
    backgroundColor: "#f7fdf9",
    ...shadow.md,
  },
  unreadDot: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  pressed: {
    opacity: 0.75,
  },
  genericBody: {
    marginVertical: spacing.xs,
  },
  actionText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  reasonBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surfaceOffset,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  rejectedReasonBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
  },
  rejectedReasonText: {
    fontSize: fontSize.xs,
    color: colors.danger,
    fontWeight: fontWeight.medium,
    flex: 1,
  },
  notes: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontStyle: 'italic',
    flex: 1,
  },
  stockDetailsContainer: {
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginVertical: spacing.xs,
    gap: spacing.xs,
  },
  itemStockRow: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.xs,
  },
  itemNameCol: {
    flex: 1,
  },
  itemNameText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  itemSkuText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  stockBadgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: 4,
  },
  currentStockPill: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  currentStockPillText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  proposedStockPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  proposedPositive: {
    backgroundColor: "rgba(22, 163, 74, 0.08)",
    borderColor: colors.success,
  },
  proposedNegative: {
    backgroundColor: "rgba(220, 38, 38, 0.08)",
    borderColor: colors.danger,
  },
  proposedStockPillText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  boldText: {
    fontWeight: fontWeight.bold,
  },
});
