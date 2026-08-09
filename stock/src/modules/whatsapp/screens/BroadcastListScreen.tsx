import { useEffect, useMemo } from "react";
import { Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ActivityIndicator, IconButton, Text } from "react-native-paper";
import { fetchWaBroadcasts, type WaBroadcast } from "../../../api/whatsapp-broadcast.api";
import { useAuthStore } from "../../../auth/auth-store";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/feedback/ErrorState";
import { useWhatsAppScope } from "../whatsapp-scope";
import { waColors } from "../whatsapp-ui";

function statusTone(status: WaBroadcast["status"]) {
  if (status === "COMPLETED") return { backgroundColor: "#E7F7F1", color: waColors.greenDark };
  if (status === "SENDING") return { backgroundColor: "#E7F5FB", color: "#0879A8" };
  if (status === "FAILED") return { backgroundColor: "#FDECEF", color: waColors.danger };
  if (status === "CANCELLED") return { backgroundColor: "#F0F2F5", color: waColors.textSecondary };
  return { backgroundColor: "#FFF5D8", color: "#8A5B00" };
}

function metricPercent(value: number, audience: number) {
  if (!audience) return 0;
  return Math.min(100, Math.max(0, Math.round((value / audience) * 100)));
}

export function BroadcastListScreen() {
  const navigation = useNavigation<any>();
  const token = useAuthStore((state) => state.token) || "";
  const { shopId, integrationId, phoneNumberId } = useWhatsAppScope();

  const query = useQuery({
    queryKey: ["whatsapp", "broadcasts", shopId],
    enabled: Boolean(token && shopId),
    queryFn: () => fetchWaBroadcasts(token, shopId),
    refetchInterval: (state) =>
      state.state.data?.some((item) => item.status === "SENDING") ? 4_000 : false,
  });

  useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitle: "Broadcasts",
      headerStyle: { backgroundColor: waColors.surface },
      headerTintColor: waColors.text,
      headerShadowVisible: false,
      headerTitleStyle: { fontWeight: "800" },
      headerRight: () => (
        <IconButton
          icon="plus"
          iconColor={waColors.greenDark}
          size={25}
          accessibilityLabel="Create broadcast"
          onPress={() => navigation.navigate("BroadcastComposer", {
            shopId,
            integrationId,
            phoneNumberId,
          })}
        />
      ),
    });
  }, [integrationId, navigation, phoneNumberId, shopId]);

  const summary = useMemo(() => {
    const broadcasts = query.data || [];
    return {
      campaigns: broadcasts.length,
      recipients: broadcasts.reduce((sum, item) => sum + item.audienceCount, 0),
      read: broadcasts.reduce((sum, item) => sum + item.readCount, 0),
    };
  }, [query.data]);

  if (query.isLoading) {
    return <View style={styles.center}><ActivityIndicator color={waColors.green} /></View>;
  }
  if (query.isError) {
    return <ErrorState title="Broadcasts unavailable" message={query.error.message} onRetry={() => query.refetch()} />;
  }

  return (
    <View style={styles.screen}>
      <View style={styles.overview}>
        <View style={styles.overviewText}>
          <Text style={styles.eyebrow}>WHATSAPP OUTREACH</Text>
          <Text style={styles.title}>Send once. Track every recipient.</Text>
          <Text style={styles.subtitle}>
            Device contacts stay local until you select them for a campaign.
          </Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate("BroadcastComposer", { shopId, integrationId, phoneNumberId })}
          style={({ pressed }) => [styles.newButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="bullhorn-outline" size={19} color="#fff" />
          <Text style={styles.newButtonText}>New broadcast</Text>
        </Pressable>
        <View style={styles.statsLine}>
          <Text style={styles.stat}><Text style={styles.statStrong}>{summary.campaigns}</Text> campaigns</Text>
          <View style={styles.statDot} />
          <Text style={styles.stat}><Text style={styles.statStrong}>{summary.recipients}</Text> recipients</Text>
          <View style={styles.statDot} />
          <Text style={styles.stat}><Text style={styles.statStrong}>{summary.read}</Text> reads</Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent campaigns</Text>
        <Text style={styles.sectionCount}>{query.data?.length || 0}</Text>
      </View>

      <FlashList
        data={query.data || []}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} />}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <EmptyState
            icon="bullhorn-outline"
            title="No broadcasts yet"
            subtitle="Create a campaign from contacts stored on this phone."
          />
        }
        renderItem={({ item }) => {
          const tone = statusTone(item.status);
          const sent = item.sentCount + item.deliveredCount + item.readCount;
          const progress = item.status === "SENDING"
            ? metricPercent(sent, item.audienceCount)
            : 100;
          return (
            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <MaterialCommunityIcons name="bullhorn-outline" size={21} color={waColors.greenDark} />
              </View>
              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
                  <View style={[styles.statusPill, { backgroundColor: tone.backgroundColor }]}>
                    <Text style={[styles.statusText, { color: tone.color }]}>{item.status.toLowerCase()}</Text>
                  </View>
                </View>
                <Text style={styles.templateName} numberOfLines={1}>
                  {item.template?.name || "Template"} · {item.audienceCount} recipients
                </Text>
                {item.status === "SENDING" && (
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${progress}%` }]} />
                  </View>
                )}
                <View style={styles.deliveryLine}>
                  <Text style={styles.deliveryMetric}>Sent {item.sentCount}</Text>
                  <Text style={styles.deliveryMetric}>Delivered {item.deliveredCount}</Text>
                  <Text style={styles.deliveryMetric}>Read {item.readCount}</Text>
                  {!!item.failedCount && <Text style={styles.failedMetric}>Failed {item.failedCount}</Text>}
                </View>
              </View>
              <Text style={styles.time}>
                {item.createdAt ? formatDistanceToNow(new Date(item.createdAt), { addSuffix: true }) : ""}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: waColors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: waColors.surface },
  overview: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: waColors.border },
  overviewText: { maxWidth: 520 },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.1, color: waColors.green },
  title: { marginTop: 5, fontSize: 23, lineHeight: 29, fontWeight: "900", color: waColors.text },
  subtitle: { marginTop: 6, fontSize: 13, lineHeight: 19, color: waColors.textSecondary },
  newButton: { marginTop: 16, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, height: 42, borderRadius: 21, backgroundColor: waColors.greenDark },
  newButtonText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  pressed: { opacity: 0.82 },
  statsLine: { marginTop: 17, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  stat: { fontSize: 12, color: waColors.textSecondary },
  statStrong: { color: waColors.text, fontWeight: "800" },
  statDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: waColors.textMuted },
  sectionHeader: { height: 48, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: waColors.text },
  sectionCount: { fontSize: 12, color: waColors.textMuted },
  listContent: { paddingBottom: 32 },
  separator: { height: 1, marginLeft: 72, backgroundColor: waColors.border },
  row: { minHeight: 96, paddingHorizontal: 18, paddingVertical: 14, flexDirection: "row", alignItems: "flex-start" },
  rowIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#E7F7F1", alignItems: "center", justifyContent: "center", marginRight: 12 },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowTitle: { flex: 1, fontSize: 15, fontWeight: "800", color: waColors.text },
  statusPill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
  statusText: { fontSize: 10, fontWeight: "800" },
  templateName: { marginTop: 3, fontSize: 12, color: waColors.textSecondary },
  progressTrack: { marginTop: 9, height: 3, borderRadius: 2, backgroundColor: waColors.surfaceMuted, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: waColors.green },
  deliveryLine: { marginTop: 7, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  deliveryMetric: { fontSize: 10, color: waColors.textMuted },
  failedMetric: { fontSize: 10, color: waColors.danger },
  time: { marginLeft: 8, paddingTop: 2, maxWidth: 72, fontSize: 10, color: waColors.textMuted, textAlign: "right" },
});
