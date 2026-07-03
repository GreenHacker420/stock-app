import { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Searchbar, Text } from "react-native-paper";

import { colors, fontSize, fontWeight, radius, spacing } from "../../theme";

type SearchablePickerProps = {
  title?: string;
  query: string;
  onQueryChange: (query: string) => void;
  children: ReactNode;
  empty?: ReactNode;
};

export function SearchablePicker({ title, query, onQueryChange, children, empty }: SearchablePickerProps) {
  return (
    <View style={styles.container}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <Searchbar
        value={query}
        onChangeText={onQueryChange}
        placeholder="Search"
        style={styles.search}
        inputStyle={styles.searchInput}
        elevation={0}
      />
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {children ?? empty}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
    maxHeight: "85%",
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.textPrimary,
  },
  search: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 0,
  },
  searchInput: {
    fontSize: fontSize.sm,
  },
  list: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
});
