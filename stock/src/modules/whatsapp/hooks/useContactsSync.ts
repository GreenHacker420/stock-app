import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { syncScopedWaPhoneContacts } from "../../../api/whatsapp.api";
import { useAuthStore } from "../../../auth/auth-store";
import { contactsDb } from "../services/contactsDb";
import { Alert } from "react-native";
import { useSelectionStore } from "../store/contactSelection.store";


export function useContactsSync(activeShopId: string | null, integrationId?: string) {
  const queryClient = useQueryClient();
  const token = useAuthStore((state) => state.token);
  const syncLockRef = useRef(false);
  const clearSelection = useSelectionStore((s) => s.clear);

  return useMutation({
    mutationFn: async ({
      mergeStrategy,
      selectedIds,
    }: {
      mergeStrategy: "MERGE" | "OVERWRITE";
      selectedIds: Set<string>;
    }) => {
      if (!activeShopId || !integrationId || !token) throw new Error("WhatsApp scope is unavailable");
      if (syncLockRef.current) {
        throw new Error("Synchronization already in progress");
      }

      // Check if we have anything to sync
      const mutated = await contactsDb.getMutatedContacts();
      const toSync = mutated.filter((m) => selectedIds.has(m.id));

      if (toSync.length === 0) {
        throw new Error("No mutated or unsynced contacts selected for synchronization");
      }

      syncLockRef.current = true;

      try {
        const res = await syncScopedWaPhoneContacts(token, integrationId, toSync, mergeStrategy);

        // Mark local contacts as synced in SQLite database
        const syncedIds = toSync.map((t) => t.id);
        await contactsDb.markAsSynced(syncedIds);

        return {
          syncedCount: toSync.length,
          newCustomersCount: res?.newCustomersCount || 0,
          mergedCount: res?.mergedCount || 0,
          syncedIds,
        };
      } finally {
        syncLockRef.current = false;
      }
    },
    onSuccess: (data) => {
      // Invalidate relevant react queries
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "conversations", activeShopId, integrationId] });
      queryClient.invalidateQueries({ queryKey: ["customers", activeShopId] });
      queryClient.invalidateQueries({ queryKey: ["contacts-local"] });
      queryClient.invalidateQueries({ queryKey: ["contacts-stats"] });

      // Clear the selection store since sync succeeded
      clearSelection();

      Alert.alert(
        "Sync Successful",
        `Synced: ${data.syncedCount} contacts.\nNew Customers: ${data.newCustomersCount}\nMerged: ${data.mergedCount}`
      );
    },
    onError: (error: any) => {
      Alert.alert("Sync Failed", error.message || "An error occurred during synchronization.");
    },
  });
}
export type UseContactsSyncMutation = ReturnType<typeof useContactsSync>;
