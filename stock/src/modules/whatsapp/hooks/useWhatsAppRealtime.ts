import { useEffect } from "react";
import { DeviceEventEmitter } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

export function useWhatsAppRealtime(conversationId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    // The main Socket.IO connection is managed in RealtimeProvider.
    // It emits local DeviceEventEmitter events so specific hooks can subscribe safely.
    
    const messageListener = DeviceEventEmitter.addListener("wa:message_received", (payload) => {
      if (payload?.conversationId === conversationId) {
        queryClient.invalidateQueries({ queryKey: ["wa-messages", conversationId] });
      }
      queryClient.invalidateQueries({ queryKey: ["wa-conversations"] });
    });

    const statusListener = DeviceEventEmitter.addListener("wa:status_updated", (payload) => {
      if (payload?.conversationId === conversationId) {
        queryClient.invalidateQueries({ queryKey: ["wa-messages", conversationId] });
      }
    });

    const sentListener = DeviceEventEmitter.addListener("wa:message_sent", (payload) => {
      if (payload?.conversationId === conversationId) {
        queryClient.invalidateQueries({ queryKey: ["wa-messages", conversationId] });
      }
      queryClient.invalidateQueries({ queryKey: ["wa-conversations"] });
    });
    
    const failedListener = DeviceEventEmitter.addListener("wa:message_failed", (payload) => {
      if (payload?.conversationId === conversationId) {
        queryClient.invalidateQueries({ queryKey: ["wa-messages", conversationId] });
      }
    });

    const reactionListener = DeviceEventEmitter.addListener("wa:reaction_updated", (payload) => {
      if (payload?.conversationId === conversationId) {
        queryClient.invalidateQueries({ queryKey: ["wa-messages", conversationId] });
      }
    });

    return () => {
      messageListener.remove();
      statusListener.remove();
      sentListener.remove();
      failedListener.remove();
      reactionListener.remove();
    };
  }, [conversationId, queryClient]);
}
