import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, IconButton, Searchbar, Text, TextInput } from "react-native-paper";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import {
  fetchWaTemplates,
  sendWaTemplate,
  uploadWaMedia,
  WaTemplate,
  WaTemplateDefinition,
} from "../../../api/whatsapp.api";
import { useAuthStore } from "../../../auth/auth-store";
import { WhatsAppTemplatePreview } from "./WhatsAppTemplatePreview";
import { waColors } from "../whatsapp-ui";

type Props = {
  visible: boolean;
  shopId?: string | null;
  integrationId: string;
  conversationId: string;
  to: string;
  replyToMessageId?: string;
  onClose: () => void;
};

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
  const [cards, setCards] = useState<Array<{
    assetId?: string;
    assetName?: string;
    catalogId?: string;
    productRetailerId?: string;
  }>>([]);
  const [uploadingCard, setUploadingCard] = useState<number | null>(null);
  const [headerAsset, setHeaderAsset] = useState<{ assetId?: string; assetName?: string }>({});
  const [headerLocation, setHeaderLocation] = useState({
    latitude: "",
    longitude: "",
    name: "",
    address: "",
  });
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
  });

  const sendMutation = useMutation({
    mutationFn: () => sendWaTemplate(token, selected!.id, {
      shopId: shopId!,
      conversationId,
      to,
      values,
      header: {
        ...(headerAsset.assetId ? { assetId: headerAsset.assetId } : {}),
        ...(headerLocation.latitude && headerLocation.longitude ? {
          location: {
            latitude: Number(headerLocation.latitude),
            longitude: Number(headerLocation.longitude),
            name: headerLocation.name || undefined,
            address: headerLocation.address || undefined,
          },
        } : {}),
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

  const close = () => {
    setSelected(null);
    setValues({});
    setCards([]);
    setHeaderAsset({});
    setHeaderLocation({ latitude: "", longitude: "", name: "", address: "" });
    setSearch("");
    onClose();
  };

  const selectTemplate = (template: WaTemplate) => {
    setSelected(template);
    setHeaderAsset({});
    setHeaderLocation({ latitude: "", longitude: "", name: "", address: "" });
    const carousel = getCarouselDefinition(template);
    setCards(carousel?.cards.map(() => ({})) || []);
  };

  const pickHeaderMedia = async (format: "IMAGE" | "VIDEO" | "DOCUMENT") => {
    try {
      let media;
      if (format === "DOCUMENT") {
        const result = await DocumentPicker.getDocumentAsync({
          copyToCacheDirectory: true,
          multiple: false,
        });
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
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert("Photo access required", "Allow photo library access to select template media.");
          return;
        }
        const kind: "image" | "video" = format === "VIDEO" ? "video" : "image";
        const result = await ImagePicker.launchImageLibraryAsync({
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
      const uploaded = await uploadWaMedia(token, integrationId, media);
      setHeaderAsset({
        assetId: uploaded.id,
        assetName: uploaded.fileName || "Template header media",
      });
    } catch (error) {
      Alert.alert("Header upload failed", error instanceof Error ? error.message : "Could not upload media.");
    } finally {
      setUploadingHeader(false);
    }
  };

  const useCurrentLocation = async () => {
    try {
      setLocating(true);
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Location required", "Allow location access to use your current position.");
        return;
      }
      const result = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
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
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Photo access required", "Allow photo library access to select carousel media.");
        return;
      }
      const kind = format === "VIDEO" ? "video" : "image";
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: [kind === "image" ? "images" : "videos"],
        allowsMultipleSelection: false,
        quality: 1,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      setUploadingCard(cardIndex);
      const uploaded = await uploadWaMedia(token, integrationId, {
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.overlay}>
        <Pressable style={styles.dismiss} onPress={close} />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            {selected ? (
              <IconButton icon="arrow-left" onPress={() => { setSelected(null); setValues({}); }} />
            ) : <View style={styles.headerSpacer} />}
            <Text variant="titleMedium" style={styles.title}>
              {selected ? selected.name : "Message template"}
            </Text>
            <IconButton icon="close" onPress={close} />
          </View>

          {selected ? (
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <WhatsAppTemplatePreview definition={selected.draftDefinition || {
                name: selected.name,
                language: selected.language,
                category: selected.category,
                body: { text: selected.components?.find((component: any) => component.type === "BODY")?.text || "" },
                mappings: selected.variableMappings,
              }} />
              {["IMAGE", "VIDEO", "DOCUMENT"].includes(getHeaderFormat(selected) || "") && (
                <View style={styles.mapping}>
                  <Text style={styles.mappingTitle}>Header media</Text>
                  <Button
                    mode="outlined"
                    icon="paperclip"
                    loading={uploadingHeader}
                    disabled={uploadingHeader}
                    onPress={() => pickHeaderMedia(getHeaderFormat(selected) as "IMAGE" | "VIDEO" | "DOCUMENT")}
                  >
                    {headerAsset.assetName || `Choose ${getHeaderFormat(selected)?.toLowerCase()}`}
                  </Button>
                </View>
              )}
              {getHeaderFormat(selected) === "LOCATION" && (
                <View style={styles.mapping}>
                  <View style={styles.mappingHeader}>
                    <Text style={styles.mappingTitle}>Location header</Text>
                    <Button compact icon="crosshairs-gps" loading={locating} onPress={useCurrentLocation}>
                      Current
                    </Button>
                  </View>
                  <View style={styles.locationRow}>
                    <TextInput
                      mode="outlined"
                      label="Latitude"
                      keyboardType="numbers-and-punctuation"
                      style={styles.locationCoordinate}
                      value={headerLocation.latitude}
                      onChangeText={(latitude) => setHeaderLocation((current) => ({ ...current, latitude }))}
                    />
                    <TextInput
                      mode="outlined"
                      label="Longitude"
                      keyboardType="numbers-and-punctuation"
                      style={styles.locationCoordinate}
                      value={headerLocation.longitude}
                      onChangeText={(longitude) => setHeaderLocation((current) => ({ ...current, longitude }))}
                    />
                  </View>
                  <TextInput
                    mode="outlined"
                    label="Location name"
                    value={headerLocation.name}
                    onChangeText={(name) => setHeaderLocation((current) => ({ ...current, name }))}
                  />
                  <TextInput
                    mode="outlined"
                    label="Address"
                    value={headerLocation.address}
                    onChangeText={(address) => setHeaderLocation((current) => ({ ...current, address }))}
                  />
                </View>
              )}
              {selected.variableMappings.map((mapping) => (
                <View key={mapping.id} style={styles.mapping}>
                  <View style={styles.mappingHeader}>
                    <Text style={styles.mappingTitle}>
                      {mapping.component} {"{{"}{mapping.position}{"}}"}
                    </Text>
                    <Text style={styles.attribute}>
                      {mapping.attribute?.label || "Manual value"}
                    </Text>
                  </View>
                  <TextInput
                    mode="outlined"
                    label="Override value (optional)"
                    value={values[mapping.id] || ""}
                    placeholder={mapping.fallbackValue || mapping.attribute?.fallbackValue || mapping.sampleValue}
                    onChangeText={(value) => setValues((current) => ({ ...current, [mapping.id]: value }))}
                  />
                </View>
              ))}
              {!!getCarouselDefinition(selected) && (
                <View style={styles.carouselInputs}>
                  <Text style={styles.carouselTitle}>Carousel content</Text>
                  {getCarouselDefinition(selected)!.cards.map((cardDefinition, cardIndex) => (
                    <View key={cardIndex} style={styles.cardInput}>
                      <Text style={styles.cardTitle}>Card {cardIndex + 1}</Text>
                      {cardDefinition.header.format === "PRODUCT" ? (
                        <>
                          <TextInput
                            mode="outlined"
                            label="Catalog ID"
                            value={cards[cardIndex]?.catalogId || ""}
                            onChangeText={(catalogId) => setCards((current) => current.map((card, index) => (
                              index === cardIndex ? { ...card, catalogId } : card
                            )))}
                          />
                          <TextInput
                            mode="outlined"
                            label="Product retailer ID"
                            value={cards[cardIndex]?.productRetailerId || ""}
                            onChangeText={(productRetailerId) => setCards((current) => current.map((card, index) => (
                              index === cardIndex ? { ...card, productRetailerId } : card
                            )))}
                          />
                        </>
                      ) : (
                        <Button
                          mode="outlined"
                          icon={cardDefinition.header.format === "VIDEO" ? "video-plus-outline" : "image-plus"}
                          loading={uploadingCard === cardIndex}
                          disabled={uploadingCard != null}
                          onPress={() => pickCarouselMedia(cardIndex, cardDefinition.header.format as "IMAGE" | "VIDEO")}
                        >
                          {cards[cardIndex]?.assetName || `Choose ${cardDefinition.header.format.toLowerCase()}`}
                        </Button>
                      )}
                    </View>
                  ))}
                </View>
              )}
              <Button
                mode="contained"
                icon="send"
                loading={sendMutation.isPending}
                disabled={
                  sendMutation.isPending
                  || selected.mappingStatus !== "VALID"
                  || !templateHeaderReady(selected, headerAsset, headerLocation)
                  || !carouselCardsReady(selected, cards)
                }
                onPress={() => sendMutation.mutate()}
                style={styles.send}
              >
                Send template
              </Button>
              {selected.mappingStatus !== "VALID" && (
                <Text style={styles.warning}>Complete this template’s attribute mappings before sending.</Text>
              )}
            </ScrollView>
          ) : (
            <>
              <Searchbar
                value={search}
                onChangeText={setSearch}
                placeholder="Search approved templates"
                style={styles.search}
              />
              {query.isLoading ? (
                <ActivityIndicator style={styles.loader} color={waColors.green} />
              ) : (
                <ScrollView contentContainerStyle={styles.list}>
                  {(query.data?.data || []).map((template) => (
                    <Pressable
                      key={template.id}
                      onPress={() => selectTemplate(template)}
                      style={styles.templateRow}
                    >
                      <View style={styles.templateIcon}>
                        <Text style={styles.templateIconText}>{template.category[0]}</Text>
                      </View>
                      <View style={styles.templateBody}>
                        <Text style={styles.templateName}>{template.name}</Text>
                        <Text style={styles.templatePreview} numberOfLines={2}>
                          {template.components?.find((component: any) => component.type === "BODY")?.text || template.category}
                        </Text>
                        <Text style={template.mappingStatus === "VALID" ? styles.ready : styles.warning}>
                          {template.language} · {template.mappingStatus === "VALID" ? "Ready" : "Mapping incomplete"}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function getCarouselDefinition(template: WaTemplate): WaTemplateDefinition["carousel"] | null {
  if (template.draftDefinition?.carousel) return template.draftDefinition.carousel;
  const carousel = template.components?.find((component: any) => component.type?.toUpperCase() === "CAROUSEL");
  if (!carousel) return null;
  return {
    type: carousel.cards?.[0]?.components?.find((component: any) => component.type?.toUpperCase() === "HEADER")?.format === "PRODUCT"
      ? "PRODUCT" as const
      : "MEDIA" as const,
    cards: carousel.cards.map((card: any) => {
      const header = card.components.find((component: any) => component.type?.toUpperCase() === "HEADER");
      return {
        header: { format: header?.format?.toUpperCase() as "IMAGE" | "VIDEO" | "PRODUCT" },
        buttons: [],
      };
    }),
  };
}

function getHeaderFormat(template: WaTemplate) {
  return template.draftDefinition?.header?.format
    || template.components?.find((component: any) => component.type?.toUpperCase() === "HEADER")?.format?.toUpperCase()
    || "NONE";
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

function carouselCardsReady(template: WaTemplate, cards: Array<{
  assetId?: string;
  catalogId?: string;
  productRetailerId?: string;
}>) {
  const definition = getCarouselDefinition(template);
  if (!definition) return true;
  return definition.cards.every((card: NonNullable<WaTemplateDefinition["carousel"]>["cards"][number], index: number) => (
    card.header.format === "PRODUCT"
      ? Boolean(cards[index]?.catalogId && cards[index]?.productRetailerId)
      : Boolean(cards[index]?.assetId)
  ));
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.35)" },
  dismiss: { flex: 1 },
  sheet: {
    height: "88%",
    backgroundColor: waColors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  grabber: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#CDD2D5", alignSelf: "center", marginTop: 8 },
  header: { height: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerSpacer: { width: 48 },
  title: { color: waColors.text, fontWeight: "700" },
  search: { marginHorizontal: 12, marginBottom: 8, backgroundColor: waColors.surfaceMuted, borderRadius: 8 },
  loader: { flex: 1 },
  list: { paddingBottom: 30 },
  templateRow: { minHeight: 88, flexDirection: "row", padding: 12 },
  templateIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: waColors.green },
  templateIconText: { color: "#fff", fontWeight: "700", fontSize: 18 },
  templateBody: { flex: 1, marginLeft: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: waColors.border },
  templateName: { color: waColors.text, fontSize: 16, fontWeight: "600" },
  templatePreview: { color: waColors.textSecondary, fontSize: 13, paddingTop: 3 },
  ready: { color: waColors.green, fontSize: 11, paddingTop: 4 },
  warning: { color: "#B7791F", fontSize: 11, paddingTop: 4 },
  content: { padding: 14, gap: 14, paddingBottom: 40 },
  mapping: { gap: 7 },
  mappingHeader: { flexDirection: "row", justifyContent: "space-between" },
  mappingTitle: { color: waColors.greenDark, fontWeight: "700" },
  attribute: { color: waColors.textSecondary, fontSize: 12 },
  send: { backgroundColor: waColors.green },
  carouselInputs: { gap: 10 },
  carouselTitle: { color: waColors.text, fontSize: 14, fontWeight: "700" },
  cardInput: { gap: 8, padding: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: waColors.border, borderRadius: 8 },
  cardTitle: { color: waColors.greenDark, fontSize: 12, fontWeight: "700" },
  locationRow: { flexDirection: "row", gap: 8 },
  locationCoordinate: { flex: 1 },
});
