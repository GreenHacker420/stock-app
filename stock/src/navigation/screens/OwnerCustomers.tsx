import { useMemo, useState } from "react";
import { Alert, Pressable, View, StyleSheet, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,} from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute } from "@react-navigation/native";
import { Divider, Icon, Text, TextInput } from "react-native-paper";
import { FlashList } from "@shopify/flash-list";
import { useDebounce } from "use-debounce";

import { 
  createCustomer, 
  Customer, 
  fetchCustomer, 
  fetchCustomerOutstanding, 
  fetchCustomerPriceHistory, 
  updateCustomer 
} from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { AppSearchBar } from "../../components/ui/AppSearchBar";
import { Section } from "../../components/ui/Section";
import { StatusPill } from "../../components/ui/StatusPill";
import { CustomerCard } from "../../components/domain/customers/CustomerCard";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";
import { navigate, goBack } from "../navigation-ref";
import { useNetworkStatus } from "../../hooks/useNetworkStatus";
import { requireActiveShopId } from "../../hooks/useActiveShop";
import { useCustomersQuery } from "../../hooks/useCustomers";

const money = (value?: string | number | null) => `₹${Number(value ?? 0).toLocaleString("en-IN")}`;
const internetRequiredMessage = "Internet connection required. Please connect to the internet to complete this action.";

export function CustomerList() {
  const network = useNetworkStatus();
  
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);

  const customersQuery = useCustomersQuery({
    search: debouncedSearch,
    includeWalkin: true,
    limit: debouncedSearch ? 50 : 100,
    enabled: !network.isOffline,
  });

  const filteredData = useMemo(() => {
    return customersQuery.data ?? [];
  }, [customersQuery.data]);

  return (
    <Screen edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <AppHeader title="Customer Management" subtitle="View and manage customer accounts" />
        
        <View style={styles.headerControls}>
          <AppSearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Search customer or phone"
            inputStyle={styles.searchInput}
          />
        </View>

        <View style={styles.listWrapper}>
          {(() => {
            const List = FlashList as any;
            return (
              <List
                data={filteredData}
                keyExtractor={(item: any) => item.id}
                renderItem={({ item }: any) => {
                  const isPending = Math.abs(Number(item.outstandingAmount ?? 0)) > 0;
                  return (
                    <CustomerCard
                      name={item.name}
                      subtitle={item.type === "WALK_IN" ? "Counter Walk-in Sales" : `${item.contactPerson ? `${item.contactPerson} • ` : ""}${item.phone || "No phone"}${item.city ? ` • ${item.city}` : ""}`}
                      statusLabel={item.type === "WALK_IN" ? "WALK-IN" : isPending ? "PENDING" : "CLEAR"}
                      statusTone={item.type === "WALK_IN" ? "blue" : isPending ? "red" : "green"}
                      outstandingLabel={`Outstanding: ${money(Math.abs(Number(item.outstandingAmount)))}`}
                      limitLabel={`Limit: ${money(item.creditLimit)}`}
                      onPress={() => navigate("CustomerDetail", { customerId: item.id })}
                    />
                  );
                }}
                ListEmptyComponent={
                  customersQuery.isLoading ? (
                    <SkeletonList count={8} itemHeight={80} />
                  ) : (
                    <EmptyState 
                      icon="account-group-outline" 
                      title="No customers yet" 
                      subtitle="Add your first customer to get started" 
                    />
                  )
                }
                contentContainerStyle={styles.listContent}
              />
            );
          })()}
        </View>

        <Pressable 
          style={styles.fab} 
          onPress={() => navigate("AddEditCustomer")}
        >
          <Icon source="account-plus" size={28} color={colors.textInverse} />
        </Pressable>
      </View>
    </Screen>
  );
}

export function AddEditCustomer() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const route = useRoute();
  const queryClient = useQueryClient();
  const network = useNetworkStatus();
  const customer = (route.params as { customer?: Customer } | undefined)?.customer;
  
  const isOwner = user?.role === "OWNER";

  const [form, setForm] = useState({
    name: customer?.name ?? "",
    phone: customer?.phone ?? "",
    address: customer?.address ?? "",
    city: customer?.city ?? "",
    gstin: customer?.gstin ?? "",
    contactPerson: customer?.contactPerson ?? "",
    creditLimit: String(customer?.creditLimit ?? ""),
    notes: customer?.notes ?? "",
  });

  const set = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const mutation = useMutation({
    mutationFn: () => {
      if (network.isOffline) {
        throw new Error(internetRequiredMessage);
      }
      const payload = { 
        shopId: requireActiveShopId(activeShopId), 
        ...form, 
        creditLimit: form.creditLimit ? Number(form.creditLimit) : undefined 
      };
      return (customer && customer.id) ? updateCustomer(token ?? "", customer.id, payload) : createCustomer(token ?? "", payload);
    },
    onSuccess: (result: any) => {
      if (result?.ok === false) return;
      queryClient.invalidateQueries({ queryKey: ["customers", activeShopId] });
      goBack();
    },
    onError: (error: Error) => {
      Alert.alert("Internet required", error.message || internetRequiredMessage);
    },
  });

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader 
        title={(customer && customer.id) ? "Edit Customer" : "Add Customer"} 
        subtitle="Maintain customer profile settings" 
        fallbackRoute="CustomerList"
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
      <View style={styles.formContainer}>
        <Section title="Customer details">
          <View style={styles.formCard}>
            <TextInput 
              mode="outlined" 
              label="Firm Name * (Required)" 
              value={form.name} 
              onChangeText={(v) => set("name", v)} 
              outlineStyle={styles.inputOutline} 
              style={styles.input} 
            />
            <TextInput 
              mode="outlined" 
              label="Contact Person Name * (Required)" 
              value={form.contactPerson} 
              onChangeText={(v) => set("contactPerson", v)} 
              outlineStyle={styles.inputOutline} 
              style={styles.input} 
            />
            <TextInput 
              mode="outlined" 
              label="Mobile Number * (Required)" 
              value={form.phone ?? ""} 
              onChangeText={(v) => set("phone", v)} 
              outlineStyle={styles.inputOutline} 
              style={styles.input} 
              keyboardType="phone-pad"
            />
            <TextInput 
              mode="outlined" 
              label="Address (Optional)" 
              value={form.address ?? ""} 
              onChangeText={(v) => set("address", v)} 
              outlineStyle={styles.inputOutline} 
              style={styles.input} 
            />
            <TextInput 
              mode="outlined" 
              label="City (Optional)" 
              value={form.city ?? ""} 
              onChangeText={(v) => set("city", v)} 
              outlineStyle={styles.inputOutline} 
              style={styles.input} 
            />
            <TextInput 
              mode="outlined" 
              label="GSTIN (Optional)" 
              value={form.gstin ?? ""} 
              onChangeText={(v) => set("gstin", v)} 
              outlineStyle={styles.inputOutline} 
              style={styles.input} 
            />
            {isOwner ? (
              <TextInput 
                mode="outlined" 
                label="Credit Limit (Optional)" 
                keyboardType="numeric" 
                value={form.creditLimit} 
                onChangeText={(v) => set("creditLimit", v)} 
                outlineStyle={styles.inputOutline} 
                style={styles.input} 
              />
            ) : (
              <TextInput 
                mode="outlined" 
                label="Credit Limit (Set by Owner only)" 
                value={form.creditLimit ? `₹${Number(form.creditLimit).toLocaleString()}` : "No credit limit set"} 
                disabled 
                outlineStyle={styles.inputOutline} 
                style={styles.input} 
              />
            )}
            <TextInput 
              mode="outlined" 
              label="Internal Notes (Optional)" 
              multiline 
              value={form.notes ?? ""} 
              onChangeText={(v) => set("notes", v)} 
              outlineStyle={styles.inputOutline} 
              style={styles.input} 
            />
          </View>
        </Section>
        <View style={styles.formFooter}>
          <Button 
            label="Save Customer"
            onPress={() => mutation.mutate()} 
            loading={mutation.isPending} 
            disabled={!form.name.trim() || !form.phone.trim() || !form.contactPerson.trim()}
            fullWidth
            size="lg"
          />
        </View>
      </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerControls: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  searchBar: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 0,
  },
  searchInput: {
    fontSize: fontSize.md,
  },
  listWrapper: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 100,
  },
  customerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 72,
    ...shadow.sm,
  },
  customerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  customerMain: {
    flex: 1,
  },
  customerName: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  customerSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  customerFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceOffset,
  },
  outstandingLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  outstandingValue: {
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  limitLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
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
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  formContainer: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  formCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
  },
  inputOutline: {
    borderRadius: radius.md,
  },
  formFooter: {
    paddingVertical: spacing.xl,
  },
  detailContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 40,
  },
  detailCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.md,
    marginBottom: spacing.lg,
  },
  detailName: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  detailSubtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: 2,
  },
  divider: {
    marginVertical: spacing.lg,
    backgroundColor: colors.border,
  },
  detailStats: {
    gap: spacing.md,
  },
  detailStatItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  statValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  editButton: {
    marginBottom: spacing.xl,
  },
  recordsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  recordRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
  },
  recordTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  recordSubtitle: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  recordAmount: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.black,
    color: colors.primary,
  },
  rowDivider: {
    backgroundColor: colors.surfaceOffset,
  },
  emptyText: {
    padding: spacing.xxl,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: fontSize.sm,
  }
});
