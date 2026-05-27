import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Button, Divider, Icon, Searchbar, SegmentedButtons, Text, TextInput } from "react-native-paper";
import { createItem, fetchCurrentStock, fetchItemPriceHistory, fetchItemStock, fetchItems, Item, updateItem } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { StatusPill } from "../../components/ui/StatusPill";
import { Screen } from "../../components/Screen";

function money(value?: string | number | null) {
  return `₹${Number(value ?? 0).toLocaleString("en-IN")}`;
}

export function ItemList() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const navigation = useNavigation();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const itemsQuery = useQuery({
    queryKey: ["items", activeShopId],
    queryFn: () => fetchItems(token ?? "", activeShopId ?? ""),
    enabled: !!token && !!activeShopId,
  });
  const stockQuery = useQuery({
    queryKey: ["stock", activeShopId],
    queryFn: () => fetchCurrentStock(token ?? "", activeShopId ?? ""),
    enabled: !!token && !!activeShopId,
  });

  const stockByItem = useMemo(() => new Map((stockQuery.data ?? []).map((row) => [row.item.id, row.currentQuantity])), [stockQuery.data]);
  const rows = useMemo(() => {
    return (itemsQuery.data ?? []).filter((item) => {
      const matches = `${item.name} ${item.sku ?? ""}`.toLowerCase().includes(search.toLowerCase());
      const stock = stockByItem.get(item.id) ?? 0;
      if (filter === "LOW") return matches && stock <= Number(item.minimumStock ?? 0);
      return matches;
    });
  }, [filter, itemsQuery.data, search, stockByItem]);

  return (
    <Screen scroll={false}>
      <AppHeader title="Inventory Management" subtitle="Items, pricing, stock levels, and low-stock alerts." />
      <View className="flex-row gap-3">
        <View className="flex-1 rounded-lg border border-[#e5e7eb] bg-white p-4">
          <Text style={{ color: "#64748b" }}>Items</Text>
          <Text variant="headlineSmall" style={{ fontWeight: "900" }}>{itemsQuery.data?.length ?? 0}</Text>
        </View>
        <View className="flex-1 rounded-lg border border-[#e5e7eb] bg-white p-4">
          <Text style={{ color: "#64748b" }}>Low Stock</Text>
          <Text variant="headlineSmall" style={{ fontWeight: "900" }}>{(itemsQuery.data ?? []).filter((item) => (stockByItem.get(item.id) ?? 0) <= Number(item.minimumStock ?? 0)).length}</Text>
        </View>
      </View>
      <Searchbar value={search} onChangeText={setSearch} placeholder="Search item or SKU" style={{ backgroundColor: "white", borderRadius: 10 }} />
      <SegmentedButtons value={filter} onValueChange={setFilter} buttons={[{ value: "ALL", label: "All" }, { value: "LOW", label: "Low stock" }]} />
      <Button mode="contained" icon="plus" onPress={() => (navigation as any).navigate("AddEditItem")} style={{ borderRadius: 10 }}>
        Add Item
      </Button>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <View className="gap-3">
          {rows.map((item) => {
            const stock = stockByItem.get(item.id) ?? 0;
            const isLow = stock <= Number(item.minimumStock ?? 0);
            return (
              <Pressable key={item.id} onPress={() => (navigation as any).navigate("ItemDetail", { itemId: item.id })}>
                <View className="rounded-lg border border-[#e5e7eb] bg-white p-4">
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1">
                      <Text variant="titleMedium" style={{ fontWeight: "900", color: "#111827" }}>{item.name}</Text>
                      <Text style={{ color: "#64748b", marginTop: 2 }}>{item.sku || "No SKU"} • {item.unit} • {item.category?.name ?? "Uncategorised"}</Text>
                    </View>
                    <StatusPill label={isLow ? "LOW" : "OK"} tone={isLow ? "red" : "green"} />
                  </View>
                  <View className="mt-4 flex-row justify-between">
                    <Text style={{ color: "#64748b" }}>Stock: <Text style={{ fontWeight: "900", color: "#111827" }}>{stock}</Text></Text>
                    <Text style={{ color: "#64748b" }}>Default: <Text style={{ fontWeight: "900", color: "#111827" }}>{money(item.defaultSellingPrice)}</Text></Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
          {!itemsQuery.isLoading && rows.length === 0 ? <Text style={{ color: "#64748b", textAlign: "center", padding: 24 }}>No items found.</Text> : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

export function AddEditItem() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const route = useRoute();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const item = (route.params as { item?: Item } | undefined)?.item;
  const [form, setForm] = useState({
    name: item?.name ?? "",
    sku: item?.sku ?? "",
    unit: item?.unit ?? "pcs",
    defaultSellingPrice: String(item?.defaultSellingPrice ?? "0"),
    minimumAllowedPrice: String(item?.minimumAllowedPrice ?? ""),
    purchasePrice: String(item?.purchasePrice ?? ""),
    mrp: String(item?.mrp ?? ""),
    minimumStock: String(item?.minimumStock ?? "0"),
  });

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        shopId: activeShopId,
        name: form.name.trim(),
        sku: form.sku.trim() || undefined,
        unit: form.unit.trim(),
        defaultSellingPrice: Number(form.defaultSellingPrice || 0),
        minimumAllowedPrice: form.minimumAllowedPrice ? Number(form.minimumAllowedPrice) : undefined,
        purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : undefined,
        mrp: form.mrp ? Number(form.mrp) : undefined,
        minimumStock: Number(form.minimumStock || 0),
      };
      return item ? updateItem(token ?? "", item.id, payload) : createItem(token ?? "", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items", activeShopId] });
      navigation.goBack();
    },
  });

  const set = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Screen>
      <AppHeader title={item ? "Edit Item" : "Add Item"} subtitle="Maintain item catalog, prices, and stock threshold." />
      <Section title="Item details">
        <View className="gap-3 rounded-lg border border-[#e5e7eb] bg-white p-4">
          <TextInput mode="outlined" label="Name" value={form.name} onChangeText={(v) => set("name", v)} />
          <TextInput mode="outlined" label="SKU" value={form.sku ?? ""} onChangeText={(v) => set("sku", v)} />
          <TextInput mode="outlined" label="Unit" value={form.unit} onChangeText={(v) => set("unit", v)} />
          <TextInput mode="outlined" label="Default selling price" keyboardType="numeric" value={form.defaultSellingPrice} onChangeText={(v) => set("defaultSellingPrice", v)} />
          <TextInput mode="outlined" label="Minimum allowed price" keyboardType="numeric" value={form.minimumAllowedPrice} onChangeText={(v) => set("minimumAllowedPrice", v)} />
          <TextInput mode="outlined" label="Purchase price" keyboardType="numeric" value={form.purchasePrice} onChangeText={(v) => set("purchasePrice", v)} />
          <TextInput mode="outlined" label="MRP" keyboardType="numeric" value={form.mrp} onChangeText={(v) => set("mrp", v)} />
          <TextInput mode="outlined" label="Minimum stock alert" keyboardType="numeric" value={form.minimumStock} onChangeText={(v) => set("minimumStock", v)} />
        </View>
      </Section>
      <Button mode="contained" loading={mutation.isPending} disabled={!form.name.trim() || !form.unit.trim()} onPress={() => mutation.mutate()} style={{ borderRadius: 10 }}>
        Save Item
      </Button>
    </Screen>
  );
}

export function ItemDetail() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const navigation = useNavigation();
  const itemId = (useRoute().params as { itemId?: string } | undefined)?.itemId;
  const stockQuery = useQuery({ queryKey: ["item-stock", itemId], queryFn: () => fetchItemStock(token ?? "", itemId ?? ""), enabled: !!token && !!itemId });
  const historyQuery = useQuery({ queryKey: ["item-price-history", itemId], queryFn: () => fetchItemPriceHistory(token ?? "", itemId ?? ""), enabled: !!token && !!itemId });
  const item = (stockQuery.data as any)?.item;

  return (
    <Screen>
      <AppHeader title={item?.name ?? "Item Detail"} subtitle="Stock, price settings, and transaction history." />
      {!itemId ? <Text style={{ color: "#991b1b" }}>Missing item id.</Text> : null}
      {item ? (
        <>
          <View className="rounded-lg border border-[#e5e7eb] bg-white p-4">
            <View className="flex-row justify-between">
              <Text style={{ color: "#64748b" }}>Current stock</Text>
              <Text variant="headlineSmall" style={{ fontWeight: "900" }}>{(stockQuery.data as any)?.currentQuantity ?? 0} {item.unit}</Text>
            </View>
            <Divider style={{ marginVertical: 12 }} />
            <Text>SKU: {item.sku || "Not set"}</Text>
            <Text>Default price: {money(item.defaultSellingPrice)}</Text>
            <Text>Minimum price: {money(item.minimumAllowedPrice)}</Text>
            <Text>MRP: {money(item.mrp)}</Text>
            <Text>Minimum stock: {item.minimumStock}</Text>
          </View>
          <View className="flex-row gap-3">
            <Button
              mode="contained-tonal"
              icon="pencil"
              onPress={() => (navigation as any).navigate("AddEditItem", { item })}
              style={{ flex: 1, borderRadius: 12 }}
            >
              Edit Item
            </Button>
            <Button
              mode="contained"
              icon="warehouse"
              onPress={() => (navigation as any).navigate("StockEntry", { shopId: activeShopId, itemId: item.id })}
              style={{ flex: 1, borderRadius: 12, backgroundColor: "#1e40af" }}
              labelStyle={{ color: "#ffffff" }}
            >
              Manage Stock
            </Button>
          </View>
          <Section title="Recent price history">
            <View className="rounded-lg border border-[#e5e7eb] bg-white">
              {((historyQuery.data as any)?.rows ?? []).slice(0, 12).map((row: any, index: number) => (
                <View key={`${row.type}-${row.recordNumber}-${index}`} className="p-4">
                  {index > 0 ? <Divider style={{ marginBottom: 12 }} /> : null}
                  <Text style={{ fontWeight: "800" }}>{row.recordNumber} • {row.type}</Text>
                  <Text style={{ color: "#64748b" }}>{row.customer?.name ?? "Walk-in"} • Qty {row.quantity} • {money(row.rate)}</Text>
                </View>
              ))}
            </View>
          </Section>
        </>
      ) : null}
    </Screen>
  );
}
