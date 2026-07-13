import { View, Pressable } from "react-native";
import { Divider, Text, Switch, TextInput as PaperTextInput, Icon } from "react-native-paper";
import { AppBottomSheetModal } from "../../../../components/overlays/AppBottomSheetModal";
import { Button } from "../../../../components/ui/Button";
import { colors, spacing, radius, fontWeight } from "../../../../theme";
import { triggerLightHaptic } from "../../../../utils/haptics";

// ─── ITEM SPECIFICATION SHEET ───────────────────────────────────────────────

interface ItemSpecificationSheetProps {
  visible: boolean;
  onDismiss: () => void;
  selectedItemDetails: any | null;
  formatRawMoney: (val: any) => string;
}

export function ItemSpecificationSheet({
  visible,
  onDismiss,
  selectedItemDetails,
  formatRawMoney,
}: ItemSpecificationSheetProps) {
  if (!selectedItemDetails) return null;

  const item = selectedItemDetails.item;
  const itemName = item?.name || selectedItemDetails.itemName || "Deleted product";
  const sku = item?.sku || "—";
  const brandName = item?.brand?.name || "—";
  const categoryName = item?.category?.name || "—";
  const unitName = item?.unit || selectedItemDetails.itemUnit || "—";
  const mrpVal = item?.mrp || selectedItemDetails.mrp || 0;
  const defaultPriceVal = item?.defaultSellingPrice || selectedItemDetails.defaultPrice || 0;
  const minPriceVal = item?.minimumAllowedPrice || item?.minPrice || 0;

  return (
    <AppBottomSheetModal
      visible={visible}
      title="Item Specification"
      onDismiss={onDismiss}
      scrollable
    >
      <View style={{ gap: spacing.sm }}>
        <Text style={{ fontSize: 16, fontWeight: fontWeight.bold, color: colors.textPrimary, marginBottom: spacing.md }}>
          {itemName}
        </Text>
        
        <View style={styles.metaCell}>
          <Text style={styles.metaLabel}>SKU Code</Text>
          <Text style={styles.metaVal}>{sku}</Text>
        </View>
        <View style={styles.metaCell}>
          <Text style={styles.metaLabel}>Company / Brand</Text>
          <Text style={styles.metaVal}>{brandName}</Text>
        </View>
        <View style={styles.metaCell}>
          <Text style={styles.metaLabel}>Category</Text>
          <Text style={styles.metaVal}>{categoryName}</Text>
        </View>
        <View style={styles.metaCell}>
          <Text style={styles.metaLabel}>Measurement Unit</Text>
          <Text style={styles.metaVal}>{unitName}</Text>
        </View>
        
        <Divider style={{ marginVertical: spacing.sm, backgroundColor: colors.border }} />

        <View style={styles.metaCell}>
          <Text style={styles.metaLabel}>Maximum Retail Price (MRP)</Text>
          <Text style={[styles.metaVal, { fontWeight: fontWeight.bold }]}>
            {formatRawMoney(mrpVal)}
          </Text>
        </View>
        <View style={styles.metaCell}>
          <Text style={styles.metaLabel}>Original Selling Price</Text>
          <Text style={styles.metaVal}>{formatRawMoney(defaultPriceVal)}</Text>
        </View>
        <View style={styles.metaCell}>
          <Text style={styles.metaLabel}>Billed Selling Rate</Text>
          <Text style={[styles.metaVal, { color: colors.primary, fontWeight: fontWeight.black }]}>
            {formatRawMoney(selectedItemDetails.rate)}
          </Text>
        </View>
        <View style={styles.metaCell}>
          <Text style={styles.metaLabel}>Minimum Allowed Price</Text>
          <Text style={styles.metaVal}>{formatRawMoney(minPriceVal)}</Text>
        </View>
      </View>
    </AppBottomSheetModal>
  );
}

// ─── GST REQUIREMENT SHEET ───────────────────────────────────────────────────

interface GstRequirementSheetProps {
  visible: boolean;
  onDismiss: () => void;
  editGstRequired: boolean;
  setEditGstRequired: (val: boolean) => void;
  onSave: () => void;
  isPending: boolean;
}

export function GstRequirementSheet({
  visible,
  onDismiss,
  editGstRequired,
  setEditGstRequired,
  onSave,
  isPending,
}: GstRequirementSheetProps) {
  return (
    <AppBottomSheetModal
      visible={visible}
      title="Edit GST Details"
      onDismiss={onDismiss}
      isBusy={isPending}
    >
      <View style={{ marginVertical: spacing.md, gap: spacing.md }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 14, fontWeight: fontWeight.bold, color: colors.textPrimary }}>
            GST Invoice Required
          </Text>
          <Switch
            value={editGstRequired}
            onValueChange={setEditGstRequired}
            color={colors.primary}
          />
        </View>
      </View>

      <View style={styles.actionsRow}>
        <Button
          label="Cancel"
          variant="ghost"
          onPress={onDismiss}
          style={{ flex: 1 }}
        />
        <Button
          label="Save"
          variant="primary"
          loading={isPending}
          disabled={isPending}
          onPress={onSave}
          style={{ flex: 1.5 }}
        />
      </View>
    </AppBottomSheetModal>
  );
}

// ─── ISSUE INVOICE SHEET ─────────────────────────────────────────────────────

interface IssueInvoiceSheetProps {
  visible: boolean;
  onDismiss: () => void;
  invoiceNumber: string;
  setInvoiceNumber: (val: string) => void;
  onConfirm: () => void;
  isPending: boolean;
}

export function IssueInvoiceSheet({
  visible,
  onDismiss,
  invoiceNumber,
  setInvoiceNumber,
  onConfirm,
  isPending,
}: IssueInvoiceSheetProps) {
  return (
    <AppBottomSheetModal
      visible={visible}
      title="Issue GST Invoice"
      onDismiss={onDismiss}
      isBusy={isPending}
      scrollable
    >
      <View style={{ marginVertical: spacing.md }}>
        <PaperTextInput
          mode="outlined"
          label="Tally Invoice Number"
          value={invoiceNumber}
          onChangeText={setInvoiceNumber}
          outlineColor={colors.border}
          activeOutlineColor={colors.primary}
          textColor={colors.textPrimary}
          placeholder="e.g. VS-2026-145"
          autoCapitalize="characters"
          style={{ backgroundColor: colors.surface }}
        />
      </View>

      <View style={styles.actionsRow}>
        <Button
          label="Cancel"
          variant="ghost"
          onPress={onDismiss}
          style={{ flex: 1 }}
        />
        <Button
          label="Issue"
          variant="primary"
          loading={isPending}
          disabled={isPending || !invoiceNumber.trim()}
          onPress={onConfirm}
          style={{ flex: 1.5 }}
        />
      </View>
    </AppBottomSheetModal>
  );
}

// ─── CANCEL INVOICE SHEET ────────────────────────────────────────────────────

interface CancelInvoiceSheetProps {
  visible: boolean;
  onDismiss: () => void;
  cancelReason: string;
  setCancelReason: (val: string) => void;
  cancelNotes: string;
  setCancelNotes: (val: string) => void;
  onConfirm: () => void;
  isPending: boolean;
}

export function CancelInvoiceSheet({
  visible,
  onDismiss,
  cancelReason,
  setCancelReason,
  cancelNotes,
  setCancelNotes,
  onConfirm,
  isPending,
}: CancelInvoiceSheetProps) {
  return (
    <AppBottomSheetModal
      visible={visible}
      title="Cancel GST Invoice"
      onDismiss={onDismiss}
      isBusy={isPending}
      scrollable
    >
      <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: spacing.md }}>
        Cancellations are permanent and recorded in the audit log. Select a reason:
      </Text>

      <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
        {[
          "Incorrect GST number",
          "Duplicate invoice",
          "Customer details incorrect",
          "Sale cancelled",
          "Other",
        ].map((reason) => {
          const isSelected = cancelReason === reason;
          return (
            <Pressable
              key={reason}
              onPress={() => {
                triggerLightHaptic();
                setCancelReason(reason);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: spacing.md,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: isSelected ? colors.primary : colors.border,
                backgroundColor: isSelected ? colors.surfaceOffset : colors.surface,
                gap: spacing.sm,
              }}
            >
              <Icon
                source={isSelected ? "radiobox-marked" : "radiobox-blank"}
                size={20}
                color={isSelected ? colors.primary : colors.textSecondary}
              />
              <Text style={{ fontSize: 14, fontWeight: isSelected ? fontWeight.bold : fontWeight.regular, color: colors.textPrimary }}>
                {reason}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {cancelReason === "Other" && (
        <View style={{ marginBottom: spacing.md }}>
          <PaperTextInput
            mode="outlined"
            label="Provide cancellation reason"
            value={cancelNotes}
            onChangeText={setCancelNotes}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
            textColor={colors.textPrimary}
            placeholder="Explain why this invoice is being cancelled..."
            style={{ backgroundColor: colors.surface }}
            multiline
            numberOfLines={2}
          />
        </View>
      )}

      <View style={styles.actionsRow}>
        <Button
          label="Dismiss"
          variant="ghost"
          onPress={onDismiss}
          style={{ flex: 1 }}
        />
        <Button
          label="Cancel Invoice"
          variant="danger"
          loading={isPending}
          disabled={isPending || !cancelReason || (cancelReason === "Other" && !cancelNotes.trim())}
          onPress={onConfirm}
          style={{ flex: 1.5 }}
        />
      </View>
    </AppBottomSheetModal>
  );
}

const styles = {
  metaCell: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    paddingVertical: spacing.xs,
  },
  metaLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  metaVal: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  actionsRow: {
    flexDirection: "row" as const,
    gap: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
};
