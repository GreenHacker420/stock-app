import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { FlashList } from "@shopify/flash-list";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Button, Dialog, IconButton, Portal, Searchbar, Text, TextInput } from "react-native-paper";
import * as Contacts from "expo-contacts";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useDebounce } from "use-debounce";

import { ApiError } from "../../../api/client";
import {
  addWaBroadcastRecipients,
  cancelWaBroadcast,
  createWaBroadcast,
  sendWaBroadcast,
  type WaBroadcastRecipientInput,
} from "../../../api/whatsapp-broadcast.api";
import {
  fetchWaTemplateAttributes,
  fetchWaTemplates,
  uploadWaMedia,
  type WaLocalMedia,
  type WaTemplate,
  type WaTemplateAttribute,
  type WaTemplateDefinition,
} from "../../../api/whatsapp.api";
import { useAuthStore } from "../../../auth/auth-store";
import { colors, fontSize, fontWeight, radius, spacing } from "../../../theme";
import { triggerLightHaptic } from "../../../utils/haptics";
import {
  createInitialRuntimeBindings,
  runtimeBindingKey,
  runtimeBindingsReady,
  TemplateRuntimeBindings,
  type RuntimeBindingMap,
} from "../components/TemplateRuntimeBindings";
import { WhatsAppTemplatePreview } from "../components/WhatsAppTemplatePreview";
import {
  useContactsFilteredIdsQuery,
  useContactsLocalQuery,
} from "../hooks/useContactsLocal";
import { getLocalContactsByIds } from "../services/broadcastContacts";
import { contactsDb, type LocalContact } from "../services/contactsDb";
import { useWhatsAppScope } from "../whatsapp-scope";
import { formatWhatsAppPhone, initials, waColors } from "../whatsapp-ui";

const STEPS = [
  { key: "audience", label: "Audience", icon: "account-multiple-outline" },
  { key: "template", label: "Template", icon: "message-text-outline" },
  { key: "personalize", label: "Personalize", icon: "tune-variant" },
  { key: "review", label: "Review", icon: "check-circle-outline" },
] as const;
const RECIPIENT_UPLOAD_BATCH = 300;

type TagFilter = "ALL" | "REGULAR" | "BUSINESS" | "NONE";
type ManualRecipient = { id: string; name: string; phone: string };
type ScopedWaTemplate = WaTemplate & { integrationId?: string | null };
type HeaderAsset = { id: string; fileName: string; kind: "IMAGE" | "VIDEO" | "DOCUMENT" };

function digitsOnly(phone: string) {
  return phone.replace(/\D/g, "");
}

function headerFormat(template?: WaTemplate | null) {
  if (!template) return "NONE";
  const definition = template.draftDefinition as WaTemplateDefinition | undefined;
  if (definition?.header?.format) return definition.header.format;
  return String(
    template.components?.find((component: any) => String(component?.type).toUpperCase() === "HEADER")?.format || "NONE",
  ).toUpperCase();
}

function templateButtonType(template: WaTemplate, buttonIndex = 0) {
  const fromDraft = template.draftDefinition?.buttons?.[buttonIndex]?.type;
  if (fromDraft) return fromDraft;
  const component = template.components?.find((item: any) => String(item?.type).toUpperCase() === "BUTTONS");
  return String(component?.buttons?.[buttonIndex]?.type || "").toUpperCase();
}

function isBroadcastReady(template: WaTemplate) {
  if (template.status !== "APPROVED") return false;
  if (template.parameterFormat === "NAMED") return false;
  if (template.subtype?.includes("CAROUSEL") || template.subtype === "CALL_PERMISSION_REQUEST") return false;
  if (template.components?.some((component: any) => String(component?.type).toUpperCase() === "CAROUSEL")) return false;
  if (!["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT"].includes(headerFormat(template))) return false;

  return template.variableMappings.every((mapping) => {
    if (["HEADER", "BODY"].includes(mapping.component)) return true;
    if (mapping.component === "BUTTON") return templateButtonType(template, mapping.buttonIndex) === "URL";
    return false;
  });
}

function previewDefinition(template: WaTemplate, bindings: RuntimeBindingMap, attributes: WaTemplateAttribute[]) {
  const base: Partial<WaTemplateDefinition> = template.draftDefinition || {
    name: template.name,
    language: template.language,
    category: template.category,
    body: {
      text: template.components?.find((component: any) => String(component?.type).toUpperCase() === "BODY")?.text || "",
    },
  };

  return {
    ...base,
    mappings: template.variableMappings.map((mapping) => {
      const binding = bindings[runtimeBindingKey(mapping)];
      const attribute = binding?.attributeId ? attributes.find((item) => item.id === binding.attributeId) : undefined;
      const sampleValue = binding?.mode === "FIXED"
        ? binding.value || mapping.sampleValue
        : attribute
          ? mapping.sampleValue || attribute.label
          : mapping.sampleValue;
      return {
        component: mapping.component,
        position: mapping.position,
        buttonIndex: mapping.buttonIndex,
        cardIndex: mapping.cardIndex,
        sampleValue,
        required: mapping.required,
      };
    }),
  } as Partial<WaTemplateDefinition>;
}

function ContactRow({ item, selected, onToggle }: { item: LocalContact; selected: boolean; onToggle: () => void }) {
  const label = item.name || formatWhatsAppPhone(item.phone);
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${label}, ${formatWhatsAppPhone(item.phone)}`}
      style={({ pressed }) => [styles.contactRow, pressed && styles.pressed]}
    >
      <View style={[styles.avatar, selected && styles.avatarSelected]}>
        {selected ? (
          <MaterialCommunityIcons name="check" size={18} color="#fff" />
        ) : (
          <Text style={styles.avatarText}>{initials(item.name || item.phone)}</Text>
        )}
      </View>
      <View style={styles.contactBody}>
        <Text style={styles.contactName} numberOfLines={1}>{label}</Text>
        <Text style={styles.contactPhone}>{formatWhatsAppPhone(item.phone)}</Text>
      </View>
      {item.tag !== "NONE" ? <Text style={styles.contactTag}>{item.tag === "BUSINESS" ? "Business" : "Regular"}</Text> : null}
      <View style={[styles.checkCircle, selected && styles.checkCircleSelected]}>
        {selected ? <MaterialCommunityIcons name="check" size={13} color="#fff" /> : null}
      </View>
    </Pressable>
  );
}

export function BroadcastComposerScreen() {
  const navigation = useNavigation<any>();
  const token = useAuthStore((state) => state.token) || "";
  const queryClient = useQueryClient();
  const { shopId, integrationId } = useWhatsAppScope();

  const [step, setStep] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 180);
  const [tagFilter, setTagFilter] = useState<TagFilter>("ALL");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [manualRecipients, setManualRecipients] = useState<ManualRecipient[]>([]);
  const [manualDialog, setManualDialog] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");

  const [templateSearch, setTemplateSearch] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<WaTemplate | null>(null);
  const [bindings, setBindings] = useState<RuntimeBindingMap>({});
  const [headerAsset, setHeaderAsset] = useState<HeaderAsset | null>(null);
  const [uploadingHeader, setUploadingHeader] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitle: "New campaign",
      headerStyle: { backgroundColor: colors.surface },
      headerTintColor: colors.textPrimary,
      headerShadowVisible: false,
      headerTitleStyle: { fontWeight: "800" },
    });
  }, [navigation]);

  const contactParams = useMemo(() => ({
    searchQuery: debouncedSearch,
    syncFilter: "ALL" as const,
    linkFilter: "ALL" as const,
    tagFilter,
    customerPhoneSuffixes: [] as string[],
  }), [debouncedSearch, tagFilter]);

  const contactsQuery = useContactsLocalQuery(contactParams);
  const filteredIdsQuery = useContactsFilteredIdsQuery(contactParams, true);
  const contacts = useMemo(() => contactsQuery.data?.pages.flatMap((page) => page) || [], [contactsQuery.data]);
  const filteredIds = filteredIdsQuery.data || [];
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));

  const templatesQuery = useQuery({
    queryKey: ["wa-broadcast-templates", shopId, integrationId, templateSearch],
    enabled: Boolean(token && shopId && integrationId && step >= 1),
    queryFn: () => fetchWaTemplates(token, shopId, {
      status: "APPROVED",
      search: templateSearch.trim() || undefined,
      pageSize: 100,
    }),
  });
  const templates = useMemo(
    () => (templatesQuery.data?.data || []).filter((template) => {
      const templateIntegrationId = (template as ScopedWaTemplate).integrationId;
      return isBroadcastReady(template) && (!templateIntegrationId || templateIntegrationId === integrationId);
    }),
    [integrationId, templatesQuery.data?.data],
  );

  const attributesQuery = useQuery({
    queryKey: ["wa-template-attributes", shopId],
    enabled: Boolean(token && shopId && selectedTemplate),
    queryFn: () => fetchWaTemplateAttributes(token, shopId),
  });
  const attributes = attributesQuery.data || [];

  const importMutation = useMutation({
    mutationFn: async () => {
      const permission = await Contacts.requestPermissionsAsync();
      if (permission.status !== "granted") {
        throw new Error("Allow contact access to choose recipients from this phone.");
      }
      const data = await Contacts.Contact.getAllDetails([
        Contacts.ContactField.FULL_NAME,
        Contacts.ContactField.GIVEN_NAME,
        Contacts.ContactField.FAMILY_NAME,
        Contacts.ContactField.PHONES,
        Contacts.ContactField.EMAILS,
      ] as const);

      const formatted = data.map((contact) => {
        const phones = contact.phones || [];
        const mobile = phones.find((entry) => /(mobile|cell|iphone)/i.test(entry.label || ""));
        const phone = digitsOnly(mobile?.number || phones[0]?.number || "");
        const name = (
          contact.fullName
          || [contact.givenName, contact.familyName].filter(Boolean).join(" ")
          || phone
        ).trim();
        return {
          id: contact.id,
          name,
          phone,
          email: contact.emails?.[0]?.address || undefined,
        };
      }).filter((contact) => contact.id && contact.phone.length >= 10);

      await contactsDb.upsertDeviceContacts(formatted);
      return formatted.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["contacts-local"] });
      queryClient.invalidateQueries({ queryKey: ["contacts-filtered-ids"] });
      queryClient.invalidateQueries({ queryKey: ["contacts-stats"] });
      Alert.alert("Contacts refreshed", `${count} device contacts are available locally.`);
    },
    onError: (error) => Alert.alert("Contacts unavailable", error.message),
  });

  const toggleContact = useCallback((id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllFiltered = useCallback(() => {
    setSelectedIds((current) => {
      const next = new Set(current);
      const shouldDeselect = filteredIds.length > 0 && filteredIds.every((id) => next.has(id));
      filteredIds.forEach((id) => {
        if (shouldDeselect) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  }, [filteredIds]);

  const addManualRecipient = () => {
    const phone = digitsOnly(manualPhone);
    if (phone.length < 10 || phone.length > 15) {
      Alert.alert("Invalid number", "Enter a WhatsApp number with 10 to 15 digits.");
      return;
    }
    if (manualRecipients.some((recipient) => digitsOnly(recipient.phone) === phone)) {
      Alert.alert("Already added", "That number is already in the manual recipient list.");
      return;
    }
    setManualRecipients((current) => [
      ...current,
      { id: `manual-${Date.now()}-${phone}`, name: manualName.trim() || `+${phone}`, phone },
    ]);
    setManualName("");
    setManualPhone("");
    setManualDialog(false);
  };

  const chooseTemplate = (template: WaTemplate) => {
    triggerLightHaptic();
    setSelectedTemplate(template);
    setHeaderAsset(null);
    setBindings(createInitialRuntimeBindings(template.variableMappings));
    setCampaignName((current) => current || template.name.replaceAll("_", " "));
    setStep(2);
  };

  const pickHeaderMedia = async () => {
    if (!selectedTemplate || !integrationId) return;
    const format = headerFormat(selectedTemplate);
    if (!["IMAGE", "VIDEO", "DOCUMENT"].includes(format)) return;

    try {
      let media: WaLocalMedia;
      if (format === "DOCUMENT") {
        const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
        if (result.canceled) return;
        const asset = result.assets[0];
        media = {
          kind: "document",
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType || "application/octet-stream",
          size: asset.size,
        };
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) throw new Error("Allow photo library access to choose broadcast media.");
        const kind = format === "VIDEO" ? "video" : "image";
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: [kind === "video" ? "videos" : "images"],
          allowsMultipleSelection: false,
          quality: 1,
        });
        if (result.canceled) return;
        const asset = result.assets[0];
        media = {
          kind,
          uri: asset.uri,
          name: asset.fileName || `broadcast-header.${kind === "video" ? "mp4" : "jpg"}`,
          mimeType: asset.mimeType || (kind === "video" ? "video/mp4" : "image/jpeg"),
          size: asset.fileSize,
          width: asset.width,
          height: asset.height,
          durationMs: asset.duration ? Math.round(asset.duration) : undefined,
        };
      }

      setUploadingHeader(true);
      const uploaded = await uploadWaMedia(token, shopId, integrationId, media);
      setHeaderAsset({ id: uploaded.id, fileName: uploaded.fileName || media.name, kind: format as HeaderAsset["kind"] });
    } catch (error) {
      Alert.alert("Media upload failed", error instanceof Error ? error.message : "Could not upload media.");
    } finally {
      setUploadingHeader(false);
    }
  };

  const audienceCount = selectedIds.size + manualRecipients.length;
  const mappingsReady = Boolean(
    selectedTemplate
    && runtimeBindingsReady(selectedTemplate.variableMappings, bindings)
    && selectedTemplate.variableMappings.every((mapping) => {
      const binding = bindings[runtimeBindingKey(mapping)];
      return binding?.mode !== "ATTRIBUTE" || attributes.some((attribute) => attribute.id === binding.attributeId);
    }),
  );
  const mediaRequired = ["IMAGE", "VIDEO", "DOCUMENT"].includes(headerFormat(selectedTemplate));
  const campaignReady = Boolean(
    selectedTemplate
    && campaignName.trim()
    && audienceCount > 0
    && mappingsReady
    && (!mediaRequired || headerAsset),
  );

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate) throw new Error("Choose a template first.");
      if (!campaignName.trim()) throw new Error("Give this campaign a name.");
      if (!mappingsReady) throw new Error("Configure every template variable before sending.");
      if (mediaRequired && !headerAsset) throw new Error(`Choose the ${headerFormat(selectedTemplate).toLowerCase()} header for this campaign.`);

      const local = await getLocalContactsByIds([...selectedIds]);
      const recipients: WaBroadcastRecipientInput[] = [
        ...local.map((contact) => ({
          phone: contact.phone,
          name: contact.name,
          customerId: contact.customerId || undefined,
          sourceContactId: contact.id,
          source: contact.customerId ? ("CUSTOMER" as const) : ("DEVICE_CONTACT" as const),
        })),
        ...manualRecipients.map((recipient) => ({
          phone: recipient.phone,
          name: recipient.name,
          sourceContactId: recipient.id,
          source: "MANUAL" as const,
        })),
      ];
      if (!recipients.length) throw new Error("No recipients selected.");

      const broadcast = await createWaBroadcast(token, {
        shopId,
        integrationId,
        name: campaignName.trim(),
        templateId: selectedTemplate.id,
        templateVariables: {
          bindings: Object.values(bindings),
          ...(headerAsset ? { headerAssetId: headerAsset.id, headerFileName: headerAsset.fileName } : {}),
        },
      });

      try {
        for (let index = 0; index < recipients.length; index += RECIPIENT_UPLOAD_BATCH) {
          const batch = recipients.slice(index, index + RECIPIENT_UPLOAD_BATCH);
          await addWaBroadcastRecipients(token, shopId, broadcast.id, batch);
          setUploadProgress(Math.min(1, (index + batch.length) / recipients.length));
        }
      } catch (error) {
        await cancelWaBroadcast(token, shopId, broadcast.id).catch(() => undefined);
        throw error;
      }

      try {
        await sendWaBroadcast(token, shopId, broadcast.id);
      } catch (error) {
        if (error instanceof ApiError) {
          await cancelWaBroadcast(token, shopId, broadcast.id).catch(() => undefined);
          throw error;
        }
        queryClient.invalidateQueries({ queryKey: ["whatsapp", "broadcasts", shopId] });
        throw new Error("Could not confirm whether the campaign started. Check Campaigns before retrying.");
      }
      return broadcast;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "broadcasts", shopId] });
      navigation.replace("BroadcastList", { shopId, integrationId });
    },
    onError: (error) => Alert.alert("Campaign not started", error.message),
    onSettled: () => setUploadProgress(0),
  });

  const continueForward = () => {
    if (step === 0) {
      if (!audienceCount) {
        Alert.alert("Choose recipients", "Select at least one contact or add a number manually.");
        return;
      }
      setStep(1);
      return;
    }
    if (step === 2) {
      if (!selectedTemplate) return setStep(1);
      if (!mappingsReady) {
        Alert.alert("Complete personalization", "Choose a live data source or fixed value for every variable.");
        return;
      }
      if (mediaRequired && !headerAsset) {
        Alert.alert("Choose media", `This template needs a ${headerFormat(selectedTemplate).toLowerCase()} header for this campaign.`);
        return;
      }
      setStep(3);
    }
  };

  const renderAudience = () => (
    <View style={styles.flex}>
      <View style={styles.audienceTools}>
        <View style={styles.searchRow}>
          <Searchbar value={search} onChangeText={setSearch} placeholder="Search name or number" style={styles.searchbar} inputStyle={styles.searchInput} />
          <IconButton icon="account-plus-outline" size={22} iconColor={colors.primaryDark} onPress={() => setManualDialog(true)} accessibilityLabel="Add number manually" style={styles.roundAction} />
          <IconButton icon="contacts-outline" size={22} iconColor={colors.primaryDark} loading={importMutation.isPending} disabled={importMutation.isPending} onPress={() => importMutation.mutate()} accessibilityLabel="Refresh device contacts" style={styles.roundAction} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {(["ALL", "BUSINESS", "REGULAR", "NONE"] as const).map((filter) => (
            <Pressable key={filter} onPress={() => setTagFilter(filter)} style={[styles.filterChip, tagFilter === filter && styles.filterChipActive]}>
              <Text style={[styles.filterText, tagFilter === filter && styles.filterTextActive]}>
                {filter === "ALL" ? "All" : filter === "NONE" ? "Untagged" : filter.toLowerCase()}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable onPress={toggleAllFiltered} style={styles.selectAllRow} accessibilityRole="checkbox" accessibilityState={{ checked: allFilteredSelected }}>
          <View style={[styles.checkCircle, allFilteredSelected && styles.checkCircleSelected]}>
            {allFilteredSelected ? <MaterialCommunityIcons name="check" size={13} color="#fff" /> : null}
          </View>
          <Text style={styles.selectAllText}>{allFilteredSelected ? "Deselect" : "Select"} all {filteredIds.length} matching contacts</Text>
          <Text style={styles.localLabel}>ON DEVICE</Text>
        </Pressable>
        {manualRecipients.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.manualStrip}>
            {manualRecipients.map((recipient) => (
              <View key={recipient.id} style={styles.manualPill}>
                <Text style={styles.manualText} numberOfLines={1}>{recipient.name}</Text>
                <TouchableOpacity onPress={() => setManualRecipients((current) => current.filter((item) => item.id !== recipient.id))}>
                  <MaterialCommunityIcons name="close" size={14} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        ) : null}
      </View>

      {contactsQuery.isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlashList
          data={contacts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.contactList}
          onEndReached={() => {
            if (contactsQuery.hasNextPage && !contactsQuery.isFetchingNextPage) contactsQuery.fetchNextPage();
          }}
          onEndReachedThreshold={0.35}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="contacts-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No local contacts yet</Text>
              <Text style={styles.emptyCopy}>Refresh your phone contacts. Nothing is uploaded until you choose recipients for a campaign.</Text>
              <Button mode="text" icon="contacts-outline" onPress={() => importMutation.mutate()} loading={importMutation.isPending}>Refresh contacts</Button>
            </View>
          }
          ListFooterComponent={contactsQuery.isFetchingNextPage ? <ActivityIndicator style={styles.listLoader} color={colors.primary} /> : null}
          renderItem={({ item }) => <ContactRow item={item} selected={selectedIds.has(item.id)} onToggle={() => toggleContact(item.id)} />}
        />
      )}
    </View>
  );

  const renderTemplates = () => (
    <View style={styles.flex}>
      <View style={styles.templateHeader}>
        <Text style={styles.eyebrow}>APPROVED TEMPLATES</Text>
        <Text style={styles.stageTitle}>Choose the approved message structure.</Text>
        <Text style={styles.stageCopy}>The template defines the layout. Customer fields, offer codes and other live values are configured in the next step.</Text>
        <View style={styles.templateToolbar}>
          <Searchbar value={templateSearch} onChangeText={setTemplateSearch} placeholder="Search templates" style={styles.templateSearch} inputStyle={styles.searchInput} />
          <IconButton icon="plus" size={23} iconColor={colors.primary} onPress={() => navigation.navigate("TemplateEditor")} accessibilityLabel="Create template" />
        </View>
      </View>
      {templatesQuery.isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlashList
          data={templates}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.templateList}
          ItemSeparatorComponent={() => <View style={styles.templateSeparator} />}
          renderItem={({ item }) => (
            <Pressable onPress={() => chooseTemplate(item)} style={({ pressed }) => [styles.templateRow, pressed && styles.pressed]}>
              <View style={styles.templateTypeIcon}>
                <MaterialCommunityIcons name={headerFormat(item) === "IMAGE" ? "image-outline" : headerFormat(item) === "VIDEO" ? "video-outline" : headerFormat(item) === "DOCUMENT" ? "file-document-outline" : "message-text-outline"} size={21} color={colors.primaryDark} />
              </View>
              <View style={styles.templateBody}>
                <View style={styles.templateNameRow}>
                  <Text style={styles.templateName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.approvedLabel}>APPROVED</Text>
                </View>
                <Text style={styles.templatePreview} numberOfLines={2}>
                  {item.components?.find((component: any) => String(component?.type).toUpperCase() === "BODY")?.text || item.category}
                </Text>
                <Text style={styles.templateMeta}>{item.language} · {item.category.toLowerCase()} · {item.variableMappings.length} variables</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="message-plus-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No campaign-ready templates</Text>
              <Text style={styles.emptyCopy}>Create a standard Meta template, submit it for review, then return here after it is approved.</Text>
              <Button mode="text" icon="plus" onPress={() => navigation.navigate("TemplateEditor")}>Create template</Button>
            </View>
          }
        />
      )}
    </View>
  );

  const renderPersonalize = () => {
    if (!selectedTemplate) return renderTemplates();
    const format = headerFormat(selectedTemplate);
    return (
      <ScrollView style={styles.flex} contentContainerStyle={styles.personalizeContent} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => setStep(1)} style={styles.changeTemplateRow}>
          <MaterialCommunityIcons name="arrow-left" size={18} color={colors.primary} />
          <View style={styles.flex}>
            <Text style={styles.changeLabel}>Template</Text>
            <Text style={styles.changeName} numberOfLines={1}>{selectedTemplate.name}</Text>
          </View>
          <Text style={styles.changeAction}>Change</Text>
        </Pressable>

        <WhatsAppTemplatePreview definition={previewDefinition(selectedTemplate, bindings, attributes)} />

        {attributesQuery.isLoading ? (
          <ActivityIndicator style={styles.bindingLoader} color={colors.primary} />
        ) : (
          <TemplateRuntimeBindings mappings={selectedTemplate.variableMappings} attributes={attributes} bindings={bindings} onChange={setBindings} />
        )}

        {["IMAGE", "VIDEO", "DOCUMENT"].includes(format) ? (
          <View style={styles.sendMediaSection}>
            <Text style={styles.eyebrow}>CAMPAIGN MEDIA</Text>
            <Pressable onPress={pickHeaderMedia} disabled={uploadingHeader} style={({ pressed }) => [styles.mediaRow, pressed && styles.pressed]}>
              <View style={styles.mediaIcon}>
                <MaterialCommunityIcons name={format === "VIDEO" ? "video-outline" : format === "DOCUMENT" ? "file-document-outline" : "image-outline"} size={22} color={colors.primary} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.mediaTitle}>{headerAsset?.fileName || `Choose ${format.toLowerCase()} for this campaign`}</Text>
                <Text style={styles.mediaSubtitle}>{headerAsset ? "Uploaded once and reused for every recipient" : "This is the real media recipients will receive"}</Text>
              </View>
              {uploadingHeader ? <ActivityIndicator size="small" color={colors.primary} /> : <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />}
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    );
  };

  const renderReview = () => {
    if (!selectedTemplate) return renderTemplates();
    return (
      <ScrollView style={styles.flex} contentContainerStyle={styles.reviewContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>READY TO SEND</Text>
        <Text style={styles.stageTitle}>One final check.</Text>
        <Text style={styles.stageCopy}>Review the audience, message and runtime values before the campaign is queued.</Text>

        <Text style={styles.fieldLabel}>Campaign name</Text>
        <TextInput mode="flat" value={campaignName} onChangeText={setCampaignName} placeholder="August payment reminder" style={styles.nameInput} underlineColor={colors.borderStrong} activeUnderlineColor={colors.primary} />

        <View style={styles.reviewLine}>
          <Text style={styles.reviewLabel}>Recipients</Text>
          <Text style={styles.reviewValue}>{audienceCount.toLocaleString("en-IN")}</Text>
        </View>
        <View style={styles.reviewLine}>
          <Text style={styles.reviewLabel}>Template</Text>
          <Text style={styles.reviewValue} numberOfLines={1}>{selectedTemplate.name}</Text>
        </View>
        <View style={styles.reviewLine}>
          <Text style={styles.reviewLabel}>Variables</Text>
          <Text style={styles.reviewValue}>{selectedTemplate.variableMappings.length ? "Configured at send time" : "None"}</Text>
        </View>
        <View style={styles.reviewLine}>
          <Text style={styles.reviewLabel}>Header</Text>
          <Text style={styles.reviewValue}>{headerAsset?.fileName || headerFormat(selectedTemplate).toLowerCase()}</Text>
        </View>

        <View style={styles.privacyNote}>
          <MaterialCommunityIcons name="shield-lock-outline" size={21} color={colors.primary} />
          <Text style={styles.privacyText}>Only the selected recipient snapshot is sent to the server for this campaign. Your full phone contact book remains local.</Text>
        </View>

        <Text style={styles.previewHeading}>MESSAGE PREVIEW</Text>
        <WhatsAppTemplatePreview definition={previewDefinition(selectedTemplate, bindings, attributes)} />
      </ScrollView>
    );
  };

  return (
    <View style={styles.screen}>
      <StepRail step={step} onChange={(next) => {
        if (next <= step) setStep(next);
      }} />

      <View style={styles.flex}>
        {step === 0 ? renderAudience() : step === 1 ? renderTemplates() : step === 2 ? renderPersonalize() : renderReview()}
      </View>

      <View style={styles.bottomBar}>
        <View>
          <Text style={styles.bottomStrong}>{audienceCount.toLocaleString("en-IN")}</Text>
          <Text style={styles.bottomMuted}>recipients</Text>
        </View>
        {step > 0 ? <Button mode="text" onPress={() => setStep((current) => Math.max(0, current - 1))}>Back</Button> : null}
        {step === 0 || step === 2 ? (
          <Button mode="contained" icon="arrow-right" onPress={continueForward} style={styles.primaryButton}>Continue</Button>
        ) : step === 1 ? (
          <Button mode="contained" icon="plus" onPress={() => navigation.navigate("TemplateEditor")} style={styles.primaryButton}>New template</Button>
        ) : (
          <Button
            mode="contained"
            icon="send"
            loading={sendMutation.isPending}
            disabled={!campaignReady || sendMutation.isPending}
            onPress={() => sendMutation.mutate()}
            style={styles.primaryButton}
          >
            {sendMutation.isPending && uploadProgress > 0 ? `${Math.round(uploadProgress * 100)}%` : "Send campaign"}
          </Button>
        )}
      </View>

      <Portal>
        <Dialog visible={manualDialog} onDismiss={() => setManualDialog(false)} style={styles.dialog}>
          <Dialog.Title>Add WhatsApp number</Dialog.Title>
          <Dialog.Content>
            <TextInput mode="outlined" label="Name (optional)" value={manualName} onChangeText={setManualName} />
            <TextInput mode="outlined" label="Phone number" keyboardType="phone-pad" value={manualPhone} onChangeText={setManualPhone} style={styles.dialogInput} />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setManualDialog(false)}>Cancel</Button>
            <Button onPress={addManualRecipient}>Add</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

function StepRail({ step, onChange }: { step: number; onChange: (step: number) => void }) {
  return (
    <View style={styles.stepRail}>
      {STEPS.map((item, index) => {
        const active = index === step;
        const completed = index < step;
        return (
          <Pressable key={item.key} onPress={() => onChange(index)} style={styles.stepItem} accessibilityRole="tab" accessibilityState={{ selected: active }}>
            <View style={[styles.stepDot, (active || completed) && styles.stepDotActive]}>
              <MaterialCommunityIcons name={(completed ? "check" : item.icon) as any} size={14} color={active || completed ? "#fff" : colors.textMuted} />
            </View>
            <Text style={[styles.stepText, active && styles.stepTextActive]} numberOfLines={1}>{item.label}</Text>
            {index < STEPS.length - 1 ? <View style={[styles.stepLine, completed && styles.stepLineActive]} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  pressed: { opacity: 0.68 },
  stepRail: { minHeight: 64, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  stepItem: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center" },
  stepDot: { width: 27, height: 27, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceOffset, borderWidth: 1, borderColor: colors.border },
  stepDotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepText: { marginLeft: 4, color: colors.textMuted, fontSize: 9, fontWeight: fontWeight.semibold },
  stepTextActive: { color: colors.textPrimary, fontWeight: fontWeight.black },
  stepLine: { flex: 1, height: 1, marginHorizontal: 4, backgroundColor: colors.border },
  stepLineActive: { backgroundColor: colors.primary },
  audienceTools: { backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  searchRow: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.xs },
  searchbar: { flex: 1, height: 44, borderRadius: 22, backgroundColor: colors.surfaceOffset },
  searchInput: { minHeight: 44, fontSize: fontSize.sm },
  roundAction: { margin: 0, backgroundColor: colors.primaryLight },
  filterRow: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  filterChip: { minHeight: 30, paddingHorizontal: spacing.md, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  filterChipActive: { backgroundColor: colors.primaryLight },
  filterText: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  filterTextActive: { color: colors.primaryDark },
  selectAllRow: { minHeight: 46, paddingHorizontal: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  selectAllText: { flex: 1, color: colors.textPrimary, fontSize: fontSize.xs, fontWeight: fontWeight.bold },
  localLabel: { color: colors.textMuted, fontSize: 9, fontWeight: fontWeight.black, letterSpacing: 0.8 },
  manualStrip: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm },
  manualPill: { maxWidth: 180, minHeight: 30, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, borderRadius: 15, backgroundColor: colors.surfaceOffset },
  manualText: { maxWidth: 140, color: colors.textPrimary, fontSize: fontSize.xs },
  contactList: { paddingBottom: 110 },
  contactRow: { minHeight: 68, paddingHorizontal: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceOffset },
  avatarSelected: { backgroundColor: colors.primary },
  avatarText: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  contactBody: { flex: 1, minWidth: 0 },
  contactName: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  contactPhone: { marginTop: 2, color: colors.textSecondary, fontSize: fontSize.xs },
  contactTag: { color: colors.primaryDark, fontSize: 10, fontWeight: fontWeight.semibold },
  checkCircle: { width: 21, height: 21, borderRadius: 11, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  checkCircleSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 76, backgroundColor: colors.border },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyState: { paddingHorizontal: 36, paddingTop: 70, alignItems: "center" },
  emptyTitle: { marginTop: spacing.md, color: colors.textPrimary, fontSize: fontSize.md, fontWeight: fontWeight.bold },
  emptyCopy: { marginTop: 5, color: colors.textSecondary, fontSize: fontSize.xs, lineHeight: 18, textAlign: "center" },
  listLoader: { paddingVertical: spacing.lg },
  templateHeader: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm, backgroundColor: colors.surface },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: fontWeight.black, letterSpacing: 1.1 },
  stageTitle: { marginTop: 5, color: colors.textPrimary, fontSize: fontSize.xl, lineHeight: 27, fontWeight: fontWeight.black },
  stageCopy: { marginTop: 5, color: colors.textSecondary, fontSize: fontSize.xs, lineHeight: 18 },
  templateToolbar: { marginTop: spacing.md, flexDirection: "row", alignItems: "center" },
  templateSearch: { flex: 1, height: 44, borderRadius: 22, backgroundColor: colors.surfaceOffset },
  templateList: { paddingBottom: 110 },
  templateRow: { minHeight: 98, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  templateTypeIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryLight },
  templateBody: { flex: 1, minWidth: 0 },
  templateNameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  templateName: { flex: 1, color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.extrabold },
  approvedLabel: { color: colors.success, fontSize: 9, fontWeight: fontWeight.black },
  templatePreview: { marginTop: 4, color: colors.textSecondary, fontSize: fontSize.xs, lineHeight: 17 },
  templateMeta: { marginTop: 4, color: colors.textMuted, fontSize: 10 },
  templateSeparator: { height: StyleSheet.hairlineWidth, marginLeft: 76, backgroundColor: colors.border },
  personalizeContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 120 },
  changeTemplateRow: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, marginBottom: spacing.lg },
  changeLabel: { color: colors.textMuted, fontSize: 10, fontWeight: fontWeight.black, letterSpacing: 0.7 },
  changeName: { marginTop: 2, color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  changeAction: { color: colors.primary, fontSize: fontSize.xs, fontWeight: fontWeight.bold },
  bindingLoader: { marginVertical: spacing.xl },
  sendMediaSection: { marginTop: spacing.xxl },
  mediaRow: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  mediaIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryLight },
  mediaTitle: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  mediaSubtitle: { marginTop: 2, color: colors.textSecondary, fontSize: fontSize.xs, lineHeight: 17 },
  reviewContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: 120 },
  fieldLabel: { marginTop: spacing.xl, color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  nameInput: { backgroundColor: "transparent", paddingHorizontal: 0 },
  reviewLine: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  reviewLabel: { color: colors.textSecondary, fontSize: fontSize.sm },
  reviewValue: { flex: 1, color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.bold, textAlign: "right" },
  privacyNote: { marginTop: spacing.xl, flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingVertical: spacing.md },
  privacyText: { flex: 1, color: colors.textSecondary, fontSize: fontSize.xs, lineHeight: 18 },
  previewHeading: { marginTop: spacing.xl, marginBottom: spacing.sm, color: colors.textMuted, fontSize: 10, fontWeight: fontWeight.black, letterSpacing: 1 },
  bottomBar: { minHeight: 74, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: spacing.sm, backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  bottomStrong: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.black },
  bottomMuted: { color: colors.textMuted, fontSize: 10 },
  primaryButton: { borderRadius: radius.lg, backgroundColor: colors.primary },
  dialog: { backgroundColor: colors.surface },
  dialogInput: { marginTop: spacing.md },
});
