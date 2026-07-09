import { StyleSheet, StyleProp, ViewStyle, TextStyle } from "react-native";
import { Searchbar } from "react-native-paper";
import { colors, radius, fontSize, fontWeight } from "../../theme";

interface Props {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  iconColor?: string;
  placeholderTextColor?: string;
  autoFocus?: boolean;
  testID?: string;
  loading?: boolean;
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
  testID,
  loading,
}: Props) {
  return (
    <Searchbar
      placeholder={placeholder}
      value={value}
      onChangeText={onChangeText}
      style={[styles.bar, style]}
      inputStyle={[styles.input, inputStyle]}
      iconColor={iconColor ?? colors.textMuted}
      placeholderTextColor={placeholderTextColor ?? colors.textMuted}
      autoFocus={autoFocus}
      testID={testID}
      loading={loading}
      accessibilityRole="search"
      returnKeyType="search"
      elevation={0}
    />
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 0,
    minHeight: 48,
    justifyContent: "center",
  },
  input: {
    minHeight: 48,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
    paddingVertical: 0,
    includeFontPadding: false,
  },
});
