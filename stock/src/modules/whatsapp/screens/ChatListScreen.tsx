import React, { useState, useEffect } from "react";
import { TouchableOpacity, View, Text, StyleSheet, RefreshControl, Modal, Alert } from "react-native";
import { FlashList } from "@shopify/flash-list";

const FlashListAny = FlashList as any;
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchWaConversations, whatsappApi, WaConversation } from "../../../api/whatsapp.api";
import { useShopStore } from "../../../auth/shop-store";
import { useAuthStore } from "../../../auth/auth-store";
import { colors as Colors, spacing, radius, fontSize, fontWeight, shadow } from "../../../theme";
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
    onError: (err: any) => {
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
    onError: (err: any) => {
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
    const hasUnread = item.unreadCount > 0;
    
    // Parse name or default
    const displayName = item.contactName || `+${item.phone}`;
    
    // Initials for avatar
    const initials = item.contactName
      ? item.contactName.split(" ").map(n => n.charAt(0)).join("").toUpperCase().slice(0, 2)
      : item.phone.slice(-2);
    
    return (
      <TouchableOpacity
        style={[styles.itemCard, hasUnread && styles.itemCardUnread]}
        onPress={() => navigation.navigate("ChatDetail", { conversationId: item.id, phone: item.phone })}
        onLongPress={() => handleLongPress(item)}
        delayLongPress={400}
        activeOpacity={0.7}
      >
        <View style={[styles.avatarContainer, hasUnread && styles.avatarContainerUnread]}>
          <Text style={styles.avatarText}>
            {initials}
          </Text>
          {hasUnread && <View style={styles.unreadDot} />}
        </View>

        <View style={styles.content}>
          <View style={styles.headerRow}>
            <View style={styles.nameContainer}>
              <Text style={[styles.name, hasUnread && styles.nameUnread]} numberOfLines={1}>
                {displayName}
              </Text>
              {item.customer && (
                <View style={styles.linkedBadge}>
                  <MaterialCommunityIcons name="link-variant" size={10} color="#0369A1" />
                  <Text style={styles.linkedBadgeText}>Linked</Text>
                </View>
              )}
            </View>
            {item.lastCustomerMessageAt && (
              <Text style={[styles.time, hasUnread && styles.timeUnread]}>
                {formatDistanceToNow(new Date(item.lastCustomerMessageAt), { addSuffix: false })}
              </Text>
            )}
          </View>

          <View style={styles.messageRow}>
            <Text style={[styles.lastMessage, hasUnread && styles.lastMessageUnread, isDeleted && styles.deletedText]} numberOfLines={1}>
              {isDeleted ? "This message was deleted" : lastMsg?.content?.text || "No messages"}
            </Text>
            {hasUnread && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.unreadCount}</Text>
              </View>
            )}
            <MaterialCommunityIcons name="chevron-right" size={18} color="#C7C7CC" style={{ marginLeft: 4 }} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Premium Segmented Control Tabs */}
      <View style={styles.segmentedControl}>
        <TouchableOpacity
          style={[styles.controlTab, !showArchived && styles.activeControlTab]}
          onPress={() => setShowArchived(false)}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="message-text"
            size={16}
            color={!showArchived ? Colors.primary : Colors.textSecondary}
          />
          <Text style={[styles.controlTabText, !showArchived && styles.activeControlTabText]}>
            Active
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlTab, showArchived && styles.activeControlTab]}
          onPress={() => setShowArchived(true)}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="archive"
            size={16}
            color={showArchived ? Colors.primary : Colors.textSecondary}
          />
          <Text style={[styles.controlTabText, showArchived && styles.activeControlTabText]}>
            Archived
          </Text>
        </TouchableOpacity>
      </View>

      {/* Assignee Filters Scrollable */}
      <View style={styles.filterWrapper}>
        <FlashListAny
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[
            { id: "ALL", label: "All Chats", icon: "forum-outline" },
            { id: "ME", label: "Assigned to Me", icon: "account-check-outline" },
            { id: "UNASSIGNED", label: "Unassigned", icon: "account-question-outline" }
          ]}
          keyExtractor={(item: any) => item.id}
          renderItem={({ item }: any) => {
            const isActive = assigneeFilter === item.id;
            return (
              <TouchableOpacity
                style={[styles.filterChip, isActive && styles.activeFilterChip]}
                onPress={() => setAssigneeFilter(item.id as any)}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name={item.icon as any}
                  size={16}
                  color={isActive ? Colors.primaryDark : Colors.textSecondary}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.filterChipText, isActive && styles.activeFilterChipText]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          }}
          estimatedItemSize={120}
          contentContainerStyle={styles.filterScroll}
        />
      </View>

      <FlashListAny
        data={filteredConversations}
        renderItem={renderItem}
        keyExtractor={(item: any) => item.id}
        estimatedItemSize={76}
        refreshControl={
          <RefreshControl refreshing={isLoading || isRefetching} onRefresh={refetch} colors={[Colors.primary]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <MaterialCommunityIcons
                name={showArchived ? "archive-outline" : "chat-processing-outline"}
                size={48}
                color={Colors.primary}
              />
            </View>
            <Text style={styles.emptyTitle}>
              {showArchived ? "No Archived Chats" : "No Active Chats"}
            </Text>
            <Text style={styles.emptyDescription}>
              {showArchived
                ? "Chats you archive will appear here to keep your main inbox clean."
                : "When customers message your WhatsApp number, they will show up here."}
            </Text>
            {!showArchived && (
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => navigation.navigate("ContactBook")}
              >
                <MaterialCommunityIcons name="contacts" size={16} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.emptyButtonText}>Open Contact Book</Text>
              </TouchableOpacity>
            )}
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
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  
  // Segmented Control Tabs
  segmentedControl: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    padding: 4,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  controlTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
  },
  activeControlTab: {
    backgroundColor: "#ffffff",
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  controlTabText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginLeft: 6,
  },
  activeControlTabText: {
    color: Colors.primaryDark,
    fontWeight: "700",
  },

  // Assignee Filters Scrollable
  filterWrapper: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingVertical: 10,
  },
  filterScroll: {
    paddingHorizontal: 16,
    alignItems: "center",
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
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

  // Chat Item Cards
  itemCard: {
    flexDirection: "row",
    padding: 16,
    backgroundColor: "#ffffff",
    alignItems: "center",
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
  },
  itemCardUnread: {
    borderColor: Colors.primaryLight,
    backgroundColor: "#FCFDF9",
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#F0FDF4",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
    position: "relative",
    borderWidth: 1,
    borderColor: "#E8F5E9",
  },
  avatarContainerUnread: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primaryMid,
  },
  avatarText: {
    color: Colors.primaryDark,
    fontSize: 15,
    fontWeight: "700",
  },
  unreadDot: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primaryMid,
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  content: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  nameContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  nameUnread: {
    fontWeight: "700",
    color: Colors.primaryDark,
  },
  linkedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  linkedBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#0369A1",
    marginLeft: 2,
  },
  time: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  timeUnread: {
    color: Colors.primaryMid,
    fontWeight: "600",
  },
  messageRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  lastMessage: {
    fontSize: 14,
    color: Colors.textSecondary,
    flex: 1,
    marginRight: 8,
  },
  lastMessageUnread: {
    color: Colors.textPrimary,
    fontWeight: "600",
  },
  deletedText: {
    fontStyle: "italic",
    color: Colors.textMuted,
  },
  badge: {
    backgroundColor: Colors.primaryMid,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },

  // Empty State Illustrated
  emptyContainer: {
    paddingVertical: 80,
    paddingHorizontal: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#F0FDF4",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 8,
    textAlign: "center",
  },
  emptyDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  emptyButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  emptyButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },

  // Modals & Action Menu
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
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
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
});
