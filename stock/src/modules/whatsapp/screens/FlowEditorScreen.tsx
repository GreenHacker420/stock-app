import { useEffect, useState } from "react";
import { Alert, Linking, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Button,
  Chip,
  Divider,
  SegmentedButtons,
  Switch,
  Text,
  TextInput,
} from "react-native-paper";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createWaFlow,
  deployWaFlow,
  deprecateWaFlow,
  fetchWaFlow,
  previewWaFlow,
  publishWaFlow,
  registerWaFlowPublicKey,
  updateWaFlowDraft,
  validateWaFlow,
  WaFlowCategory,
  WaFlowDraft,
} from "../../../api/whatsapp.api";
import { useAuthStore } from "../../../auth/auth-store";
import { useShopStore } from "../../../auth/shop-store";
import { FormTextField } from "../../../components/forms/FormTextField";
import { waColors } from "../whatsapp-ui";
import { KeyboardAwareScreen } from "../../../components/keyboard/KeyboardAwareScreen";

const STARTER_FLOW = {
  version: "7.3",
  screens: [
    {
      id: "WELCOME",
      title: "Welcome",
      terminal: true,
      success: true,
      data: {},
      layout: {
        type: "SingleColumnLayout",
        children: [
          { type: "TextHeading", text: "Welcome" },
          { type: "TextBody", text: "Complete this form to continue." },
          {
            type: "Footer",
            label: "Complete",
            "on-click-action": { name: "complete", payload: {} },
          },
        ],
      },
    },
  ],
};

export function FlowEditorScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const flowId = route.params?.flowId as string | undefined;
  const token = useAuthStore((state) => state.token) || "";
  const shopId = useShopStore((state) => state.activeShopId)!;
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<WaFlowCategory>("OTHER");
  const [endpointEnabled, setEndpointEnabled] = useState(false);
  const [handlerKey, setHandlerKey] = useState("default");
  const [flowJson, setFlowJson] = useState(JSON.stringify(STARTER_FLOW, null, 2));
  const [localError, setLocalError] = useState("");

  const query = useQuery({
    queryKey: ["wa-flow", shopId, flowId],
    enabled: Boolean(flowId),
    queryFn: () => fetchWaFlow(token, shopId, flowId!),
  });

  useEffect(() => {
    navigation.setOptions({
      title: flowId ? "Flow details" : "New Flow",
      headerStyle: { backgroundColor: waColors.greenDark },
      headerTintColor: "#fff",
      headerShadowVisible: false,
    });
  }, [navigation, flowId]);

  useEffect(() => {
    if (!query.data) return;
    setName(query.data.name);
    setDescription(query.data.description || "");
    setCategory(query.data.categories?.[0] || "OTHER");
    setEndpointEnabled(query.data.endpointEnabled);
    setHandlerKey(query.data.handlerKey || "default");
    setFlowJson(JSON.stringify(query.data.flowJson || STARTER_FLOW, null, 2));
  }, [query.data]);

  const parseDraft = (): WaFlowDraft | null => {
    try {
      const parsed = JSON.parse(flowJson);
      setLocalError("");
      return {
        name: name.trim(),
        description: description.trim() || undefined,
        categories: [category],
        flowJson: parsed,
        endpointEnabled,
        handlerKey: endpointEnabled ? handlerKey.trim() || "default" : undefined,
      };
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Invalid JSON");
      return null;
    }
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["wa-flow", shopId, flowId] });
    queryClient.invalidateQueries({ queryKey: ["wa-flow-library", shopId] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const draft = parseDraft();
      if (!draft) throw new Error("Fix the JSON syntax before saving");
      if (!draft.name) throw new Error("Flow name is required");
      return flowId
        ? updateWaFlowDraft(token, shopId, flowId, draft)
        : createWaFlow(token, shopId, draft);
    },
    onSuccess: (flow) => {
      invalidate();
      if (!flowId) navigation.replace("FlowEditor", { flowId: flow.id });
    },
    onError: (error) => Alert.alert("Flow not saved", error.message),
  });

  const validateMutation = useMutation({
    mutationFn: () => validateWaFlow(token, shopId, flowId!),
    onSuccess: (result) => {
      invalidate();
      Alert.alert(result.valid ? "Flow JSON is valid" : "Validation failed", result.valid ? "No local structural issues found." : `${result.errors.length} issue(s) found.`);
    },
    onError: (error) => Alert.alert("Validation failed", error.message),
  });

  const deployMutation = useMutation({
    mutationFn: () => deployWaFlow(token, shopId, flowId!),
    onSuccess: () => {
      invalidate();
      Alert.alert("Flow deployed", "The current JSON revision was uploaded to Meta.");
    },
    onError: (error) => Alert.alert("Deployment failed", error.message),
  });

  const previewMutation = useMutation({
    mutationFn: () => previewWaFlow(token, shopId, flowId!),
    onSuccess: async (preview) => {
      invalidate();
      if (preview.preview_url) await Linking.openURL(preview.preview_url);
    },
    onError: (error) => Alert.alert("Preview failed", error.message),
  });

  const publishMutation = useMutation({
    mutationFn: () => publishWaFlow(token, shopId, flowId!),
    onSuccess: () => {
      invalidate();
      Alert.alert("Flow published", "Published Flow definitions are immutable.");
    },
    onError: (error) => Alert.alert("Publish failed", error.message),
  });

  const deprecateMutation = useMutation({
    mutationFn: () => deprecateWaFlow(token, shopId, flowId!),
    onSuccess: invalidate,
    onError: (error) => Alert.alert("Deprecation failed", error.message),
  });

  const keyMutation = useMutation({
    mutationFn: () => registerWaFlowPublicKey(token, shopId),
    onSuccess: () => Alert.alert("Public key registered", "Meta can now encrypt Flow endpoint requests for this phone number."),
    onError: (error) => Alert.alert("Key registration failed", error.message),
  });

  if (query.isLoading) {
    return <ActivityIndicator style={styles.loader} color={waColors.green} />;
  }

  const flow = query.data;
  const editable = !flow || flow.status === "DRAFT";
  const validationErrors = flow?.validationErrors || [];
  const deployed = flow?.deployedRevision === flow?.localRevision;

  return (
    <KeyboardAwareScreen
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
    >
      {!!flow && (
        <View style={styles.statusBand}>
          <View>
            <Text style={styles.statusTitle}>{flow.status}</Text>
            <Text style={styles.statusMeta}>
              Local revision {flow.localRevision} · {deployed ? "deployed" : "deployment pending"}
            </Text>
          </View>
          <Chip compact style={styles.statusChip}>{flow.jsonVersion || "JSON draft"}</Chip>
        </View>
      )}

      <Section title="Flow">
        <FormTextField label="Name" disabled={!editable} value={name} onChangeText={setName} />
        <FormTextField label="Description" disabled={!editable} value={description} onChangeText={setDescription} />
        <Text style={styles.label}>Category</Text>
        <SegmentedButtons
          value={category}
          onValueChange={(value) => setCategory(value as WaFlowCategory)}
          buttons={[
            { value: "OTHER", label: "Other", disabled: !editable },
            { value: "LEAD_GENERATION", label: "Lead", disabled: !editable },
            { value: "CUSTOMER_SUPPORT", label: "Support", disabled: !editable },
          ]}
        />
        <SegmentedButtons
          value={category}
          onValueChange={(value) => setCategory(value as WaFlowCategory)}
          buttons={[
            { value: "APPOINTMENT_BOOKING", label: "Booking", disabled: !editable },
            { value: "SURVEY", label: "Survey", disabled: !editable },
            { value: "CONTACT_US", label: "Contact", disabled: !editable },
          ]}
        />
        <SegmentedButtons
          value={category}
          onValueChange={(value) => setCategory(value as WaFlowCategory)}
          buttons={[
            { value: "SIGN_UP", label: "Sign up", disabled: !editable },
            { value: "SIGN_IN", label: "Sign in", disabled: !editable },
          ]}
        />
      </Section>

      <Section title="Data endpoint">
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={styles.switchTitle}>Use ShopControl endpoint</Text>
            <Text style={styles.help}>Enables encrypted INIT and data exchange requests.</Text>
          </View>
          <Switch disabled={!editable} value={endpointEnabled} onValueChange={setEndpointEnabled} />
        </View>
        {endpointEnabled && (
          <>
            <FormTextField label="Handler key" disabled={!editable} value={handlerKey} onChangeText={setHandlerKey} />
            {!!flow?.endpointUrl && <Text selectable style={styles.endpoint}>{flow.endpointUrl}</Text>}
            {!!flowId && <Button mode="outlined" icon="key" loading={keyMutation.isPending} onPress={() => keyMutation.mutate()}>Register public key</Button>}
          </>
        )}
      </Section>

      <Section title="Flow JSON">
        <TextInput
          mode="outlined"
          multiline
          disabled={!editable}
          value={flowJson}
          onChangeText={setFlowJson}
          style={styles.jsonInput}
          contentStyle={styles.jsonContent}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {!!localError && <Text selectable style={styles.error}>{localError}</Text>}
      </Section>

      {!!validationErrors.length && (
        <Section title={`Validation issues (${validationErrors.length})`}>
          {validationErrors.map((issue, index) => (
            <View key={index} style={styles.issue}>
              <Text selectable style={styles.issuePath}>{issue.path || issue.error || `Issue ${index + 1}`}</Text>
              <Text selectable style={styles.issueMessage}>{issue.message || issue.error_type || "Meta validation failed"}</Text>
            </View>
          ))}
        </Section>
      )}

      {editable && (
        <View style={styles.actions}>
          <Button mode="contained" icon="content-save" loading={saveMutation.isPending} onPress={() => saveMutation.mutate()} style={styles.primary}>Save draft</Button>
          {!!flowId && (
            <>
              <Button mode="outlined" icon="check-decagram-outline" loading={validateMutation.isPending} onPress={() => validateMutation.mutate()}>Validate</Button>
              <Button mode="outlined" icon="cloud-upload-outline" loading={deployMutation.isPending} onPress={() => deployMutation.mutate()}>Deploy to Meta</Button>
              <Button mode="outlined" icon="eye-outline" loading={previewMutation.isPending} onPress={() => previewMutation.mutate()}>Open preview</Button>
              <Button
                mode="contained"
                icon="publish"
                disabled={!deployed || validationErrors.length > 0}
                loading={publishMutation.isPending}
                onPress={() => Alert.alert("Publish Flow", "Published definitions cannot be edited. Continue?", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Publish", onPress: () => publishMutation.mutate() },
                ])}
                style={styles.primary}
              >
                Publish
              </Button>
            </>
          )}
        </View>
      )}

      {!!flow && flow.status !== "DRAFT" && (
        <Section title="Lifecycle">
          {!!flow.previewUrl && <Button icon="eye-outline" onPress={() => Linking.openURL(flow.previewUrl!)}>Open preview</Button>}
          {["PUBLISHED", "BLOCKED", "THROTTLED"].includes(flow.status) && (
            <Button
              textColor={waColors.danger}
              loading={deprecateMutation.isPending}
              onPress={() => Alert.alert("Deprecate Flow", "This cannot be reversed.", [
                { text: "Cancel", style: "cancel" },
                { text: "Deprecate", style: "destructive", onPress: () => deprecateMutation.mutate() },
              ])}
            >
              Deprecate Flow
            </Button>
          )}
        </Section>
      )}

      {!!flow?.executions?.length && (
        <Section title="Recent executions">
          {flow.executions.map((execution) => (
            <View key={execution.id} style={styles.execution}>
              <View style={styles.executionHeader}>
                <Text style={styles.executionName}>
                  {execution.customer?.name || execution.conversation?.contactName || execution.conversation?.phone}
                </Text>
                <Text style={[styles.executionStatus, execution.status === "FAILED" && styles.error]}>
                  {execution.status}
                </Text>
              </View>
              <Text style={styles.executionMeta}>
                {new Date(execution.startedAt).toLocaleString()}
                {execution.currentScreen ? ` · ${execution.currentScreen}` : ""}
                {execution.attemptCount ? ` · ${execution.attemptCount} request(s)` : ""}
              </Text>
              {!!execution.lastEndpointError && <Text selectable style={styles.error}>{execution.lastEndpointError}</Text>}
              <Divider style={styles.divider} />
            </View>
          ))}
        </Section>
      )}
    </KeyboardAwareScreen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="titleMedium" style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: waColors.surfaceMuted },
  loader: { flex: 1 },
  content: { padding: 12, gap: 12, paddingBottom: 50 },
  statusBand: { minHeight: 62, flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderRadius: 8, backgroundColor: waColors.greenPale },
  statusTitle: { color: waColors.greenDark, fontSize: 15, fontWeight: "800" },
  statusMeta: { color: waColors.textSecondary, fontSize: 11, paddingTop: 3 },
  statusChip: { backgroundColor: waColors.surface },
  section: { gap: 11, padding: 14, borderRadius: 8, backgroundColor: waColors.surface },
  sectionTitle: { color: waColors.text, fontWeight: "700" },
  label: { color: waColors.textSecondary, fontSize: 12 },
  switchRow: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 12 },
  switchText: { flex: 1 },
  switchTitle: { color: waColors.text, fontSize: 14, fontWeight: "600" },
  help: { color: waColors.textSecondary, fontSize: 11, lineHeight: 16, paddingTop: 2 },
  endpoint: { color: waColors.greenDark, fontSize: 11, lineHeight: 16 },
  jsonInput: { minHeight: 390, backgroundColor: waColors.surface },
  jsonContent: { minHeight: 380, fontFamily: "monospace", fontSize: 12, lineHeight: 17 },
  error: { color: waColors.danger, fontSize: 11, lineHeight: 16 },
  issue: { gap: 3, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: waColors.border },
  issuePath: { color: waColors.greenDark, fontFamily: "monospace", fontSize: 11, fontWeight: "700" },
  issueMessage: { color: waColors.textSecondary, fontSize: 12, lineHeight: 17 },
  actions: { gap: 9 },
  primary: { backgroundColor: waColors.green },
  execution: { gap: 4 },
  executionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  executionName: { flex: 1, color: waColors.text, fontSize: 13, fontWeight: "600" },
  executionStatus: { color: waColors.green, fontSize: 10, fontWeight: "800" },
  executionMeta: { color: waColors.textSecondary, fontSize: 10 },
  divider: { marginTop: 7 },
});
