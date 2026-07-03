import { StyleSheet, Pressable, View } from "react-native";
import { Text, Icon } from "react-native-paper";

import { colors, spacing, radius, fontSize, fontWeight } from "../../theme";
import { triggerLightHaptic } from "../../utils/haptics";

export type ItemDetailTabId = "overview" | "stock" | "pricing" | "history";

export type ItemDetailTab = {
  id: ItemDetailTabId;
  label: string;
  icon: string;
};

type ItemTabBarProps = {
  tabs: readonly ItemDetailTab[];
  activeTab: ItemDetailTabId;
  onChange: (tab: ItemDetailTabId) => void;
};

export function ItemTabBar({ tabs, activeTab, onChange }: ItemTabBarProps) {
  return (
    <View style={styles.row}>
      {tabs.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <Pressable
            key={tab.id}
            onPress={() => {
              triggerLightHaptic();
              onChange(tab.id);
            }}
            style={({ pressed }) => [styles.tab, active && styles.tabActive, pressed && styles.pressed]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Icon source={tab.icon} size={15} color={active ? colors.primary : colors.textMuted} />
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    marginHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  label: {
    fontSize: 10,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
  },
  labelActive: {
    color: colors.primary,
    fontWeight: fontWeight.black,
  },
  pressed: {
    opacity: 0.72,
  },
});
