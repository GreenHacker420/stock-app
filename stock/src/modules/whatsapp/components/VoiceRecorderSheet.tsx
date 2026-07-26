import { useEffect, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { Button, IconButton, ProgressBar, Text } from "react-native-paper";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { colors as Colors } from "../../../theme";
import { AppBottomSheetModal } from "../../../components/overlays/AppBottomSheetModal";
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
    <AppBottomSheetModal
      visible={visible}
      title="Voice message"
      subtitle={recordedUri ? "Ready to send" : recorderState.isRecording ? "Recording" : "Tap to begin"}
      onDismiss={() => void close()}
      isBusy={uploading}
      maxHeight={0.68}
    >
      <View style={styles.content}>
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
    </AppBottomSheetModal>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
  },
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
