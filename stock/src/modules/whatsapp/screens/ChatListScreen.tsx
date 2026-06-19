import React, { useState, useEffect } from "react";
import { FlatList, TouchableOpacity, View, Text, StyleSheet, RefreshControl, Modal, Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchWaConversations, whatsappApi, WaConversation } from "../../../api/whatsapp.api";
import { useShopStore } from "../../../auth/shop-store";
import { useAuthStore } from "../../../auth/auth-store";
import { colors as Colors } from "../../../theme";
import { formatDistanceToNow } from "date-fns";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useWhatsAppRealtime } from "../hooks/useWhatsAppRealtime";

export const ChatListScreen = () => {
  const navigation = useNavigation<any>();
  const activeShopId = useShopStore((state) => state.activeShopId);
  const token = useAuthStore((state) => state.token);
  const currentUser = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();

  const [showArchived, setShowArchived] = useState(false);
  const [assigneeFilter, setAssigneeFilter] = useState<"ALL" | "ME" | "UNASSIGNED">("ALL");
  const [selectedChat, setSelectedChat] = useState<WaConversation | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);

  // Set navigation options to show Contact Book button in header
  useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitle: "Chats",
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate("ContactBook")}
          style={{ marginRight: 15 }}
        >
          <MaterialCommunityIcons name="contacts" size={24} color={Colors.primary} />
        </TouchableOpacity>
      )
    });
  }, [navigation]);

  // Subscribe to real-time events to auto-invalidate conversations list
  useWhatsAppRealtime("");

  // React Query Fetching (Persisted automatically by PersistQueryClientProvider in App.tsx)
  const { data: conversations = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["wa-conversations", activeShopId],
    queryFn: async () => {
      if (!activeShopId || !token) return [];
      const res = await fetchWaConversations(token, activeShopId);
      return res;
    },
    enabled: !!activeShopId && !!token,
  });

  // Archive Mutation
  const archiveMutation = useMutation({
    mutationFn: async ({ conversationId, archive }: { conversationId: string; archive: boolean }) => {
      if (!activeShopId) return;
      return whatsappApi.archiveConversation(activeShopId, conversationId, archive);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wa-conversations", activeShopId] });
      setMenuVisible(false);
      setSelectedChat(null);
    },
    onError: (err) => {
      Alert.alert("Error", err.message || "Failed to update archive status");
    }
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      if (!activeShopId) return;
      return whatsappApi.deleteConversation(activeShopId, conversationId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wa-conversations", activeShopId] });
      setMenuVisible(false);
      setSelectedChat(null);
    },
    onError: (err) => {
      Alert.alert("Error", err.message || "Failed to delete conversation");
    }
  });

  const handleLongPress = (chat: WaConversation) => {
    setSelectedChat(chat);
    setMenuVisible(true);
  };

  const handleArchiveToggle = () => {
    if (!selectedChat) return;
    archiveMutation.mutate({
      conversationId: selectedChat.id,
      archive: !selectedChat.isArchived,
    });
  };

  const handleDeletePress = () => {
    if (!selectedChat) return;
    Alert.alert(
      "Delete Chat",
      `Are you sure you want to delete the chat with ${selectedChat.contactName || selectedChat.phone}? This will permanently delete all local messages.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate(selectedChat.id),
        },
      ]
    );
  };

  const filteredConversations = conversations.filter((c) => {
    if (!!c.isArchived !== showArchived) return false;
    if (assigneeFilter === "ME") {
      return c.assignedToId === currentUser?.id;
    }
    if (assigneeFilter === "UNASSIGNED") {
      return !c.assignedToId;
    }
    return true;
  });

  const renderItem = ({ item }: { item: WaConversation }) => {
    const lastMsg = item.messages?.[0];
    const isDeleted = lastMsg?.status === "DELETED";
    
    return (
      <TouchableOpacity
        style={styles.item}
        onPress={() => navigation.navigate("ChatDetail", { conversationId: item.id, phone: item.phone })}
        onLongPress={() => handleLongPress(item)}
        delayLongPress={400}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {item.contactName?.charAt(0).toUpperCase() || item.phone.slice(-2)}
          </Text>
        </View>

        <View style={styles.content}>
          <View style={styles.row}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={styles.name}>{item.contactName || `+${item.phone}`}</Text>
              {item.customer && (
                <View style={styles.customerBadge}>
                  <Text style={styles.customerBadgeText}>LNK</Text>
                </View>
              )}
            </View>
            {item.lastCustomerMessageAt && (
              <Text style={styles.time}>
                {formatDistanceToNow(new Date(item.lastCustomerMessageAt), { addSuffix: false })}
              </Text>
            )}
          </View>

          <View style={styles.row}>
            <Text style={[styles.lastMessage, isDeleted && styles.deletedText]} numberOfLines={1}>
              {isDeleted ? "This message was deleted" : lastMsg?.content?.text || "No messages"}
            </Text>
            {item.unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Premium Pill Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, !showArchived && styles.activeTab]}
          onPress={() => setShowArchived(false)}
        >
          <MaterialCommunityIcons
            name="message-text"
            size={18}
            color={!showArchived ? "#fff" : Colors.textSecondary}
          />
          <Text style={[styles.tabText, !showArchived && styles.activeTabText]}>
            Active
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, showArchived && styles.activeTab]}
          onPress={() => setShowArchived(true)}
        >
          <MaterialCommunityIcons
            name="archive"
            size={18}
            color={showArchived ? "#fff" : Colors.textSecondary}
          />
          <Text style={[styles.tabText, showArchived && styles.activeTabText]}>
            Archived
          </Text>
        </TouchableOpacity>
      </View>

      {/* Assignee Filters */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterChip, assigneeFilter === "ALL" && styles.activeFilterChip]}
          onPress={() => setAssigneeFilter("ALL")}
        >
          <Text style={[styles.filterChipText, assigneeFilter === "ALL" && styles.activeFilterChipText]}>
            All
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, assigneeFilter === "ME" && styles.activeFilterChip]}
          onPress={() => setAssigneeFilter("ME")}
        >
          <Text style={[styles.filterChipText, assigneeFilter === "ME" && styles.activeFilterChipText]}>
            Assigned to Me
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, assigneeFilter === "UNASSIGNED" && styles.activeFilterChip]}
          onPress={() => setAssigneeFilter("UNASSIGNED")}
        >
          <Text style={[styles.filterChipText, assigneeFilter === "UNASSIGNED" && styles.activeFilterChipText]}>
            Unassigned
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredConversations}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={isLoading || isRefetching} onRefresh={refetch} colors={[Colors.primary]} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons
              name={showArchived ? "archive-outline" : "message-bulleted-off"}
              size={60}
              color={Colors.borderStrong}
            />
            <Text style={styles.emptyText}>
              {showArchived ? "No archived conversations" : "No active conversations found"}
            </Text>
          </View>
        }
      />

      {/* Long Press Action Modal */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={styles.modalMenu}>
            <Text style={styles.modalHeader}>
              {selectedChat?.contactName || `+${selectedChat?.phone}`}
            </Text>
            
            <TouchableOpacity style={styles.menuItem} onPress={handleArchiveToggle}>
              <MaterialCommunityIcons
                name={selectedChat?.isArchived ? "archive-arrow-up" : "archive-arrow-down"}
                size={22}
                color={Colors.textPrimary}
              />
              <Text style={styles.menuItemText}>
                {selectedChat?.isArchived ? "Unarchive Chat" : "Archive Chat"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={handleDeletePress}>
              <MaterialCommunityIcons name="trash-can-outline" size={22} color="#DC2626" />
              <Text style={[styles.menuItemText, { color: "#DC2626" }]}>Delete Chat</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F7FA" },
  tabContainer: {
    flexDirection: "row",
    padding: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    justifyContent: "space-around",
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: "#F0F0F3",
  },
  activeTab: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginLeft: 6,
  },
  activeTabText: {
    color: "#fff",
  },
  item: {
    flexDirection: "row",
    padding: 15,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    alignItems: "center",
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  avatarText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  content: { flex: 1 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginVertical: 2 },
  name: { fontSize: 16, fontWeight: "bold", color: Colors.textPrimary },
  customerBadge: {
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  customerBadgeText: { fontSize: 10, fontWeight: "bold", color: "#0369A1" },
  time: { fontSize: 12, color: Colors.textSecondary },
  lastMessage: { fontSize: 14, color: Colors.textSecondary, flex: 1, marginRight: 10 },
  deletedText: { fontStyle: "italic", color: Colors.textSecondary },
  badge: {
    backgroundColor: Colors.success,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "bold" },
  empty: { padding: 80, alignItems: "center", justifyContent: "center" },
  emptyText: { marginTop: 10, fontSize: 15, color: Colors.textSecondary, textAlign: "center" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalMenu: {
    width: "80%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  modalHeader: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 10,
    color: Colors.textPrimary,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  menuItemText: {
    fontSize: 16,
    marginLeft: 15,
    color: Colors.textPrimary,
  },
  filterContainer: {
    flexDirection: "row",
    paddingHorizontal: 15,
    paddingBottom: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "#F0F0F3",
    marginRight: 8,
  },
  activeFilterChip: {
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: "500",
  },
  activeFilterChipText: {
    color: Colors.primaryDark,
    fontWeight: "700",
  },
});
