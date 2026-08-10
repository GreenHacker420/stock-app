import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { Image } from "expo-image";
import { Directory, File, Paths } from "expo-file-system";
import { Asset, requestPermissionsAsync } from "expo-media-library";
import * as Sharing from "expo-sharing";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ActivityIndicator, Text } from "react-native-paper";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getWaAsset } from "../../../api/whatsapp.api";
import { triggerErrorHaptic, triggerMediumHaptic, triggerSuccessHaptic } from "../../../utils/haptics";

export type WhatsAppViewerImage = {
  assetId?: string;
  url: string;
  fileName?: string;
  mimeType?: string;
  width?: number;
  height?: number;
};

type Props = { image: WhatsAppViewerImage | null; token?: string | null; onClose: () => void };
type MountedProps = { image: WhatsAppViewerImage; token?: string | null; onClose: () => void };
const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

function safeFileName(image: WhatsAppViewerImage) {
  const fallbackExtension = image.mimeType?.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "jpg";
  return (image.fileName || `whatsapp-image.${fallbackExtension}`).replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function clamp(value: number, min: number, max: number) {
  "worklet";
  return Math.min(Math.max(value, min), max);
}

export function WhatsAppImageViewer({ image, token, onClose }: Props) {
  if (!image) return null;
  return <MountedWhatsAppImageViewer image={image} token={token} onClose={onClose} />;
}

function MountedWhatsAppImageViewer({ image, token, onClose }: MountedProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [action, setAction] = useState<"share" | "save" | null>(null);
  const [displayUrl, setDisplayUrl] = useState(image.url);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const viewportHeight = Math.max(1, screenHeight - insets.top - insets.bottom);

  const fittedSize = useMemo(() => {
    const rawWidth = image.width || screenWidth;
    const rawHeight = image.height || viewportHeight;
    const fitScale = Math.min(screenWidth / rawWidth, viewportHeight / rawHeight);
    return { width: Math.max(1, rawWidth * fitScale), height: Math.max(1, rawHeight * fitScale) };
  }, [image.height, image.width, screenWidth, viewportHeight]);

  const resetTransform = useCallback((animated = true) => {
    scale.value = animated ? withSpring(1, { damping: 18, stiffness: 220 }) : 1;
    translateX.value = animated ? withSpring(0) : 0;
    translateY.value = animated ? withSpring(0) : 0;
    savedScale.value = 1;
    savedX.value = 0;
    savedY.value = 0;
  }, [savedScale, savedX, savedY, scale, translateX, translateY]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setAction(null);
    setDisplayUrl(image.url);
    resetTransform(false);
    if (image.assetId && token) {
      void getWaAsset(token, image.assetId)
        .then((asset) => {
          if (!cancelled && asset?.url) setDisplayUrl(asset.url);
        })
        .catch(() => undefined);
    }
    return () => { cancelled = true; };
  }, [image.assetId, image.url, resetTransform, token]);

  const pinch = useMemo(() => Gesture.Pinch()
    .onUpdate((event) => { scale.value = clamp(savedScale.value * event.scale, MIN_SCALE, MAX_SCALE); })
    .onEnd(() => {
      savedScale.value = scale.value;
      const maxX = Math.max(0, (fittedSize.width * scale.value - screenWidth) / 2);
      const maxY = Math.max(0, (fittedSize.height * scale.value - viewportHeight) / 2);
      translateX.value = withSpring(clamp(translateX.value, -maxX, maxX));
      translateY.value = withSpring(clamp(translateY.value, -maxY, maxY));
      savedX.value = clamp(translateX.value, -maxX, maxX);
      savedY.value = clamp(translateY.value, -maxY, maxY);
    }), [fittedSize.height, fittedSize.width, savedScale, savedX, savedY, scale, screenWidth, translateX, translateY, viewportHeight]);

  const pan = useMemo(() => Gesture.Pan()
    .maxPointers(1)
    .onUpdate((event) => {
      if (scale.value <= 1.01) {
        translateY.value = Math.max(0, event.translationY);
        return;
      }
      const maxX = Math.max(0, (fittedSize.width * scale.value - screenWidth) / 2);
      const maxY = Math.max(0, (fittedSize.height * scale.value - viewportHeight) / 2);
      translateX.value = clamp(savedX.value + event.translationX, -maxX, maxX);
      translateY.value = clamp(savedY.value + event.translationY, -maxY, maxY);
    })
    .onEnd((event) => {
      if (scale.value <= 1.01) {
        if (event.translationY > 120 || event.velocityY > 900) scheduleOnRN(onClose);
        else translateY.value = withSpring(0);
        return;
      }
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    }), [fittedSize.height, fittedSize.width, onClose, savedX, savedY, scale, screenWidth, translateX, translateY, viewportHeight]);

  const doubleTap = useMemo(() => Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .onEnd(() => {
      const zoomingIn = scale.value < 1.5;
      const nextScale = zoomingIn ? DOUBLE_TAP_SCALE : 1;
      scale.value = withTiming(nextScale, { duration: 180 });
      savedScale.value = nextScale;
      if (!zoomingIn) {
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedX.value = 0;
        savedY.value = 0;
      }
    }), [savedScale, savedX, savedY, scale, translateX, translateY]);

  const composedGesture = useMemo(() => Gesture.Simultaneous(pinch, pan, doubleTap), [doubleTap, pan, pinch]);
  const imageStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }] }));

  const downloadImage = useCallback(async () => {
    const freshAsset = image.assetId && token ? await getWaAsset(token, image.assetId) : null;
    const url = freshAsset?.url || displayUrl || image.url;
    if (!url) throw new Error("Image download link is unavailable");
    const directory = new Directory(Paths.cache, "whatsapp-image-actions");
    directory.create({ idempotent: true, intermediates: true });
    const localFile = new File(directory, `${image.assetId || "remote"}-${safeFileName(image)}`);
    if (localFile.exists) return localFile;
    return File.downloadFileAsync(url, localFile, { idempotent: true });
  }, [displayUrl, image, token]);

  const shareImage = useCallback(async () => {
    if (action) return;
    setAction("share");
    try {
      if (!await Sharing.isAvailableAsync()) throw new Error("Sharing is unavailable on this device");
      const file = await downloadImage();
      await Sharing.shareAsync(file.uri, { mimeType: image.mimeType || "image/jpeg", dialogTitle: image.fileName || "WhatsApp image" });
    } catch (error) {
      triggerErrorHaptic();
      Alert.alert("Share failed", error instanceof Error ? error.message : "Could not share this image.");
    } finally { setAction(null); }
  }, [action, downloadImage, image.fileName, image.mimeType]);

  const saveImage = useCallback(async () => {
    if (action) return;
    setAction("save");
    try {
      const permission = await requestPermissionsAsync(true);
      if (!permission.granted) throw new Error("Photo permission is required to save this image");
      const file = await downloadImage();
      await Asset.create(file.uri);
      triggerSuccessHaptic();
      Alert.alert("Saved", "The image was saved to your photo library.");
    } catch (error) {
      triggerErrorHaptic();
      Alert.alert("Save failed", error instanceof Error ? error.message : "Could not save this image.");
    } finally { setAction(null); }
  }, [action, downloadImage]);

  return (
    <Modal visible transparent={false} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.container}>
        <GestureDetector gesture={composedGesture}>
          <Animated.View style={[styles.stage, imageStyle]}>
            <Image source={{ uri: displayUrl }} style={fittedSize} contentFit="contain" cachePolicy="memory-disk" recyclingKey={image.assetId || displayUrl} onLoad={() => setLoading(false)} onError={() => { setLoading(false); setFailed(true); }} />
          </Animated.View>
        </GestureDetector>
        {(loading || failed) && (
          <View pointerEvents="none" style={styles.stateOverlay}>
            {loading ? <ActivityIndicator size="large" color="#ffffff" /> : <><MaterialCommunityIcons name="image-off-outline" size={42} color="#ffffff" /><Text style={styles.stateText}>Image could not be loaded</Text></>}
          </View>
        )}
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close image" style={styles.iconButton} onPress={onClose}><MaterialCommunityIcons name="close" size={28} color="#ffffff" /></Pressable>
          <Text numberOfLines={1} style={styles.fileName}>{image.fileName || "Photo"}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Reset zoom" style={styles.iconButton} onPress={() => { triggerMediumHaptic(); resetTransform(); }}><MaterialCommunityIcons name="fit-to-screen-outline" size={24} color="#ffffff" /></Pressable>
        </View>
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 14 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Save image" style={styles.actionButton} disabled={action !== null} onPress={saveImage}>
            {action === "save" ? <ActivityIndicator size={20} color="#ffffff" /> : <MaterialCommunityIcons name="download-outline" size={23} color="#ffffff" />}<Text style={styles.actionText}>Save</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Share image" style={styles.actionButton} disabled={action !== null} onPress={shareImage}>
            {action === "share" ? <ActivityIndicator size={20} color="#ffffff" /> : <MaterialCommunityIcons name="share-variant-outline" size={23} color="#ffffff" />}<Text style={styles.actionText}>Share</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050706", overflow: "hidden" },
  stage: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, minHeight: 72, paddingHorizontal: 12, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(5,7,6,0.72)" },
  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, paddingTop: 12, paddingHorizontal: 24, flexDirection: "row", justifyContent: "center", gap: 20, backgroundColor: "rgba(5,7,6,0.72)" },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)" },
  fileName: { flex: 1, color: "#ffffff", fontSize: 15, fontWeight: "700" },
  actionButton: { minWidth: 108, minHeight: 48, paddingHorizontal: 18, borderRadius: 24, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.14)" },
  actionText: { color: "#ffffff", fontWeight: "700" },
  stateOverlay: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "rgba(5,7,6,0.38)" },
  stateText: { color: "#ffffff" },
});
