import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute } from "@react-navigation/native";
import { createShop, updateShop, Shop } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { FormScreen } from "../../components/layout/FormScreen";
import { ScreenSection } from "../../components/layout/ScreenSection";
import { StickyFooterActions } from "../../components/layout/StickyFooterActions";
import { FormTextField } from "../../components/forms/FormTextField";
import { spacing } from "../../theme";
import { goBack } from "../navigation-ref";

export function CreateEditShop() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  const route = useRoute();

  const params = route.params as { shop?: Shop } | undefined;
  const shop = params?.shop;
  const isEditing = !!shop;

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [gstin, setGstin] = useState("");
  const [logo, setLogo] = useState("");
  const [error, setError] = useState("");
  const [codeError, setCodeError] = useState("");

  useEffect(() => {
    if (shop) {
      setName(shop.name);
      setCode(shop.code);
      setCity(shop.city);
      setAddress(shop.address || "");
      setPhone(shop.phone || "");
      setEmail(shop.email || "");
      setGstin(shop.gstin || "");
      setLogo(shop.logo || "");
    }
  }, [shop]);

  const handleCodeChange = (text: string) => {
    const upper = text.toUpperCase().replace(/[^A-Z0-9\-_]/g, "");
    setCode(upper);
    setError("");
    if (upper.length > 0 && upper.length < 2) {
      setCodeError("Code must be at least 2 characters.");
    } else {
      setCodeError("");
    }
  };

  const mutation = useMutation({
    mutationFn: () => {
      if (isEditing && shop) {
        return updateShop(token ?? "", shop.id, {
          name,
          city,
          address: address || null,
          phone: phone || null,
          email: email || null,
          gstin: gstin || null,
          logo: logo || null,
        });
      } else {
        return createShop(token ?? "", {
          name,
          code,
          city,
          address: address || undefined,
          phone: phone || undefined,
          email: email || undefined,
          gstin: gstin || undefined,
          logo: logo || undefined,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shops"] });
      goBack();
    },
    onError: (err: any) => {
      const msg: string = err?.message || "Something went wrong. Please check your inputs.";
      const field: string | null = err?.field ?? null;
      // If the backend tells us it's a "code" field conflict, show it inline
      if (field === "code" || msg.toLowerCase().includes("code already exists")) {
        setCodeError("This shop code is already taken. Try a different one (e.g. NGP-02).");
      } else {
        setError(msg);
      }
    },
  });

  const isValid =
    name.trim().length > 0 &&
    code.trim().length >= 2 &&
    city.trim().length > 0 &&
    codeError === "";

  return (
    <FormScreen
        title={isEditing ? "Edit Shop" : "Add Shop"}
        subtitle={isEditing ? `Modify details for ${shop?.name}` : "Establish a new retail or wholesale counter."}
        showBack
        footer={
          <StickyFooterActions
            primary={{
              label: isEditing ? "Save changes" : "Create shop",
              onPress: () => mutation.mutate(),
              loading: mutation.isPending,
              disabled: !isValid || mutation.isPending,
              haptic: "medium",
            }}
          />
        }
      >
          <ScreenSection title="Shop credentials" card contentStyle={styles.formContainer}>
              <FormTextField
                label="Shop name"
                value={name}
                onChangeText={(text) => {
                  setName(text);
                  setError("");
                }}
                placeholder="e.g. Nagpur Branch"
              />

              <FormTextField
                  label="Shop unique code"
                  value={code}
                  onChangeText={handleCodeChange}
                  disabled={isEditing}
                  placeholder="e.g. NGP-01"
                  autoCapitalize="characters"
                  error={!!codeError}
                  errorText={codeError}
                  helperText="Uppercase letters, numbers, hyphens only. Cannot be changed later."
              />

              <FormTextField
                label="City"
                value={city}
                onChangeText={(text) => {
                  setCity(text);
                  setError("");
                }}
                placeholder="e.g. Nagpur"
              />

              <FormTextField
                label="Address (Optional)"
                value={address}
                onChangeText={setAddress}
                placeholder="e.g. Near Metro Station"
                multiline
                numberOfLines={3}
              />

              <FormTextField
                label="Phone (Optional)"
                value={phone}
                onChangeText={setPhone}
                placeholder="e.g. +91 98765 43210"
                keyboardType="phone-pad"
              />

              <FormTextField
                label="Email (Optional)"
                value={email}
                onChangeText={setEmail}
                placeholder="e.g. info@abc.com"
                keyboardType="email-address"
              />

              <FormTextField
                label="GSTIN (Optional)"
                value={gstin}
                onChangeText={setGstin}
                placeholder="e.g. 27AAAAA1111A1Z1"
                autoCapitalize="characters"
              />

              <FormTextField
                label="Logo URL (Optional)"
                value={logo}
                onChangeText={setLogo}
                placeholder="e.g. https://domain.com/logo.png"
                keyboardType="url"
                errorText={error}
              />
          </ScreenSection>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  formContainer: {
    gap: spacing.lg,
  },
});
