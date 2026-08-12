import { useEffect, useMemo } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Button, Text } from "react-native-paper";

import {
  cancelWaBroadcast,
  discardWaBroadcastDraft,
  fetchWaBroadcast,
  fetchWaBroadcastRecipients,
  retryFailedWaBroadcast,
  sendWaBroadcast,
  stopWaBroadcast,
  type WaBroadcast,
  type WaBroadcastRecipient,
} from "../../../api/whatsapp-broadcast.api";
import { useAuthStore } from "../../../auth/auth-store";
import { colors, fontSize, fontWeight, radius, spacing } from "../../../theme";
import { triggerLightHaptic } from "../../../utils/haptics";
import { useWhatsAppScope } from "../whatsapp-scope";
import { formatWhatsAppPhone } from "../whatsapp-ui";

const PAGE_SIZE = 60;

function statusTone(status: WaBroadcast["status"] | WaBroadcastRecipient["status"]) {
  if (status === "COMPLETED" || status === "READ" || status === "DELIVERED") {
    return { backgroundColor: colors.successLight, color: colors.primaryDark };
  }
  if (status === "SENDING" || status === "SENT") {
    return { backgroundColor: colors.infoLight, color: colors.info };
  }
  if (status === "FAILED") return { backgroundColor: colors.dangerLight, color: colors.danger };
  if (status === "CANCELLED" || status === "SKIPPED") {
    return { backgroundColor: colors.surfaceOffset, color: colors.textSecondary };
  }
  return { backgroundColor: colors.warningLight, color: colors.warning };
}

function timeLabel(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Metric({ label, value, emphasis }: { label: string; value: number; emphasis?: "danger" | "success" }) {
  return (
    <View style={styles.metric}>
      <Text style={[
        styles.metricValue,
        emphasis === "danger" && styles.metricDanger,
        emphasis === "success" && styles.metricSuccess,
      ]}>
        {value.toLocaleString("en-IN")}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function RecipientRow({ recipient }: { recipient: WaBroadcastRecipient }) {
  const tone = statusTone(recipient.status);
  const name = recipient.customerName || formatWhatsAppPhone(recipient.customerPhone);
  return (
    <View style={styles.recipientRow}>
      <View style={styles.recipientIcon}>
        <MaterialCommunityIcons
          name={recipient.status === "FAILED" ? "alert-circle-outline" : recipient.status === "READ" ? "check-all" : "account-outline"}
          size={20}
          color={recipient.status === "FAILED" ? colors.danger : colors.textSecondary}
        />
      </View>
      <View style={styles.recipientBody}>
        <View style={styles.recipientTop}>
          <Text style={styles.recipientName} numberOfLines={1}>{name}</Text>
          <View style={[styles.statusPill, { backgroundColor: tone.backgroundColor }]}>
            <Text style={[styles.statusText, { color: tone.color }]}>{recipient.status.toLowerCase()}</Text>
          </View>
        </View>
        <Text style={styles.recipientPhone}>{formatWhatsAppPhone(recipient.customerPhone)}</Text>
        {recipient.errorMessage ? (
          <Text style={styles.recipientError} numberOfLines={2}>{recipient.errorMessage}</Text>
        ) : null}
      </View>
    </View>
  );
}

export function BroadcastDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const broadcastId = route.params?.broadcastId as string;
  const token = useAuthStore((state) => state.token) || "";
  const { shopId, integrationId, phoneNumberId } = useWhatsAppScope();
  const queryClient = useQueryClient();

  const detailQuery = useQuery({
    queryKey: ["whatsapp", "broadcast", shopId, broadcastId],
    enabled: Boolean(token && shopId && broadcastId),
    queryFn: () => fetchWaBroadcast(token, shopId, broadcastId),
    refetchInterval: (query) => query.state.data?.status === "SENDING" ? 3_000 : false,
  });

  const recipientsQuery = useInfiniteQuery({
    queryKey: ["whatsapp", "broadcast", shopId, broadcastId, "recipients"],
    enabled: Boolean(token && shopId && broadcastId),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => fetchWaBroadcastRecipients(token, shopId, broadcastId, pageParam, PAGE_SIZE),
    getNextPageParam: (lastPage, allPages) => lastPage.length === PAGE_SIZE ? allPages.length + 1 : undefined,
  });

  useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitle: detailQuery.data?.name || "Campaign",
      headerStyle: { backgroundColor: colors.surface },
      headerTintColor: colors.textPrimary,
      headerShadowVisible: false,
    });
  }, [detailQuery.data?.name, navigation]);

  const recipients = useMemo(
    () => recipientsQuery.data?.pages.flatMap((page) => page) || [],
    [recipientsQuery.data],
  );

  const refreshAll = async () => {
    await Promise.all([detailQuery.refetch(), recipientsQuery.refetch()]);
  };

  const mutation = useMutation({
    mutationFn: async (action: "send" | "cancel" | "stop" | "retry" | "discard") => {
      if (action === "send") return sendWaBroadcast(token, shopId, broadcastId);
      if (action === "cancel") return cancelWaBroadcast(token, shopId, broadcastId);
      if (action === "stop") return stopWaBroadcast(token, shopId, broadcastId);
      if (action === "retry") return retryFailedWaBroadcast(token, shopId, broadcastId);
      return discardWaBroadcastDraft(token, shopId, broadcastId);
    },
    onSuccess: async (_data, action) => {
      triggerLightHaptic();
      await queryClient.invalidateQueries({ queryKey: ["whatsapp", "broadcasts", shopId] });
      await queryClient.invalidateQueries({ queryKey: ["whatsapp", "broadcast", shopId, broadcastId] });
      if (action === "discard") navigation.goBack();
    },
    onError: (error) => Alert.alert("Campaign action failed", error.message),
  });

  const confirm = (
    title: string,
    message: string,
    action: "send" | "cancel" | "stop" | "retry" | "discard",
    destructive = false,
  ) => {
    Alert.alert(title, message, [
      { text: "Not now", style: "cancel" },
      {
        text: destructive ? "Confirm" : "Continue",
        style: destructive ? "destructive" : "default",
        onPress: () => mutation.mutate(action),
      },
    ]);
  };

  if (detailQuery.isLoading) {
    return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  }
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <View style={styles.center}>
        <MaterialCommunityIcons name="alert-circle-outline" size={40} color={colors.danger} />
        <Text style={styles.emptyTitle}>Campaign unavailable</Text>
        <Button mode="text" onPress={() => detailQuery.refetch()}>Try again</Button>
      </View>
    );
  }

  const campaign = detailQuery.data;
  const tone = statusTone(campaign.status);
  const pending = campaign.pendingCount ?? Math.max(0, campaign.audienceCount - campaign.sentCount - campaign.failedCount - campaign.skippedCount);

  const header = (
    <View style={styles.headerContent}>
      <View style={styles.heroRow}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>WHATSAPP CAMPAIGN</Text>
          <Text style={styles.title}>{campaign.name}</Text>
          <Text style={styles.subtitle}>{campaign.template?.name || "Template"} · {campaign.audienceCount.toLocaleString("en-IN")} recipients</Text>
        </View>
        <View style={[styles.heroStatus, { backgroundColor: tone.backgroundColor }]}>
          <Text style={[styles.heroStatusText, { color: tone.color }]}>{campaign.status.toLowerCase()}</Text>
        </View>
      </View>

      {campaign.status === "SCHEDULED" ? (
        <View style={styles.scheduleLine}>
          <MaterialCommunityIcons name="clock-outline" size={18} color={colors.warning} />
          <View style={styles.flex}>
            <Text style={styles.scheduleLabel}>Scheduled</Text>
            <Text style={styles.scheduleValue}>{timeLabel(campaign.scheduledAt)}</Text>
          </View>
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metrics}>
        <Metric label="Audience" value={campaign.audienceCount} />
        <Metric label="Sent" value={campaign.sentCount} />
        <Metric label="Delivered" value={campaign.deliveredCount} emphasis="success" />
        <Metric label="Read" value={campaign.readCount} emphasis="success" />
        <Metric label="Failed" value={campaign.failedCount} emphasis={campaign.failedCount ? "danger" : undefined} />
        <Metric label="Pending" value={pending} />
      </ScrollView>

      <View style={styles.metaLines}>
        <View style={styles.metaLine}>
          <Text style={styles.metaLabel}>Created</Text>
          <Text style={styles.metaValue}>{timeLabel(campaign.createdAt)}</Text>
        </View>
        {campaign.startedAt ? (
          <View style={styles.metaLine}>
            <Text style={styles.metaLabel}>Started</Text>
            <Text style={styles.metaValue}>{timeLabel(campaign.startedAt)}</Text>
          </View>
        ) : null}
        {campaign.completedAt ? (
          <View style={styles.metaLine}>
            <Text style={styles.metaLabel}>Finished</Text>
            <Text style={styles.metaValue}>{timeLabel(campaign.completedAt)}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.actions}>
        {campaign.status === "SCHEDULED" ? (
          <>
            <Button
              mode="contained"
              icon="send"
              loading={mutation.isPending}
              onPress={() => confirm("Send now?", "The scheduled time will be cleared and this campaign will start immediately.", "send")}
              style={styles.primaryAction}
            >
              Send now
            </Button>
            <Button
              mode="text"
              textColor={colors.danger}
              disabled={mutation.isPending}
              onPress={() => confirm("Cancel scheduled campaign?", "No pending recipient will be sent. The recipient snapshot will remain available for audit.", "cancel", true)}
            >
              Cancel schedule
            </Button>
          </>
        ) : null}
        {campaign.status === "SENDING" ? (
          <Button
            mode="outlined"
            icon="stop-circle-outline"
            textColor={colors.danger}
            disabled={mutation.isPending}
            onPress={() => confirm("Stop pending sends?", "Messages already accepted by WhatsApp cannot be recalled. Recipients that are still pending will be skipped.", "stop", true)}
          >
            Stop pending
          </Button>
        ) : null}
        {["COMPLETED", "FAILED"].includes(campaign.status) && campaign.failedCount > 0 ? (
          <Button
            mode="contained"
            icon="refresh"
            loading={mutation.isPending}
            onPress={() => confirm("Retry failed recipients?", `Only the ${campaign.failedCount} failed recipients will be queued again.`, "retry")}
            style={styles.primaryAction}
          >
            Retry failed ({campaign.failedCount})
          </Button>
        ) : null}
        {campaign.status === "DRAFT" ? (
          <Button
            mode="text"
            textColor={colors.danger}
            disabled={mutation.isPending}
            onPress={() => confirm("Discard server draft?", "This incomplete server draft and its uploaded recipient snapshot will be deleted.", "discard", true)}
          >
            Discard draft
          </Button>
        ) : null}
      </View>

      <View style={styles.sectionHeading}>
        <View>
          <Text style={styles.sectionEyebrow}>RECIPIENTS</Text>
          <Text style={styles.sectionTitle}>Delivery by number</Text>
        </View>
        <Text style={styles.sectionCount}>{recipients.length}{recipientsQuery.hasNextPage ? "+" : ""}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      <FlashList
        data={recipients}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => <RecipientRow recipient={item} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={(
          <RefreshControl
            refreshing={detailQuery.isRefetching || recipientsQuery.isRefetching}
            onRefresh={refreshAll}
          />
        )}
        contentContainerStyle={styles.listContent}
        onEndReached={() => {
          if (recipientsQuery.hasNextPage && !recipientsQuery.isFetchingNextPage) {
            recipientsQuery.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={recipientsQuery.isFetchingNextPage ? (
          <ActivityIndicator style={styles.footerLoader} color={colors.primary} />
        ) : null}
        ListEmptyComponent={recipientsQuery.isLoading ? (
          <ActivityIndicator style={styles.footerLoader} color={colors.primary} />
        ) : (
          <View style={styles.emptyRecipients}>
            <Text style={styles.emptyTitle}>No recipients in this campaign</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.xl, backgroundColor: colors.bg },
  headerContent: { backgroundColor: colors.surface, paddingBottom: spacing.md },
  heroRow: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  heroCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: fontWeight.black, letterSpacing: 1.1 },
  title: { marginTop: 5, color: colors.textPrimary, fontSize: fontSize.xxl, lineHeight: 30, fontWeight: fontWeight.black },
  subtitle: { marginTop: 5, color: colors.textSecondary, fontSize: fontSize.xs, lineHeight: 18 },
  heroStatus: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.full },
  heroStatusText: { fontSize: 10, fontWeight: fontWeight.black, textTransform: "uppercase" },
  scheduleLine: { marginHorizontal: spacing.lg, marginTop: spacing.lg, minHeight: 54, flexDirection: "row", alignItems: "center", gap: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  scheduleLabel: { color: colors.textMuted, fontSize: 10, fontWeight: fontWeight.bold, textTransform: "uppercase" },
  scheduleValue: { marginTop: 2, color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  metrics: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.xl },
  metric: { minWidth: 64 },
  metricValue: { color: colors.textPrimary, fontSize: fontSize.xl, fontWeight: fontWeight.black },
  metricSuccess: { color: colors.primaryDark },
  metricDanger: { color: colors.danger },
  metricLabel: { marginTop: 2, color: colors.textMuted, fontSize: 10 },
  metaLines: { marginTop: spacing.lg, paddingHorizontal: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  metaLine: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  metaLabel: { color: colors.textSecondary, fontSize: fontSize.xs },
  metaValue: { color: colors.textPrimary, fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  actions: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  primaryAction: { backgroundColor: colors.primary, borderRadius: radius.lg },
  sectionHeading: { marginTop: spacing.xl, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  sectionEyebrow: { color: colors.textMuted, fontSize: 9, fontWeight: fontWeight.black, letterSpacing: 1 },
  sectionTitle: { marginTop: 3, color: colors.textPrimary, fontSize: fontSize.md, fontWeight: fontWeight.extrabold },
  sectionCount: { color: colors.textMuted, fontSize: fontSize.xs },
  listContent: { paddingBottom: 36 },
  recipientRow: { minHeight: 76, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexDirection: "row", alignItems: "flex-start", gap: spacing.md, backgroundColor: colors.surface },
  recipientIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceOffset },
  recipientBody: { flex: 1, minWidth: 0 },
  recipientTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  recipientName: { flex: 1, color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  recipientPhone: { marginTop: 3, color: colors.textSecondary, fontSize: fontSize.xs },
  recipientError: { marginTop: 5, color: colors.danger, fontSize: fontSize.xs, lineHeight: 17 },
  statusPill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.full },
  statusText: { fontSize: 9, fontWeight: fontWeight.black, textTransform: "uppercase" },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 72, backgroundColor: colors.border },
  footerLoader: { marginVertical: spacing.xl },
  emptyRecipients: { padding: spacing.xxl, alignItems: "center", backgroundColor: colors.surface },
  emptyTitle: { color: colors.textPrimary, fontSize: fontSize.md, fontWeight: fontWeight.bold },
});
