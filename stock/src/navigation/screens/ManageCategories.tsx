import React, { useState, useCallback, useEffect } from "react";
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
import * as Haptics from "expo-haptics";

import { ItemCategory } from "../../api/client";
import {
  useCategoriesQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
} from "../../hooks/useItems";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";

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
              <Text style={styles.modalTitle}>Edit Category</Text>
              <TextInput
                mode="outlined"
                label="Category Name"
                value={name}
                onChangeText={setName}
                outlineStyle={styles.inputOutline}
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
// Category Row
// ─────────────────────────────────────────────────────────────────────────────
function CategoryRow({
  category,
  onEdit,
  onDelete,
}: {
  category: ItemCategory;
  onEdit: (cat: ItemCategory) => void;
  onDelete: (cat: ItemCategory) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIconWrap}>
        <Icon source="tag-outline" size={18} color={colors.primary} />
      </View>
      <Text style={styles.rowName} numberOfLines={1}>
        {category.name}
      </Text>
      <View style={styles.rowActions}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onEdit(category);
          }}
          style={styles.iconBtn}
        >
          <Icon source="pencil-outline" size={16} color={colors.primary} />
        </Pressable>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onDelete(category);
          }}
          style={[styles.iconBtn, styles.deleteBtn]}
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
export function ManageCategories() {
  const categoriesQuery = useCategoriesQuery();
  const createMutation = useCreateCategoryMutation();
  const updateMutation = useUpdateCategoryMutation();
  const deleteMutation = useDeleteCategoryMutation();

  const [newName, setNewName] = useState("");
  const [editingCategory, setEditingCategory] = useState<ItemCategory | null>(null);

  const categories: ItemCategory[] = categoriesQuery.data ?? [];

  // ── Add ──
  const handleAdd = useCallback(() => {
    if (!newName.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    createMutation.mutate(newName.trim(), {
      onSuccess: () => setNewName(""),
    });
  }, [newName, createMutation]);

  // ── Edit save ──
  const handleEditSave = useCallback(
    (name: string) => {
      if (!editingCategory) return;
      updateMutation.mutate(
        { id: editingCategory.id, name },
        { onSuccess: () => setEditingCategory(null) }
      );
    },
    [editingCategory, updateMutation]
  );

  // ── Delete ──
  const handleDelete = useCallback(
    (cat: ItemCategory) => {
      Alert.alert(
        "Delete Category",
        `Are you sure you want to delete "${cat.name}"? This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              deleteMutation.mutate(cat.id, {
                onError: (err: any) => {
                  Alert.alert(
                    "Cannot Delete",
                    err?.message ?? "This category still has active items assigned to it."
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
        title="Manage Categories"
        subtitle="Organise your product catalogue"
        fallbackRoute="ItemList"
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Add new category row ── */}
        <View style={styles.addCard}>
          <Text style={styles.sectionLabel}>ADD NEW CATEGORY</Text>
          <View style={styles.addRow}>
            <TextInput
              mode="outlined"
              label="Category name"
              value={newName}
              onChangeText={setNewName}
              outlineStyle={styles.inputOutline}
              style={[styles.input, styles.flex1]}
              returnKeyType="done"
              onSubmitEditing={handleAdd}
              left={<TextInput.Icon icon="tag-plus-outline" color={colors.primary} />}
            />
            <Pressable
              onPress={handleAdd}
              disabled={!newName.trim() || createMutation.isPending}
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

        {/* ── Category list ── */}
        <View style={styles.listCard}>
          <View style={styles.listCardHeader}>
            <Text style={styles.sectionLabel}>EXISTING CATEGORIES</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{categories.length}</Text>
            </View>
          </View>

          <Divider style={styles.divider} />

          {categoriesQuery.isLoading ? (
            <SkeletonList count={4} itemHeight={52} />
          ) : categories.length === 0 ? (
            <EmptyState
              icon="tag-off-outline"
              title="No categories yet"
              subtitle="Add your first category above to start organising products."
            />
          ) : (
            categories.map((cat, idx) => (
              <React.Fragment key={cat.id}>
                <CategoryRow
                  category={cat}
                  onEdit={setEditingCategory}
                  onDelete={handleDelete}
                />
                {idx < categories.length - 1 && <Divider style={styles.rowDivider} />}
              </React.Fragment>
            ))
          )}
        </View>

        {/* ── Info tip ── */}
        <View style={styles.tipCard}>
          <Icon source="information-outline" size={16} color={colors.info} />
          <Text style={styles.tipText}>
            Categories help you organise products and quickly filter your inventory. A category can
            only be deleted when no active products are assigned to it.
          </Text>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Edit modal ── */}
      <EditModal
        visible={!!editingCategory}
        initial={editingCategory?.name ?? ""}
        onClose={() => setEditingCategory(null)}
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

  // Category row
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
