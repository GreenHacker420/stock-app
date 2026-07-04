import { useEffect, useState } from "react";
import { Alert, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { ActivityIndicator, FAB, IconButton, Searchbar, Text } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  deleteWaFlow,
  fetchWaFlows,
  syncWaFlows,
  WaFlow,
  WaFlowStatus,
} from "../../../api/whatsapp.api";
import { useAuthStore } from "../../../auth/auth-store";
import { useShopStore } from "../../../auth/shop-store";
import { EmptyState } from "../../../components/ui/EmptyState";
import { waColors } from "../whatsapp-ui";

const STATUS_TABS: Array<"ALL" | WaFlowStatus> = [
  "ALL",
  "DRAFT",
  "PUBLISHED",
  "BLOCKED",
  "DEPRECATED",
];

export function FlowLibraryScreen() {
  const navigation = useNavigation<any>();
  const token = useAuthStore((state) => state.token) || "";
  const user = useAuthStore((state) => state.user);
  const shopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<(typeof STATUS_TABS)[number]>("ALL");
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["wa-flow-library", shopId, status, search],
    enabled: Boolean(shopId && token),
    queryFn: () => fetchWaFlows(token, shopId!, {
      status,
      search: search.trim() || undefined,
      pageSize: 100,
    }),
  });

  const syncMutation = useMutation({
    mutationFn: () => syncWaFlows(token, shopId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["wa-flow-library", shopId] }),
    onError: (error) => Alert.alert("Flow sync failed", error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteWaFlow(token, shopId!, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["wa-flow-library", shopId] }),
    onError: (error) => Alert.alert("Flow delete failed", error.message),
  });

  useEffect(() => {
    navigation.setOptions({
      title: "WhatsApp Flows",
      headerStyle: { backgroundColor: waColors.greenDark },
      headerTintColor: "#fff",
      headerShadowVisible: false,
      headerRight: () => (
        <IconButton
          icon="sync"
          iconColor="#fff"
          loading={syncMutation.isPending}
          accessibilityLabel="Sync Flows"
          onPress={() => syncMutation.mutate()}
        />
      ),
    });
  }, [navigation, syncMutation.isPending]);

  const confirmDelete = (flow: WaFlow) => {
    if (flow.status !== "DRAFT") return;
    Alert.alert("Delete Flow", `Delete ${flow.name} from Meta and ShopControl?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(flow.id) },
    ]);
  };

  return (
    <View style={styles.screen}>
      <Searchbar
        value={search}
        onChangeText={setSearch}
        placeholder="Search Flows"
        style={styles.search}
        inputStyle={styles.searchInput}
      />
      <View style={styles.tabs}>
        {STATUS_TABS.map((tab) => (
          <Pressable
            key={tab}
            onPress={() => setStatus(tab)}
            style={[styles.tab, status === tab && styles.tabActive]}
          >
            <Text style={[styles.tabText, status === tab && styles.tabTextActive]}>
              {tab === "ALL" ? "All" : tab.toLowerCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      {query.isLoading ? (
        <ActivityIndicator style={styles.loader} color={waColors.green} />
      ) : (
        <FlashList
          data={query.data?.data || []}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              icon="form-select"
              title="No Flows"
              subtitle="Create a JSON draft or sync Flows already managed in Meta."
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => navigation.navigate("FlowEditor", { flowId: item.id })}
              onLongPress={() => user?.role === "OWNER" && confirmDelete(item)}
              style={styles.row}
            >
              <View style={[styles.icon, statusStyle(item.status)]}>
                <IconButton icon="form-select" iconColor="#fff" size={24} />
              </View>
              <View style={styles.rowBody}>
                <View style={styles.titleRow}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.time}>
                    {formatDistanceToNow(new Date(item.updatedAt), { addSuffix: true })}
                  </Text>
                </View>
                <Text style={styles.meta} numberOfLines={1}>
                  {(item.categories || ["OTHER"]).join(" · ")}
                </Text>
                <View style={styles.healthRow}>
                  <Text style={[styles.status, { color: statusColor(item.status) }]}>{item.status}</Text>
                  <Text style={styles.revision}>
                    revision {item.localRevision}
                    {item.deployedRevision === item.localRevision ? " · deployed" : " · changes pending"}
                  </Text>
                </View>
                {!!item.validationErrors?.length && (
                  <Text style={styles.errorText}>{item.validationErrors.length} validation issue(s)</Text>
                )}
              </View>
            </Pressable>
          )}
        />
      )}

      {user?.role === "OWNER" && (
        <FAB
          icon="plus"
          color="#fff"
          style={styles.fab}
          accessibilityLabel="Create Flow"
          onPress={() => navigation.navigate("FlowEditor")}
        />
      )}
    </View>
  );
}

function statusColor(status: WaFlowStatus) {
  if (status === "PUBLISHED") return waColors.green;
  if (status === "DRAFT") return "#B7791F";
  if (status === "DEPRECATED") return waColors.textSecondary;
  return waColors.danger;
}

function statusStyle(status: WaFlowStatus) {
  return { backgroundColor: statusColor(status) };
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: waColors.surface },
  search: { height: 44, margin: 10, borderRadius: 22, backgroundColor: waColors.surfaceMuted },
  searchInput: { minHeight: 44, fontSize: 15 },
  tabs: { height: 40, flexDirection: "row", gap: 6, paddingHorizontal: 10 },
  tab: { height: 32, justifyContent: "center", paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: waColors.border },
  tabActive: { backgroundColor: waColors.greenPale, borderColor: waColors.greenPale },
  tabText: { color: waColors.textSecondary, fontSize: 12, textTransform: "capitalize" },
  tabTextActive: { color: waColors.greenDark, fontWeight: "700" },
  loader: { flex: 1 },
  list: { paddingBottom: 90 },
  row: { minHeight: 92, flexDirection: "row", paddingHorizontal: 14, paddingTop: 10 },
  icon: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  rowBody: { flex: 1, minWidth: 0, marginLeft: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: waColors.border },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { flex: 1, color: waColors.text, fontSize: 16, fontWeight: "600" },
  time: { color: waColors.textSecondary, fontSize: 10 },
  meta: { color: waColors.textSecondary, fontSize: 12, paddingTop: 4 },
  healthRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 5 },
  status: { fontSize: 10, fontWeight: "800" },
  revision: { color: waColors.textSecondary, fontSize: 10 },
  errorText: { color: waColors.danger, fontSize: 10, paddingTop: 4 },
  fab: { position: "absolute", right: 18, bottom: 20, backgroundColor: waColors.green },
});
