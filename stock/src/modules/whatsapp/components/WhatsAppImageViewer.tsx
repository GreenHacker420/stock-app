import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Directory, File, Paths } from "expo-file-system";
import { Asset, requestPermissionsAsync } from "expo-media-library";
import * as Sharing from "expo-sharing";
import { StatusBar } from "expo-status-bar";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ActivityIndicator, Text } from "react-native-paper";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getWaAsset } from "../../../api/whatsapp.api";
import {
  triggerErrorHaptic,
  triggerMediumHaptic,
  triggerSuccessHaptic,
} from "../../../utils/haptics";

export type WhatsAppViewerImage = {
  assetId?: string;
  url: string;
  fileName?: string;
  mimeType?: string;
  width?: number;
  height?: number;
};

type Props = {
  image: WhatsAppViewerImage | null;
  token?: string | null;
  onClose: () => void;
};

type MountedProps = {
  image: WhatsAppViewerImage;
  token?: string | null;
  onClose: () => void;
};

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 900;

function safeFileName(image: WhatsAppViewerImage) {
  const fallbackExtension =
    image.mimeType?.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "jpg";
  return (image.fileName || `whatsapp-image.${fallbackExtension}`).replace(
    /[^a-zA-Z0-9._-]+/g,
    "-",
  );
}

function clamp(value: number, min: number, max: number) {
  "worklet";
  return Math.min(Math.max(value, min), max);
}

export function WhatsAppImageViewer({ image, token, onClose }: Props) {
  if (!image) return null;
  return (
    <MountedWhatsAppImageViewer
      image={image}
      token={token}
      onClose={onClose}
    />
  );
}

function MountedWhatsAppImageViewer({ image, token, onClose }: MountedProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [action, setAction] = useState<"share" | "save" | null>(null);
  const [displayUrl, setDisplayUrl] = useState(image.url);
  const [chromeVisible, setChromeVisible] = useState(true);

  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const pinchStartScale = useSharedValue(1);
  const pinchStartX = useSharedValue(0);
  const pinchStartY = useSharedValue(0);
  const pinchFocalX = useSharedValue(0);
  const pinchFocalY = useSharedValue(0);

  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);
  const dismissProgress = useSharedValue(0);

  const fittedSize = useMemo(() => {
    const rawWidth = image.width || screenWidth;
    const rawHeight = image.height || screenHeight;
    const fitScale = Math.min(screenWidth / rawWidth, screenHeight / rawHeight);
    return {
      width: Math.max(1, rawWidth * fitScale),
      height: Math.max(1, rawHeight * fitScale),
    };
  }, [image.height, image.width, screenHeight, screenWidth]);

  const hideChrome = useCallback(() => setChromeVisible(false), []);
  const showChrome = useCallback(() => setChromeVisible(true), []);
  const toggleChrome = useCallback(
    () => setChromeVisible((current) => !current),
    [],
  );

  const resetTransform = useCallback(
    (animated = true) => {
      scale.value = animated
        ? withSpring(1, { damping: 20, stiffness: 240, overshootClamping: true })
        : 1;
      translateX.value = animated
        ? withSpring(0, { damping: 20, stiffness: 240, overshootClamping: true })
        : 0;
      translateY.value = animated
        ? withSpring(0, { damping: 20, stiffness: 240, overshootClamping: true })
        : 0;
      dismissProgress.value = animated ? withTiming(0, { duration: 160 }) : 0;
      pinchStartScale.value = 1;
      pinchStartX.value = 0;
      pinchStartY.value = 0;
      panStartX.value = 0;
      panStartY.value = 0;
    },
    [
      dismissProgress,
      panStartX,
      panStartY,
      pinchStartScale,
      pinchStartX,
      pinchStartY,
      scale,
      translateX,
      translateY,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setAction(null);
    setChromeVisible(true);
    setDisplayUrl(image.url);
    resetTransform(false);

    if (image.assetId && token) {
      void getWaAsset(token, image.assetId)
        .then((asset) => {
          if (!cancelled && asset?.url) setDisplayUrl(asset.url);
        })
        .catch(() => undefined);
    }

    return () => {
      cancelled = true;
    };
  }, [image.assetId, image.url, resetTransform, token]);

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onStart((event) => {
          pinchStartScale.value = scale.value;
          pinchStartX.value = translateX.value;
          pinchStartY.value = translateY.value;
          pinchFocalX.value = event.focalX - screenWidth / 2;
          pinchFocalY.value = event.focalY - screenHeight / 2;
          dismissProgress.value = 0;
          scheduleOnRN(hideChrome);
        })
        .onUpdate((event) => {
          const nextScale = clamp(
            pinchStartScale.value * event.scale,
            MIN_SCALE,
            MAX_SCALE,
          );
          const ratio = nextScale / Math.max(pinchStartScale.value, MIN_SCALE);

          // Keep the content point beneath the user's fingers stationary while
          // scaling. This is the difference between center-only zoom and a
          // native photo-viewer pinch interaction.
          translateX.value =
            pinchFocalX.value -
            (pinchFocalX.value - pinchStartX.value) * ratio;
          translateY.value =
            pinchFocalY.value -
            (pinchFocalY.value - pinchStartY.value) * ratio;
          scale.value = nextScale;
        })
        .onEnd(() => {
          if (scale.value <= 1.01) {
            scale.value = withSpring(1, {
              damping: 20,
              stiffness: 240,
              overshootClamping: true,
            });
            translateX.value = withSpring(0, {
              damping: 20,
              stiffness: 240,
              overshootClamping: true,
            });
            translateY.value = withSpring(0, {
              damping: 20,
              stiffness: 240,
              overshootClamping: true,
            });
            return;
          }

          const maxX = Math.max(
            0,
            (fittedSize.width * scale.value - screenWidth) / 2,
          );
          const maxY = Math.max(
            0,
            (fittedSize.height * scale.value - screenHeight) / 2,
          );
          translateX.value = withSpring(
            clamp(translateX.value, -maxX, maxX),
            { damping: 20, stiffness: 240, overshootClamping: true },
          );
          translateY.value = withSpring(
            clamp(translateY.value, -maxY, maxY),
            { damping: 20, stiffness: 240, overshootClamping: true },
          );
        }),
    [
      dismissProgress,
      fittedSize.height,
      fittedSize.width,
      hideChrome,
      pinchFocalX,
      pinchFocalY,
      pinchStartScale,
      pinchStartX,
      pinchStartY,
      scale,
      screenHeight,
      screenWidth,
      translateX,
      translateY,
    ],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .maxPointers(1)
        .averageTouches(true)
        .onStart(() => {
          panStartX.value = translateX.value;
          panStartY.value = translateY.value;
          if (scale.value > 1.01) scheduleOnRN(hideChrome);
        })
        .onUpdate((event) => {
          if (scale.value <= 1.01) {
            // At 1×, behave like a native gallery: follow a downward drag and
            // subtly allow horizontal movement while revealing the chat below.
            translateX.value = event.translationX * 0.16;
            translateY.value =
              event.translationY >= 0
                ? event.translationY
                : event.translationY * 0.16;
            dismissProgress.value = clamp(
              Math.max(0, event.translationY) / Math.max(screenHeight * 0.45, 1),
              0,
              1,
            );
            return;
          }

          const maxX = Math.max(
            0,
            (fittedSize.width * scale.value - screenWidth) / 2,
          );
          const maxY = Math.max(
            0,
            (fittedSize.height * scale.value - screenHeight) / 2,
          );
          translateX.value = clamp(
            panStartX.value + event.translationX,
            -maxX,
            maxX,
          );
          translateY.value = clamp(
            panStartY.value + event.translationY,
            -maxY,
            maxY,
          );
        })
        .onEnd((event) => {
          if (scale.value <= 1.01) {
            const shouldDismiss =
              event.translationY > DISMISS_DISTANCE ||
              event.velocityY > DISMISS_VELOCITY;

            if (shouldDismiss) {
              translateY.value = withTiming(
                screenHeight,
                { duration: 170 },
                (finished) => {
                  if (finished) scheduleOnRN(onClose);
                },
              );
              dismissProgress.value = withTiming(1, { duration: 170 });
              return;
            }

            translateX.value = withSpring(0, {
              damping: 20,
              stiffness: 250,
              overshootClamping: true,
            });
            translateY.value = withSpring(0, {
              damping: 20,
              stiffness: 250,
              overshootClamping: true,
            });
            dismissProgress.value = withTiming(0, { duration: 150 });
            return;
          }

          // Preserve release velocity while zoomed instead of stopping the
          // image abruptly. The clamp keeps inertial motion inside real image
          // bounds and the light rubber-band effect gives it native friction.
          const maxX = Math.max(
            0,
            (fittedSize.width * scale.value - screenWidth) / 2,
          );
          const maxY = Math.max(
            0,
            (fittedSize.height * scale.value - screenHeight) / 2,
          );
          translateX.value = withDecay({
            velocity: event.velocityX,
            deceleration: 0.995,
            clamp: [-maxX, maxX],
            rubberBandEffect: true,
            rubberBandFactor: 0.16,
          });
          translateY.value = withDecay({
            velocity: event.velocityY,
            deceleration: 0.995,
            clamp: [-maxY, maxY],
            rubberBandEffect: true,
            rubberBandFactor: 0.16,
          });
        }),
    [
      dismissProgress,
      fittedSize.height,
      fittedSize.width,
      hideChrome,
      onClose,
      panStartX,
      panStartY,
      scale,
      screenHeight,
      screenWidth,
      translateX,
      translateY,
    ],
  );

  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .maxDuration(250)
        .onEnd((event, success) => {
          if (!success) return;

          const zoomingIn = scale.value < 1.5;
          if (!zoomingIn) {
            scale.value = withTiming(1, { duration: 190 });
            translateX.value = withTiming(0, { duration: 190 });
            translateY.value = withTiming(0, { duration: 190 });
            dismissProgress.value = withTiming(0, { duration: 190 });
            scheduleOnRN(showChrome);
            return;
          }

          const nextScale = DOUBLE_TAP_SCALE;
          const focalX = event.x - screenWidth / 2;
          const focalY = event.y - screenHeight / 2;
          const ratio = nextScale / Math.max(scale.value, MIN_SCALE);
          const maxX = Math.max(
            0,
            (fittedSize.width * nextScale - screenWidth) / 2,
          );
          const maxY = Math.max(
            0,
            (fittedSize.height * nextScale - screenHeight) / 2,
          );
          const nextX = clamp(
            focalX - (focalX - translateX.value) * ratio,
            -maxX,
            maxX,
          );
          const nextY = clamp(
            focalY - (focalY - translateY.value) * ratio,
            -maxY,
            maxY,
          );

          scale.value = withTiming(nextScale, { duration: 190 });
          translateX.value = withTiming(nextX, { duration: 190 });
          translateY.value = withTiming(nextY, { duration: 190 });
          scheduleOnRN(hideChrome);
        }),
    [
      dismissProgress,
      fittedSize.height,
      fittedSize.width,
      hideChrome,
      scale,
      screenHeight,
      screenWidth,
      showChrome,
      translateX,
      translateY,
    ],
  );

  const singleTap = useMemo(
    () =>
      Gesture.Tap().onEnd((_event, success) => {
        if (success) scheduleOnRN(toggleChrome);
      }),
    [toggleChrome],
  );

  const tapGesture = useMemo(
    () => Gesture.Exclusive(doubleTap, singleTap),
    [doubleTap, singleTap],
  );

  const composedGesture = useMemo(
    () => Gesture.Simultaneous(pinch, pan, tapGesture),
    [pan, pinch, tapGesture],
  );

  const imageStyle = useAnimatedStyle(() => {
    const dismissScale = 1 - dismissProgress.value * 0.07;
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value * dismissScale },
      ],
    };
  });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: 1 - dismissProgress.value * 0.7,
  }));

  const downloadImage = useCallback(async () => {
    const freshAsset =
      image.assetId && token ? await getWaAsset(token, image.assetId) : null;
    const url = freshAsset?.url || displayUrl || image.url;
    if (!url) throw new Error("Image download link is unavailable");

    const directory = new Directory(Paths.cache, "whatsapp-image-actions");
    directory.create({ idempotent: true, intermediates: true });
    const localFile = new File(
      directory,
      `${image.assetId || "remote"}-${safeFileName(image)}`,
    );
    if (localFile.exists) return localFile;
    return File.downloadFileAsync(url, localFile, { idempotent: true });
  }, [displayUrl, image, token]);

  const shareImage = useCallback(async () => {
    if (action) return;
    setAction("share");
    try {
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error("Sharing is unavailable on this device");
      }
      const file = await downloadImage();
      await Sharing.shareAsync(file.uri, {
        mimeType: image.mimeType || "image/jpeg",
        dialogTitle: image.fileName || "WhatsApp image",
      });
    } catch (error) {
      triggerErrorHaptic();
      Alert.alert(
        "Share failed",
        error instanceof Error ? error.message : "Could not share this image.",
      );
    } finally {
      setAction(null);
    }
  }, [action, downloadImage, image.fileName, image.mimeType]);

  const saveImage = useCallback(async () => {
    if (action) return;
    setAction("save");
    try {
      const permission = await requestPermissionsAsync(true);
      if (!permission.granted) {
        throw new Error("Photo permission is required to save this image");
      }
      const file = await downloadImage();
      await Asset.create(file.uri);
      triggerSuccessHaptic();
      Alert.alert("Saved", "The image was saved to your photo library.");
    } catch (error) {
      triggerErrorHaptic();
      Alert.alert(
        "Save failed",
        error instanceof Error ? error.message : "Could not save this image.",
      );
    } finally {
      setAction(null);
    }
  }, [action, downloadImage]);

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.root}>
        <StatusBar style="light" />
        <View style={styles.container}>
          <Animated.View
            pointerEvents="none"
            style={[styles.backdrop, backdropStyle]}
          />

          <GestureDetector gesture={composedGesture}>
            <View style={styles.gestureSurface}>
              <Animated.View style={[fittedSize, imageStyle]}>
                <Image
                  source={{ uri: displayUrl }}
                  style={styles.image}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  recyclingKey={image.assetId || displayUrl}
                  transition={80}
                  onLoad={() => setLoading(false)}
                  onError={() => {
                    setLoading(false);
                    setFailed(true);
                  }}
                />
              </Animated.View>
            </View>
          </GestureDetector>

          {(loading || failed) && (
            <View pointerEvents="none" style={styles.stateOverlay}>
              {loading ? (
                <ActivityIndicator size="large" color="#ffffff" />
              ) : (
                <>
                  <MaterialCommunityIcons
                    name="image-off-outline"
                    size={42}
                    color="#ffffff"
                  />
                  <Text style={styles.stateText}>Image could not be loaded</Text>
                </>
              )}
            </View>
          )}

          {chromeVisible && (
            <>
              <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close image"
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.iconButton,
                    pressed && styles.controlPressed,
                  ]}
                  onPress={onClose}
                >
                  <MaterialCommunityIcons
                    name="arrow-left"
                    size={27}
                    color="#ffffff"
                  />
                </Pressable>
                <Text numberOfLines={1} style={styles.fileName}>
                  {image.fileName || "Photo"}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Reset zoom"
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.iconButton,
                    pressed && styles.controlPressed,
                  ]}
                  onPress={() => {
                    triggerMediumHaptic();
                    resetTransform();
                  }}
                >
                  <MaterialCommunityIcons
                    name="fit-to-screen-outline"
                    size={23}
                    color="#ffffff"
                  />
                </Pressable>
              </View>

              <View
                style={[
                  styles.bottomBar,
                  { paddingBottom: insets.bottom + 14 },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Save image"
                  disabled={action !== null}
                  style={({ pressed }) => [
                    styles.actionButton,
                    pressed && styles.controlPressed,
                    action !== null && styles.controlDisabled,
                  ]}
                  onPress={saveImage}
                >
                  {action === "save" ? (
                    <ActivityIndicator size={20} color="#ffffff" />
                  ) : (
                    <MaterialCommunityIcons
                      name="download-outline"
                      size={23}
                      color="#ffffff"
                    />
                  )}
                  <Text style={styles.actionText}>Save</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Share image"
                  disabled={action !== null}
                  style={({ pressed }) => [
                    styles.actionButton,
                    pressed && styles.controlPressed,
                    action !== null && styles.controlDisabled,
                  ]}
                  onPress={shareImage}
                >
                  {action === "share" ? (
                    <ActivityIndicator size={20} color="#ffffff" />
                  ) : (
                    <MaterialCommunityIcons
                      name="share-variant-outline"
                      size={23}
                      color="#ffffff"
                    />
                  )}
                  <Text style={styles.actionText}>Share</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "transparent",
  },
  container: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "transparent",
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#050706",
  },
  gestureSurface: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    ...StyleSheet.absoluteFill,
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    minHeight: 72,
    paddingHorizontal: 10,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(5,7,6,0.58)",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 12,
    paddingHorizontal: 24,
    flexDirection: "row",
    justifyContent: "center",
    gap: 18,
    backgroundColor: "rgba(5,7,6,0.58)",
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  fileName: {
    flex: 1,
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  actionButton: {
    minWidth: 108,
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  actionText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  controlPressed: {
    opacity: 0.62,
  },
  controlDisabled: {
    opacity: 0.55,
  },
  stateOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "rgba(5,7,6,0.38)",
  },
  stateText: {
    color: "#ffffff",
  },
});
