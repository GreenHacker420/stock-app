import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, Pressable, Platform } from "react-native";
import { Portal, Text, Icon } from "react-native-paper";
import { colors, spacing, radius, fontSize, fontWeight, shadow } from "../../theme";
import { triggerErrorHaptic, triggerSuccessHaptic, triggerWarningHaptic } from "../../utils/haptics";

export interface NotificationToastProps {
  visible: boolean;
  title: string;
  message: string;
  type?: string;
  onDismiss: () => void;
  duration?: number;
}

export function NotificationToast({
  visible,
  title,
  message,
  type = "info",
  onDismiss,
  duration = 4000,
}: NotificationToastProps) {
  const slideAnim = useRef(new Animated.Value(-120)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      if (type === "success" || type === "payment" || type === "sale") triggerSuccessHaptic();
      if (type === "warning" || type === "low_stock" || type === "rate_approval") triggerWarningHaptic();
      if (type === "danger" || type === "error" || type === "shortage") triggerErrorHaptic();

      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: Platform.OS === 'ios' ? 60 : 30,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }),
      ]).start();

      const timer = setTimeout(() => {
        handleDismiss();
      }, duration);

      return () => clearTimeout(timer);
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -120,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, type]);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -120,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
    });
  };

  let iconName = "bell-outline";
  let toneColor: string = colors.info;
  let toneLight: string = colors.infoLight;

  if (type === "success" || type === "payment" || type === "sale") {
    iconName = "check-circle-outline";
    toneColor = colors.success;
    toneLight = colors.successLight;
  } else if (type === "warning" || type === "low_stock" || type === "rate_approval") {
    iconName = "alert-circle-outline";
    toneColor = colors.warning;
    toneLight = colors.warningLight;
  } else if (type === "danger" || type === "error" || type === "shortage") {
    iconName = "alert-octagon-outline";
    toneColor = colors.danger;
    toneLight = colors.dangerLight;
  }

  return (
    <Portal>
      <Animated.View
        style={[
          styles.container,
          {
            transform: [{ translateY: slideAnim }],
            opacity: opacityAnim,
          },
        ]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={handleDismiss}
          style={styles.toastCard}
          accessibilityRole="button"
          accessibilityLabel={`${title}. ${message}`}
        >
          <View style={[styles.iconWrapper, { backgroundColor: toneLight }]}>
            <Icon source={iconName} size={20} color={toneColor} />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.titleText} numberOfLines={1}>{title}</Text>
            <Text style={styles.messageText} numberOfLines={2}>{message}</Text>
          </View>
          <Pressable
            onPress={handleDismiss}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Dismiss notification"
            hitSlop={8}
          >
            <Icon source="close" size={16} color={colors.textMuted} />
          </Pressable>
        </Pressable>
      </Animated.View>
    </Portal>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 99999,
    alignItems: "center",
  },
  toastCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    width: "100%",
    maxWidth: 500,
    ...shadow.lg,
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  textContainer: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  titleText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  messageText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 14,
  },
  closeButton: {
    padding: spacing.xs,
  },
});
