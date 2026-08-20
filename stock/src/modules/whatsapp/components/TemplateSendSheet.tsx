import { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ActivityIndicator, Button, Searchbar, Text, TextInput } from "react-native-paper";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDocumentAsync } from "expo-document-picker";
import { requestMediaLibraryPermissionsAsync, launchImageLibraryAsync } from "expo-image-picker";
import { requestForegroundPermissionsAsync, getCurrentPositionAsync, Accuracy } from "expo-location";

import {
  fetchWaTemplates,
  sendWaTemplate,
  uploadWaMedia,
  type WaTemplate,
  type WaTemplateDefinition,
  type WaTemplateMapping,
} from "../../../api/whatsapp.api";
import { useAuthStore } from "../../../auth/auth-store";
import { AppBottomSheetModal } from "../../../components/overlays/AppBottomSheetModal";
import { colors, fontSize, fontWeight, radius, spacing } from "../../../theme";
import { triggerLightHaptic } from "../../../utils/haptics";
import { WhatsAppTemplatePreview } from "./WhatsAppTemplatePreview";

const EMPTY_LOCATION = { latitude: "", longitude: "", name: "", address: "" };

type Props = {
  visible: boolean;
  shopId?: string | null;
  integrationId: string;
  conversationId: string;
  to: string;
  replyToMessageId?: string;
  onClose: () => void;
};

type CardInput = {
  assetId?: string;
  assetName?: string;
  catalogId?: string;
  productRetailerId?: string;
};

function mappingTitle(mapping: WaTemplateMapping) {
  if (mapping.component === "HEADER") return `Header {{${mapping.position}}}`;
  if (mapping.component === "BODY") return `Message {{${mapping.position}}}`;
  if (mapping.component === "BUTTON") return `Button ${(mapping.buttonIndex ?? 0) + 1} {{${mapping.position}}}`;
  return `Card ${(mapping.cardIndex ?? 0) + 1} {{${mapping.position}}}`;
}

function mappingDefaultLabel(mapping: WaTemplateMapping) {
  if (mapping.attribute?.label) return mapping.attribute.label;
  if (mapping.fallbackValue || mapping.attribute?.fallbackValue) return "Template fallback";
  return "Enter for this send";
}

function mappingsReady(template: WaTemplate, values: Record<string, string>) {
  return template.variableMappings.every((mapping) => {
    if (!mapping.required) return true;
    return Boolean(
      values[mapping.id]?.trim()
      || mapping.attributeId
      || mapping.fallbackValue?.trim()
      || mapping.attribute?.fallbackValue?.trim(),
    );
  });
}

function previewDefinition(template: WaTemplate, values: Record<string, string>): Partial<WaTemplateDefinition> {
  const base = template.draftDefinition || {
    name: template.name,
    language: template.language,
    category: template.category,
    body: {
      text: template.components?.find((component: any) => String(component?.type).toUpperCase() === "BODY")?.text || "",
    },
  };

  return {
    ...base,
    mappings: template.variableMappings.map((mapping) => ({
      component: mapping.component,
      position: mapping.position,
      buttonIndex: mapping.buttonIndex,
      cardIndex: mapping.cardIndex,
      sampleValue: values[mapping.id]?.trim()
        || mapping.fallbackValue
        || mapping.attribute?.fallbackValue
        || mapping.sampleValue,
      required: mapping.required,
    })),
  };
}

export function TemplateSendSheet({
  visible,
  shopId,
  integrationId,
  conversationId,
  to,
  replyToMessageId,
  onClose,
}: Props) {
  const token = useAuthStore((state) => state.token) || "";
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<WaTemplate | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [cards, setCards] = useState<CardInput[]>([]);
  const [uploadingCard, setUploadingCard] = useState<number | null>(null);
  const [headerAsset, setHeaderAsset] = useState<{ assetId?: string; assetName?: string }>({});
  const [headerLocation, setHeaderLocation] = useState(EMPTY_LOCATION);
  const [uploadingHeader, setUploadingHeader] = useState(false);
  const [locating, setLocating] = useState(false);

  const query = useQuery({
    queryKey: ["wa-template-send", shopId, search],
    enabled: Boolean(visible && shopId),
    queryFn: () => fetchWaTemplates(token, shopId!, {
      status: "APPROVED",
      search: search.trim() || undefined,
      pageSize: 100,
    }),
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });

  const sendReady = useMemo(() => Boolean(
    selected
    && mappingsReady(selected, values)
    && templateHeaderReady(selected, headerAsset, headerLocation)
    && carouselCardsReady(selected, cards),
  ), [cards, headerAsset, headerLocation, selected, values]);

  const close = () => {
    setSelected(null);
    setValues({});
    setCards([]);
    setHeaderAsset({});
    setHeaderLocation(EMPTY_LOCATION);
    setSearch("");
    onClose();
  };

  const sendMutation = useMutation({
    mutationFn: () => sendWaTemplate(token, selected!.id, {
      shopId: shopId!,
      conversationId,
      to,
      values: Object.fromEntries(
        Object.entries(values).filter(([, value]) => value.trim().length > 0),
      ),
      header: {
        ...(headerAsset.assetId ? { assetId: headerAsset.assetId } : {}),
        ...(headerLocation.latitude && headerLocation.longitude
          ? {
              location: {
                latitude: Number(headerLocation.latitude),
                longitude: Number(headerLocation.longitude),
                name: headerLocation.name || undefined,
                address: headerLocation.address || undefined,
              },
            }
          : {}),
      },
      cards: cards.map(({ assetName: _assetName, ...card }) => card),
      replyToMessageId,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "messages", shopId, integrationId, conversationId] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "conversations", shopId, integrationId] });
      close();
    },
    onError: (error) => Alert.alert("Template not sent", error.message),
  });

  const selectTemplate = (template: WaTemplate) => {
    triggerLightHaptic();
    setSelected(template);
    setValues({});
    setHeaderAsset({});
    setHeaderLocation(EMPTY_LOCATION);
    const carousel = getCarouselDefinition(template);
    setCards(carousel?.cards.map(() => ({})) || []);
  };

  const pickHeaderMedia = async (format: "IMAGE" | "VIDEO" | "DOCUMENT") => {
    try {
      let media;
      if (format === "DOCUMENT") {
        const result = await getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
        if (result.canceled) return;
        const asset = result.assets[0];
        media = {
          kind: "document" as const,
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType || "application/octet-stream",
          size: asset.size,
        };
      } else {
        const permission = await requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert("Photo access required", "Allow photo library access to select template media.");
          return;
        }
        const kind: "image" | "video" = format === "VIDEO" ? "video" : "image";
        const result = await launchImageLibraryAsync({
          mediaTypes: [kind === "image" ? "images" : "videos"],
          allowsMultipleSelection: false,
          quality: 1,
        });
        if (result.canceled) return;
        const asset = result.assets[0];
        media = {
          kind,
          uri: asset.uri,
          name: asset.fileName || `template-header.${kind === "image" ? "jpg" : "mp4"}`,
          mimeType: asset.mimeType || (kind === "image" ? "image/jpeg" : "video/mp4"),
          size: asset.fileSize,
          width: asset.width,
          height: asset.height,
          durationMs: asset.duration ? Math.round(asset.duration) : undefined,
        };
      }

      setUploadingHeader(true);
      if (!shopId) throw new Error("Select a shop before uploading media.");
      const uploaded = await uploadWaMedia(token, shopId, integrationId, media);
      setHeaderAsset({ assetId: uploaded.id, assetName: uploaded.fileName || "Template header media" });
    } catch (error) {
      Alert.alert("Header upload failed", error instanceof Error ? error.message : "Could not upload media.");
    } finally {
      setUploadingHeader(false);
    }
  };

  const useCurrentLocation = async () => {
    try {
      setLocating(true);
      const permission = await requestForegroundPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Location required", "Allow location access to use your current position.");
        return;
      }
      const result = await getCurrentPositionAsync({ accuracy: Accuracy.Balanced });
      setHeaderLocation((current) => ({
        ...current,
        latitude: String(result.coords.latitude),
        longitude: String(result.coords.longitude),
      }));
    } catch (error) {
      Alert.alert("Location unavailable", error instanceof Error ? error.message : "Could not determine location.");
    } finally {
      setLocating(false);
    }
  };

  const pickCarouselMedia = async (cardIndex: number, format: "IMAGE" | "VIDEO") => {
    try {
      const permission = await requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Photo access required", "Allow photo library access to select carousel media.");
        return;
      }
      const kind = format === "VIDEO" ? "video" : "image";
      const result = await launchImageLibraryAsync({
        mediaTypes: [kind === "image" ? "images" : "videos"],
        allowsMultipleSelection: false,
        quality: 1,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      setUploadingCard(cardIndex);
      if (!shopId) throw new Error("Select a shop before uploading media.");
      const uploaded = await uploadWaMedia(token, shopId, integrationId, {
        kind,
        uri: asset.uri,
        name: asset.fileName || `carousel-${cardIndex + 1}.${kind === "image" ? "jpg" : "mp4"}`,
        mimeType: asset.mimeType || (kind === "image" ? "image/jpeg" : "video/mp4"),
        size: asset.fileSize,
        width: asset.width,
        height: asset.height,
        durationMs: asset.duration ? Math.round(asset.duration) : undefined,
      });
      setCards((current) => current.map((card, index) => (
        index === cardIndex
          ? { ...card, assetId: uploaded.id, assetName: uploaded.fileName || `Card ${cardIndex + 1} media` }
          : card
      )));
    } catch (error) {
      Alert.alert("Carousel upload failed", error instanceof Error ? error.message : "Could not upload media.");
    } finally {
      setUploadingCard(null);
    }
  };

  return (
    <AppBottomSheetModal
      visible={visible}
      title={selected?.name || "Send template"}
      subtitle={selected
        ? `${selected.language} · ${selected.category.toLowerCase()} · values for this message`
        : "Choose an approved WhatsApp template"}
      onDismiss={close}
      onBack={selected ? () => {
        setSelected(null);
        setValues({});
        setCards([]);
        setHeaderAsset({});
        setHeaderLocation(EMPTY_LOCATION);
      } : undefined}
      backAccessibilityLabel="Back to templates"
      isBusy={sendMutation.isPending || uploadingHeader || uploadingCard != null}
      maxHeight={0.94}
      scrollable
    >
      {selected ? (
        <View style={styles.content}>
          <WhatsAppTemplatePreview definition={previewDefinition(selected, values)} />

          {selected.variableMappings.length ? (
            <View style={styles.runtimeIntro}>
              <Text style={styles.eyebrow}>VALUES FOR THIS MESSAGE</Text>
              <Text style={styles.runtimeTitle}>Use the saved default or override it now.</Text>
              <Text style={styles.runtimeCopy}>
                A saved customer/shop attribute resolves automatically. Enter a value only when this particular message should use something different.
              </Text>
            </View>
          ) : null}

          {selected.variableMappings.map((mapping) => {
            const explicit = values[mapping.id] || "";
            const hasDefault = Boolean(
              mapping.attributeId
              || mapping.fallbackValue?.trim()
              || mapping.attribute?.fallbackValue?.trim(),
            );
            return (
              <View key={mapping.id} style={styles.valueRow}>
                <View style={styles.variableBadge}>
                  <Text style={styles.variableText}>{`{{${mapping.position}}}`}</Text>
                </View>
                <View style={styles.valueBody}>
                  <View style={styles.valueTopline}>
                    <Text style={styles.valueTitle}>{mappingTitle(mapping)}</Text>
                    <Text style={[styles.defaultState, !hasDefault && !explicit.trim() && styles.requiredState]}>
                      {explicit.trim() ? "OVERRIDE" : hasDefault ? "AUTO" : "REQUIRED"}
                    </Text>
                  </View>
                  <Text style={styles.defaultLabel} numberOfLines={1}>
                    {explicit.trim()
                      ? `This send · ${explicit}`
                      : mapping.attribute?.label
                        ? `Auto · ${mapping.attribute.label}`
                        : mapping.fallbackValue || mapping.attribute?.fallbackValue
                          ? `Fallback · ${mapping.fallbackValue || mapping.attribute?.fallbackValue}`
                          : mappingDefaultLabel(mapping)}
                  </Text>
                  <TextInput
                    mode="flat"
                    value={explicit}
                    placeholder={hasDefault
                      ? "Override for this send (optional)"
                      : mapping.sampleValue || "Enter value for this send"}
                    onChangeText={(value) => setValues((current) => ({ ...current, [mapping.id]: value }))}
                    style={styles.runtimeInput}
                    underlineColor={colors.borderStrong}
                    activeUnderlineColor={colors.primary}
                  />
                </View>
              </View>
            );
          })}

          {["IMAGE", "VIDEO", "DOCUMENT"].includes(getHeaderFormat(selected)) ? (
            <View style={styles.section}>
              <Text style={styles.eyebrow}>MEDIA FOR THIS MESSAGE</Text>
              <Pressable
                onPress={() => pickHeaderMedia(getHeaderFormat(selected) as "IMAGE" | "VIDEO" | "DOCUMENT")}
                disabled={uploadingHeader}
                style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
              >
                <View style={styles.actionIcon}>
                  <MaterialCommunityIcons
                    name={getHeaderFormat(selected) === "VIDEO"
                      ? "video-outline"
                      : getHeaderFormat(selected) === "DOCUMENT"
                        ? "file-document-outline"
                        : "image-outline"}
                    size={21}
                    color={colors.primary}
                  />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.actionTitle}>{headerAsset.assetName || `Choose ${getHeaderFormat(selected).toLowerCase()}`}</Text>
                  <Text style={styles.actionCopy}>{headerAsset.assetId ? "Ready to send" : "Required by this approved template"}</Text>
                </View>
                {uploadingHeader
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />}
              </Pressable>
            </View>
          ) : null}

          {getHeaderFormat(selected) === "LOCATION" ? (
            <View style={styles.section}>
              <View style={styles.sectionTopline}>
                <Text style={styles.eyebrow}>LOCATION FOR THIS MESSAGE</Text>
                <Button compact icon="crosshairs-gps" loading={locating} onPress={useCurrentLocation}>Current</Button>
              </View>
              <View style={styles.locationRow}>
                <TextInput
                  mode="flat"
                  label="Latitude"
                  keyboardType="numbers-and-punctuation"
                  style={styles.locationCoordinate}
                  value={headerLocation.latitude}
                  onChangeText={(latitude) => setHeaderLocation((current) => ({ ...current, latitude }))}
                />
                <TextInput
                  mode="flat"
                  label="Longitude"
                  keyboardType="numbers-and-punctuation"
                  style={styles.locationCoordinate}
                  value={headerLocation.longitude}
                  onChangeText={(longitude) => setHeaderLocation((current) => ({ ...current, longitude }))}
                />
              </View>
              <TextInput mode="flat" label="Location name" value={headerLocation.name} onChangeText={(name) => setHeaderLocation((current) => ({ ...current, name }))} />
              <TextInput mode="flat" label="Address" value={headerLocation.address} onChangeText={(address) => setHeaderLocation((current) => ({ ...current, address }))} />
            </View>
          ) : null}

          {getCarouselDefinition(selected) ? (
            <View style={styles.section}>
              <Text style={styles.eyebrow}>CAROUSEL FOR THIS MESSAGE</Text>
              {getCarouselDefinition(selected)!.cards.map((cardDefinition, cardIndex) => (
                <View key={cardIndex} style={styles.carouselRow}>
                  <Text style={styles.cardNumber}>{cardIndex + 1}</Text>
                  <View style={styles.flex}>
                    <Text style={styles.actionTitle}>Card {cardIndex + 1}</Text>
                    {cardDefinition.header.format === "PRODUCT" ? (
                      <>
                        <TextInput
                          mode="flat"
                          label="Catalog ID"
                          value={cards[cardIndex]?.catalogId || ""}
                          onChangeText={(catalogId) => setCards((current) => current.map((card, index) => index === cardIndex ? { ...card, catalogId } : card))}
                        />
                        <TextInput
                          mode="flat"
                          label="Product retailer ID"
                          value={cards[cardIndex]?.productRetailerId || ""}
                          onChangeText={(productRetailerId) => setCards((current) => current.map((card, index) => index === cardIndex ? { ...card, productRetailerId } : card))}
                        />
                      </>
                    ) : (
                      <Pressable
                        onPress={() => pickCarouselMedia(cardIndex, cardDefinition.header.format as "IMAGE" | "VIDEO")}
                        disabled={uploadingCard != null}
                        style={({ pressed }) => [styles.smallAction, pressed && styles.pressed]}
                      >
                        <MaterialCommunityIcons name={cardDefinition.header.format === "VIDEO" ? "video-plus-outline" : "image-plus"} size={18} color={colors.primary} />
                        <Text style={styles.smallActionText}>{cards[cardIndex]?.assetName || `Choose ${cardDefinition.header.format.toLowerCase()}`}</Text>
                        {uploadingCard === cardIndex ? <ActivityIndicator size="small" color={colors.primary} /> : null}
                      </Pressable>
                    )}
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {!sendReady ? (
            <View style={styles.notice}>
              <MaterialCommunityIcons name="information-outline" size={20} color={colors.warning} />
              <Text style={styles.noticeText}>
                Fill only the values or media this message still needs. Saved template attributes resolve automatically on the server.
              </Text>
            </View>
          ) : null}

          <Button
            mode="contained"
            icon="send"
            loading={sendMutation.isPending}
            disabled={!sendReady || sendMutation.isPending}
            onPress={() => sendMutation.mutate()}
            style={styles.send}
            contentStyle={styles.sendContent}
          >
            Send template
          </Button>
        </View>
      ) : (
        <View style={styles.browser}>
          <View style={styles.browserHeader}>
            <Text style={styles.eyebrow}>APPROVED TEMPLATES</Text>
            <Text style={styles.browserTitle}>Choose the message, then fill what changes.</Text>
            <Text style={styles.browserCopy}>Templates are reusable structure. Runtime values and media are supplied after you choose one.</Text>
          </View>
          <Searchbar value={search} onChangeText={setSearch} placeholder="Search approved templates" style={styles.search} inputStyle={styles.searchInput} />
          {query.isLoading ? (
            <ActivityIndicator style={styles.loader} color={colors.primary} />
          ) : (
            <View style={styles.list}>
              {(query.data?.data || []).map((template) => (
                <Pressable key={template.id} onPress={() => selectTemplate(template)} style={({ pressed }) => [styles.templateRow, pressed && styles.pressed]}>
                  <View style={styles.templateIcon}>
                    <MaterialCommunityIcons name="message-text-outline" size={21} color={colors.primaryDark} />
                  </View>
                  <View style={styles.templateBody}>
                    <View style={styles.templateTopline}>
                      <Text style={styles.templateName} numberOfLines={1}>{template.name}</Text>
                      <Text style={styles.approved}>APPROVED</Text>
                    </View>
                    <Text style={styles.templatePreview} numberOfLines={2}>
                      {template.draftDefinition?.body?.text || template.components?.find((component: any) => String(component.type).toUpperCase() === "BODY")?.text || template.category}
                    </Text>
                    <Text style={styles.templateMeta}>
                      {template.language} · {template.variableMappings.length} variables · {template.mappingStatus === "VALID" ? "defaults available" : "fill at send"}
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={21} color={colors.textMuted} />
                </Pressable>
              ))}
              {!query.data?.data?.length ? (
                <View style={styles.empty}>
                  <MaterialCommunityIcons name="message-off-outline" size={36} color={colors.textMuted} />
                  <Text style={styles.emptyTitle}>No approved templates</Text>
                  <Text style={styles.emptyCopy}>Create or sync a template first, then return here after Meta approves it.</Text>
                </View>
              ) : null}
            </View>
          )}
        </View>
      )}
    </AppBottomSheetModal>
  );
}

function getCarouselDefinition(template: WaTemplate): WaTemplateDefinition["carousel"] | null {
  if (template.draftDefinition?.carousel) return template.draftDefinition.carousel;
  const carousel = template.components?.find((component: any) => String(component.type).toUpperCase() === "CAROUSEL");
  if (!carousel) return null;
  return {
    type: carousel.cards?.[0]?.components?.find((component: any) => String(component.type).toUpperCase() === "HEADER")?.format === "PRODUCT"
      ? "PRODUCT" as const
      : "MEDIA" as const,
    cards: carousel.cards.map((card: any) => {
      const header = card.components.find((component: any) => String(component.type).toUpperCase() === "HEADER");
      return {
        header: { format: header?.format?.toUpperCase() as "IMAGE" | "VIDEO" | "PRODUCT" },
        buttons: [],
      };
    }),
  };
}

function getHeaderFormat(template: WaTemplate) {
  return String(
    template.draftDefinition?.header?.format
    || template.components?.find((component: any) => String(component.type).toUpperCase() === "HEADER")?.format
    || "NONE",
  ).toUpperCase();
}

function templateHeaderReady(
  template: WaTemplate,
  headerAsset: { assetId?: string },
  location: { latitude: string; longitude: string },
) {
  const format = getHeaderFormat(template);
  if (["IMAGE", "VIDEO", "DOCUMENT"].includes(format)) return Boolean(headerAsset.assetId);
  if (format === "LOCATION") {
    const latitude = Number(location.latitude);
    const longitude = Number(location.longitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude)
      && latitude >= -90 && latitude <= 90
      && longitude >= -180 && longitude <= 180;
  }
  return true;
}

function carouselCardsReady(template: WaTemplate, cards: CardInput[]) {
  const definition = getCarouselDefinition(template);
  if (!definition) return true;
  return definition.cards.every((card, index) => (
    card.header.format === "PRODUCT"
      ? Boolean(cards[index]?.catalogId && cards[index]?.productRetailerId)
      : Boolean(cards[index]?.assetId)
  ));
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  browser: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  browserHeader: { paddingTop: spacing.xs, paddingBottom: spacing.md },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: fontWeight.black, letterSpacing: 1 },
  browserTitle: { marginTop: 5, color: colors.textPrimary, fontSize: fontSize.lg, lineHeight: 23, fontWeight: fontWeight.extrabold },
  browserCopy: { marginTop: 4, color: colors.textSecondary, fontSize: fontSize.xs, lineHeight: 18 },
  search: { height: 44, borderRadius: 22, backgroundColor: colors.surfaceOffset },
  searchInput: { minHeight: 44, fontSize: fontSize.sm },
  loader: { height: 180, justifyContent: "center" },
  list: { paddingTop: spacing.sm },
  templateRow: { minHeight: 92, flexDirection: "row", alignItems: "flex-start", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  templateIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryLight },
  templateBody: { flex: 1, minWidth: 0 },
  templateTopline: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  templateName: { flex: 1, color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.extrabold },
  approved: { color: colors.success, fontSize: 9, fontWeight: fontWeight.black },
  templatePreview: { marginTop: 4, color: colors.textSecondary, fontSize: fontSize.xs, lineHeight: 17 },
  templateMeta: { marginTop: 4, color: colors.textMuted, fontSize: 10 },
  runtimeIntro: { paddingTop: spacing.xl, paddingBottom: spacing.sm },
  runtimeTitle: { marginTop: 4, color: colors.textPrimary, fontSize: fontSize.md, fontWeight: fontWeight.extrabold },
  runtimeCopy: { marginTop: 4, color: colors.textSecondary, fontSize: fontSize.xs, lineHeight: 18 },
  valueRow: { minHeight: 88, flexDirection: "row", alignItems: "flex-start", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  variableBadge: { minWidth: 44, height: 31, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryLight, marginTop: 6 },
  variableText: { color: colors.primaryDark, fontSize: fontSize.xs, fontWeight: fontWeight.black },
  valueBody: { flex: 1, minWidth: 0 },
  valueTopline: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  valueTitle: { flex: 1, color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  defaultState: { color: colors.primary, fontSize: 9, fontWeight: fontWeight.black },
  requiredState: { color: colors.warning },
  defaultLabel: { marginTop: 2, color: colors.textSecondary, fontSize: fontSize.xs },
  runtimeInput: { marginTop: 1, backgroundColor: "transparent", paddingHorizontal: 0 },
  section: { marginTop: spacing.xxl },
  sectionTopline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  actionRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  actionIcon: { width: 39, height: 39, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryLight },
  actionTitle: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  actionCopy: { marginTop: 2, color: colors.textSecondary, fontSize: fontSize.xs },
  locationRow: { flexDirection: "row", gap: spacing.sm },
  locationCoordinate: { flex: 1 },
  carouselRow: { minHeight: 74, flexDirection: "row", alignItems: "flex-start", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  cardNumber: { width: 30, height: 30, borderRadius: 15, textAlign: "center", textAlignVertical: "center", color: colors.primaryDark, backgroundColor: colors.primaryLight, fontSize: fontSize.xs, fontWeight: fontWeight.black },
  smallAction: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  smallActionText: { flex: 1, color: colors.primaryDark, fontSize: fontSize.xs, fontWeight: fontWeight.bold },
  notice: { marginTop: spacing.xl, flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingVertical: spacing.md },
  noticeText: { flex: 1, color: colors.textSecondary, fontSize: fontSize.xs, lineHeight: 18 },
  send: { marginTop: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.primary },
  sendContent: { minHeight: 48 },
  pressed: { opacity: 0.68 },
  empty: { paddingVertical: 56, alignItems: "center", paddingHorizontal: 24 },
  emptyTitle: { marginTop: spacing.md, color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  emptyCopy: { marginTop: 4, color: colors.textSecondary, fontSize: fontSize.xs, lineHeight: 18, textAlign: "center" },
});
