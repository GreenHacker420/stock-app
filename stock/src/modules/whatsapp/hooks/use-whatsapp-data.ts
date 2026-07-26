import { useMemo } from "react";
import NetInfo from "@react-native-community/netinfo";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  fetchScopedWaConversations,
  fetchScopedWaMessages,
  type WaConversation,
  type WaMessage,
  type WaPage,
} from "../../../api/whatsapp.api";
import { useAuthStore } from "../../../auth/auth-store";
import { queryKeys } from "../../../hooks/query-keys";
import { useWhatsAppScope } from "../whatsapp-scope";
import { whatsappDb } from "../services/whatsapp-db";

const EMPTY_PAGE = <T,>(items: T[]): WaPage<T> => ({
  items,
  nextCursor: null,
  snapshotCursor: null,
});

export function useWhatsAppConversations() {
  const token = useAuthStore((state) => state.token);
  const { shopId, integrationId, phoneNumberId } = useWhatsAppScope();
  const query = useInfiniteQuery({
    queryKey: queryKeys.whatsapp.conversations(
      shopId,
      integrationId,
      phoneNumberId || "",
      {},
    ),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const network = await NetInfo.fetch();
      if (network.isConnected === false) {
        if (pageParam) return EMPTY_PAGE<WaConversation>([]);
        return EMPTY_PAGE(await whatsappDb.getConversations(shopId, integrationId));
      }
      if (!token) throw new Error("Your session expired. Sign in again.");
      const page = await fetchScopedWaConversations(token, integrationId, {
        cursor: pageParam,
        limit: 50,
      });
      try {
        await whatsappDb.upsertConversations(
          { shopId, integrationId, phoneNumberId },
          page.items,
        );
        if (!pageParam) {
          await whatsappDb.setSyncState(shopId, integrationId, {
            conversationSnapshotCursor: page.snapshotCursor,
          });
        }
      } catch {
        // Network data remains usable when the optional local cache is unavailable.
      }
      return page;
    },
    getNextPageParam: (page) => page.nextCursor || undefined,
    staleTime: 20_000,
  });

  const conversations = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  return { ...query, conversations };
}

export function useWhatsAppMessages(conversationId: string) {
  const token = useAuthStore((state) => state.token);
  const { shopId, integrationId } = useWhatsAppScope();
  const query = useInfiniteQuery({
    queryKey: queryKeys.whatsapp.messages(shopId, integrationId, conversationId),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const network = await NetInfo.fetch();
      if (network.isConnected === false) {
        if (pageParam) return EMPTY_PAGE<WaMessage>([]);
        return EMPTY_PAGE(await whatsappDb.getMessages(conversationId));
      }
      if (!token) throw new Error("Your session expired. Sign in again.");
      const page = await fetchScopedWaMessages(token, integrationId, conversationId, {
        cursor: pageParam,
        limit: 75,
      });
      await whatsappDb.upsertMessages(
        { shopId, integrationId, conversationId },
        page.items,
      ).catch(() => undefined);
      return page;
    },
    getNextPageParam: (page) => page.nextCursor || undefined,
    staleTime: 10_000,
  });

  const messages = useMemo(() => {
    if (!query.data) return [];
    return [...query.data.pages]
      .reverse()
      .flatMap((page) => page.items);
  }, [query.data]);

  return { ...query, messages };
}
