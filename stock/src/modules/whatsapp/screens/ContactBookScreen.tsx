import { useEffect, useState, useMemo, useCallback, memo } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
} from "react-native";
import {
  Text,
  Button,
  Divider,
  Searchbar,
  Card,
  IconButton,
  Portal,
  RadioButton,
  Checkbox,
  SegmentedButtons,
  Dialog,
} from "react-native-paper";
import * as Contacts from "expo-contacts/legacy";
import { FlashList } from "@shopify/flash-list";
const FlashListAny = FlashList as any;
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
} from "react-native-reanimated";
import { contactsDb, LocalContact } from "../services/contactsDb";
import { useCustomersQuery } from "../../../hooks/useCustomers";
import { useShopStore } from "../../../auth/shop-store";
import { colors as Colors, spacing, radius, fontSize, fontWeight } from "../../../theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Screen } from "../../../components/Screen";
import { mmkvStorage } from "../../../auth/mmkv-storage";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useSelectionStore } from "../store/contactSelection.store";
import {
  useContactsLocalQuery,
  useContactsStatsQuery,
  useContactsFilteredIdsQuery,
  useUpdateContactTagMutation,
  useLinkCustomerMutation,
} from "../hooks/useContactsLocal";
import { useContactsSync } from "../hooks/useContactsSync";
import { useDebounce } from "use-debounce";
import { useNavigation } from "@react-navigation/native";
import { waColors } from "../whatsapp-ui";

// -------------------------------------------------------------
// COMPACT BOTTOM SHEET UTILITY COMPONENT
// -------------------------------------------------------------
interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const BottomSheet = ({ visible, onClose, title, children }: BottomSheetProps) => {
  return (
    <Portal>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={onClose}>
          <View style={styles.sheetContent} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetTitleRow}>
                <Text style={styles.sheetTitle}>{title}</Text>
                <IconButton icon="close" size={18} onPress={onClose} style={{ margin: 0 }} />
              </View>
            </View>
            <Divider style={{ marginBottom: spacing.sm }} />
            {children}
          </View>
        </TouchableOpacity>
      </Modal>
    </Portal>
  );
};

// -------------------------------------------------------------
// MEMOIZED COMPACT CONTACT CARD COMPONENT
// -------------------------------------------------------------
interface ContactCardProps {
  item: LocalContact;
  matchedCustomer: any;
  manuallyLinkedCustomer: any;
  onOpenOptions: (contact: LocalContact) => void;
}

const AnimatedCard = Animated.createAnimatedComponent(Card);

const ContactCard = memo(({
  item,
  matchedCustomer,
  manuallyLinkedCustomer,
  onOpenOptions,
}: ContactCardProps) => {
  const isSelected = useSelectionStore(
    useCallback((state) => state.selectedIds.has(item.id), [item.id])
  );
  const toggle = useSelectionStore((state) => state.toggle);
  const isMutated = item.syncState === "MUTATED" || item.syncState === "UNSYNCED";

  const selectedShared = useSharedValue(0);

  useEffect(() => {
    selectedShared.value = withTiming(isSelected ? 1 : 0, { duration: 120 });
  }, [isSelected, selectedShared]);

  const animatedCardStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      selectedShared.value,
      [0, 1],
      [isMutated ? "#FFFBEB" : "#ffffff", "#F0FDF4"]
    );
    const borderColor = interpolateColor(
      selectedShared.value,
      [0, 1],
      [isMutated ? Colors.warningLight : Colors.border, Colors.primary]
    );
    return {
      backgroundColor,
      borderColor,
    };
  });

  const animatedCheckboxStyle = useAnimatedStyle(() => {
    const scale = selectedShared.value;
    const backgroundColor = interpolateColor(
      selectedShared.value,
      [0, 1],
      ["transparent", Colors.primary]
    );
    const borderColor = interpolateColor(
      selectedShared.value,
      [0, 1],
      [Colors.borderStrong, Colors.primary]
    );
    return {
      transform: [{ scale: 0.85 + scale * 0.15 }],
      backgroundColor,
      borderColor,
    };
  });

  return (
    <AnimatedCard
      style={[
        styles.contactCard,
        animatedCardStyle,
      ]}
      onLongPress={() => toggle(item.id)}
    >
      <Card.Content style={styles.cardLayout}>
        <TouchableOpacity onPress={() => toggle(item.id)} style={styles.checkboxTouch}>
          <Animated.View style={[styles.customCheckbox, animatedCheckboxStyle]}>
            {isSelected && (
              <MaterialCommunityIcons name="check" size={10} color="#fff" />
            )}
          </Animated.View>
        </TouchableOpacity>

        <View style={styles.contactInfo}>
          {/* Primary Row: Name & Tag Badges */}
          <View style={styles.primaryRow}>
            <Text style={styles.contactName} numberOfLines={1}>
              {item.name || `+${item.phone}`}
            </Text>
            
            <View style={styles.badgeWrapper}>
              {item.tag !== "NONE" && (
                <View style={[
                  styles.tagBadge,
                  item.tag === "REGULAR" ? styles.badgeRegular : styles.badgeBusiness
                ]}>
                  <Text style={[
                    styles.tagBadgeText,
                    item.tag === "REGULAR" ? { color: Colors.primaryDark } : { color: "#1e3a8a" }
                  ]}>
                    {item.tag === "REGULAR" ? "Regular" : "Business"}
                  </Text>
                </View>
              )}
              {isMutated && (
                <View style={styles.mutatedBadge}>
                  <Text style={styles.mutatedBadgeText}>UNSYNCED</Text>
                </View>
              )}
            </View>
          </View>

          {/* Secondary Row: Phone / Unnamed & Connection Badge */}
          <View style={styles.secondaryRow}>
            {item.name ? (
              <Text style={styles.contactPhone}>{`+${item.phone}`}</Text>
            ) : (
              <Text style={styles.noNameLabel}>No contact name</Text>
            )}

            {manuallyLinkedCustomer ? (
              <View style={[styles.linkBadge, styles.linkedBadge]}>
                <MaterialCommunityIcons name="link" size={10} color="#0284c7" />
                <Text style={styles.linkBadgeText} numberOfLines={1}>
                  {`Linked: ${manuallyLinkedCustomer.name}`}
                </Text>
              </View>
            ) : matchedCustomer ? (
              <View style={[styles.linkBadge, styles.matchedBadge]}>
                <MaterialCommunityIcons name="check-decagram" size={10} color={Colors.primary} />
                <Text style={styles.linkBadgeText} numberOfLines={1}>
                  {`Matched: ${matchedCustomer.name}`}
                </Text>
              </View>
            ) : (
              <View style={[styles.linkBadge, styles.notLinkedBadge]}>
                <MaterialCommunityIcons name="link-variant" size={10} color="#d97706" />
                <Text style={[styles.linkBadgeText, { color: "#d97706" }]}>Unlinked</Text>
              </View>
            )}
          </View>
        </View>

        <IconButton
          icon="dots-vertical"
          size={18}
          iconColor={Colors.textSecondary}
          onPress={() => onOpenOptions(item)}
          style={styles.cardMenuBtn}
        />
      </Card.Content>
    </AnimatedCard>
  );
});

ContactCard.displayName = "ContactCard";

// -------------------------------------------------------------
// COMPACT EMPTY STATES
// -------------------------------------------------------------
interface EmptyStateProps {
  type: "no_imports" | "no_results" | "no_filters";
  onAction: () => void;
}

const EmptyState = ({ type, onAction }: EmptyStateProps) => {
  const config = {
    no_imports: {
      icon: "contacts-outline" as const,
      color: Colors.textSecondary,
      title: "No Contacts Imported",
      subtitle: "Import device contacts to sync with CRM customer profiles.",
      btnText: "Import Contacts",
    },
    no_results: {
      icon: "magnify-close" as const,
      color: Colors.textMuted,
      title: "No Results",
      subtitle: "No contact book records found for this query.",
      btnText: "Clear Search",
    },
    no_filters: {
      icon: "filter-off-outline" as const,
      color: Colors.textMuted,
      title: "No Matches",
      subtitle: "No contacts match the current segmented filter settings.",
      btnText: "Reset Filters",
    },
  }[type];

  return (
    <View style={styles.empty}>
      <MaterialCommunityIcons name={config.icon} size={40} color={config.color} />
      <Text style={styles.emptyText}>{config.title}</Text>
      <Text style={styles.emptySubtitle}>{config.subtitle}</Text>
      <Button mode="outlined" onPress={onAction} style={{ marginTop: spacing.sm }} compact>
        {config.btnText}
      </Button>
    </View>
  );
};

// -------------------------------------------------------------
// MAIN CONTACT BOOK SCREEN
// -------------------------------------------------------------
export const ContactBookScreen = () => {
  const navigation = useNavigation();
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch] = useDebounce(searchQuery, 200);

  // Grouped Filter Controls
  const [activeFilterCategory, setActiveFilterCategory] = useState<"status" | "link" | "tag">("status");
  const [syncFilter, setSyncFilter] = useState<"ALL" | "UNSYNCED" | "SYNCED">("ALL");
  const [linkFilter, setLinkFilter] = useState<"ALL" | "LINKED" | "UNLINKED">("ALL");
  const [tagFilter, setTagFilter] = useState<"ALL" | "REGULAR" | "BUSINESS" | "NONE">("ALL");

  // Options Sheet State
  const [showOptionsSheet, setShowOptionsSheet] = useState(false);
  const [selectedContact, setSelectedContact] = useState<LocalContact | null>(null);

  // Linking Sheet State
  const [showLinkSheet, setShowLinkSheet] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerLimit, setCustomerLimit] = useState(50);

  // Sync Dialog State
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [mergeStrategy, setMergeStrategy] = useState<"MERGE" | "OVERWRITE">("MERGE");

  useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitle: "Contacts",
      headerStyle: { backgroundColor: waColors.greenDark },
      headerTintColor: "#fff",
      headerShadowVisible: false,
      headerTitleStyle: { fontWeight: "700" },
    });
  }, [navigation]);

  // Load server customers
  const { data: customers = [], isLoading: loadingCustomers } = useCustomersQuery();

  // Precompute Map Lookups
  const customerMap = useMemo(() => {
    const map = new Map<string, any>();
    customers.forEach((c) => {
      if (c.phone) {
        const norm = c.phone.replace(/\D/g, "");
        if (norm.length >= 10) {
          map.set(norm.slice(-10), c);
        }
      }
    });
    return map;
  }, [customers]);

  const customerIdMap = useMemo(() => {
    const map = new Map<string, any>();
    customers.forEach((c) => {
      map.set(c.id, c);
    });
    return map;
  }, [customers]);

  const customerPhonesStr = useMemo(() => {
    if (!customers || customers.length === 0) return "";
    const suffixList = customers
      .map((c) => {
        if (!c.phone) return null;
        const clean = c.phone.replace(/\D/g, "");
        return clean.length >= 10 ? clean.slice(-10) : null;
      })
      .filter(Boolean);
    return `,${suffixList.join(",")},`;
  }, [customers]);

  // Query Stats & paginated Local Lists
  const { data: stats } = useContactsStatsQuery(customerPhonesStr);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: loadingLocal,
  } = useContactsLocalQuery({
    searchQuery: debouncedSearch,
    syncFilter,
    linkFilter,
    tagFilter,
    customerPhonesStr,
  });

  const { data: filteredIds = [] } = useContactsFilteredIdsQuery({
    searchQuery: debouncedSearch,
    syncFilter,
    linkFilter,
    tagFilter,
    customerPhonesStr,
  });

  // Zustand selection states
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const selectMany = useSelectionStore((s) => s.selectMany);
  const deselectMany = useSelectionStore((s) => s.deselectMany);
  const clearSelection = useSelectionStore((s) => s.clear);
  const selectedCount = selectedIds.size;

  const isAllFilteredSelected = useMemo(() => {
    if (filteredIds.length === 0) return false;
    return filteredIds.every((id) => selectedIds.has(id));
  }, [filteredIds, selectedIds]);

  // Local Mutators
  const updateTagMutation = useUpdateContactTagMutation();
  const linkCustomerMutation = useLinkCustomerMutation();
  const syncMutation = useContactsSync(activeShopId);

  // Import mutation using expo-contacts/legacy
  const importMutation = useMutation<number, Error, void>({
    mutationFn: async () => {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        throw new Error("This screen requires access to your device contacts to sync with CRM.");
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.FirstName,
          Contacts.Fields.LastName,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
        ],
      });

      console.log(`[Contacts Diagnostics] Total raw contacts read from device: ${data ? data.length : 0}`);
      if (data && data.length > 0) {
        console.log(`[Contacts Diagnostics] Sample raw contact record:`, JSON.stringify(data[0]));
      }

      if (!data || data.length === 0) {
        throw new Error("No contact cards were found on this device.");
      }

      const formatted = data
        .map((c) => {
          const phone = c.phoneNumbers?.[0]?.number || "";
          const cleanPhone = phone.replace(/\D/g, "");

          const firstName = c.firstName || "";
          const lastName = c.lastName || "";
          const nameField = c.name || "";

          const compoundName = [firstName, lastName].filter(Boolean).join(" ");
          const resolvedName = (nameField || compoundName || "").trim();

          return {
            id: c.id || "",
            name: resolvedName,
            phone: cleanPhone,
            email: c.emails?.[0]?.email || undefined,
          };
        })
        .filter((c) => c.phone.length >= 10);

      await contactsDb.upsertDeviceContacts(formatted);
      mmkvStorage.setItem("whatsapp_has_imported_device_contacts", "true");
      return formatted.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["contacts-local"] });
      queryClient.invalidateQueries({ queryKey: ["contacts-stats"] });
      Alert.alert("Import Successful", `Cached ${count} contacts locally.`);
    },
    onError: (err: any) => {
      Alert.alert("Import Failed", err.message || "Failed to import contacts");
    },
  });

  useEffect(() => {
    const hasImported = mmkvStorage.getItem("whatsapp_has_imported_device_contacts");
    if (hasImported !== "true") {
      importMutation.mutate();
    }
  }, []);

  const isSearching = searchQuery !== debouncedSearch;

  const flattenedContacts = useMemo(() => {
    return data?.pages.flatMap((page) => page) || [];
  }, [data]);

  // Handlers
  const handleToggleSelectAll = useCallback(() => {
    if (isAllFilteredSelected) {
      deselectMany(filteredIds);
    } else {
      selectMany(filteredIds);
    }
  }, [filteredIds, isAllFilteredSelected, selectMany, deselectMany]);

  const handleOpenOptions = useCallback((contact: LocalContact) => {
    setSelectedContact(contact);
    setShowOptionsSheet(true);
  }, []);

  const handleSelectTag = useCallback((tag: "REGULAR" | "BUSINESS" | "NONE") => {
    if (!selectedContact) return;
    updateTagMutation.mutate({ id: selectedContact.id, tag });
    setShowOptionsSheet(false);
  }, [selectedContact, updateTagMutation]);

  const handleOpenLinkSheet = () => {
    setShowOptionsSheet(false);
    setCustomerSearch("");
    setCustomerLimit(50);
    setShowLinkSheet(true);
  };

  const handleLinkCustomer = useCallback((customerId: string | null) => {
    if (!selectedContact) return;
    linkCustomerMutation.mutate({ id: selectedContact.id, customerId });
    setShowLinkSheet(false);
    setSelectedContact(null);
  }, [selectedContact, linkCustomerMutation]);

  const handleUnlinkCustomer = useCallback((contactId: string) => {
    linkCustomerMutation.mutate({ id: contactId, customerId: null });
  }, [linkCustomerMutation]);

  const handleSyncToServer = async () => {
    setShowSyncDialog(false);
    syncMutation.mutate({ mergeStrategy, selectedIds });
  };

  const handleClearFilters = () => {
    setSyncFilter("ALL");
    setLinkFilter("ALL");
    setTagFilter("ALL");
    setSearchQuery("");
  };

  const filteredCustomersForLink = useMemo(() => {
    const cleanSearch = customerSearch.trim().toLowerCase();
    const list = customers.filter(
      (cust) =>
        cust.name.toLowerCase().includes(cleanSearch) ||
        (cust.gstin && cust.gstin.toLowerCase().includes(cleanSearch)) ||
        (cust.phone && cust.phone.includes(cleanSearch))
    );
    return [...list].sort((a, b) => (!a.phone ? 1 : 0) - (!b.phone ? 1 : 0));
  }, [customers, customerSearch]);

  const visibleCustomers = useMemo(() => {
    return filteredCustomersForLink.slice(0, customerLimit);
  }, [filteredCustomersForLink, customerLimit]);

  const renderItem = useCallback(
    ({ item }: { item: LocalContact }) => {
      const matched = customerMap.get(item.phone.slice(-10));
      const manual = item.customerId ? customerIdMap.get(item.customerId) : null;

      return (
        <ContactCard
          item={item}
          matchedCustomer={matched}
          manuallyLinkedCustomer={manual}
          onOpenOptions={handleOpenOptions}
        />
      );
    },
    [customerMap, customerIdMap, handleOpenOptions]
  );

  const renderEmptyComponent = () => {
    if (loadingLocal || importMutation.isPending) {
      return (
        <View style={styles.loaderCenter}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      );
    }
    const hasSearch = searchQuery.trim().length > 0;
    const hasFilters = syncFilter !== "ALL" || linkFilter !== "ALL" || tagFilter !== "ALL";

    if (stats && stats.total === 0) {
      return <EmptyState type="no_imports" onAction={() => importMutation.mutate()} />;
    }
    if (hasSearch) {
      return <EmptyState type="no_results" onAction={() => setSearchQuery("")} />;
    }
    if (hasFilters) {
      return <EmptyState type="no_filters" onAction={handleClearFilters} />;
    }
    return null;
  };

  // Option sheet flags
  const hasManualLink = !!selectedContact?.customerId;

  return (
    <Screen>
      <View style={styles.container}>
        {/* Top Header Row with Search & Compact Import Icon */}
        <View style={styles.searchRow}>
          <Searchbar
            placeholder="Search contacts, phone numbers..."
            onChangeText={setSearchQuery}
            value={searchQuery}
            style={styles.searchbar}
            inputStyle={styles.searchInput}
            loading={isSearching || loadingLocal}
            iconColor={Colors.textSecondary}
          />
          <IconButton
            icon="account-multiple-plus-outline"
            onPress={() => importMutation.mutate()}
            disabled={importMutation.isPending}
            size={22}
            iconColor={Colors.primary}
            style={styles.headerActionBtn}
          />
        </View>

        {/* Compact CRM Stats Summary Strip */}
        <View style={styles.statsSummaryStrip}>
          <View style={styles.stripItem}>
            <Text style={styles.stripCount}>{stats?.total || 0}</Text>
            <Text style={styles.stripLabel}>Total</Text>
          </View>
          <View style={styles.stripDivider} />
          <View style={styles.stripItem}>
            <Text style={[styles.stripCount, { color: "#d97706" }]}>{stats?.unsynced || 0}</Text>
            <Text style={styles.stripLabel}>Unsynced</Text>
          </View>
          <View style={styles.stripDivider} />
          <View style={styles.stripItem}>
            <Text style={[styles.stripCount, { color: "#16a34a" }]}>{stats?.linked || 0}</Text>
            <Text style={styles.stripLabel}>Linked</Text>
          </View>
          <View style={styles.stripDivider} />
          <View style={styles.stripItem}>
            <Text style={[styles.stripCount, { color: "#1d4ed8" }]}>{stats?.business || 0}</Text>
            <Text style={styles.stripLabel}>Biz</Text>
          </View>
          <View style={styles.stripDivider} />
          <View style={styles.stripItem}>
            <Text style={[styles.stripCount, { color: "#10b981" }]}>{stats?.regular || 0}</Text>
            <Text style={styles.stripLabel}>Regular</Text>
          </View>
        </View>

        {/* Double-Row Segmented CRM Filter Panel */}
        <View style={styles.filterControlPanel}>
          <SegmentedButtons
            value={activeFilterCategory}
            onValueChange={(val) => setActiveFilterCategory(val as any)}
            buttons={[
              { value: "status", label: `Status (${stats?.unsynced || 0})`, style: styles.segmentBtn, labelStyle: styles.segmentBtnLabel },
              { value: "link", label: `Link (${stats?.linked || 0})`, style: styles.segmentBtn, labelStyle: styles.segmentBtnLabel },
              { value: "tag", label: `Type (${(stats?.business || 0) + (stats?.regular || 0)})`, style: styles.segmentBtn, labelStyle: styles.segmentBtnLabel },
            ]}
            density="small"
            style={styles.categorySegment}
          />

          <View style={styles.valueSegmentWrapper}>
            {activeFilterCategory === "status" && (
              <SegmentedButtons
                value={syncFilter}
                onValueChange={(val) => setSyncFilter(val as any)}
                buttons={[
                  { value: "ALL", label: "All Status", style: styles.valueSegmentBtn, labelStyle: styles.valueSegmentBtnLabel },
                  { value: "UNSYNCED", label: "Unsynced", style: styles.valueSegmentBtn, labelStyle: styles.valueSegmentBtnLabel },
                  { value: "SYNCED", label: "Synced", style: styles.valueSegmentBtn, labelStyle: styles.valueSegmentBtnLabel },
                ]}
                density="small"
              />
            )}
            {activeFilterCategory === "link" && (
              <SegmentedButtons
                value={linkFilter}
                onValueChange={(val) => setLinkFilter(val as any)}
                buttons={[
                  { value: "ALL", label: "All Links", style: styles.valueSegmentBtn, labelStyle: styles.valueSegmentBtnLabel },
                  { value: "LINKED", label: "Linked", style: styles.valueSegmentBtn, labelStyle: styles.valueSegmentBtnLabel },
                  { value: "UNLINKED", label: "Unlinked", style: styles.valueSegmentBtn, labelStyle: styles.valueSegmentBtnLabel },
                ]}
                density="small"
              />
            )}
            {activeFilterCategory === "tag" && (
              <SegmentedButtons
                value={tagFilter}
                onValueChange={(val) => setTagFilter(val as any)}
                buttons={[
                  { value: "ALL", label: "All Types", style: styles.valueSegmentBtn, labelStyle: styles.valueSegmentBtnLabel },
                  { value: "REGULAR", label: "Regular", style: styles.valueSegmentBtn, labelStyle: styles.valueSegmentBtnLabel },
                  { value: "BUSINESS", label: "Business", style: styles.valueSegmentBtn, labelStyle: styles.valueSegmentBtnLabel },
                  { value: "NONE", label: "No Tag", style: styles.valueSegmentBtn, labelStyle: styles.valueSegmentBtnLabel },
                ]}
                density="small"
              />
            )}
          </View>
        </View>

        {/* Selection Details Header */}
        <View style={styles.listHeaderRow}>
          <View style={{ flex: 1 }}>
            {selectedCount > 0 ? (
              <Text style={styles.selectionLabelText}>
                {selectedCount} selected <Text style={{ color: Colors.textMuted }}>of</Text> {filteredIds.length} filtered
              </Text>
            ) : (
              <Text style={styles.selectionLabelText}>
                Showing {flattenedContacts.length} of {filteredIds.length} filtered
              </Text>
            )}
            <Text style={styles.selectionSubText}>
              Total contact entries: {stats?.total || 0}
            </Text>
          </View>

          <View style={styles.headerRightActions}>
            <TouchableOpacity onPress={handleToggleSelectAll} style={styles.selectAllWrapper}>
              <Checkbox.Android
                status={isAllFilteredSelected ? "checked" : "unchecked"}
                onPress={handleToggleSelectAll}
                color={Colors.primary}
              />
              <Text style={styles.selectAllText}>Select Page</Text>
            </TouchableOpacity>
            {selectedCount > 0 && (
              <TouchableOpacity onPress={clearSelection} style={styles.clearSelectionBtn}>
                <Text style={styles.clearSelectionText}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Paginated Virtualized Contacts List */}
        <FlashListAny
          data={flattenedContacts}
          renderItem={renderItem}
          keyExtractor={(item: LocalContact) => item.id}
          contentContainerStyle={styles.listContent}
          estimatedItemSize={56}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) {
              fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={renderEmptyComponent}
          ListFooterComponent={
            isFetchingNextPage ? (
              <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: spacing.md }} />
            ) : null
          }
        />

        {/* Sticky Action Footer (Sync triggers) */}
        {selectedCount > 0 && (
          <View style={styles.stickyFooter}>
            <View style={styles.footerLeft}>
              <View style={styles.footerRow}>
                <Text style={styles.footerHighlight}>{selectedCount} Selected</Text>
                <Text style={styles.footerText}>{` • ${filteredIds.length} Filtered`}</Text>
              </View>
              <Text style={styles.filterSummary} numberOfLines={1}>
                {`Filters: Status=${syncFilter}, Link=${linkFilter}, Tag=${tagFilter}`}
              </Text>
            </View>
            <Button
              mode="contained"
              onPress={() => setShowSyncDialog(true)}
              loading={syncMutation.isPending}
              icon="sync"
              style={styles.stickySyncBtn}
              textColor="#fff"
            >
              {`Sync ${selectedCount} Contacts`}
            </Button>
          </View>
        )}

        {/* 1. Bottom Sheet for Contact Context Options */}
        <BottomSheet
          visible={showOptionsSheet}
          onClose={() => setShowOptionsSheet(false)}
          title={selectedContact?.name || `+${selectedContact?.phone}` || "Contact Options"}
        >
          <View style={styles.actionsList}>
            <TouchableOpacity style={styles.actionItem} onPress={() => handleSelectTag("REGULAR")}>
              <MaterialCommunityIcons name="account-outline" size={20} color={Colors.primary} />
              <Text style={styles.actionItemText}>Tag as Regular</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem} onPress={() => handleSelectTag("BUSINESS")}>
              <MaterialCommunityIcons name="briefcase-outline" size={20} color="#1d4ed8" />
              <Text style={styles.actionItemText}>Tag as Business</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem} onPress={() => handleSelectTag("NONE")}>
              <MaterialCommunityIcons name="tag-off-outline" size={20} color={Colors.textSecondary} />
              <Text style={styles.actionItemText}>Remove Tag</Text>
            </TouchableOpacity>
            
            <Divider style={{ marginVertical: spacing.xs }} />
            
            {hasManualLink ? (
              <TouchableOpacity
                style={styles.actionItem}
                onPress={() => {
                  if (selectedContact) {
                    handleUnlinkCustomer(selectedContact.id);
                    setShowOptionsSheet(false);
                  }
                }}
              >
                <MaterialCommunityIcons name="link-variant-off" size={20} color="#dc2626" />
                <Text style={[styles.actionItemText, { color: "#dc2626" }]}>Unlink Customer</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.actionItem} onPress={handleOpenLinkSheet}>
                <MaterialCommunityIcons name="link-variant" size={20} color="#d97706" />
                <Text style={styles.actionItemText}>Link Customer Record</Text>
              </TouchableOpacity>
            )}
          </View>
        </BottomSheet>

        {/* 2. Bottom Sheet for Customer Linking */}
        <BottomSheet
          visible={showLinkSheet}
          onClose={() => setShowLinkSheet(false)}
          title={`Link Customer Record`}
        >
          <View style={styles.linkSheetContent}>
            <Searchbar
              placeholder="Search customers by name, phone..."
              onChangeText={(val) => {
                setCustomerSearch(val);
                setCustomerLimit(50);
              }}
              value={customerSearch}
              style={styles.modalSearch}
              inputStyle={styles.searchInput}
            />

            <FlashListAny
              data={visibleCustomers}
              keyExtractor={(item: any) => item.id}
              style={styles.customerScroll}
              estimatedItemSize={60}
              onEndReached={() => {
                if (customerLimit < filteredCustomersForLink.length) {
                  setCustomerLimit((prev) => prev + 50);
                }
              }}
              onEndReachedThreshold={0.5}
              renderItem={({ item: c }: any) => {
                const hasPhone = !!c.phone;
                return (
                  <TouchableOpacity
                    style={styles.customerItem}
                    onPress={() => handleLinkCustomer(c.id)}
                  >
                    <View style={{ flex: 1, marginRight: spacing.sm }}>
                      <Text style={styles.customerItemName} numberOfLines={1}>{c.name}</Text>
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
              }}
              ListEmptyComponent={
                loadingCustomers ? (
                  <ActivityIndicator size="small" color={Colors.primary} style={{ margin: 20 }} />
                ) : (
                  <Text style={styles.modalEmptyText}>No matching customers found.</Text>
                )
              }
            />
          </View>
        </BottomSheet>

        {/* Sync Strategy Dialog */}
        <Portal>
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
              <Button
                onPress={handleSyncToServer}
                mode="contained"
                buttonColor={Colors.primary}
                textColor="#fff"
                loading={syncMutation.isPending}
              >
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
  container: {
    flex: 1,
    backgroundColor: waColors.surface,
  },
  loaderCenter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  // Top Row
  searchRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
    backgroundColor: waColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: waColors.border,
  },
  searchbar: {
    flex: 1,
    elevation: 0,
    backgroundColor: waColors.surfaceMuted,
    borderRadius: 20,
    height: 40,
  },
  searchInput: {
    fontSize: fontSize.sm,
    minHeight: 0,
    paddingBottom: 4,
  },
  headerActionBtn: {
    marginLeft: spacing.xs,
    marginRight: 0,
    backgroundColor: waColors.surfaceMuted,
    borderRadius: 20,
    width: 38,
    height: 38,
    justifyContent: "center",
    alignItems: "center",
  },

  // Stats Summary Strip
  statsSummaryStrip: {
    flexDirection: "row",
    backgroundColor: waColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: waColors.border,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    justifyContent: "space-between",
    alignItems: "center",
  },
  stripItem: {
    flex: 1,
    alignItems: "center",
  },
  stripCount: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: Colors.textPrimary,
  },
  stripLabel: {
    fontSize: 9,
    color: Colors.textSecondary,
    fontWeight: fontWeight.semibold,
    marginTop: 1,
  },
  stripDivider: {
    width: 1,
    height: 16,
    backgroundColor: Colors.border,
  },

  // Double-Row Segmented Filters Panel
  filterControlPanel: {
    backgroundColor: waColors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: waColors.border,
  },
  categorySegment: {
    marginBottom: spacing.xs,
  },
  segmentBtn: {
    borderRadius: radius.sm,
  },
  segmentBtnLabel: {
    fontSize: 9,
    fontWeight: fontWeight.semibold,
  },
  valueSegmentWrapper: {
    marginTop: 2,
  },
  valueSegmentBtn: {
    borderRadius: radius.sm,
  },
  valueSegmentBtnLabel: {
    fontSize: 9,
    fontWeight: fontWeight.semibold,
  },

  // Selection Info Header Row
  listHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: waColors.surfaceMuted,
    borderBottomWidth: 1,
    borderBottomColor: waColors.border,
  },
  selectionLabelText: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: Colors.textPrimary,
  },
  selectionSubText: {
    fontSize: 9,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  headerRightActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  selectAllWrapper: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: spacing.sm,
  },
  selectAllText: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
    color: Colors.textSecondary,
    marginLeft: 2,
  },
  clearSelectionBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  clearSelectionText: {
    fontSize: 11,
    color: Colors.danger,
    fontWeight: fontWeight.semibold,
  },

  // Contacts List
  listContent: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 120, // Space for sticky sync footer
  },

  // Compact Contact Card (Vertical height reduced by 45%)
  contactCard: {
    marginBottom: 0,
    backgroundColor: waColors.surface,
    borderRadius: 0,
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: waColors.border,
    elevation: 0,
    shadowOpacity: 0,
  },
  selectedCard: {
    borderColor: waColors.green,
    backgroundColor: waColors.greenPale,
  },
  mutatedCard: {
    borderColor: Colors.warningLight,
    backgroundColor: "#FFFBEB", // Yellow warning tint
  },
  cardLayout: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
  },
  checkboxTouch: {
    padding: 6,
    marginLeft: -4,
    marginRight: 2,
  },
  customCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },
  contactInfo: {
    flex: 1,
  },
  primaryRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  contactName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: waColors.text,
    maxWidth: "50%",
  },
  badgeWrapper: {
    flexDirection: "row",
    marginLeft: spacing.xs,
  },
  tagBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: radius.sm,
    marginRight: 3,
  },
  badgeRegular: {
    backgroundColor: Colors.primaryLight,
  },
  badgeBusiness: {
    backgroundColor: "#dbeafe",
  },
  tagBadgeText: {
    fontSize: 8,
    fontWeight: fontWeight.bold,
  },
  mutatedBadge: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: radius.sm,
  },
  mutatedBadgeText: {
    fontSize: 8,
    fontWeight: fontWeight.bold,
    color: "#B45309",
  },
  secondaryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 1,
    justifyContent: "space-between",
  },
  contactPhone: {
    fontSize: fontSize.xs,
    color: Colors.textSecondary,
  },
  noNameLabel: {
    fontSize: fontSize.xs,
    color: Colors.textMuted,
    fontStyle: "italic",
  },
  cardMenuBtn: {
    margin: 0,
    padding: 0,
  },

  // CRM Connection Badges
  linkBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.sm,
    maxWidth: "55%",
  },
  matchedBadge: {
    backgroundColor: Colors.primaryLight,
  },
  linkedBadge: {
    backgroundColor: "#E0F2FE",
  },
  notLinkedBadge: {
    backgroundColor: "#FFF3E0",
  },
  linkBadgeText: {
    fontSize: 8.5,
    fontWeight: fontWeight.bold,
    color: Colors.textPrimary,
    marginLeft: 2,
  },

  // Sticky Action Footer
  stickyFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 8,
  },
  footerLeft: {
    flex: 1,
    marginRight: spacing.sm,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  footerHighlight: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: Colors.primary,
  },
  footerText: {
    fontSize: fontSize.sm,
    color: Colors.textSecondary,
  },
  filterSummary: {
    fontSize: 9,
    color: Colors.textMuted,
    marginTop: 1,
  },
  stickySyncBtn: {
    borderRadius: radius.md,
    backgroundColor: Colors.primary,
  },

  // Empty state
  empty: {
    padding: spacing.huge,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    marginTop: spacing.sm,
    fontSize: fontSize.md,
    color: Colors.textSecondary,
    textAlign: "center",
    fontWeight: fontWeight.semibold,
  },
  emptySubtitle: {
    marginTop: 2,
    fontSize: fontSize.sm - 1,
    color: Colors.textMuted,
    textAlign: "center",
    marginBottom: spacing.sm,
  },

  // Bottom Sheets & Overlays
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheetContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    maxHeight: "80%",
  },
  sheetHeader: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e5e7eb",
    marginBottom: spacing.xs,
  },
  sheetTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
  },
  sheetTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: Colors.textPrimary,
  },

  // Actions sheet content
  actionsList: {
    paddingVertical: spacing.xs,
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  actionItemText: {
    fontSize: fontSize.sm,
    color: Colors.textPrimary,
    fontWeight: fontWeight.semibold,
    marginLeft: spacing.md,
  },

  // Linking sheet content
  linkSheetContent: {
    paddingBottom: spacing.md,
  },
  modalSearch: {
    elevation: 0,
    backgroundColor: "#F0F0F3",
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    height: 38,
  },
  customerScroll: {
    maxHeight: 280,
  },
  customerItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  customerItemName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: Colors.textPrimary,
  },
  customerItemSub: {
    fontSize: fontSize.xs - 1,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  noPhoneBadge: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.sm,
  },
  noPhoneBadgeText: {
    fontSize: 9,
    fontWeight: fontWeight.bold,
    color: "#DC2626",
  },
  modalEmptyText: {
    textAlign: "center",
    color: Colors.textSecondary,
    padding: spacing.xl,
    fontSize: fontSize.xs,
  },

  // General Dialog
  dialog: {
    backgroundColor: "#fff",
    borderRadius: radius.md,
  },
  radioRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  radioTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: Colors.textPrimary,
  },
  radioDesc: {
    fontSize: fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
