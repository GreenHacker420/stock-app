import { View, StyleSheet } from "react-native";
import { Text } from "react-native-paper";
import { colors, radius, fontWeight } from "../../theme";

export function StockBadge({ stock, min }: { stock: number; min: number }) {
  if (stock <= 0)
    return (
      <View style={[styles.pill, { backgroundColor: colors.dangerLight }]}>
        <Text style={[styles.text, { color: colors.danger }]}>OUT</Text>
      </View>
    );
  if (stock <= min)
    return (
      <View style={[styles.pill, { backgroundColor: colors.warningLight }]}>
        <Text style={[styles.text, { color: colors.warning }]}>LOW</Text>
      </View>
    );
  return (
    <View style={[styles.pill, { backgroundColor: colors.primaryLight }]}>
      <Text style={[styles.text, { color: colors.primary }]}>IN STOCK</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  text: {
    fontSize: 9,
    fontWeight: fontWeight.black,
    letterSpacing: 0.6,
  },
});
