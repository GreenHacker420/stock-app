import React, { useEffect, useState } from "react";
import { FlatList, TouchableOpacity, View, Text, StyleSheet, RefreshControl } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { fetchWaConversations, WaConversation } from "../../../api/whatsapp.api";
import { useShopStore } from "../../../auth/shop-store";
import { useAuthStore } from "../../../auth/auth-store";
import { colors as Colors } from "../../../theme";
import { formatDistanceToNow } from "date-fns";

export const ChatListScreen = () => {
  const navigation = useNavigation<any>();
  const activeShopId = useShopStore((state) => state.activeShopId);
  const token = useAuthStore((state) => state.token);
  const [conversations, setConversations] = useState<WaConversation[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchConversations = async () => {
    if (!activeShopId || !token) return;
    try {
      const data = await fetchWaConversations(token, activeShopId);
      setConversations(data);
    } catch (error) {
      console.error("Failed to fetch conversations", error);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, [activeShopId, token]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchConversations();
    setRefreshing(false);
  };

  const renderItem = ({ item }: { item: WaConversation }) => (
    <TouchableOpacity
      style={styles.item}
      onPress={() => navigation.navigate("ChatDetail", { conversationId: item.id, phone: item.phone })}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{item.contactName?.charAt(0) || item.phone.slice(-2)}</Text>
      </View>
      <View style={styles.content}>
        <View style={styles.row}>
          <Text style={styles.name}>{item.contactName || item.phone}</Text>
          {item.lastCustomerMessageAt && (
            <Text style={styles.time}>
              {formatDistanceToNow(new Date(item.lastCustomerMessageAt), { addSuffix: true })}
            </Text>
          )}
        </View>
        <Text style={styles.lastMessage} numberOfLines={1}>
          {item.messages?.[0]?.content?.text || "No messages yet"}
        </Text>
      </View>
      {item.unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{item.unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={conversations}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text>No conversations found</Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  item: { flexDirection: "row", padding: 15, borderBottomWidth: 1, borderBottomColor: Colors.border, alignItems: "center" },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: Colors.primary, justifyContent: "center", alignItems: "center", marginRight: 15 },
  avatarText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  content: { flex: 1 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 5 },
  name: { fontSize: 16, fontWeight: "bold" },
  time: { fontSize: 12, color: Colors.textSecondary },
  lastMessage: { fontSize: 14, color: Colors.textSecondary },
  badge: { backgroundColor: Colors.success, borderRadius: 10, minWidth: 20, height: 20, justifyContent: "center", alignItems: "center", paddingHorizontal: 5 },
  badgeText: { color: "#fff", fontSize: 12, fontWeight: "bold" },
  empty: { padding: 50, alignItems: "center" },
});
