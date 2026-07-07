import { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal as RNModal,
  TouchableWithoutFeedback,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  View as RNView,
} from "react-native";
import { Text, Icon, TextInput } from "react-native-paper";

import { ItemCategory } from "../../api/client";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { getCatPalette, getCatIcon } from "../../utils/items/display";

const KeyboardContainer = Platform.OS === "ios" ? KeyboardAvoidingView : RNView;

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
  useEffect(() => {
    if (visible) {
      Keyboard.dismiss();
    }
  }, [visible]);

  const [searchText, setSearchText] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const cleanSearch = searchText.trim().toLowerCase();

  const filteredCategories = categories.filter((cat) =>
    cat.name.toLowerCase().includes(cleanSearch)
  );

  const exactMatch = categories.find(
    (cat) => cat.name.trim().toLowerCase() === cleanSearch
  );

  const handleCreate = async () => {
    if (!searchText.trim() || !onCreateNew) return;
    setIsCreating(true);
    try {
      await onCreateNew(searchText.trim());
      setSearchText("");
    } catch (err) {
      // Error handled by caller
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
      statusBarTranslucent={true}
      navigationBarTranslucent={true}
    >
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.overlay}>
          <KeyboardContainer
            {...(Platform.OS === "ios" ? { behavior: "padding" } : {})}
            style={{ width: "100%" }}
          >
            <TouchableWithoutFeedback>
              <View style={styles.sheet}>
                <View style={styles.handle} />
                <Text style={styles.title}>Select Category</Text>

                <View style={styles.searchContainer}>
                  <TextInput
                    mode="outlined"
                    placeholder="Search or type new category..."
                    value={searchText}
                    onChangeText={setSearchText}
                    style={styles.searchInput}
                    outlineStyle={{ borderRadius: radius.md }}
                    left={<TextInput.Icon icon="magnify" />}
                    right={
                      searchText.trim().length > 0 ? (
                        <TextInput.Icon icon="close" onPress={() => setSearchText("")} />
                      ) : null
                    }
                    dense
                    disabled={isCreating}
                  />
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                  {searchText.trim().length > 0 && !exactMatch && onCreateNew && (
                    <Pressable
                      onPress={handleCreate}
                      disabled={isCreating}
                      style={[styles.row, styles.createRow]}
                    >
                      {isCreating ? (
                        <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: spacing.sm }} />
                      ) : (
                        <Icon source="plus-circle" size={20} color={colors.primary} />
                      )}
                      <Text style={[styles.rowText, { color: colors.primary, fontWeight: fontWeight.bold }]}>
                        {isCreating ? "Creating..." : `Create Category "${searchText.trim()}"`}
                      </Text>
                    </Pressable>
                  )}

                  <Pressable
                    onPress={() => onSelect("")}
                    style={[styles.row, !selectedCategoryId && styles.rowActive]}
                  >
                    <Icon source="tag-off-outline" size={18} color={colors.textMuted} />
                    <Text style={[styles.rowText, !selectedCategoryId && { color: colors.primary }]}>None</Text>
                    {!selectedCategoryId && <Icon source="check" size={16} color={colors.primary} />}
                  </Pressable>

                  {filteredCategories.map((cat) => (
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
          </KeyboardContainer>
        </View>
      </TouchableWithoutFeedback>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    marginBottom: spacing.md,
  },
  searchInput: {
    height: 40,
    backgroundColor: colors.surface,
  },
  createRow: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary + "30",
    borderWidth: 1,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
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
