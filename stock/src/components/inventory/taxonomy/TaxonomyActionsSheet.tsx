import { useState, useEffect } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Text, Icon } from "react-native-paper";
import { TaxonomyEntity, TaxonomyCopy } from "./taxonomy.types";
import { colors, spacing, radius, fontSize, fontWeight } from "../../../theme";
import { triggerLightHaptic, triggerMediumHaptic } from "../../../utils/haptics";
import { AppBottomSheetModal } from "../../overlays/AppBottomSheetModal";

interface TaxonomyActionsSheetProps<T extends TaxonomyEntity> {
  visible: boolean;
  entity: T | null;
  copy: TaxonomyCopy;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  busy?: boolean;
}

export function TaxonomyActionsSheet<T extends TaxonomyEntity>({
  visible,
  entity,
  copy,
  onClose,
  onEdit,
  onDelete,
  busy = false,
}: TaxonomyActionsSheetProps<T>) {
  const [renderedEntity, setRenderedEntity] = useState<T | null>(null);

  useEffect(() => {
    if (visible && entity) {
      setRenderedEntity(entity);
    }
  }, [visible, entity]);

  if (!renderedEntity) return null;

  const editTitle = copy.editActionTitle ?? `Edit ${copy.singular}`;
  const deleteTitle = copy.deleteActionTitle ?? `Delete ${copy.singular}`;

  return (
    <AppBottomSheetModal
      visible={visible}
      title={renderedEntity.name}
      subtitle={copy.actionsSubtitle ?? `${copy.singular} Management`}
      onDismiss={onClose}
      isBusy={busy}
      fullBleed={true}
    >
      {/* Actions List */}
      <View style={styles.actionsContainer}>
        {/* Edit Action */}
        <Pressable
          disabled={busy}
          onPress={() => {
            triggerLightHaptic();
            onEdit();
          }}
          style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
          accessibilityRole="button"
          accessibilityLabel={`${editTitle}: ${renderedEntity.name}`}
          accessibilityHint={`Opens edit sheet to rename this ${copy.singular.toLowerCase()}`}
          accessibilityState={{ disabled: busy, busy }}
        >
          <View style={[styles.iconWrap, styles.editIconWrap]}>
            <Icon source="pencil-outline" size={20} color={colors.primary} />
          </View>
          <View style={styles.textWrap}>
            <Text style={styles.actionText}>{editTitle}</Text>
            <Text style={styles.actionSubtext}>
              {copy.editActionDescription ?? `Change the name shown across your inventory`}
            </Text>
          </View>
          <Icon source="chevron-right" size={16} color={colors.textMuted} />
        </Pressable>

        <View style={styles.divider} />

        {/* Delete Action */}
        <Pressable
          disabled={busy}
          onPress={() => {
            triggerMediumHaptic();
            onDelete();
          }}
          style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
          accessibilityRole="button"
          accessibilityLabel={`${deleteTitle}: ${renderedEntity.name}`}
          accessibilityHint={`Prompts a confirmation dialog to delete this ${copy.singular.toLowerCase()}`}
          accessibilityState={{ disabled: busy, busy }}
        >
          <View style={[styles.iconWrap, styles.deleteIconWrap]}>
            <Icon source="trash-can-outline" size={20} color={colors.danger} />
          </View>
          <View style={styles.textWrap}>
            <Text style={[styles.actionText, styles.deleteText]}>{deleteTitle}</Text>
            <Text style={styles.actionSubtext}>
              {copy.deleteActionDescription ?? `Available only when no products or records reference it`}
            </Text>
          </View>
          <Icon source="chevron-right" size={16} color={colors.textMuted} />
        </Pressable>
      </View>

      {/* Close Button */}
      <Pressable
        disabled={busy}
        onPress={onClose}
        style={({ pressed }) => [styles.cancelBtn, pressed && styles.cancelBtnPressed]}
        accessibilityRole="button"
        accessibilityLabel="Cancel"
        accessibilityState={{ disabled: busy, busy }}
      >
        <Text style={styles.cancelBtnText}>Cancel</Text>
      </Pressable>
    </AppBottomSheetModal>
  );
}

const styles = StyleSheet.create({
  actionsContainer: {
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.xl,
    overflow: "hidden",
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.surface,
  },
  actionRowPressed: {
    backgroundColor: colors.surfaceOffset,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  editIconWrap: {
    backgroundColor: colors.primaryLight,
  },
  deleteIconWrap: {
    backgroundColor: colors.dangerLight,
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  actionText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  deleteText: {
    color: colors.danger,
  },
  actionSubtext: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: fontWeight.medium,
  },
  divider: {
    height: 0.5,
    backgroundColor: colors.border,
  },
  cancelBtn: {
    alignSelf: "stretch",
    backgroundColor: colors.surfaceOffset,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnPressed: {
    opacity: 0.8,
  },
  cancelBtnText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
});
