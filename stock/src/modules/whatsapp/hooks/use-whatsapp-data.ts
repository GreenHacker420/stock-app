import { useEffect, useMemo, useState } from "react";
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
import { Image as ExpoImage } from "expo-image";

const EMPTY_PAGE = <T,>(items: T[]): WaPage<T> => ({
  items,
  nextCursor: null,
  snapshotCursor: null,
});

export function useWhatsAppConversations() {
  const token = useAuthStore((state) => state.token);
  const { shopId, integrationId, phoneNumberId } = useWhatsAppScope();
  const localCacheKey = `${shopId}:${integrationId}`;
  const [localCache, setLocalCache] = useState<{
    key: string;
    items: WaConversation[];
  } | null>(() => {
    const fastItems = whatsappDb.getFastConversations(shopId);
    return fastItems.length > 0 ? { key: localCacheKey, items: fastItems } : null;
  });

  useEffect(() => {
    let cancelled = false;
    void whatsappDb.getConversations(shopId, integrationId)
      .then((items) => {
        if (!cancelled) setLocalCache({ key: localCacheKey, items });
      })
      .catch(() => {
        if (!cancelled) setLocalCache({ key: localCacheKey, items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [integrationId, localCacheKey, shopId]);

  const query = useInfiniteQuery({
    queryKey: queryKeys.whatsapp.conversations(
      shopId,
      integrationId,
      phoneNumberId || "",
      {},
    ),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      if (!token) throw new Error("Your session expired. Sign in again.");
      try {
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
          // Local cache write is non-blocking fallback
        }
        return page;
      } catch (error) {
        if (pageParam) return EMPTY_PAGE<WaConversation>([]);
        const local = await whatsappDb.getConversations(shopId, integrationId);
        if (local.length > 0) return EMPTY_PAGE(local);
        throw error;
      }
    },
    getNextPageParam: (page) => page.nextCursor || undefined,
    staleTime: 20_000,
    maxPages: 6,
  });

  const conversations = useMemo(() => {
    const cachedItems =
      localCache?.key === localCacheKey ? localCache.items : [];
    const remoteItems = query.data?.pages.flatMap((page) => page.items);
    if (remoteItems?.length === 0 && cachedItems.length > 0 && query.isFetching) {
      return cachedItems;
    }
    return remoteItems ?? cachedItems;
  }, [localCache, localCacheKey, query.data, query.isFetching]);
  const localCacheHydrated = localCache?.key === localCacheKey;

  return {
    ...query,
    isLoading: query.isLoading && !localCacheHydrated,
    isPending: query.isPending && !localCacheHydrated,
    conversations,
  };
}


export function useWhatsAppMessages(conversationId: string) {
  const token = useAuthStore((state) => state.token);
  const { shopId, integrationId } = useWhatsAppScope();
  const [localCache, setLocalCache] = useState<{
    conversationId: string;
    items: WaMessage[];
  } | null>(() => {
    const fastItems = whatsappDb.getFastMessages(conversationId);
    return fastItems.length > 0 ? { conversationId, items: fastItems } : null;
  });

  useEffect(() => {
    const fastItems = whatsappDb.getFastMessages(conversationId);
    if (fastItems.length > 0) {
      setLocalCache({ conversationId, items: fastItems });
    }
  }, [conversationId]);

  const query = useInfiniteQuery({
    queryKey: queryKeys.whatsapp.messages(shopId, integrationId, conversationId),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      if (!token) throw new Error("Your session expired. Sign in again.");
      try {
        const page = await fetchScopedWaMessages(token, integrationId, conversationId, {
          cursor: pageParam,
          limit: 75,
        });
        void whatsappDb.upsertMessages(
          { shopId, integrationId, conversationId },
          page.items,
        ).catch(() => undefined);
        whatsappDb.saveFastMessages(conversationId, page.items);
        return page;
      } catch (error) {
        if (pageParam) return EMPTY_PAGE<WaMessage>([]);
        const local = await whatsappDb.getMessages(conversationId);
        if (local.length > 0) return EMPTY_PAGE(local);
        throw error;
      }
    },
    getNextPageParam: (page) => page.nextCursor || undefined,
    staleTime: 10_000,
    maxPages: 10,
  });

  const messages = useMemo(() => {
    const cachedItems =
      localCache?.conversationId === conversationId ? localCache.items : [];
    if (!query.data) {
      return cachedItems;
    }
    const remoteItems = [...query.data.pages]
      .reverse()
      .flatMap((page) => page.items);
    if (remoteItems.length === 0 && cachedItems.length > 0 && query.isFetching) {
      return cachedItems;
    }
    return remoteItems;
  }, [conversationId, localCache, query.data, query.isFetching]);
  const localCacheHydrated = localCache?.conversationId === conversationId;

  useEffect(() => {
    if (!messages || messages.length === 0) return;
    const imageUrls = messages
      .slice(-12)
      .filter((message) => message.type === "IMAGE")
      .map((message) => message.asset?.url)
      .filter((url): url is string => Boolean(url));
    if (imageUrls.length === 0) return;

    let cancelled = false;
    const idleTask = requestIdleCallback(() => {
      if (cancelled) return;
      void ExpoImage.prefetch(imageUrls, "memory-disk").catch(() => undefined);
    }, { timeout: 1_500 });

    return () => {
      cancelled = true;
      cancelIdleCallback(idleTask);
    };
  }, [messages]);

  return {
    ...query,
    isLoading: query.isLoading && !localCacheHydrated,
    isPending: query.isPending && !localCacheHydrated,
    messages,
  };
}
