import { View } from "react-native";
import { Button, Text } from "react-native-paper";
import type { Shop } from "../../api/client";

type ShopPickerProps = {
  shops: Shop[];
  selectedShopId?: string;
  onSelect: (shopId: string) => void;
};

export function ShopPicker({ shops, selectedShopId, onSelect }: ShopPickerProps) {
  if (!shops.length) {
    return (
      <View className="rounded-lg border border-dashed border-gray-200 bg-white p-4">
        <Text variant="titleSmall" style={{ color: "#111827", fontWeight: "700" }}>
          No shop access
        </Text>
        <Text variant="bodySmall" style={{ color: "#4b5563", marginTop: 4 }}>
          Create or assign a shop before using this workflow.
        </Text>
      </View>
    );
  }

  return (
    <View className="gap-2">
      <Text variant="labelLarge" style={{ color: "#6b7280" }}>
        Shop
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {shops.map((shop) => (
          <Button
            key={shop.id}
            mode={selectedShopId === shop.id ? "contained" : "outlined"}
            compact
            onPress={() => onSelect(shop.id)}
            style={{ borderRadius: 8 }}
          >
            {shop.name}
          </Button>
        ))}
      </View>
    </View>
  );
}
