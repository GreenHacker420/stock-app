"use no memo";
import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle, StyleProp } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, fontSize, fontWeight, spacing } from '../../theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
type Size = 'sm' | 'md' | 'lg';

interface Props {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: React.ReactNode | string;
}

export function Button({
  label, onPress, variant = 'primary', size = 'md',
  loading = false, disabled = false, fullWidth = false, style, icon,
}: Props) {
  const isDisabled = disabled || loading;

  const getIconColor = () => {
    if (isDisabled) return '#9ca3af';
    switch (variant) {
      case 'primary':
      case 'danger':
      case 'success':
        return colors.textInverse;
      case 'secondary':
        return colors.primary;
      case 'ghost':
        return colors.textPrimary;
      default:
        return colors.textPrimary;
    }
  };

  const iconColor = getIconColor();

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => StyleSheet.flatten([
        styles.base,
        styles[variant],
        styles[`size_${size}`],
        fullWidth && styles.fullWidth,
        (pressed && !isDisabled) && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ])}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' || variant === 'danger' || variant === 'success' ? colors.textInverse : colors.primary}
        />
      ) : (
        <>
          {icon && (
            typeof icon === 'string' ? (
              <MaterialCommunityIcons name={icon as any} size={18} color={iconColor} />
            ) : (
              icon
            )
          )}
          <Text style={[
            styles.label, 
            styles[`${variant}Label`], 
            styles[`size_${size}Label`],
            isDisabled && styles.disabledLabel
          ]}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, gap: spacing.sm },
  fullWidth:       { width: '100%' },
  pressed:         { opacity: 0.72, transform: [{ scale: 0.975 }] },
  disabled:        { backgroundColor: '#e5e7eb', borderWidth: 1, borderColor: '#d1d5db' },
  disabledLabel:   { color: '#9ca3af' },

  primary:         { backgroundColor: colors.primary },
  secondary:       { backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: '#bfdbfe' },
  danger:          { backgroundColor: colors.danger },
  ghost:           { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  success:         { backgroundColor: colors.success },

  size_sm:         { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, minHeight: 36 },
  size_md:         { paddingVertical: spacing.md + 2, paddingHorizontal: spacing.xl, minHeight: 48 },
  size_lg:         { paddingVertical: spacing.lg, paddingHorizontal: spacing.xxl, minHeight: 56 },

  label:           { fontWeight: fontWeight.bold },
  primaryLabel:    { color: colors.textInverse, fontSize: fontSize.md },
  secondaryLabel:  { color: colors.primary, fontSize: fontSize.md },
  dangerLabel:     { color: colors.textInverse, fontSize: fontSize.md },
  ghostLabel:      { color: colors.textPrimary, fontSize: fontSize.md },
  successLabel:    { color: colors.textInverse, fontSize: fontSize.md },

  size_smLabel:    { fontSize: fontSize.sm },
  size_mdLabel:    { fontSize: fontSize.md },
  size_lgLabel:    { fontSize: fontSize.lg },
});
