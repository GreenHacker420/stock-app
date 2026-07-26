import { useEffect, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Button, IconButton, Text, TextInput } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors as Colors } from "../../../theme";
import { waColors } from "../whatsapp-ui";
import { AppBottomSheetModal } from "../../../components/overlays/AppBottomSheetModal";
import { triggerSelectionHaptic } from "../../../utils/haptics";
import type { WaOutboundMessage } from "../../../api/whatsapp.api";

type SheetMode = "menu" | "media" | "buttons" | "list";
type MediaKind = "image" | "video";
type MediaSource = "camera" | "library";

type Props = {
  visible: boolean;
  canShareContact: boolean;
  locating: boolean;
  sending: boolean;
  onClose: () => void;
  onOpenTemplates: () => void;
  onOpenFlows: () => void;
  onPickMedia: (kind: "image" | "video" | "document", source?: MediaSource) => void;
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
  { id: "flow", title: "Flow", icon: "form-select", color: "#128C7E" },
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
  onOpenFlows,
  onPickMedia,
  onRecordVoice,
  onShareContact,
  onShareLocation,
  onSend,
}: Props) {
  const [mode, setMode] = useState<SheetMode>("menu");
  const [mediaKind, setMediaKind] = useState<MediaKind>("image");
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
      setMediaKind("image");
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
    triggerSelectionHaptic();
    if (id === "image" || id === "video") {
      setMediaKind(id);
      setMode("media");
      return;
    }
    if (id === "document") {
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
    if (id === "flow") {
      onClose();
      onOpenFlows();
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

  const chooseMediaSource = (source: MediaSource) => {
    triggerSelectionHaptic();
    onClose();
    onPickMedia(mediaKind, source);
  };

  const title = mode === "menu"
    ? "Send message"
    : mode === "media"
      ? mediaKind === "image" ? "Add a photo" : "Add a video"
      : mode === "buttons"
        ? "Quick replies"
        : "List message";
  const subtitle = mode === "menu"
    ? "Choose a WhatsApp message type"
    : mode === "media"
      ? "Capture something new or choose from your gallery"
      : mode === "buttons"
        ? "Add up to three reply choices"
        : "Add up to ten selectable rows";

  return (
    <AppBottomSheetModal
      visible={visible}
      title={title}
      subtitle={subtitle}
      onDismiss={onClose}
      onBack={mode === "menu" ? undefined : () => setMode("menu")}
      backAccessibilityLabel="Back to message types"
      isBusy={sending}
      maxHeight={mode === "menu" ? 0.72 : 0.92}
      scrollable
    >
          {mode === "menu" ? (
            <>
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
                <View style={styles.helper}>
                  <MaterialCommunityIcons name="information-outline" size={18} color={Colors.textSecondary} />
                  <Text style={styles.helperText}>
                    Link this conversation to a customer to share their contact.
                  </Text>
                </View>
              )}
            </>
          ) : mode === "media" ? (
            <View style={styles.mediaSourceRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open camera for ${mediaKind === "image" ? "photo" : "video"}`}
                onPress={() => chooseMediaSource("camera")}
                style={({ pressed }) => [styles.mediaSource, pressed && styles.mediaSourcePressed]}
              >
                <View style={[styles.mediaSourceIcon, styles.cameraSourceIcon]}>
                  <MaterialCommunityIcons
                    name={mediaKind === "image" ? "camera-outline" : "video-outline"}
                    size={30}
                    color="#fff"
                  />
                </View>
                <View style={styles.mediaSourceText}>
                  <Text style={styles.mediaSourceTitle}>Camera</Text>
                  <Text style={styles.mediaSourceSubtitle}>
                    {mediaKind === "image" ? "Take a new photo" : "Record a new video"}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.textMuted} />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Choose ${mediaKind === "image" ? "photo" : "video"} from gallery`}
                onPress={() => chooseMediaSource("library")}
                style={({ pressed }) => [styles.mediaSource, pressed && styles.mediaSourcePressed]}
              >
                <View style={[styles.mediaSourceIcon, styles.gallerySourceIcon]}>
                  <MaterialCommunityIcons name="image-multiple-outline" size={29} color={Colors.primary} />
                </View>
                <View style={styles.mediaSourceText}>
                  <Text style={styles.mediaSourceTitle}>Gallery</Text>
                  <Text style={styles.mediaSourceSubtitle}>Choose an existing file</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.textMuted} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.formContent}>
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
                    label="Open button label"
                    value={listButton}
                    onChangeText={setListButton}
                    maxLength={20}
                    outlineColor="#cbd5e1"
                    activeOutlineColor={waColors.greenDark}
                    style={styles.inputField}
                  />

                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>Selectable Rows</Text>
                    <View style={styles.countBadge}>
                      <Text style={styles.countBadgeText}>{`${rows.length} / 10`}</Text>
                    </View>
                  </View>

                  {rows.map((row, index) => (
                    <View key={index} style={styles.rowCard}>
                      <View style={styles.rowCardHeader}>
                        <View style={styles.rowBadge}>
                          <MaterialCommunityIcons name="format-list-bulleted" size={14} color={waColors.greenDark} />
                          <Text style={styles.rowBadgeText}>Row {index + 1}</Text>
                        </View>
                        {rows.length > 1 && (
                          <TouchableOpacity
                            onPress={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                            style={styles.deleteBtn}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <MaterialCommunityIcons name="trash-can-outline" size={16} color="#ef4444" />
                          </TouchableOpacity>
                        )}
                      </View>
                      <TextInput
                        mode="outlined"
                        label="Title"
                        value={row.title}
                        onChangeText={(value) => updateRow(index, "title", value)}
                        maxLength={24}
                        outlineColor="#e2e8f0"
                        activeOutlineColor={waColors.greenDark}
                        style={styles.inputField}
                      />
                      <TextInput
                        mode="outlined"
                        label="Description (optional)"
                        value={row.description}
                        onChangeText={(value) => updateRow(index, "description", value)}
                        maxLength={72}
                        outlineColor="#e2e8f0"
                        activeOutlineColor={waColors.greenDark}
                        style={styles.inputField}
                      />
                    </View>
                  ))}

                  {rows.length < 10 && (
                    <TouchableOpacity
                      style={styles.addRowBtn}
                      onPress={() => setRows((current) => [...current, { title: "", description: "" }])}
                    >
                      <MaterialCommunityIcons name="plus" size={18} color={waColors.greenDark} />
                      <Text style={styles.addRowBtnText}>Add row</Text>
                    </TouchableOpacity>
                  )}

                  <Button
                    mode="contained"
                    icon="send"
                    disabled={!canSendList || sending}
                    loading={sending}
                    onPress={sendList}
                    buttonColor={waColors.greenDark}
                    textColor="#ffffff"
                    style={styles.sendBtn}
                    contentStyle={{ height: 48 }}
                  >
                    Send list
                  </Button>
                </>
              )}
            </View>
          )}
    </AppBottomSheetModal>
  );
}

const styles = StyleSheet.create({
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingVertical: 6,
  },
  action: {
    width: "25%",
    minHeight: 92,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
    paddingHorizontal: 3,
    paddingVertical: 8,
    borderRadius: 14,
  },
  actionPressed: {
    backgroundColor: Colors.surfaceOffset,
  },
  actionDisabled: {
    opacity: 0.5,
  },
  actionIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: {
    color: Colors.textPrimary,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "500",
    textAlign: "center",
  },
  disabledText: {
    color: Colors.textMuted,
  },
  helper: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 4,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.surfaceOffset,
  },
  helperText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  mediaSourceRow: {
    gap: 10,
    paddingVertical: 4,
  },
  mediaSource: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    borderRadius: 16,
    backgroundColor: Colors.surface,
  },
  mediaSourcePressed: {
    backgroundColor: Colors.surfaceOffset,
  },
  mediaSourceIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  cameraSourceIcon: {
    backgroundColor: Colors.primary,
  },
  gallerySourceIcon: {
    backgroundColor: Colors.primaryLight,
  },
  mediaSourceText: {
    flex: 1,
    gap: 2,
  },
  mediaSourceTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  mediaSourceSubtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  formContent: {
    gap: 14,
    paddingBottom: 12,
  },
  inputField: {
    backgroundColor: "#ffffff",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  countBadge: {
    backgroundColor: "#e2e8f0",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
  rowCard: {
    gap: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    backgroundColor: "#f8fafc",
  },
  rowCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  rowBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: waColors.greenDark,
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#fef2f2",
    alignItems: "center",
    justifyContent: "center",
  },
  addRowBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: waColors.greenDark,
    borderRadius: 12,
    backgroundColor: "#f0fdf4",
  },
  addRowBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: waColors.greenDark,
  },
  sendBtn: {
    borderRadius: 12,
    marginTop: 6,
  },
});
