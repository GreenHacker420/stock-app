import { useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Icon, Text } from "react-native-paper";
import { colors, fontSize, fontWeight, radius, spacing } from "@/theme";

interface SaleDateFieldProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}

const dateFromKey = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
};

const dateToKey = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function SaleDateField({ value, onChange, label = "Sale Date" }: SaleDateFieldProps) {
  const [showPicker, setShowPicker] = useState(false);

  const handleChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== "ios") setShowPicker(false);
    if (event.type === "set" && selected) onChange(dateToKey(selected));
  };

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Select ${label.toLowerCase()}`}
        onPress={() => setShowPicker(true)}
        style={({ pressed }) => [styles.field, pressed && styles.pressed]}
      >
        <View style={styles.icon}>
          <Icon source="calendar" size={20} color={colors.primary} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.value}>
            {dateFromKey(value).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </Text>
        </View>
        <Icon source="chevron-down" size={20} color={colors.textSecondary} />
      </Pressable>

      {showPicker && (
        <View style={Platform.OS === "ios" ? styles.iosPicker : undefined}>
          <DateTimePicker
            value={dateFromKey(value)}
            mode="date"
            maximumDate={new Date()}
            onChange={handleChange}
            display={Platform.OS === "ios" ? "inline" : "default"}
          />
          {Platform.OS === "ios" && (
            <Pressable onPress={() => setShowPicker(false)} style={styles.doneButton}>
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  field: {
    minHeight: 64,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
  },
  pressed: {
    opacity: 0.7,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.successLight,
    marginRight: spacing.sm,
  },
  copy: {
    flex: 1,
  },
  label: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  value: {
    marginTop: 2,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  iosPicker: {
    margin: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  doneButton: {
    alignItems: "center",
    padding: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  doneText: {
    color: colors.primary,
    fontWeight: fontWeight.bold,
  },
});
