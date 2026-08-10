import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Button,
  Divider,
  Searchbar,
  Switch,
  Text,
} from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteScopedWaConversation,
  muteScopedWaConversation,
  type WaConversation,
  type WaMessage,
} from "../../../api/whatsapp.api";
import { useAuthStore } from "../../../auth/auth-store";
import { AppBottomSheetModal } from "../../../components/overlays/AppBottomSheetModal";
import { useCreateCustomerMutation, useCustomerDetailQuery, useCustomersQuery } from "../../../hooks/useCustomers";
import { navigate } from "../../../navigation/navigation-ref";
import { colors as Colors, fontSize, fontWeight, spacing } from "../../../theme";
import { cleanPhoneNumber } from "../../../utils/items/validation";
import {
  triggerErrorHaptic,
  triggerLightHaptic,
  triggerMediumHaptic,
  triggerSuccessHaptic,
} from "../../../utils/haptics";
import { contactsDb } from "../services/contactsDb";
import { whatsappDb } from "../services/whatsapp-db";
import {
  getWhatsAppProfileContent,
  type WhatsAppProfileContent,
} from "../services/whatsapp-profile-content";
import { linkScopedWhatsAppCustomer } from "../services/whatsapp-profile.api";
import { formatWhatsAppPhone, initials, waColors } from "../whatsapp-ui";

type SheetMode = "profile" | "customer-picker";
type MediaTab = "media" | "docs" | "links";

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

const URL_PATTERN = /https?:\/\/[^\s<>"']+/i;

function firstHttpUrl(message: WaMessage) {
  const text = [message.content?.text, message.content?.caption]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");
  return text.match(URL_PATTERN)?.[0]?.replace(/[),.;!?]+$/, "");
}

function fallbackContent(messages: WaMessage[]): WhatsAppProfileContent {
  const visibleMessages = messages.filter((message) => message.contentState !== "DELETED");
  const media = visibleMessages.filter((message) => message.type === "IMAGE" || message.type === "VIDEO").slice(-24).reverse();
  const documents = visibleMessages.filter((message) => message.type === "DOCUMENT").slice(-16).reverse();
  const links = visibleMessages
    .flatMap((message) => {
      const url = firstHttpUrl(message);
      return url ? [{ message, url }] : [];
    })
    .slice(-16)
    .reverse();
  return {
    media,
    documents,
    links,
    counts: {
      media: visibleMessages.filter((message) => message.type === "IMAGE" || message.type === "VIDEO").length,
      documents: visibleMessages.filter((message) => message.type === "DOCUMENT").length,
      links: visibleMessages.filter((message) => Boolean(firstHttpUrl(message))).length,
    },
  };
}

function openExternalUrl(url?: string, failureMessage = "This item cannot be opened.") {
  if (!url) return;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:" && parsed.protocol !== "tel:") {
      throw new Error("Unsupported URL");
    }
    void Linking.openURL(url).catch(() => Alert.alert("Open failed", failureMessage));
  } catch {
    Alert.alert("Open failed", failureMessage);
  }
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
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  const createCustomerMutation = useCreateCustomerMutation();
  const [mode, setMode] = useState<SheetMode>("profile");
  const [activeMediaTab, setActiveMediaTab] = useState<MediaTab>("media");
  const [isMuted, setIsMuted] = useState(conversation?.isMuted ?? false);
  const [pickerSearch, setPickerSearch] = useState("");
  const deferredPickerSearch = useDeferredValue(pickerSearch.trim());
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [manuallyLinkedCustomer, setManuallyLinkedCustomer] = useState<any>(null);
  const [detailsReady, setDetailsReady] = useState(false);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const pendingAfterCloseRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    if (!visible) return;
    setMode("profile");
    setPickerSearch("");
    setIsMuted(conversation?.isMuted ?? false);
    setManuallyLinkedCustomer(null);
  }, [conversation?.id, conversation?.isMuted, visible]);

  useEffect(() => {
    if (!visible) {
      setDetailsReady(false);
      return;
    }
    const task = requestIdleCallback(() => setDetailsReady(true), { timeout: 650 });
    return () => cancelIdleCallback(task);
  }, [visible]);

  const fallback = useMemo(() => fallbackContent(messages), [messages]);
  const profileQuery = useQuery({
    queryKey: ["whatsapp", "profile-content", shopId, integrationId, conversation?.id || "missing"],
    enabled: Boolean(visible && detailsReady && conversation?.id),
    queryFn: () => getWhatsAppProfileContent(shopId, integrationId, conversation!.id),
    staleTime: 5_000,
    gcTime: 5 * 60_000,
  });
  const profileContent = profileQuery.data || fallback;

  const linkedCustomerId = manuallyLinkedCustomer?.id || customerRecord?.id || conversation?.customerId || "";
  const { data: latestCustomerDetail } = useCustomerDetailQuery(visible ? linkedCustomerId : "");
  const activeCustomer = useMemo(() => {
    if (manuallyLinkedCustomer) return { ...manuallyLinkedCustomer, ...latestCustomerDetail };
    return latestCustomerDetail || customerRecord || null;
  }, [customerRecord, latestCustomerDetail, manuallyLinkedCustomer]);

  const customersQuery = useCustomersQuery({
    enabled: visible && mode === "customer-picker",
    includeWalkin: false,
    search: deferredPickerSearch || undefined,
    limit: 100,
  });
  const customers = customersQuery.data || [];

  const phone = conversation?.phone || "";
  const contactName = deviceContactName
    || conversation?.contactName
    || activeCustomer?.name
    || formatWhatsAppPhone(phone)
    || "Contact Info";
  const displayInitials = initials(contactName) || "📱";

  const money = (value?: number | string | null) => `₹${Number(value ?? 0).toLocaleString("en-IN")}`;

  const handleFinalDismiss = () => {
    setMode("profile");
    setPickerSearch("");
    onDismiss();
    const action = pendingAfterCloseRef.current;
    pendingAfterCloseRef.current = null;
    action?.();
  };

  const closeThen = (action?: () => void) => {
    pendingAfterCloseRef.current = action || null;
    onDismiss();
  };

  const muteMutation = useMutation({
    mutationFn: async (nextMuted: boolean) => {
      if (!conversation || !token) throw new Error("Your session expired. Sign in again.");
      return muteScopedWaConversation(token, shopId, integrationId, conversation.id, { isMuted: nextMuted });
    },
    onMutate: (nextMuted) => {
      const previous = isMuted;
      setIsMuted(nextMuted);
      triggerLightHaptic();
      return { previous };
    },
    onSuccess: ({ conversation: updated }, nextMuted) => {
      void whatsappDb.upsertConversations({ shopId, integrationId }, [updated]).catch(() => undefined);
      onToggleMute?.(nextMuted);
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "conversations", shopId, integrationId] });
    },
    onError: (error, _nextMuted, context) => {
      setIsMuted(context?.previous ?? false);
      triggerErrorHaptic();
      Alert.alert("Couldn’t update notifications", error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!conversation || !token) throw new Error("Your session expired. Sign in again.");
      return deleteScopedWaConversation(token, shopId, integrationId, conversation.id);
    },
    onSuccess: async () => {
      if (conversation) {
        await whatsappDb.removeConversation(shopId, integrationId, conversation.id).catch(() => undefined);
      }
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "conversations", shopId, integrationId] });
      triggerSuccessHaptic();
      closeThen(onDeleteChat);
    },
    onError: (error) => {
      triggerErrorHaptic();
      Alert.alert("Couldn’t delete chat", error.message);
    },
  });

  const handleLinkCustomer = async (customer: any) => {
    if (!conversation || !token || linkingId) return;
    const previous = manuallyLinkedCustomer;
    setLinkingId(customer.id);
    setManuallyLinkedCustomer(customer);
    setMode("profile");
    triggerMediumHaptic();
    try {
      const { conversation: serverConversation } = await linkScopedWhatsAppCustomer(
        token,
        shopId,
        integrationId,
        conversation.id,
        customer.id,
      );
      await whatsappDb.upsertConversations({ shopId, integrationId }, [serverConversation]);
      const localContact = await contactsDb.getContactByPhone(conversation.phone);
      if (localContact) await contactsDb.linkCustomer(localContact.id, customer.id);
      onCustomerLinked?.(customer);
      triggerSuccessHaptic();
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "conversations", shopId, integrationId] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer", customer.id] });
    } catch (error) {
      setManuallyLinkedCustomer(previous);
      setMode("customer-picker");
      triggerErrorHaptic();
      Alert.alert("Couldn’t link customer", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setLinkingId(null);
    }
  };

  const handleCreateAndLinkCustomer = async () => {
    if (!conversation || isCreatingCustomer) return;
    setIsCreatingCustomer(true);
    triggerMediumHaptic();
    try {
      const cleaned = cleanPhoneNumber(conversation.phone || "") || (conversation.phone || "").replace(/[^\d]/g, "");
      const created = await createCustomerMutation.mutateAsync({ name: contactName || "New Customer", phone: cleaned });
      await handleLinkCustomer(created);
    } catch (error) {
      triggerErrorHaptic();
      Alert.alert("Create customer failed", error instanceof Error ? error.message : "Could not create customer account.");
    } finally {
      setIsCreatingCustomer(false);
    }
  };

  if (!conversation) return null;

  const title = mode === "profile" ? "Contact Info" : "Link to ShopControl Customer";
  const subtitle = mode === "customer-picker" ? `Choose an account for ${contactName}` : undefined;
  const totalShared = profileContent.counts.media + profileContent.counts.documents + profileContent.counts.links;

  return (
    <AppBottomSheetModal
      visible={visible}
      onDismiss={handleFinalDismiss}
      onBack={mode === "customer-picker" ? () => setMode("profile") : undefined}
      backAccessibilityLabel="Back to contact info"
      title={title}
      subtitle={subtitle}
      isBusy={deleteMutation.isPending || Boolean(linkingId)}
      maxHeight={mode === "profile" ? 1 : 0.92}
      fullBleed={mode === "profile"}
      scrollable
    >
      {mode === "customer-picker" ? (
        <View style={styles.pickerContent}>
          <Searchbar
            placeholder="Search name or phone"
            value={pickerSearch}
            onChangeText={setPickerSearch}
            style={styles.search}
            elevation={0}
          />

          <Pressable
            style={({ pressed }) => [styles.createRow, pressed && styles.rowPressed]}
            onPress={handleCreateAndLinkCustomer}
            disabled={isCreatingCustomer || Boolean(linkingId)}
          >
            <View style={styles.createAvatar}>
              {isCreatingCustomer ? <ActivityIndicator size="small" color="#fff" /> : <MaterialCommunityIcons name="account-plus" size={22} color="#fff" />}
            </View>
            <View style={styles.flexOne}>
              <Text style={styles.customerName} numberOfLines={1}>Create & link “{contactName}”</Text>
              <Text style={styles.customerMeta}>{formatWhatsAppPhone(phone) || "New customer account"}</Text>
            </View>
          </Pressable>

          <Divider />
          {customersQuery.isFetching && customers.length === 0 ? (
            <View style={styles.loadingState}><ActivityIndicator color={waColors.greenDark} /></View>
          ) : customers.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="account-search-outline" size={42} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No matching customers</Text>
            </View>
          ) : (
            customers.map((customer: any) => (
              <Pressable
                key={customer.id}
                disabled={Boolean(linkingId) || isCreatingCustomer}
                onPress={() => void handleLinkCustomer(customer)}
                style={({ pressed }) => [styles.customerRow, pressed && styles.rowPressed]}
              >
                <View style={styles.customerAvatar}><Text style={styles.customerAvatarText}>{initials(customer.name || "C")}</Text></View>
                <View style={styles.flexOne}>
                  <Text style={styles.customerName}>{customer.name}</Text>
                  <Text style={styles.customerMeta} numberOfLines={1}>{customer.phone || "No phone"} · Outstanding {money(customer.outstandingAmount)}</Text>
                </View>
                {linkingId === customer.id ? <ActivityIndicator size="small" color={waColors.greenDark} /> : <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textMuted} />}
              </Pressable>
            ))
          )}
        </View>
      ) : (
        <View style={styles.profileContent}>
          <View style={styles.heroSection}>
            <View style={styles.avatarLarge}><Text style={styles.avatarTextLarge}>{displayInitials}</Text></View>
            <Text style={styles.heroName} numberOfLines={1}>{contactName}</Text>
            <Text style={styles.heroPhone}>{formatWhatsAppPhone(phone)}</Text>
            <View style={styles.actionBar}>
              <ProfileAction icon="phone-outline" label="Call" onPress={() => { triggerLightHaptic(); openExternalUrl(`tel:${phone.replace(/\s+/g, "")}`, "Could not open phone dialer."); }} />
              <ProfileAction icon="message-text-outline" label="Chat" onPress={() => closeThen()} />
              <ProfileAction icon={isMuted ? "bell-off-outline" : "bell-outline"} label={isMuted ? "Unmute" : "Mute"} busy={muteMutation.isPending} onPress={() => muteMutation.mutate(!isMuted)} />
              <ProfileAction
                icon={activeCustomer ? "account-details-outline" : "account-plus-outline"}
                label={activeCustomer ? "Customer" : "Link"}
                onPress={() => {
                  if (activeCustomer) closeThen(() => navigate("CustomerDetail", { customerId: activeCustomer.id }));
                  else if (onOpenLinkCustomer) onOpenLinkCustomer();
                  else setMode("customer-picker");
                }}
              />
            </View>
          </View>

          {detailsReady ? (
            <>
              <View style={styles.cardSection}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionTitleRow}>
                    <MaterialCommunityIcons name="paperclip" size={20} color={Colors.textSecondary} />
                    <Text style={styles.sectionTitle}>Media, links, and docs</Text>
                  </View>
                  <View style={styles.countBadge}><Text style={styles.countBadgeText}>{totalShared}</Text></View>
                </View>
                <View style={styles.mediaTabs}>
                  <MediaTabButton label="Media" count={profileContent.counts.media} active={activeMediaTab === "media"} onPress={() => setActiveMediaTab("media")} />
                  <MediaTabButton label="Docs" count={profileContent.counts.documents} active={activeMediaTab === "docs"} onPress={() => setActiveMediaTab("docs")} />
                  <MediaTabButton label="Links" count={profileContent.counts.links} active={activeMediaTab === "links"} onPress={() => setActiveMediaTab("links")} />
                </View>

                {profileQuery.isFetching && !profileQuery.data ? <ActivityIndicator style={styles.inlineLoader} color={waColors.greenDark} /> : null}
                {activeMediaTab === "media" && (
                  profileContent.media.length ? (
                    <View style={styles.mediaGrid}>
                      {profileContent.media.slice(0, 12).map((message) => (
                        <View key={message.id} style={styles.mediaTile}>
                          {message.type === "IMAGE" && message.asset?.url ? (
                            <ExpoImage source={{ uri: message.asset.url }} style={styles.mediaThumbnail} contentFit="cover" cachePolicy="memory-disk" recyclingKey={message.id} transition={0} />
                          ) : (
                            <View style={styles.videoTile}>
                              <MaterialCommunityIcons name="play-circle-outline" size={34} color="#fff" />
                              <Text style={styles.videoLabel}>Video</Text>
                            </View>
                          )}
                        </View>
                      ))}
                    </View>
                  ) : <Text style={styles.emptyMediaText}>No photos or videos shared yet</Text>
                )}

                {activeMediaTab === "docs" && (
                  profileContent.documents.length ? profileContent.documents.slice(0, 8).map((message) => (
                    <Pressable key={message.id} style={({ pressed }) => [styles.historyRow, pressed && styles.rowPressed]} onPress={() => openExternalUrl(message.asset?.url, "This document is unavailable.")}>
                      <MaterialCommunityIcons name="file-document-outline" size={23} color="#0284c7" />
                      <View style={styles.flexOne}>
                        <Text style={styles.historyTitle} numberOfLines={1}>{message.asset?.fileName || message.content?.filename || "Document"}</Text>
                        <Text style={styles.historyMeta}>{new Date(message.createdAt).toLocaleDateString()}</Text>
                      </View>
                      <MaterialCommunityIcons name="open-in-new" size={17} color={Colors.textMuted} />
                    </Pressable>
                  )) : <Text style={styles.emptyMediaText}>No documents shared yet</Text>
                )}

                {activeMediaTab === "links" && (
                  profileContent.links.length ? profileContent.links.slice(0, 8).map(({ message, url }) => (
                    <Pressable key={`${message.id}:${url}`} style={({ pressed }) => [styles.historyRow, pressed && styles.rowPressed]} onPress={() => openExternalUrl(url)}>
                      <MaterialCommunityIcons name="link-variant" size={22} color={waColors.greenDark} />
                      <View style={styles.flexOne}>
                        <Text style={styles.historyTitle} numberOfLines={2}>{url}</Text>
                        <Text style={styles.historyMeta}>{new Date(message.createdAt).toLocaleDateString()}</Text>
                      </View>
                      <MaterialCommunityIcons name="open-in-new" size={17} color={Colors.textMuted} />
                    </Pressable>
                  )) : <Text style={styles.emptyMediaText}>No links shared yet</Text>
                )}
              </View>

              <View style={styles.cardSection}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionTitleRow}>
                    <MaterialCommunityIcons name="storefront-outline" size={20} color={waColors.greenDark} />
                    <Text style={styles.sectionTitle}>ShopControl customer</Text>
                  </View>
                  {activeCustomer && <View style={styles.linkedBadge}><Text style={styles.linkedBadgeText}>Linked</Text></View>}
                </View>
                {activeCustomer ? (
                  <>
                    <View style={styles.crmMetricRow}>
                      <Metric label="Outstanding" value={money(activeCustomer.outstandingAmount)} danger={Number(activeCustomer.outstandingAmount) > 0} />
                      <Metric label="Total Sales" value={money(activeCustomer.totalSales)} />
                      <Metric label="Credit Limit" value={money(activeCustomer.creditLimit)} />
                    </View>
                    <Button mode="contained-tonal" icon="account-details" onPress={() => closeThen(() => navigate("CustomerDetail", { customerId: activeCustomer.id }))}>View customer ledger & profile</Button>
                  </>
                ) : (
                  <View style={styles.unlinkedBox}>
                    <Text style={styles.unlinkedText}>Link this WhatsApp conversation to the correct ShopControl customer record.</Text>
                    <Button mode="outlined" icon="link-variant" textColor={waColors.greenDark} onPress={() => setMode("customer-picker")}>Link customer</Button>
                  </View>
                )}
              </View>

              <View style={styles.cardSection}>
                <Pressable style={({ pressed }) => [styles.settingRow, pressed && styles.rowPressed]} onPress={() => muteMutation.mutate(!isMuted)}>
                  <View style={styles.settingLeft}>
                    <MaterialCommunityIcons name="bell-outline" size={22} color={Colors.textSecondary} />
                    <View><Text style={styles.settingTitle}>Mute notifications</Text><Text style={styles.settingSub}>{isMuted ? "On" : "Off"}</Text></View>
                  </View>
                  <Switch value={isMuted} disabled={muteMutation.isPending} onValueChange={(value) => muteMutation.mutate(value)} color={waColors.greenDark} />
                </Pressable>
              </View>

              <View style={styles.cardSection}>
                <Pressable
                  disabled={deleteMutation.isPending}
                  style={({ pressed }) => [styles.dangerRow, pressed && styles.rowPressed]}
                  onPress={() => {
                    triggerMediumHaptic();
                    Alert.alert(
                      "Delete chat from ShopControl?",
                      "This removes the conversation and its local cached messages from ShopControl. It cannot recall messages already delivered by WhatsApp.",
                      [
                        { text: "Cancel", style: "cancel" },
                        { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate() },
                      ],
                    );
                  }}
                >
                  {deleteMutation.isPending ? <ActivityIndicator size="small" color={Colors.danger} /> : <MaterialCommunityIcons name="trash-can-outline" size={22} color={Colors.danger} />}
                  <Text style={styles.dangerTitle}>Delete chat from ShopControl</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View style={styles.detailsPlaceholder}><ActivityIndicator color={waColors.greenDark} /></View>
          )}
        </View>
      )}
    </AppBottomSheetModal>
  );
}

function ProfileAction({ icon, label, onPress, busy = false }: { icon: any; label: string; onPress: () => void; busy?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]} onPress={onPress} disabled={busy}>
      <View style={styles.actionIconBg}>{busy ? <ActivityIndicator size="small" color={waColors.greenDark} /> : <MaterialCommunityIcons name={icon} size={22} color={waColors.greenDark} />}</View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

function MediaTabButton({ label, count, active, onPress }: { label: string; count: number; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.mediaTab, active && styles.mediaTabActive]}>
      <Text style={[styles.mediaTabText, active && styles.mediaTabTextActive]}>{label} ({count})</Text>
    </Pressable>
  );
}

function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, danger && styles.metricDanger]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flexOne: { flex: 1 },
  profileContent: { paddingBottom: 38, backgroundColor: "#f7f9f8" },
  heroSection: { alignItems: "center", paddingHorizontal: 16, paddingVertical: 20, backgroundColor: "#fff", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#dfe6e3" },
  avatarLarge: { width: 86, height: 86, borderRadius: 43, alignItems: "center", justifyContent: "center", backgroundColor: "#e8f7ef", borderWidth: 1.5, borderColor: "#b9e4d0" },
  avatarTextLarge: { fontSize: 29, fontWeight: "800", color: waColors.greenDark },
  heroName: { marginTop: 10, maxWidth: "92%", color: Colors.textPrimary, fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  heroPhone: { marginTop: 3, color: Colors.textSecondary, fontSize: fontSize.sm },
  actionBar: { width: "100%", marginTop: 18, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#edf1ef", flexDirection: "row" },
  actionBtn: { flex: 1, alignItems: "center", gap: 5, borderRadius: 12, paddingVertical: 3 },
  actionBtnPressed: { backgroundColor: "#f2f7f5" },
  actionIconBg: { width: 43, height: 43, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#e8f7ef" },
  actionLabel: { color: waColors.greenDark, fontSize: 11, fontWeight: "700" },
  detailsPlaceholder: { height: 220, alignItems: "center", justifyContent: "center" },
  cardSection: { marginHorizontal: 10, marginTop: 10, padding: 14, borderRadius: 18, backgroundColor: "#fff", borderWidth: StyleSheet.hairlineWidth, borderColor: "#e2e8e5" },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  sectionTitleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { flex: 1, color: Colors.textPrimary, fontSize: 15, fontWeight: "800" },
  countBadge: { minWidth: 27, height: 25, paddingHorizontal: 7, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#edf4f1" },
  countBadgeText: { color: Colors.textSecondary, fontSize: 11, fontWeight: "800", fontVariant: ["tabular-nums"] },
  mediaTabs: { marginTop: 13, flexDirection: "row", gap: 7 },
  mediaTab: { flex: 1, minHeight: 34, paddingHorizontal: 7, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#f3f6f5" },
  mediaTabActive: { backgroundColor: "#dff4e9" },
  mediaTabText: { color: Colors.textSecondary, fontSize: 11, fontWeight: "700" },
  mediaTabTextActive: { color: waColors.greenDark },
  inlineLoader: { marginTop: 14 },
  mediaGrid: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  mediaTile: { width: "31.7%", aspectRatio: 1, borderRadius: 10, overflow: "hidden", backgroundColor: "#e6ece9" },
  mediaThumbnail: { width: "100%", height: "100%" },
  videoTile: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2, backgroundColor: "#23332d" },
  videoLabel: { color: "#fff", fontSize: 10, fontWeight: "700" },
  emptyMediaText: { paddingVertical: 24, textAlign: "center", color: Colors.textSecondary, fontSize: 13 },
  historyRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#edf1ef" },
  historyTitle: { color: Colors.textPrimary, fontSize: 13, fontWeight: "600" },
  historyMeta: { marginTop: 2, color: Colors.textMuted, fontSize: 11 },
  rowPressed: { opacity: 0.68 },
  linkedBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: "#e6f6ed" },
  linkedBadgeText: { color: waColors.greenDark, fontSize: 10, fontWeight: "800" },
  crmMetricRow: { marginVertical: 14, flexDirection: "row", gap: 7 },
  metric: { flex: 1, minWidth: 0, padding: 9, borderRadius: 12, backgroundColor: "#f6f8f7" },
  metricLabel: { color: Colors.textSecondary, fontSize: 9, fontWeight: "700" },
  metricValue: { marginTop: 4, color: Colors.textPrimary, fontSize: 12, fontWeight: "800" },
  metricDanger: { color: Colors.danger },
  unlinkedBox: { marginTop: 13, gap: 12 },
  unlinkedText: { color: Colors.textSecondary, fontSize: 13, lineHeight: 19 },
  settingRow: { minHeight: 55, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  settingLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 13 },
  settingTitle: { color: Colors.textPrimary, fontSize: 14, fontWeight: "700" },
  settingSub: { marginTop: 2, color: Colors.textSecondary, fontSize: 11 },
  dangerRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 13 },
  dangerTitle: { color: Colors.danger, fontSize: 14, fontWeight: "700" },
  pickerContent: { gap: 10, paddingHorizontal: 12, paddingBottom: spacing.lg },
  search: { backgroundColor: "#f1f5f3", borderRadius: 14 },
  createRow: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, paddingHorizontal: 8 },
  createAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: waColors.greenDark },
  loadingState: { height: 160, alignItems: "center", justifyContent: "center" },
  emptyState: { height: 160, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyText: { color: Colors.textSecondary, fontSize: 13 },
  customerRow: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#edf1ef" },
  customerAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#e7f5ed" },
  customerAvatarText: { color: waColors.greenDark, fontSize: 13, fontWeight: "800" },
  customerName: { color: Colors.textPrimary, fontSize: 14, fontWeight: "700" },
  customerMeta: { marginTop: 3, color: Colors.textSecondary, fontSize: 11 },
});
