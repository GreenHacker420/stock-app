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

import { ItemBrand } from "../../api/client";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";

const KeyboardContainer = Platform.OS === "ios" ? KeyboardAvoidingView : RNView;

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
  useEffect(() => {
    if (visible) {
      Keyboard.dismiss();
    }
  }, [visible]);

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
                <Text style={styles.title}>Select Brand</Text>

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
                        {isCreating ? "Creating..." : `Create Brand "${searchText.trim()}"`}
                      </Text>
                    </Pressable>
                  )}

                  <Pressable
                    onPress={() => onSelect("")}
                    style={[styles.row, !selectedBrandId && styles.rowActive]}
                  >
                    <Icon source="tag-off-outline" size={18} color={colors.textMuted} />
                    <Text style={[styles.rowText, !selectedBrandId && { color: colors.primary }]}>None</Text>
                    {!selectedBrandId && <Icon source="check" size={16} color={colors.primary} />}
                  </Pressable>

                  {filteredBrands.map((brand) => (
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
    backgroundColor: colors.surfaceOffset,
  },
  rowText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
});
