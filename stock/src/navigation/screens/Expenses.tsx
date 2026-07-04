import React, { useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Text, Icon, Divider, Modal, Portal } from "react-native-paper";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { fetchExpenses, createExpense, verifyExpense, Expense } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { FormScreen } from "../../components/layout/FormScreen";
import { ScreenSection } from "../../components/layout/ScreenSection";
import { StatusPill } from "../../components/ui/StatusPill";
import { EmptyState } from "../../components/ui/EmptyState";
import { SuccessModal } from "../../components/ui/SuccessModal";
import { Button } from "../../components/ui/Button";
import { FormTextField } from "../../components/forms/FormTextField";
import { AmountInput } from "../../components/forms/AmountInput";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { newIdempotencyKey } from "../../utils/idempotency";
import { requireActiveShopId } from "../../hooks/useActiveShop";

const expenseCategories = [
  "TEA_SNACKS", "FREIGHT", "COURIER", "PORTER", "PACKAGING", "LABOUR", "PETROL", "ELECTRICITY", "INTERNET", "MISC"
];

function money(value?: string | number | null) {
  return `₹${Number(value ?? 0).toLocaleString("en-IN")}`;
}

export function ExpenseList() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const { activeShopId } = useShopStore();
  const queryClient = useQueryClient();

  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);

  const expensesQuery = useQuery({
    queryKey: ["expenses", activeShopId],
    queryFn: () => fetchExpenses(token ?? "", activeShopId ?? ""),
    enabled: !!token && !!activeShopId,
  });

  const verifyMutation = useMutation({
    mutationFn: (id: string) => verifyExpense(token ?? "", id, "APPROVED"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["expenses", activeShopId] }),
  });

  const [form, setForm] = useState({ amount: "", category: "MISC", note: "" });
  const addMutation = useMutation({
    mutationFn: () =>
      createExpense(token ?? "", { ...form, amount: Number(form.amount), shopId: requireActiveShopId(activeShopId) }, { idempotencyKey: newIdempotencyKey("EXPENSE") }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses", activeShopId] });
      setIsAddModalVisible(false);
      setForm({ amount: "", category: "MISC", note: "" });
      setSuccessVisible(true);
    }
  });

  const isOwner = user?.role === "OWNER";

  return (
    <>
      <FormScreen title="Shop Expenses" subtitle="Track and verify daily outgoings" showBack>
        <Button
          variant="primary"
          label="Log Expense"
          icon={<Icon source="plus" size={18} color="white" />}
          onPress={() => setIsAddModalVisible(true)}
        />

        <ScreenSection title="Recent Expenses">
          <View style={styles.listContainer}>
            {expensesQuery.data?.map((exp: Expense, idx: number) => (
              <View key={exp.id}>
                <View style={styles.expenseItem}>
                  <View style={styles.expenseInfo}>
                    <Text style={styles.amountText}>{money(exp.amount)}</Text>
                    <Text style={styles.categoryText}>{exp.category.replace('_', ' ')}</Text>
                    <Text style={styles.noteText}>{exp.note || "No note provided"}</Text>
                    <Text style={styles.createdByText}>By {exp.createdBy.name} • {new Date(exp.createdAt).toLocaleDateString()}</Text>
                  </View>
                  <View style={styles.expenseStatus}>
                    <StatusPill
                      label={exp.status}
                      tone={exp.status === 'APPROVED' ? 'green' : exp.status === 'PENDING' ? 'amber' : 'red'}
                    />
                    {isOwner && exp.status === 'PENDING' && (
                      <Button
                        label="Verify"
                        variant="ghost"
                        onPress={() => verifyMutation.mutate(exp.id)}
                        loading={verifyMutation.isPending && verifyMutation.variables === exp.id}
                        style={{ marginTop: 8 }}
                      />
                    )}
                  </View>
                </View>
                {idx < (expensesQuery.data?.length ?? 0) - 1 && <Divider style={styles.divider} />}
              </View>
            ))}
            {expensesQuery.data?.length === 0 && (
              <EmptyState title="No expenses yet" subtitle="No expenses logged for this shop." />
            )}
          </View>
        </ScreenSection>
      </FormScreen>

      <Portal>
        <Modal visible={isAddModalVisible} onDismiss={() => setIsAddModalVisible(false)} contentContainerStyle={styles.modalContent}>
          <Text style={styles.modalTitle}>Log Expense</Text>
          <AmountInput
            label="Amount"
            value={form.amount}
            onChangeText={(v) => setForm(f => ({ ...f, amount: v }))}
            style={styles.input}
          />
          <View style={styles.categoryGrid}>
            {expenseCategories.map(cat => (
              <Pressable
                key={cat}
                onPress={() => setForm(f => ({ ...f, category: cat }))}
                style={[styles.catBtn, form.category === cat && styles.catBtnActive]}
              >
                <Text style={[styles.catBtnText, form.category === cat && styles.catBtnTextActive]}>{cat.replace('_', ' ')}</Text>
              </Pressable>
            ))}
          </View>
          <FormTextField
            label="Notes / Purpose"
            value={form.note}
            onChangeText={(v) => setForm(f => ({ ...f, note: v }))}
            multiline
            numberOfLines={2}
            style={styles.input}
          />
          <Button
            variant="primary"
            label="Save Expense"
            onPress={() => addMutation.mutate()}
            loading={addMutation.isPending}
            disabled={!form.amount || Number(form.amount) <= 0}
          />
        </Modal>
      </Portal>

      <SuccessModal
        visible={successVisible}
        title="Expense Logged"
        message="The expense has been successfully recorded and sent for verification."
        onClose={() => setSuccessVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  listContainer: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: spacing.md, ...shadow.sm },
  expenseItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.md },
  expenseInfo: { flex: 1, gap: 2 },
  amountText: { fontSize: 18, fontWeight: fontWeight.black, color: colors.textPrimary },
  categoryText: { fontSize: 12, fontWeight: fontWeight.bold, color: colors.primary },
  noteText: { fontSize: 13, color: colors.textSecondary },
  createdByText: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  expenseStatus: { alignItems: 'flex-end' },
  divider: { backgroundColor: colors.surfaceOffset },
  modalContent: { backgroundColor: colors.surface, margin: spacing.xl, padding: spacing.xl, borderRadius: radius.xl },
  modalTitle: { fontSize: 20, fontWeight: fontWeight.black, marginBottom: spacing.lg, textAlign: 'center' },
  input: { backgroundColor: colors.surface, marginBottom: spacing.md },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: spacing.md },
  catBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, margin: 4 },
  catBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  catBtnText: { fontSize: 11, fontWeight: fontWeight.bold, color: colors.textSecondary },
  catBtnTextActive: { color: 'white' }
});
