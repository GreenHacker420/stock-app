import { useDeferredValue, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, IconButton, Searchbar, Text, TextInput } from "react-native-paper";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWaFlows, sendWaFlow, WaFlow } from "../../../api/whatsapp.api";
import { useAuthStore } from "../../../auth/auth-store";
import { AppBottomSheetModal } from "../../../components/overlays/AppBottomSheetModal";
import { waColors } from "../whatsapp-ui";

type Props = {
  visible: boolean;
  shopId?: string | null;
  integrationId: string;
  conversationId: string;
  to: string;
  onClose: () => void;
};

export function FlowSendSheet({ visible, shopId, integrationId, conversationId, to, onClose }: Props) {
  const token = useAuthStore((state) => state.token) || "";
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [selected, setSelected] = useState<WaFlow | null>(null);
  const [cta, setCta] = useState("Open form");
  const [body, setBody] = useState("Please complete this form.");
  const [header, setHeader] = useState("");
  const [footer, setFooter] = useState("");
  const [initialScreen, setInitialScreen] = useState("");
  const [seedJson, setSeedJson] = useState("{}");

  const query = useQuery({
    queryKey: ["wa-flow-send", shopId, deferredSearch],
    enabled: visible && Boolean(shopId),
    queryFn: () => fetchWaFlows(token, shopId!, {
      status: "PUBLISHED",
      search: deferredSearch || undefined,
      pageSize: 100,
    }),
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });

  const close = () => {
    setSelected(null);
    setSearch("");
    setSeedJson("{}");
    onClose();
  };

  const mutation = useMutation({
    mutationFn: async () => {
      let data;
      try {
        data = JSON.parse(seedJson || "{}");
      } catch {
        throw new Error("Initial data must be valid JSON");
      }
      return sendWaFlow(token, shopId!, selected!.id, {
        conversationId,
        to,
        cta: cta.trim(),
        body: body.trim(),
        header: header.trim() || undefined,
        footer: footer.trim() || undefined,
        mode: "published",
        action: selected!.endpointEnabled ? "data_exchange" : "navigate",
        initialScreen: initialScreen.trim() || undefined,
        data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "messages", shopId, integrationId, conversationId] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "conversations", shopId, integrationId] });
      close();
    },
    onError: (error) => Alert.alert("Flow not sent", error.message),
  });

  return (
    <AppBottomSheetModal
      visible={visible}
      title={selected?.name || "Send a flow"}
      subtitle={selected ? "Customize the message and launch action" : "Choose a published WhatsApp flow"}
      onDismiss={close}
      onBack={selected ? () => setSelected(null) : undefined}
      backAccessibilityLabel="Back to flows"
      isBusy={mutation.isPending}
      maxHeight={0.94}
      scrollable
    >
      {selected ? (
        <View style={styles.content}>
          <View style={styles.flowPreview}>
            <View style={styles.previewIcon}><IconButton icon="form-select" iconColor="#fff" /></View>
            <View style={styles.previewBody}>
              {!!header && <Text style={styles.previewHeader}>{header}</Text>}
              <Text style={styles.previewText}>{body || "Please complete this form."}</Text>
              {!!footer && <Text style={styles.previewFooter}>{footer}</Text>}
            </View>
            <View style={styles.previewButton}><Text style={styles.previewButtonText}>{cta || "Open form"}</Text></View>
          </View>
          <TextInput mode="outlined" label="Button text" maxLength={30} value={cta} onChangeText={setCta} />
          <TextInput mode="outlined" label="Message" multiline maxLength={1024} value={body} onChangeText={setBody} />
          <TextInput mode="outlined" label="Header (optional)" maxLength={60} value={header} onChangeText={setHeader} />
          <TextInput mode="outlined" label="Footer (optional)" maxLength={60} value={footer} onChangeText={setFooter} />
          {!selected.endpointEnabled && <TextInput mode="outlined" label="Initial screen ID" value={initialScreen} onChangeText={setInitialScreen} />}
          <TextInput mode="outlined" label="Initial data JSON" multiline value={seedJson} onChangeText={setSeedJson} contentStyle={styles.json} autoCapitalize="none" autoCorrect={false} />
          <Button mode="contained" icon="send" style={styles.send} loading={mutation.isPending} disabled={!cta.trim() || !body.trim() || mutation.isPending} onPress={() => mutation.mutate()}>
            Send Flow
          </Button>
        </View>
      ) : (
        <View style={styles.browser}>
          <Searchbar value={search} onChangeText={setSearch} placeholder="Search published Flows" style={styles.search} />
          {query.isLoading ? (
            <ActivityIndicator style={styles.loader} color={waColors.green} />
          ) : (
            <View style={styles.list}>
              {(query.data?.data || []).map((flow) => (
                <Pressable key={flow.id} onPress={() => setSelected(flow)} style={styles.row}>
                  <View style={styles.rowIcon}><IconButton icon="form-select" iconColor="#fff" /></View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowName}>{flow.name}</Text>
                    <Text style={styles.rowMeta}>{(flow.categories || ["OTHER"]).join(" · ")}{flow.endpointEnabled ? " · Data endpoint" : " · Static"}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}
    </AppBottomSheetModal>
  );
}

const styles = StyleSheet.create({
  browser: { gap: 10 },
  search: { backgroundColor: waColors.surfaceMuted, borderRadius: 14 },
  loader: { height: 180, justifyContent: "center" },
  list: { paddingBottom: 12 },
  row: { minHeight: 72, flexDirection: "row", alignItems: "center" },
  rowIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: waColors.green },
  rowBody: { flex: 1, minWidth: 0, marginLeft: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: waColors.border },
  rowName: { color: waColors.text, fontSize: 15, fontWeight: "600" },
  rowMeta: { color: waColors.textSecondary, fontSize: 11, paddingTop: 3 },
  content: { gap: 12, paddingBottom: 12 },
  flowPreview: { overflow: "hidden", borderRadius: 16, backgroundColor: waColors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: waColors.border },
  previewIcon: { height: 72, alignItems: "center", justifyContent: "center", backgroundColor: waColors.green },
  previewBody: { gap: 4, padding: 10 },
  previewHeader: { color: waColors.text, fontSize: 14, fontWeight: "700" },
  previewText: { color: waColors.text, fontSize: 13, lineHeight: 18 },
  previewFooter: { color: waColors.textSecondary, fontSize: 11 },
  previewButton: { height: 42, alignItems: "center", justifyContent: "center", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: waColors.border },
  previewButtonText: { color: "#027EB5", fontSize: 14, fontWeight: "600" },
  json: { minHeight: 90, fontFamily: "monospace", fontSize: 12 },
  send: { backgroundColor: waColors.green },
});
