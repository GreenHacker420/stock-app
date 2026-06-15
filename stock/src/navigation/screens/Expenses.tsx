import React, { useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Platform, KeyboardAvoidingView } from "react-native";
import { Searchbar, Text, Icon, List, Divider, Card, TextInput, Avatar, HelperText, Modal, Portal } from "react-native-paper";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute } from "@react-navigation/native";

import { fetchExpenses, createExpense, verifyExpense, fetchShops, Shop, Expense } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { StatusPill } from "../../components/ui/StatusPill";
import { SuccessModal } from "../../components/ui/SuccessModal";
import { Button } from "../../components/ui/Button";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { navigate, goBack } from "../navigation-ref";

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
    mutationFn: () => createExpense(token ?? "", { ...form, amount: Number(form.amount), shopId: activeShopId ?? "" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses", activeShopId] });
      setIsAddModalVisible(false);
      setForm({ amount: "", category: "MISC", note: "" });
      setSuccessVisible(true);
    }
  });

  const isOwner = user?.role === "OWNER";

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title="Shop Expenses" subtitle="Track and verify daily outgoings" showBack />
      
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.actionRow}>
           <Button 
             variant="primary" 
             label="Log Expense" 
             icon={<Icon source="plus" size={18} color="white" />} 
             onPress={() => setIsAddModalVisible(true)}
             style={{ flex: 1 }}
           />
        </View>

        <Section title="Recent Expenses">
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
              {expensesQuery.data?.length === 0 && <Text style={styles.emptyText}>No expenses logged for this shop.</Text>}
           </View>
        </Section>
      </ScrollView>

      <Portal>
        <Modal visible={isAddModalVisible} onDismiss={() => setIsAddModalVisible(false)} contentContainerStyle={styles.modalContent}>
           <Text style={styles.modalTitle}>Log Expense</Text>
           <TextInput
              mode="outlined"
              label="Amount (₹)"
              value={form.amount}
              onChangeText={(v) => setForm(f => ({ ...f, amount: v }))}
              keyboardType="numeric"
              style={styles.input}
              outlineStyle={{ borderRadius: radius.md }}
           />
           <View style={styles.categoryGrid}>
              {expenseCategories.map(cat => (
                <Pressable 
                  key={cat} 
                  onPress={() => setForm(f => ({ ...f, category: cat }))}
                  style={[styles.catBtn, form.category === cat && styles.catBtnActive]}
                >
                  <Text style={[styles.catBtnText, form.category === cat && styles.catBtnTextActive]}>{cat.split('_')[0]}</Text>
                </Pressable>
              ))}
           </View>
           <TextInput
              mode="outlined"
              label="Notes / Purpose"
              value={form.note}
              onChangeText={(v) => setForm(f => ({ ...f, note: v }))}
              multiline
              numberOfLines={2}
              style={styles.input}
              outlineStyle={{ borderRadius: radius.md }}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: 100 },
  actionRow: { marginVertical: spacing.md },
  listContainer: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: spacing.md, ...shadow.sm },
  expenseItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.md },
  expenseInfo: { flex: 1, gap: 2 },
  amountText: { fontSize: 18, fontWeight: fontWeight.black, color: colors.textPrimary },
  categoryText: { fontSize: 12, fontWeight: fontWeight.bold, color: colors.primary },
  noteText: { fontSize: 13, color: colors.textSecondary },
  createdByText: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  expenseStatus: { alignItems: 'flex-end' },
  divider: { backgroundColor: colors.surfaceOffset },
  emptyText: { textAlign: 'center', padding: spacing.xl, color: colors.textMuted },
  modalContent: { backgroundColor: colors.surface, margin: spacing.xl, padding: spacing.xl, borderRadius: radius.xl },
  modalTitle: { fontSize: 20, fontWeight: fontWeight.black, marginBottom: spacing.lg, textAlign: 'center' },
  input: { backgroundColor: colors.surface, marginBottom: spacing.md },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  catBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  catBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  catBtnText: { fontSize: 11, fontWeight: fontWeight.bold, color: colors.textSecondary },
  catBtnTextActive: { color: 'white' }
});
