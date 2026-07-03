import { StyleSheet } from "react-native";
import { AppSearchBar } from "../ui/AppSearchBar";

export function SearchBar({
  value,
  onChange,
  placeholder = "Search products…",
  autoFocus = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <AppSearchBar
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      autoFocus={autoFocus}
      style={styles.searchBar}
    />
  );
}

const styles = StyleSheet.create({
  searchBar: {
    width: "100%",
  },
});
