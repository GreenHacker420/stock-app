import { Pressable, StyleSheet, View } from "react-native";
import { Icon, Text } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, fontSize, fontWeight, shadow } from "../../../../theme";

interface SaleStepHeaderProps {
  step: number;
  onBack: () => void;
  totalSteps?: number;
}

export function SaleStepHeader({ step, onBack, totalSteps = 3 }: SaleStepHeaderProps) {
  const insets = useSafeAreaInsets();

  const getStepSubtitle = () => {
    switch (step) {
      case 1:
        return "Select Customer & Items";
      case 2:
        return "Review Items & Settings";
      case 3:
        return "Payment & Settlement";
      default:
        return "";
    }
  };

  const progressPercent = (step / totalSteps) * 100;

  return (
    <View style={[styles.header, { paddingTop: insets.top > 0 ? insets.top : spacing.md }]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={onBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back to previous step"
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
        >
          <Icon source="arrow-left" size={24} color={colors.textPrimary} />
        </Pressable>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>Regular Sale</Text>
          <Text style={styles.subtitle}>
            Step {step} of {totalSteps} • {getStepSubtitle()}
          </Text>
        </View>
      </View>

      {/* Thin Progress Bar */}
      <View style={styles.progressBarTrack}>
        <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...shadow.sm,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  backBtn: {
    padding: spacing.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
    marginTop: 2,
  },
  progressBarTrack: {
    height: 3,
    backgroundColor: colors.surfaceOffset,
    width: "100%",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: colors.primary,
  },
  pressed: {
    opacity: 0.7,
  },
});
