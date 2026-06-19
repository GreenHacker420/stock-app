import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Button, IconButton, Text, TextInput } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors as Colors } from "../../../theme";
import type { WaOutboundMessage } from "../../../api/whatsapp.api";

type SheetMode = "menu" | "buttons" | "list";

type Props = {
  visible: boolean;
  canShareContact: boolean;
  locating: boolean;
  sending: boolean;
  onClose: () => void;
  onOpenTemplates: () => void;
  onPickMedia: (kind: "image" | "video" | "document") => void;
  onRecordVoice: () => void;
  onShareContact: () => void;
  onShareLocation: () => Promise<boolean>;
  onSend: (message: WaOutboundMessage) => void;
};

const MENU_ACTIONS = [
  { id: "image", title: "Photo", icon: "image-outline", color: "#0369A1" },
  { id: "video", title: "Video", icon: "video-outline", color: "#C2410C" },
  { id: "document", title: "Document", icon: "file-document-outline", color: "#475569" },
  { id: "voice", title: "Voice note", icon: "microphone-outline", color: "#BE185D" },
  { id: "template", title: "Template", icon: "card-text-outline", color: "#2563EB" },
  { id: "contact", title: "Contact", icon: "account-box-outline", color: "#0F766E" },
  { id: "location", title: "Location", icon: "map-marker-outline", color: "#BE123C" },
  { id: "buttons", title: "Quick replies", icon: "gesture-tap-button", color: "#7C3AED" },
  { id: "list", title: "List", icon: "format-list-bulleted", color: "#B45309" },
] as const;

export function MessageActionSheet({
  visible,
  canShareContact,
  locating,
  sending,
  onClose,
  onOpenTemplates,
  onPickMedia,
  onRecordVoice,
  onShareContact,
  onShareLocation,
  onSend,
}: Props) {
  const [mode, setMode] = useState<SheetMode>("menu");
  const [body, setBody] = useState("");
  const [buttonTitles, setButtonTitles] = useState(["", "", ""]);
  const [listButton, setListButton] = useState("Choose");
  const [rows, setRows] = useState([
    { title: "", description: "" },
    { title: "", description: "" },
  ]);

  useEffect(() => {
    if (!visible) {
      setMode("menu");
      setBody("");
      setButtonTitles(["", "", ""]);
      setListButton("Choose");
      setRows([
        { title: "", description: "" },
        { title: "", description: "" },
      ]);
    }
  }, [visible]);

  const handleMenuAction = async (id: typeof MENU_ACTIONS[number]["id"]) => {
    if (id === "image" || id === "video" || id === "document") {
      onClose();
      onPickMedia(id);
      return;
    }
    if (id === "voice") {
      onClose();
      onRecordVoice();
      return;
    }
    if (id === "template") {
      onClose();
      onOpenTemplates();
      return;
    }
    if (id === "contact") {
      if (!canShareContact) return;
      onShareContact();
      onClose();
      return;
    }
    if (id === "location") {
      const shared = await onShareLocation();
      if (shared) onClose();
      return;
    }
    setMode(id);
  };

  const sendButtons = () => {
    const buttons = buttonTitles
      .map((title, index) => ({ id: `reply_${index + 1}`, title: title.trim() }))
      .filter((button) => button.title);

    onSend({
      kind: "reply_buttons",
      body: body.trim(),
      buttons,
    });
    onClose();
  };

  const sendList = () => {
    const validRows = rows
      .map((row, index) => ({
        id: `list_row_${index + 1}`,
        title: row.title.trim(),
        description: row.description.trim() || undefined,
      }))
      .filter((row) => row.title);

    onSend({
      kind: "list",
      body: body.trim(),
      button: listButton.trim(),
      sections: [{ rows: validRows }],
    });
    onClose();
  };

  const updateRow = (index: number, key: "title" | "description", value: string) => {
    setRows((current) => current.map((row, rowIndex) => (
      rowIndex === index ? { ...row, [key]: value } : row
    )));
  };

  const canSendButtons = body.trim().length > 0 && buttonTitles.some((title) => title.trim());
  const canSendList = body.trim().length > 0
    && listButton.trim().length > 0
    && rows.some((row) => row.title.trim());

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.dismissArea} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grabber} />

          {mode === "menu" ? (
            <>
              <View style={styles.header}>
                <View>
                  <Text variant="titleMedium" style={styles.title}>Send message</Text>
                  <Text variant="bodySmall" style={styles.subtitle}>Choose a structured WhatsApp message</Text>
                </View>
                <IconButton icon="close" onPress={onClose} />
              </View>

              <View style={styles.actionGrid}>
                {MENU_ACTIONS.map((action) => {
                  const disabled = (action.id === "contact" && !canShareContact)
                    || (action.id === "location" && locating);
                  return (
                    <Pressable
                      key={action.id}
                      disabled={disabled}
                      onPress={() => handleMenuAction(action.id)}
                      style={({ pressed }) => [
                        styles.action,
                        pressed && !disabled && styles.actionPressed,
                        disabled && styles.actionDisabled,
                      ]}
                    >
                      <View style={[styles.actionIcon, { backgroundColor: `${action.color}18` }]}>
                        <MaterialCommunityIcons
                          name={action.id === "location" && locating ? "loading" : action.icon}
                          size={26}
                          color={disabled ? Colors.textMuted : action.color}
                        />
                      </View>
                      <Text style={[styles.actionTitle, disabled && styles.disabledText]}>
                        {action.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {!canShareContact && (
                <Text style={styles.helper}>Link this conversation to a customer to share their contact.</Text>
              )}
            </>
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.formContent}
            >
              <View style={styles.header}>
                <IconButton icon="arrow-left" onPress={() => setMode("menu")} />
                <View style={styles.formHeaderText}>
                  <Text variant="titleMedium" style={styles.title}>
                    {mode === "buttons" ? "Quick replies" : "List message"}
                  </Text>
                  <Text variant="bodySmall" style={styles.subtitle}>
                    {mode === "buttons" ? "Add up to three reply choices" : "Add up to ten selectable rows"}
                  </Text>
                </View>
                <IconButton icon="close" onPress={onClose} />
              </View>

              <TextInput
                mode="outlined"
                label="Message"
                value={body}
                onChangeText={setBody}
                maxLength={1024}
                multiline
              />

              {mode === "buttons" ? (
                <>
                  {buttonTitles.map((title, index) => (
                    <TextInput
                      key={index}
                      mode="outlined"
                      label={`Reply ${index + 1}${index === 0 ? "" : " (optional)"}`}
                      value={title}
                      onChangeText={(value) => setButtonTitles((current) => (
                        current.map((item, itemIndex) => itemIndex === index ? value : item)
                      ))}
                      maxLength={20}
                    />
                  ))}
                  <Button
                    mode="contained"
                    icon="send"
                    disabled={!canSendButtons || sending}
                    loading={sending}
                    onPress={sendButtons}
                  >
                    Send quick replies
                  </Button>
                </>
              ) : (
                <>
                  <TextInput
                    mode="outlined"
                    label="Open button"
                    value={listButton}
                    onChangeText={setListButton}
                    maxLength={20}
                  />

                  {rows.map((row, index) => (
                    <View key={index} style={styles.rowEditor}>
                      <View style={styles.rowHeader}>
                        <Text style={styles.rowLabel}>Row {index + 1}</Text>
                        {rows.length > 1 && (
                          <IconButton
                            icon="trash-can-outline"
                            size={18}
                            onPress={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                          />
                        )}
                      </View>
                      <TextInput
                        mode="outlined"
                        label="Title"
                        value={row.title}
                        onChangeText={(value) => updateRow(index, "title", value)}
                        maxLength={24}
                      />
                      <TextInput
                        mode="outlined"
                        label="Description (optional)"
                        value={row.description}
                        onChangeText={(value) => updateRow(index, "description", value)}
                        maxLength={72}
                      />
                    </View>
                  ))}

                  {rows.length < 10 && (
                    <Button
                      mode="outlined"
                      icon="plus"
                      onPress={() => setRows((current) => [...current, { title: "", description: "" }])}
                    >
                      Add row
                    </Button>
                  )}

                  <Button
                    mode="contained"
                    icon="send"
                    disabled={!canSendList || sending}
                    loading={sending}
                    onPress={sendList}
                  >
                    Send list
                  </Button>
                </>
              )}
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.35)",
  },
  dismissArea: {
    flex: 1,
  },
  sheet: {
    maxHeight: "86%",
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.borderStrong,
    alignSelf: "center",
    marginTop: 8,
    marginBottom: 6,
  },
  header: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  formHeaderText: {
    flex: 1,
  },
  title: {
    color: Colors.textPrimary,
    fontWeight: "700",
  },
  subtitle: {
    color: Colors.textSecondary,
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingVertical: 12,
  },
  action: {
    width: "48%",
    minHeight: 96,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    justifyContent: "space-between",
  },
  actionPressed: {
    backgroundColor: Colors.surfaceOffset,
  },
  actionDisabled: {
    opacity: 0.5,
  },
  actionIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: {
    color: Colors.textPrimary,
    fontWeight: "600",
  },
  disabledText: {
    color: Colors.textMuted,
  },
  helper: {
    color: Colors.textSecondary,
    fontSize: 12,
    paddingBottom: 8,
  },
  formContent: {
    gap: 12,
    paddingBottom: 8,
  },
  rowEditor: {
    gap: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
  },
  rowHeader: {
    height: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLabel: {
    color: Colors.textSecondary,
    fontWeight: "600",
  },
});
