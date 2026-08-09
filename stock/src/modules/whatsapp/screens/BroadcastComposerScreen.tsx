import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { FlashList } from "@shopify/flash-list";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  Button,
  Dialog,
  IconButton,
  Portal,
  Searchbar,
  Text,
  TextInput,
} from "react-native-paper";
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
  fetchWaTemplates,
  uploadWaMedia,
  type WaLocalMedia,
  type WaTemplate,
  type WaTemplateDefinition,
} from "../../../api/whatsapp.api";
import { useAuthStore } from "../../../auth/auth-store";
import { WhatsAppTemplatePreview } from "../components/WhatsAppTemplatePreview";
import {
  useContactsFilteredIdsQuery,
  useContactsLocalQuery,
  useContactsStatsQuery,
} from "../hooks/useContactsLocal";
import { getLocalContactsByIds } from "../services/broadcastContacts";
import { contactsDb, type LocalContact } from "../services/contactsDb";
import { useWhatsAppScope } from "../whatsapp-scope";
import { formatWhatsAppPhone, initials, waColors } from "../whatsapp-ui";

const STEPS = ["Audience", "Message", "Review"] as const;
const RECIPIENT_UPLOAD_BATCH = 300;

type TagFilter = "ALL" | "REGULAR" | "BUSINESS" | "NONE";
type ManualRecipient = { id: string; name: string; phone: string };
type ScopedWaTemplate = WaTemplate & { integrationId?: string | null };
type HeaderAsset = {
  id: string;
  fileName: string;
  kind: "IMAGE" | "VIDEO" | "DOCUMENT";
};

function digitsOnly(phone: string) {
  return phone.replace(/\D/g, "");
}

function headerFormat(template?: WaTemplate | null) {
  if (!template) return "NONE";
  const definition = template.draftDefinition as WaTemplateDefinition | undefined;
  if (definition?.header?.format) return definition.header.format;
  return String(
    template.components?.find(
      (component: any) => String(component?.type).toUpperCase() === "HEADER",
    )?.format || "NONE",
  ).toUpperCase();
}

function isBroadcastReady(template: WaTemplate) {
  if (template.status !== "APPROVED") return false;
  if (template.parameterFormat === "NAMED") return false;
  if (template.subtype?.includes("CAROUSEL")) return false;
  if (
    template.components?.some(
      (component: any) => String(component?.type).toUpperCase() === "CAROUSEL",
    )
  ) return false;
  if (
    template.variableMappings.some(
      (mapping) => !["HEADER", "BODY"].includes(mapping.component),
    )
  ) return false;
  return ["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT"].includes(
    headerFormat(template),
  );
}

function defaultMappingValue(mapping: WaTemplate["variableMappings"][number]) {
  const path = `${mapping.attribute?.key || ""} ${mapping.attribute?.sourcePath || ""}`.toLowerCase();
  if (mapping.attribute?.source === "CUSTOMER") {
    if (path.includes("name")) return "{{recipient.name}}";
    if (path.includes("phone") || path.includes("mobile")) return "{{recipient.phone}}";
  }
  return mapping.fallbackValue || mapping.attribute?.fallbackValue || "";
}

function previewDefinition(
  template: WaTemplate,
  values: Record<string, string>,
): Partial<WaTemplateDefinition> {
  const base: Partial<WaTemplateDefinition> = template.draftDefinition || {
    name: template.name,
    language: template.language,
    category: template.category,
    body: {
      text:
        template.components?.find(
          (component: any) => String(component?.type).toUpperCase() === "BODY",
        )?.text || "",
    },
  };

  return {
    ...base,
    mappings: template.variableMappings.map((mapping) => ({
      component: mapping.component,
      position: mapping.position,
      buttonIndex: mapping.buttonIndex,
      cardIndex: mapping.cardIndex,
      attributeId: mapping.attributeId,
      sampleValue:
        values[mapping.id] || mapping.fallbackValue || mapping.sampleValue,
      fallbackValue: mapping.fallbackValue,
      required: mapping.required,
    })),
  };
}

function buildTemplateVariables(
  template: WaTemplate,
  values: Record<string, string>,
  media: HeaderAsset | null,
) {
  const resolve = (component: "HEADER" | "BODY") =>
    template.variableMappings
      .filter((mapping) => mapping.component === component)
      .sort((left, right) => left.position - right.position)
      .map(
        (mapping) =>
          values[mapping.id] ||
          mapping.fallbackValue ||
          mapping.attribute?.fallbackValue ||
          "",
      );

  const header = resolve("HEADER");
  const body = resolve("BODY");
  return {
    ...(header.length ? { header } : {}),
    ...(body.length ? { body } : {}),
    ...(media
      ? { headerAssetId: media.id, headerFileName: media.fileName }
      : {}),
  };
}

function ContactRow({
  item,
  selected,
  onToggle,
}: {
  item: LocalContact;
  selected: boolean;
  onToggle: () => void;
}) {
  const label = item.name || formatWhatsAppPhone(item.phone);
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${label}, ${formatWhatsAppPhone(item.phone)}`}
      style={({ pressed }) => [styles.contactRow, pressed && styles.rowPressed]}
    >
      <View style={[styles.avatar, selected && styles.avatarSelected]}>
        {selected ? (
          <MaterialCommunityIcons name="check" size={18} color="#fff" />
        ) : (
          <Text style={styles.avatarText}>{initials(item.name || item.phone)}</Text>
        )}
      </View>
      <View style={styles.contactText}>
        <Text style={styles.contactName} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.contactPhone}>{formatWhatsAppPhone(item.phone)}</Text>
      </View>
      {item.tag !== "NONE" && (
        <Text style={styles.contactTag}>
          {item.tag === "BUSINESS" ? "Business" : "Regular"}
        </Text>
      )}
      <View
        style={[
          styles.selectionCircle,
          selected && styles.selectionCircleSelected,
        ]}
      >
        {selected && <MaterialCommunityIcons name="check" size={13} color="#fff" />}
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
  const [mappingValues, setMappingValues] = useState<Record<string, string>>({});
  const [headerAsset, setHeaderAsset] = useState<HeaderAsset | null>(null);
  const [uploadingHeader, setUploadingHeader] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitle: "New broadcast",
      headerStyle: { backgroundColor: waColors.surface },
      headerTintColor: waColors.text,
      headerShadowVisible: false,
      headerTitleStyle: { fontWeight: "800" },
    });
  }, [navigation]);

  const contactParams = useMemo(
    () => ({
      searchQuery: debouncedSearch,
      syncFilter: "ALL" as const,
      linkFilter: "ALL" as const,
      tagFilter,
      customerPhoneSuffixes: [] as string[],
    }),
    [debouncedSearch, tagFilter],
  );

  const contactsQuery = useContactsLocalQuery(contactParams);
  const filteredIdsQuery = useContactsFilteredIdsQuery(contactParams, true);
  const statsQuery = useContactsStatsQuery([]);
  const contacts = useMemo(
    () => contactsQuery.data?.pages.flatMap((page) => page) || [],
    [contactsQuery.data],
  );
  const filteredIds = filteredIdsQuery.data || [];
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));

  const templatesQuery = useQuery({
    queryKey: ["wa-broadcast-templates", shopId, integrationId, templateSearch],
    enabled: Boolean(token && shopId && integrationId && step >= 1),
    queryFn: () =>
      fetchWaTemplates(token, shopId, {
        status: "APPROVED",
        search: templateSearch.trim() || undefined,
        pageSize: 100,
      }),
  });
  const templates = useMemo(
    () => (templatesQuery.data?.data || []).filter((template) => {
      const templateIntegrationId = (template as ScopedWaTemplate).integrationId;
      return isBroadcastReady(template)
        && (!templateIntegrationId || templateIntegrationId === integrationId);
    }),
    [integrationId, templatesQuery.data?.data],
  );

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

      const formatted = data
        .map((contact) => {
          const phones = contact.phones || [];
          const mobile = phones.find((entry) =>
            /(mobile|cell|iphone)/i.test(entry.label || ""),
          );
          const phone = digitsOnly(mobile?.number || phones[0]?.number || "");
          const name = (
            contact.fullName ||
            [contact.givenName, contact.familyName].filter(Boolean).join(" ") ||
            phone
          ).trim();
          return {
            id: contact.id,
            name,
            phone,
            email: contact.emails?.[0]?.address || undefined,
          };
        })
        .filter((contact) => contact.id && contact.phone.length >= 10);

      await contactsDb.upsertDeviceContacts(formatted);
      return formatted.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["contacts-local"] });
      queryClient.invalidateQueries({ queryKey: ["contacts-filtered-ids"] });
      queryClient.invalidateQueries({ queryKey: ["contacts-stats"] });
      Alert.alert(
        "Contacts refreshed",
        `${count} device contacts are available locally.`,
      );
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
      const shouldDeselect =
        filteredIds.length > 0 && filteredIds.every((id) => next.has(id));
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
      {
        id: `manual-${Date.now()}-${phone}`,
        name: manualName.trim() || `+${phone}`,
        phone,
      },
    ]);
    setManualName("");
    setManualPhone("");
    setManualDialog(false);
  };

  const chooseTemplate = (template: WaTemplate) => {
    setSelectedTemplate(template);
    setHeaderAsset(null);
    setCampaignName((current) => current || template.name.replaceAll("_", " "));
    setMappingValues(
      Object.fromEntries(
        template.variableMappings
          .filter(
            (mapping) =>
              mapping.component === "HEADER" || mapping.component === "BODY",
          )
          .map((mapping) => [mapping.id, defaultMappingValue(mapping)]),
      ),
    );
  };

  const pickHeaderMedia = async () => {
    if (!selectedTemplate || !integrationId) return;
    const format = headerFormat(selectedTemplate);
    if (!["IMAGE", "VIDEO", "DOCUMENT"].includes(format)) return;

    try {
      let media: WaLocalMedia;
      if (format === "DOCUMENT") {
        const result = await DocumentPicker.getDocumentAsync({
          copyToCacheDirectory: true,
          multiple: false,
        });
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
        if (!permission.granted) {
          throw new Error("Allow photo library access to choose broadcast media.");
        }
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
          name:
            asset.fileName ||
            `broadcast-header.${kind === "video" ? "mp4" : "jpg"}`,
          mimeType:
            asset.mimeType || (kind === "video" ? "video/mp4" : "image/jpeg"),
          size: asset.fileSize,
          width: asset.width,
          height: asset.height,
          durationMs: asset.duration ? Math.round(asset.duration) : undefined,
        };
      }

      setUploadingHeader(true);
      const uploaded = await uploadWaMedia(token, shopId, integrationId, media);
      setHeaderAsset({
        id: uploaded.id,
        fileName: uploaded.fileName || media.name,
        kind: format as HeaderAsset["kind"],
      });
    } catch (error) {
      Alert.alert(
        "Media upload failed",
        error instanceof Error ? error.message : "Could not upload media.",
      );
    } finally {
      setUploadingHeader(false);
    }
  };

  const audienceCount = selectedIds.size + manualRecipients.length;
  const requiredMappingsMissing = useMemo(() => {
    if (!selectedTemplate) return [];
    return selectedTemplate.variableMappings.filter(
      (mapping) =>
        (mapping.component === "HEADER" || mapping.component === "BODY") &&
        mapping.required &&
        !(
          mappingValues[mapping.id] ||
          mapping.fallbackValue ||
          mapping.attribute?.fallbackValue
        ),
    );
  }, [mappingValues, selectedTemplate]);

  const mediaRequired = ["IMAGE", "VIDEO", "DOCUMENT"].includes(
    headerFormat(selectedTemplate),
  );
  const canContinueMessage = Boolean(
    selectedTemplate &&
      requiredMappingsMissing.length === 0 &&
      (!mediaRequired || headerAsset),
  );

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate) throw new Error("Choose a template first.");
      if (!campaignName.trim()) throw new Error("Give this campaign a name.");

      const local = await getLocalContactsByIds([...selectedIds]);
      const recipients: WaBroadcastRecipientInput[] = [
        ...local.map((contact) => ({
          phone: contact.phone,
          name: contact.name,
          customerId: contact.customerId || undefined,
          sourceContactId: contact.id,
          source: contact.customerId
            ? ("CUSTOMER" as const)
            : ("DEVICE_CONTACT" as const),
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
        templateVariables: buildTemplateVariables(
          selectedTemplate,
          mappingValues,
          headerAsset,
        ),
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
        queryClient.invalidateQueries({
          queryKey: ["whatsapp", "broadcasts", shopId],
        });
        throw new Error(
          "Could not confirm whether the broadcast started. Check Broadcasts before retrying.",
        );
      }
      return broadcast;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["whatsapp", "broadcasts", shopId],
      });
      navigation.replace("BroadcastList", { shopId, integrationId });
    },
    onError: (error) => Alert.alert("Broadcast not started", error.message),
    onSettled: () => setUploadProgress(0),
  });

  const continueForward = () => {
    if (step === 0 && audienceCount === 0) {
      Alert.alert(
        "Choose recipients",
        "Select at least one contact or add a number manually.",
      );
      return;
    }
    if (step === 1 && !canContinueMessage) {
      if (!selectedTemplate) {
        Alert.alert("Choose a template", "Select an approved WhatsApp template.");
      } else if (requiredMappingsMissing.length) {
        Alert.alert("Complete variables", "Fill every required template variable.");
      } else {
        Alert.alert(
          "Choose media",
          `This template requires a ${headerFormat(selectedTemplate).toLowerCase()} header.`,
        );
      }
      return;
    }
    setStep((current) => Math.min(2, current + 1));
  };

  const renderAudience = () => (
    <View style={styles.flex}>
      <View style={styles.searchArea}>
        <View style={styles.searchRow}>
          <Searchbar
            value={search}
            onChangeText={setSearch}
            placeholder="Search name or number"
            style={styles.searchbar}
            inputStyle={styles.searchInput}
          />
          <IconButton
            icon="account-plus-outline"
            size={22}
            iconColor={waColors.greenDark}
            onPress={() => setManualDialog(true)}
            accessibilityLabel="Add number manually"
            style={styles.roundAction}
          />
          <IconButton
            icon="contacts-outline"
            size={22}
            iconColor={waColors.greenDark}
            loading={importMutation.isPending}
            disabled={importMutation.isPending}
            onPress={() => importMutation.mutate()}
            accessibilityLabel="Refresh device contacts"
            style={styles.roundAction}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {(["ALL", "BUSINESS", "REGULAR", "NONE"] as const).map((filter) => (
            <Pressable
              key={filter}
              onPress={() => setTagFilter(filter)}
              style={[
                styles.filterChip,
                tagFilter === filter && styles.filterChipActive,
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  tagFilter === filter && styles.filterChipTextActive,
                ]}
              >
                {filter === "ALL"
                  ? "All"
                  : filter === "NONE"
                    ? "Untagged"
                    : filter.toLowerCase()}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Pressable
          onPress={toggleAllFiltered}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: allFilteredSelected }}
          accessibilityLabel={`${allFilteredSelected ? "Deselect" : "Select"} all ${filteredIds.length} matching contacts`}
          style={styles.selectAllLine}
        >
          <View
            style={[
              styles.selectionCircle,
              allFilteredSelected && styles.selectionCircleSelected,
            ]}
          >
            {allFilteredSelected && (
              <MaterialCommunityIcons name="check" size={13} color="#fff" />
            )}
          </View>
          <Text style={styles.selectAllText}>
            {allFilteredSelected ? "Deselect" : "Select"} all {filteredIds.length} matching contacts
          </Text>
          <Text style={styles.localOnly}>LOCAL SEARCH</Text>
        </Pressable>

        {!!manualRecipients.length && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.manualStrip}
          >
            {manualRecipients.map((recipient) => (
              <View key={recipient.id} style={styles.manualPill}>
                <Text style={styles.manualPillText} numberOfLines={1}>
                  {recipient.name}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    setManualRecipients((current) =>
                      current.filter((item) => item.id !== recipient.id),
                    )
                  }
                >
                  <MaterialCommunityIcons
                    name="close"
                    size={14}
                    color={waColors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {contactsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={waColors.green} />
        </View>
      ) : (
        <FlashList
          data={contacts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.contactList}
          onEndReached={() => {
            if (contactsQuery.hasNextPage && !contactsQuery.isFetchingNextPage) {
              contactsQuery.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.35}
          ItemSeparatorComponent={() => <View style={styles.contactSeparator} />}
          ListEmptyComponent={
            <View style={styles.emptyContacts}>
              <MaterialCommunityIcons
                name="contacts-outline"
                size={40}
                color={waColors.textMuted}
              />
              <Text style={styles.emptyTitle}>No local contacts yet</Text>
              <Text style={styles.emptyCopy}>
                Refresh device contacts. They remain on this phone until you select a campaign audience.
              </Text>
              <Button
                mode="outlined"
                icon="contacts-outline"
                onPress={() => importMutation.mutate()}
                loading={importMutation.isPending}
              >
                Refresh contacts
              </Button>
            </View>
          }
          ListFooterComponent={
            contactsQuery.isFetchingNextPage ? (
              <ActivityIndicator style={styles.footerLoader} color={waColors.green} />
            ) : null
          }
          renderItem={({ item }) => (
            <ContactRow
              item={item}
              selected={selectedIds.has(item.id)}
              onToggle={() => toggleContact(item.id)}
            />
          )}
        />
      )}
    </View>
  );

  const renderTemplateList = () => (
    <View style={styles.flex}>
      <Searchbar
        value={templateSearch}
        onChangeText={setTemplateSearch}
        placeholder="Search approved templates"
        style={[styles.searchbar, styles.templateSearch]}
        inputStyle={styles.searchInput}
      />
      {templatesQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={waColors.green} />
        </View>
      ) : (
        <FlashList
          data={templates}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.templateList}
          ItemSeparatorComponent={() => <View style={styles.templateSeparator} />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => chooseTemplate(item)}
              style={({ pressed }) => [styles.templateRow, pressed && styles.rowPressed]}
            >
              <View style={styles.templateIcon}>
                <MaterialCommunityIcons
                  name="message-text-outline"
                  size={21}
                  color={waColors.greenDark}
                />
              </View>
              <View style={styles.templateBody}>
                <Text style={styles.templateTitle} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.templatePreview} numberOfLines={2}>
                  {item.components?.find(
                    (component: any) =>
                      String(component?.type).toUpperCase() === "BODY",
                  )?.text || item.category}
                </Text>
                <Text style={styles.templateMeta}>
                  {item.language} · {item.category.toLowerCase()} · {headerFormat(item).toLowerCase()} header
                </Text>
              </View>
              <MaterialCommunityIcons
                name="chevron-right"
                size={22}
                color={waColors.textMuted}
              />
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContacts}>
              <MaterialCommunityIcons
                name="message-alert-outline"
                size={40}
                color={waColors.textMuted}
              />
              <Text style={styles.emptyTitle}>No broadcast-ready templates</Text>
              <Text style={styles.emptyCopy}>
                Use an approved positional text, image, video, or document template. Dynamic buttons, carousel and location templates are excluded for now.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );

  const renderMessageEditor = () => {
    if (!selectedTemplate) return renderTemplateList();
    const format = headerFormat(selectedTemplate);
    const mappings = selectedTemplate.variableMappings
      .filter(
        (mapping) => mapping.component === "HEADER" || mapping.component === "BODY",
      )
      .sort(
        (left, right) =>
          left.component.localeCompare(right.component) || left.position - right.position,
      );

    return (
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.editorContent}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          onPress={() => setSelectedTemplate(null)}
          style={styles.changeTemplate}
        >
          <MaterialCommunityIcons
            name="arrow-left"
            size={17}
            color={waColors.greenDark}
          />
          <Text style={styles.changeTemplateText}>Change template</Text>
          <Text style={styles.changeTemplateName} numberOfLines={1}>
            {selectedTemplate.name}
          </Text>
        </Pressable>

        <WhatsAppTemplatePreview
          definition={previewDefinition(selectedTemplate, mappingValues)}
        />

        {["IMAGE", "VIDEO", "DOCUMENT"].includes(format) && (
          <View style={styles.editorSection}>
            <Text style={styles.editorLabel}>{format.toLowerCase()} header</Text>
            <Text style={styles.editorHint}>
              Upload once; the same WhatsApp media asset is reused for every recipient.
            </Text>
            <Pressable
              onPress={pickHeaderMedia}
              style={styles.mediaPicker}
              disabled={uploadingHeader}
            >
              <View style={styles.mediaPickerIcon}>
                <MaterialCommunityIcons
                  name={
                    format === "DOCUMENT"
                      ? "file-document-outline"
                      : format === "VIDEO"
                        ? "video-outline"
                        : "image-outline"
                  }
                  size={23}
                  color={waColors.greenDark}
                />
              </View>
              <View style={styles.mediaPickerText}>
                <Text style={styles.mediaPickerTitle}>
                  {headerAsset?.fileName || `Choose ${format.toLowerCase()}`}
                </Text>
                <Text style={styles.mediaPickerSub}>
                  {headerAsset
                    ? "Ready for broadcast"
                    : "Required by this approved template"}
                </Text>
              </View>
              {uploadingHeader ? (
                <ActivityIndicator color={waColors.green} />
              ) : (
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={22}
                  color={waColors.textMuted}
                />
              )}
            </Pressable>
          </View>
        )}

        {!!mappings.length && (
          <View style={styles.editorSection}>
            <Text style={styles.editorLabel}>Template variables</Text>
            <Text style={styles.editorHint}>
              Recipient tokens resolve per selected number without creating a CRM customer.
            </Text>
            {mappings.map((mapping) => (
              <View key={mapping.id} style={styles.variableBlock}>
                <View style={styles.variableHeader}>
                  <Text style={styles.variableName}>
                    {mapping.component} {"{{"}{mapping.position}{"}}"}
                  </Text>
                  {!!mapping.attribute?.label && (
                    <Text style={styles.variableAttribute}>
                      {mapping.attribute.label}
                    </Text>
                  )}
                </View>
                <TextInput
                  mode="outlined"
                  value={mappingValues[mapping.id] || ""}
                  placeholder={
                    mapping.fallbackValue ||
                    mapping.attribute?.fallbackValue ||
                    "Enter value"
                  }
                  onChangeText={(value) =>
                    setMappingValues((current) => ({
                      ...current,
                      [mapping.id]: value,
                    }))
                  }
                  style={styles.variableInput}
                  outlineStyle={styles.inputOutline}
                />
                <View style={styles.tokenRow}>
                  <Pressable
                    onPress={() =>
                      setMappingValues((current) => ({
                        ...current,
                        [mapping.id]: "{{recipient.name}}",
                      }))
                    }
                    style={styles.tokenChip}
                  >
                    <Text style={styles.tokenText}>Recipient name</Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      setMappingValues((current) => ({
                        ...current,
                        [mapping.id]: "{{recipient.phone}}",
                      }))
                    }
                    style={styles.tokenChip}
                  >
                    <Text style={styles.tokenText}>Phone</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    );
  };

  const renderReview = () => (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.reviewContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.reviewHero}>
        <View style={styles.reviewIcon}>
          <MaterialCommunityIcons
            name="bullhorn-outline"
            size={26}
            color={waColors.greenDark}
          />
        </View>
        <View style={styles.reviewHeroText}>
          <Text style={styles.reviewTitle}>Ready to queue</Text>
          <Text style={styles.reviewSubtitle}>
            The request returns immediately; BullMQ handles recipient sends and retries.
          </Text>
        </View>
      </View>

      <TextInput
        mode="outlined"
        label="Campaign name"
        value={campaignName}
        onChangeText={setCampaignName}
        style={styles.campaignInput}
        outlineStyle={styles.inputOutline}
      />

      {[
        ["Audience", `${audienceCount} selected`],
        ["Device contacts", String(selectedIds.size)],
        ["Manual numbers", String(manualRecipients.length)],
        ["Template", selectedTemplate?.name || "—"],
        ["Header", headerFormat(selectedTemplate).toLowerCase()],
      ].map(([label, value]) => (
        <View key={label} style={styles.reviewLine}>
          <Text style={styles.reviewLineLabel}>{label}</Text>
          <Text style={styles.reviewLineValue} numberOfLines={1}>
            {value}
          </Text>
        </View>
      ))}

      <View style={styles.privacyNote}>
        <MaterialCommunityIcons
          name="shield-lock-outline"
          size={20}
          color={waColors.greenDark}
        />
        <View style={styles.privacyText}>
          <Text style={styles.privacyTitle}>Selected contacts only</Text>
          <Text style={styles.privacyCopy}>
            Search and filtering happened in local SQLite. Only the final selected recipient snapshot is uploaded for this campaign.
          </Text>
        </View>
      </View>

      {!!selectedTemplate && (
        <View style={styles.reviewPreview}>
          <WhatsAppTemplatePreview
            definition={previewDefinition(selectedTemplate, mappingValues)}
          />
        </View>
      )}
    </ScrollView>
  );

  return (
    <View style={styles.screen}>
      <View style={styles.stepper}>
        {STEPS.map((label, index) => (
          <View key={label} style={styles.stepItem}>
            <View style={[styles.stepDot, index <= step && styles.stepDotActive]}>
              {index < step ? (
                <MaterialCommunityIcons name="check" size={12} color="#fff" />
              ) : (
                <Text
                  style={[
                    styles.stepNumber,
                    index <= step && styles.stepNumberActive,
                  ]}
                >
                  {index + 1}
                </Text>
              )}
            </View>
            <Text style={[styles.stepLabel, index === step && styles.stepLabelActive]}>
              {label}
            </Text>
            {index < STEPS.length - 1 && (
              <View style={[styles.stepLine, index < step && styles.stepLineActive]} />
            )}
          </View>
        ))}
      </View>

      {step === 0
        ? renderAudience()
        : step === 1
          ? renderMessageEditor()
          : renderReview()}

      <View style={styles.bottomBar}>
        <View style={styles.bottomInfo}>
          <Text style={styles.bottomPrimary} numberOfLines={1}>
            {step === 0
              ? `${audienceCount} selected`
              : step === 1
                ? selectedTemplate?.name || "Choose template"
                : `${audienceCount} recipients`}
          </Text>
          <Text style={styles.bottomSecondary}>
            {step === 0
              ? `${statsQuery.data?.total || 0} contacts stored locally`
              : step === 1
                ? "Approved positional templates only"
                : "Queued through BullMQ"}
          </Text>
        </View>

        {step > 0 && (
          <Button
            mode="text"
            onPress={() => setStep((current) => current - 1)}
            disabled={sendMutation.isPending}
            textColor={waColors.textSecondary}
          >
            Back
          </Button>
        )}

        {step < 2 ? (
          <Button
            mode="contained"
            onPress={continueForward}
            buttonColor={waColors.greenDark}
            textColor="#fff"
            contentStyle={styles.continueButtonContent}
          >
            Continue
          </Button>
        ) : (
          <Button
            mode="contained"
            icon="send-outline"
            loading={sendMutation.isPending}
            disabled={sendMutation.isPending || !campaignName.trim()}
            buttonColor={waColors.greenDark}
            textColor="#fff"
            contentStyle={styles.continueButtonContent}
            onPress={() =>
              Alert.alert(
                "Send broadcast?",
                `Queue this approved template for ${audienceCount} selected recipients?`,
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Queue broadcast", onPress: () => sendMutation.mutate() },
                ],
              )
            }
          >
            {sendMutation.isPending && uploadProgress > 0
              ? `${Math.round(uploadProgress * 100)}%`
              : "Send"}
          </Button>
        )}
      </View>

      <Portal>
        <Dialog
          visible={manualDialog}
          onDismiss={() => setManualDialog(false)}
          style={styles.dialog}
        >
          <Dialog.Title>Add WhatsApp number</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.dialogCopy}>
              This number is added only to this broadcast audience.
            </Text>
            <TextInput
              mode="outlined"
              label="Name (optional)"
              value={manualName}
              onChangeText={setManualName}
              style={styles.dialogInput}
            />
            <TextInput
              mode="outlined"
              label="Phone number"
              value={manualPhone}
              onChangeText={setManualPhone}
              keyboardType="phone-pad"
            />
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: waColors.surface },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  stepper: {
    height: 60,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: waColors.border,
  },
  stepItem: { flex: 1, flexDirection: "row", alignItems: "center" },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: waColors.surfaceMuted,
    borderWidth: 1,
    borderColor: waColors.border,
  },
  stepDotActive: { backgroundColor: waColors.greenDark, borderColor: waColors.greenDark },
  stepNumber: { fontSize: 10, fontWeight: "800", color: waColors.textMuted },
  stepNumberActive: { color: "#fff" },
  stepLabel: { marginLeft: 6, fontSize: 10, fontWeight: "700", color: waColors.textMuted },
  stepLabelActive: { color: waColors.text },
  stepLine: { flex: 1, height: 1, marginHorizontal: 7, backgroundColor: waColors.border },
  stepLineActive: { backgroundColor: waColors.green },
  searchArea: { borderBottomWidth: 1, borderBottomColor: waColors.border },
  searchRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 10, gap: 4 },
  searchbar: { flex: 1, height: 42, borderRadius: 21, elevation: 0, backgroundColor: waColors.surfaceMuted },
  searchInput: { minHeight: 0, fontSize: 13, paddingBottom: 3 },
  roundAction: { margin: 0, width: 40, height: 40, borderRadius: 20, backgroundColor: waColors.surfaceMuted },
  filterRow: { paddingHorizontal: 12, paddingVertical: 9, gap: 7 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15, backgroundColor: waColors.surfaceMuted },
  filterChipActive: { backgroundColor: "#E1F3ED" },
  filterChipText: { fontSize: 11, fontWeight: "700", color: waColors.textSecondary, textTransform: "capitalize" },
  filterChipTextActive: { color: waColors.greenDark },
  selectAllLine: { minHeight: 40, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: waColors.border },
  selectAllText: { marginLeft: 10, flex: 1, fontSize: 12, fontWeight: "700", color: waColors.text },
  localOnly: { fontSize: 8, letterSpacing: 0.7, fontWeight: "900", color: waColors.green },
  manualStrip: { paddingHorizontal: 12, paddingVertical: 8, gap: 7, borderTopWidth: 1, borderTopColor: waColors.border },
  manualPill: { maxWidth: 170, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 10, height: 30, borderRadius: 15, backgroundColor: "#E7F7F1" },
  manualPillText: { maxWidth: 130, fontSize: 11, fontWeight: "700", color: waColors.greenDark },
  contactList: { paddingBottom: 18 },
  contactSeparator: { height: 1, marginLeft: 70, backgroundColor: waColors.border },
  contactRow: { minHeight: 66, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8 },
  rowPressed: { backgroundColor: "#F7F9FA" },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: waColors.surfaceMuted, alignItems: "center", justifyContent: "center", marginRight: 12 },
  avatarSelected: { backgroundColor: waColors.greenDark },
  avatarText: { fontSize: 13, fontWeight: "800", color: waColors.textSecondary },
  contactText: { flex: 1, minWidth: 0 },
  contactName: { fontSize: 14, fontWeight: "800", color: waColors.text },
  contactPhone: { marginTop: 2, fontSize: 11, color: waColors.textSecondary },
  contactTag: { marginHorizontal: 8, fontSize: 9, fontWeight: "800", color: waColors.textMuted },
  selectionCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: "#B6C2C8", alignItems: "center", justifyContent: "center" },
  selectionCircleSelected: { backgroundColor: waColors.greenDark, borderColor: waColors.greenDark },
  footerLoader: { margin: 16 },
  emptyContacts: { paddingHorizontal: 42, paddingVertical: 70, alignItems: "center" },
  emptyTitle: { marginTop: 12, fontSize: 16, fontWeight: "800", color: waColors.text },
  emptyCopy: { marginTop: 6, marginBottom: 16, fontSize: 12, lineHeight: 18, textAlign: "center", color: waColors.textSecondary },
  templateSearch: { flex: 0, margin: 12 },
  templateList: { paddingBottom: 20 },
  templateSeparator: { height: 1, marginLeft: 72, backgroundColor: waColors.border },
  templateRow: { minHeight: 88, flexDirection: "row", alignItems: "center", paddingHorizontal: 17, paddingVertical: 12 },
  templateIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#E7F7F1", alignItems: "center", justifyContent: "center", marginRight: 12 },
  templateBody: { flex: 1, minWidth: 0 },
  templateTitle: { fontSize: 14, fontWeight: "800", color: waColors.text },
  templatePreview: { marginTop: 3, fontSize: 11, lineHeight: 15, color: waColors.textSecondary },
  templateMeta: { marginTop: 5, fontSize: 9, fontWeight: "700", color: waColors.textMuted },
  editorContent: { padding: 14, paddingBottom: 110 },
  changeTemplate: { flexDirection: "row", alignItems: "center", paddingBottom: 12 },
  changeTemplateText: { marginLeft: 5, fontSize: 12, fontWeight: "800", color: waColors.greenDark },
  changeTemplateName: { marginLeft: 8, flex: 1, textAlign: "right", fontSize: 11, color: waColors.textMuted },
  editorSection: { marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: waColors.border },
  editorLabel: { fontSize: 14, fontWeight: "800", color: waColors.text },
  editorHint: { marginTop: 3, marginBottom: 11, fontSize: 11, lineHeight: 16, color: waColors.textSecondary },
  mediaPicker: { minHeight: 62, flexDirection: "row", alignItems: "center", paddingVertical: 9 },
  mediaPickerIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: "#E7F7F1", alignItems: "center", justifyContent: "center", marginRight: 11 },
  mediaPickerText: { flex: 1 },
  mediaPickerTitle: { fontSize: 13, fontWeight: "800", color: waColors.text },
  mediaPickerSub: { marginTop: 2, fontSize: 10, color: waColors.textSecondary },
  variableBlock: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: waColors.border },
  variableHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  variableName: { fontSize: 11, fontWeight: "800", color: waColors.text },
  variableAttribute: { fontSize: 10, color: waColors.textMuted },
  variableInput: { backgroundColor: waColors.surface, fontSize: 12 },
  inputOutline: { borderRadius: 12 },
  tokenRow: { flexDirection: "row", gap: 7, marginTop: 7 },
  tokenChip: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12, backgroundColor: waColors.surfaceMuted },
  tokenText: { fontSize: 9, fontWeight: "800", color: waColors.greenDark },
  reviewContent: { padding: 18, paddingBottom: 120 },
  reviewHero: { flexDirection: "row", alignItems: "center", paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: waColors.border },
  reviewIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#E7F7F1", alignItems: "center", justifyContent: "center", marginRight: 13 },
  reviewHeroText: { flex: 1 },
  reviewTitle: { fontSize: 18, fontWeight: "900", color: waColors.text },
  reviewSubtitle: { marginTop: 3, fontSize: 11, lineHeight: 16, color: waColors.textSecondary },
  campaignInput: { marginTop: 18, marginBottom: 10, backgroundColor: waColors.surface },
  reviewLine: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: waColors.border },
  reviewLineLabel: { fontSize: 12, color: waColors.textSecondary },
  reviewLineValue: { maxWidth: "58%", fontSize: 12, fontWeight: "800", color: waColors.text, textAlign: "right" },
  privacyNote: { marginTop: 18, flexDirection: "row", alignItems: "flex-start", padding: 14, borderRadius: 14, backgroundColor: "#E7F7F1" },
  privacyText: { flex: 1, marginLeft: 10 },
  privacyTitle: { fontSize: 12, fontWeight: "800", color: waColors.greenDark },
  privacyCopy: { marginTop: 3, fontSize: 10, lineHeight: 15, color: "#376B61" },
  reviewPreview: { marginTop: 18 },
  bottomBar: { minHeight: 72, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: waColors.border, backgroundColor: waColors.surface },
  bottomInfo: { flex: 1, minWidth: 0 },
  bottomPrimary: { fontSize: 13, fontWeight: "800", color: waColors.text },
  bottomSecondary: { marginTop: 2, fontSize: 9, color: waColors.textMuted },
  continueButtonContent: { height: 40, paddingHorizontal: 8 },
  dialog: { backgroundColor: waColors.surface },
  dialogCopy: { marginBottom: 12, fontSize: 11, lineHeight: 16, color: waColors.textSecondary },
  dialogInput: { marginBottom: 10 },
});
