import { useEffect, useState } from "react";
import { View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Button, TextInput, HelperText } from "react-native-paper";
import { createShop, updateShop, Shop } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";

export function CreateEditShop() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  const navigation = useNavigation();
  const route = useRoute();

  // Get shop details if editing
  const params = route.params as { shop?: Shop } | undefined;
  const shop = params?.shop;
  const isEditing = !!shop;

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [openingCash, setOpeningCash] = useState("0");
  const [error, setError] = useState("");

  useEffect(() => {
    if (shop) {
      setName(shop.name);
      setCode(shop.code);
      setCity(shop.city);
      setAddress(""); // address is not returned by default list but editable
      setOpeningCash(String(shop.openingCash || "0"));
    }
  }, [shop]);

  const mutation = useMutation({
    mutationFn: () => {
      if (isEditing && shop) {
        return updateShop(token ?? "", shop.id, {
          name,
          city,
          address: address || undefined,
        });
      } else {
        return createShop(token ?? "", {
          name,
          code,
          city,
          address: address || undefined,
          openingCash: Number(openingCash || 0),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shops"] });
      navigation.goBack();
    },
    onError: (err: any) => {
      setError(err?.message || "Something went wrong. Please check your inputs.");
    },
  });

  const isValid = name.trim().length > 0 && code.trim().length > 0 && city.trim().length > 0;

  return (
    <Screen>
      <AppHeader
        title={isEditing ? "Edit Shop" : "Add Shop"}
        subtitle={isEditing ? `Modify details for ${shop?.name}` : "Establish a new retail or wholesale counter."}
      />

      <Section title="Shop credentials">
        <View className="gap-4 rounded-2xl border border-[#e5e7eb] bg-white p-4.5">
          <TextInput
            mode="outlined"
            label="Shop name"
            value={name}
            onChangeText={(text) => {
              setName(text);
              setError("");
            }}
            placeholder="e.g. Nagpur Branch"
            outlineStyle={{ borderRadius: 12, borderColor: "#e5e7eb" }}
            activeOutlineColor="#1e40af"
          />

          <TextInput
            mode="outlined"
            label="Shop unique code"
            value={code}
            onChangeText={(text) => {
              setCode(text.toUpperCase());
              setError("");
            }}
            disabled={isEditing}
            placeholder="e.g. NGP-01"
            outlineStyle={{ borderRadius: 12, borderColor: "#e5e7eb" }}
            activeOutlineColor="#1e40af"
          />

          <TextInput
            mode="outlined"
            label="City"
            value={city}
            onChangeText={(text) => {
              setCity(text);
              setError("");
            }}
            placeholder="e.g. Nagpur"
            outlineStyle={{ borderRadius: 12, borderColor: "#e5e7eb" }}
            activeOutlineColor="#1e40af"
          />

          <TextInput
            mode="outlined"
            label="Address (Optional)"
            value={address}
            onChangeText={setAddress}
            placeholder="e.g. Near Metro Station"
            multiline
            numberOfLines={3}
            outlineStyle={{ borderRadius: 12, borderColor: "#e5e7eb" }}
            activeOutlineColor="#1e40af"
          />

          {!isEditing && (
            <TextInput
              mode="outlined"
              label="Opening cash drawer amount"
              value={openingCash}
              onChangeText={(text) => {
                setOpeningCash(text.replace(/[^0-9.]/g, ""));
                setError("");
              }}
              keyboardType="numeric"
              placeholder="0"
              outlineStyle={{ borderRadius: 12, borderColor: "#e5e7eb" }}
              activeOutlineColor="#1e40af"
            />
          )}

          {error ? <HelperText type="error">{error}</HelperText> : null}

          <Button
            mode="contained"
            disabled={!isValid || mutation.isPending}
            loading={mutation.isPending}
            style={{ borderRadius: 12, marginTop: 8 }}
            contentStyle={{ height: 50 }}
            buttonColor="#1e40af"
            onPress={() => mutation.mutate()}
          >
            {isEditing ? "Save changes" : "Create shop"}
          </Button>
        </View>
      </Section>
    </Screen>
  );
}
