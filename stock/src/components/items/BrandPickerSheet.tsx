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

import { ItemBrand } from "../../api/client";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";

export function BrandPickerSheet({
  visible,
  brands,
  selectedBrandId,
  onSelect,
  onDismiss,
  onCreateNew,
}: {
  visible: boolean;
  brands: ItemBrand[];
  selectedBrandId: string;
  onSelect: (brandId: string) => void;
  onDismiss: () => void;
  onCreateNew?: (name: string) => Promise<void>;
}) {
  const [newBrandName, setNewBrandName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!newBrandName.trim() || !onCreateNew) return;
    setIsCreating(true);
    try {
      await onCreateNew(newBrandName.trim());
      setNewBrandName("");
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
              <Text style={styles.title}>Select Brand</Text>

              {onCreateNew && (
                <View style={styles.quickAddContainer}>
                  <TextInput
                    mode="outlined"
                    placeholder="Quick add brand..."
                    value={newBrandName}
                    onChangeText={setNewBrandName}
                    style={styles.quickAddInput}
                    outlineStyle={{ borderRadius: radius.md }}
                    disabled={isCreating}
                    dense
                  />
                  <Pressable
                    onPress={handleCreate}
                    disabled={!newBrandName.trim() || isCreating}
                    style={({ pressed }) => [
                      styles.quickAddBtn,
                      (!newBrandName.trim() || isCreating) && { opacity: 0.5 },
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
                  style={[styles.row, !selectedBrandId && styles.rowActive]}
                >
                  <Icon source="tag-off-outline" size={18} color={colors.textMuted} />
                  <Text style={[styles.rowText, !selectedBrandId && { color: colors.primary }]}>None</Text>
                  {!selectedBrandId && <Icon source="check" size={16} color={colors.primary} />}
                </Pressable>
                {brands.map((brand) => (
                  <Pressable
                    key={brand.id}
                    onPress={() => onSelect(brand.id)}
                    style={[styles.row, selectedBrandId === brand.id && styles.rowActive]}
                  >
                    <Icon source="certificate-outline" size={18} color={colors.primary} />
                    <Text style={[styles.rowText, selectedBrandId === brand.id && { color: colors.primary }]}>{brand.name}</Text>
                    {selectedBrandId === brand.id && <Icon source="check" size={16} color={colors.primary} />}
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
    backgroundColor: colors.surfaceOffset,
  },
  rowText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
});
