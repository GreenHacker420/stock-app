import { useState } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  KeyboardAvoidingView,
} from "react-native";
import { Divider, Icon, List, Text, TextInput } from "react-native-paper";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../../../theme";
import { AppSearchBar } from "../../../../components/ui/AppSearchBar";
import { Button } from "../../../../components/ui/Button";
import type { Customer } from "../../../../api/client";

interface CustomerSelectorProps {
  mode: "REGULAR" | "WALK_IN";
  customerId: string | null;
  selectedCustomer: Customer | null;
  customerSearch: string;
  setCustomerSearch: (val: string) => void;
  filteredCustomers: Customer[];
  isCustomerSearchPending: boolean;
  canOfferCustomerCreation: boolean;
  onSelectCustomer: (customer: Customer) => void;
  onClearCustomer: () => void;
  // Walk-in custom details
  customerName?: string;
  setCustomerName?: (val: string) => void;
  customerPhone?: string;
  setCustomerPhone?: (val: string) => void;
  onCreateCustomerPress?: () => void;
  isOffline?: boolean;
}

export function CustomerSelector({
  mode,
  customerId,
  selectedCustomer,
  customerSearch,
  setCustomerSearch,
  filteredCustomers,
  isCustomerSearchPending,
  canOfferCustomerCreation,
  onSelectCustomer,
  onClearCustomer,
  customerName = "",
  setCustomerName,
  customerPhone = "",
  setCustomerPhone,
  onCreateCustomerPress,
  isOffline = false,
}: CustomerSelectorProps) {
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);

  // Derive Walk-in display text
  const walkInSummary = () => {
    if (selectedCustomer) return `Customer: ${selectedCustomer.name}`;
    if (customerName.trim()) return `Walk-in: ${customerName.trim()}`;
    return "Anonymous walk-in";
  };

  const handleWalkInSave = () => {
    setDetailsModalVisible(false);
  };

  const handleWalkInClear = () => {
    if (setCustomerName) setCustomerName("");
    if (setCustomerPhone) setCustomerPhone("");
    onClearCustomer();
    setDetailsModalVisible(false);
  };

  if (mode === "WALK_IN") {
    const isAnonymous = !selectedCustomer && !customerName.trim() && !customerPhone.trim();
    return (
      <View style={styles.container}>
        <View style={styles.walkInCard}>
          <View style={styles.walkInInfo}>
            <View style={[styles.avatar, isAnonymous ? styles.avatarMuted : styles.avatarActive]}>
              <Icon
                source={isAnonymous ? "account-outline" : "account"}
                size={20}
                color={isAnonymous ? colors.textSecondary : colors.primary}
              />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.walkInTitle}>{walkInSummary()}</Text>
              {customerPhone.trim() ? (
                <Text style={styles.walkInSub}>{customerPhone}</Text>
              ) : selectedCustomer?.phone ? (
                <Text style={styles.walkInSub}>{selectedCustomer.phone}</Text>
              ) : (
                <Text style={styles.walkInSub}>No details provided</Text>
              )}
            </View>
          </View>
          <Pressable
            onPress={() => setDetailsModalVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Edit Walk-in customer details"
            style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
          >
            <Text style={styles.actionBtnText}>{isAnonymous ? "Add details" : "Change"}</Text>
          </Pressable>
        </View>

        {/* Walk-in Customer Details Modal */}
        <Modal
          visible={detailsModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setDetailsModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <Pressable style={styles.backdrop} onPress={() => setDetailsModalVisible(false)} />
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              style={styles.modalAvoidingView}
            >
              <View style={styles.modalContent}>
                {/* Modal Header */}
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Customer Details</Text>
                  <Pressable
                    onPress={() => setDetailsModalVisible(false)}
                    hitSlop={12}
                    accessibilityRole="button"
                    style={styles.closeBtn}
                  >
                    <Icon source="close" size={24} color={colors.textSecondary} />
                  </Pressable>
                </View>

                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.modalScroll}
                >
                  {/* Search Existing */}
                  {!selectedCustomer && (
                    <View style={styles.searchSection}>
                      <Text style={styles.sectionLabel}>Search Existing Customer</Text>
                      <View style={styles.searchRow}>
                        <AppSearchBar
                          placeholder="Search name or mobile..."
                          onChangeText={setCustomerSearch}
                          value={customerSearch}
                          style={styles.flex1}
                        />
                        {onCreateCustomerPress && (
                          <Pressable
                            onPress={onCreateCustomerPress}
                            style={({ pressed }) => [styles.searchAddBtn, pressed && styles.pressed]}
                          >
                            <Icon source="account-plus" size={24} color={colors.primary} />
                          </Pressable>
                        )}
                      </View>

                      {isCustomerSearchPending && customerSearch.trim() && (
                        <View style={styles.statusRow}>
                          <Text style={styles.statusText}>Searching...</Text>
                        </View>
                      )}

                      {canOfferCustomerCreation && customerSearch.trim() && onCreateCustomerPress && (
                        <Pressable
                          onPress={onCreateCustomerPress}
                          style={styles.statusRow}
                        >
                          <Icon source="account-plus-outline" size={16} color={colors.primary} />
                          <Text style={styles.createOfferText}>
                            No match. Create "{customerSearch}"?
                          </Text>
                        </Pressable>
                      )}

                      {customerSearch.trim() && filteredCustomers.length > 0 && (
                        <View style={styles.dropdown}>
                          {filteredCustomers.map((c) => (
                            <List.Item
                              key={c.id}
                              title={c.name}
                              description={c.phone || "No phone"}
                              onPress={() => {
                                onSelectCustomer(c);
                                setCustomerSearch("");
                              }}
                              right={(props) => (
                                <List.Icon
                                  {...props}
                                  icon="account-check-outline"
                                  color={colors.primary}
                                />
                              )}
                              style={styles.dropdownItem}
                            />
                          ))}
                        </View>
                      )}
                    </View>
                  )}

                  {/* Selected Existing Customer Card */}
                  {selectedCustomer && (
                    <View style={styles.selectedCustCard}>
                      <View style={styles.flexRow}>
                        <View style={[styles.avatar, styles.avatarActive]}>
                          <Text style={styles.avatarLetter}>
                            {selectedCustomer.name[0].toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.flex1}>
                          <Text style={styles.custName}>{selectedCustomer.name}</Text>
                          <Text style={styles.custPhone}>{selectedCustomer.phone || "No phone"}</Text>
                        </View>
                        <Pressable
                          onPress={onClearCustomer}
                          style={({ pressed }) => [styles.clearBtn, pressed && styles.pressed]}
                        >
                          <Text style={styles.clearBtnText}>CLEAR</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}

                  {!selectedCustomer && (
                    <>
                      <View style={styles.orRow}>
                        <Divider style={styles.divider} />
                        <Text style={styles.orText}>OR QUICK WALK-IN DETAILS</Text>
                        <Divider style={styles.divider} />
                      </View>

                      {/* Quick Name Input */}
                      <TextInput
                        mode="outlined"
                        label="Customer Name"
                        value={customerName}
                        onChangeText={setCustomerName}
                        outlineStyle={styles.inputOutline}
                        left={<TextInput.Icon icon="account-outline" />}
                        style={styles.input}
                      />

                      {/* Quick Phone Input */}
                      <TextInput
                        mode="outlined"
                        label="Mobile Number"
                        value={customerPhone}
                        onChangeText={setCustomerPhone}
                        keyboardType="phone-pad"
                        outlineStyle={styles.inputOutline}
                        left={<TextInput.Icon icon="phone-outline" />}
                        style={styles.input}
                      />
                    </>
                  )}
                </ScrollView>

                {/* Modal Footer */}
                <View style={styles.modalFooter}>
                  <Pressable
                    onPress={handleWalkInClear}
                    style={({ pressed }) => [styles.footerClearBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.footerClearBtnText}>Continue Anonymously</Text>
                  </Pressable>

                  <Pressable
                    onPress={handleWalkInSave}
                    style={({ pressed }) => [styles.footerSaveBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.footerSaveBtnText}>Confirm Details</Text>
                  </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      </View>
    );
  }

  // Regular Mode
  return (
    <View style={styles.container}>
      {selectedCustomer ? (
        <View style={styles.selectedCustCardRegular}>
          <View style={styles.flexRow}>
            <View style={[styles.avatar, styles.avatarActive]}>
              <Text style={styles.avatarLetter}>{selectedCustomer.name[0].toUpperCase()}</Text>
            </View>
            <View style={styles.flex1}>
              <Text style={styles.custName} numberOfLines={1}>
                {selectedCustomer.name}
              </Text>
              <Text style={styles.custPhone}>{selectedCustomer.phone || "No phone"}</Text>
            </View>
            <Pressable
              onPress={onClearCustomer}
              accessibilityRole="button"
              accessibilityLabel="Change selected customer"
              style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
            >
              <Text style={styles.actionBtnText}>Change</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.searchSectionRegular}>
          <Text style={styles.sectionLabelRegular}>Customer Details *</Text>
          <View style={styles.searchRow}>
            <AppSearchBar
              placeholder="Search customer name or phone..."
              onChangeText={setCustomerSearch}
              value={customerSearch}
              style={styles.flex1}
            />
            {onCreateCustomerPress && (
              <Pressable
                onPress={onCreateCustomerPress}
                style={({ pressed }) => [styles.searchAddBtn, pressed && styles.pressed]}
              >
                <Icon source="account-plus" size={24} color={colors.primary} />
              </Pressable>
            )}
          </View>

          {isCustomerSearchPending && customerSearch.trim() && (
            <View style={styles.statusRow}>
              <Text style={styles.statusText}>Searching...</Text>
            </View>
          )}

          {canOfferCustomerCreation && customerSearch.trim() && onCreateCustomerPress && (
            <Pressable
              onPress={onCreateCustomerPress}
              style={styles.statusRow}
            >
              <Icon source="account-plus-outline" size={16} color={colors.primary} />
              <Text style={styles.createOfferText}>
                No matches. Create "{customerSearch}"?
              </Text>
            </Pressable>
          )}

          {customerSearch.trim() && filteredCustomers.length > 0 && (
            <View style={styles.dropdownRegular}>
              {filteredCustomers.map((c) => (
                <List.Item
                  key={c.id}
                  title={c.name}
                  description={c.phone || "No phone"}
                  onPress={() => {
                    onSelectCustomer(c);
                    setCustomerSearch("");
                  }}
                  right={(props) => (
                    <List.Icon {...props} icon="account-check-outline" color={colors.primary} />
                  )}
                  style={styles.dropdownItem}
                />
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.sm,
  },
  walkInCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    ...shadow.sm,
  },
  walkInInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  walkInTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  walkInSub: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarMuted: {
    backgroundColor: colors.surfaceOffset,
  },
  avatarActive: {
    backgroundColor: colors.primaryLight,
  },
  avatarLetter: {
    color: colors.primary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  actionBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 36,
    justifyContent: "center",
  },
  actionBtnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  flex1: {
    flex: 1,
  },
  flexRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  pressed: {
    opacity: 0.7,
  },
  // Modal layout
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: colors.overlay,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  modalAvoidingView: {
    width: "100%",
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: Dimensions.get("window").height * 0.8,
    ...shadow.lg,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  modalScroll: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  searchSection: {
    marginBottom: spacing.xs,
  },
  searchRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
  },
  searchAddBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
  },
  statusText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  createOfferText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  dropdown: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    marginTop: spacing.xs,
    overflow: "hidden",
    ...shadow.sm,
  },
  dropdownItem: {
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceOffset,
  },
  selectedCustCard: {
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  selectedCustCardRegular: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  custName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  custPhone: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  clearBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.surface,
  },
  clearBtnText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.danger,
  },
  orRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing.md,
    gap: spacing.sm,
  },
  divider: {
    flex: 1,
  },
  orText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
    letterSpacing: 1,
  },
  input: {
    backgroundColor: colors.surface,
  },
  inputOutline: {
    borderRadius: radius.md,
    borderColor: colors.border,
  },
  modalFooter: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  footerSaveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  footerSaveBtnText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textInverse,
  },
  footerClearBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  footerClearBtnText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  // Regular search section
  searchSectionRegular: {
    paddingVertical: spacing.xs,
  },
  sectionLabelRegular: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  dropdownRegular: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    marginTop: spacing.md,
    overflow: "hidden",
    ...shadow.sm,
  },
});
