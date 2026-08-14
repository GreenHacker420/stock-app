import { useContext, useEffect, useRef, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ActivityIndicator, Button, FAB, IconButton, Searchbar, Text } from "react-native-paper";

import {
  deleteWaTemplate,
  fetchWaTemplates,
  syncWaTemplates,
  type WaTemplate,
} from "../../../api/whatsapp.api";
import { useAuthStore } from "../../../auth/auth-store";
import { KeyboardAwareListScrollComponent } from "../../../components/keyboard/KeyboardAwareListScrollComponent";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/feedback/ErrorState";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fontSize, fontWeight, spacing } from "../../../theme";
import { triggerLightHaptic } from "../../../utils/haptics";
import { waColors, waScreen } from "../whatsapp-ui";
import { useWhatsAppScope } from "../whatsapp-scope";

const STATUS_TABS = ["ALL", "APPROVED", "PENDING", "REJECTED", "PAUSED"] as const;

function bodyPreview(template: WaTemplate) {
  return template.draftDefinition?.body?.text
    || template.components?.find((component: any) => String(component?.type).toUpperCase() === "BODY")?.text
    || "No body preview";
}

function templateIcon(template: WaTemplate) {
  if (template.subtype?.includes("CAROUSEL")) return "view-carousel-outline";
  if (template.subtype === "CALL_PERMISSION_REQUEST") return "phone-outgoing-outline";
  const format = template.draftDefinition?.header?.format
    || template.components?.find((component: any) => String(component?.type).toUpperCase() === "HEADER")?.format;
  if (String(format).toUpperCase() === "IMAGE") return "image-outline";
  if (String(format).toUpperCase() === "VIDEO") return "video-outline";
  if (String(format).toUpperCase() === "DOCUMENT") return "file-document-outline";
  if (String(format).toUpperCase() === "LOCATION") return "map-marker-outline";
  if (template.category === "AUTHENTICATION") return "shield-key-outline";
  return "message-text-outline";
}

function statusStyle(status: string) {
  if (status === "APPROVED") return { color: colors.success, icon: "check-circle" as const };
  if (status === "REJECTED" || status === "DISABLED") return { color: colors.danger, icon: "alert-circle" as const };
  if (status === "PENDING") return { color: colors.warning, icon: "clock-outline" as const };
  return { color: colors.textSecondary, icon: "minus-circle-outline" as const };
}

export function TemplateLibraryScreen() {
  const navigation = useNavigation<any>();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const token = useAuthStore((state) => state.token) || "";
  const user = useAuthStore((state) => state.user);
  const insets = useSafeAreaInsets();
  const { shopId } = useWhatsAppScope();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<(typeof STATUS_TABS)[number]>("ALL");
  const [search, setSearch] = useState("");
  const autoSyncAttempted = useRef<string | null>(null);

  useEffect(() => {
    navigation.setOptions({
      title: "Templates",
      headerStyle: { backgroundColor: colors.surface },
      headerTintColor: colors.textPrimary,
      headerShadowVisible: false,
      headerRight: () => (
        <IconButton
          icon="sync"
          iconColor={colors.primary}
          accessibilityLabel="Sync templates from Meta"
          onPress={() => syncMutation.mutate()}
        />
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
      queryClient.invalidateQueries({ queryKey: ["wa-broadcast-templates", shopId] });
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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteWaTemplate(token, shopId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wa-template-library", shopId] });
      queryClient.invalidateQueries({ queryKey: ["wa-broadcast-templates", shopId] });
    },
    onError: (error) => Alert.alert("Delete failed", error.message),
  });

  const confirmDelete = (template: WaTemplate) => {
    Alert.alert(
      "Delete template",
      `Delete ${template.name} from Meta and ShopControl?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(template.id) },
      ],
    );
  };

  return (
    <View style={waScreen}>
      <View style={[styles.topArea, { paddingTop: Math.max(insets.top, spacing.sm) }]}>
        <View style={styles.headerBar}>
          <IconButton
            icon="arrow-left"
            size={24}
            iconColor={colors.textPrimary}
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            accessibilityLabel="Go back"
          />
          <Text style={styles.headerBarTitle}>Templates</Text>
          <IconButton
            icon="sync"
            size={22}
            iconColor={colors.primary}
            loading={syncMutation.isPending}
            accessibilityLabel="Sync templates"
            onPress={() => syncMutation.mutate()}
          />
        </View>
        <Text style={styles.eyebrow}>MESSAGE TEMPLATES</Text>
        <Text style={styles.title}>Reusable structure. Live values at send time.</Text>
        <Text style={styles.copy}>
          Build the Meta-approved message here. Customer names, balances, coupon codes and other changing values are chosen when you send.
        </Text>
        <Searchbar
          value={search}
          onChangeText={setSearch}
          placeholder="Search templates"
          style={styles.search}
          inputStyle={styles.searchInput}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
          keyboardShouldPersistTaps="handled"
        >
          {STATUS_TABS.map((tab) => (
            <Pressable
              key={tab}
              onPress={() => {
                triggerLightHaptic();
                setStatus(tab);
              }}
              style={[styles.tab, status === tab && styles.tabActive]}
            >
              <Text style={[styles.tabText, status === tab && styles.tabTextActive]}>
                {tab === "ALL" ? "All" : tab.toLowerCase()}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {query.isLoading || (syncMutation.isPending && query.data?.meta.total === 0) ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : query.isError ? (
        <ErrorState title="Templates unavailable" message={query.error.message} onRetry={() => query.refetch()} />
      ) : (
        <FlashList
          renderScrollComponent={KeyboardAwareListScrollComponent}
          data={query.data?.data || []}
          keyExtractor={(item: WaTemplate) => item.id}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} />}
          contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + 110 }]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <EmptyState
              icon="message-plus-outline"
              title="No templates here"
              subtitle={status === "ALL" ? "Create your first WhatsApp template." : `No ${status.toLowerCase()} templates.`}
              action={
                user?.role === "OWNER" ? (
                  <Button mode="text" icon="plus" onPress={() => navigation.navigate("TemplateEditor")}>
                    New template
                  </Button>
                ) : undefined
              }
            />
          }
          renderItem={({ item }: { item: WaTemplate }) => {
            const tone = statusStyle(item.status);
            return (
              <Pressable
                onPress={() => navigation.navigate("TemplateEditor", { templateId: item.id })}
                onLongPress={() => user?.role === "OWNER" && confirmDelete(item)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <View style={styles.iconCircle}>
                  <MaterialCommunityIcons name={templateIcon(item) as any} size={22} color={colors.primaryDark} />
                </View>
                <View style={styles.rowBody}>
                  <View style={styles.nameLine}>
                    <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                    <View style={styles.statusLine}>
                      <MaterialCommunityIcons name={tone.icon} size={13} color={tone.color} />
                      <Text style={[styles.statusText, { color: tone.color }]}>{item.status.toLowerCase()}</Text>
                    </View>
                  </View>
                  <Text style={styles.preview} numberOfLines={2}>{bodyPreview(item)}</Text>
                  <View style={styles.metaLine}>
                    <Text style={styles.meta}>{item.language}</Text>
                    <Text style={styles.dot}>·</Text>
                    <Text style={styles.meta}>{item.category.toLowerCase()}</Text>
                    <Text style={styles.dot}>·</Text>
                    <Text style={styles.meta}>{item.variableMappings.length} variables</Text>
                    {item.variableMappings.length ? (
                      <>
                        <Text style={styles.dot}>·</Text>
                        <Text style={styles.runtimeHint}>
                          {item.mappingStatus === "VALID" ? "defaults available" : "choose at send"}
                        </Text>
                      </>
                    ) : null}
                  </View>
                </View>
                <View style={styles.trailing}>
                  <Text style={styles.time}>{formatDistanceToNow(new Date(item.updatedAt), { addSuffix: true })}</Text>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {user?.role === "OWNER" ? (
        <FAB
          icon="plus"
          color="#fff"
          label="New template"
          style={[styles.fab, { bottom: tabBarHeight + 14 }]}
          accessibilityLabel="Create template"
          onPress={() => navigation.navigate("TemplateEditor")}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  topArea: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  headerBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xs, marginHorizontal: -spacing.sm },
  headerBarTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.black, color: colors.textPrimary },
  backButton: { margin: 0 },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: fontWeight.black, letterSpacing: 1.1 },
  title: { marginTop: 5, color: colors.textPrimary, fontSize: fontSize.xl, lineHeight: 27, fontWeight: fontWeight.black },
  copy: { marginTop: 5, color: colors.textSecondary, fontSize: fontSize.xs, lineHeight: 18 },
  search: { marginTop: spacing.md, height: 44, backgroundColor: colors.surfaceOffset, borderRadius: 22 },
  searchInput: { minHeight: 44, fontSize: fontSize.sm },
  tabs: { paddingVertical: spacing.sm, gap: spacing.sm },
  tab: { minHeight: 30, justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: 15 },
  tabActive: { backgroundColor: colors.primaryLight },
  tabText: { color: colors.textSecondary, textTransform: "capitalize", fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  tabTextActive: { color: colors.primaryDark },
  loader: { flex: 1 },
  list: { paddingTop: 4 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 76, backgroundColor: colors.border },
  row: { minHeight: 104, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  iconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryLight },
  rowBody: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  name: { flex: 1, color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.extrabold },
  statusLine: { flexDirection: "row", alignItems: "center", gap: 3 },
  statusText: { fontSize: 9, fontWeight: fontWeight.black, textTransform: "capitalize" },
  preview: { marginTop: 4, color: colors.textSecondary, fontSize: fontSize.xs, lineHeight: 17 },
  metaLine: { marginTop: 5, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4 },
  meta: { color: colors.textMuted, fontSize: 10 },
  dot: { color: colors.textMuted, fontSize: 10 },
  runtimeHint: { color: colors.primaryDark, fontSize: 10, fontWeight: fontWeight.semibold },
  trailing: { alignItems: "flex-end", gap: spacing.sm, paddingTop: 1 },
  time: { maxWidth: 72, color: colors.textMuted, fontSize: 9, textAlign: "right" },
  pressed: { opacity: 0.68 },
  fab: { position: "absolute", right: spacing.lg, backgroundColor: waColors.green },
});
