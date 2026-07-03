import { ComponentProps } from "react";
import { TextInput } from "react-native-paper";

import { FormTextField } from "./FormTextField";

type AmountInputProps = Omit<ComponentProps<typeof FormTextField>, "keyboardType" | "left"> & {
  currency?: string;
};

export function AmountInput({ currency = "₹", ...props }: AmountInputProps) {
  return (
    <FormTextField
      keyboardType="numeric"
      left={<TextInput.Affix text={`${currency} `} />}
      {...props}
    />
  );
}
