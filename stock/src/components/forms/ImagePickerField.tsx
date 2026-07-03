import { StyleSheet, View } from "react-native";

import { CachedThumbnail } from "../ui/CachedThumbnail";
import { Button } from "../ui/Button";
import { colors, radius, spacing } from "../../theme";

type ImagePickerFieldProps = {
  uri?: string | null;
  onCamera?: () => void;
  onLibrary?: () => void;
  uploading?: boolean;
};

export function ImagePickerField({ uri, onCamera, onLibrary, uploading }: ImagePickerFieldProps) {
  return (
    <View style={styles.row}>
      <CachedThumbnail uri={uri} fallbackText="IMG" fallbackIcon="image-plus" color={colors.textMuted} style={styles.preview} />
      <View style={styles.actions}>
        {onCamera ? <Button label="Camera" variant="secondary" icon="camera-outline" onPress={onCamera} disabled={uploading} /> : null}
        {onLibrary ? <Button label="Upload" variant="secondary" icon="image-outline" onPress={onLibrary} disabled={uploading} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
  },
  preview: {
    width: 84,
    height: 84,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actions: {
    flex: 1,
    gap: spacing.sm,
    minWidth: 0,
  },
});
