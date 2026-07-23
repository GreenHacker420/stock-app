import { useContext, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isToday, isYesterday } from "date-fns";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { FAB, IconButton, Searchbar, Text } from "react-native-paper";
import {
  archiveScopedWaConversation,
  deleteScopedWaConversation,
  muteScopedWaConversation,
  pinScopedWaConversation,
  type WaConversation,
  type WaMessage,
} from "../../../api/whatsapp.api";
import { useAuthStore } from "../../../auth/auth-store";
import { EmptyState } from "../../../components/ui/EmptyState";
import { SkeletonList } from "../../../components/ui/SkeletonCard";
import { queryKeys } from "../../../hooks/query-keys";
import { triggerLightHaptic } from "../../../utils/haptics";
import { useWhatsAppConversations } from "../hooks/use-whatsapp-data";
import { whatsappDb } from "../services/whatsapp-db";
import { useWhatsAppScope } from "../whatsapp-scope";
import { formatWhatsAppPhone, initials, waColors } from "../whatsapp-ui";

type Filter = "ALL" | "UNREAD" | "ASSIGNED";

const AVATAR_COLORS = [
  "#0f766e",
  "#2563eb",
  "#7c3aed",
  "#c2410c",
  "#be185d",
  "#047857",
];

function avatarColor(value: string) {
  const hash = [...value].reduce((total, char) => total + char.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function formatConversationTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (isToday(date)) return format(date, "h:mm a");
  if (isYesterday(date)) return "Yesterday";
  return format(date, "dd/MM/yy");
}

function messagePreview(message?: WaMessage) {
  if (!message) return "No messages yet";
  if (message.contentState === "DELETED") return "This message was deleted";
  const text = message.content?.text || message.content?.caption;
  if (text) return text;
  const labels: Partial<Record<WaMessage["type"], string>> = {
    IMAGE: "📷 Photo",
    VIDEO: "🎥 Video",
    AUDIO: "🎤 Voice message",
    DOCUMENT: "📄 Document",
    LOCATION: "📍 Location",
    CONTACT_CARD: "👤 Contact",
    TEMPLATE: "Template message",
    FLOW: "Flow message",
    INTERACTIVE: "Interactive message",
    STICKER: "Sticker",
    ORDER: "WhatsApp order",
  };
  return labels[message.type] || "Message";
}

function DeliveryIcon({ message }: { message?: WaMessage }) {
  if (!message || message.direction !== "OUTBOUND") return null;
  if (
    message.operationState === "WAITING_FOR_NETWORK"
    || message.operationState === "QUEUED"
    || message.operationState === "SUBMITTING"
  ) {
    return <MaterialCommunityIcons name="clock-outline" size={16} color={waColors.textMuted} />;
  }
  if (message.operationState === "TERMINALLY_FAILED" || message.providerStatus === "FAILED") {
    return <MaterialCommunityIcons name="alert-circle-outline" size={16} color={waColors.danger} />;
  }
  if (message.providerStatus === "READ") {
    return <MaterialCommunityIcons name="check-all" size={17} color={waColors.blue} />;
  }
  if (message.providerStatus === "DELIVERED") {
    return <MaterialCommunityIcons name="check-all" size={17} color={waColors.textMuted} />;
  }
  return <MaterialCommunityIcons name="check" size={17} color={waColors.textMuted} />;
}

export function ChatListScreen() {
  const navigation = useNavigation<any>();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const token = useAuthStore((state) => state.token);
  const currentUser = useAuthStore((state) => state.user);
  const { shopId, integrationId, phoneNumberId } = useWhatsAppScope();
  const queryClient = useQueryClient();
  const query = useWhatsAppConversations();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState<WaConversation | null>(null);
  const [showTools, setShowTools] = useState(false);
  const messageSearch = useQuery({
    queryKey: ["whatsapp", "local-search", shopId, integrationId, search.trim()],
    enabled: search.trim().length >= 2,
    queryFn: () => whatsappDb.searchMessages(shopId, integrationId, search),
    staleTime: 5_000,
  });
  const matchedConversationIds = useMemo(
    () => new Set((messageSearch.data || []).map((message) => message.conversationId)),
    [messageSearch.data],
  );

  useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitle: "WhatsApp",
      headerStyle: { backgroundColor: waColors.greenDark },
      headerTintColor: "#fff",
      headerShadowVisible: false,
      headerTitleStyle: { fontWeight: "800" },
      headerRight: () => (
        <View style={styles.headerActions}>
          <IconButton
            icon="account-plus-outline"
            iconColor="#fff"
            accessibilityLabel="New WhatsApp conversation"
            onPress={() => navigation.navigate("ContactBook", {
              shopId,
              integrationId,
              phoneNumberId,
            })}
          />
          <IconButton
            icon="dots-vertical"
            iconColor="#fff"
            accessibilityLabel="WhatsApp tools"
            onPress={() => setShowTools(true)}
          />
        </View>
      ),
    });
  }, [integrationId, navigation, phoneNumberId, shopId]);

  const archiveMutation = useMutation({
    mutationFn: ({ id, archive }: { id: string; archive: boolean }) => {
      if (!token) throw new Error("Your session expired. Sign in again.");
      return archiveScopedWaConversation(token, integrationId, id, archive);
    },
    onSuccess: ({ conversation }) => {
      void whatsappDb.upsertConversations(
        { shopId, integrationId, phoneNumberId },
        [conversation],
      );
      queryClient.invalidateQueries({
        queryKey: ["whatsapp", "conversations", shopId, integrationId],
      });
      setSelected(null);
    },
    onError: (error) => Alert.alert("Couldn’t update chat", error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => {
      if (!token) throw new Error("Your session expired. Sign in again.");
      return deleteScopedWaConversation(token, integrationId, id);
    },
    onSuccess: async (_, id) => {
      await whatsappDb.removeConversation(id);
      queryClient.invalidateQueries({
        queryKey: ["whatsapp", "conversations", shopId, integrationId],
      });
      setSelected(null);
    },
    onError: (error) => Alert.alert("Couldn’t delete chat", error.message),
  });

  const controlMutation = useMutation({
    mutationFn: async (input:
      | { kind: "pin"; conversation: WaConversation }
      | { kind: "mute"; conversation: WaConversation }
    ) => {
      if (!token) throw new Error("Your session expired. Sign in again.");
      if (input.kind === "pin") {
        return pinScopedWaConversation(
          token,
          integrationId,
          input.conversation.id,
          !input.conversation.isPinned,
        );
      }
      return muteScopedWaConversation(
        token,
        integrationId,
        input.conversation.id,
        { isMuted: !input.conversation.isMuted },
      );
    },
    onSuccess: ({ conversation }) => {
      void whatsappDb.upsertConversations(
        { shopId, integrationId, phoneNumberId },
        [conversation],
      );
      queryClient.invalidateQueries({
        queryKey: ["whatsapp", "conversations", shopId, integrationId],
      });
      setSelected(null);
    },
    onError: (error) => Alert.alert("Couldn’t update chat", error.message),
  });

  const counts = useMemo(() => ({
    unread: query.conversations.filter((conversation) => conversation.unreadCount > 0).length,
    assigned: query.conversations.filter((conversation) => conversation.assignedToId === currentUser?.id).length,
    archived: query.conversations.filter((conversation) => conversation.isArchived).length,
  }), [currentUser?.id, query.conversations]);

  const conversations = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return query.conversations.filter((conversation) => {
      if (conversation.isArchived !== showArchived) return false;
      if (filter === "UNREAD" && conversation.unreadCount === 0) return false;
      if (filter === "ASSIGNED" && conversation.assignedToId !== currentUser?.id) return false;
      if (!needle) return true;
      const haystack = [
        conversation.contactName,
        conversation.customer?.name,
        conversation.phone,
        conversation.messages?.[0]?.content?.text,
      ].filter(Boolean).join(" ").toLocaleLowerCase();
      return haystack.includes(needle) || matchedConversationIds.has(conversation.id);
    });
  }, [currentUser?.id, filter, matchedConversationIds, query.conversations, search, showArchived]);

  const openConversation = (conversation: WaConversation) => {
    triggerLightHaptic();
    navigation.navigate("ChatDetail", {
      shopId,
      integrationId,
      phoneNumberId,
      conversationId: conversation.id,
      phone: conversation.phone,
    });
  };

  const renderConversation = ({ item }: { item: WaConversation }) => {
    const lastMessage = item.messages?.[0];
    const displayName = item.contactName || item.customer?.name || formatWhatsAppPhone(item.phone);
    const active = item.unreadCount > 0;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${displayName}, ${item.unreadCount} unread messages`}
        onPress={() => openConversation(item)}
        onLongPress={() => {
          triggerLightHaptic();
          setSelected(item);
        }}
        style={({ pressed }) => [styles.chatRow, pressed && styles.chatRowPressed]}
      >
        <View style={[styles.avatar, { backgroundColor: avatarColor(displayName) }]}>
          <Text style={styles.avatarText}>{initials(displayName) || item.phone.slice(-2)}</Text>
          {active && <View style={styles.avatarActivity} />}
        </View>

        <View style={styles.chatBody}>
          <View style={styles.titleRow}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, active && styles.nameActive]} numberOfLines={1}>
                {displayName}
              </Text>
              {item.isPinned && (
                <MaterialCommunityIcons name="pin" size={14} color={waColors.textMuted} />
              )}
              {item.isMuted && (
                <MaterialCommunityIcons name="bell-off-outline" size={14} color={waColors.textMuted} />
              )}
            </View>
            <Text style={[styles.time, active && styles.timeActive]}>
              {formatConversationTime(item.updatedAt || item.lastCustomerMessageAt)}
            </Text>
          </View>

          <View style={styles.previewRow}>
            <DeliveryIcon message={lastMessage} />
            <Text style={[styles.preview, active && styles.previewActive]} numberOfLines={1}>
              {messagePreview(lastMessage)}
            </Text>
            {active && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{Math.min(item.unreadCount, 99)}</Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topPanel}>
        <View style={styles.connectionLine}>
          <View style={styles.connectionDot} />
          <Text style={styles.connectionText} numberOfLines={1}>
            Business inbox · {phoneNumberId ? `•••• ${phoneNumberId.slice(-4)}` : "Connected"}
          </Text>
          <Text style={styles.conversationCount}>
            {query.conversations.length} chats
          </Text>
        </View>

        <Searchbar
          value={search}
          onChangeText={setSearch}
          placeholder="Search conversations or messages"
          icon="magnify"
          clearIcon="close-circle"
          style={styles.search}
          inputStyle={styles.searchInput}
          elevation={0}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {([
            ["ALL", "All", query.conversations.filter((item) => !item.isArchived).length],
            ["UNREAD", "Unread", counts.unread],
            ["ASSIGNED", "Assigned to me", counts.assigned],
          ] as const).map(([value, label, count]) => {
            const active = filter === value;
            return (
              <Pressable
                key={value}
                onPress={() => {
                  triggerLightHaptic();
                  setFilter(value);
                }}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
                {count > 0 && (
                  <View style={[styles.filterCount, active && styles.filterCountActive]}>
                    <Text style={[styles.filterCountText, active && styles.filterCountTextActive]}>
                      {count}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {!showArchived && counts.archived > 0 && (
        <Pressable style={styles.archivedRow} onPress={() => setShowArchived(true)}>
          <View style={styles.archivedIcon}>
            <MaterialCommunityIcons name="archive-outline" size={21} color={waColors.green} />
          </View>
          <Text style={styles.archivedText}>Archived</Text>
          <Text style={styles.archivedCount}>{counts.archived}</Text>
          <MaterialCommunityIcons name="chevron-right" size={21} color={waColors.textMuted} />
        </Pressable>
      )}
      {showArchived && (
        <Pressable style={styles.archivedRow} onPress={() => setShowArchived(false)}>
          <View style={styles.archivedIcon}>
            <MaterialCommunityIcons name="arrow-left" size={21} color={waColors.green} />
          </View>
          <Text style={styles.archivedText}>Archived chats</Text>
          <Text style={styles.archivedCount}>{counts.archived}</Text>
        </Pressable>
      )}

      {query.isPending ? (
        <SkeletonList count={7} itemHeight={72} />
      ) : query.isError && query.conversations.length === 0 ? (
        <View style={styles.centerState}>
          <MaterialCommunityIcons name="message-alert-outline" size={42} color={waColors.textMuted} />
          <Text style={styles.stateTitle}>Couldn’t load conversations</Text>
          <Text style={styles.stateMessage}>{query.error.message}</Text>
          <Pressable style={styles.retryButton} onPress={() => query.refetch()}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlashList
          data={conversations}
          renderItem={renderConversation}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching && !query.isFetchingNextPage}
              onRefresh={query.refetch}
              tintColor={waColors.green}
            />
          }
          contentContainerStyle={{ paddingBottom: tabBarHeight + 94 }}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) {
              void query.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.35}
          ListFooterComponent={
            query.isFetchingNextPage
              ? <ActivityIndicator color={waColors.green} style={styles.pageLoader} />
              : null
          }
          ListEmptyComponent={
            <EmptyState
              icon={search ? "magnify-close" : showArchived ? "archive-outline" : "message-text-outline"}
              title={search ? "No matching conversations" : showArchived ? "No archived chats" : "Your inbox is ready"}
              subtitle={
                search
                  ? "Try another name, phone number, or message."
                  : "Start a conversation or wait for a customer to message your business."
              }
            />
          }
        />
      )}

      <FAB
        icon="message-plus-outline"
        color="#fff"
        accessibilityLabel="Start a new WhatsApp conversation"
        style={[styles.fab, { bottom: tabBarHeight + 16 }]}
        onPress={() => navigation.navigate("ContactBook", {
          shopId,
          integrationId,
          phoneNumberId,
        })}
      />

      <Modal visible={showTools} transparent animationType="fade" onRequestClose={() => setShowTools(false)}>
        <Pressable style={styles.overlayTop} onPress={() => setShowTools(false)}>
          <View style={styles.toolsMenu}>
            {[
              ["card-text-outline", "Message templates", "TemplateLibrary"],
              ["form-select", "WhatsApp Flows", "FlowLibrary"],
              ["cog-outline", "WhatsApp settings", "WhatsAppSetup"],
            ].map(([icon, label, routeName]) => (
              <Pressable
                key={routeName}
                style={styles.toolItem}
                onPress={() => {
                  setShowTools(false);
                  navigation.navigate(routeName, { shopId, integrationId, phoneNumberId });
                }}
              >
                <MaterialCommunityIcons name={icon as any} size={22} color={waColors.text} />
                <Text style={styles.toolText}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={Boolean(selected)} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <Pressable style={styles.overlayBottom} onPress={() => setSelected(null)}>
          <Pressable style={styles.actionSheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.grabber} />
            <View style={styles.sheetContact}>
              <View style={[styles.sheetAvatar, { backgroundColor: avatarColor(selected?.phone || "") }]}>
                <Text style={styles.sheetAvatarText}>
                  {initials(selected?.contactName || selected?.phone)}
                </Text>
              </View>
              <View style={styles.sheetContactText}>
                <Text style={styles.sheetTitle}>{selected?.contactName || selected?.phone}</Text>
                <Text style={styles.sheetSubtitle}>{formatWhatsAppPhone(selected?.phone)}</Text>
              </View>
            </View>
            <Pressable
              style={styles.sheetAction}
              onPress={() => selected && controlMutation.mutate({
                kind: "pin",
                conversation: selected,
              })}
            >
              <MaterialCommunityIcons
                name={selected?.isPinned ? "pin-off-outline" : "pin-outline"}
                size={23}
                color={waColors.text}
              />
              <Text style={styles.sheetActionText}>
                {selected?.isPinned ? "Unpin chat" : "Pin chat"}
              </Text>
            </Pressable>
            <Pressable
              style={styles.sheetAction}
              onPress={() => selected && controlMutation.mutate({
                kind: "mute",
                conversation: selected,
              })}
            >
              <MaterialCommunityIcons
                name={selected?.isMuted ? "bell-outline" : "bell-off-outline"}
                size={23}
                color={waColors.text}
              />
              <Text style={styles.sheetActionText}>
                {selected?.isMuted ? "Unmute notifications" : "Mute notifications"}
              </Text>
            </Pressable>
            <Pressable
              style={styles.sheetAction}
              onPress={() => selected && archiveMutation.mutate({
                id: selected.id,
                archive: !selected.isArchived,
              })}
            >
              <MaterialCommunityIcons
                name={selected?.isArchived ? "archive-arrow-up-outline" : "archive-arrow-down-outline"}
                size={23}
                color={waColors.text}
              />
              <Text style={styles.sheetActionText}>
                {selected?.isArchived ? "Move to chats" : "Archive chat"}
              </Text>
            </Pressable>
            <Pressable
              style={styles.sheetAction}
              onPress={() => {
                if (!selected) return;
                Alert.alert(
                  "Delete conversation?",
                  "This removes the conversation from ShopControl. This cannot be undone.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: () => deleteMutation.mutate(selected.id),
                    },
                  ],
                );
              }}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={23} color={waColors.danger} />
              <Text style={[styles.sheetActionText, styles.destructiveText]}>Delete conversation</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  headerActions: { flexDirection: "row", marginRight: -8 },
  topPanel: {
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: waColors.border,
  },
  connectionLine: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 7,
  },
  connectionDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: waColors.greenBright },
  connectionText: { flex: 1, color: waColors.textSecondary, fontSize: 12, fontWeight: "600" },
  conversationCount: { color: waColors.textMuted, fontSize: 12, fontVariant: ["tabular-nums"] },
  search: {
    height: 46,
    marginHorizontal: 12,
    marginTop: 5,
    borderRadius: 16,
    backgroundColor: "#f2f5f4",
  },
  searchInput: { minHeight: 46, fontSize: 15 },
  filters: { paddingHorizontal: 12, paddingTop: 10, gap: 8 },
  filterChip: {
    minHeight: 34,
    paddingHorizontal: 13,
    borderRadius: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: "#dce4e1",
    backgroundColor: "#fff",
  },
  filterChipActive: { borderColor: "#c7eadb", backgroundColor: "#e9f7ef" },
  filterText: { color: waColors.textSecondary, fontSize: 13, fontWeight: "700" },
  filterTextActive: { color: "#08775e" },
  filterCount: {
    minWidth: 19,
    height: 19,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#edf1f0",
  },
  filterCountActive: { backgroundColor: "#ccebdc" },
  filterCountText: { color: waColors.textSecondary, fontSize: 10, fontWeight: "800", fontVariant: ["tabular-nums"] },
  filterCountTextActive: { color: "#08775e" },
  archivedRow: {
    minHeight: 56,
    paddingHorizontal: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: waColors.border,
  },
  archivedIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e9f7ef",
  },
  archivedText: { flex: 1, color: waColors.text, fontSize: 15, fontWeight: "700" },
  archivedCount: { color: waColors.textSecondary, fontSize: 13, fontVariant: ["tabular-nums"] },
  chatRow: {
    minHeight: 78,
    paddingLeft: 13,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  chatRowPressed: { backgroundColor: "#f2f7f5" },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  avatarActivity: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
    borderColor: "#fff",
    backgroundColor: waColors.greenBright,
  },
  chatBody: {
    flex: 1,
    minWidth: 0,
    minHeight: 78,
    marginLeft: 12,
    paddingRight: 13,
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: waColors.border,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  nameRow: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 5 },
  name: { flexShrink: 1, color: waColors.text, fontSize: 16, fontWeight: "600" },
  nameActive: { fontWeight: "800" },
  time: { color: waColors.textMuted, fontSize: 11, fontWeight: "500" },
  timeActive: { color: waColors.green, fontWeight: "800" },
  previewRow: { marginTop: 5, flexDirection: "row", alignItems: "center", gap: 4 },
  preview: { flex: 1, color: waColors.textSecondary, fontSize: 14 },
  previewActive: { color: "#334155", fontWeight: "600" },
  unreadBadge: {
    minWidth: 21,
    height: 21,
    paddingHorizontal: 5,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: waColors.greenBright,
  },
  unreadBadgeText: { color: "#fff", fontSize: 10, fontWeight: "900", fontVariant: ["tabular-nums"] },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 8 },
  stateTitle: { color: waColors.text, fontSize: 18, fontWeight: "800", textAlign: "center" },
  stateMessage: { color: waColors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: "center" },
  retryButton: { marginTop: 8, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 14, backgroundColor: "#e9f7ef" },
  retryText: { color: waColors.greenDark, fontSize: 14, fontWeight: "800" },
  pageLoader: { paddingVertical: 18 },
  fab: { position: "absolute", right: 18, borderRadius: 18, backgroundColor: waColors.green },
  overlayTop: { flex: 1, alignItems: "flex-end", paddingTop: 58, paddingRight: 10, backgroundColor: "rgba(15,23,42,0.16)" },
  toolsMenu: {
    width: 230,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: "#fff",
    boxShadow: "0 8px 28px rgba(15, 23, 42, 0.18)",
  },
  toolItem: { minHeight: 52, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 13 },
  toolText: { color: waColors.text, fontSize: 15, fontWeight: "600" },
  overlayBottom: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.42)" },
  actionSheet: {
    paddingHorizontal: 18,
    paddingTop: 9,
    paddingBottom: 34,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "#fff",
  },
  grabber: { width: 42, height: 5, alignSelf: "center", borderRadius: 3, backgroundColor: "#d5ddda" },
  sheetContact: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: 12 },
  sheetAvatar: { width: 46, height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  sheetAvatarText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  sheetContactText: { flex: 1 },
  sheetTitle: { color: waColors.text, fontSize: 17, fontWeight: "800" },
  sheetSubtitle: { marginTop: 2, color: waColors.textSecondary, fontSize: 13 },
  sheetAction: {
    minHeight: 54,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    borderRadius: 15,
  },
  sheetActionText: { color: waColors.text, fontSize: 15, fontWeight: "600" },
  destructiveText: { color: waColors.danger },
});
