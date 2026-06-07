import React, { useMemo, useState } from "react";
import { View, StyleSheet, Pressable, Modal, ScrollView, TouchableWithoutFeedback } from "react-native";
import { Avatar } from "@rneui/themed";
import { Text, Icon } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";

import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { useShopsQuery } from "../../hooks/useShops";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  role?: "OWNER" | "STAFF";
  initials?: string;
  showBack?: boolean;
  hideAvatar?: boolean;
};

export function AppHeader({ title, subtitle, role, initials, showBack, hideAvatar }: AppHeaderProps) {
  const user = useAuthStore((state) => state.user);
  const { activeShopId, setActiveShopId } = useShopStore();
  const navigation = useNavigation();
  const shopsQuery = useShopsQuery();
  const [modalVisible, setModalVisible] = useState(false);

  const selectedShop = useMemo(() => 
    shopsQuery.data?.find(s => s.id === activeShopId), 
    [shopsQuery.data, activeShopId]
  );

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
            onPress={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
              }
            }}
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
          {activeShopId && shopsQuery.data && shopsQuery.data.length > 0 ? (
            <Pressable
              onPress={() => setModalVisible(true)}
              style={({ pressed }) => [
                styles.shopSelectorPill,
                pressed && styles.pressed
              ]}
            >
              <Icon source="storefront-outline" size={14} color={colors.primary} />
              <Text style={styles.shopSelectorText} numberOfLines={1}>
                {selectedShop ? selectedShop.name : "Select Shop"}
              </Text>
              <Icon source="chevron-down" size={14} color={colors.primary} />
            </Pressable>
          ) : subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      {!hideAvatar && (
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
      )}

      {/* Switch Shop Modal */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalContainer}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Switch Shop</Text>
                  <Pressable 
                    onPress={() => setModalVisible(false)} 
                    style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
                  >
                    <Icon source="close" size={22} color={colors.textSecondary} />
                  </Pressable>
                </View>
                <ScrollView contentContainerStyle={styles.shopList} showsVerticalScrollIndicator={false}>
                  {shopsQuery.data?.map((shop) => {
                    const isSelected = shop.id === activeShopId;
                    return (
                      <Pressable
                        key={shop.id}
                        onPress={() => {
                          setActiveShopId(shop.id);
                          setModalVisible(false);
                        }}
                        style={({ pressed }) => [
                          styles.shopRow,
                          isSelected && styles.shopRowSelected,
                          pressed && styles.pressed
                        ]}
                      >
                        <View style={styles.shopRowLeft}>
                          <Text style={[styles.shopRowName, isSelected && styles.shopRowNameSelected]}>
                            {shop.name}
                          </Text>
                          <Text style={styles.shopRowDetails}>
                            {shop.city} • Code: {shop.code}
                          </Text>
                        </View>
                        {isSelected && (
                          <Icon source="check-circle" size={20} color={colors.primary} />
                        )}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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
  },
  shopSelectorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.md,
    gap: 6,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  shopSelectorText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.primaryDark,
    maxWidth: 160,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing.xl,
    maxHeight: '70%',
    ...shadow.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.black,
    color: colors.textPrimary,
  },
  closeButton: {
    padding: 4,
  },
  shopList: {
    gap: spacing.sm,
  },
  shopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  shopRowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  shopRowLeft: {
    flex: 1,
    gap: 2,
    marginRight: spacing.sm,
  },
  shopRowName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  shopRowNameSelected: {
    color: colors.primaryDark,
  },
  shopRowDetails: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
});
