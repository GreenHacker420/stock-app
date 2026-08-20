import { StyleSheet, View, StyleProp, ViewStyle } from "react-native";
import { Image } from "expo-image";
import { Icon, Text } from "react-native-paper";

import { fontSize, fontWeight } from "../../theme";

type CachedThumbnailProps = {
  uri?: string | null;
  fallbackText: string;
  fallbackIcon?: string;
  color: string;
  style?: StyleProp<ViewStyle>;
};

export function CachedThumbnail({ uri, fallbackText, fallbackIcon, color, style }: CachedThumbnailProps) {
  return (
    <View style={[styles.container, { backgroundColor: color + "22" }, style]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={120}
          recyclingKey={uri}
        />
      ) : fallbackIcon ? (
        <Icon source={fallbackIcon} size={28} color={color} />
      ) : (
        <Text style={[styles.fallback, { color }]} numberOfLines={1}>
          {fallbackText}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  fallback: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.black,
  },
});
