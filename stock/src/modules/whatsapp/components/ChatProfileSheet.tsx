import { useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Linking,
  Alert,
  InteractionManager,
} from "react-native";
import { Text, IconButton, Switch, Divider, Button, Searchbar, ActivityIndicator } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { AppBottomSheetModal } from "../../../components/overlays/AppBottomSheetModal";
import { colors as Colors, spacing, radius, fontSize, fontWeight } from "../../../theme";
import { formatWhatsAppPhone, initials, waColors } from "../whatsapp-ui";
import { type WaConversation, type WaMessage } from "../../../api/whatsapp.api";
import { navigate } from "../../../navigation/navigation-ref";
import { triggerLightHaptic, triggerMediumHaptic, triggerSuccessHaptic, triggerErrorHaptic } from "../../../utils/haptics";
import { Image as ExpoImage } from "expo-image";
import { useCustomersQuery, useCustomerDetailQuery, useCreateCustomerMutation } from "../../../hooks/useCustomers";
import { whatsappDb } from "../services/whatsapp-db";
import { contactsDb } from "../services/contactsDb";
import { KeyboardAwareScreen } from "../../../components/keyboard/KeyboardAwareScreen";
import { cleanPhoneNumber } from "../../../utils/items/validation";

interface ChatProfileSheetProps {
  shopId: string;
  integrationId: string;
  visible: boolean;
  onDismiss: () => void;
  conversation: WaConversation | null;
  customerRecord?: any;
  deviceContactName?: string;
  messages?: WaMessage[];
  onToggleMute?: (muted: boolean) => void;
  onOpenLinkCustomer?: () => void;
  onCustomerLinked?: (customer: any) => void;
  onDeleteChat?: () => void;
}

export function ChatProfileSheet({
  shopId,
  integrationId,
  visible,
  onDismiss,
  conversation,
  customerRecord,
  deviceContactName = "",
  messages = [],
  onToggleMute,
  onOpenLinkCustomer,
  onCustomerLinked,
  onDeleteChat,
}: ChatProfileSheetProps) {
  const [activeMediaTab, setActiveMediaTab] = useState<"media" | "docs" | "links">("media");
  const [isMuted, setIsMuted] = useState(conversation?.isMuted ?? false);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [manuallyLinkedCustomer, setManuallyLinkedCustomer] = useState<any>(null);
  const [detailsReady, setDetailsReady] = useState(false);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const queryClient = useQueryClient();
  const createCustomerMutation = useCreateCustomerMutation();

  useEffect(() => {
    if (!visible) {
      const clearTimer = setTimeout(() => setDetailsReady(false), 220);
      return () => clearTimeout(clearTimer);
    }
    const task = InteractionManager.runAfterInteractions(() => {
      setDetailsReady(true);
    });
    return () => task.cancel();
  }, [visible]);

  // ONLY fetch customer search list when customer picker modal is actually open
  const customersQuery = useCustomersQuery({
    enabled: visible && showCustomerPicker,
    includeWalkin: false,
  });

  // Determine target customer ID
  const linkedCustomerId = manuallyLinkedCustomer?.id || customerRecord?.id || conversation?.customerId || "";
  const { data: latestCustomerDetail } = useCustomerDetailQuery(visible ? linkedCustomerId : "");

  // Compute activeCustomer combining manually linked customer, latest detail, or prop
  const activeCustomer = useMemo(() => {
    if (manuallyLinkedCustomer) {
      return { ...manuallyLinkedCustomer, ...latestCustomerDetail };
    }
    if (latestCustomerDetail) {
      return latestCustomerDetail;
    }
    if (customerRecord) {
      return customerRecord;
    }
    return null;
  }, [manuallyLinkedCustomer, latestCustomerDetail, customerRecord]);

  const filteredCustomers = useMemo(() => {
    const list = customersQuery.data || [];
    if (!pickerSearch.trim()) return list;
    const q = pickerSearch.toLowerCase().trim();
    return list.filter(
      (c: any) => c.name?.toLowerCase().includes(q) || c.phone?.includes(q)
    );
  }, [customersQuery.data, pickerSearch]);

  const handleLinkCustomer = async (customer: any) => {
    if (!conversation) return;
    
    // 1. INSTANT OPTIMISTIC UI UPDATE (0ms)
    setManuallyLinkedCustomer(customer);
    setShowCustomerPicker(false);
    triggerMediumHaptic();
    onCustomerLinked?.(customer);

    // 2. ASYNC BACKGROUND PERSISTENCE & IMMEDIATE REFETCH
    try {
      await whatsappDb.linkCustomerToConversation(
        shopId,
        integrationId,
        conversation.id,
        customer.id,
      );
      const contact = await contactsDb.getContactByPhone(conversation.phone);
      if (contact) {
        await contactsDb.linkCustomer(contact.id, customer.id);
      }
      queryClient.invalidateQueries({ queryKey: ["whatsapp"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer", customer.id] });
      void queryClient.refetchQueries({ queryKey: ["customer", customer.id] });
    } catch (err: any) {
      console.warn("Background linking error:", err);
    }
  };

  const handleCreateAndLinkCustomer = async () => {
    if (!conversation || isCreatingCustomer) return;
    setIsCreatingCustomer(true);
    triggerMediumHaptic();
    try {
      const rawPhone = conversation.phone || "";
      const cleaned = cleanPhoneNumber(rawPhone) || rawPhone.replace(/[^\d]/g, "");
      const newCust = await createCustomerMutation.mutateAsync({
        name: contactName || "New Customer",
        phone: cleaned,
      });
      setIsCreatingCustomer(false);
      triggerSuccessHaptic();
      await handleLinkCustomer(newCust);
    } catch (err: any) {
      setIsCreatingCustomer(false);
      triggerErrorHaptic();
      const msg = err?.message || "Could not create customer account.";
      Alert.alert("Create Customer Failed", msg);
    }
  };

  const phone = conversation?.phone ?? "";
  const contactName = deviceContactName
    || conversation?.contactName
    || customerRecord?.name
    || formatWhatsAppPhone(phone)
    || "Contact Info";
  const displayInitials = initials(contactName) || "📱";

  // Filter media, docs, and links from messages
  const mediaItems = useMemo(() => {
    if (!visible) return [];
    return messages.filter(
      (msg) => msg.type === "IMAGE" || msg.type === "VIDEO" || msg.asset?.url
    );
  }, [messages, visible]);

  const docItems = useMemo(() => {
    if (!visible) return [];
    return messages.filter((msg) => msg.type === "DOCUMENT");
  }, [messages, visible]);

  const linkItems = useMemo(() => {
    if (!visible) return [];
    return messages.filter((msg) => {
      const text = msg.content?.text || msg.content?.caption;
      return text && /https?:\/\/\S+/i.test(text);
    });
  }, [messages, visible]);

  const totalMediaCount = mediaItems.length + docItems.length + linkItems.length;

  const handleCall = () => {
    triggerLightHaptic();
    if (!phone) return;
    Linking.openURL(`tel:${phone.replace(/\s+/g, "")}`).catch(() => {
      Alert.alert("Error", "Could not open phone dialer");
    });
  };

  const handleToggleMuteSwitch = (val: boolean) => {
    triggerLightHaptic();
    setIsMuted(val);
    onToggleMute?.(val);
  };

  const money = (val?: number | string | null) =>
    `₹${Number(val ?? 0).toLocaleString("en-IN")}`;

  if (!conversation) return null;

  return (
    <AppBottomSheetModal
      visible={visible}
      onDismiss={onDismiss}
      title="Contact Info"
      maxHeight={1.0}
      fullBleed
      scrollable
    >
      <View style={styles.scrollContent}>
        {/* 1. HERO PROFILE HEADER */}
        <View style={styles.heroSection}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarTextLarge}>{displayInitials}</Text>
          </View>
          <Text style={styles.heroName} numberOfLines={1}>
            {contactName}
          </Text>
          <Text style={styles.heroPhone}>{formatWhatsAppPhone(phone)}</Text>

          {/* QUICK ACTION BAR */}
          <View style={styles.actionBar}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleCall}>
              <View style={styles.actionIconBg}>
                <MaterialCommunityIcons name="phone-outline" size={22} color={waColors.greenDark} />
              </View>
              <Text style={styles.actionLabel}>Audio</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => {
                triggerLightHaptic();
                Alert.alert("Video Call", "Video calls are not available in this shop build.");
              }}
            >
              <View style={styles.actionIconBg}>
                <MaterialCommunityIcons name="video-outline" size={22} color={waColors.greenDark} />
              </View>
              <Text style={styles.actionLabel}>Video</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtn} onPress={onDismiss}>
              <View style={styles.actionIconBg}>
                <MaterialCommunityIcons name="message-text-outline" size={22} color={waColors.greenDark} />
              </View>
              <Text style={styles.actionLabel}>Chat</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtn} onPress={() => handleToggleMuteSwitch(!isMuted)}>
              <View style={styles.actionIconBg}>
                <MaterialCommunityIcons
                  name={isMuted ? "bell-off-outline" : "bell-outline"}
                  size={22}
                  color={isMuted ? Colors.warning : waColors.greenDark}
                />
              </View>
              <Text style={styles.actionLabel}>{isMuted ? "Unmute" : "Mute"}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {detailsReady ? (
          <>
        {/* 2. MEDIA, LINKS & DOCS GALLERY */}
        <View style={styles.cardSection}>
          <View style={styles.sectionHeaderRow}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <MaterialCommunityIcons name="paperclip" size={20} color={Colors.textSecondary} />
              <Text style={styles.sectionTitle}>Media, links, and docs</Text>
            </View>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{totalMediaCount}</Text>
            </View>
          </View>

          {/* Media Sub-tabs */}
          <View style={styles.mediaTabs}>
            <TouchableOpacity
              onPress={() => setActiveMediaTab("media")}
              style={[styles.mediaTab, activeMediaTab === "media" && styles.mediaTabActive]}
            >
              <Text style={[styles.mediaTabText, activeMediaTab === "media" && styles.mediaTabTextActive]}>
                Media ({mediaItems.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveMediaTab("docs")}
              style={[styles.mediaTab, activeMediaTab === "docs" && styles.mediaTabActive]}
            >
              <Text style={[styles.mediaTabText, activeMediaTab === "docs" && styles.mediaTabTextActive]}>
                Docs ({docItems.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveMediaTab("links")}
              style={[styles.mediaTab, activeMediaTab === "links" && styles.mediaTabActive]}
            >
              <Text style={[styles.mediaTabText, activeMediaTab === "links" && styles.mediaTabTextActive]}>
                Links ({linkItems.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Content Gallery */}
          {activeMediaTab === "media" && (
            mediaItems.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryScroll}>
                {mediaItems.slice(0, 12).map((item) => (
                  <View key={item.id} style={styles.mediaItemCard}>
                    {item.asset?.url ? (
                      <ExpoImage
                        source={{ uri: item.asset.url }}
                        style={styles.mediaThumbnail}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={0}
                      />
                    ) : (
                      <View style={styles.mediaPlaceholder}>
                        <MaterialCommunityIcons name="file-image-outline" size={28} color={waColors.greenDark} />
                      </View>
                    )}
                  </View>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.emptyMediaText}>No photos or videos shared yet</Text>
            )
          )}

          {activeMediaTab === "docs" && (
            docItems.length > 0 ? (
              <View style={styles.docList}>
                {docItems.slice(0, 4).map((item) => (
                  <View key={item.id} style={styles.docRow}>
                    <MaterialCommunityIcons name="file-document-outline" size={24} color="#0284c7" />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.docName} numberOfLines={1}>
                        {item.content?.text || item.asset?.fileName || "Document"}
                      </Text>
                      <Text style={styles.docSub}>{new Date(item.createdAt).toLocaleDateString()}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyMediaText}>No documents shared yet</Text>
            )
          )}

          {activeMediaTab === "links" && (
            linkItems.length > 0 ? (
              <View style={styles.docList}>
                {linkItems.slice(0, 4).map((item) => (
                  <View key={item.id} style={styles.docRow}>
                    <MaterialCommunityIcons name="link-variant" size={22} color={waColors.greenDark} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.docName} numberOfLines={1}>
                        {item.content?.text || item.content?.caption}
                      </Text>
                      <Text style={styles.docSub}>{new Date(item.createdAt).toLocaleDateString()}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyMediaText}>No links shared yet</Text>
            )
          )}
        </View>

        {/* 3. CRM CUSTOMER INTEGRATION SECTION (ShopControl) */}
        <View style={styles.cardSection}>
          <View style={styles.sectionHeaderRow}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <MaterialCommunityIcons name="storefront-outline" size={20} color={waColors.greenDark} />
              <Text style={styles.sectionTitle}>ShopControl CRM Profile</Text>
            </View>
            {activeCustomer && (
              <View style={styles.linkedBadge}>
                <MaterialCommunityIcons name="check-circle" size={12} color={waColors.greenDark} />
                <Text style={styles.linkedBadgeText}>Linked</Text>
              </View>
            )}
          </View>

          {activeCustomer ? (
            <View style={styles.crmDetails}>
              <View style={styles.crmMetricRow}>
                <View style={styles.crmMetricBox}>
                  <Text style={styles.crmMetricLabel}>Outstanding</Text>
                  <Text style={[styles.crmMetricValue, { color: Number((activeCustomer as any).outstandingAmount) > 0 ? Colors.danger : waColors.greenDark }]}>
                    {money((activeCustomer as any).outstandingAmount)}
                  </Text>
                </View>
                <View style={styles.crmMetricBox}>
                  <Text style={styles.crmMetricLabel}>Total Sales</Text>
                  <Text style={styles.crmMetricValue}>{money((activeCustomer as any).totalSales)}</Text>
                </View>
                <View style={styles.crmMetricBox}>
                  <Text style={styles.crmMetricLabel}>Credit Limit</Text>
                  <Text style={styles.crmMetricValue}>{money((activeCustomer as any).creditLimit)}</Text>
                </View>
              </View>

              <Button
                mode="contained-tonal"
                onPress={() => {
                  onDismiss();
                  navigate("CustomerDetail", { customerId: activeCustomer.id });
                }}
                icon="account-details"
                style={styles.crmActionBtn}
                buttonColor="#e0f2fe"
                textColor="#0369a1"
              >
                View Full Customer Ledger & Profile
              </Button>
            </View>
          ) : (
            <View style={styles.unlinkedCrmBox}>
              <Text style={styles.unlinkedCrmText}>
                This phone number is not linked to a ShopControl customer profile yet.
              </Text>
              <Button
                mode="outlined"
                onPress={() => {
                  if (onOpenLinkCustomer) {
                    onOpenLinkCustomer();
                  } else {
                    setShowCustomerPicker(true);
                  }
                }}
                icon="link-variant"
                style={styles.linkCrmBtn}
                textColor={waColors.greenDark}
              >
                Link to Customer Account
              </Button>
            </View>
          )}
        </View>

        {/* 4. CHAT SETTINGS & NOTIFICATIONS */}
        <View style={styles.cardSection}>
          <TouchableOpacity style={styles.settingRow} onPress={() => handleToggleMuteSwitch(!isMuted)}>
            <View style={styles.settingLeft}>
              <MaterialCommunityIcons name="bell-outline" size={22} color={Colors.textSecondary} />
              <View style={{ marginLeft: 14 }}>
                <Text style={styles.settingTitle}>Mute notifications</Text>
                <Text style={styles.settingSub}>{isMuted ? "On" : "Off"}</Text>
              </View>
            </View>
            <Switch value={isMuted} onValueChange={handleToggleMuteSwitch} color={waColors.greenDark} />
          </TouchableOpacity>

          <Divider style={styles.rowDivider} />

          <TouchableOpacity style={styles.settingRow} onPress={() => triggerLightHaptic()}>
            <View style={styles.settingLeft}>
              <MaterialCommunityIcons name="star-outline" size={22} color={Colors.textSecondary} />
              <View style={{ marginLeft: 14 }}>
                <Text style={styles.settingTitle}>Starred messages</Text>
                <Text style={styles.settingSub}>None</Text>
              </View>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>

          <Divider style={styles.rowDivider} />

          <TouchableOpacity style={styles.settingRow} onPress={() => triggerLightHaptic()}>
            <View style={styles.settingLeft}>
              <MaterialCommunityIcons name="lock-outline" size={22} color={Colors.textSecondary} />
              <View style={{ marginLeft: 14 }}>
                <Text style={styles.settingTitle}>Encryption</Text>
                <Text style={styles.settingSub}>Messages and calls are end-to-end encrypted.</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* 5. DANGER ACTIONS */}
        <View style={styles.cardSection}>
          <TouchableOpacity
            style={styles.dangerRow}
            onPress={() => {
              triggerMediumHaptic();
              Alert.alert("Block Contact", `Are you sure you want to block ${contactName}?`);
            }}
          >
            <MaterialCommunityIcons name="cancel" size={22} color={Colors.danger} />
            <Text style={styles.dangerTitle}>Block {contactName}</Text>
          </TouchableOpacity>

          <Divider style={styles.rowDivider} />

          <TouchableOpacity
            style={styles.dangerRow}
            onPress={() => {
              triggerMediumHaptic();
              Alert.alert("Report Contact", `Report ${contactName} to WhatsApp?`);
            }}
          >
            <MaterialCommunityIcons name="thumb-down-outline" size={22} color={Colors.danger} />
            <Text style={styles.dangerTitle}>Report contact</Text>
          </TouchableOpacity>

          <Divider style={styles.rowDivider} />

          <TouchableOpacity
            style={styles.dangerRow}
            onPress={() => {
              triggerMediumHaptic();
              onDismiss();
              onDeleteChat?.();
            }}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={22} color={Colors.danger} />
            <Text style={styles.dangerTitle}>Clear & Delete Chat</Text>
          </TouchableOpacity>
        </View>
          </>
        ) : null}
      </View>

      {/* 6. CUSTOMER LINK PICKER MODAL */}
      <AppBottomSheetModal
        visible={showCustomerPicker}
        onDismiss={() => setShowCustomerPicker(false)}
        title="Link to ShopControl Customer"
        subtitle={`Select a customer account for ${contactName}`}
        maxHeight={0.85}
        scrollable
      >
        <KeyboardAwareScreen extraKeyboardSpace={20} style={{ padding: 12 }}>
          <Searchbar
            placeholder="Search by name or phone..."
            value={pickerSearch}
            onChangeText={setPickerSearch}
            style={{ marginBottom: 12, backgroundColor: Colors.surfaceOffset, elevation: 0 }}
          />

          {/* QUICK CREATE & LINK DIRECTLY CARD */}
          <TouchableOpacity
            style={styles.createAndLinkCard}
            onPress={handleCreateAndLinkCustomer}
            disabled={isCreatingCustomer || Boolean(linkingId)}
            activeOpacity={0.7}
          >
            <View style={styles.createAndLinkAvatar}>
              {isCreatingCustomer ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <MaterialCommunityIcons name="account-plus" size={20} color="#fff" />
              )}
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.createAndLinkTitle} numberOfLines={1}>
                Create & Link "{contactName}"
              </Text>
              <Text style={styles.createAndLinkSub} numberOfLines={1}>
                {phone ? formatWhatsAppPhone(phone) : "New customer account"}
              </Text>
            </View>
            <MaterialCommunityIcons name="plus-circle" size={22} color={waColors.greenDark} />
          </TouchableOpacity>

          <Divider style={{ marginVertical: 8 }} />

          {customersQuery.isLoading ? (
            <ActivityIndicator color={waColors.greenDark} style={{ padding: 20 }} />
          ) : filteredCustomers.length === 0 ? (
            <View style={{ paddingVertical: 24, alignItems: "center" }}>
              <MaterialCommunityIcons name="account-search-outline" size={44} color={Colors.textMuted} />
              <Text style={{ textAlign: "center", color: Colors.textSecondary, marginTop: 8, marginBottom: 16 }}>
                No existing customers found matching "{pickerSearch}"
              </Text>
              <Button
                mode="contained"
                onPress={handleCreateAndLinkCustomer}
                loading={isCreatingCustomer}
                disabled={isCreatingCustomer || Boolean(linkingId)}
                buttonColor={waColors.greenDark}
                textColor="#ffffff"
                icon="account-plus"
                style={{ borderRadius: 20, paddingHorizontal: 8 }}
              >
                Create & Link "{contactName}"
              </Button>
            </View>
          ) : (
            filteredCustomers.map((cust: any) => (
              <TouchableOpacity
                key={cust.id}
                style={styles.customerSelectItem}
                onPress={() => handleLinkCustomer(cust)}
                disabled={Boolean(linkingId) || isCreatingCustomer}
              >
                <View style={styles.customerAvatarCircle}>
                  <Text style={styles.customerAvatarText}>{initials(cust.name || "C")}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.customerSelectName}>{cust.name}</Text>
                  <Text style={styles.customerSelectSub}>
                    {cust.phone || "No phone"} • Outstanding: {money(cust.outstandingAmount)}
                  </Text>
                </View>
                {linkingId === cust.id ? (
                  <ActivityIndicator size="small" color={waColors.greenDark} />
                ) : (
                  <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textSecondary} />
                )}
              </TouchableOpacity>
            ))
          )}
        </KeyboardAwareScreen>
      </AppBottomSheetModal>
    </AppBottomSheetModal>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 40,
    backgroundColor: "#f8fafc",
  },

  // Hero Section
  heroSection: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  avatarLarge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#ecfdf5",
    borderWidth: 2,
    borderColor: waColors.greenDark,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  avatarTextLarge: {
    fontSize: 32,
    fontWeight: "700",
    color: waColors.greenDark,
  },
  heroName: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: Colors.textPrimary,
    marginTop: 4,
  },
  heroPhone: {
    fontSize: fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  actionBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    width: "100%",
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  actionBtn: {
    alignItems: "center",
    flex: 1,
  },
  actionIconBg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: fontWeight.semibold,
    color: waColors.greenDark,
  },

  // Card Sections
  cardSection: {
    backgroundColor: "#ffffff",
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#e2e8f0",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: Colors.textPrimary,
    marginLeft: 8,
  },
  countBadge: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.textSecondary,
  },

  // Media Tabs & Gallery
  mediaTabs: {
    flexDirection: "row",
    marginVertical: 8,
    gap: 8,
  },
  mediaTab: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
  },
  mediaTabActive: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  mediaTabText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  mediaTabTextActive: {
    color: waColors.greenDark,
  },
  galleryScroll: {
    gap: 8,
    paddingVertical: 4,
  },
  mediaItemCard: {
    width: 72,
    height: 72,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#f1f5f9",
  },
  mediaThumbnail: {
    width: "100%",
    height: "100%",
  },
  mediaPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyMediaText: {
    fontSize: fontSize.xs,
    color: Colors.textMuted,
    paddingVertical: spacing.sm,
    fontStyle: "italic",
  },
  docList: {
    gap: 8,
    marginTop: 4,
  },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f1f5f9",
  },
  docName: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: Colors.textPrimary,
  },
  docSub: {
    fontSize: 10,
    color: Colors.textMuted,
  },

  // CRM Integration
  linkedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 4,
  },
  linkedBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: waColors.greenDark,
  },
  crmDetails: {
    marginTop: spacing.xs,
  },
  crmMetricRow: {
    flexDirection: "row",
    gap: 8,
    marginVertical: 8,
  },
  crmMetricBox: {
    flex: 1,
    backgroundColor: "#f8fafc",
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  crmMetricLabel: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  crmMetricValue: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: Colors.textPrimary,
    marginTop: 2,
  },
  crmActionBtn: {
    borderRadius: radius.md,
    marginTop: 4,
  },
  unlinkedCrmBox: {
    paddingVertical: spacing.xs,
  },
  unlinkedCrmText: {
    fontSize: fontSize.xs,
    color: Colors.textSecondary,
    marginBottom: spacing.xs,
  },
  linkCrmBtn: {
    borderColor: waColors.greenDark,
    borderRadius: radius.md,
  },

  // Setting Rows
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  settingTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: Colors.textPrimary,
  },
  settingSub: {
    fontSize: fontSize.xs - 1,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  rowDivider: {
    backgroundColor: "#f1f5f9",
  },

  // Danger Rows
  dangerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  dangerTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: Colors.danger,
    marginLeft: 14,
  },
  customerSelectItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  customerAvatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#e0f2fe",
    alignItems: "center",
    justifyContent: "center",
  },
  customerAvatarText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0369a1",
  },
  customerSelectName: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  customerSelectSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  createAndLinkCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  createAndLinkAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: waColors.greenDark,
    alignItems: "center",
    justifyContent: "center",
  },
  createAndLinkTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: waColors.greenDark,
  },
  createAndLinkSub: {
    fontSize: fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
