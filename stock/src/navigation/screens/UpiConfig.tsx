import React, { useState } from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Text, TextInput, Card, Icon } from "react-native-paper";
import { useRoute, useNavigation } from "@react-navigation/native";

import { updateShop } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Section } from "../../components/ui/Section";
import { SuccessModal } from "../../components/ui/SuccessModal";
import { Button } from "../../components/ui/Button";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";

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
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title="QR Management" subtitle={`Configure UPI for ${shop?.name}`} />
      
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
           <View style={styles.heroCard}>
              <View style={styles.heroHeader}>
                 <Icon source="qrcode-scan" size={32} color={colors.textInverse} />
                 <View style={styles.heroBadge}>
                    <Text style={styles.heroBadgeText}>DYNAMIC GENERATION</Text>
                 </View>
              </View>
              <View style={styles.heroBody}>
                 <Text style={styles.heroTitle}>Dynamic QR Codes</Text>
                 <Text style={styles.heroSubtitle}>
                    Setting a UPI ID allows staff to generate custom payment QR codes for every transaction, including the exact amount and shop name.
                 </Text>
              </View>
           </View>

           <Section title="UPI Details">
              <View style={styles.formCard}>
                 <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>VPA / UPI ID</Text>
                    <TextInput
                       mode="outlined"
                       placeholder="e.g. shopname@okicici"
                       value={upiId}
                       onChangeText={setUpiId}
                       autoCapitalize="none"
                       style={styles.input}
                       outlineStyle={styles.inputOutline}
                       left={<TextInput.Icon icon="at" color={colors.textMuted} />}
                    />
                    <Text style={styles.helperText}>Payments will be settled directly to this ID.</Text>
                 </View>

                 <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>DISPLAY NAME (ON QR)</Text>
                    <TextInput
                       mode="outlined"
                       placeholder="e.g. Nagpur Retail Store"
                       value={upiName}
                       onChangeText={setUpiName}
                       style={styles.input}
                       outlineStyle={styles.inputOutline}
                       left={<TextInput.Icon icon="account-outline" color={colors.textMuted} />}
                    />
                 </View>
              </View>
           </Section>

           <View style={styles.alertBox}>
              <Icon source="shield-check-outline" size={20} color={colors.warning} />
              <View style={{ flex: 1 }}>
                 <Text style={styles.alertTitle}>Security Note</Text>
                 <Text style={styles.alertSubtitle}>
                    Ensure the UPI ID is correct. ShopControl does not verify the ID with banks. Test with a small amount after saving.
                 </Text>
              </View>
           </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
         <Button
            label="SAVE CONFIGURATION"
            loading={mutation.isPending}
            onPress={() => mutation.mutate()}
            fullWidth
            size="lg"
         />
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

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 100,
  },
  container: {
    padding: spacing.lg,
    gap: spacing.xl,
  },
  heroCard: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.lg,
    ...shadow.md,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  heroBadgeText: {
    color: colors.textInverse,
    fontSize: 9,
    fontWeight: fontWeight.black,
    letterSpacing: 0.5,
  },
  heroBody: {
    gap: 4,
  },
  heroTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.black,
    color: colors.textInverse,
  },
  heroSubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    lineHeight: 18,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.xl,
    ...shadow.sm,
  },
  inputGroup: {
    gap: spacing.xs,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: fontWeight.black,
    color: colors.textMuted,
    letterSpacing: 1,
  },
  input: {
    backgroundColor: colors.surface,
    height: 56,
  },
  inputOutline: {
    borderRadius: radius.md,
  },
  helperText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
    marginLeft: 4,
  },
  alertBox: {
    backgroundColor: colors.warningLight,
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.1)',
    borderRadius: radius.lg,
    padding: spacing.lg,
    flexDirection: 'row',
    gap: spacing.md,
  },
  alertTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.warning,
  },
  alertSubtitle: {
    fontSize: 12,
    color: colors.warning,
    lineHeight: 18,
    marginTop: 2,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadow.lg,
  }
});
