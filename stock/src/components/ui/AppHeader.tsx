import React, { useMemo } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Avatar, Badge } from "@rneui/themed";
import { Text, Icon } from "react-native-paper";
import { NavigationContext } from "@react-navigation/native";

import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  role?: "OWNER" | "STAFF";
  initials?: string;
  showBack?: boolean;
};

export function AppHeader({ title, subtitle, role, initials, showBack }: AppHeaderProps) {
  const user = useAuthStore((state) => state.user);
  const { activeShopId } = useShopStore();
  const navigation = React.useContext(NavigationContext);

  const canGoBack = showBack ?? (navigation ? navigation.canGoBack() : false);

  const displayInitials = useMemo(() => {
    if (initials) return initials;
    if (user?.name) {
      return user.name
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
    }
    return "SC";
  }, [initials, user?.name]);

  const displayRole = role ?? user?.role;

  return (
    <View style={styles.headerContainer}>
      <View style={styles.leftSection}>
        {canGoBack && (
          <Pressable 
            onPress={() => navigation?.goBack()}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.pressed
            ]}
          >
            <Icon source="arrow-left" size={24} color={colors.textPrimary} />
          </Pressable>
        )}
        <View style={styles.titleContainer}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.rightSection}>
        <View style={styles.avatarContainer}>
          <Avatar
            rounded
            title={displayInitials}
            containerStyle={styles.avatar}
            titleStyle={styles.avatarText}
          />
        </View>
        {displayRole && (
          <View style={[
            styles.roleBadge,
            { backgroundColor: displayRole === 'OWNER' ? colors.primaryLight : colors.surfaceOffset }
          ]}>
            <Text style={[
              styles.roleText,
              { color: displayRole === 'OWNER' ? colors.primaryDark : colors.textSecondary }
            ]}>
              {displayRole}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.bg,
  },
  leftSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  backButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -spacing.sm,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    color: colors.primary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  rightSection: {
    alignItems: 'flex-end',
    gap: 4,
  },
  avatarContainer: {
    ...shadow.sm,
  },
  avatar: {
    backgroundColor: colors.primary,
    width: 40,
    height: 40,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    color: colors.textInverse,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  roleText: {
    fontSize: 9,
    fontWeight: fontWeight.black,
    letterSpacing: 0.5,
  },
  pressed: {
    opacity: 0.7,
  }
});
