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
  const localCacheKey = `${integrationId}:${conversationId}`;
  const [localCache, setLocalCache] = useState<{
    key: string;
    items: WaMessage[];
  } | null>(() => {
    const fastItems = whatsappDb.getFastMessages(conversationId);
    return fastItems.length > 0 ? { key: localCacheKey, items: fastItems } : null;
  });

  useEffect(() => {
    let cancelled = false;
    void whatsappDb.getMessages(conversationId)
      .then((items) => {
        if (!cancelled) setLocalCache({ key: localCacheKey, items });
      })
      .catch(() => {
        if (!cancelled) setLocalCache({ key: localCacheKey, items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, localCacheKey]);

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
    maxPages: 10,
  });

  const messages = useMemo(() => {
    const cachedItems =
      localCache?.key === localCacheKey ? localCache.items : [];
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
  }, [localCache, localCacheKey, query.data, query.isFetching]);
  const localCacheHydrated = localCache?.key === localCacheKey;

  useEffect(() => {
    if (!messages || messages.length === 0) return;
    const imageUrls = messages
      .filter((m) => m.type === "IMAGE" && Boolean(m.asset?.url))
      .map((m) => m.asset!.url);
    if (imageUrls.length > 0) {
      for (const url of imageUrls) {
        if (url) {
          void ExpoImage.prefetch(url, "memory-disk").catch(() => undefined);
        }
      }
    }
  }, [messages]);

  return {
    ...query,
    isLoading: query.isLoading && !localCacheHydrated,
    isPending: query.isPending && !localCacheHydrated,
    messages,
  };
}
