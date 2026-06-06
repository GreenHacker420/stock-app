import { useState, useMemo } from "react";
import { View, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Text, Icon, Button } from "react-native-paper";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { 
  useNotificationsQuery, 
  useMarkNotificationReadMutation, 
  useMarkAllNotificationsReadMutation 
} from "../../hooks/useNotifications";

export function Notifications() {
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

  // Format time ago (simple helper)
  const formatTimeAgo = (dateStr: string) => {
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

  // Helper for notification icons and styling based on event type
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

  return (
    <Screen edges={["top", "left", "right"]}>
      <AppHeader title="Alerts" subtitle="In-app events and activity logs" hideAvatar />

      {/* Segmented Button / Tabs */}
      <View style={styles.tabContainer}>
        <View style={styles.tabBar}>
          <Pressable 
            onPress={() => setFilterUnread(false)}
            style={[styles.tabButton, !filterUnread && styles.tabButtonActive]}
          >
            <Text style={[styles.tabButtonText, !filterUnread && styles.tabButtonTextActive]}>
              ALL
            </Text>
            {notificationsQuery.data && notificationsQuery.data.length > 0 && (
              <View style={styles.badgeCount}>
                <Text style={styles.badgeText}>{notificationsQuery.data.length}</Text>
              </View>
            )}
          </Pressable>
          <Pressable 
            onPress={() => setFilterUnread(true)}
            style={[styles.tabButton, filterUnread && styles.tabButtonActive]}
          >
            <Text style={[styles.tabButtonText, filterUnread && styles.tabButtonTextActive]}>
              UNREAD
            </Text>
            {unreadCount > 0 && (
              <View style={[styles.badgeCount, { backgroundColor: colors.danger }]}>
                <Text style={styles.badgeText}>{unreadCount}</Text>
              </View>
            )}
          </Pressable>
        </View>

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

      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {notificationsQuery.isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Fetching alerts...</Text>
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
                  <View style={styles.cardHeader}>
                    <View style={[styles.iconWrapper, { backgroundColor: styleMeta.bg }]}>
                      <Icon source={styleMeta.icon} size={20} color={styleMeta.color} />
                    </View>
                    <View style={styles.cardContent}>
                      <View style={styles.titleRow}>
                        <Text style={[
                          styles.eventTitle, 
                          !notification.isRead && styles.unreadText
                        ]}>
                          {notification.triggerEvent.replace(/_/g, " ").toUpperCase()}
                        </Text>
                        <Text style={styles.timeText}>
                          {formatTimeAgo(notification.createdAt)}
                        </Text>
                      </View>
                      <Text style={styles.messageText}>
                        {notification.message}
                      </Text>
                      {notification.shop && (
                        <Text style={styles.shopText}>
                          📍 {notification.shop.name} ({notification.shop.city})
                        </Text>
                      )}
                    </View>
                  </View>

                  {!notification.isRead && (
                    <View style={styles.unreadDot} />
                  )}
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  tabBar: {
    flexDirection: "row",
    gap: spacing.md,
  },
  tabButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    gap: 6,
  },
  tabButtonActive: {
    borderBottomColor: colors.primary,
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: fontWeight.extrabold,
    color: colors.textSecondary,
    letterSpacing: 0.8,
  },
  tabButtonTextActive: {
    color: colors.primary,
  },
  badgeCount: {
    backgroundColor: colors.textSecondary,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 9,
    color: colors.textInverse,
    fontWeight: fontWeight.bold,
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
    paddingBottom: 120, // space to float above bottom bar
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
    backgroundColor: "rgba(22, 163, 74, 0.01)",
    ...shadow.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  cardContent: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  eventTitle: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  unreadText: {
    color: colors.primary,
  },
  timeText: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: fontWeight.medium,
  },
  messageText: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    fontWeight: fontWeight.semibold,
    lineHeight: 20,
  },
  shopText: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
    marginTop: 2,
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
});
