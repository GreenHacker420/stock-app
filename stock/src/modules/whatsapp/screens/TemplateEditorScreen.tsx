import { useEffect, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Button, IconButton, Switch, Text, TextInput } from "react-native-paper";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";

import {
  createWaTemplate,
  fetchWaTemplate,
  updateWaTemplate,
  uploadWaTemplateExample,
  type WaTemplateDefinition,
} from "../../../api/whatsapp.api";
import { useAuthStore } from "../../../auth/auth-store";
import { useShopStore } from "../../../auth/shop-store";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppBottomSheetModal } from "../../../components/overlays/AppBottomSheetModal";
import { colors, fontSize, fontWeight, radius, shadow, spacing } from "../../../theme";
import { triggerLightHaptic, triggerSuccessHaptic } from "../../../utils/haptics";
import {
  createDefaultCarousel,
  TemplateCarouselEditor,
} from "../components/TemplateCarouselEditor";
import { WhatsAppTemplatePreview } from "../components/WhatsAppTemplatePreview";
import { waColors } from "../whatsapp-ui";

type StudioStage = "setup" | "message" | "review";
type MappingDraft = NonNullable<WaTemplateDefinition["mappings"]>[number];
type StandardButton = NonNullable<WaTemplateDefinition["buttons"]>[number];

const STAGES: Array<{ value: StudioStage; label: string; icon: string }> = [
  { value: "setup", label: "Setup", icon: "tune-variant" },
  { value: "message", label: "Message", icon: "message-text-outline" },
  { value: "review", label: "Review", icon: "check-decagram-outline" },
];

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

const CATEGORY_OPTIONS = [
  {
    value: "MARKETING" as const,
    label: "Marketing",
    description: "Offers, launches, reminders to buy, and promotional outreach.",
    icon: "bullhorn-outline",
  },
  {
    value: "UTILITY" as const,
    label: "Utility",
    description: "Transactional updates tied to an existing customer action or account.",
    icon: "receipt-text-outline",
  },
  {
    value: "AUTHENTICATION" as const,
    label: "Authentication",
    description: "One-time passcodes and account verification messages.",
    icon: "shield-key-outline",
  },
];

const TEMPLATE_TYPES = [
  { value: "STANDARD", label: "Standard", description: "Text, media, location and action buttons", icon: "message-outline" },
  { value: "CAROUSEL", label: "Carousel", description: "Swipeable media or product cards", icon: "view-carousel-outline" },
  { value: "CALL_PERMISSION", label: "Call request", description: "Ask a customer for permission to receive a business call", icon: "phone-outgoing-outline" },
] as const;

const HEADER_OPTIONS: Array<{
  value: NonNullable<WaTemplateDefinition["header"]>["format"];
  label: string;
  icon: string;
  description: string;
}> = [
  { value: "NONE", label: "No header", icon: "minus-circle-outline", description: "Start directly with the message body" },
  { value: "TEXT", label: "Text", icon: "format-title", description: "Short title up to 60 characters" },
  { value: "IMAGE", label: "Image", icon: "image-outline", description: "Image chosen when the template is sent" },
  { value: "VIDEO", label: "Video", icon: "video-outline", description: "Video chosen when the template is sent" },
  { value: "DOCUMENT", label: "Document", icon: "file-document-outline", description: "Document chosen when the template is sent" },
  { value: "LOCATION", label: "Location", icon: "map-marker-outline", description: "Location supplied when the template is sent" },
];

const BUTTON_OPTIONS: Array<{
  type: StandardButton["type"];
  title: string;
  description: string;
  icon: string;
}> = [
  { type: "QUICK_REPLY", title: "Quick reply", description: "Let the customer tap a reply option", icon: "reply-outline" },
  { type: "URL", title: "Website", description: "Open a website or campaign URL", icon: "open-in-new" },
  { type: "PHONE_NUMBER", title: "Call phone", description: "Call a business phone number", icon: "phone-outline" },
  { type: "COPY_CODE", title: "Copy code", description: "Copy a coupon or reference code", icon: "content-copy" },
  { type: "FLOW", title: "WhatsApp Flow", description: "Open a configured WhatsApp Flow", icon: "form-select" },
];

function positions(text = "") {
  return [...new Set([...text.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1])))]
    .sort((left, right) => left - right);
}

function appendVariable(text = "") {
  const next = Math.max(0, ...positions(text)) + 1;
  const separator = text.length > 0 && !/\s$/.test(text) ? " " : "";
  return `${text}${separator}{{${next}}}`;
}

function requiredMappings(definition: WaTemplateDefinition) {
  return [
    ...positions(definition.header?.text).map((position) => ({ component: "HEADER" as const, position })),
    ...positions(definition.body.text).map((position) => ({ component: "BODY" as const, position })),
    ...(definition.buttons || []).flatMap((button, buttonIndex) => (
      button.type === "URL"
        ? positions(button.url).map((position) => ({ component: "BUTTON" as const, position, buttonIndex }))
        : []
    )),
    ...(definition.carousel?.cards || []).flatMap((card, cardIndex) => [
      ...positions(card.body?.text).map((position) => ({ component: "CARD" as const, position, cardIndex })),
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
  ];
}

function mappingKey(mapping: Pick<MappingDraft, "component" | "position" | "buttonIndex" | "cardIndex">) {
  return `${mapping.component}:${mapping.cardIndex ?? ""}:${mapping.buttonIndex ?? ""}:${mapping.position}`;
}

function mappingLabel(mapping: MappingDraft) {
  if (mapping.component === "BODY") return `Message {{${mapping.position}}}`;
  if (mapping.component === "HEADER") return `Header {{${mapping.position}}}`;
  if (mapping.component === "BUTTON") return `Button ${(mapping.buttonIndex ?? 0) + 1} {{${mapping.position}}}`;
  return `Card ${(mapping.cardIndex ?? 0) + 1} {{${mapping.position}}}`;
}

function nextButton(type: StandardButton["type"]): StandardButton {
  if (type === "URL") return { type, text: "Visit website", url: "https://example.com" };
  if (type === "PHONE_NUMBER") return { type, text: "Call us", phoneNumber: "" };
  if (type === "COPY_CODE") return { type, text: "Copy code", example: "SAVE20" };
  if (type === "FLOW") return { type, text: "Open", flowId: "", flowAction: "NAVIGATE" };
  return { type: "QUICK_REPLY", text: "Reply" };
}

function getTemplateMode(definition: WaTemplateDefinition) {
  if (definition.callPermissionRequest) return "CALL_PERMISSION" as const;
  if (definition.carousel) return "CAROUSEL" as const;
  return "STANDARD" as const;
}

export function TemplateEditorScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const templateId = route.params?.templateId as string | undefined;
  const token = useAuthStore((state) => state.token) || "";
  const insets = useSafeAreaInsets();
  const shopId = useShopStore((state) => state.activeShopId)!;
  const queryClient = useQueryClient();

  const [stage, setStage] = useState<StudioStage>("setup");
  const [definition, setDefinition] = useState<WaTemplateDefinition>(EMPTY_DEFINITION);
  const [headerSheet, setHeaderSheet] = useState(false);
  const [buttonSheet, setButtonSheet] = useState(false);
  const [uploadingExample, setUploadingExample] = useState<"HEADER" | number | null>(null);

  const templateQuery = useQuery({
    queryKey: ["wa-template", shopId, templateId],
    enabled: Boolean(templateId && shopId && token),
    queryFn: () => fetchWaTemplate(token, shopId, templateId!),
  });

  useEffect(() => {
    navigation.setOptions({
      title: templateId ? "Template studio" : "New template",
      headerStyle: { backgroundColor: colors.surface },
      headerTintColor: colors.textPrimary,
      headerShadowVisible: false,
    });
  }, [navigation, templateId]);

  useEffect(() => {
    if (!templateQuery.data) return;
    const incoming = templateQuery.data.draftDefinition || fromComponents(templateQuery.data);
    setDefinition({
      ...EMPTY_DEFINITION,
      ...incoming,
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
  }, [templateQuery.data]);

  const expectedMappings = useMemo(() => requiredMappings(definition), [
    definition.header?.text,
    definition.body.text,
    definition.buttons,
    definition.carousel,
  ]);

  useEffect(() => {
    setDefinition((current) => {
      const currentMappings = current.mappings || [];
      const nextMappings = expectedMappings.map((required) => {
        const existing = currentMappings.find((candidate) => (
          candidate.component === required.component
          && candidate.position === required.position
          && candidate.buttonIndex === ("buttonIndex" in required ? required.buttonIndex : undefined)
          && candidate.cardIndex === ("cardIndex" in required ? required.cardIndex : undefined)
        ));
        return existing || {
          ...required,
          sampleValue: "",
          required: true,
        };
      });

      if (JSON.stringify(nextMappings) === JSON.stringify(currentMappings)) return current;
      return { ...current, mappings: nextMappings };
    });
  }, [expectedMappings]);

  const validationError = validateDefinition(definition);
  const templateMode = getTemplateMode(definition);
  const stageIndex = STAGES.findIndex((item) => item.value === stage);

  const saveMutation = useMutation({
    mutationFn: () => templateId
      ? updateWaTemplate(token, shopId, templateId, definition)
      : createWaTemplate(token, shopId, definition),
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: ["wa-template-library", shopId] });
      queryClient.invalidateQueries({ queryKey: ["wa-templates", shopId] });
      queryClient.invalidateQueries({ queryKey: ["wa-template-send", shopId] });
      triggerSuccessHaptic();
      Alert.alert(
        "Submitted to Meta",
        `${template.name} is ${template.status.toLowerCase()}. Runtime customer values can be chosen when you send it.`,
        [{ text: "Done", onPress: () => navigation.goBack() }],
      );
    },
    onError: (error) => Alert.alert("Template not saved", error.message),
  });

  const setTemplateMode = (mode: "STANDARD" | "CAROUSEL" | "CALL_PERMISSION") => {
    triggerLightHaptic();
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

  const updateMapping = (key: string, patch: Partial<MappingDraft>) => {
    setDefinition((current) => ({
      ...current,
      mappings: current.mappings?.map((mapping) => (
        mappingKey(mapping) === key ? { ...mapping, ...patch } : mapping
      )),
    }));
  };

  const updateButton = (index: number, patch: Partial<StandardButton>) => {
    setDefinition((current) => ({
      ...current,
      buttons: current.buttons?.map((button, buttonIndex) => (
        buttonIndex === index ? { ...button, ...patch } as StandardButton : button
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
        const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
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
          Alert.alert("Photo access required", "Allow photo library access to upload a Meta review example.");
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
          return { ...current, header: { ...current.header!, exampleHandle: uploaded.exampleHandle } };
        }
        return {
          ...current,
          carousel: current.carousel
            ? {
                ...current.carousel,
                cards: current.carousel.cards.map((card, index) => (
                  index === cardIndex
                    ? { ...card, header: { ...card.header, exampleHandle: uploaded.exampleHandle } }
                    : card
                )),
              }
            : undefined,
        };
      });
    } catch (error) {
      Alert.alert("Example upload failed", error instanceof Error ? error.message : "Could not upload review media.");
    } finally {
      setUploadingExample(null);
    }
  };

  const goNext = () => {
    if (stage === "setup") {
      if (!definition.name.trim()) {
        Alert.alert("Name the template", "Add a template name before continuing.");
        return;
      }
      setStage("message");
      return;
    }
    if (stage === "message") {
      if (!definition.body.text.trim()) {
        Alert.alert("Write the message", "The WhatsApp template body cannot be empty.");
        return;
      }
      setStage("review");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <StudioProgress
        stage={stage}
        insetsTop={insets.top}
        onBack={() => navigation.goBack()}
        onChange={setStage}
      />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        showsVerticalScrollIndicator={false}
      >
        {templateQuery.isLoading ? (
          <View style={styles.loadingState}>
            <Text style={styles.muted}>Loading template…</Text>
          </View>
        ) : stage === "setup" ? (
          <SetupStage
            definition={definition}
            templateId={templateId}
            templateMode={templateMode}
            onChange={setDefinition}
            onModeChange={setTemplateMode}
          />
        ) : stage === "message" ? (
          <MessageStage
            definition={definition}
            templateMode={templateMode}
            uploadingExample={uploadingExample}
            onChange={setDefinition}
            onOpenHeader={() => setHeaderSheet(true)}
            onOpenButton={() => setButtonSheet(true)}
            onUpdateButton={updateButton}
            onUploadExample={pickTemplateExample}
          />
        ) : (
          <ReviewStage
            definition={definition}
            template={templateQuery.data}
            validationError={validationError}
            onUpdateMapping={updateMapping}
          />
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        {stageIndex > 0 ? (
          <Pressable
            onPress={() => setStage(STAGES[stageIndex - 1].value)}
            style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="arrow-left" size={19} color={colors.textPrimary} />
            <Text style={styles.secondaryActionText}>Back</Text>
          </Pressable>
        ) : <View />}

        {stage === "review" ? (
          <Button
            mode="contained"
            icon="send-check-outline"
            loading={saveMutation.isPending}
            disabled={Boolean(validationError) || saveMutation.isPending}
            onPress={() => saveMutation.mutate()}
            style={styles.primaryButton}
            contentStyle={styles.primaryButtonContent}
          >
            Submit to Meta
          </Button>
        ) : (
          <Button
            mode="contained"
            icon="arrow-right"
            contentStyle={styles.primaryButtonContent}
            style={styles.primaryButton}
            onPress={goNext}
          >
            Continue
          </Button>
        )}
      </View>

      <AppBottomSheetModal
        visible={headerSheet}
        title="Message header"
        subtitle="Choose how the approved template starts. Actual media or location is supplied when sending."
        onDismiss={() => setHeaderSheet(false)}
        maxHeight={0.76}
      >
        <View style={styles.sheetList}>
          {HEADER_OPTIONS.map((option) => {
            const active = (definition.header?.format || "NONE") === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                activeOpacity={0.7}
                onPress={() => {
                  triggerLightHaptic();
                  setDefinition((current) => ({
                    ...current,
                    header: {
                      format: option.value,
                      ...(option.value === "TEXT" ? { text: current.header?.text || "" } : {}),
                    },
                  }));
                  setHeaderSheet(false);
                }}
                style={styles.sheetRow}
              >
                <View style={[styles.sheetIcon, active && styles.sheetIconActive]}>
                  <MaterialCommunityIcons
                    name={option.icon as any}
                    size={21}
                    color={active ? colors.textInverse : colors.textSecondary}
                  />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.sheetTitle}>{option.label}</Text>
                  <Text style={styles.sheetSubtitle}>{option.description}</Text>
                </View>
                {active ? <MaterialCommunityIcons name="check" size={21} color={colors.primary} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </AppBottomSheetModal>

      <AppBottomSheetModal
        visible={buttonSheet}
        title="Add action"
        subtitle="Buttons are part of the approved template. Runtime URL values can be supplied when sending."
        onDismiss={() => setButtonSheet(false)}
        maxHeight={0.74}
      >
        <View style={styles.sheetList}>
          {BUTTON_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.type}
              activeOpacity={0.7}
              onPress={() => {
                setDefinition((current) => ({
                  ...current,
                  buttons: [...(current.buttons || []), nextButton(option.type)],
                }));
                setButtonSheet(false);
                triggerLightHaptic();
              }}
              style={styles.sheetRow}
            >
              <View style={styles.sheetIcon}>
                <MaterialCommunityIcons name={option.icon as any} size={21} color={colors.textSecondary} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.sheetTitle}>{option.title}</Text>
                <Text style={styles.sheetSubtitle}>{option.description}</Text>
              </View>
              <MaterialCommunityIcons name="plus" size={21} color={colors.primary} />
            </TouchableOpacity>
          ))}
        </View>
      </AppBottomSheetModal>
    </KeyboardAvoidingView>
  );
}

function StudioProgress({
  stage,
  insetsTop,
  onBack,
  onChange,
}: {
  stage: StudioStage;
  insetsTop: number;
  onBack: () => void;
  onChange: (stage: StudioStage) => void;
}) {
  const currentIndex = STAGES.findIndex((item) => item.value === stage);
  return (
    <View style={[styles.progressWrap, { paddingTop: Math.max(insetsTop, spacing.sm), minHeight: 60 + Math.max(insetsTop, spacing.sm) }]}>
      <IconButton
        icon="arrow-left"
        size={22}
        iconColor={colors.textPrimary}
        onPress={onBack}
        style={styles.topBackButton}
        accessibilityLabel="Go back"
      />
      <View style={styles.progressSteps}>
        {STAGES.map((item, index) => {
          const active = item.value === stage;
          const completed = index < currentIndex;
          return (
            <Pressable
              key={item.value}
              onPress={() => onChange(item.value)}
              style={styles.progressItem}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <View style={[styles.progressDot, (active || completed) && styles.progressDotActive]}>
                <MaterialCommunityIcons
                  name={(completed ? "check" : item.icon) as any}
                  size={14}
                  color={active || completed ? colors.textInverse : colors.textMuted}
                />
              </View>
              <Text numberOfLines={1} style={[styles.progressLabel, active && styles.progressLabelActive]}>{item.label}</Text>
              {index < STAGES.length - 1 ? (
                <View style={[styles.progressLine, completed && styles.progressLineActive]} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SetupStage({
  definition,
  templateId,
  templateMode,
  onChange,
  onModeChange,
}: {
  definition: WaTemplateDefinition;
  templateId?: string;
  templateMode: ReturnType<typeof getTemplateMode>;
  onChange: React.Dispatch<React.SetStateAction<WaTemplateDefinition>>;
  onModeChange: (mode: "STANDARD" | "CAROUSEL" | "CALL_PERMISSION") => void;
}) {
  return (
    <View>
      <Text style={styles.heroEyebrow}>TEMPLATE STUDIO</Text>
      <Text style={styles.heroTitle}>Build the message, not a form.</Text>
      <Text style={styles.heroCopy}>
        Define the WhatsApp structure and review examples here. Customer fields, campaign codes and other live values are chosen when you send.
      </Text>

      <Text style={styles.fieldLabel}>Template name</Text>
      <TextInput
        mode="flat"
        value={definition.name}
        disabled={Boolean(templateId)}
        placeholder="payment_reminder_august"
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.underlineInput}
        underlineColor={colors.borderStrong}
        activeUnderlineColor={colors.primary}
        onChangeText={(name) => onChange((current) => ({
          ...current,
          name: name.toLowerCase().replace(/[^a-z0-9_]+/g, "_"),
        }))}
      />
      <Text style={styles.helper}>Lowercase letters, numbers and underscores.</Text>

      <SectionTitle title="Category" subtitle="Choose the reason Meta should classify this template." />
      <View style={styles.choiceList}>
        {CATEGORY_OPTIONS.map((option) => {
          const active = definition.category === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => {
                triggerLightHaptic();
                onChange((current) => {
                  if (option.value === "AUTHENTICATION") {
                    return {
                      ...current,
                      category: option.value,
                      header: { format: "NONE" },
                      body: { ...current.body, text: "{{1}}" },
                      buttons: [{ type: "COPY_CODE", text: "Copy code" }],
                      authentication: current.authentication || { otpType: "COPY_CODE" },
                      carousel: undefined,
                      callPermissionRequest: false,
                    };
                  }
                  return { ...current, category: option.value, authentication: undefined };
                });
              }}
              style={({ pressed }) => [styles.choiceRow, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons
                name={option.icon as any}
                size={22}
                color={active ? colors.primary : colors.textSecondary}
              />
              <View style={styles.flex}>
                <Text style={[styles.choiceTitle, active && styles.choiceTitleActive]}>{option.label}</Text>
                <Text style={styles.choiceDescription}>{option.description}</Text>
              </View>
              <View style={[styles.radio, active && styles.radioActive]}>{active ? <View style={styles.radioInner} /> : null}</View>
            </Pressable>
          );
        })}
      </View>

      {definition.category !== "AUTHENTICATION" ? (
        <>
          <SectionTitle title="Format" subtitle="Start simple; advanced formats appear only when you choose them." />
          <View style={styles.choiceList}>
            {TEMPLATE_TYPES.map((option) => {
              const active = templateMode === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => onModeChange(option.value)}
                  style={({ pressed }) => [styles.choiceRow, pressed && styles.pressed]}
                >
                  <MaterialCommunityIcons name={option.icon as any} size={22} color={active ? colors.primary : colors.textSecondary} />
                  <View style={styles.flex}>
                    <Text style={[styles.choiceTitle, active && styles.choiceTitleActive]}>{option.label}</Text>
                    <Text style={styles.choiceDescription}>{option.description}</Text>
                  </View>
                  <View style={[styles.radio, active && styles.radioActive]}>{active ? <View style={styles.radioInner} /> : null}</View>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      <SectionTitle title="Language" />
      <TextInput
        mode="flat"
        value={definition.language}
        disabled={Boolean(templateId)}
        placeholder="en_US"
        style={styles.underlineInput}
        underlineColor={colors.borderStrong}
        activeUnderlineColor={colors.primary}
        onChangeText={(language) => onChange((current) => ({ ...current, language }))}
      />
    </View>
  );
}

function MessageStage({
  definition,
  templateMode,
  uploadingExample,
  onChange,
  onOpenHeader,
  onOpenButton,
  onUpdateButton,
  onUploadExample,
}: {
  definition: WaTemplateDefinition;
  templateMode: ReturnType<typeof getTemplateMode>;
  uploadingExample: "HEADER" | number | null;
  onChange: React.Dispatch<React.SetStateAction<WaTemplateDefinition>>;
  onOpenHeader: () => void;
  onOpenButton: () => void;
  onUpdateButton: (index: number, patch: Partial<StandardButton>) => void;
  onUploadExample: (format: "IMAGE" | "VIDEO" | "DOCUMENT", cardIndex?: number) => Promise<void>;
}) {
  if (definition.category === "AUTHENTICATION") {
    return <AuthenticationComposer definition={definition} onChange={onChange} />;
  }

  if (definition.carousel) {
    return (
      <View>
        <Text style={styles.heroEyebrow}>MESSAGE</Text>
        <Text style={styles.heroTitle}>Build the swipeable story.</Text>
        <Text style={styles.heroCopy}>Cards share one Meta-approved structure. Runtime product/media values are supplied later.</Text>
        <TemplateCarouselEditor
          value={definition.carousel}
          onChange={(carousel) => onChange((current) => ({
            ...current,
            carousel,
            category: "MARKETING",
            subtype: carousel.type === "PRODUCT" ? "PRODUCT_CAROUSEL" : "MEDIA_CAROUSEL",
          }))}
          uploadingCardIndex={typeof uploadingExample === "number" ? uploadingExample : null}
          onUploadExample={(cardIndex, format) => onUploadExample(format, cardIndex)}
        />
        <SectionTitle title="Live preview" />
        <WhatsAppTemplatePreview definition={definition} />
      </View>
    );
  }

  if (templateMode === "CALL_PERMISSION") {
    return (
      <View>
        <Text style={styles.heroEyebrow}>MESSAGE</Text>
        <Text style={styles.heroTitle}>Ask before you call.</Text>
        <Text style={styles.heroCopy}>Meta supplies the permission action. Write the context the customer needs before deciding.</Text>
        <MessageBodyEditor definition={definition} onChange={onChange} />
        <View style={styles.inlineNotice}>
          <MaterialCommunityIcons name="phone-check-outline" size={21} color={colors.primary} />
          <Text style={styles.inlineNoticeText}>The “Allow business calls” action is added by WhatsApp.</Text>
        </View>
        <SectionTitle title="Live preview" />
        <WhatsAppTemplatePreview definition={definition} />
      </View>
    );
  }

  const header = definition.header || { format: "NONE" as const };
  return (
    <View>
      <Text style={styles.heroEyebrow}>MESSAGE</Text>
      <Text style={styles.heroTitle}>Compose it like a WhatsApp message.</Text>
      <Text style={styles.heroCopy}>Use variables for anything that changes. You will decide where each value comes from when sending.</Text>

      <Pressable onPress={onOpenHeader} style={({ pressed }) => [styles.inlineAction, pressed && styles.pressed]}>
        <View style={styles.inlineActionIcon}>
          <MaterialCommunityIcons
            name={(HEADER_OPTIONS.find((item) => item.value === header.format)?.icon || "minus-circle-outline") as any}
            size={20}
            color={colors.primary}
          />
        </View>
        <View style={styles.flex}>
          <Text style={styles.inlineActionTitle}>{header.format === "NONE" ? "Add a header" : `${header.format.toLowerCase()} header`}</Text>
          <Text style={styles.inlineActionSubtitle}>Optional · tap to change</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
      </Pressable>

      {header.format === "TEXT" ? (
        <View style={styles.composerBlock}>
          <View style={styles.composerTopline}>
            <Text style={styles.composerLabel}>HEADER</Text>
            <Button
              compact
              icon="code-braces"
              onPress={() => onChange((current) => ({
                ...current,
                header: { ...current.header!, text: appendVariable(current.header?.text || "") },
              }))}
            >
              Variable
            </Button>
          </View>
          <TextInput
            mode="flat"
            value={header.text || ""}
            placeholder="Short headline"
            maxLength={60}
            style={styles.composerInput}
            underlineColor="transparent"
            activeUnderlineColor="transparent"
            onChangeText={(text) => onChange((current) => ({ ...current, header: { ...current.header!, text } }))}
          />
          <Text style={styles.counter}>{header.text?.length || 0}/60</Text>
        </View>
      ) : null}

      {["IMAGE", "VIDEO", "DOCUMENT"].includes(header.format) ? (
        <Pressable
          onPress={() => onUploadExample(header.format as "IMAGE" | "VIDEO" | "DOCUMENT")}
          style={({ pressed }) => [styles.reviewMediaRow, pressed && styles.pressed]}
          disabled={uploadingExample != null}
        >
          <MaterialCommunityIcons
            name={header.exampleHandle ? "check-circle" : "cloud-upload-outline"}
            size={22}
            color={header.exampleHandle ? colors.success : colors.primary}
          />
          <View style={styles.flex}>
            <Text style={styles.inlineActionTitle}>{header.exampleHandle ? "Review example uploaded" : "Upload Meta review example"}</Text>
            <Text style={styles.inlineActionSubtitle}>This is only for template review, not the media sent in every campaign.</Text>
          </View>
          {uploadingExample === "HEADER" ? <Text style={styles.muted}>Uploading…</Text> : null}
        </Pressable>
      ) : null}

      <MessageBodyEditor definition={definition} onChange={onChange} />

      <SectionTitle title="Actions" subtitle="Add only the buttons the customer actually needs." />
      {(definition.buttons || []).map((button, index) => (
        <ButtonEditor
          key={`${button.type}-${index}`}
          button={button}
          index={index}
          onChange={(patch) => onUpdateButton(index, patch)}
          onDelete={() => onChange((current) => ({
            ...current,
            buttons: current.buttons?.filter((_, buttonIndex) => buttonIndex !== index),
          }))}
        />
      ))}
      {(definition.buttons?.length || 0) < 10 ? (
        <Pressable onPress={onOpenButton} style={({ pressed }) => [styles.addActionRow, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="plus-circle-outline" size={21} color={colors.primary} />
          <Text style={styles.addActionText}>Add button</Text>
        </Pressable>
      ) : null}

      <SectionTitle title="Live preview" />
      <WhatsAppTemplatePreview definition={definition} />
    </View>
  );
}

function MessageBodyEditor({
  definition,
  onChange,
}: {
  definition: WaTemplateDefinition;
  onChange: React.Dispatch<React.SetStateAction<WaTemplateDefinition>>;
}) {
  return (
    <>
      <View style={styles.composerBlock}>
        <View style={styles.composerTopline}>
          <Text style={styles.composerLabel}>MESSAGE</Text>
          <Button
            compact
            icon="code-braces"
            onPress={() => onChange((current) => ({
              ...current,
              body: { ...current.body, text: appendVariable(current.body.text) },
            }))}
          >
            Variable
          </Button>
        </View>
        <TextInput
          mode="flat"
          multiline
          value={definition.body.text}
          placeholder="Write the message customers will receive…"
          maxLength={1024}
          style={[styles.composerInput, styles.bodyInput]}
          underlineColor="transparent"
          activeUnderlineColor="transparent"
          onChangeText={(text) => onChange((current) => ({ ...current, body: { ...current.body, text } }))}
        />
        <Text style={styles.counter}>{definition.body.text.length}/1024</Text>
      </View>

      <View style={styles.footerTextRow}>
        <MaterialCommunityIcons name="text-short" size={20} color={colors.textMuted} />
        <TextInput
          mode="flat"
          value={definition.footer?.text || ""}
          placeholder="Footer (optional)"
          maxLength={60}
          style={styles.footerTextInput}
          underlineColor="transparent"
          activeUnderlineColor="transparent"
          onChangeText={(text) => onChange((current) => ({ ...current, footer: { ...current.footer, text } }))}
        />
      </View>
    </>
  );
}

function ButtonEditor({
  button,
  index,
  onChange,
  onDelete,
}: {
  button: StandardButton;
  index: number;
  onChange: (patch: Partial<StandardButton>) => void;
  onDelete: () => void;
}) {
  const icon = BUTTON_OPTIONS.find((item) => item.type === button.type)?.icon || "gesture-tap-button";
  return (
    <View style={styles.buttonRow}>
      <View style={styles.buttonRowIcon}>
        <MaterialCommunityIcons name={icon as any} size={20} color={colors.primary} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.composerLabel}>BUTTON {index + 1} · {button.type.replaceAll("_", " ")}</Text>
        <TextInput
          mode="flat"
          value={"text" in button ? button.text || "" : "Copy code"}
          placeholder="Button label"
          style={styles.compactFlatInput}
          underlineColor={colors.border}
          activeUnderlineColor={colors.primary}
          onChangeText={(text) => onChange({ text } as Partial<StandardButton>)}
        />
        {button.type === "URL" ? (
          <View>
            <TextInput
              mode="flat"
              value={button.url}
              placeholder="https://example.com"
              autoCapitalize="none"
              style={styles.compactFlatInput}
              underlineColor={colors.border}
              activeUnderlineColor={colors.primary}
              onChangeText={(url) => onChange({ url } as Partial<StandardButton>)}
            />
            <Pressable onPress={() => onChange({ url: appendVariable(button.url) } as Partial<StandardButton>)}>
              <Text style={styles.inlineLink}>+ Dynamic URL value</Text>
            </Pressable>
          </View>
        ) : null}
        {button.type === "PHONE_NUMBER" ? (
          <TextInput
            mode="flat"
            value={button.phoneNumber}
            placeholder="Business phone number"
            keyboardType="phone-pad"
            style={styles.compactFlatInput}
            underlineColor={colors.border}
            activeUnderlineColor={colors.primary}
            onChangeText={(phoneNumber) => onChange({ phoneNumber } as Partial<StandardButton>)}
          />
        ) : null}
        {button.type === "COPY_CODE" ? (
          <TextInput
            mode="flat"
            value={button.example || ""}
            placeholder="Example code for Meta review"
            style={styles.compactFlatInput}
            underlineColor={colors.border}
            activeUnderlineColor={colors.primary}
            onChangeText={(example) => onChange({ example } as Partial<StandardButton>)}
          />
        ) : null}
        {button.type === "FLOW" ? (
          <TextInput
            mode="flat"
            value={button.flowId}
            placeholder="Flow ID"
            style={styles.compactFlatInput}
            underlineColor={colors.border}
            activeUnderlineColor={colors.primary}
            onChangeText={(flowId) => onChange({ flowId } as Partial<StandardButton>)}
          />
        ) : null}
      </View>
      <IconButton icon="close" size={19} onPress={onDelete} accessibilityLabel={`Remove button ${index + 1}`} />
    </View>
  );
}

function AuthenticationComposer({
  definition,
  onChange,
}: {
  definition: WaTemplateDefinition;
  onChange: React.Dispatch<React.SetStateAction<WaTemplateDefinition>>;
}) {
  const otpType = definition.authentication?.otpType || "COPY_CODE";
  return (
    <View>
      <Text style={styles.heroEyebrow}>AUTHENTICATION</Text>
      <Text style={styles.heroTitle}>Keep OTP setup focused.</Text>
      <Text style={styles.heroCopy}>WhatsApp owns the authentication layout. Configure how the code is delivered and provide only the app details Meta needs.</Text>

      <SectionTitle title="OTP action" />
      <View style={styles.choiceList}>
        {[
          { value: "COPY_CODE" as const, title: "Copy code", subtitle: "Customer copies the OTP from WhatsApp" },
          { value: "ONE_TAP" as const, title: "One tap", subtitle: "Android app receives an autofill action" },
          { value: "ZERO_TAP" as const, title: "Zero tap", subtitle: "Eligible Android apps can verify without a tap" },
        ].map((option) => {
          const active = otpType === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange((current) => ({
                ...current,
                authentication: { ...current.authentication, otpType: option.value },
              }))}
              style={({ pressed }) => [styles.choiceRow, pressed && styles.pressed]}
            >
              <View style={styles.flex}>
                <Text style={[styles.choiceTitle, active && styles.choiceTitleActive]}>{option.title}</Text>
                <Text style={styles.choiceDescription}>{option.subtitle}</Text>
              </View>
              <View style={[styles.radio, active && styles.radioActive]}>{active ? <View style={styles.radioInner} /> : null}</View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.switchLine}>
        <View style={styles.flex}>
          <Text style={styles.choiceTitle}>Security recommendation</Text>
          <Text style={styles.choiceDescription}>Let WhatsApp add its standard security guidance.</Text>
        </View>
        <Switch
          value={definition.body.addSecurityRecommendation || false}
          onValueChange={(value) => onChange((current) => ({
            ...current,
            body: { ...current.body, text: "{{1}}", addSecurityRecommendation: value },
          }))}
        />
      </View>

      <TextInput
        mode="flat"
        label="Code expiration (minutes)"
        keyboardType="number-pad"
        value={String(definition.footer?.codeExpirationMinutes || "")}
        style={styles.underlineInput}
        onChangeText={(value) => onChange((current) => ({
          ...current,
          footer: { ...current.footer, codeExpirationMinutes: Number(value) || undefined },
        }))}
      />

      {otpType !== "COPY_CODE" ? (
        <>
          <TextInput
            mode="flat"
            label="Android package name"
            value={definition.authentication?.packageName || ""}
            style={styles.underlineInput}
            onChangeText={(packageName) => onChange((current) => ({
              ...current,
              authentication: { ...current.authentication!, packageName },
            }))}
          />
          <TextInput
            mode="flat"
            label="App signature hash"
            value={definition.authentication?.signatureHash || ""}
            style={styles.underlineInput}
            onChangeText={(signatureHash) => onChange((current) => ({
              ...current,
              authentication: { ...current.authentication!, signatureHash },
            }))}
          />
        </>
      ) : null}

      <SectionTitle title="Preview" />
      <WhatsAppTemplatePreview definition={definition} />
    </View>
  );
}

function ReviewStage({
  definition,
  template,
  validationError,
  onUpdateMapping,
}: {
  definition: WaTemplateDefinition;
  template?: any;
  validationError: string;
  onUpdateMapping: (key: string, patch: Partial<MappingDraft>) => void;
}) {
  return (
    <View>
      <Text style={styles.heroEyebrow}>META REVIEW</Text>
      <Text style={styles.heroTitle}>Show Meta realistic examples.</Text>
      <Text style={styles.heroCopy}>
        Samples are only review data. They do not lock a variable to Customer name, balance, promo code, or any other runtime source.
      </Text>

      {(definition.mappings || []).length ? (
        <View style={styles.sampleList}>
          {(definition.mappings || []).map((mapping) => (
            <View key={mappingKey(mapping)} style={styles.sampleRow}>
              <View style={styles.sampleMeta}>
                <Text style={styles.sampleLabel}>{mappingLabel(mapping)}</Text>
                <Text style={styles.sampleHint}>Example only</Text>
              </View>
              <TextInput
                mode="flat"
                value={mapping.sampleValue}
                placeholder="Example value"
                style={styles.sampleInput}
                underlineColor={colors.borderStrong}
                activeUnderlineColor={colors.primary}
                onChangeText={(sampleValue) => onUpdateMapping(mappingKey(mapping), { sampleValue })}
              />
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.inlineNotice}>
          <MaterialCommunityIcons name="check-circle-outline" size={21} color={colors.success} />
          <Text style={styles.inlineNoticeText}>No variables need sample data.</Text>
        </View>
      )}

      <View style={styles.reviewDivider} />
      <View style={styles.reviewMetaLine}>
        <Text style={styles.reviewMetaLabel}>Category</Text>
        <Text style={styles.reviewMetaValue}>{definition.category}</Text>
      </View>
      <View style={styles.reviewMetaLine}>
        <Text style={styles.reviewMetaLabel}>Language</Text>
        <Text style={styles.reviewMetaValue}>{definition.language}</Text>
      </View>
      <View style={styles.reviewMetaLine}>
        <Text style={styles.reviewMetaLabel}>Runtime bindings</Text>
        <Text style={styles.reviewMetaValue}>Choose when sending</Text>
      </View>

      <SectionTitle title="Final preview" />
      <WhatsAppTemplatePreview definition={definition} />

      {template?.versions?.length ? (
        <>
          <SectionTitle title="Version history" />
          {template.versions.slice(0, 5).map((version: any) => (
            <View key={version.id} style={styles.versionRow}>
              <Text style={styles.versionNumber}>v{version.version}</Text>
              <View style={styles.flex}>
                <Text style={styles.versionStatus}>{version.metaStatus || "Local definition"}</Text>
                <Text style={styles.versionDate}>{new Date(version.createdAt).toLocaleString()}</Text>
              </View>
            </View>
          ))}
        </>
      ) : null}

      {validationError ? (
        <View style={styles.errorLine}>
          <MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.danger} />
          <Text style={styles.errorText}>{validationError}</Text>
        </View>
      ) : (
        <View style={styles.readyLine}>
          <MaterialCommunityIcons name="check-decagram-outline" size={20} color={colors.success} />
          <Text style={styles.readyText}>Ready to submit to Meta for review.</Text>
        </View>
      )}
    </View>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionTitleWrap}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function validateDefinition(definition: WaTemplateDefinition) {
  if (!definition.name.trim()) return "Template name is required.";
  if (!definition.body.text.trim()) return "Message body is required.";
  if (definition.mappings?.some((mapping) => !mapping.sampleValue.trim())) {
    return "Every variable needs a realistic sample value for Meta review.";
  }
  if (definition.category === "AUTHENTICATION" && !definition.authentication) {
    return "Choose an authentication mode.";
  }
  if (definition.buttons?.some((button) => button.type === "FLOW" && !button.flowId.trim())) {
    return "Every Flow button needs a Flow ID.";
  }
  if (
    definition.header
    && ["IMAGE", "VIDEO", "DOCUMENT"].includes(definition.header.format)
    && !definition.header.exampleHandle
  ) {
    return "Media headers need a Meta review example.";
  }
  if (definition.carousel?.type === "MEDIA" && definition.carousel.cards.some((card) => !card.header.exampleHandle)) {
    return "Every media carousel card needs a Meta review example.";
  }
  if (definition.carousel) {
    const first = definition.carousel.cards[0];
    const expectedButtons = first.buttons.map((button) => button.type).join("|");
    const inconsistent = definition.carousel.cards.some((card) => (
      card.header.format !== first.header.format
      || Boolean(card.body) !== Boolean(first.body)
      || card.buttons.map((button) => button.type).join("|") !== expectedButtons
    ));
    if (inconsistent) return "All carousel cards must use the same media, body and button structure.";
  }
  return "";
}

function fromComponents(template: any): WaTemplateDefinition {
  const components = template.components || [];
  const header = components.find((component: any) => String(component.type).toUpperCase() === "HEADER");
  const body = components.find((component: any) => String(component.type).toUpperCase() === "BODY");
  const footer = components.find((component: any) => String(component.type).toUpperCase() === "FOOTER");
  const buttonsComponent = components.find((component: any) => String(component.type).toUpperCase() === "BUTTONS");
  const callPermission = components.some((component: any) => String(component.type).toUpperCase() === "CALL_PERMISSION_REQUEST");

  const buttons: StandardButton[] = (buttonsComponent?.buttons || []).flatMap((button: any) => {
    const type = String(button.type || "").toUpperCase();
    if (type === "URL") return [{ type: "URL", text: button.text || "Visit website", url: button.url || "https://example.com" }];
    if (type === "PHONE_NUMBER") return [{ type: "PHONE_NUMBER", text: button.text || "Call", phoneNumber: button.phone_number || "" }];
    if (type === "COPY_CODE") return [{ type: "COPY_CODE", text: button.text || "Copy code", example: button.example }];
    if (type === "FLOW") return [{ type: "FLOW", text: button.text || "Open", flowId: button.flow_id || "", flowAction: String(button.flow_action || "NAVIGATE").toUpperCase() as any }];
    if (type === "QUICK_REPLY") return [{ type: "QUICK_REPLY", text: button.text || "Reply" }];
    return [];
  });

  return {
    ...EMPTY_DEFINITION,
    name: template.name,
    language: template.language || "en_US",
    category: template.category || "UTILITY",
    parameterFormat: template.parameterFormat || "POSITIONAL",
    subtype: template.subtype,
    header: header
      ? {
          format: String(header.format || "TEXT").toUpperCase() as NonNullable<WaTemplateDefinition["header"]>["format"],
          text: header.text || "",
          exampleHandle: header.example?.header_handle?.[0],
        }
      : { format: "NONE" },
    body: { text: body?.text || "" },
    footer: { text: footer?.text || "" },
    buttons,
    callPermissionRequest: callPermission,
  };
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 128 },
  loadingState: { minHeight: 320, alignItems: "center", justifyContent: "center" },
  muted: { color: colors.textMuted, fontSize: fontSize.sm },
  progressWrap: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  topBackButton: {
    margin: 0,
    marginRight: 2,
  },
  progressSteps: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: spacing.sm,
  },
  progressItem: { flex: 1, flexDirection: "row", alignItems: "center", minWidth: 0 },
  progressDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceOffset,
    borderWidth: 1,
    borderColor: colors.border,
  },
  progressDotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  progressLabel: { marginLeft: 6, color: colors.textMuted, fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  progressLabelActive: { color: colors.textPrimary },
  progressLine: { flex: 1, height: 1, marginHorizontal: 7, backgroundColor: colors.border },
  progressLineActive: { backgroundColor: colors.primary },
  heroEyebrow: { color: colors.primary, fontSize: 10, fontWeight: fontWeight.black, letterSpacing: 1.2 },
  heroTitle: { marginTop: 6, color: colors.textPrimary, fontSize: 25, lineHeight: 31, fontWeight: fontWeight.black },
  heroCopy: { marginTop: 7, color: colors.textSecondary, fontSize: fontSize.sm, lineHeight: 20, marginBottom: spacing.xl },
  fieldLabel: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.bold, marginTop: spacing.sm },
  underlineInput: { backgroundColor: "transparent", paddingHorizontal: 0 },
  helper: { marginTop: 5, color: colors.textMuted, fontSize: fontSize.xs },
  sectionTitleWrap: { marginTop: spacing.xxl, marginBottom: spacing.sm },
  sectionTitle: { color: colors.textPrimary, fontSize: fontSize.md, fontWeight: fontWeight.extrabold },
  sectionSubtitle: { marginTop: 3, color: colors.textSecondary, fontSize: fontSize.xs, lineHeight: 17 },
  choiceList: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  choiceRow: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  choiceTitle: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  choiceTitleActive: { color: colors.primaryDark },
  choiceDescription: { marginTop: 2, color: colors.textSecondary, fontSize: fontSize.xs, lineHeight: 17 },
  radio: { width: 21, height: 21, borderRadius: 11, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  radioActive: { borderColor: colors.primary },
  radioInner: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.primary },
  inlineAction: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  inlineActionIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryLight },
  inlineActionTitle: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  inlineActionSubtitle: { marginTop: 2, color: colors.textSecondary, fontSize: fontSize.xs, lineHeight: 17 },
  composerBlock: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadow.sm,
  },
  composerTopline: { minHeight: 42, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  composerLabel: { color: colors.textMuted, fontSize: 10, fontWeight: fontWeight.black, letterSpacing: 0.8 },
  composerInput: { backgroundColor: colors.surface, fontSize: fontSize.md },
  bodyInput: { minHeight: 150, textAlignVertical: "top" },
  counter: { alignSelf: "flex-end", paddingHorizontal: spacing.md, paddingBottom: spacing.sm, color: colors.textMuted, fontSize: 10 },
  footerTextRow: { marginTop: spacing.sm, minHeight: 54, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  footerTextInput: { flex: 1, backgroundColor: "transparent" },
  reviewMediaRow: { minHeight: 70, marginTop: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  inlineNotice: { marginTop: spacing.lg, flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingVertical: spacing.md },
  inlineNoticeText: { flex: 1, color: colors.textSecondary, fontSize: fontSize.sm, lineHeight: 19 },
  buttonRow: { minHeight: 74, flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  buttonRowIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  compactFlatInput: { backgroundColor: "transparent", paddingHorizontal: 0, minHeight: 46 },
  inlineLink: { color: colors.primary, fontSize: fontSize.xs, fontWeight: fontWeight.bold, paddingVertical: spacing.sm },
  addActionRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  addActionText: { color: colors.primaryDark, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  switchLine: { minHeight: 74, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  sampleList: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  sampleRow: { paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  sampleMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sampleLabel: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  sampleHint: { color: colors.textMuted, fontSize: 10, fontWeight: fontWeight.semibold },
  sampleInput: { marginTop: 2, backgroundColor: "transparent", paddingHorizontal: 0 },
  reviewDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xl },
  reviewMetaLine: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  reviewMetaLabel: { color: colors.textSecondary, fontSize: fontSize.sm },
  reviewMetaValue: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.bold, textAlign: "right" },
  versionRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  versionNumber: { width: 38, color: colors.primary, fontSize: fontSize.sm, fontWeight: fontWeight.black },
  versionStatus: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  versionDate: { marginTop: 2, color: colors.textMuted, fontSize: fontSize.xs },
  errorLine: { marginTop: spacing.xl, flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.dangerLight },
  errorText: { flex: 1, color: colors.danger, fontSize: fontSize.sm, lineHeight: 19 },
  readyLine: { marginTop: spacing.xl, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md },
  readyText: { color: colors.success, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  footer: {
    minHeight: 76,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  secondaryAction: { minHeight: 46, paddingHorizontal: spacing.sm, flexDirection: "row", alignItems: "center", gap: 6 },
  secondaryActionText: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  primaryButton: { borderRadius: radius.lg, backgroundColor: colors.primary },
  primaryButtonContent: { minHeight: 48, paddingHorizontal: spacing.sm },
  sheetList: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  sheetRow: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  sheetIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceOffset },
  sheetIconActive: { backgroundColor: colors.primary },
  sheetTitle: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  sheetSubtitle: { marginTop: 2, color: colors.textSecondary, fontSize: fontSize.xs, lineHeight: 17 },
  pressed: { opacity: 0.68 },
});
