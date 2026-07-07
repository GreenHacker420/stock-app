import { useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
  Keyboard,
} from "react-native";
import { Text, Icon, TextInput } from "react-native-paper";
import { PickerSheet } from "./PickerSheet";
import { ItemCategory } from "../../api/client";
import { colors, spacing, radius, fontSize, fontWeight } from "../../theme";
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

  const handleDismiss = () => {
    Keyboard.dismiss();
    setSearchText("");
    onDismiss();
  };

  const handleSelect = (categoryId: string) => {
    Keyboard.dismiss();
    setSearchText("");
    onSelect(categoryId);
  };

  return (
    <PickerSheet visible={visible} onDismiss={handleDismiss} title="Select Category">
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

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      >
        {searchText.trim().length > 0 && !exactMatch && onCreateNew && (
          <Pressable
            onPress={handleCreate}
            disabled={isCreating}
            style={[styles.row, styles.createRow]}
          >
            {isCreating ? (
              <ActivityIndicator size="small" color={colors.primary} style={styles.createSpinner} />
            ) : (
              <Icon source="plus-circle" size={20} color={colors.primary} />
            )}
            <Text style={styles.createRowText}>
              {isCreating ? "Creating..." : `Create Category "${searchText.trim()}"`}
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => handleSelect("")}
          style={[styles.row, !selectedCategoryId && styles.rowActive]}
        >
          <Icon source="tag-off-outline" size={18} color={colors.textMuted} />
          <Text style={[styles.rowText, !selectedCategoryId && styles.rowTextActive]}>None</Text>
          {!selectedCategoryId && <Icon source="check" size={16} color={colors.primary} />}
        </Pressable>

        {filteredCategories.map((cat) => {
          const isSelected = selectedCategoryId === cat.id;
          return (
            <Pressable
              key={cat.id}
              onPress={() => handleSelect(cat.id)}
              style={[styles.row, isSelected && styles.rowActive]}
            >
              <Icon source={getCatIcon(cat.name)} size={18} color={getCatPalette(cat.name).icon} />
              <Text style={[styles.rowText, isSelected && styles.rowTextActive]}>{cat.name}</Text>
              {isSelected && <Icon source="check" size={16} color={colors.primary} />}
            </Pressable>
          );
        })}
      </ScrollView>
    </PickerSheet>
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
  list: {
    flexShrink: 1,
  },
  listContent: {
    paddingBottom: spacing.md,
  },
  createSpinner: {
    marginRight: spacing.sm,
  },
  createRowText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.primary,
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
  rowTextActive: {
    color: colors.primary,
  },
});
