import { useEffect, useState } from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Button, TextInput, List, Text, HelperText } from "react-native-paper";
import { fetchItems, fetchShops, setOpeningStock, Shop } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { colors, spacing, radius, fontWeight } from "../../theme";

export function SetOpeningStock() {
  const token = useAuthStore((state) => state.token);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const queryClient = useQueryClient();
  const navigation = useNavigation();
  const route = useRoute();

  const params = route.params as { shop?: Shop } | undefined;
  const shopsQuery = useQuery({ queryKey: ["shops"], queryFn: () => fetchShops(token ?? ""), enabled: !!token });
  const shop = params?.shop ?? shopsQuery.data?.find((row) => row.id === activeShopId) ?? shopsQuery.data?.[0];

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

  if (!shop && shopsQuery.isLoading) {
    return (
      <Screen>
        <Text>Loading shop...</Text>
      </Screen>
    );
  }

  if (!shop) {
    return (
      <Screen>
        <AppHeader title="Opening Stock" subtitle="Pick or create a shop first." />
        <Text style={styles.errorText}>No active shop found. Go to Dashboard and choose a shop.</Text>
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
            <View style={styles.loadingItems}>
              <Text>Loading items...</Text>
            </View>
          ) : null}

          {!itemsQuery.isLoading && itemsQuery.data?.items?.length === 0 ? (
            <View style={styles.emptyItemsBox}>
              <Text variant="titleMedium" style={styles.emptyItemsTitle}>No Items Found</Text>
              <Text variant="bodySmall" style={styles.emptyItemsSubtitle}>
                Add items to this shop before configuring their opening stocks.
              </Text>
            </View>
          ) : null}

          <View style={styles.listGap}>
            {itemsQuery.data?.items?.map((item) => (
              <View
                key={item.id}
                style={styles.itemCard}
              >
                <View style={styles.itemInfo}>
                  <Text variant="titleMedium" style={styles.itemTitle}>
                    {item.name}
                  </Text>
                  <Text variant="bodySmall" style={styles.itemSubtitle}>
                    SKU: {item.sku || "N/A"} • Unit: {item.unit} • Default Price: ₹{item.defaultSellingPrice}
                  </Text>
                </View>
                <View style={styles.qtyInputBox}>
                  <TextInput
                    mode="outlined"
                    dense
                    label="Qty"
                    keyboardType="numeric"
                    placeholder="0"
                    value={quantities[item.id] || ""}
                    onChangeText={(val) => handleQtyChange(item.id, val)}
                    outlineStyle={styles.inputOutline}
                    activeOutlineColor={colors.primary}
                  />
                </View>
              </View>
            ))}
          </View>
        </Section>
      </ScrollView>

      {error ? (
        <View style={styles.errorPadding}>
          <HelperText type="error" visible={!!error}>
            {error}
          </HelperText>
        </View>
      ) : null}

      <View style={styles.footer}>
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            WARNING: Opening stock can only be set once. It will be locked for editing after you submit.
          </Text>
        </View>

        <View style={styles.footerActions}>
          <Button
            mode="outlined"
            style={styles.footerButton}
            contentStyle={styles.buttonContent}
            onPress={() => navigation.goBack()}
          >
            Cancel
          </Button>
          <Button
            mode="contained"
            buttonColor={colors.primary}
            style={styles.footerButton}
            contentStyle={styles.buttonContent}
            loading={mutation.isPending}
            disabled={mutation.isPending || itemsQuery.data?.items?.length === 0}
            onPress={() => mutation.mutate()}
          >
            Save & Lock
          </Button>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  errorText: {
    color: colors.danger,
    padding: spacing.lg,
  },
  loadingItems: {
    padding: spacing.xxl,
    alignItems: "center",
  },
  emptyItemsBox: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: '#b9c3b5',
    backgroundColor: colors.surface,
    padding: spacing.xxl,
    alignItems: "center",
  },
  emptyItemsTitle: {
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  emptyItemsSubtitle: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: "center",
  },
  listGap: {
    gap: spacing.md,
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  itemInfo: {
    flex: 1,
    gap: 4,
  },
  itemTitle: {
    color: colors.textPrimary,
    fontWeight: fontWeight.bold,
  },
  itemSubtitle: {
    color: colors.textSecondary,
  },
  qtyInputBox: {
    width: 100,
  },
  inputOutline: {
    borderRadius: 10,
    borderColor: colors.border,
  },
  errorPadding: {
    padding: spacing.lg,
  },
  footer: {
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  warningBox: {
    backgroundColor: colors.warningLight,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#ffd280',
    marginBottom: spacing.xs,
  },
  warningText: {
    fontSize: 11,
    color: "#3f2800",
    fontWeight: fontWeight.bold,
    lineHeight: 15,
  },
  footerActions: {
    flexDirection: "row",
    gap: spacing.md,
  },
  footerButton: {
    flex: 1,
    borderRadius: radius.md,
  },
  buttonContent: {
    height: 50,
  },
});
