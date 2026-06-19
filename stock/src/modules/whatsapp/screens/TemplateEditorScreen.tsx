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
import {
  createWaTemplate,
  createWaTemplateAttribute,
  fetchWaTemplate,
  fetchWaTemplateAttributes,
  updateWaTemplate,
  WaTemplateAttribute,
  WaTemplateDefinition,
} from "../../../api/whatsapp.api";
import { useAuthStore } from "../../../auth/auth-store";
import { useShopStore } from "../../../auth/shop-store";
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
  ], [definition.header?.text, definition.body.text]);

  useEffect(() => {
    setDefinition((current) => {
      const nextMappings = requiredVariables.map((required) => {
        return current.mappings?.find(
          (mapping) => mapping.component === required.component && mapping.position === required.position,
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

  const validationError = validateDefinition(definition);

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
                  { value: "DOCUMENT", label: "File" },
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
                <TextInput
                  mode="outlined"
                  label="Meta example handle"
                  value={definition.header.exampleHandle || ""}
                  onChangeText={(exampleHandle) => setDefinition((current) => ({
                    ...current,
                    header: { ...current.header!, exampleHandle },
                  }))}
                />
              )}
            </Section>

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
          </>
        )}

        {requiredVariables.length > 0 && (
          <Section
            title="Dynamic attributes"
            action={<Button compact icon="plus" onPress={() => setAttributeDialog(true)}>Attribute</Button>}
          >
            {definition.mappings?.map((mapping, index) => {
              const menuKey = `${mapping.component}-${mapping.position}`;
              const selected = attributesQuery.data?.find((attribute) => attribute.id === mapping.attributeId);
              return (
                <View key={menuKey} style={styles.mapping}>
                  <Text style={styles.mappingTitle}>{mapping.component} {"{{"}{mapping.position}{"}}"}</Text>
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

        {definition.category !== "AUTHENTICATION" && (
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
  return "";
}

function fromComponents(template: any): WaTemplateDefinition {
  const header = template.components?.find((component: any) => component.type === "HEADER");
  const body = template.components?.find((component: any) => component.type === "BODY");
  const footer = template.components?.find((component: any) => component.type === "FOOTER");
  return {
    name: template.name,
    language: template.language,
    category: template.category,
    parameterFormat: template.parameterFormat || "POSITIONAL",
    header: { format: header?.format || "NONE", text: header?.text || "" },
    body: { text: body?.text || "" },
    footer: { text: footer?.text || "" },
    buttons: [],
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
  mapping: { gap: 8, padding: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: waColors.border, borderRadius: 8 },
  mappingTitle: { color: waColors.greenDark, fontWeight: "700" },
  buttonEditor: { gap: 8, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: waColors.border },
  error: { color: waColors.danger, textAlign: "center" },
  submit: { backgroundColor: waColors.green },
  dialogContent: { gap: 12, paddingHorizontal: 4, paddingVertical: 8 },
});
