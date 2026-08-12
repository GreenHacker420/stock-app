import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Button, Text, TextInput } from "react-native-paper";

import type { WaBroadcastTemplateBinding } from "../../../api/whatsapp-broadcast.api";
import type { WaTemplateAttribute, WaTemplateMapping } from "../../../api/whatsapp.api";
import { AppBottomSheetModal } from "../../../components/overlays/AppBottomSheetModal";
import { colors, fontSize, fontWeight, radius, spacing } from "../../../theme";
import { triggerLightHaptic } from "../../../utils/haptics";

export type RuntimeBindingMap = Record<string, WaBroadcastTemplateBinding>;

export function runtimeBindingKey(
  mapping: Pick<WaTemplateMapping, "component" | "position" | "buttonIndex" | "cardIndex">,
) {
  return `${mapping.component}:${mapping.cardIndex ?? ""}:${mapping.buttonIndex ?? ""}:${mapping.position}`;
}

export function createInitialRuntimeBindings(mappings: WaTemplateMapping[]): RuntimeBindingMap {
  return Object.fromEntries(mappings.map((mapping) => {
    const key = runtimeBindingKey(mapping);
    const base = {
      component: mapping.component,
      position: mapping.position,
      ...(mapping.buttonIndex != null ? { buttonIndex: mapping.buttonIndex } : {}),
      ...(mapping.cardIndex != null ? { cardIndex: mapping.cardIndex } : {}),
    };

    const binding: WaBroadcastTemplateBinding = mapping.attributeId
      ? {
          ...base,
          mode: "ATTRIBUTE",
          attributeId: mapping.attributeId,
          fallbackValue: mapping.fallbackValue || mapping.attribute?.fallbackValue || "",
        }
      : {
          ...base,
          mode: "FIXED",
          value: mapping.fallbackValue || "",
        };
    return [key, binding];
  }));
}

export function runtimeBindingsReady(mappings: WaTemplateMapping[], bindings: RuntimeBindingMap) {
  return mappings.every((mapping) => {
    const binding = bindings[runtimeBindingKey(mapping)];
    if (!binding) return false;
    if (binding.mode === "FIXED") return Boolean(binding.value?.trim());
    return Boolean(binding.attributeId);
  });
}

function mappingTitle(mapping: WaTemplateMapping) {
  if (mapping.component === "HEADER") return `Header {{${mapping.position}}}`;
  if (mapping.component === "BODY") return `Message {{${mapping.position}}}`;
  if (mapping.component === "BUTTON") return `Button ${(mapping.buttonIndex ?? 0) + 1} {{${mapping.position}}}`;
  return `Card ${(mapping.cardIndex ?? 0) + 1} {{${mapping.position}}}`;
}

function sourceLabel(source?: WaTemplateAttribute["source"]) {
  if (source === "CUSTOMER") return "Customer";
  if (source === "CONVERSATION") return "WhatsApp contact";
  if (source === "SHOP") return "Shop";
  return "Data";
}

function attributeIcon(attribute: WaTemplateAttribute) {
  if (attribute.source === "CUSTOMER") return "account-outline";
  if (attribute.source === "CONVERSATION") return "whatsapp";
  if (attribute.source === "SHOP") return "store-outline";
  return "database-outline";
}

export function TemplateRuntimeBindings({
  mappings,
  attributes,
  bindings,
  onChange,
}: {
  mappings: WaTemplateMapping[];
  attributes: WaTemplateAttribute[];
  bindings: RuntimeBindingMap;
  onChange: (bindings: RuntimeBindingMap) => void;
}) {
  const [activeMapping, setActiveMapping] = useState<WaTemplateMapping | null>(null);
  const [fixedValue, setFixedValue] = useState("");
  const [fallbackValue, setFallbackValue] = useState("");

  const availableAttributes = useMemo(
    () => attributes.filter((attribute) => (
      attribute.isActive
      && ["CUSTOMER", "CONVERSATION", "SHOP"].includes(attribute.source)
    )),
    [attributes],
  );

  const activeKey = activeMapping ? runtimeBindingKey(activeMapping) : null;
  const activeBinding = activeKey ? bindings[activeKey] : undefined;

  const openMapping = (mapping: WaTemplateMapping) => {
    const binding = bindings[runtimeBindingKey(mapping)];
    setFixedValue(binding?.mode === "FIXED" ? binding.value || "" : "");
    setFallbackValue(binding?.fallbackValue || mapping.fallbackValue || mapping.attribute?.fallbackValue || "");
    setActiveMapping(mapping);
    triggerLightHaptic();
  };

  const close = () => {
    setActiveMapping(null);
    setFixedValue("");
    setFallbackValue("");
  };

  const selectAttribute = (attribute: WaTemplateAttribute) => {
    if (!activeMapping || !activeKey) return;
    onChange({
      ...bindings,
      [activeKey]: {
        component: activeMapping.component,
        position: activeMapping.position,
        ...(activeMapping.buttonIndex != null ? { buttonIndex: activeMapping.buttonIndex } : {}),
        ...(activeMapping.cardIndex != null ? { cardIndex: activeMapping.cardIndex } : {}),
        mode: "ATTRIBUTE",
        attributeId: attribute.id,
        fallbackValue: fallbackValue || attribute.fallbackValue || "",
      },
    });
    close();
  };

  const saveFixed = () => {
    if (!activeMapping || !activeKey || !fixedValue.trim()) return;
    onChange({
      ...bindings,
      [activeKey]: {
        component: activeMapping.component,
        position: activeMapping.position,
        ...(activeMapping.buttonIndex != null ? { buttonIndex: activeMapping.buttonIndex } : {}),
        ...(activeMapping.cardIndex != null ? { cardIndex: activeMapping.cardIndex } : {}),
        mode: "FIXED",
        value: fixedValue.trim(),
      },
    });
    close();
  };

  if (!mappings.length) return null;

  return (
    <>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>PERSONALIZATION</Text>
        <Text style={styles.title}>Choose what each variable means for this send.</Text>
        <Text style={styles.copy}>
          Pick live customer/shop data or enter a campaign-specific value such as a coupon code, date or offer amount.
        </Text>
      </View>

      <View style={styles.list}>
        {mappings.map((mapping) => {
          const key = runtimeBindingKey(mapping);
          const binding = bindings[key];
          const attribute = binding?.attributeId
            ? attributes.find((item) => item.id === binding.attributeId)
            : undefined;
          const configured = binding?.mode === "ATTRIBUTE"
            ? Boolean(attribute)
            : Boolean(binding?.value?.trim());

          return (
            <Pressable
              key={key}
              onPress={() => openMapping(mapping)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`${mappingTitle(mapping)}, ${configured ? "configured" : "needs a value"}`}
            >
              <View style={[styles.variableBadge, !configured && styles.variableBadgeWarning]}>
                <Text style={[styles.variableText, !configured && styles.variableTextWarning]}>
                  {`{{${mapping.position}}}`}
                </Text>
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.mappingTitle}>{mappingTitle(mapping)}</Text>
                {binding?.mode === "ATTRIBUTE" && attribute ? (
                  <Text style={styles.mappingValue} numberOfLines={1}>
                    {sourceLabel(attribute.source)} · {attribute.label}
                  </Text>
                ) : binding?.mode === "FIXED" && binding.value ? (
                  <Text style={styles.mappingValue} numberOfLines={1}>Fixed · {binding.value}</Text>
                ) : (
                  <Text style={styles.missingValue}>Choose a value source</Text>
                )}
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
            </Pressable>
          );
        })}
      </View>

      <AppBottomSheetModal
        visible={Boolean(activeMapping)}
        title={activeMapping ? `Value for {{${activeMapping.position}}}` : "Variable value"}
        subtitle="This choice belongs to this campaign, not the reusable Meta template."
        onDismiss={close}
        maxHeight={0.88}
        scrollable
      >
        <View style={styles.sheetContent}>
          <Text style={styles.sheetSection}>LIVE DATA</Text>
          <View style={styles.attributeList}>
            {availableAttributes.map((attribute) => {
              const selected = activeBinding?.mode === "ATTRIBUTE" && activeBinding.attributeId === attribute.id;
              return (
                <Pressable
                  key={attribute.id}
                  onPress={() => selectAttribute(attribute)}
                  style={({ pressed }) => [styles.attributeRow, pressed && styles.pressed]}
                >
                  <View style={[styles.attributeIcon, selected && styles.attributeIconSelected]}>
                    <MaterialCommunityIcons
                      name={attributeIcon(attribute) as any}
                      size={20}
                      color={selected ? colors.textInverse : colors.textSecondary}
                    />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.attributeTitle}>{attribute.label}</Text>
                    <Text style={styles.attributeSubtitle} numberOfLines={1}>
                      {sourceLabel(attribute.source)}{attribute.description ? ` · ${attribute.description}` : ""}
                    </Text>
                  </View>
                  {selected ? <MaterialCommunityIcons name="check" size={21} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sheetSection}>FIXED FOR THIS SEND</Text>
          <TextInput
            mode="flat"
            label="Value"
            value={fixedValue}
            placeholder={activeMapping?.sampleValue || "e.g. RAKHI20"}
            onChangeText={setFixedValue}
            style={styles.flatInput}
            underlineColor={colors.borderStrong}
            activeUnderlineColor={colors.primary}
          />
          <Text style={styles.helper}>
            Use this for promo codes, offer text, dates or any value that should be identical for every recipient.
          </Text>
          <Button
            mode="contained"
            icon="check"
            disabled={!fixedValue.trim()}
            onPress={saveFixed}
            style={styles.fixedButton}
          >
            Use fixed value
          </Button>

          {activeBinding?.mode === "ATTRIBUTE" ? (
            <>
              <Text style={styles.sheetSection}>IF DATA IS MISSING</Text>
              <TextInput
                mode="flat"
                label="Fallback (optional)"
                value={fallbackValue}
                onChangeText={setFallbackValue}
                placeholder={activeMapping?.sampleValue || "Fallback text"}
                style={styles.flatInput}
                underlineColor={colors.borderStrong}
                activeUnderlineColor={colors.primary}
              />
              <Text style={styles.helper}>
                Device-only contacts may not have every customer field. Name and phone can still resolve from the selected recipient snapshot.
              </Text>
            </>
          ) : null}
        </View>
      </AppBottomSheetModal>
    </>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: spacing.sm, paddingBottom: spacing.md },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: fontWeight.black, letterSpacing: 1.1 },
  title: { marginTop: 5, color: colors.textPrimary, fontSize: fontSize.lg, lineHeight: 23, fontWeight: fontWeight.extrabold },
  copy: { marginTop: 5, color: colors.textSecondary, fontSize: fontSize.xs, lineHeight: 18 },
  list: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  row: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  variableBadge: { minWidth: 43, height: 30, paddingHorizontal: 7, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryLight },
  variableBadgeWarning: { backgroundColor: colors.warningLight },
  variableText: { color: colors.primaryDark, fontSize: fontSize.xs, fontWeight: fontWeight.black },
  variableTextWarning: { color: colors.warning },
  rowBody: { flex: 1, minWidth: 0 },
  mappingTitle: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  mappingValue: { marginTop: 3, color: colors.textSecondary, fontSize: fontSize.xs },
  missingValue: { marginTop: 3, color: colors.warning, fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.66 },
  sheetContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  sheetSection: { marginTop: spacing.lg, marginBottom: spacing.sm, color: colors.textMuted, fontSize: 10, fontWeight: fontWeight.black, letterSpacing: 1 },
  attributeList: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  attributeRow: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  attributeIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceOffset },
  attributeIconSelected: { backgroundColor: colors.primary },
  attributeTitle: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  attributeSubtitle: { marginTop: 2, color: colors.textSecondary, fontSize: fontSize.xs },
  flatInput: { backgroundColor: "transparent", paddingHorizontal: 0 },
  helper: { marginTop: 4, color: colors.textMuted, fontSize: fontSize.xs, lineHeight: 17 },
  fixedButton: { alignSelf: "flex-start", marginTop: spacing.md, borderRadius: radius.lg, backgroundColor: colors.primary },
});
