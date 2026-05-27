import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Button, Divider, Searchbar, Text, TextInput } from "react-native-paper";
import { createCustomer, Customer, fetchCustomer, fetchCustomerOutstanding, fetchCustomerPriceHistory, fetchCustomers, updateCustomer } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { StatusPill } from "../../components/ui/StatusPill";

const money = (value?: string | number | null) => `₹${Number(value ?? 0).toLocaleString("en-IN")}`;

export function CustomerList() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const navigation = useNavigation();
  const [search, setSearch] = useState("");
  const customersQuery = useQuery({ queryKey: ["customers", activeShopId], queryFn: () => fetchCustomers(token ?? "", activeShopId ?? ""), enabled: !!token && !!activeShopId });
  const rows = useMemo(() => (customersQuery.data ?? []).filter((c) => `${c.name} ${c.phone ?? ""} ${c.city ?? ""}`.toLowerCase().includes(search.toLowerCase())), [customersQuery.data, search]);

  return (
    <Screen scroll={false}>
      <AppHeader title="Customer Management" subtitle="Customers, credit limits, outstanding, and price history." />
      <Searchbar value={search} onChangeText={setSearch} placeholder="Search customer or phone" style={{ backgroundColor: "white", borderRadius: 10 }} />
      <Button mode="contained" icon="account-plus" onPress={() => (navigation as any).navigate("AddEditCustomer")} style={{ borderRadius: 10 }}>Add Customer</Button>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <View className="gap-3">
          {rows.map((customer) => (
            <Pressable key={customer.id} onPress={() => (navigation as any).navigate("CustomerDetail", { customerId: customer.id })}>
              <View className="rounded-lg border border-[#e5e7eb] bg-white p-4">
                <View className="flex-row justify-between gap-3">
                  <View className="flex-1">
                    <Text variant="titleMedium" style={{ fontWeight: "900" }}>{customer.name}</Text>
                    <Text style={{ color: "#64748b" }}>{customer.phone || "No phone"} • {customer.city || "No city"}</Text>
                  </View>
                  <StatusPill label={Number(customer.outstandingAmount ?? 0) > 0 ? "PENDING" : "CLEAR"} tone={Number(customer.outstandingAmount ?? 0) > 0 ? "red" : "green"} />
                </View>
                <Text style={{ marginTop: 10 }}>Outstanding: <Text style={{ fontWeight: "900" }}>{money(customer.outstandingAmount)}</Text> • Limit: {money(customer.creditLimit)}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

export function AddEditCustomer() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const route = useRoute();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const customer = (route.params as { customer?: Customer } | undefined)?.customer;
  const [form, setForm] = useState({
    name: customer?.name ?? "",
    phone: customer?.phone ?? "",
    address: customer?.address ?? "",
    city: customer?.city ?? "",
    gstin: customer?.gstin ?? "",
    creditLimit: String(customer?.creditLimit ?? ""),
    notes: customer?.notes ?? "",
  });
  const set = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const mutation = useMutation({
    mutationFn: () => {
      const payload = { shopId: activeShopId, ...form, creditLimit: form.creditLimit ? Number(form.creditLimit) : undefined };
      return customer ? updateCustomer(token ?? "", customer.id, payload) : createCustomer(token ?? "", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers", activeShopId] });
      navigation.goBack();
    },
  });

  return (
    <Screen>
      <AppHeader title={customer ? "Edit Customer" : "Add Customer"} subtitle="Maintain customer profile and credit settings." />
      <Section title="Customer details">
        <View className="gap-3 rounded-lg border border-[#e5e7eb] bg-white p-4">
          <TextInput mode="outlined" label="Name" value={form.name} onChangeText={(v) => set("name", v)} />
          <TextInput mode="outlined" label="Phone" value={form.phone ?? ""} onChangeText={(v) => set("phone", v)} />
          <TextInput mode="outlined" label="Address" value={form.address ?? ""} onChangeText={(v) => set("address", v)} />
          <TextInput mode="outlined" label="City" value={form.city ?? ""} onChangeText={(v) => set("city", v)} />
          <TextInput mode="outlined" label="GSTIN" value={form.gstin ?? ""} onChangeText={(v) => set("gstin", v)} />
          <TextInput mode="outlined" label="Credit limit" keyboardType="numeric" value={form.creditLimit} onChangeText={(v) => set("creditLimit", v)} />
          <TextInput mode="outlined" label="Notes" multiline value={form.notes ?? ""} onChangeText={(v) => set("notes", v)} />
        </View>
      </Section>
      <Button mode="contained" loading={mutation.isPending} disabled={!form.name.trim()} onPress={() => mutation.mutate()} style={{ borderRadius: 10 }}>Save Customer</Button>
    </Screen>
  );
}

export function CustomerDetail() {
  const token = useAuthStore((state) => state.token);
  const navigation = useNavigation();
  const customerId = (useRoute().params as { customerId?: string } | undefined)?.customerId;
  const customerQuery = useQuery({ queryKey: ["customer", customerId], queryFn: () => fetchCustomer(token ?? "", customerId ?? ""), enabled: !!token && !!customerId });
  const outstandingQuery = useQuery({ queryKey: ["customer-outstanding", customerId], queryFn: () => fetchCustomerOutstanding(token ?? "", customerId ?? ""), enabled: !!token && !!customerId });
  const historyQuery = useQuery({ queryKey: ["customer-price-history", customerId], queryFn: () => fetchCustomerPriceHistory(token ?? "", customerId ?? ""), enabled: !!token && !!customerId });
  const customer = customerQuery.data;

  return (
    <Screen>
      <AppHeader title={customer?.name ?? "Customer Detail"} subtitle="Profile, outstanding, payments, and price history." />
      {customer ? (
        <>
          <View className="rounded-lg border border-[#e5e7eb] bg-white p-4">
            <Text variant="titleMedium" style={{ fontWeight: "900" }}>{customer.name}</Text>
            <Text>{customer.phone || "No phone"} • {customer.city || "No city"}</Text>
            <Text>Outstanding: {money((outstandingQuery.data as any)?.totalPending ?? customer.outstandingAmount)}</Text>
            <Text>Credit limit: {money(customer.creditLimit)}</Text>
          </View>
          <Button mode="contained-tonal" icon="pencil" onPress={() => (navigation as any).navigate("AddEditCustomer", { customer })}>Edit Customer</Button>
          <Section title="Outstanding records">
            <View className="rounded-lg border border-[#e5e7eb] bg-white">
              {((outstandingQuery.data as any)?.records ?? []).map((row: any, index: number) => (
                <View key={row.id} className="p-4">
                  {index > 0 ? <Divider style={{ marginBottom: 12 }} /> : null}
                  <Text style={{ fontWeight: "900" }}>{row.sale?.saleNumber ?? row.deliveryMemo?.dmNumber ?? row.order?.orderNumber ?? "Outstanding"}</Text>
                  <Text style={{ color: "#64748b" }}>{money(row.pendingAmount)} • {row.status}</Text>
                </View>
              ))}
            </View>
          </Section>
          <Section title="Price history">
            <View className="rounded-lg border border-[#e5e7eb] bg-white">
              {((historyQuery.data as any)?.rows ?? []).slice(0, 10).map((row: any, index: number) => (
                <View key={`${row.type}-${row.recordNumber}-${index}`} className="p-4">
                  {index > 0 ? <Divider style={{ marginBottom: 12 }} /> : null}
                  <Text style={{ fontWeight: "900" }}>{row.item?.name} • {money(row.rate)}</Text>
                  <Text style={{ color: "#64748b" }}>{row.type} {row.recordNumber} • Qty {row.quantity}</Text>
                </View>
              ))}
            </View>
          </Section>
        </>
      ) : null}
    </Screen>
  );
}
