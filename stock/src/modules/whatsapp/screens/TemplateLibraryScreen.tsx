import { useContext, useEffect, useRef, useState } from "react";
import { Alert, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { ActivityIndicator, Button, Dialog, FAB, IconButton, Portal, Searchbar, Text } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  deleteWaTemplate,
  deleteWaTemplateAttribute,
  fetchWaTemplateAttributes,
  fetchWaTemplates,
  syncWaTemplates,
  WaTemplate,
} from "../../../api/whatsapp.api";
import { useAuthStore } from "../../../auth/auth-store";
import { useShopStore } from "../../../auth/shop-store";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/feedback/ErrorState";
import { waColors, waScreen } from "../whatsapp-ui";

const STATUS_TABS = ["ALL", "APPROVED", "PENDING", "REJECTED", "PAUSED"] as const;

export function TemplateLibraryScreen() {
  const navigation = useNavigation<any>();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const token = useAuthStore((state) => state.token) || "";
  const user = useAuthStore((state) => state.user);
  const shopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<(typeof STATUS_TABS)[number]>("ALL");
  const [search, setSearch] = useState("");
  const [showAttributes, setShowAttributes] = useState(false);
  const autoSyncAttempted = useRef<string | null>(null);

  useEffect(() => {
    navigation.setOptions({
      title: "Message templates",
      headerStyle: { backgroundColor: waColors.greenDark },
      headerTintColor: "#fff",
      headerRight: () => (
        <View style={styles.headerActions}>
          <IconButton
            icon="database-cog-outline"
            iconColor="#fff"
            accessibilityLabel="Manage template attributes"
            onPress={() => setShowAttributes(true)}
          />
          <IconButton
            icon="sync"
            iconColor="#fff"
            accessibilityLabel="Sync templates"
            onPress={() => syncMutation.mutate()}
          />
        </View>
      ),
    });
  }, [navigation, shopId]);

  const query = useQuery({
    queryKey: ["wa-template-library", shopId, status, search],
    enabled: Boolean(shopId && token),
    queryFn: () => fetchWaTemplates(token, shopId!, {
      status,
      search: search.trim() || undefined,
      pageSize: 100,
    }),
  });

  const syncMutation = useMutation({
    mutationFn: () => syncWaTemplates(token, shopId!),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["wa-template-library", shopId] });
      if (result.count === 0) {
        Alert.alert("No Meta templates found", "Create a template in Meta or ShopControl, then sync again.");
      }
    },
    onError: (error) => Alert.alert("Sync failed", error.message),
  });

  useEffect(() => {
    const total = query.data?.meta.total;
    if (
      shopId
      && token
      && query.isSuccess
      && total === 0
      && autoSyncAttempted.current !== shopId
      && !syncMutation.isPending
    ) {
      autoSyncAttempted.current = shopId;
      syncMutation.mutate();
    }
  }, [shopId, token, query.isSuccess, query.data?.meta.total, syncMutation.isPending]);

  const attributesQuery = useQuery({
    queryKey: ["wa-template-attributes", shopId],
    enabled: Boolean(showAttributes && shopId && token),
    queryFn: () => fetchWaTemplateAttributes(token, shopId!),
  });

  const deleteAttributeMutation = useMutation({
    mutationFn: (id: string) => deleteWaTemplateAttribute(token, shopId!, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["wa-template-attributes", shopId] }),
    onError: (error) => Alert.alert("Attribute delete failed", error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteWaTemplate(token, shopId!, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["wa-template-library", shopId] }),
    onError: (error) => Alert.alert("Delete failed", error.message),
  });

  const confirmDelete = (template: WaTemplate) => {
    Alert.alert(
      "Delete template",
      `Delete ${template.name} from Meta and ShopControl? Approved names may be unavailable for reuse temporarily.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(template.id) },
      ],
    );
  };

  return (
    <View style={waScreen}>
      <Searchbar
        value={search}
        onChangeText={setSearch}
        placeholder="Search templates"
        style={styles.search}
        inputStyle={styles.searchInput}
      />
      <View style={styles.tabs}>
        {STATUS_TABS.map((tab) => (
          <Pressable key={tab} onPress={() => setStatus(tab)} style={[styles.tab, status === tab && styles.tabActive]}>
            <Text style={[styles.tabText, status === tab && styles.tabTextActive]}>
              {tab === "ALL" ? "All" : tab.toLowerCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      {query.isLoading || (syncMutation.isPending && query.data?.meta.total === 0) ? (
        <ActivityIndicator style={styles.loader} color={waColors.green} />
      ) : query.isError ? (
        <ErrorState title="Templates unavailable" message={query.error.message} onRetry={() => query.refetch()} />
      ) : (
        <FlashList
          data={query.data?.data || []}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              icon="card-text-outline"
              title="No templates"
              subtitle="No templates are stored for this shop yet."
              action={
                <Button
                  mode="contained"
                  icon="sync"
                  loading={syncMutation.isPending}
                  disabled={syncMutation.isPending}
                  onPress={() => syncMutation.mutate()}
                >
                  Fetch from Meta
                </Button>
              }
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => navigation.navigate("TemplateEditor", { templateId: item.id })}
              onLongPress={() => user?.role === "OWNER" && confirmDelete(item)}
              style={styles.row}
            >
              <View style={styles.templateIcon}>
                <Text style={styles.templateIconText}>{item.category[0]}</Text>
              </View>
              <View style={styles.rowBody}>
                <View style={styles.rowTitle}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.time}>
                    {formatDistanceToNow(new Date(item.updatedAt), { addSuffix: true })}
                  </Text>
                </View>
                <View style={styles.rowMeta}>
                  <Text style={styles.preview} numberOfLines={1}>
                    {item.components?.find((component: any) => component.type === "BODY")?.text || item.category}
                  </Text>
                  <View style={[styles.status, statusColor(item.status)]}>
                    <Text style={styles.statusText}>{item.status}</Text>
                  </View>
                </View>
                <Text style={[styles.mapping, item.mappingStatus !== "VALID" && styles.mappingWarning]}>
                  {item.language} · {item.mappingStatus === "VALID" ? "Mappings ready" : "Mappings need attention"}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}

      {user?.role === "OWNER" && (
        <FAB
          icon="plus"
          color="#fff"
          style={[styles.fab, { bottom: tabBarHeight + 14 }]}
          accessibilityLabel="Create template"
          onPress={() => navigation.navigate("TemplateEditor")}
        />
      )}

      <Portal>
        <Dialog visible={showAttributes} onDismiss={() => setShowAttributes(false)} style={styles.attributeDialog}>
          <Dialog.Title>Dynamic attributes</Dialog.Title>
          <Dialog.Content style={styles.attributeContent}>
            <Text style={styles.attributeHelp}>
              Variables resolve from customer, conversation, shop, and custom tenant data. New custom attributes can be created in the template editor.
            </Text>
            {attributesQuery.isLoading ? (
              <ActivityIndicator color={waColors.green} />
            ) : (
              <FlashList
                data={attributesQuery.data || []}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <View style={styles.attributeRow}>
                    <View style={styles.attributeBody}>
                      <Text style={styles.attributeLabel}>{item.label}</Text>
                      <Text style={styles.attributeKey} numberOfLines={1}>{item.key} · {item.type}</Text>
                    </View>
                    {item.isSystem ? (
                      <Text style={styles.systemLabel}>SYSTEM</Text>
                    ) : (
                      <IconButton
                        icon="delete-outline"
                        iconColor={waColors.danger}
                        disabled={deleteAttributeMutation.isPending}
                        onPress={() => Alert.alert(
                          "Delete attribute",
                          `Delete ${item.label}? Existing template mappings using it must be remapped.`,
                          [
                            { text: "Cancel", style: "cancel" },
                            { text: "Delete", style: "destructive", onPress: () => deleteAttributeMutation.mutate(item.id) },
                          ],
                        )}
                      />
                    )}
                  </View>
                )}
              />
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowAttributes(false)}>Done</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

function statusColor(status: string) {
  if (status === "APPROVED") return { backgroundColor: "#D9FDD3" };
  if (status === "REJECTED" || status === "DISABLED") return { backgroundColor: "#FFD6DD" };
  return { backgroundColor: "#FFF3CD" };
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: "row", marginRight: -8 },
  search: { margin: 10, height: 44, backgroundColor: waColors.surfaceMuted, borderRadius: 8 },
  searchInput: { minHeight: 44, fontSize: 15 },
  tabs: { height: 42, flexDirection: "row", paddingHorizontal: 10, gap: 6 },
  tab: { justifyContent: "center", paddingHorizontal: 12, borderRadius: 18 },
  tabActive: { backgroundColor: waColors.greenPale },
  tabText: { color: waColors.textSecondary, textTransform: "capitalize", fontSize: 13 },
  tabTextActive: { color: waColors.greenDark, fontWeight: "700" },
  loader: { flex: 1 },
  list: { paddingBottom: 150 },
  row: { minHeight: 92, flexDirection: "row", paddingHorizontal: 14, paddingVertical: 10 },
  templateIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: waColors.green,
  },
  templateIconText: { color: "#fff", fontSize: 20, fontWeight: "700" },
  rowBody: { flex: 1, marginLeft: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: waColors.border },
  rowTitle: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  name: { flex: 1, color: waColors.text, fontSize: 16, fontWeight: "600" },
  time: { color: waColors.textSecondary, fontSize: 11 },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 5 },
  preview: { flex: 1, color: waColors.textSecondary, fontSize: 13 },
  status: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },
  statusText: { color: waColors.text, fontSize: 9, fontWeight: "700" },
  mapping: { color: waColors.green, fontSize: 11, paddingTop: 4 },
  mappingWarning: { color: "#B7791F" },
  fab: { position: "absolute", right: 18, backgroundColor: waColors.green },
  attributeDialog: { maxHeight: "78%", backgroundColor: waColors.surface },
  attributeContent: { height: 430 },
  attributeHelp: { color: waColors.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: 10 },
  attributeRow: { minHeight: 58, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: waColors.border },
  attributeBody: { flex: 1, minWidth: 0 },
  attributeLabel: { color: waColors.text, fontSize: 14, fontWeight: "600" },
  attributeKey: { color: waColors.textSecondary, fontSize: 11, paddingTop: 3 },
  systemLabel: { color: waColors.green, fontSize: 9, fontWeight: "700" },
});
