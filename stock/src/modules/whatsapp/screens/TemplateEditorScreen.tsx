import { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import {
  Button,
  Dialog,
  IconButton,
  Menu,
  Portal,
  SegmentedButtons,
  Switch,
  Text,
  TextInput,
} from "react-native-paper";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import {
  createWaTemplate,
  createWaTemplateAttribute,
  fetchWaTemplate,
  fetchWaTemplateAttributes,
  uploadWaTemplateExample,
  updateWaTemplate,
  WaTemplateAttribute,
  WaTemplateDefinition,
} from "../../../api/whatsapp.api";
import { useAuthStore } from "../../../auth/auth-store";
import { useShopStore } from "../../../auth/shop-store";
import {
  createDefaultCarousel,
  TemplateCarouselEditor,
} from "../components/TemplateCarouselEditor";
import { WhatsAppTemplatePreview } from "../components/WhatsAppTemplatePreview";
import { waColors } from "../whatsapp-ui";

type MappingDraft = NonNullable<WaTemplateDefinition["mappings"]>[number];

const EMPTY_DEFINITION: WaTemplateDefinition = {
  name: "",
  language: "en_US",
  category: "UTILITY",
  parameterFormat: "POSITIONAL",
  header: { format: "NONE", text: "" },
  body: { text: "" },
  footer: { text: "" },
  buttons: [],
  mappings: [],
};

function positions(text = "") {
  return [...new Set([...text.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1])))]
    .sort((a, b) => a - b);
}

export function TemplateEditorScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const templateId = route.params?.templateId as string | undefined;
  const token = useAuthStore((state) => state.token) || "";
  const shopId = useShopStore((state) => state.activeShopId)!;
  const queryClient = useQueryClient();
  const [definition, setDefinition] = useState<WaTemplateDefinition>(EMPTY_DEFINITION);
  const [attributeMenu, setAttributeMenu] = useState<string | null>(null);
  const [attributeDialog, setAttributeDialog] = useState(false);
  const [uploadingExample, setUploadingExample] = useState<"HEADER" | number | null>(null);
  const [newAttribute, setNewAttribute] = useState({
    key: "",
    label: "",
    type: "TEXT" as WaTemplateAttribute["type"],
    source: "CUSTOM" as WaTemplateAttribute["source"],
    sourcePath: "",
    fallbackValue: "",
    description: "",
  });

  const templateQuery = useQuery({
    queryKey: ["wa-template", shopId, templateId],
    enabled: Boolean(templateId),
    queryFn: () => fetchWaTemplate(token, shopId, templateId!),
  });
  const attributesQuery = useQuery({
    queryKey: ["wa-template-attributes", shopId],
    queryFn: () => fetchWaTemplateAttributes(token, shopId),
  });

  useEffect(() => {
    navigation.setOptions({
      title: templateId ? "Edit template" : "New template",
      headerStyle: { backgroundColor: waColors.greenDark },
      headerTintColor: "#fff",
    });
  }, [navigation, templateId]);

  useEffect(() => {
    if (templateQuery.data) {
      const data = templateQuery.data.draftDefinition || fromComponents(templateQuery.data);
      setDefinition({
        ...EMPTY_DEFINITION,
        ...data,
        mappings: templateQuery.data.variableMappings.map((mapping) => ({
          component: mapping.component,
          position: mapping.position,
          buttonIndex: mapping.buttonIndex,
          cardIndex: mapping.cardIndex,
          attributeId: mapping.attributeId,
          sampleValue: mapping.sampleValue,
          fallbackValue: mapping.fallbackValue,
          required: mapping.required,
        })),
      });
    }
  }, [templateQuery.data]);

  const requiredVariables = useMemo(() => [
    ...positions(definition.header?.text).map((position) => ({ component: "HEADER" as const, position })),
    ...positions(definition.body.text).map((position) => ({ component: "BODY" as const, position })),
    ...(definition.buttons || []).flatMap((button, buttonIndex) => (
      button.type === "URL"
        ? positions(button.url).map((position) => ({ component: "BUTTON" as const, position, buttonIndex }))
        : []
    )),
    ...(definition.carousel?.cards || []).flatMap((card, cardIndex) => [
      ...positions(card.body?.text).map((position) => ({
        component: "CARD" as const,
        position,
        cardIndex,
      })),
      ...card.buttons.flatMap((button, buttonIndex) => (
        button.type === "URL"
          ? positions(button.url).map((position) => ({
              component: "CARD" as const,
              position,
              cardIndex,
              buttonIndex,
            }))
          : []
      )),
    ]),
  ], [definition.header?.text, definition.body.text, definition.buttons, definition.carousel]);

  useEffect(() => {
    setDefinition((current) => {
      const nextMappings = requiredVariables.map((required) => {
        return current.mappings?.find(
          (mapping) => mapping.component === required.component
            && mapping.position === required.position
            && mapping.buttonIndex === ("buttonIndex" in required ? required.buttonIndex : undefined)
            && mapping.cardIndex === ("cardIndex" in required ? required.cardIndex : undefined),
        ) || {
          ...required,
          sampleValue: "",
          fallbackValue: "",
          required: true,
        };
      });
      if (JSON.stringify(nextMappings) === JSON.stringify(current.mappings)) return current;
      return { ...current, mappings: nextMappings };
    });
  }, [requiredVariables]);

  const saveMutation = useMutation({
    mutationFn: () => templateId
      ? updateWaTemplate(token, shopId, templateId, definition)
      : createWaTemplate(token, shopId, definition),
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: ["wa-template-library", shopId] });
      queryClient.invalidateQueries({ queryKey: ["wa-templates", shopId] });
      Alert.alert("Template submitted", `${template.name} is now ${template.status.toLowerCase()}.`, [
        { text: "Done", onPress: () => navigation.goBack() },
      ]);
    },
    onError: (error) => Alert.alert("Template not saved", error.message),
  });

  const attributeMutation = useMutation({
    mutationFn: () => createWaTemplateAttribute(token, shopId, newAttribute),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wa-template-attributes", shopId] });
      setAttributeDialog(false);
      setNewAttribute({
        key: "",
        label: "",
        type: "TEXT",
        source: "CUSTOM",
        sourcePath: "",
        fallbackValue: "",
        description: "",
      });
    },
    onError: (error) => Alert.alert("Attribute not created", error.message),
  });

  const updateMapping = (index: number, patch: Partial<MappingDraft>) => {
    setDefinition((current) => ({
      ...current,
      mappings: current.mappings?.map((mapping, mappingIndex) => (
        mappingIndex === index ? { ...mapping, ...patch } : mapping
      )),
    }));
  };

  const addButton = () => {
    if ((definition.buttons?.length || 0) >= 3) return;
    setDefinition((current) => ({
      ...current,
      buttons: [...(current.buttons || []), { type: "QUICK_REPLY", text: "Reply" }],
    }));
  };

  const updateButton = (index: number, patch: any) => {
    setDefinition((current) => ({
      ...current,
      buttons: current.buttons?.map((button, buttonIndex) => (
        buttonIndex === index ? { ...button, ...patch } as any : button
      )),
    }));
  };

  const pickTemplateExample = async (
    format: "IMAGE" | "VIDEO" | "DOCUMENT",
    cardIndex?: number,
  ) => {
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
          Alert.alert("Photo access required", "Allow photo library access to upload Meta review examples.");
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
          name: asset.fileName || `template-example.${kind === "image" ? "jpg" : "mp4"}`,
          mimeType: asset.mimeType || (kind === "image" ? "image/jpeg" : "video/mp4"),
          size: asset.fileSize,
          width: asset.width,
          height: asset.height,
          durationMs: asset.duration ? Math.round(asset.duration) : undefined,
        };
      }
      setUploadingExample(cardIndex ?? "HEADER");
      const uploaded = await uploadWaTemplateExample(token, shopId, media);
      setDefinition((current) => {
        if (cardIndex == null) {
          return {
            ...current,
            header: { ...current.header!, exampleHandle: uploaded.exampleHandle },
          };
        }
        return {
          ...current,
          carousel: current.carousel ? {
            ...current.carousel,
            cards: current.carousel.cards.map((card, index) => (
              index === cardIndex
                ? { ...card, header: { ...card.header, exampleHandle: uploaded.exampleHandle } }
                : card
            )),
          } : undefined,
        };
      });
    } catch (error) {
      Alert.alert("Example upload failed", error instanceof Error ? error.message : "Could not upload review media.");
    } finally {
      setUploadingExample(null);
    }
  };

  const validationError = validateDefinition(definition);
  const templateMode = definition.callPermissionRequest
    ? "CALL_PERMISSION"
    : definition.carousel
      ? "CAROUSEL"
      : "STANDARD";

  const setTemplateMode = (mode: string) => {
    setDefinition((current) => {
      if (mode === "CALL_PERMISSION") {
        return {
          ...current,
          category: current.category === "AUTHENTICATION" ? "UTILITY" : current.category,
          header: { format: "NONE" },
          buttons: [],
          carousel: undefined,
          callPermissionRequest: true,
          subtype: "CALL_PERMISSION_REQUEST",
        };
      }
      if (mode === "CAROUSEL") {
        return {
          ...current,
          category: "MARKETING",
          header: { format: "NONE" },
          buttons: [],
          carousel: current.carousel || createDefaultCarousel(),
          callPermissionRequest: false,
          subtype: "MEDIA_CAROUSEL",
        };
      }
      return {
        ...current,
        carousel: undefined,
        callPermissionRequest: false,
        subtype: undefined,
      };
    });
  };

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        <Section title="Template">
          <TextInput
            mode="outlined"
            label="Template name"
            value={definition.name}
            disabled={Boolean(templateId)}
            onChangeText={(name) => setDefinition((current) => ({
              ...current,
              name: name.toLowerCase().replace(/[^a-z0-9_]+/g, "_"),
            }))}
          />
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.label}>Category</Text>
              <SegmentedButtons
                value={definition.category}
                onValueChange={(category) => setDefinition((current) => {
                  const nextCategory = category as WaTemplateDefinition["category"];
                  if (nextCategory === "AUTHENTICATION") {
                    return {
                      ...current,
                      category: nextCategory,
                      header: { format: "NONE" },
                      body: { ...current.body, text: "{{1}}" },
                      buttons: [{ type: "COPY_CODE", text: "Copy code" }],
                      authentication: current.authentication || { otpType: "COPY_CODE" },
                      carousel: undefined,
                      callPermissionRequest: false,
                    };
                  }
                  return {
                    ...current,
                    category: nextCategory,
                    authentication: undefined,
                  };
                })}
                buttons={[
                  { value: "MARKETING", label: "Marketing" },
                  { value: "UTILITY", label: "Utility" },
                  { value: "AUTHENTICATION", label: "Auth" },
                ]}
              />
            </View>
          </View>
          <TextInput
            mode="outlined"
            label="Language"
            value={definition.language}
            disabled={Boolean(templateId)}
            onChangeText={(language) => setDefinition((current) => ({ ...current, language }))}
          />
          {definition.category !== "AUTHENTICATION" && (
            <>
              <Text style={styles.label}>Template type</Text>
              <SegmentedButtons
                value={templateMode}
                onValueChange={setTemplateMode}
                buttons={[
                  { value: "STANDARD", label: "Standard" },
                  { value: "CAROUSEL", label: "Carousel" },
                  { value: "CALL_PERMISSION", label: "Call request" },
                ]}
              />
            </>
          )}
        </Section>

        {definition.category === "AUTHENTICATION" ? (
          <Section title="Authentication">
            <SegmentedButtons
              value={definition.authentication?.otpType || "COPY_CODE"}
              onValueChange={(otpType) => setDefinition((current) => ({
                ...current,
                authentication: {
                  ...current.authentication,
                  otpType: otpType as "COPY_CODE" | "ONE_TAP" | "ZERO_TAP",
                },
              }))}
              buttons={[
                { value: "COPY_CODE", label: "Copy" },
                { value: "ONE_TAP", label: "One tap" },
                { value: "ZERO_TAP", label: "Zero tap" },
              ]}
            />
            <View style={styles.switchRow}>
              <Text>Add security recommendation</Text>
              <Switch
                value={definition.body.addSecurityRecommendation || false}
                onValueChange={(value) => setDefinition((current) => ({
                  ...current,
                  body: { ...current.body, text: "{{1}}", addSecurityRecommendation: value },
                }))}
              />
            </View>
            <TextInput
              mode="outlined"
              label="Code expiration minutes"
              keyboardType="number-pad"
              value={String(definition.footer?.codeExpirationMinutes || "")}
              onChangeText={(value) => setDefinition((current) => ({
                ...current,
                footer: { ...current.footer, codeExpirationMinutes: Number(value) || undefined },
              }))}
            />
            {definition.authentication?.otpType !== "COPY_CODE" && (
              <>
                <TextInput
                  mode="outlined"
                  label="Android package name"
                  value={definition.authentication?.packageName || ""}
                  onChangeText={(packageName) => setDefinition((current) => ({
                    ...current,
                    authentication: { ...current.authentication!, packageName },
                  }))}
                />
                <TextInput
                  mode="outlined"
                  label="App signature hash"
                  value={definition.authentication?.signatureHash || ""}
                  onChangeText={(signatureHash) => setDefinition((current) => ({
                    ...current,
                    authentication: { ...current.authentication!, signatureHash },
                  }))}
                />
              </>
            )}
          </Section>
        ) : (
          <>
            {templateMode === "STANDARD" && (
              <Section title="Header">
              <SegmentedButtons
                value={definition.header?.format || "NONE"}
                onValueChange={(format) => setDefinition((current) => ({
                  ...current,
                  header: { ...current.header, format: format as any },
                }))}
                buttons={[
                  { value: "NONE", label: "None" },
                  { value: "TEXT", label: "Text" },
                  { value: "IMAGE", label: "Image" },
                ]}
              />
              <SegmentedButtons
                value={definition.header?.format || "NONE"}
                onValueChange={(format) => setDefinition((current) => ({
                  ...current,
                  header: { ...current.header, format: format as any },
                }))}
                buttons={[
                  { value: "VIDEO", label: "Video" },
                  { value: "DOCUMENT", label: "File" },
                  { value: "LOCATION", label: "Location" },
                ]}
              />
              {definition.header?.format === "TEXT" && (
                <TextInput
                  mode="outlined"
                  label="Header text"
                  value={definition.header.text || ""}
                  maxLength={60}
                  onChangeText={(text) => setDefinition((current) => ({
                    ...current,
                    header: { ...current.header!, text },
                  }))}
                />
              )}
              {definition.header && ["IMAGE", "VIDEO", "DOCUMENT"].includes(definition.header.format) && (
                <>
                  <TextInput
                    mode="outlined"
                    label="Meta example handle"
                    value={definition.header.exampleHandle || ""}
                    onChangeText={(exampleHandle) => setDefinition((current) => ({
                      ...current,
                      header: { ...current.header!, exampleHandle },
                    }))}
                  />
                  <Button
                    mode="outlined"
                    icon="upload"
                    loading={uploadingExample === "HEADER"}
                    disabled={uploadingExample != null}
                    onPress={() => pickTemplateExample(definition.header!.format as "IMAGE" | "VIDEO" | "DOCUMENT")}
                  >
                    Upload review example
                  </Button>
                </>
              )}
              </Section>
            )}

            <Section title="Message">
              <TextInput
                mode="outlined"
                label="Body"
                multiline
                value={definition.body.text}
                maxLength={1024}
                onChangeText={(text) => setDefinition((current) => ({ ...current, body: { ...current.body, text } }))}
              />
              <TextInput
                mode="outlined"
                label="Footer (optional)"
                value={definition.footer?.text || ""}
                maxLength={60}
                onChangeText={(text) => setDefinition((current) => ({ ...current, footer: { ...current.footer, text } }))}
              />
            </Section>

            {definition.carousel && (
              <Section title="Carousel cards">
                <TemplateCarouselEditor
                  value={definition.carousel}
                  onChange={(carousel) => setDefinition((current) => ({
                    ...current,
                    carousel,
                    category: "MARKETING",
                    subtype: carousel.type === "PRODUCT" ? "PRODUCT_CAROUSEL" : "MEDIA_CAROUSEL",
                  }))}
                  uploadingCardIndex={typeof uploadingExample === "number" ? uploadingExample : null}
                  onUploadExample={(cardIndex, format) => pickTemplateExample(format, cardIndex)}
                />
              </Section>
            )}

            {definition.callPermissionRequest && (
              <Section title="Call permission">
                <View style={styles.permissionRow}>
                  <View style={styles.permissionIcon}>
                    <IconButton icon="phone-check-outline" iconColor={waColors.greenDark} />
                  </View>
                  <View style={styles.permissionBody}>
                    <Text style={styles.permissionTitle}>Request permission to call</Text>
                    <Text style={styles.permissionText}>
                      WhatsApp adds the permission action. It cannot be combined with other buttons or a carousel.
                    </Text>
                  </View>
                </View>
              </Section>
            )}
          </>
        )}

        {requiredVariables.length > 0 && (
          <Section
            title="Dynamic attributes"
            action={<Button compact icon="plus" onPress={() => setAttributeDialog(true)}>Attribute</Button>}
          >
            {definition.mappings?.map((mapping, index) => {
              const menuKey = `${mapping.component}-${mapping.cardIndex ?? ""}-${mapping.buttonIndex ?? ""}-${mapping.position}`;
              const selected = attributesQuery.data?.find((attribute) => attribute.id === mapping.attributeId);
              return (
                <View key={menuKey} style={styles.mapping}>
                  <Text style={styles.mappingTitle}>
                    {mapping.component}
                    {mapping.cardIndex != null ? ` ${mapping.cardIndex + 1}` : ""}
                    {mapping.buttonIndex != null ? ` button ${mapping.buttonIndex + 1}` : ""}
                    {" {{"}{mapping.position}{"}}"}
                  </Text>
                  <Menu
                    visible={attributeMenu === menuKey}
                    onDismiss={() => setAttributeMenu(null)}
                    anchor={
                      <Button mode="outlined" onPress={() => setAttributeMenu(menuKey)}>
                        {selected?.label || "Select attribute"}
                      </Button>
                    }
                  >
                    {attributesQuery.data?.map((attribute) => (
                      <Menu.Item
                        key={attribute.id}
                        title={attribute.label}
                        leadingIcon={attribute.isSystem ? "lock-outline" : "database-outline"}
                        onPress={() => {
                          updateMapping(index, { attributeId: attribute.id });
                          setAttributeMenu(null);
                        }}
                      />
                    ))}
                  </Menu>
                  <View style={styles.row}>
                    <TextInput
                      mode="outlined"
                      label="Sample"
                      style={styles.flex}
                      value={mapping.sampleValue}
                      onChangeText={(sampleValue) => updateMapping(index, { sampleValue })}
                    />
                    <TextInput
                      mode="outlined"
                      label="Fallback"
                      style={styles.flex}
                      value={mapping.fallbackValue || ""}
                      onChangeText={(fallbackValue) => updateMapping(index, { fallbackValue })}
                    />
                  </View>
                </View>
              );
            })}
          </Section>
        )}

        {definition.category !== "AUTHENTICATION" && templateMode === "STANDARD" && (
          <Section title="Buttons" action={<IconButton icon="plus" onPress={addButton} />}>
            {definition.buttons?.map((button, index) => (
              <View key={index} style={styles.buttonEditor}>
                <View style={styles.row}>
                  <SegmentedButtons
                    style={styles.flex}
                    value={button.type}
                    onValueChange={(type) => updateButton(index, {
                      type,
                      text: "Button",
                      ...(type === "URL" ? { url: "https://example.com" } : {}),
                      ...(type === "PHONE_NUMBER" ? { phoneNumber: "" } : {}),
                      ...(type === "FLOW" ? { flowId: "", flowAction: "NAVIGATE" } : {}),
                    })}
                    buttons={[
                      { value: "QUICK_REPLY", label: "Reply" },
                      { value: "URL", label: "URL" },
                      { value: "PHONE_NUMBER", label: "Phone" },
                    ]}
                  />
                  <IconButton
                    icon="trash-can-outline"
                    onPress={() => setDefinition((current) => ({
                      ...current,
                      buttons: current.buttons?.filter((_, buttonIndex) => buttonIndex !== index),
                    }))}
                  />
                </View>
                <SegmentedButtons
                  value={button.type}
                  onValueChange={(type) => updateButton(index, {
                    type,
                    text: "Button",
                    ...(type === "FLOW" ? { flowId: "", flowAction: "NAVIGATE" } : {}),
                  })}
                  buttons={[
                    { value: "FLOW", label: "Flow" },
                    { value: "COPY_CODE", label: "Copy code" },
                  ]}
                />
                <TextInput
                  mode="outlined"
                  label="Button text"
                  value={"text" in button ? button.text || "" : ""}
                  onChangeText={(text) => updateButton(index, { text })}
                />
                {button.type === "URL" && (
                  <TextInput mode="outlined" label="URL" value={button.url} onChangeText={(url) => updateButton(index, { url })} />
                )}
                {button.type === "PHONE_NUMBER" && (
                  <TextInput
                    mode="outlined"
                    label="Phone number"
                    keyboardType="phone-pad"
                    value={button.phoneNumber}
                    onChangeText={(phoneNumber) => updateButton(index, { phoneNumber })}
                  />
                )}
                {button.type === "FLOW" && (
                  <>
                    <TextInput
                      mode="outlined"
                      label="Flow ID"
                      value={button.flowId}
                      onChangeText={(flowId) => updateButton(index, { flowId })}
                    />
                    <SegmentedButtons
                      value={button.flowAction || "NAVIGATE"}
                      onValueChange={(flowAction) => updateButton(index, { flowAction })}
                      buttons={[
                        { value: "NAVIGATE", label: "Navigate" },
                        { value: "DATA_EXCHANGE", label: "Data exchange" },
                      ]}
                    />
                  </>
                )}
                {button.type === "COPY_CODE" && (
                  <TextInput
                    mode="outlined"
                    label="Example coupon code"
                    value={button.example || ""}
                    onChangeText={(example) => updateButton(index, { example })}
                  />
                )}
              </View>
            ))}
          </Section>
        )}

        {!!templateId && !!templateQuery.data?.versions?.length && (
          <Section title="Version history">
            {templateQuery.data.versions.map((version) => (
              <View key={version.id} style={styles.versionRow}>
                <View style={styles.versionBadge}>
                  <Text style={styles.versionBadgeText}>v{version.version}</Text>
                </View>
                <View style={styles.versionBody}>
                  <Text style={styles.versionTitle}>
                    {version.metaStatus || "Local definition"}
                  </Text>
                  <Text style={styles.versionDate}>
                    {new Date(version.createdAt).toLocaleString()}
                  </Text>
                </View>
              </View>
            ))}
          </Section>
        )}

        <Section title="Preview">
          <WhatsAppTemplatePreview definition={definition} />
        </Section>

        {!!validationError && <Text style={styles.error}>{validationError}</Text>}
        <Button
          mode="contained"
          icon="send-check"
          disabled={Boolean(validationError) || saveMutation.isPending}
          loading={saveMutation.isPending}
          onPress={() => saveMutation.mutate()}
          style={styles.submit}
        >
          Submit to Meta
        </Button>
      </ScrollView>

      <Portal>
        <Dialog visible={attributeDialog} onDismiss={() => setAttributeDialog(false)}>
          <Dialog.Title>Create attribute</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView contentContainerStyle={styles.dialogContent}>
              <TextInput
                mode="outlined"
                label="Label"
                value={newAttribute.label}
                onChangeText={(label) => setNewAttribute((current) => ({
                  ...current,
                  label,
                  key: current.key || label.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
                }))}
              />
              <TextInput
                mode="outlined"
                label="Key"
                value={newAttribute.key}
                onChangeText={(key) => setNewAttribute((current) => ({ ...current, key }))}
              />
              <SegmentedButtons
                value={newAttribute.type}
                onValueChange={(type) => setNewAttribute((current) => ({
                  ...current,
                  type: type as WaTemplateAttribute["type"],
                }))}
                buttons={[
                  { value: "TEXT", label: "Text" },
                  { value: "NUMBER", label: "Number" },
                  { value: "CURRENCY", label: "Money" },
                  { value: "DATE", label: "Date" },
                ]}
              />
              <TextInput
                mode="outlined"
                label="Fallback value"
                value={newAttribute.fallbackValue}
                onChangeText={(fallbackValue) => setNewAttribute((current) => ({ ...current, fallbackValue }))}
              />
              <TextInput
                mode="outlined"
                label="Description"
                value={newAttribute.description}
                onChangeText={(description) => setNewAttribute((current) => ({ ...current, description }))}
              />
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setAttributeDialog(false)}>Cancel</Button>
            <Button loading={attributeMutation.isPending} onPress={() => attributeMutation.mutate()}>Create</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text variant="titleMedium" style={styles.sectionTitle}>{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

function validateDefinition(definition: WaTemplateDefinition) {
  if (!definition.name) return "Template name is required.";
  if (!definition.body.text) return "Message body is required.";
  if (definition.mappings?.some((mapping) => !mapping.sampleValue)) return "Every variable needs a sample value.";
  if (definition.mappings?.some((mapping) => !mapping.attributeId && !mapping.fallbackValue)) {
    return "Every variable needs an attribute or fallback value.";
  }
  if (definition.category === "AUTHENTICATION" && !definition.authentication) return "Choose an authentication mode.";
  if (definition.buttons?.some((button) => button.type === "FLOW" && !button.flowId)) return "Every Flow button needs a Flow ID.";
  if (
    definition.header
    && ["IMAGE", "VIDEO", "DOCUMENT"].includes(definition.header.format)
    && !definition.header.exampleHandle
  ) {
    return "Media headers need a Meta review example.";
  }
  if (definition.carousel?.type === "MEDIA" && definition.carousel.cards.some((card) => !card.header.exampleHandle)) {
    return "Every media carousel card needs a Meta resumable-upload handle.";
  }
  if (definition.carousel) {
    const first = definition.carousel.cards[0];
    const expectedButtons = first.buttons.map((button) => button.type).join("|");
    const inconsistent = definition.carousel.cards.some((card) => (
      card.header.format !== first.header.format
      || Boolean(card.body) !== Boolean(first.body)
      || card.buttons.map((button) => button.type).join("|") !== expectedButtons
    ));
    if (inconsistent) return "All carousel cards must use the same media, body, and button structure.";
    if (
      definition.carousel.type === "PRODUCT"
      && definition.carousel.cards.some((card) => (
        card.buttons.length !== 1
        || !["SPM", "URL"].includes(card.buttons[0]?.type)
      ))
    ) {
      return "Each product card needs exactly one View or URL button.";
    }
  }
  return "";
}

function fromComponents(template: any): WaTemplateDefinition {
  const header = template.components?.find((component: any) => component.type === "HEADER");
  const body = template.components?.find((component: any) => component.type === "BODY");
  const footer = template.components?.find((component: any) => component.type === "FOOTER");
  const buttonsComponent = template.components?.find((component: any) => component.type === "BUTTONS");
  const carouselComponent = template.components?.find((component: any) => component.type === "CAROUSEL");
  const callPermissionRequest = template.components?.some((component: any) => component.type === "CALL_PERMISSION_REQUEST");
  const mapButton = (button: any): any => {
    if (button.type === "URL") return { type: "URL", text: button.text, url: button.url, example: button.example?.[0] };
    if (button.type === "PHONE_NUMBER") return { type: "PHONE_NUMBER", text: button.text, phoneNumber: button.phone_number };
    if (button.type === "SPM") return { type: "SPM", text: button.text || "View" };
    return { type: "QUICK_REPLY", text: button.text };
  };
  return {
    name: template.name,
    language: template.language,
    category: template.category,
    parameterFormat: template.parameterFormat || "POSITIONAL",
    header: { format: header?.format || "NONE", text: header?.text || "" },
    body: { text: body?.text || "" },
    footer: { text: footer?.text || "" },
    buttons: buttonsComponent?.buttons?.map(mapButton) || [],
    callPermissionRequest,
    carousel: carouselComponent ? {
      type: carouselComponent.cards?.[0]?.components?.find((component: any) => component.type === "HEADER")?.format === "PRODUCT"
        ? "PRODUCT"
        : "MEDIA",
      cards: carouselComponent.cards.map((card: any) => {
        const cardHeader = card.components.find((component: any) => component.type === "HEADER");
        const cardBody = card.components.find((component: any) => component.type === "BODY");
        const cardButtons = card.components.find((component: any) => component.type === "BUTTONS");
        return {
          header: {
            format: cardHeader?.format,
            exampleHandle: cardHeader?.example?.header_handle?.[0],
          },
          ...(cardBody ? { body: { text: cardBody.text || "" } } : {}),
          buttons: cardButtons?.buttons?.map(mapButton) || [],
        };
      }),
    } : undefined,
    mappings: [],
  };
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: waColors.surfaceMuted },
  content: { padding: 12, gap: 12, paddingBottom: 40 },
  section: { gap: 12, padding: 14, backgroundColor: waColors.surface, borderRadius: 8 },
  sectionHeader: { minHeight: 34, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  versionRow: { minHeight: 50, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: waColors.border },
  versionBadge: { minWidth: 38, height: 26, paddingHorizontal: 7, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: waColors.greenPale },
  versionBadgeText: { color: waColors.greenDark, fontSize: 11, fontWeight: "700" },
  versionBody: { flex: 1, marginLeft: 10 },
  versionTitle: { color: waColors.text, fontSize: 13, fontWeight: "600" },
  versionDate: { color: waColors.textSecondary, fontSize: 11, paddingTop: 2 },
  sectionTitle: { color: waColors.text, fontWeight: "700" },
  label: { color: waColors.textSecondary, fontSize: 12, paddingBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  flex: { flex: 1 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  permissionRow: { minHeight: 72, flexDirection: "row", alignItems: "center" },
  permissionIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: waColors.greenPale },
  permissionBody: { flex: 1, minWidth: 0, paddingLeft: 12 },
  permissionTitle: { color: waColors.text, fontSize: 14, fontWeight: "700" },
  permissionText: { color: waColors.textSecondary, fontSize: 12, lineHeight: 17, paddingTop: 3 },
  mapping: { gap: 8, padding: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: waColors.border, borderRadius: 8 },
  mappingTitle: { color: waColors.greenDark, fontWeight: "700" },
  buttonEditor: { gap: 8, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: waColors.border },
  error: { color: waColors.danger, textAlign: "center" },
  submit: { backgroundColor: waColors.green },
  dialogContent: { gap: 12, paddingHorizontal: 4, paddingVertical: 8 },
});
