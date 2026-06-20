import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, IconButton, Searchbar, Text, TextInput } from "react-native-paper";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWaFlows, sendWaFlow, WaFlow } from "../../../api/whatsapp.api";
import { useAuthStore } from "../../../auth/auth-store";
import { waColors } from "../whatsapp-ui";

type Props = {
  visible: boolean;
  shopId?: string | null;
  conversationId: string;
  to: string;
  onClose: () => void;
};

export function FlowSendSheet({ visible, shopId, conversationId, to, onClose }: Props) {
  const token = useAuthStore((state) => state.token) || "";
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<WaFlow | null>(null);
  const [cta, setCta] = useState("Open form");
  const [body, setBody] = useState("Please complete this form.");
  const [header, setHeader] = useState("");
  const [footer, setFooter] = useState("");
  const [initialScreen, setInitialScreen] = useState("");
  const [seedJson, setSeedJson] = useState("{}");

  const query = useQuery({
    queryKey: ["wa-flow-send", shopId, search],
    enabled: Boolean(visible && shopId),
    queryFn: () => fetchWaFlows(token, shopId!, {
      status: "PUBLISHED",
      search: search.trim() || undefined,
      pageSize: 100,
    }),
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
      queryClient.invalidateQueries({ queryKey: ["wa-messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["wa-conversations", shopId] });
      close();
    },
    onError: (error) => Alert.alert("Flow not sent", error.message),
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.overlay}>
        <Pressable style={styles.dismiss} onPress={close} />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.headerRow}>
            {selected ? <IconButton icon="arrow-left" onPress={() => setSelected(null)} /> : <View style={styles.spacer} />}
            <Text variant="titleMedium" style={styles.title}>{selected?.name || "Send Flow"}</Text>
            <IconButton icon="close" onPress={close} />
          </View>

          {selected ? (
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <View style={styles.flowPreview}>
                <View style={styles.previewIcon}>
                  <IconButton icon="form-select" iconColor="#fff" />
                </View>
                <View style={styles.previewBody}>
                  {!!header && <Text style={styles.previewHeader}>{header}</Text>}
                  <Text style={styles.previewText}>{body || "Please complete this form."}</Text>
                  {!!footer && <Text style={styles.previewFooter}>{footer}</Text>}
                </View>
                <View style={styles.previewButton}>
                  <Text style={styles.previewButtonText}>{cta || "Open form"}</Text>
                </View>
              </View>
              <TextInput mode="outlined" label="Button text" maxLength={30} value={cta} onChangeText={setCta} />
              <TextInput mode="outlined" label="Message" multiline maxLength={1024} value={body} onChangeText={setBody} />
              <TextInput mode="outlined" label="Header (optional)" maxLength={60} value={header} onChangeText={setHeader} />
              <TextInput mode="outlined" label="Footer (optional)" maxLength={60} value={footer} onChangeText={setFooter} />
              {!selected.endpointEnabled && (
                <TextInput mode="outlined" label="Initial screen ID" value={initialScreen} onChangeText={setInitialScreen} />
              )}
              <TextInput
                mode="outlined"
                label="Initial data JSON"
                multiline
                value={seedJson}
                onChangeText={setSeedJson}
                contentStyle={styles.json}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Button
                mode="contained"
                icon="send"
                style={styles.send}
                loading={mutation.isPending}
                disabled={!cta.trim() || !body.trim() || mutation.isPending}
                onPress={() => mutation.mutate()}
              >
                Send Flow
              </Button>
            </ScrollView>
          ) : (
            <>
              <Searchbar value={search} onChangeText={setSearch} placeholder="Search published Flows" style={styles.search} />
              {query.isLoading ? (
                <ActivityIndicator style={styles.loader} color={waColors.green} />
              ) : (
                <ScrollView contentContainerStyle={styles.list}>
                  {(query.data?.data || []).map((flow) => (
                    <Pressable key={flow.id} onPress={() => setSelected(flow)} style={styles.row}>
                      <View style={styles.rowIcon}><IconButton icon="form-select" iconColor="#fff" /></View>
                      <View style={styles.rowBody}>
                        <Text style={styles.rowName}>{flow.name}</Text>
                        <Text style={styles.rowMeta}>
                          {(flow.categories || ["OTHER"]).join(" · ")}
                          {flow.endpointEnabled ? " · Data endpoint" : " · Static"}
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

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.35)" },
  dismiss: { flex: 1 },
  sheet: { height: "88%", borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: waColors.surface },
  grabber: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 8, backgroundColor: "#CDD2D5" },
  headerRow: { height: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  spacer: { width: 48 },
  title: { color: waColors.text, fontWeight: "700" },
  search: { marginHorizontal: 12, marginBottom: 8, backgroundColor: waColors.surfaceMuted },
  loader: { flex: 1 },
  list: { paddingBottom: 30 },
  row: { minHeight: 72, flexDirection: "row", alignItems: "center", paddingHorizontal: 14 },
  rowIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: waColors.green },
  rowBody: { flex: 1, minWidth: 0, marginLeft: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: waColors.border },
  rowName: { color: waColors.text, fontSize: 15, fontWeight: "600" },
  rowMeta: { color: waColors.textSecondary, fontSize: 11, paddingTop: 3 },
  content: { gap: 12, padding: 14, paddingBottom: 40 },
  flowPreview: { overflow: "hidden", borderRadius: 8, backgroundColor: waColors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: waColors.border },
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
