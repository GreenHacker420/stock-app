import { useEffect, useState } from "react";
import { View, ScrollView } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Button, TextInput, List, Text, HelperText } from "react-native-paper";
import { fetchItems, setOpeningStock, Shop } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";

export function SetOpeningStock() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  const navigation = useNavigation();
  const route = useRoute();

  const params = route.params as { shop: Shop } | undefined;
  const shop = params?.shop;

  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const itemsQuery = useQuery({
    queryKey: ["items", shop?.id],
    queryFn: () => fetchItems(token ?? "", shop?.id ?? ""),
    enabled: !!token && !!shop?.id,
  });

  const mutation = useMutation({
    mutationFn: () => {
      const entries = Object.entries(quantities)
        .filter(([_, qty]) => qty.trim() !== "" && Number(qty) > 0)
        .map(([itemId, qty]) => ({
          itemId,
          quantity: Number(qty),
          reason: "Opening stock initialization",
        }));

      if (entries.length === 0) {
        throw new Error("Please enter opening stock quantity for at least one item.");
      }

      return setOpeningStock(token ?? "", shop?.id ?? "", entries);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shops"] });
      navigation.goBack();
    },
    onError: (err: any) => {
      setError(err?.message || "Failed to initialize opening stock. Please try again.");
    },
  });

  const handleQtyChange = (itemId: string, val: string) => {
    setQuantities((prev) => ({
      ...prev,
      [itemId]: val.replace(/[^0-9.]/g, ""),
    }));
    setError("");
  };

  if (!shop) {
    return (
      <Screen>
        <Text>Invalid Shop Parameter</Text>
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <AppHeader
        title="Opening Stock"
        subtitle={`Set starting quantities for ${shop.name}`}
      />

      <ScrollView className="flex-1 mt-2">
        <Section title="Inventory Items">
          {itemsQuery.isLoading ? (
            <View className="p-5 items-center">
              <Text>Loading items...</Text>
            </View>
          ) : null}

          {!itemsQuery.isLoading && itemsQuery.data?.length === 0 ? (
            <View className="rounded-2xl border border-dashed border-[#b9c3b5] bg-white p-6 items-center">
              <Text variant="titleMedium" style={{ fontWeight: "700", color: "#17211b" }}>No Items Found</Text>
              <Text variant="bodySmall" style={{ color: "#667064", marginTop: 4, textAlign: "center" }}>
                Add items to this shop before configuring their opening stocks.
              </Text>
            </View>
          ) : null}

          <View className="gap-3">
            {itemsQuery.data?.map((item) => (
              <View
                key={item.id}
                className="flex-row items-center justify-between gap-4 rounded-2xl border border-[#e5eadd] bg-white p-4"
              >
                <View className="flex-1 gap-1">
                  <Text variant="titleMedium" style={{ color: "#17211b", fontWeight: "700" }}>
                    {item.name}
                  </Text>
                  <Text variant="bodySmall" style={{ color: "#667064" }}>
                    SKU: {item.sku || "N/A"} • Unit: {item.unit} • Default Price: ₹{item.defaultSellingPrice}
                  </Text>
                </View>
                <View style={{ width: 100 }}>
                  <TextInput
                    mode="outlined"
                    dense
                    label="Qty"
                    keyboardType="numeric"
                    placeholder="0"
                    value={quantities[item.id] || ""}
                    onChangeText={(val) => handleQtyChange(item.id, val)}
                    outlineStyle={{ borderRadius: 10, borderColor: "#d9dfd2" }}
                    activeOutlineColor="#246b4b"
                  />
                </View>
              </View>
            ))}
          </View>
        </Section>
      </ScrollView>

      {error ? (
        <View className="p-4">
          <HelperText type="error" visible={!!error}>
            {error}
          </HelperText>
        </View>
      ) : null}

      <View className="gap-3 p-4 bg-[#f6f7f2] border-t border-[#e5eadd]">
        <View className="bg-[#ffe2ad] p-3.5 rounded-xl border border-[#ffd280] mb-1">
          <Text style={{ fontSize: 11, color: "#3f2800", fontWeight: "700", lineHeight: 15 }}>
            WARNING: Opening stock can only be set once. It will be locked for editing after you submit.
          </Text>
        </View>

        <View className="flex-row gap-3">
          <Button
            mode="outlined"
            style={{ flex: 1, borderRadius: 12 }}
            contentStyle={{ height: 50 }}
            onPress={() => navigation.goBack()}
          >
            Cancel
          </Button>
          <Button
            mode="contained"
            buttonColor="#246b4b"
            style={{ flex: 1, borderRadius: 12 }}
            contentStyle={{ height: 50 }}
            loading={mutation.isPending}
            disabled={mutation.isPending || itemsQuery.data?.length === 0}
            onPress={() => mutation.mutate()}
          >
            Save & Lock
          </Button>
        </View>
      </View>
    </Screen>
  );
}
