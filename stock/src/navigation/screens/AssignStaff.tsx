import { useState } from "react";
import { View, ScrollView } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Button, TextInput, List, HelperText, Portal, Modal, IconButton, Text } from "react-native-paper";
import { fetchStaff, createStaff, assignStaffToShop, Shop } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";

export function AssignStaff() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  const navigation = useNavigation();
  const route = useRoute();

  const params = route.params as { shop: Shop } | undefined;
  const shop = params?.shop;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const staffQuery = useQuery({
    queryKey: ["staff"],
    queryFn: () => fetchStaff(token ?? ""),
    enabled: !!token,
  });

  const assignMutation = useMutation({
    mutationFn: (staffId: string) => assignStaffToShop(token ?? "", shop?.id ?? "", staffId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shops"] });
      // Invalidate specific query
    },
  });

  const createStaffMutation = useMutation({
    mutationFn: () => createStaff(token ?? "", { name, mobile, email: email || null, password }),
    onSuccess: (newStaff) => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      setIsModalOpen(false);
      setName("");
      setMobile("");
      setEmail("");
      setPassword("");
      // Automatically assign new staff to the current shop
      if (newStaff?.id) {
        assignMutation.mutate(newStaff.id);
      }
    },
    onError: (err: any) => {
      setError(err?.message || "Failed to create staff member.");
    },
  });

  if (!shop) {
    return (
      <Screen>
        <Text>Invalid Shop Parameter</Text>
      </Screen>
    );
  }

  // Find if staff is already assigned to this shop
  const isAssigned = (staffId: string) => {
    // shop has staffAccesses
    const accesses = (shop as any).staffAccesses || [];
    return accesses.some((access: any) => access.staffId === staffId);
  };

  return (
    <Screen scroll={false}>
      <AppHeader title="Assign Staff" subtitle={`Manage operators for ${shop.name}`} />

      <ScrollView className="flex-1 mt-2">
        <Section title="Active Staff Members">
          <View className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
            {staffQuery.data?.length === 0 ? (
              <View className="p-5 items-center">
                <Text style={{ color: "#4b5563" }}>No staff registered yet.</Text>
              </View>
            ) : null}

            {staffQuery.data?.map((member, index) => {
              const assigned = isAssigned(member.id);
              const isAssigning = assignMutation.isPending && assignMutation.variables === member.id;

              return (
                <List.Item
                  key={member.id}
                  title={member.name}
                  description={`${member.mobile} ${member.email ? `• ${member.email}` : ""}`}
                  titleStyle={{ fontWeight: "700", color: "#111827" }}
                  descriptionStyle={{ color: "#4b5563" }}
                  right={() => (
                    <IconButton
                      icon={assigned ? "check-circle" : "plus-circle-outline"}
                      iconColor={assigned ? "#1e40af" : "#7a8578"}
                      size={24}
                      disabled={isAssigning}
                      onPress={() => {
                        if (!assigned) {
                          assignMutation.mutate(member.id);
                        }
                      }}
                    />
                  )}
                  style={{
                    borderBottomWidth: index === (staffQuery.data?.length ?? 0) - 1 ? 0 : 1,
                    borderBottomColor: "#f9fafb",
                    paddingVertical: 10,
                  }}
                />
              );
            })}
          </View>
        </Section>
      </ScrollView>

      <View className="gap-3 p-2 bg-[#f6f7f2]">
        <Button
          mode="contained"
          icon="account-plus"
          buttonColor="#1e40af"
          style={{ borderRadius: 12 }}
          contentStyle={{ height: 50 }}
          onPress={() => setIsModalOpen(true)}
        >
          Add new staff member
        </Button>
        <Button
          mode="outlined"
          style={{ borderRadius: 12 }}
          contentStyle={{ height: 50 }}
          onPress={() => navigation.goBack()}
        >
          Close
        </Button>
      </View>

      <Portal>
        <Modal
          visible={isModalOpen}
          onDismiss={() => setIsModalOpen(false)}
          contentContainerStyle={{
            backgroundColor: "white",
            padding: 24,
            margin: 20,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: "#e5e7eb",
          }}
        >
          <Text variant="headlineSmall" style={{ color: "#111827", fontWeight: "800", marginBottom: 16 }}>
            Create Staff Account
          </Text>

          <View className="gap-4">
            <TextInput
              mode="outlined"
              label="Full name"
              value={name}
              onChangeText={(text) => {
                setName(text);
                setError("");
              }}
              outlineStyle={{ borderRadius: 12, borderColor: "#e5e7eb" }}
              activeOutlineColor="#1e40af"
            />
            <TextInput
              mode="outlined"
              label="Mobile number"
              keyboardType="phone-pad"
              value={mobile}
              onChangeText={(text) => {
                setMobile(text);
                setError("");
              }}
              outlineStyle={{ borderRadius: 12, borderColor: "#e5e7eb" }}
              activeOutlineColor="#1e40af"
            />
            <TextInput
              mode="outlined"
              label="Email address (Optional)"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              outlineStyle={{ borderRadius: 12, borderColor: "#e5e7eb" }}
              activeOutlineColor="#1e40af"
            />
            <TextInput
              mode="outlined"
              label="Login password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              outlineStyle={{ borderRadius: 12, borderColor: "#e5e7eb" }}
              activeOutlineColor="#1e40af"
            />

            {error ? <HelperText type="error">{error}</HelperText> : null}

            <View className="flex-row gap-3 mt-2">
              <Button
                mode="outlined"
                style={{ flex: 1, borderRadius: 12 }}
                contentStyle={{ height: 48 }}
                onPress={() => setIsModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                mode="contained"
                buttonColor="#1e40af"
                style={{ flex: 1, borderRadius: 12 }}
                contentStyle={{ height: 48 }}
                loading={createStaffMutation.isPending}
                disabled={!name || !mobile || createStaffMutation.isPending}
                onPress={() => createStaffMutation.mutate()}
              >
                Create
              </Button>
            </View>
          </View>
        </Modal>
      </Portal>
    </Screen>
  );
}
