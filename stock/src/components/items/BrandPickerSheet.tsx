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
import { ItemBrand } from "../../api/client";
import { colors, spacing, radius, fontSize, fontWeight } from "../../theme";

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
  const [searchText, setSearchText] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const cleanSearch = searchText.trim().toLowerCase();

  const filteredBrands = brands.filter((brand) =>
    brand.name.toLowerCase().includes(cleanSearch)
  );

  const exactMatch = brands.find(
    (brand) => brand.name.trim().toLowerCase() === cleanSearch
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

  const handleSelect = (brandId: string) => {
    Keyboard.dismiss();
    setSearchText("");
    onSelect(brandId);
  };

  return (
    <PickerSheet visible={visible} onDismiss={handleDismiss} title="Select Brand">
      <View style={styles.searchContainer}>
        <TextInput
          mode="outlined"
          placeholder="Search or type new brand..."
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
              {isCreating ? "Creating..." : `Create Brand "${searchText.trim()}"`}
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => handleSelect("")}
          style={[styles.row, !selectedBrandId && styles.rowActive]}
        >
          <Icon source="tag-off-outline" size={18} color={colors.textMuted} />
          <Text style={[styles.rowText, !selectedBrandId && styles.rowTextActive]}>None</Text>
          {!selectedBrandId && <Icon source="check" size={16} color={colors.primary} />}
        </Pressable>

        {filteredBrands.map((brand) => {
          const isSelected = selectedBrandId === brand.id;
          return (
            <Pressable
              key={brand.id}
              onPress={() => handleSelect(brand.id)}
              style={[styles.row, isSelected && styles.rowActive]}
            >
              <Icon source="certificate-outline" size={18} color={colors.primary} />
              <Text style={[styles.rowText, isSelected && styles.rowTextActive]}>{brand.name}</Text>
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
