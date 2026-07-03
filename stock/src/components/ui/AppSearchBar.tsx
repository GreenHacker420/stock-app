import { StyleSheet, StyleProp, ViewStyle, TextStyle } from "react-native";
import { Searchbar } from "react-native-paper";
import { colors, radius } from "../../theme";

interface Props {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  iconColor?: string;
  placeholderTextColor?: string;
  autoFocus?: boolean;
}

export function AppSearchBar({
  value,
  onChangeText,
  placeholder,
  style,
  inputStyle,
  iconColor,
  placeholderTextColor,
  autoFocus,
}: Props) {
  return (
    <Searchbar
      placeholder={placeholder}
      value={value}
      onChangeText={onChangeText}
      style={[styles.bar, style]}
      inputStyle={inputStyle}
      iconColor={iconColor}
      placeholderTextColor={placeholderTextColor}
      autoFocus={autoFocus}
    />
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 0,
  },
});
