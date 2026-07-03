import { useState } from "react";
import { View, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute } from "@react-navigation/native";
import { Button, TextInput, HelperText, Portal, Modal, IconButton, Text } from "react-native-paper";
import { fetchStaff, createStaff, assignStaffToShop, Shop } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { queryKeys } from "../../hooks/query-keys";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { StaffCard } from "../../components/domain/staff/StaffCard";
import { colors, spacing, radius, fontSize, fontWeight } from '../../theme';
import { goBack } from "../navigation-ref";

export function AssignStaff() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
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
    queryKey: queryKeys.staff(),
    queryFn: () => fetchStaff(token ?? ""),
    enabled: !!token,
  });

  const assignMutation = useMutation({
    mutationFn: (staffId: string) => assignStaffToShop(token ?? "", shop?.id ?? "", staffId),
	    onSuccess: () => {
	      queryClient.invalidateQueries({ queryKey: queryKeys.shops() });
	      queryClient.invalidateQueries({ queryKey: queryKeys.staff() });
	    },
  });

  const createStaffMutation = useMutation({
    mutationFn: () => createStaff(token ?? "", { name, mobile, email: email || null, password }),
    onSuccess: (newStaff) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.staff() });
      setIsModalOpen(false);
      setName("");
      setMobile("");
      setEmail("");
      setPassword("");
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

  const isAssigned = (staffId: string) => {
    const accesses = (shop as any).staffAccesses || [];
    return accesses.some((access: any) => access.staffId === staffId);
  };

  return (
    <Screen scroll={false}>
      <AppHeader title="Assign Staff" subtitle={`Manage operators for ${shop.name}`} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ flex: 1, marginTop: 8 }} keyboardShouldPersistTaps="handled">
        <Section title="Active Staff Members">
          <View style={styles.staffContainer}>
            {staffQuery.data?.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No staff registered yet.</Text>
              </View>
            ) : null}

            {staffQuery.data?.map((member, index) => {
              const assigned = isAssigned(member.id);
              const isAssigning = assignMutation.isPending && assignMutation.variables === member.id;

              return (
                <StaffCard
                  key={member.id}
                  name={member.name}
                  phone={member.mobile}
                  email={member.email ?? undefined}
                  status={assigned ? "Assigned" : "Available"}
                  assignedShopName={assigned ? shop.name : undefined}
                  actions={
                    <IconButton
                      icon={assigned ? "check-circle" : "plus-circle-outline"}
                      iconColor={assigned ? colors.primary : "#7a8578"}
                      size={24}
                      style={styles.staffActionButton}
                      disabled={assigned || isAssigning}
                      onPress={() => {
                        if (!assigned) {
                          assignMutation.mutate(member.id);
                        }
                      }}
                    />
                  }
                />
              );
            })}
          </View>
        </Section>
      </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        <Button
          mode="contained"
          icon="account-plus"
          buttonColor={colors.primary}
          style={styles.footerButton}
          contentStyle={styles.buttonContent}
          onPress={() => setIsModalOpen(true)}
        >
          Add new staff member
        </Button>
        <Button
          mode="outlined"
          style={styles.footerButton}
          contentStyle={styles.buttonContent}
          onPress={() => goBack()}
        >
          Close
        </Button>
      </View>

      <Portal>
        <Modal
          visible={isModalOpen}
          onDismiss={() => setIsModalOpen(false)}
          contentContainerStyle={styles.modalContent}
        >
          <Text variant="headlineSmall" style={styles.modalTitle}>
            Create Staff Account
          </Text>

          <View style={styles.formGap}>
            <TextInput
              mode="outlined"
              label="Full name"
              value={name}
              onChangeText={(text) => {
                setName(text);
                setError("");
              }}
              outlineStyle={styles.inputOutline}
              activeOutlineColor={colors.primary}
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
              outlineStyle={styles.inputOutline}
              activeOutlineColor={colors.primary}
            />
            <TextInput
              mode="outlined"
              label="Email address (Optional)"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              outlineStyle={styles.inputOutline}
              activeOutlineColor={colors.primary}
            />
            <TextInput
              mode="outlined"
              label="Login password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              outlineStyle={styles.inputOutline}
              activeOutlineColor={colors.primary}
            />

            {error ? <HelperText type="error">{error}</HelperText> : null}

            <View style={styles.modalActions}>
              <Button
                mode="outlined"
                style={styles.modalButton}
                contentStyle={styles.modalButtonContent}
                onPress={() => setIsModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                mode="contained"
                buttonColor={colors.primary}
                style={styles.modalButton}
                contentStyle={styles.modalButtonContent}
	                loading={createStaffMutation.isPending}
	                disabled={!name.trim() || !mobile.trim() || password.length < 4 || createStaffMutation.isPending || assignMutation.isPending}
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

const styles = StyleSheet.create({
  staffContainer: {
    overflow: "hidden",
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  emptyState: {
    padding: spacing.xl,
    alignItems: "center",
  },
  emptyText: {
    color: colors.textSecondary,
  },
  staffActionButton: {
    margin: 0,
  },
  footer: {
    gap: spacing.md,
    padding: spacing.sm,
    backgroundColor: "#f6f7f2", // Specific background for footer
  },
  footerButton: {
    borderRadius: radius.md,
  },
  buttonContent: {
    height: 50,
  },
  modalContent: {
    backgroundColor: colors.surface,
    padding: spacing.xxl,
    margin: spacing.xl,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontWeight: fontWeight.extrabold,
    marginBottom: spacing.lg,
  },
  formGap: {
    gap: spacing.lg,
  },
  inputOutline: {
    borderRadius: radius.md,
    borderColor: colors.border,
  },
  modalActions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  modalButton: {
    flex: 1,
    borderRadius: radius.md,
  },
  modalButtonContent: {
    height: 48,
  },
});
