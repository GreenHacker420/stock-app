import { useEffect, useState } from "react";
import { StyleSheet, View, StyleProp, ViewStyle } from "react-native";
import { Image } from "expo-image";
import { Icon, Text } from "react-native-paper";

import { fontSize, fontWeight } from "../../theme";
import { API_BASE_URL } from "../../api/client";
import { useAuthStore } from "../../auth/auth-store";

type CachedThumbnailProps = {
  uri?: string | null;
  fallbackText: string;
  fallbackIcon?: string;
  color: string;
  style?: StyleProp<ViewStyle>;
  onError?: () => void;
};

export function CachedThumbnail({ uri, fallbackText, fallbackIcon, color, style, onError }: CachedThumbnailProps) {
  const token = useAuthStore((state) => state.token);
  const [failed, setFailed] = useState(false);
  const resolvedUri = uri
    ? uri.startsWith("http://") || uri.startsWith("https://") || uri.startsWith("file://") || uri.startsWith("data:")
      ? uri
      : `${API_BASE_URL.replace(/\/+$/, "")}${uri.startsWith("/") ? "" : "/"}${uri}`
    : null;

  useEffect(() => setFailed(false), [resolvedUri]);

  return (
    <View style={[styles.container, { backgroundColor: color + "22" }, style]}>
      {resolvedUri && !failed ? (
        <Image
          source={{
            uri: resolvedUri,
            headers: token && resolvedUri.startsWith(API_BASE_URL) && resolvedUri.includes("/thumbnail?")
              ? { Authorization: `Bearer ${token}` }
              : undefined,
          }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={120}
          recyclingKey={resolvedUri}
          onError={() => {
            setFailed(true);
            onError?.();
          }}
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
