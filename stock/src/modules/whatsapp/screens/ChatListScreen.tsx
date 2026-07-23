import { useContext, useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { FAB, IconButton, Searchbar, Text } from "react-native-paper";
import { KeyboardAwareListScrollComponent } from "../../../components/keyboard/KeyboardAwareListScrollComponent";
import { useNavigation, useRoute } from "@react-navigation/native";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  archiveScopedWaConversation,
  deleteScopedWaConversation,
  fetchScopedWaConversations,
  WaConversation,
} from "../../../api/whatsapp.api";
import { useShopStore } from "../../../auth/shop-store";
import { useAuthStore } from "../../../auth/auth-store";
import { EmptyState } from "../../../components/ui/EmptyState";
import { initials, waColors } from "../whatsapp-ui";
import { queryKeys } from "../../../hooks/query-keys";

export const ChatListScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const shopId = useShopStore((state) => state.activeShopId);
  const token = useAuthStore((state) => state.token);
  const currentUser = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"ALL" | "UNREAD" | "ME">("ALL");
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState<WaConversation | null>(null);
  const integrationId = route.params?.integrationId as string | undefined;
  const phoneNumberId = route.params?.phoneNumberId as string | undefined;

  useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitle: "ShopControl",
      headerStyle: { backgroundColor: waColors.greenDark },
      headerTintColor: "#fff",
      headerTitleStyle: { fontWeight: "700" },
      headerRight: () => (
        <View style={styles.headerActions}>
          <IconButton icon="contacts-outline" iconColor="#fff" onPress={() => navigation.navigate("ContactBook")} />
          <IconButton icon="card-text-outline" iconColor="#fff" onPress={() => navigation.navigate("TemplateLibrary")} />
          <IconButton icon="form-select" iconColor="#fff" onPress={() => navigation.navigate("FlowLibrary")} />
          <IconButton icon="cog-outline" iconColor="#fff" onPress={() => navigation.navigate("WhatsAppSetup")} />
        </View>
      ),
    });
  }, [navigation]);

  const query = useQuery({
    queryKey: queryKeys.whatsapp.conversations(shopId!, integrationId!, phoneNumberId || "", {}),
    enabled: Boolean(shopId && token && integrationId),
    queryFn: async () => (await fetchScopedWaConversations(token!, integrationId!)).items,
  });

  const archiveMutation = useMutation({
    mutationFn: ({ id, archive }: { id: string; archive: boolean }) =>
      archiveScopedWaConversation(token!, integrationId!, id, archive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "conversations", shopId, integrationId] });
      setSelected(null);
    },
    onError: (error) => Alert.alert("Archive failed", error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteScopedWaConversation(token!, integrationId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "conversations", shopId, integrationId] });
      setSelected(null);
    },
    onError: (error) => Alert.alert("Delete failed", error.message),
  });

  const conversations = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (query.data || []).filter((conversation) => {
      if (Boolean(conversation.isArchived) !== showArchived) return false;
      if (filter === "UNREAD" && conversation.unreadCount === 0) return false;
      if (filter === "ME" && conversation.assignedToId !== currentUser?.id) return false;
      if (needle && !(conversation.contactName || conversation.phone).toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [query.data, search, showArchived, filter, currentUser?.id]);

  return (
    <View style={styles.screen}>
      <Searchbar
        value={search}
        onChangeText={setSearch}
        placeholder="Ask Meta AI or Search"
        style={styles.search}
        inputStyle={styles.searchInput}
      />
      <View style={styles.filters}>
        {(["ALL", "UNREAD", "ME"] as const).map((item) => (
          <Pressable key={item} onPress={() => setFilter(item)} style={[styles.filter, filter === item && styles.filterActive]}>
            <Text style={[styles.filterText, filter === item && styles.filterTextActive]}>
              {item === "ALL" ? "All" : item === "UNREAD" ? "Unread" : "Assigned"}
            </Text>
          </Pressable>
        ))}
      </View>

      {!showArchived && (query.data || []).some((item) => item.isArchived) && (
        <Pressable style={styles.archivedRow} onPress={() => setShowArchived(true)}>
          <MaterialCommunityIcons name="archive-outline" size={22} color={waColors.green} />
          <Text style={styles.archivedText}>Archived</Text>
          <Text style={styles.archivedCount}>{(query.data || []).filter((item) => item.isArchived).length}</Text>
        </Pressable>
      )}
      {showArchived && (
        <Pressable style={styles.archivedRow} onPress={() => setShowArchived(false)}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={waColors.green} />
          <Text style={styles.archivedText}>Back to chats</Text>
        </Pressable>
      )}

      <FlashList
        renderScrollComponent={KeyboardAwareListScrollComponent}
        data={conversations}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} />}
        contentContainerStyle={{ paddingBottom: tabBarHeight + 88 }}
        ListEmptyComponent={
          <EmptyState
            icon="message-text-outline"
            title="No conversations"
            subtitle="Customer messages and new chats will appear here."
          />
        }
        renderItem={({ item }) => {
          const lastMessage = item.messages?.[0];
          const name = item.contactName || item.customer?.name || `+${item.phone}`;
          const preview = lastMessage?.contentState === "DELETED"
            ? "This message was deleted"
            : lastMessage?.content?.text
              || lastMessage?.content?.caption
              || messageTypeLabel(lastMessage?.type)
              || "No messages yet";
          return (
            <Pressable
              onPress={() => navigation.navigate("ChatDetail", {
                shopId,
                integrationId,
                phoneNumberId,
                conversationId: item.id,
                phone: item.phone,
              })}
              onLongPress={() => setSelected(item)}
              style={styles.chatRow}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(name) || item.phone.slice(-2)}</Text>
              </View>
              <View style={styles.chatBody}>
                <View style={styles.titleRow}>
                  <Text style={[styles.name, item.unreadCount > 0 && styles.unreadName]} numberOfLines={1}>{name}</Text>
                  <Text style={[styles.time, item.unreadCount > 0 && styles.unreadTime]}>
                    {item.lastCustomerMessageAt
                      ? formatDistanceToNowStrict(new Date(item.lastCustomerMessageAt), { addSuffix: false })
                      : ""}
                  </Text>
                </View>
                <View style={styles.previewRow}>
                  {lastMessage?.direction === "OUTBOUND" && (
                    <MaterialCommunityIcons name="check-all" size={16} color={lastMessage.providerStatus === "READ" ? waColors.blue : waColors.textSecondary} />
                  )}
                  <Text style={[styles.preview, item.unreadCount > 0 && styles.unreadPreview]} numberOfLines={1}>{preview}</Text>
                  {item.unreadCount > 0 && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>{Math.min(item.unreadCount, 99)}</Text>
                    </View>
                  )}
                </View>
              </View>
            </Pressable>
          );
        }}
      />

      <FAB
        icon="message-plus-outline"
        color="#fff"
        accessibilityLabel="Start a new conversation"
        style={[styles.fab, { bottom: tabBarHeight + 14 }]}
        onPress={() => navigation.navigate("ContactBook")}
      />

      <Modal visible={Boolean(selected)} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <Pressable style={styles.overlay} onPress={() => setSelected(null)}>
          <View style={styles.menu}>
            <Text style={styles.menuTitle}>{selected?.contactName || selected?.phone}</Text>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                if (selected) {
                  archiveMutation.mutate({ id: selected.id, archive: !selected.isArchived });
                }
              }}
            >
              <MaterialCommunityIcons name={selected?.isArchived ? "archive-arrow-up-outline" : "archive-arrow-down-outline"} size={22} />
              <Text style={styles.menuText}>{selected?.isArchived ? "Unarchive chat" : "Archive chat"}</Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                if (selected) {
                  Alert.alert("Delete chat", "Delete all local messages in this conversation?", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => {
                      if (selected) {
                        deleteMutation.mutate(selected.id);
                      }
                    }},
                  ]);
                }
              }}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={22} color={waColors.danger} />
              <Text style={[styles.menuText, { color: waColors.danger }]}>Delete chat</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

function messageTypeLabel(type?: string) {
  return {
    IMAGE: "Photo",
    VIDEO: "Video",
    AUDIO: "Audio",
    DOCUMENT: "Document",
    LOCATION: "Location",
    CONTACT_CARD: "Contact",
    TEMPLATE: "Template message",
    INTERACTIVE: "Interactive message",
  }[type || ""];
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: waColors.surface },
  headerActions: { flexDirection: "row", marginRight: -8 },
  search: { height: 44, margin: 10, borderRadius: 22, backgroundColor: waColors.surfaceMuted },
  searchInput: { minHeight: 44, fontSize: 15 },
  filters: { height: 40, flexDirection: "row", gap: 7, paddingHorizontal: 12 },
  filter: { height: 32, justifyContent: "center", paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: waColors.border },
  filterActive: { backgroundColor: waColors.greenPale, borderColor: waColors.greenPale },
  filterText: { color: waColors.textSecondary, fontSize: 13 },
  filterTextActive: { color: waColors.greenDark, fontWeight: "700" },
  archivedRow: { height: 50, flexDirection: "row", alignItems: "center", gap: 18, paddingHorizontal: 28 },
  archivedText: { flex: 1, color: waColors.text, fontSize: 15, fontWeight: "600" },
  archivedCount: { color: waColors.green, fontSize: 13 },
  chatRow: { minHeight: 74, flexDirection: "row", paddingLeft: 12, paddingTop: 9 },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: "#D7DBDE" },
  avatarText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  chatBody: { flex: 1, minWidth: 0, marginLeft: 12, paddingRight: 12, paddingBottom: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: waColors.border },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { flex: 1, color: waColors.text, fontSize: 16, fontWeight: "500" },
  unreadName: { fontWeight: "700" },
  time: { color: waColors.textSecondary, fontSize: 11 },
  unreadTime: { color: waColors.green, fontWeight: "700" },
  previewRow: { flexDirection: "row", alignItems: "center", gap: 3, paddingTop: 5 },
  preview: { flex: 1, color: waColors.textSecondary, fontSize: 14 },
  unreadPreview: { color: waColors.text, fontWeight: "500" },
  unreadBadge: { minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: waColors.greenBright },
  unreadBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700", fontVariant: ["tabular-nums"] },
  fab: { position: "absolute", right: 18, backgroundColor: waColors.green },
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.35)" },
  menu: { padding: 16, paddingBottom: 28, backgroundColor: waColors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  menuTitle: { color: waColors.text, fontSize: 16, fontWeight: "700", padding: 10 },
  menuItem: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 10 },
  menuText: { color: waColors.text, fontSize: 15 },
});
