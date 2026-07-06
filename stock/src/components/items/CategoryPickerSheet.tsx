import { useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal as RNModal,
  TouchableWithoutFeedback,
  ActivityIndicator,
} from "react-native";
import { Text, Icon, TextInput } from "react-native-paper";

import { ItemCategory } from "../../api/client";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { getCatPalette, getCatIcon } from "../../utils/items/display";

export function CategoryPickerSheet({
  visible,
  categories,
  selectedCategoryId,
  onSelect,
  onDismiss,
  onCreateNew,
}: {
  visible: boolean;
  categories: ItemCategory[];
  selectedCategoryId: string;
  onSelect: (categoryId: string) => void;
  onDismiss: () => void;
  onCreateNew?: (name: string) => Promise<void>;
}) {
  const [newCatName, setNewCatName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!newCatName.trim() || !onCreateNew) return;
    setIsCreating(true);
    try {
      await onCreateNew(newCatName.trim());
      setNewCatName("");
    } catch (err) {
      // Error handled by caller
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <RNModal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.sheet}>
              <View style={styles.handle} />
              <Text style={styles.title}>Select Category</Text>

              {onCreateNew && (
                <View style={styles.quickAddContainer}>
                  <TextInput
                    mode="outlined"
                    placeholder="Quick add category..."
                    value={newCatName}
                    onChangeText={setNewCatName}
                    style={styles.quickAddInput}
                    outlineStyle={{ borderRadius: radius.md }}
                    disabled={isCreating}
                    dense
                  />
                  <Pressable
                    onPress={handleCreate}
                    disabled={!newCatName.trim() || isCreating}
                    style={({ pressed }) => [
                      styles.quickAddBtn,
                      (!newCatName.trim() || isCreating) && { opacity: 0.5 },
                      pressed && { opacity: 0.7 }
                    ]}
                  >
                    {isCreating ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Icon source="plus" size={20} color={colors.primary} />
                    )}
                  </Pressable>
                </View>
              )}

              <ScrollView showsVerticalScrollIndicator={false}>
                <Pressable
                  onPress={() => onSelect("")}
                  style={[styles.row, !selectedCategoryId && styles.rowActive]}
                >
                  <Icon source="tag-off-outline" size={18} color={colors.textMuted} />
                  <Text style={[styles.rowText, !selectedCategoryId && { color: colors.primary }]}>None</Text>
                  {!selectedCategoryId && <Icon source="check" size={16} color={colors.primary} />}
                </Pressable>
                {categories.map((cat) => (
                  <Pressable
                    key={cat.id}
                    onPress={() => onSelect(cat.id)}
                    style={[styles.row, selectedCategoryId === cat.id && styles.rowActive]}
                  >
                    <Icon source={getCatIcon(cat.name)} size={18} color={getCatPalette(cat.name).icon} />
                    <Text style={[styles.rowText, selectedCategoryId === cat.id && { color: colors.primary }]}>{cat.name}</Text>
                    {selectedCategoryId === cat.id && <Icon source="check" size={16} color={colors.primary} />}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  quickAddContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  quickAddInput: {
    flex: 1,
    height: 40,
    backgroundColor: colors.surface,
  },
  quickAddBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceOffset,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: 40,
    maxHeight: "70%",
    ...shadow.lg,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  rowActive: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    marginHorizontal: -spacing.sm,
  },
  rowText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
});
