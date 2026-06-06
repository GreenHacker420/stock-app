import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Icon } from 'react-native-paper';
import { colors, fontSize, fontWeight, spacing } from '../../theme';

interface Props {
  icon?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon = 'package-variant-closed', title, subtitle, action }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Icon source={icon} size={48} color={colors.textMuted} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {action ? <View style={styles.actionContainer}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.huge, minHeight: 300 },
  iconContainer:   { marginBottom: spacing.lg, opacity: 0.8 },
  title:           { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.textPrimary, textAlign: 'center' },
  subtitle:        { fontSize: fontSize.md, color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center', lineHeight: 22, maxWidth: 280 },
  actionContainer: { marginTop: spacing.xl },
});
