import { useEffect } from "react";
import { StyleSheet, View, Platform } from "react-native";
import { Text, Icon } from "react-native-paper";
import { useNetInfo } from "@react-native-community/netinfo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  useReducedMotion,
} from "react-native-reanimated";
import { colors, spacing, radius, fontSize, fontWeight } from "../theme";

export function OfflineBanner() {
  const netInfo = useNetInfo();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const isOffline = netInfo.isConnected === false;

  const translateY = useSharedValue(-100);

  useEffect(() => {
    if (isOffline) {
      translateY.value = reduceMotion
        ? insets.top + spacing.sm
        : withSpring(insets.top + spacing.sm, { damping: 20, stiffness: 180 });
    } else {
      translateY.value = reduceMotion
        ? -100
        : withSpring(-100, { damping: 20, stiffness: 180 });
    }
  }, [isOffline, translateY, insets.top, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (Platform.OS === "web") return null;

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <View style={styles.banner}>
        <Icon source="wifi-off" size={16} color={colors.textInverse} />
        <Text style={styles.text}>No internet connection. Operating offline.</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    alignItems: "center",
    zIndex: 9999,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.danger,
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  text: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textInverse,
  },
});
