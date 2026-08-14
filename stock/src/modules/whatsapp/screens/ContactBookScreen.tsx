import { useEffect, useState, useMemo, useCallback, memo } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
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
  RadioButton,
  Checkbox,
  Dialog,
} from "react-native-paper";
import {
  Contact,
  ContactField,
  requestPermissionsAsync,
} from "expo-contacts";
import { FlashList } from "@shopify/flash-list";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
} from "react-native-reanimated";
import { contactsDb, LocalContact } from "../services/contactsDb";
import { extractContactEntries } from "../services/device-contacts-sync";
import { useCustomersQuery } from "../../../hooks/useCustomers";
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
import { useWhatsAppScope } from "../whatsapp-scope";
import { useDebounce } from "use-debounce";
import { useNavigation } from "@react-navigation/native";
import { formatWhatsAppPhone, initials, waColors } from "../whatsapp-ui";
import { createScopedWaConversation, WaConversation } from "../../../api/whatsapp.api";
import { useAuthStore } from "../../../auth/auth-store";
import { AppBottomSheetModal } from "../../../components/overlays/AppBottomSheetModal";

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
  const selectionMode = useSelectionStore((state) => state.selectedIds.size > 0);
  const toggle = useSelectionStore((state) => state.toggle);
  const isMutated = item.syncState === "MUTATED" || item.syncState === "UNSYNCED";

  const hasDistinctName = Boolean(manuallyLinkedCustomer?.name || matchedCustomer?.name || (item.name && item.name.trim() !== item.phone));
  const displayName = manuallyLinkedCustomer?.name
    || matchedCustomer?.name
    || (item.name && item.name.trim() !== item.phone ? item.name : formatWhatsAppPhone(item.phone));

  const subText = hasDistinctName
    ? formatWhatsAppPhone(item.phone)
    : "Device contact";

  const selectedShared = useSharedValue(0);

  useEffect(() => {
    selectedShared.value = withTiming(isSelected ? 1 : 0, { duration: 120 });
  }, [isSelected, selectedShared]);

  const animatedCardStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      selectedShared.value,
      [0, 1],
      ["#ffffff", "#f0fdf4"]
    );
    const borderColor = interpolateColor(
      selectedShared.value,
      [0, 1],
      ["#e2e8f0", waColors.greenDark]
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
      ["transparent", waColors.greenDark]
    );
    const borderColor = interpolateColor(
      selectedShared.value,
      [0, 1],
      ["#94a3b8", waColors.greenDark]
    );
    return {
      transform: [{ scale: 0.85 + scale * 0.15 }],
      backgroundColor,
      borderColor,
    };
  });

  const displayInitials = hasDistinctName ? initials(displayName) : "📱";

  return (
    <AnimatedCard
      style={[
        styles.contactCard,
        animatedCardStyle,
      ]}
      onPress={() => onOpenOptions(item)}
      onLongPress={() => toggle(item.id)}
    >
      <Card.Content style={styles.cardLayout}>
        {selectionMode && (
          <TouchableOpacity onPress={() => toggle(item.id)} style={styles.checkboxTouch}>
            <Animated.View style={[styles.customCheckbox, animatedCheckboxStyle]}>
              {isSelected && (
                <MaterialCommunityIcons name="check" size={10} color="#fff" />
              )}
            </Animated.View>
          </TouchableOpacity>
        )}

        <View style={styles.avatarContainer}>
          <Text style={styles.avatarText}>{displayInitials}</Text>
        </View>

        <View style={styles.contactInfo}>
          {/* Primary Row: Name & Tag Badges */}
          <View style={styles.primaryRow}>
            <Text style={styles.contactName} numberOfLines={1}>
              {displayName}
            </Text>
            
            <View style={styles.badgeWrapper}>
              {item.tag !== "NONE" && (
                <View style={[
                  styles.tagBadge,
                  item.tag === "REGULAR" ? styles.badgeRegular : styles.badgeBusiness
                ]}>
                  <Text style={[
                    styles.tagBadgeText,
                    item.tag === "REGULAR" ? { color: waColors.greenDark } : { color: "#1e40af" }
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

          {/* Secondary Row: Phone / Subtitle & Connection Badge */}
          <View style={styles.secondaryRow}>
            <Text style={styles.contactPhone}>{subText}</Text>

            {manuallyLinkedCustomer ? (
              <View style={[styles.linkBadge, styles.linkedBadge]}>
                <MaterialCommunityIcons name="link" size={10} color="#0284c7" />
                <Text style={styles.linkBadgeText} numberOfLines={1}>
                  {`Linked: ${manuallyLinkedCustomer.name}`}
                </Text>
              </View>
            ) : matchedCustomer ? (
              <View style={[styles.linkBadge, styles.matchedBadge]}>
                <MaterialCommunityIcons name="check-decagram" size={10} color={waColors.greenDark} />
                <Text style={styles.linkBadgeText} numberOfLines={1}>
                  {`Matched: ${matchedCustomer.name}`}
                </Text>
              </View>
            ) : (
              <View style={[styles.linkBadge, styles.notLinkedBadge]}>
                <Text style={[styles.linkBadgeText, { color: "#64748b" }]}>Unlinked</Text>
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
// SKELETON LOADER FOR FAST INITIAL RENDER
// -------------------------------------------------------------
const ContactSkeletonLoader = () => (
  <View style={styles.skeletonContainer}>
    {[1, 2, 3, 4, 5, 6].map((key) => (
      <View key={key} style={styles.skeletonCard}>
        <View style={styles.skeletonAvatar} />
        <View style={styles.skeletonContent}>
          <View style={styles.skeletonLinePrimary} />
          <View style={styles.skeletonLineSecondary} />
        </View>
      </View>
    ))}
  </View>
);

// -------------------------------------------------------------
// MAIN CONTACT BOOK SCREEN
// -------------------------------------------------------------
export const ContactBookScreen = () => {
  const navigation = useNavigation<any>();
  const {
    shopId: activeShopId,
    integrationId,
    phoneNumberId,
  } = useWhatsAppScope();
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch] = useDebounce(searchQuery, 200);

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

  const customerPhoneSuffixes = useMemo(() => {
    if (!customers || customers.length === 0) return [];
    return customers
      .map((c) => {
        if (!c.phone) return null;
        const clean = c.phone.replace(/\D/g, "");
        return clean.length >= 10 ? clean.slice(-10) : null;
      })
      .filter((s): s is string => Boolean(s));
  }, [customers]);

  // Zustand selection states
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const selectMany = useSelectionStore((s) => s.selectMany);
  const deselectMany = useSelectionStore((s) => s.deselectMany);
  const clearSelection = useSelectionStore((s) => s.clear);
  const selectedCount = selectedIds.size;

  // Query Stats & paginated Local Lists
  const { data: stats } = useContactsStatsQuery(customerPhoneSuffixes);

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
    customerPhoneSuffixes,
  });

  const { data: filteredIds = [] } = useContactsFilteredIdsQuery({
    searchQuery: debouncedSearch,
    syncFilter,
    linkFilter,
    tagFilter,
    customerPhoneSuffixes,
  }, selectedCount > 0);

  const isAllFilteredSelected = useMemo(() => {
    if (filteredIds.length === 0) return false;
    return filteredIds.every((id) => selectedIds.has(id));
  }, [filteredIds, selectedIds]);

  // Local Mutators
  const updateTagMutation = useUpdateContactTagMutation();
  const linkCustomerMutation = useLinkCustomerMutation();
  const syncMutation = useContactsSync();
  const createConversationMutation = useMutation<WaConversation, Error, {
    phone: string;
    contactName?: string;
    customerId?: string;
  }>({
    mutationFn: async ({ phone, contactName, customerId }) => {
      if (!token) throw new Error("Your session expired. Sign in again.");
      const response = await createScopedWaConversation(token, activeShopId, integrationId, {
        phone,
        contactName,
        customerId,
      });
      return response.conversation;
    },
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "conversations", activeShopId, integrationId] });
      setShowOptionsSheet(false);
      setSelectedContact(null);
      navigation.navigate("ChatDetail", {
        shopId: activeShopId,
        integrationId,
        phoneNumberId,
        conversationId: conversation.id,
        phone: conversation.phone,
      });
    },
    onError: (error) => Alert.alert("Unable to start conversation", error.message),
  });

  const importMutation = useMutation<number, Error, void>({
    mutationFn: async () => {
      const { status } = await requestPermissionsAsync();
      if (status !== "granted") {
        throw new Error("This screen requires access to your device contacts to sync with CRM.");
      }

      const data = await Contact.getAllDetails([
        ContactField.FULL_NAME,
        ContactField.GIVEN_NAME,
        ContactField.FAMILY_NAME,
        ContactField.PHONES,
        ContactField.EMAILS,
      ] as const);

      if (!data || data.length === 0) {
        throw new Error("No contact cards were found on this device.");
      }

      const formatted: Array<{ id: string; name: string; phone: string; email?: string }> = [];
      for (const item of data) {
        const entries = extractContactEntries(item);
        for (const entry of entries) {
          formatted.push(entry);
        }
      }

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

  const handleStartConversation = useCallback(() => {
    if (!selectedContact) return;
    const matchedCustomer = selectedContact.customerId
      ? customerIdMap.get(selectedContact.customerId)
      : customerMap.get(selectedContact.phone.slice(-10));
    createConversationMutation.mutate({
      phone: selectedContact.phone,
      contactName: selectedContact.name || matchedCustomer?.name,
      customerId: matchedCustomer?.id,
    });
  }, [selectedContact, customerIdMap, customerMap, createConversationMutation]);

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
      return <ContactSkeletonLoader />;
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
            loading={isSearching}
            iconColor={Colors.textSecondary}
          />
          <IconButton
            icon="account-multiple-plus-outline"
            onPress={() => importMutation.mutate()}
            disabled={importMutation.isPending}
            size={22}
            iconColor={waColors.greenDark}
            style={styles.headerActionBtn}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.quickFiltersScrollView}
          contentContainerStyle={styles.quickFilters}
        >
          {[
            { label: "All", count: stats?.total || 0, active: syncFilter === "ALL" && linkFilter === "ALL" && tagFilter === "ALL", apply: handleClearFilters },
            { label: "Linked", count: stats?.linked || 0, active: linkFilter === "LINKED", apply: () => { handleClearFilters(); setLinkFilter("LINKED"); } },
            { label: "Unsynced", count: stats?.unsynced || 0, active: syncFilter === "UNSYNCED", apply: () => { handleClearFilters(); setSyncFilter("UNSYNCED"); } },
            { label: "Business", count: stats?.business || 0, active: tagFilter === "BUSINESS", apply: () => { handleClearFilters(); setTagFilter("BUSINESS"); } },
            { label: "Regular", count: stats?.regular || 0, active: tagFilter === "REGULAR", apply: () => { handleClearFilters(); setTagFilter("REGULAR"); } },
          ].map((filter) => (
            <TouchableOpacity
              key={filter.label}
              onPress={filter.apply}
              style={[styles.quickFilter, filter.active && styles.quickFilterActive]}
            >
              <Text style={[styles.quickFilterText, filter.active && styles.quickFilterTextActive]}>
                {filter.label}
              </Text>
              <View style={[styles.filterBadge, filter.active && styles.filterBadgeActive]}>
                <Text style={[styles.filterBadgeText, filter.active && styles.filterBadgeTextActive]}>
                  {filter.count}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Selection Details Header */}
        <View style={styles.listHeaderRow}>
          <View style={{ flex: 1 }}>
            {selectedCount > 0 ? (
              <Text style={styles.selectionLabelText}>
                {selectedCount} selected <Text style={{ color: Colors.textMuted }}>of</Text> {(stats?.total || flattenedContacts.length).toLocaleString()}
              </Text>
            ) : (
              <Text style={styles.selectionLabelText}>
                Showing {flattenedContacts.length} of {(stats?.total || flattenedContacts.length).toLocaleString()} contacts
              </Text>
            )}
            <Text style={styles.selectionSubText}>Tap a contact menu to message or link it</Text>
          </View>

          {selectedCount > 0 && <View style={styles.headerRightActions}>
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
          </View>}
        </View>

        {/* Paginated Virtualized Contacts List */}
        <FlashList
          data={flattenedContacts}
          renderItem={renderItem}
          keyExtractor={(item: LocalContact) => item.id}
          contentContainerStyle={styles.listContent}
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
        <AppBottomSheetModal
          visible={showOptionsSheet}
          onDismiss={() => setShowOptionsSheet(false)}
          title={selectedContact?.name || formatWhatsAppPhone(selectedContact?.phone) || "Contact options"}
        >
          <View style={styles.actionsList}>
            <TouchableOpacity
              style={styles.actionItem}
              onPress={handleStartConversation}
              disabled={createConversationMutation.isPending}
            >
              {createConversationMutation.isPending ? (
                <ActivityIndicator size={20} color={waColors.green} />
              ) : (
                <MaterialCommunityIcons name="message-text-outline" size={20} color={waColors.green} />
              )}
              <Text style={[styles.actionItemText, { color: waColors.greenDark }]}>Start conversation</Text>
            </TouchableOpacity>

            <Divider style={{ marginVertical: spacing.xs }} />

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
        </AppBottomSheetModal>

        {/* 2. Bottom Sheet for Customer Linking */}
        <AppBottomSheetModal
          visible={showLinkSheet}
          onDismiss={() => setShowLinkSheet(false)}
          title="Link customer"
          maxHeight={0.85}
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

            <FlashList
              data={visibleCustomers}
              keyExtractor={(item: any) => item.id}
              style={styles.customerScroll}
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
        </AppBottomSheetModal>

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

  quickFiltersScrollView: {
    maxHeight: 50,
  },
  quickFilters: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  quickFilter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
  },
  quickFilterActive: {
    borderColor: waColors.greenDark,
    backgroundColor: waColors.greenDark,
  },
  quickFilterText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "600",
  },
  quickFilterTextActive: {
    color: "#ffffff",
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

  // Contact Card
  contactCard: {
    marginHorizontal: 12,
    marginVertical: 4,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  avatarText: {
    fontSize: 14,
    fontWeight: "700",
    color: waColors.greenDark,
  },
  selectedCard: {
    borderColor: waColors.green,
    backgroundColor: waColors.greenPale,
  },
  cardLayout: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
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

  // Skeleton Loader Styles
  skeletonContainer: {
    padding: spacing.md,
    gap: 10,
  },
  skeletonCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 12,
  },
  skeletonAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#e2e8f0",
  },
  skeletonContent: {
    flex: 1,
    gap: 6,
  },
  skeletonLinePrimary: {
    height: 14,
    width: "60%",
    borderRadius: 6,
    backgroundColor: "#e2e8f0",
  },
  skeletonLineSecondary: {
    height: 10,
    width: "40%",
    borderRadius: 4,
    backgroundColor: "#f1f5f9",
  },

  // Filter Badge Styles
  filterBadge: {
    backgroundColor: "#e2e8f0",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    marginLeft: 6,
  },
  filterBadgeActive: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
  filterBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
  filterBadgeTextActive: {
    color: "#ffffff",
  },
});
