import { useState } from "react";
import { View, ScrollView } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Text, TextInput, Card, Icon } from "react-native-paper";
import { useRoute, useNavigation } from "@react-navigation/native";
import { updateShop } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { SuccessModal } from "../../components/ui/SuccessModal";

export function UpiConfig() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  const navigation = useNavigation();
  const route = useRoute<any>();
  const shop = route.params?.shop;

  const [upiId, setUpiId] = useState(shop?.upiId || "");
  const [upiName, setUpiName] = useState(shop?.upiName || "");
  const [successVisible, setSuccessVisible] = useState(false);

  const mutation = useMutation({
    mutationFn: () => updateShop(token ?? "", shop.id, { upiId, upiName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shops"] });
      setSuccessVisible(true);
    },
  });

  return (
    <Screen>
      <AppHeader title="QR Management" subtitle={`Configure UPI for ${shop?.name}`} />
      
      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="p-4 gap-6">
           <Card className="bg-blue-900 rounded-2xl overflow-hidden shadow-xl">
              <Card.Content style={{ padding: 24, gap: 12 }}>
                 <View className="flex-row justify-between items-center">
                    <Icon source="qrcode-scan" size={32} color="white" />
                    <View className="bg-white/20 px-3 py-1 rounded-full">
                       <Text style={{ color: "white", fontSize: 10, fontWeight: "900" }}>DYNAMIC GENERATION</Text>
                    </View>
                 </View>
                 <View>
                    <Text variant="headlineSmall" style={{ color: "white", fontWeight: "900" }}>Dynamic QR Codes</Text>
                    <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, lineHeight: 18, marginTop: 4 }}>
                       Setting a UPI ID allows staff to generate custom payment QR codes for every transaction, including the exact amount and shop name.
                    </Text>
                 </View>
              </Card.Content>
           </Card>

           <Section title="UPI Details">
              <View className="bg-white rounded-xl border border-gray-100 p-5 gap-5 shadow-sm">
                 <View>
                    <Text variant="labelSmall" style={{ color: "#6b7280", marginBottom: 8, fontWeight: "700" }}>VPA / UPI ID</Text>
                    <TextInput
                       mode="outlined"
                       placeholder="e.g. shopname@okicici"
                       value={upiId}
                       onChangeText={setUpiId}
                       autoCapitalize="none"
                       style={{ backgroundColor: "white" }}
                       outlineStyle={{ borderRadius: 12 }}
                       left={<TextInput.Icon icon="at" color="#94a3b8" />}
                    />
                    <HelperText visible={true} type="info">Payments will be settled directly to this ID.</HelperText>
                 </View>

                 <View>
                    <Text variant="labelSmall" style={{ color: "#6b7280", marginBottom: 8, fontWeight: "700" }}>DISPLAY NAME (ON QR)</Text>
                    <TextInput
                       mode="outlined"
                       placeholder="e.g. Nagpur Retail Store"
                       value={upiName}
                       onChangeText={setUpiName}
                       style={{ backgroundColor: "white" }}
                       outlineStyle={{ borderRadius: 12 }}
                       left={<TextInput.Icon icon="account-outline" color="#94a3b8" />}
                    />
                 </View>
              </View>
           </Section>

           <View className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex-row gap-3 items-start">
              <Icon source="shield-check-outline" size={20} color="#b45309" />
              <View className="flex-1">
                 <Text variant="titleSmall" style={{ color: "#92400e", fontWeight: "800" }}>Security Note</Text>
                 <Text variant="bodySmall" style={{ color: "#b45309", lineHeight: 16, marginTop: 2 }}>
                    Ensure the UPI ID is correct. ShopControl does not verify the ID with banks. Test with a small amount after saving.
                 </Text>
              </View>
           </View>
        </View>
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100">
         <Button
            mode="contained"
            loading={mutation.isPending}
            onPress={() => mutation.mutate()}
            style={{ borderRadius: 12, backgroundColor: "#1e40af" }}
            contentStyle={{ height: 56 }}
            labelStyle={{ fontSize: 16, fontWeight: "800" }}
         >
            Save Configuration
         </Button>
      </View>

      <SuccessModal
        visible={successVisible}
        title="UPI Configured"
        message="UPI Configuration updated successfully."
        onClose={() => {
          setSuccessVisible(false);
          navigation.goBack();
        }}
      />
    </Screen>
  );
}

function HelperText({ visible, type, children }: { visible: boolean, type: "info" | "error", children: any }) {
   return visible ? (
      <Text style={{ fontSize: 11, color: type === 'error' ? "#ef4444" : "#64748b", marginTop: 4, marginLeft: 4 }}>{children}</Text>
   ) : null;
}
