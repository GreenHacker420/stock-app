import React, { useEffect, useState, useRef } from "react";
import { FlatList, View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Image } from "react-native";
import { useRoute } from "@react-navigation/native";
import { fetchWaMessages, sendWaMessage, WaMessage } from "../../../api/whatsapp.api";
import { useShopStore } from "../../../auth/shop-store";
import { useAuthStore } from "../../../auth/auth-store";
import { colors as Colors } from "../../../theme";
import { format } from "date-fns";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export const ChatDetailScreen = () => {
  const route = useRoute<any>();
  const { conversationId, phone } = route.params;
  const activeShopId = useShopStore((state) => state.activeShopId);
  const token = useAuthStore((state) => state.token);
  
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const flatListRef = useRef<FlatList>(null);

  const fetchMessages = async () => {
    if (!token) return;
    try {
      const data = await fetchWaMessages(token, conversationId);
      setMessages(data);
    } catch (error) {
      console.error("Failed to fetch messages", error);
    }
  };

  useEffect(() => {
    fetchMessages();
    // TODO: Setup Socket.IO listener for real-time messages
  }, [conversationId, token]);

  const handleSend = async () => {
    if (!inputText.trim() || !activeShopId || !token) return;

    const tempText = inputText;
    setInputText("");

    try {
      const data = await sendWaMessage(token, {
        shopId: activeShopId,
        conversationId,
        to: phone,
        type: "TEXT",
        content: { text: tempText },
      });

      setMessages((prev) => [...prev, data]);
      setTimeout(() => flatListRef.current?.scrollToEnd(), 100);
    } catch (error) {
      console.error("Failed to send message", error);
    }
  };

  const renderMessage = ({ item }: { item: WaMessage }) => {
    const isOutbound = item.direction === "OUTBOUND";
    
    return (
      <View style={[styles.messageContainer, isOutbound ? styles.outboundContainer : styles.inboundContainer]}>
        <View style={[styles.bubble, isOutbound ? styles.outboundBubble : styles.inboundBubble]}>
          {item.type === "TEXT" && <Text style={styles.messageText}>{item.content?.text}</Text>}
          {item.type === "IMAGE" && <Image source={{ uri: item.mediaUrl }} style={styles.messageImage} />}
          
          <View style={styles.messageFooter}>
            <Text style={styles.messageTime}>{format(new Date(item.createdAt), "HH:mm")}</Text>
            {isOutbound && (
              <MaterialCommunityIcons 
                name={item.status === "READ" ? "check-all" : item.status === "DELIVERED" ? "check-all" : "check"} 
                size={16} 
                color={item.status === "READ" ? Colors.info : Colors.textSecondary} 
                style={{ marginLeft: 5 }}
              />
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
      />
      
      <View style={styles.inputToolbar}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          value={inputText}
          onChangeText={setInputText}
          multiline
        />
        <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
          <MaterialCommunityIcons name="send" size={24} color={"#fff"} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#E5DDD5" }, // WhatsApp background color
  listContent: { padding: 10 },
  messageContainer: { marginVertical: 5, maxWidth: "80%" },
  inboundContainer: { alignSelf: "flex-start" },
  outboundContainer: { alignSelf: "flex-end" },
  bubble: { padding: 8, borderRadius: 10, elevation: 1 },
  inboundBubble: { backgroundColor: "#fff" },
  outboundBubble: { backgroundColor: "#DCF8C6" },
  messageText: { fontSize: 16 },
  messageImage: { width: 200, height: 200, borderRadius: 5, marginBottom: 5 },
  messageFooter: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", marginTop: 2 },
  messageTime: { fontSize: 11, color: Colors.textSecondary },
  inputToolbar: { flexDirection: "row", padding: 10, backgroundColor: "#fff", alignItems: "center" },
  input: { flex: 1, backgroundColor: "#f0f0f0", borderRadius: 20, paddingHorizontal: 15, paddingVertical: 8, fontSize: 16, maxHeight: 100 },
  sendButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary, justifyContent: "center", alignItems: "center", marginLeft: 10 },
});
