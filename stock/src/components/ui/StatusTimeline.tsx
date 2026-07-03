import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";

import { colors, fontSize, fontWeight, radius, spacing } from "../../theme";

type StatusTimelineEvent = {
  label: string;
  subtitle?: string;
  active?: boolean;
};

type StatusTimelineProps = {
  events: readonly StatusTimelineEvent[];
};

export function StatusTimeline({ events }: StatusTimelineProps) {
  return (
    <View style={styles.container}>
      {events.map((event, index) => (
        <View key={`${event.label}-${index}`} style={styles.row}>
          <View style={[styles.dot, event.active && styles.dotActive]} />
          <View style={styles.body}>
            <Text style={[styles.label, event.active && styles.labelActive]}>{event.label}</Text>
            {event.subtitle ? <Text style={styles.subtitle}>{event.subtitle}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    gap: spacing.md,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: radius.full,
    backgroundColor: colors.borderStrong,
    marginTop: 4,
  },
  dotActive: {
    backgroundColor: colors.primary,
  },
  body: { flex: 1, minWidth: 0 },
  label: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  labelActive: { color: colors.textPrimary },
  subtitle: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
});
