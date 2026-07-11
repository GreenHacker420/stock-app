import { ComponentProps, forwardRef } from "react";
import { StyleSheet, type TextInput as NativeTextInput } from "react-native";
import { HelperText, TextInput } from "react-native-paper";

import { colors, radius } from "../../theme";

type FormTextFieldProps = ComponentProps<typeof TextInput> & {
  helperText?: string;
  errorText?: string;
};

export const FormTextField = forwardRef<NativeTextInput, FormTextFieldProps>(function FormTextField(
  { helperText, errorText, style, outlineStyle, activeOutlineColor, ...props },
  ref,
) {
  const hasError = !!errorText || !!props.error;
  return (
    <>
      <TextInput
        ref={ref}
        mode="outlined"
        activeOutlineColor={activeOutlineColor ?? (hasError ? colors.danger : colors.primary)}
        outlineStyle={[styles.outline, outlineStyle]}
        style={[styles.input, style]}
        error={hasError}
        {...props}
      />
      {errorText ? (
        <HelperText type="error" visible>
          {errorText}
        </HelperText>
      ) : helperText ? (
        <HelperText type="info" visible>
          {helperText}
        </HelperText>
      ) : null}
    </>
  );
});

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.surface,
  },
  outline: {
    borderRadius: radius.md,
    borderColor: colors.border,
  },
});
