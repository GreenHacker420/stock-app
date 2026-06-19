import { useEffect, useState, useMemo } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  ScrollView,
} from "react-native";
import {
  Text,
  Button,
  Divider,
  Searchbar,
  Card,
  IconButton,
  Portal,
  Dialog,
  RadioButton,
  Checkbox,
} from "react-native-paper";
import * as Contacts from "expo-contacts";
import { contactsDb, LocalContact } from "../services/contactsDb";
import { whatsappApi } from "../../../api/whatsapp.api";
import { useCustomersQuery } from "../../../hooks/useCustomers";
import { useShopStore } from "../../../auth/shop-store";
import { colors as Colors, spacing, radius, fontSize, fontWeight, shadow } from "../../../theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Screen } from "../../../components/Screen";
import { mmkvStorage } from "../../../auth/mmkv-storage";
import { useQueryClient } from "@tanstack/react-query";

export const ContactBookScreen = () => {
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();

  const [contacts, setContacts] = useState<LocalContact[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Modal / Manual Link State
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [selectedContact, setSelectedContact] = useState<LocalContact | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");

  // Sync Options Dialog State
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [mergeStrategy, setMergeStrategy] = useState<"MERGE" | "OVERWRITE">("MERGE");

  // Selection state for sync (defaults all to selected)
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  // Load server-side customers
  const { data: customers = [], isLoading: loadingCustomers } = useCustomersQuery();

  // Load local cached contacts from SQLite
  const loadLocalContacts = async (search = "") => {
    try {
      const data = await contactsDb.getContacts(search);
      setContacts(data);

      // Initialize selection states for newly fetched contacts if not already set
      setSelectedIds((prev) => {
        const next = { ...prev };
        data.forEach((c) => {
          if (next[c.id] === undefined) {
            next[c.id] = true;
          }
        });
        return next;
      });
    } catch (err: any) {
      console.error("Failed to load local contacts", err);
    }
  };

  // Sync / Import Device Contacts into SQLite
  const importDeviceContacts = async () => {
    setLoading(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Denied",
          "This screen requires access to your device contacts to sync with ShopControl."
        );
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
        ],
      });

      if (data && data.length > 0) {
        const formatted = data
          .map((c) => {
            const phone = c.phoneNumbers?.[0]?.number || "";
            // Clean phone number (remove spaces, symbols)
            const cleanPhone = phone.replace(/\D/g, "");
            return {
              id: c.id || "",
              name: c.name || "",
              phone: cleanPhone,
              email: c.emails?.[0]?.email || undefined,
            };
          })
          .filter((c) => c.phone.length >= 10);

        await contactsDb.upsertDeviceContacts(formatted);
        mmkvStorage.setItem("whatsapp_has_imported_device_contacts", "true");
        await loadLocalContacts(searchQuery);
        Alert.alert("Imported", `Cached ${formatted.length} contacts locally.`);
      } else {
        Alert.alert("No Contacts Found", "No valid contact cards were found on this device.");
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to import contacts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      const hasImported = mmkvStorage.getItem("whatsapp_has_imported_device_contacts");
      if (hasImported === "true") {
        await loadLocalContacts();
      } else {
        await importDeviceContacts();
      }
    };
    init();
  }, []);

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    loadLocalContacts(text);
  };

  // Helpers for normalizing phone and matching suffixes
  const normalizePhone = (p: string) => p.replace(/\D/g, "");

  const findMatchingCustomer = useMemo(() => {
    return (contactPhone: string) => {
      const norm = normalizePhone(contactPhone);
      if (norm.length < 10) return null;
      const suffix = norm.slice(-10);
      return customers.find((c) => {
        if (!c.phone) return false;
        const cNorm = normalizePhone(c.phone);
        return cNorm.endsWith(suffix);
      });
    };
  }, [customers]);

  // Toggle selection checkbox
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const toggleSelectAll = () => {
    const allSelected = contacts.every((c) => selectedIds[c.id]);
    setSelectedIds((prev) => {
      const next = { ...prev };
      contacts.forEach((c) => {
        next[c.id] = !allSelected;
      });
      return next;
    });
  };

  // Update tag locally
  const handleUpdateTag = async (id: string, tag: "REGULAR" | "BUSINESS" | "NONE") => {
    await contactsDb.updateTag(id, tag);
    await loadLocalContacts(searchQuery);
  };

  // Trigger link customer modal
  const openLinkModal = (contact: LocalContact) => {
    setSelectedContact(contact);
    setCustomerSearch("");
    setShowLinkModal(true);
  };

  const handleLinkCustomer = async (customerId: string | null) => {
    if (!selectedContact) return;
    await contactsDb.linkCustomer(selectedContact.id, customerId);
    setShowLinkModal(false);
    setSelectedContact(null);
    await loadLocalContacts(searchQuery);
  };

  // Count mutated / unsynced
  const mutatedCount = useMemo(() => {
    return contacts.filter(
      (c) => (c.syncState === "MUTATED" || c.syncState === "UNSYNCED") && selectedIds[c.id]
    ).length;
  }, [contacts, selectedIds]);

  // Execute sync mutations to server
  const handleSyncToServer = async () => {
    if (!activeShopId) return;
    setShowSyncDialog(false);
    setSyncing(true);

    try {
      // Fetch mutated list
      const mutated = await contactsDb.getMutatedContacts();
      // Filter out excluded ones
      const toSync = mutated.filter((m) => selectedIds[m.id]);

      if (toSync.length === 0) {
        Alert.alert("Nothing to Sync", "No mutated or unsynced contacts are selected.");
        setSyncing(false);
        return;
      }

      const res = await whatsappApi.syncPhoneContacts(activeShopId, toSync, mergeStrategy);
      if (res.data?.success) {
        const syncedIds = toSync.map((t) => t.id);
        await contactsDb.markAsSynced(syncedIds);
        
        // Invalidate cache
        queryClient.invalidateQueries({ queryKey: ["wa-conversations", activeShopId] });
        queryClient.invalidateQueries({ queryKey: ["customers", activeShopId] });

        await loadLocalContacts(searchQuery);
        Alert.alert(
          "Sync Successful",
          `Synced: ${toSync.length} contacts.\nNew Customers: ${res.data.data.newCustomersCount}\nMerged: ${res.data.data.mergedCount}`
        );
      } else {
        Alert.alert("Sync Failed", "Server responded with error.");
      }
    } catch (err: any) {
      Alert.alert("Sync Error", err.message || "Failed to sync contacts.");
    } finally {
      setSyncing(false);
    }
  };

  // Filtered customer listing for Manual Link modal
  const filteredCustomersForLink = useMemo(() => {
    const cleanSearch = customerSearch.trim().toLowerCase();
    const list = customers.filter(
      (cust) =>
        cust.name.toLowerCase().includes(cleanSearch) ||
        (cust.gstin && cust.gstin.toLowerCase().includes(cleanSearch))
    );

    // Prioritize phone-less (GST-only) customers first
    return [...list].sort((a, b) => {
      const aNoPhone = !a.phone ? 1 : 0;
      const bNoPhone = !b.phone ? 1 : 0;
      return bNoPhone - aNoPhone;
    });
  }, [customers, customerSearch]);

  const renderContactItem = ({ item }: { item: LocalContact }) => {
    const isSelected = !!selectedIds[item.id];
    const isMutated = item.syncState === "MUTATED" || item.syncState === "UNSYNCED";
    
    // Suffix match check
    const matchedCustomer = findMatchingCustomer(item.phone);
    const linkedCustomerId = item.customerId;
    const manuallyLinkedCustomer = linkedCustomerId
      ? customers.find((c) => c.id === linkedCustomerId)
      : null;

    return (
      <Card style={[styles.contactCard, isMutated && styles.mutatedCard]}>
        <Card.Content style={styles.cardLayout}>
          <TouchableOpacity onPress={() => toggleSelect(item.id)} style={styles.checkboxContainer}>
            <Checkbox.Android
              status={isSelected ? "checked" : "unchecked"}
              onPress={() => toggleSelect(item.id)}
              color={Colors.primary}
            />
          </TouchableOpacity>

          <View style={styles.contactInfo}>
            <View style={styles.row}>
              <Text style={styles.contactName}>{item.name}</Text>
              {isMutated && (
                <View style={styles.mutatedBadge}>
                  <Text style={styles.mutatedBadgeText}>UNSYNCED</Text>
                </View>
              )}
            </View>
            <Text style={styles.contactPhone}>{`+${item.phone}`}</Text>
            {item.email && <Text style={styles.contactEmail}>{item.email}</Text>}

            {/* Matching / Linked Badges */}
            <View style={styles.linkBadgeRow}>
              {manuallyLinkedCustomer ? (
                <View style={[styles.linkBadge, styles.linkedBadge]}>
                  <MaterialCommunityIcons name="link" size={12} color="#0369A1" />
                  <Text style={styles.linkBadgeText} numberOfLines={1}>
                    {`Linked: ${manuallyLinkedCustomer.name}`}
                  </Text>
                  <TouchableOpacity
                    style={styles.unlinkBtn}
                    onPress={() => handleLinkCustomer(null)}
                  >
                    <MaterialCommunityIcons name="close-circle" size={14} color="#0369A1" />
                  </TouchableOpacity>
                </View>
              ) : matchedCustomer ? (
                <View style={[styles.linkBadge, styles.matchedBadge]}>
                  <MaterialCommunityIcons name="check-decagram" size={12} color={Colors.primary} />
                  <Text style={styles.linkBadgeText} numberOfLines={1}>
                    {`Matched: ${matchedCustomer.name}`}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.linkBadge, styles.notLinkedBadge]}
                  onPress={() => openLinkModal(item)}
                >
                  <MaterialCommunityIcons name="link-variant-plus" size={12} color="#D97706" />
                  <Text style={[styles.linkBadgeText, { color: "#D97706" }]}>Link Customer</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Tagging pills */}
            <View style={styles.pillsContainer}>
              <Text style={styles.pillsLabel}>Sync Tag:</Text>
              <TouchableOpacity
                style={[
                  styles.pill,
                  item.tag === "REGULAR" && styles.pillRegularActive,
                ]}
                onPress={() => handleUpdateTag(item.id, item.tag === "REGULAR" ? "NONE" : "REGULAR")}
              >
                <Text style={[styles.pillText, item.tag === "REGULAR" && styles.pillTextActive]}>
                  Regular
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.pill,
                  item.tag === "BUSINESS" && styles.pillBusinessActive,
                ]}
                onPress={() => handleUpdateTag(item.id, item.tag === "BUSINESS" ? "NONE" : "BUSINESS")}
              >
                <Text style={[styles.pillText, item.tag === "BUSINESS" && styles.pillTextActive]}>
                  Business
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Card.Content>
      </Card>
    );
  };

  const allSelected = contacts.length > 0 && contacts.every((c) => selectedIds[c.id]);

  return (
    <Screen>
      <View style={styles.container}>
        {/* Header Controls */}
        <View style={styles.searchRow}>
          <Searchbar
            placeholder="Search local cache..."
            onChangeText={handleSearch}
            value={searchQuery}
            style={styles.searchbar}
            inputStyle={styles.searchInput}
          />
          <IconButton
            icon="card-search-outline"
            iconColor={Colors.primary}
            size={24}
            onPress={importDeviceContacts}
            style={styles.actionBtn}
            loading={loading}
          />
        </View>

        {/* Selection summary / Bulk actions bar */}
        <View style={styles.bulkRow}>
          <TouchableOpacity onPress={toggleSelectAll} style={styles.selectAllBtn}>
            <Checkbox.Android
              status={allSelected ? "checked" : "unchecked"}
              onPress={toggleSelectAll}
              color={Colors.primary}
            />
            <Text style={styles.bulkText}>Select All ({contacts.length})</Text>
          </TouchableOpacity>

          {mutatedCount > 0 && (
            <Button
              mode="contained"
              onPress={() => setShowSyncDialog(true)}
              loading={syncing}
              icon="sync"
              style={styles.syncBtn}
              textColor="#fff"
            >
              Sync Selected ({mutatedCount})
            </Button>
          )}
        </View>

        {/* Contact List */}
        <FlatList
          data={contacts}
          renderItem={renderContactItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.empty}>
              {loading ? (
                <ActivityIndicator size="large" color={Colors.primary} />
              ) : (
                <>
                  <MaterialCommunityIcons name="contacts-outline" size={60} color={Colors.borderStrong} />
                  <Text style={styles.emptyText}>No contacts cached locally.</Text>
                  <Button mode="outlined" onPress={importDeviceContacts} style={{ marginTop: 15 }}>
                    Import Device Contacts
                  </Button>
                </>
              )}
            </View>
          }
        />

        {/* Manual Customer Link Modal */}
        <Portal>
          <Modal
            visible={showLinkModal}
            transparent
            animationType="slide"
            onRequestClose={() => setShowLinkModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Link Customer</Text>
                  <IconButton icon="close" size={20} onPress={() => setShowLinkModal(false)} />
                </View>
                <Text style={styles.modalSub}>
                  Select a customer record to associate with {selectedContact?.name}. Priority is given to phone-less/GST-only profiles.
                </Text>

                <Searchbar
                  placeholder="Search customers..."
                  onChangeText={setCustomerSearch}
                  value={customerSearch}
                  style={styles.modalSearch}
                  inputStyle={styles.searchInput}
                />

                <ScrollView style={styles.customerScroll}>
                  {loadingCustomers ? (
                    <ActivityIndicator size="small" color={Colors.primary} style={{ margin: 20 }} />
                  ) : filteredCustomersForLink.length === 0 ? (
                    <Text style={styles.modalEmptyText}>No matching customers found.</Text>
                  ) : (
                    filteredCustomersForLink.map((c) => {
                      const hasPhone = !!c.phone;
                      return (
                        <TouchableOpacity
                          key={c.id}
                          style={styles.customerItem}
                          onPress={() => handleLinkCustomer(c.id)}
                        >
                          <View>
                            <Text style={styles.customerItemName}>{c.name}</Text>
                            {c.gstin && <Text style={styles.customerItemSub}>GSTIN: {c.gstin}</Text>}
                            {hasPhone && <Text style={styles.customerItemSub}>Phone: {c.phone}</Text>}
                          </View>
                          {!hasPhone && (
                            <View style={styles.noPhoneBadge}>
                              <Text style={styles.noPhoneBadgeText}>NO PHONE</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })
                  )}
                </ScrollView>
              </View>
            </View>
          </Modal>

          {/* Sync options Dialog */}
          <Dialog visible={showSyncDialog} onDismiss={() => setShowSyncDialog(false)} style={styles.dialog}>
            <Dialog.Title>Merge Strategy</Dialog.Title>
            <Dialog.Content>
              <Text style={{ marginBottom: 15, color: Colors.textSecondary }}>
                Choose how ShopControl merges these local mutations with the server:
              </Text>
              <RadioButton.Group
                onValueChange={(val) => setMergeStrategy(val as any)}
                value={mergeStrategy}
              >
                <View style={styles.radioRow}>
                  <RadioButton.Android value="MERGE" color={Colors.primary} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.radioTitle}>Merge (Recommended)</Text>
                    <Text style={styles.radioDesc}>
                      Combines info. Fills blank email/contact person details without overwriting existing data.
                    </Text>
                  </View>
                </View>

                <View style={[styles.radioRow, { marginTop: 15 }]}>
                  <RadioButton.Android value="OVERWRITE" color={Colors.primary} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.radioTitle}>Overwrite</Text>
                    <Text style={styles.radioDesc}>
                      Forcefully overwrite name, phone and emails on matching customer records.
                    </Text>
                  </View>
                </View>
              </RadioButton.Group>
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setShowSyncDialog(false)} textColor={Colors.textSecondary}>
                Cancel
              </Button>
              <Button onPress={handleSyncToServer} mode="contained" buttonColor={Colors.primary} textColor="#fff">
                Execute Sync
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F7FA" },
  searchRow: {
    flexDirection: "row",
    padding: spacing.md,
    alignItems: "center",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchbar: {
    flex: 1,
    elevation: 0,
    backgroundColor: "#F0F0F3",
    borderRadius: radius.md,
    height: 44,
  },
  searchInput: { fontSize: fontSize.sm, minHeight: 0 },
  actionBtn: { marginLeft: spacing.sm, backgroundColor: "#F0F0F3" },
  
  bulkRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  selectAllBtn: { flexDirection: "row", alignItems: "center" },
  bulkText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: Colors.textPrimary },
  syncBtn: { borderRadius: radius.md, backgroundColor: Colors.primary },
  
  listContent: { padding: spacing.md },
  contactCard: {
    marginBottom: spacing.md,
    backgroundColor: "#fff",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  mutatedCard: {
    borderColor: Colors.warningLight,
    backgroundColor: "#FFFBEB",
  },
  cardLayout: { flexDirection: "row", alignItems: "flex-start", padding: 0 },
  checkboxContainer: { alignSelf: "center", marginRight: spacing.xs },
  
  contactInfo: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  contactName: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: Colors.textPrimary },
  contactPhone: { fontSize: fontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  contactEmail: { fontSize: fontSize.xs, color: Colors.textMuted, marginTop: 1 },
  
  mutatedBadge: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  mutatedBadgeText: { fontSize: 10, fontWeight: fontWeight.bold, color: "#B45309" },

  linkBadgeRow: { flexDirection: "row", marginTop: spacing.sm },
  linkBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    maxWidth: "90%",
  },
  matchedBadge: {
    backgroundColor: Colors.primaryLight,
  },
  linkedBadge: {
    backgroundColor: "#E0F2FE",
  },
  notLinkedBadge: {
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#F59E0B",
    borderStyle: "dashed",
  },
  linkBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: Colors.textPrimary,
    marginLeft: 4,
    marginRight: 4,
  },
  unlinkBtn: { marginLeft: 4 },
  
  pillsContainer: { flexDirection: "row", alignItems: "center", marginTop: spacing.md },
  pillsLabel: { fontSize: fontSize.xs, color: Colors.textSecondary, marginRight: spacing.sm },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    marginRight: spacing.sm,
    backgroundColor: "#fff",
  },
  pillRegularActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  pillBusinessActive: {
    backgroundColor: "#1D4ED8",
    borderColor: "#1D4ED8",
  },
  pillText: { fontSize: fontSize.xs, color: Colors.textSecondary, fontWeight: fontWeight.semibold },
  pillTextActive: { color: "#fff" },

  empty: { padding: 80, alignItems: "center", justifyContent: "center" },
  emptyText: { marginTop: 10, fontSize: fontSize.md, color: Colors.textSecondary, textAlign: "center" },

  // Modals & Overlay
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: "75%",
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: Colors.textPrimary },
  modalSub: { fontSize: fontSize.sm, color: Colors.textSecondary, marginVertical: spacing.sm },
  modalSearch: { elevation: 0, backgroundColor: "#F0F0F3", borderRadius: radius.md, marginBottom: spacing.md },
  customerScroll: { marginVertical: spacing.sm },
  customerItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  customerItemName: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: Colors.textPrimary },
  customerItemSub: { fontSize: fontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  noPhoneBadge: { backgroundColor: "#FEE2E2", paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm },
  noPhoneBadgeText: { fontSize: 10, fontWeight: fontWeight.bold, color: "#DC2626" },
  modalEmptyText: { textAlign: "center", color: Colors.textSecondary, padding: spacing.xl },

  dialog: { backgroundColor: "#fff", borderRadius: radius.md },
  radioRow: { flexDirection: "row", alignItems: "flex-start" },
  radioTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: Colors.textPrimary },
  radioDesc: { fontSize: fontSize.xs, color: Colors.textSecondary, marginTop: 2 },
});
