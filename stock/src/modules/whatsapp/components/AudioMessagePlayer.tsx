import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { IconButton, ProgressBar, Text } from "react-native-paper";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { colors as Colors } from "../../../theme";

type Props = {
  url?: string;
  voice?: boolean;
  fallbackDurationMs?: number;
};

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

export function AudioMessagePlayer({ url, voice, fallbackDurationMs }: Props) {
  const player = useAudioPlayer(url ? { uri: url } : null, { updateInterval: 200 });
  const status = useAudioPlayerStatus(player);
  const duration = status.duration || (fallbackDurationMs || 0) / 1000;
  const progress = duration > 0 ? Math.min(status.currentTime / duration, 1) : 0;

  useEffect(() => {
    if (status.didJustFinish) {
      player.seekTo(0).catch(() => undefined);
    }
  }, [player, status.didJustFinish]);

  const togglePlayback = async () => {
    if (!url) return;
    if (status.playing) {
      player.pause();
      return;
    }
    if (duration > 0 && status.currentTime >= duration - 0.1) {
      await player.seekTo(0);
    }
    player.play();
  };

  return (
    <View style={styles.container}>
      <IconButton
        icon={status.playing ? "pause" : voice ? "microphone" : "play"}
        size={24}
        disabled={!url || status.isBuffering}
        loading={status.isBuffering}
        onPress={togglePlayback}
        style={styles.control}
      />
      <View style={styles.timeline}>
        <ProgressBar progress={progress} color={Colors.primary} style={styles.progress} />
        <View style={styles.durationRow}>
          <Text style={styles.label}>{voice ? "Voice message" : "Audio"}</Text>
          <Text style={styles.duration}>
            {formatDuration(status.playing ? status.currentTime : duration)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 230,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  control: {
    margin: 0,
  },
  timeline: {
    flex: 1,
    gap: 5,
  },
  progress: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.borderStrong,
  },
  durationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 11,
  },
  duration: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
});

