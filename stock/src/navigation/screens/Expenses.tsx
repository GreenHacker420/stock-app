import React, { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Divider, Icon, Text, TextInput, Modal, Portal } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";

import { useExpensesQuery, useCreateExpenseMutation } from "../../hooks/useExpenses";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { Button } from "../../components/ui/Button";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { EmptyState } from "../../components/ui/EmptyState";
import { SkeletonList } from "../../components/ui/SkeletonCard";

const money = (value?: string | number | null) => `₹${Number(value ?? 0).toLocaleString("en-IN")}`;

const EXPENSE_CATEGORIES = [
  "Freight", "Courier", "Porter", "Tea", "Snacks", "Packaging", "Labour", "Petrol", "Electricity", "Internet", "Miscellaneous"
];

export function ExpenseList() {
  const navigation = useNavigation();
  const { data: expenses, isLoading } = useExpensesQuery();
  const [showAdd, setShowAdd] = useState(false);

  // Workaround for FlashList types compatibility with React 19
  const List = FlashList as any;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title="Shop Expenses" subtitle="Track daily operational costs" />
      
      <View style={styles.container}>
        {isLoading ? (
          <SkeletonList count={8} />
        ) : (
          <List
            data={expenses ?? []}
            renderItem={({ item }: { item: any }) => (
              <View style={styles.listItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listTitle}>{item.category}</Text>
                  <Text style={styles.listSubtitle}>{item.vendorName || "No Vendor"} • {new Date(item.createdAt).toLocaleDateString()}</Text>
                  {item.note && <Text style={styles.listNote}>{item.note}</Text>}
                </View>
                <Text style={styles.listAmount}>{money(item.amount)}</Text>
              </View>
            )}
            estimatedItemSize={100}
            ListEmptyComponent={<EmptyState title="No expenses recorded" />}
            contentContainerStyle={{ paddingBottom: 100 }}
          />
        )}

        <Pressable 
          style={styles.fab} 
          onPress={() => setShowAdd(true)}
        >
          <Icon source="plus" size={28} color={colors.textInverse} />
        </Pressable>

        <Portal>
          <Modal visible={showAdd} onDismiss={() => setShowAdd(false)} contentContainerStyle={styles.modal}>
            <AddExpenseForm onSuccess={() => setShowAdd(false)} />
          </Modal>
        </Portal>
      </View>
    </Screen>
  );
}

function AddExpenseForm({ onSuccess }: { onSuccess: () => void }) {
  const mutation = useCreateExpenseMutation();
  const [form, setForm] = useState({
    amount: "",
    category: EXPENSE_CATEGORIES[0],
    vendorName: "",
    note: ""
  });

  const handleSubmit = () => {
    mutation.mutate({
      ...form,
      amount: Number(form.amount)
    }, {
      onSuccess
    });
  };

  return (
    <ScrollView style={styles.form}>
      <Text style={styles.modalTitle}>Record Expense</Text>
      
      <TextInput 
        mode="outlined" 
        label="Amount" 
        keyboardType="numeric" 
        value={form.amount} 
        onChangeText={v => setForm(f => ({...f, amount: v}))} 
        style={styles.input} 
      />

      <Text style={styles.label}>Category</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
        {EXPENSE_CATEGORIES.map(cat => (
          <Pressable 
            key={cat} 
            onPress={() => setForm(f => ({...f, category: cat}))}
            style={[styles.catChip, form.category === cat && styles.activeCatChip]}
          >
            <Text style={[styles.catText, form.category === cat && styles.activeCatText]}>{cat}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <TextInput 
        mode="outlined" 
        label="Vendor Name" 
        value={form.vendorName} 
        onChangeText={v => setForm(f => ({...f, vendorName: v}))} 
        style={styles.input} 
      />

      <TextInput 
        mode="outlined" 
        label="Note" 
        multiline 
        numberOfLines={3} 
        value={form.note} 
        onChangeText={v => setForm(f => ({...f, note: v}))} 
        style={styles.input} 
      />

      <Button 
        label="Submit for Approval" 
        onPress={handleSubmit} 
        loading={mutation.isPending} 
        disabled={!form.amount || !form.category}
        style={{ marginTop: spacing.lg }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceOffset,
  },
  listTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  listSubtitle: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  listNote: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 4,
    fontStyle: 'italic'
  },
  listAmount: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    color: colors.danger,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.lg,
  },
  modal: {
    backgroundColor: colors.surface,
    margin: spacing.lg,
    padding: spacing.xl,
    borderRadius: radius.xl,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.black,
    marginBottom: spacing.xl,
    textAlign: 'center'
  },
  form: {
    gap: spacing.md,
  },
  input: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  categoryScroll: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
  },
  catChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  activeCatChip: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  catText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  activeCatText: {
    color: colors.textInverse,
    fontWeight: fontWeight.bold,
  }
});
