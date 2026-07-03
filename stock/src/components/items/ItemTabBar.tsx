import { StyleSheet } from "react-native";

import { AppSegmentedControl } from "../ui/AppSegmentedControl";
import { spacing } from "../../theme";
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
    <AppSegmentedControl
      options={tabs.map((tab) => ({ value: tab.id, label: tab.label, icon: tab.icon }))}
      value={activeTab}
      onChange={(tab) => {
        triggerLightHaptic();
        onChange(tab);
      }}
      style={styles.row}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    marginHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
});
