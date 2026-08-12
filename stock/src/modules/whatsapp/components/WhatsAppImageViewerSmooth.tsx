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
  cancelAnimation,
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
import { getWhatsAppImageGalleryForMessage } from "../services/whatsapp-image-gallery";

export type WhatsAppViewerImage = {
  messageId?: string;
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

type GalleryPageProps = {
  image: WhatsAppViewerImage;
  pageIndex: number;
  anchorIndex: number;
  screenWidth: number;
  screenHeight: number;
  isCurrent: boolean;
  currentImageStyle: ReturnType<typeof useAnimatedStyle>;
  onAssetError: (image: WhatsAppViewerImage) => Promise<boolean>;
};

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 900;
const PAGE_VELOCITY = 700;
const PAGE_AXIS_SLOP = 7;

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

function imageIdentity(image: WhatsAppViewerImage) {
  return image.messageId || image.assetId || image.url;
}

function sameImage(left: WhatsAppViewerImage, right: WhatsAppViewerImage) {
  return imageIdentity(left) === imageIdentity(right);
}

function toViewerImage(
  message: Awaited<ReturnType<typeof getWhatsAppImageGalleryForMessage>>[number],
): WhatsAppViewerImage | null {
  const url = message.asset?.url;
  if (!url) return null;
  return {
    messageId: message.id,
    assetId: message.asset?.id,
    url,
    fileName: message.asset?.fileName,
    mimeType: message.asset?.mimeType,
    width: message.asset?.width,
    height: message.asset?.height,
  };
}

function fitImage(
  image: WhatsAppViewerImage,
  screenWidth: number,
  screenHeight: number,
) {
  const rawWidth = image.width || screenWidth;
  const rawHeight = image.height || screenHeight;
  const fitScale = Math.min(screenWidth / rawWidth, screenHeight / rawHeight);
  return {
    width: Math.max(1, rawWidth * fitScale),
    height: Math.max(1, rawHeight * fitScale),
  };
}

function GalleryPage({
  image,
  pageIndex,
  anchorIndex,
  screenWidth,
  screenHeight,
  isCurrent,
  currentImageStyle,
  onAssetError,
}: GalleryPageProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const size = useMemo(
    () => fitImage(image, screenWidth, screenHeight),
    [image.height, image.width, screenHeight, screenWidth],
  );

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [image.url]);

  const handleError = useCallback(() => {
    void onAssetError(image).then((recovered) => {
      if (!recovered) {
        setLoaded(false);
        setFailed(true);
      }
    });
  }, [image, onAssetError]);

  return (
    <View
      pointerEvents="none"
      style={[
        styles.galleryPage,
        {
          left: (pageIndex - anchorIndex) * screenWidth,
          width: screenWidth,
          height: screenHeight,
        },
      ]}
    >
      <Animated.View style={[size, isCurrent ? currentImageStyle : undefined]}>
        <Image
          source={{
            uri: image.url,
            cacheKey: image.assetId
              ? `wa-asset:${image.assetId}`
              : image.messageId
                ? `wa-message:${image.messageId}`
                : image.url,
          }}
          style={styles.image}
          contentFit="contain"
          cachePolicy="memory-disk"
          priority={isCurrent ? "high" : "normal"}
          transition={0}
          onLoad={() => {
            setLoaded(true);
            setFailed(false);
          }}
          onError={handleError}
        />
      </Animated.View>

      {isCurrent && !loaded && !failed ? (
        <View pointerEvents="none" style={styles.pageState}>
          <ActivityIndicator size="large" color="#ffffff" />
        </View>
      ) : null}
      {isCurrent && failed ? (
        <View pointerEvents="none" style={styles.pageState}>
          <MaterialCommunityIcons
            name="image-off-outline"
            size={42}
            color="#ffffff"
          />
          <Text style={styles.stateText}>Image could not be loaded</Text>
        </View>
      ) : null}
    </View>
  );
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

function MountedWhatsAppImageViewer({ image, token, onClose }: Required<Pick<Props, "image" | "onClose">> & Pick<Props, "token">) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [gallery, setGallery] = useState<WhatsAppViewerImage[]>([image]);
  const [anchorIndex, setAnchorIndex] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [action, setAction] = useState<"share" | "save" | null>(null);
  const [chromeVisible, setChromeVisible] = useState(true);

  const current = gallery[currentIndex] || image;
  const previous = currentIndex > 0 ? gallery[currentIndex - 1] : null;
  const next = currentIndex + 1 < gallery.length ? gallery[currentIndex + 1] : null;
  const canPrevious = Boolean(previous);
  const canNext = Boolean(next);

  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const trackX = useSharedValue(0);
  const dismissProgress = useSharedValue(0);

  const pinchStartScale = useSharedValue(1);
  const pinchStartX = useSharedValue(0);
  const pinchStartY = useSharedValue(0);
  const pinchFocalX = useSharedValue(0);
  const pinchFocalY = useSharedValue(0);

  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);
  const panAxis = useSharedValue(0); // 0 undecided, 1 page, 2 dismiss

  const fittedSize = useMemo(
    () => fitImage(current, screenWidth, screenHeight),
    [current.height, current.width, screenHeight, screenWidth],
  );

  const baseTrackX = useMemo(
    () => -(currentIndex - anchorIndex) * screenWidth,
    [anchorIndex, currentIndex, screenWidth],
  );

  const hideChrome = useCallback(() => setChromeVisible(false), []);
  const showChrome = useCallback(() => setChromeVisible(true), []);
  const toggleChrome = useCallback(
    () => setChromeVisible((value) => !value),
    [],
  );

  const resetZoom = useCallback(
    (animated = false) => {
      cancelAnimation(scale);
      cancelAnimation(translateX);
      cancelAnimation(translateY);
      scale.value = animated
        ? withSpring(1, { damping: 20, stiffness: 240, overshootClamping: true })
        : 1;
      translateX.value = animated ? withSpring(0) : 0;
      translateY.value = animated ? withSpring(0) : 0;
      dismissProgress.value = animated ? withTiming(0, { duration: 150 }) : 0;
      pinchStartScale.value = 1;
      pinchStartX.value = 0;
      pinchStartY.value = 0;
      panStartX.value = 0;
      panStartY.value = 0;
      panAxis.value = 0;
    },
    [
      dismissProgress,
      panAxis,
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
    setGallery([image]);
    setAnchorIndex(0);
    setCurrentIndex(0);
    trackX.value = 0;
    resetZoom(false);

    if (!image.messageId) {
      return () => {
        cancelled = true;
      };
    }

    void getWhatsAppImageGalleryForMessage(image.messageId)
      .then((messages) => {
        if (cancelled) return;
        const resolved = messages
          .map(toViewerImage)
          .filter((item): item is WhatsAppViewerImage => Boolean(item));
        const tappedIndex = resolved.findIndex((item) => sameImage(item, image));
        if (tappedIndex < 0 || resolved.length <= 1) return;

        // The tapped image remains at virtual position 0, so expanding the
        // gallery never visually moves or remounts the image already on screen.
        setGallery(resolved);
        setAnchorIndex(tappedIndex);
        setCurrentIndex(tappedIndex);
        trackX.value = 0;
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [image, resetZoom, trackX]);

  useEffect(() => {
    trackX.value = baseTrackX;
  }, [baseTrackX, trackX]);

  useEffect(() => {
    const urls = [
      gallery[currentIndex - 2]?.url,
      gallery[currentIndex + 2]?.url,
    ].filter((url): url is string => Boolean(url));
    if (urls.length > 0) {
      void Image.prefetch(urls, "memory-disk").catch(() => undefined);
    }
  }, [currentIndex, gallery]);

  const refreshFailedAsset = useCallback(
    async (failedImage: WhatsAppViewerImage) => {
      if (!failedImage.assetId || !token) return false;
      try {
        const asset = await getWaAsset(token, failedImage.assetId);
        if (!asset?.url || asset.url === failedImage.url) return false;
        setGallery((items) =>
          items.map((item) =>
            sameImage(item, failedImage) ? { ...item, url: asset.url } : item,
          ),
        );
        return true;
      } catch {
        return false;
      }
    },
    [token],
  );

  const commitPage = useCallback(
    (nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= gallery.length) return;
      resetZoom(false);
      setCurrentIndex(nextIndex);
    },
    [gallery.length, resetZoom],
  );

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onStart((event) => {
          cancelAnimation(trackX);
          cancelAnimation(translateX);
          cancelAnimation(translateY);
          pinchStartScale.value = scale.value;
          pinchStartX.value = translateX.value;
          pinchStartY.value = translateY.value;
          pinchFocalX.value = event.focalX - screenWidth / 2;
          pinchFocalY.value = event.focalY - screenHeight / 2;
          trackX.value = baseTrackX;
          dismissProgress.value = 0;
          panAxis.value = 0;
          scheduleOnRN(hideChrome);
        })
        .onUpdate((event) => {
          const nextScale = clamp(
            pinchStartScale.value * event.scale,
            MIN_SCALE,
            MAX_SCALE,
          );
          const ratio = nextScale / Math.max(pinchStartScale.value, MIN_SCALE);
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
            translateX.value = withSpring(0);
            translateY.value = withSpring(0);
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
      baseTrackX,
      dismissProgress,
      fittedSize.height,
      fittedSize.width,
      hideChrome,
      panAxis,
      pinchFocalX,
      pinchFocalY,
      pinchStartScale,
      pinchStartX,
      pinchStartY,
      scale,
      screenHeight,
      screenWidth,
      trackX,
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
          cancelAnimation(trackX);
          cancelAnimation(translateX);
          cancelAnimation(translateY);
          panStartX.value = translateX.value;
          panStartY.value = translateY.value;
          panAxis.value = 0;
          if (scale.value > 1.01) scheduleOnRN(hideChrome);
        })
        .onUpdate((event) => {
          if (scale.value > 1.01) {
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
            return;
          }

          const absX = Math.abs(event.translationX);
          const absY = Math.abs(event.translationY);
          if (panAxis.value === 0 && Math.max(absX, absY) >= PAGE_AXIS_SLOP) {
            panAxis.value = absX > absY * 1.08 ? 1 : 2;
          }

          if (panAxis.value === 1) {
            const hasTarget = event.translationX < 0 ? canNext : canPrevious;
            const translation = hasTarget
              ? event.translationX
              : event.translationX * 0.18;
            trackX.value = baseTrackX + translation;
            translateX.value = 0;
            translateY.value = 0;
            dismissProgress.value = 0;
            return;
          }

          if (panAxis.value === 2) {
            trackX.value = baseTrackX;
            translateX.value = event.translationX * 0.12;
            translateY.value =
              event.translationY >= 0
                ? event.translationY
                : event.translationY * 0.14;
            dismissProgress.value = clamp(
              Math.max(0, event.translationY) / Math.max(screenHeight * 0.45, 1),
              0,
              1,
            );
          }
        })
        .onEnd((event) => {
          if (scale.value > 1.01) {
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
              clamp: [-maxX, maxX],
              rubberBandEffect: true,
              rubberBandFactor: 0.14,
            });
            translateY.value = withDecay({
              velocity: event.velocityY,
              clamp: [-maxY, maxY],
              rubberBandEffect: true,
              rubberBandFactor: 0.14,
            });
            return;
          }

          if (panAxis.value === 1) {
            const direction = event.translationX < 0 ? 1 : -1;
            const nextIndex = currentIndex + direction;
            const hasTarget = nextIndex >= 0 && nextIndex < gallery.length;
            const shouldPage =
              hasTarget &&
              (Math.abs(event.translationX) > screenWidth * 0.16 ||
                Math.abs(event.velocityX) > PAGE_VELOCITY);

            if (shouldPage) {
              const destination = -(nextIndex - anchorIndex) * screenWidth;
              trackX.value = withTiming(
                destination,
                { duration: 190 },
                (finished) => {
                  if (finished) scheduleOnRN(commitPage, nextIndex);
                },
              );
            } else {
              trackX.value = withSpring(baseTrackX, {
                damping: 22,
                stiffness: 250,
                overshootClamping: true,
              });
            }
            return;
          }

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

          trackX.value = withSpring(baseTrackX);
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
        })
        .onFinalize(() => {
          panAxis.value = 0;
        }),
    [
      anchorIndex,
      baseTrackX,
      canNext,
      canPrevious,
      commitPage,
      currentIndex,
      dismissProgress,
      fittedSize.height,
      fittedSize.width,
      gallery.length,
      hideChrome,
      onClose,
      panAxis,
      panStartX,
      panStartY,
      scale,
      screenHeight,
      screenWidth,
      trackX,
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
          trackX.value = baseTrackX;
          dismissProgress.value = 0;

          if (scale.value >= 1.5) {
            scale.value = withTiming(1, { duration: 190 });
            translateX.value = withTiming(0, { duration: 190 });
            translateY.value = withTiming(0, { duration: 190 });
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
      baseTrackX,
      dismissProgress,
      fittedSize.height,
      fittedSize.width,
      hideChrome,
      scale,
      screenHeight,
      screenWidth,
      showChrome,
      trackX,
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

  const composedGesture = useMemo(
    () =>
      Gesture.Simultaneous(
        pinch,
        pan,
        Gesture.Exclusive(doubleTap, singleTap),
      ),
    [doubleTap, pan, pinch, singleTap],
  );

  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: trackX.value }],
  }));
  const currentImageStyle = useAnimatedStyle(() => {
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

  const visibleIndices = useMemo(() => {
    const indices = [currentIndex - 1, currentIndex, currentIndex + 1];
    return indices.filter((index) => index >= 0 && index < gallery.length);
  }, [currentIndex, gallery.length]);

  const downloadImage = useCallback(async () => {
    const freshAsset =
      current.assetId && token ? await getWaAsset(token, current.assetId) : null;
    const url = freshAsset?.url || current.url;
    if (!url) throw new Error("Image download link is unavailable");

    const directory = new Directory(Paths.cache, "whatsapp-image-actions");
    directory.create({ idempotent: true, intermediates: true });
    const localFile = new File(
      directory,
      `${current.assetId || current.messageId || "remote"}-${safeFileName(current)}`,
    );
    if (localFile.exists) return localFile;
    return File.downloadFileAsync(url, localFile, { idempotent: true });
  }, [current, token]);

  const shareImage = useCallback(async () => {
    if (action) return;
    setAction("share");
    try {
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error("Sharing is unavailable on this device");
      }
      const file = await downloadImage();
      await Sharing.shareAsync(file.uri, {
        mimeType: current.mimeType || "image/jpeg",
        dialogTitle: current.fileName || "WhatsApp image",
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
  }, [action, current.fileName, current.mimeType, downloadImage]);

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
      presentationStyle="overFullScreen"
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.root}>
        <StatusBar style="light" />
        <Animated.View style={[styles.backdrop, backdropStyle]} />

        <GestureDetector gesture={composedGesture}>
          <View style={styles.gestureSurface}>
            <Animated.View style={[styles.galleryTrack, trackStyle]}>
              {visibleIndices.map((index) => {
                const item = gallery[index];
                return (
                  <GalleryPage
                    key={imageIdentity(item)}
                    image={item}
                    pageIndex={index}
                    anchorIndex={anchorIndex}
                    screenWidth={screenWidth}
                    screenHeight={screenHeight}
                    isCurrent={index === currentIndex}
                    currentImageStyle={currentImageStyle}
                    onAssetError={refreshFailedAsset}
                  />
                );
              })}
            </Animated.View>
          </View>
        </GestureDetector>

        {chromeVisible ? (
          <>
            <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close image"
                style={styles.iconButton}
                onPress={onClose}
              >
                <MaterialCommunityIcons name="close" size={28} color="#ffffff" />
              </Pressable>
              <View style={styles.titleBlock}>
                <Text numberOfLines={1} style={styles.fileName}>
                  {current.fileName || "Photo"}
                </Text>
                {gallery.length > 1 ? (
                  <Text style={styles.counter}>
                    {currentIndex + 1} of {gallery.length}
                  </Text>
                ) : null}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Reset zoom"
                style={styles.iconButton}
                onPress={() => {
                  triggerMediumHaptic();
                  resetZoom(true);
                  trackX.value = withSpring(baseTrackX);
                }}
              >
                <MaterialCommunityIcons
                  name="fit-to-screen-outline"
                  size={24}
                  color="#ffffff"
                />
              </Pressable>
            </View>

            <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 14 }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save image"
                style={styles.actionButton}
                disabled={action !== null}
                onPress={saveImage}
              >
                {action === "save" ? (
                  <ActivityIndicator size={20} color="#ffffff" />
                ) : (
                  <MaterialCommunityIcons name="download-outline" size={23} color="#ffffff" />
                )}
                <Text style={styles.actionText}>Save</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Share image"
                style={styles.actionButton}
                disabled={action !== null}
                onPress={shareImage}
              >
                {action === "share" ? (
                  <ActivityIndicator size={20} color="#ffffff" />
                ) : (
                  <MaterialCommunityIcons name="share-variant-outline" size={23} color="#ffffff" />
                )}
                <Text style={styles.actionText}>Share</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#050706",
  },
  gestureSurface: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
  },
  galleryTrack: {
    ...StyleSheet.absoluteFill,
  },
  galleryPage: {
    position: "absolute",
    top: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  image: { width: "100%", height: "100%" },
  pageState: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  stateText: { color: "#ffffff" },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    minHeight: 72,
    paddingHorizontal: 12,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(5,7,6,0.72)",
  },
  titleBlock: { flex: 1, minWidth: 0 },
  fileName: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  counter: { marginTop: 1, color: "rgba(255,255,255,0.68)", fontSize: 11 },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 12,
    paddingHorizontal: 24,
    flexDirection: "row",
    justifyContent: "center",
    gap: 20,
    backgroundColor: "rgba(5,7,6,0.72)",
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
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
  actionText: { color: "#ffffff", fontWeight: "700" },
});
