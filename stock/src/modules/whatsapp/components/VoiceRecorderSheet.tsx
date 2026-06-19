import { useEffect, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, View } from "react-native";
import { Button, IconButton, ProgressBar, Text } from "react-native-paper";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { colors as Colors } from "../../../theme";
import type { WaLocalMedia } from "../../../api/whatsapp.api";

type Props = {
  visible: boolean;
  uploading: boolean;
  uploadProgress: number;
  onClose: () => void;
  onCancelUpload: () => void;
  onSend: (media: WaLocalMedia) => Promise<void>;
};

function formatDuration(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function VoiceRecorderSheet({
  visible,
  uploading,
  uploadProgress,
  onClose,
  onCancelUpload,
  onSend,
}: Props) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 100);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [recordedDuration, setRecordedDuration] = useState(0);

  useEffect(() => {
    if (!visible) {
      setRecordedUri(null);
      setRecordedDuration(0);
    }
  }, [visible]);

  const startRecording = async () => {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Microphone permission required", "Allow microphone access to record a voice message.");
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: 15 * 60 });
      setRecordedUri(null);
      setRecordedDuration(0);
    } catch (error) {
      Alert.alert(
        "Recording unavailable",
        error instanceof Error ? error.message : "Could not start voice recording.",
      );
    }
  };

  const stopRecording = async () => {
    try {
      const duration = recorderState.durationMillis;
      await recorder.stop();
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
      if (!recorder.uri || duration < 500) {
        Alert.alert("Recording too short", "Record at least half a second before sending.");
        return;
      }
      setRecordedUri(recorder.uri);
      setRecordedDuration(duration);
    } catch (error) {
      Alert.alert(
        "Recording failed",
        error instanceof Error ? error.message : "Could not finish voice recording.",
      );
    }
  };

  const discard = () => {
    setRecordedUri(null);
    setRecordedDuration(0);
  };

  const send = async () => {
    if (!recordedUri) return;
    await onSend({
      kind: "audio",
      uri: recordedUri,
      name: `voice-${Date.now()}.m4a`,
      mimeType: "audio/mp4",
      durationMs: recordedDuration,
    });
  };

  const close = async () => {
    if (recorderState.isRecording) await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.overlay}>
        <Pressable style={styles.dismissArea} onPress={uploading ? undefined : close} />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <View>
              <Text variant="titleMedium" style={styles.title}>Voice message</Text>
              <Text variant="bodySmall" style={styles.subtitle}>
                {recordedUri ? "Ready to send" : recorderState.isRecording ? "Recording" : "Tap to begin"}
              </Text>
            </View>
            <IconButton icon="close" disabled={uploading} onPress={close} />
          </View>

          <View style={styles.recorder}>
            <View style={[styles.pulse, recorderState.isRecording && styles.pulseActive]}>
              <IconButton
                icon={recorderState.isRecording ? "stop" : recordedUri ? "microphone-check" : "microphone"}
                iconColor="#fff"
                size={34}
                disabled={uploading || Boolean(recordedUri)}
                onPress={recorderState.isRecording ? stopRecording : startRecording}
              />
            </View>
            <Text style={styles.time}>
              {formatDuration(recordedUri ? recordedDuration : recorderState.durationMillis)}
            </Text>
          </View>

          {uploading && (
            <View style={styles.progressRow}>
              <ProgressBar progress={uploadProgress} color={Colors.primary} style={styles.progress} />
              <Text style={styles.progressText}>{Math.round(uploadProgress * 100)}%</Text>
            </View>
          )}

          {uploading ? (
            <Button mode="outlined" icon="close" onPress={onCancelUpload}>Cancel upload</Button>
          ) : recordedUri ? (
            <View style={styles.actions}>
              <Button mode="outlined" icon="delete-outline" onPress={discard}>Discard</Button>
              <Button mode="contained" icon="send" onPress={send}>Send voice note</Button>
            </View>
          ) : (
            <Text style={styles.helper}>Maximum recording length is 15 minutes.</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.35)",
  },
  dismissArea: { flex: 1 },
  sheet: {
    gap: 16,
    paddingHorizontal: 16,
    paddingBottom: 24,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.borderStrong,
    alignSelf: "center",
    marginTop: 8,
  },
  header: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { color: Colors.textPrimary, fontWeight: "700" },
  subtitle: { color: Colors.textSecondary },
  recorder: {
    height: 150,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  pulse: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
  },
  pulseActive: {
    backgroundColor: "#DC2626",
  },
  time: {
    color: Colors.textPrimary,
    fontSize: 28,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  progress: { flex: 1, height: 6, borderRadius: 3 },
  progressText: {
    width: 42,
    color: Colors.textSecondary,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  helper: {
    color: Colors.textSecondary,
    textAlign: "center",
    fontSize: 12,
  },
});

