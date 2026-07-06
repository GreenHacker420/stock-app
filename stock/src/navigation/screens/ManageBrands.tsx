import { useState, useCallback, useEffect, Fragment } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal as RNModal,
  TouchableWithoutFeedback,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Text, TextInput, Divider, Icon } from "react-native-paper";

import { ItemBrand } from "../../api/client";
import {
  useBrandsQuery,
  useCreateBrandMutation,
  useUpdateBrandMutation,
  useDeleteBrandMutation,
} from "../../hooks/useItems";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { FormTextField } from "../../components/forms/FormTextField";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { triggerLightHaptic, triggerMediumHaptic } from "../../utils/haptics";

// ─────────────────────────────────────────────────────────────────────────────
// Edit Modal
// ─────────────────────────────────────────────────────────────────────────────
function EditModal({
  visible,
  initial,
  onClose,
  onSave,
  isPending,
}: {
  visible: boolean;
  initial: string;
  onClose: () => void;
  onSave: (name: string) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(initial);

  const handleSave = () => {
    if (name.trim()) {
      onSave(name.trim());
    }
  };

  // Sync initial value when modal opens for a new item
  useEffect(() => {
    if (visible) setName(initial);
  }, [visible, initial]);

  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Edit Brand</Text>
              <FormTextField
                label="Brand Name"
                value={name}
                onChangeText={setName}
                style={styles.input}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSave}
              />
              <View style={styles.modalActions}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={onClose}
                  style={styles.flex1}
                />
                <Button
                  label="Save"
                  onPress={handleSave}
                  loading={isPending}
                  disabled={!name.trim() || name.trim() === initial}
                  style={styles.flex1}
                />
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </RNModal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Brand Row
// ─────────────────────────────────────────────────────────────────────────────
function BrandRow({
  brand,
  onEdit,
  onDelete,
}: {
  brand: ItemBrand;
  onEdit: (brand: ItemBrand) => void;
  onDelete: (brand: ItemBrand) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIconWrap}>
        <Icon source="certificate-outline" size={18} color={colors.primary} />
      </View>
      <Text style={styles.rowName} numberOfLines={1}>
        {brand.name}
      </Text>
      <View style={styles.rowActions}>
        <Pressable
          onPress={() => {
            triggerLightHaptic();
            onEdit(brand);
          }}
          style={styles.iconBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${brand.name}`}
        >
          <Icon source="pencil-outline" size={16} color={colors.primary} />
        </Pressable>
        <Pressable
          onPress={() => {
            triggerMediumHaptic();
            onDelete(brand);
          }}
          style={[styles.iconBtn, styles.deleteBtn]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${brand.name}`}
        >
          <Icon source="trash-can-outline" size={16} color={colors.danger} />
        </Pressable>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export function ManageBrands() {
  const brandsQuery = useBrandsQuery();
  const createMutation = useCreateBrandMutation();
  const updateMutation = useUpdateBrandMutation();
  const deleteMutation = useDeleteBrandMutation();

  const [newName, setNewName] = useState("");
  const [editingBrand, setEditingBrand] = useState<ItemBrand | null>(null);

  const brands: ItemBrand[] = brandsQuery.data ?? [];

  // ── Add ──
  const handleAdd = useCallback(() => {
    if (!newName.trim()) return;
    triggerLightHaptic();
    createMutation.mutate(newName.trim(), {
      onSuccess: () => setNewName(""),
    });
  }, [newName, createMutation]);

  // ── Edit save ──
  const handleEditSave = useCallback(
    (name: string) => {
      if (!editingBrand) return;
      updateMutation.mutate(
        { id: editingBrand.id, name },
        { onSuccess: () => setEditingBrand(null) }
      );
    },
    [editingBrand, updateMutation]
  );

  // ── Delete ──
  const handleDelete = useCallback(
    (brand: ItemBrand) => {
      Alert.alert(
        "Delete Brand",
        `Are you sure you want to delete "${brand.name}"? This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              triggerMediumHaptic();
              deleteMutation.mutate(brand.id, {
                onError: (err: any) => {
                  Alert.alert(
                    "Cannot Delete",
                    err?.message ?? "This brand still has active items assigned to it."
                  );
                },
              });
            },
          },
        ]
      );
    },
    [deleteMutation]
  );

  return (
    <Screen edges={["top", "left", "right"]}>
      <AppHeader
        title="Manage Brands"
        subtitle="Organise your products by brand"
        fallbackRoute="ItemList"
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Add new brand row ── */}
          <View style={styles.addCard}>
            <Text style={styles.sectionLabel}>ADD NEW BRAND</Text>
            <View style={styles.addRow}>
              <FormTextField
                label="Brand name"
                value={newName}
                onChangeText={setNewName}
                style={[styles.input, styles.flex1]}
                returnKeyType="done"
                onSubmitEditing={handleAdd}
                left={<TextInput.Icon icon="plus-box-outline" color={colors.primary} />}
              />
              <Pressable
                onPress={handleAdd}
                disabled={!newName.trim() || createMutation.isPending}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Add brand"
                style={({ pressed }) => [
                  styles.addBtn,
                  pressed && { opacity: 0.8, transform: [{ scale: 0.96 }] },
                  (!newName.trim() || createMutation.isPending) && styles.addBtnDisabled,
                ]}
              >
                <Icon source="plus" size={22} color={colors.textInverse} />
              </Pressable>
            </View>
          </View>

          {/* ── Brand list ── */}
          <View style={styles.listCard}>
            <View style={styles.listCardHeader}>
              <Text style={styles.sectionLabel}>EXISTING BRANDS</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{brands.length}</Text>
              </View>
            </View>

            <Divider style={styles.divider} />

            {brandsQuery.isLoading ? (
              <SkeletonList count={4} itemHeight={52} />
            ) : brands.length === 0 ? (
              <EmptyState
                icon="certificate-outline"
                title="No brands yet"
                subtitle="Add your first brand above to start grouping products."
              />
            ) : (
              brands.map((brand, idx) => (
                <Fragment key={brand.id}>
                  <BrandRow
                    brand={brand}
                    onEdit={setEditingBrand}
                    onDelete={handleDelete}
                  />
                  {idx < brands.length - 1 && <Divider style={styles.rowDivider} />}
                </Fragment>
              ))
            )}
          </View>

          {/* ── Info tip ── */}
          <View style={styles.tipCard}>
            <Icon source="information-outline" size={16} color={colors.info} />
            <Text style={styles.tipText}>
              Brands help you filter your inventory more effectively. A brand can only be deleted
              when no active products are assigned to it.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Edit modal ── */}
      <EditModal
        visible={!!editingBrand}
        initial={editingBrand?.name ?? ""}
        onClose={() => setEditingBrand(null)}
        onSave={handleEditSave}
        isPending={updateMutation.isPending}
      />
    </Screen>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 120,
    gap: spacing.lg,
  },

  // Add card
  addCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    ...shadow.sm,
  },
  addRow: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
  },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.md,
  },
  addBtnDisabled: {
    backgroundColor: colors.textMuted,
  },

  // List card
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadow.sm,
  },
  listCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  countBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    minWidth: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: fontWeight.black,
    color: colors.primary,
  },
  divider: {
    backgroundColor: colors.border,
    height: 1,
  },
  rowDivider: {
    backgroundColor: colors.border,
    height: 0.5,
    marginLeft: spacing.lg + 18 + spacing.md, // align under text, past icon
  },

  // Brand row
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  rowIconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  rowName: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  rowActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deleteBtn: {
    backgroundColor: colors.dangerLight,
  },

  // Tip
  tipCard: {
    flexDirection: "row",
    backgroundColor: colors.infoLight,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(2, 132, 199, 0.15)",
  },
  tipText: {
    flex: 1,
    fontSize: 11,
    color: colors.info,
    fontWeight: fontWeight.medium,
    lineHeight: 17,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  modalCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    padding: spacing.xl,
    gap: spacing.lg,
    ...shadow.lg,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  modalActions: {
    flexDirection: "row",
    gap: spacing.md,
  },

  // Shared
  sectionLabel: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  input: {
    backgroundColor: colors.surface,
  },
  inputOutline: {
    borderRadius: radius.md,
  },
  flex1: {
    flex: 1,
  },
});
