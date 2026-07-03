import { useState } from "react";
import { View, StyleSheet } from "react-native";
import { useRoute } from "@react-navigation/native";
import { TextInput, Text, HelperText } from "react-native-paper";
import { Shop } from "../../api/client";
import { useShopStore } from "../../auth/shop-store";
import { useShopsQuery, useSetOpeningStockMutation } from "../../hooks/useShops";
import { useItemsQuery } from "../../hooks/useItems";
import { Screen } from "../../components/Screen";
import { FormScreen } from "../../components/layout/FormScreen";
import { ScreenSection } from "../../components/layout/ScreenSection";
import { StickyFooterActions } from "../../components/layout/StickyFooterActions";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingState } from "../../components/feedback/LoadingState";
import { colors, spacing, radius, fontWeight } from "../../theme";
import { goBack } from "../navigation-ref";

export function SetOpeningStock() {
  const activeShopId = useShopStore((state) => state.activeShopId);
  const route = useRoute();

  const params = route.params as { shop?: Shop } | undefined;
  const shopsQuery = useShopsQuery();
  const shop = params?.shop ?? shopsQuery.data?.find((row) => row.id === activeShopId) ?? shopsQuery.data?.[0];

  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const itemsQuery = useItemsQuery({ page: 1, limit: 100 });

  const setOpeningStockMutation = useSetOpeningStockMutation();

  const handleSave = () => {
    const entries = Object.entries(quantities)
      .filter(([_, qty]) => qty.trim() !== "" && Number(qty) > 0)
      .map(([itemId, qty]) => ({
        itemId,
        quantity: Number(qty),
        reason: "Opening stock initialization",
      }));

    if (entries.length === 0) {
      setError("Please enter opening stock quantity for at least one item.");
      return;
    }

    setOpeningStockMutation.mutate(
      { shopId: shop?.id ?? "", entries },
      {
        onSuccess: () => {
          goBack();
        },
        onError: (err: any) => {
          setError(err?.message || "Failed to initialize opening stock. Please try again.");
        },
      }
    );
  };

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
        <LoadingState label="Loading shop..." />
      </Screen>
    );
  }

  if (!shop) {
    return (
      <Screen>
        <EmptyState title="Shop not found." />
      </Screen>
    );
  }

  return (
    <FormScreen
      title="Opening Stock"
      subtitle={`Set starting quantities for ${shop.name}`}
      footer={
        <StickyFooterActions
          secondary={{ label: "Cancel", onPress: () => goBack(), variant: "secondary" }}
          primary={{
            label: "Save & Lock",
            onPress: handleSave,
            loading: setOpeningStockMutation.isPending,
            disabled: setOpeningStockMutation.isPending || itemsQuery.data?.items?.length === 0,
            haptic: "medium",
          }}
        >
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              WARNING: Opening stock can only be set once. It will be locked for editing after you submit.
            </Text>
          </View>
          {error ? (
            <HelperText type="error" visible={!!error}>
              {error}
            </HelperText>
          ) : null}
        </StickyFooterActions>
      }
    >
      <ScreenSection title="Inventory Items">
        {itemsQuery.isLoading ? <LoadingState label="Loading items..." /> : null}

        {!itemsQuery.isLoading && itemsQuery.data?.items?.length === 0 ? (
          <EmptyState
            title="No Items Found"
            subtitle="Add items to this shop before configuring their opening stocks."
          />
        ) : null}

        <View style={styles.listGap}>
          {itemsQuery.data?.items?.map((item) => (
            <View key={item.id} style={styles.itemCard}>
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
      </ScreenSection>
    </FormScreen>
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
});
