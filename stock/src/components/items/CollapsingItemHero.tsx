import { View, StyleSheet, ScrollView, Dimensions, Pressable } from "react-native";
import { Image } from "expo-image";
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  SharedValue,
} from "react-native-reanimated";

import { spacing } from "../../theme";

const AnimatedExpoImage = Animated.createAnimatedComponent(Image);

type CollapsingItemHeroProps = {
  imageUrls: string[];
  activeImageIndex: number;
  onActiveImageChange: (index: number) => void;
  scrollY: SharedValue<number>;
  targetLayout: { x: number; y: number; width: number; height: number } | null;
  onImagePress: (url: string) => void;
};


const HERO_HEIGHT = 220;
const MORPH_START = 50;
const MORPH_END = 180;

export function CollapsingItemHero({
  imageUrls,
  activeImageIndex,
  onActiveImageChange,
  scrollY,
  targetLayout,
  onImagePress,
}: CollapsingItemHeroProps) {
  const screenWidth = Dimensions.get("window").width;

  // Carousel container style: handles fading out and parallax scrolling
  const carouselAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [MORPH_START, MORPH_START + 30],
      [1, 0],
      Extrapolation.CLAMP
    );
    const translateY = scrollY.value * 0.4;
    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  if (imageUrls.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* 1. Normal Carousel with Parallax & Opacity Fade */}
      <Animated.View style={[styles.carouselContainer, carouselAnimatedStyle]}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={(e) => {
            const contentOffset = e.nativeEvent.contentOffset.x;
            const viewSize = e.nativeEvent.layoutMeasurement.width;
            if (viewSize > 0) {
              const pageNum = Math.round(contentOffset / viewSize);
              onActiveImageChange(pageNum);
            }
          }}
          scrollEventThrottle={16}
          style={styles.carouselScrollView}
        >
          {imageUrls.map((url, idx) => (
            <Pressable
              key={idx}
              onPress={() => onImagePress(url)}
              style={({ pressed }) => [
                styles.carouselImageContainer,
                { width: screenWidth },
                pressed && { opacity: 0.9 },
              ]}
            >
              <Image source={{ uri: url }} style={styles.carouselImage} contentFit="cover" />
            </Pressable>
          ))}
        </ScrollView>

        {imageUrls.length > 1 && (
          <View style={styles.dotsRow}>
            {imageUrls.map((_, idx) => (
              <View
                key={idx}
                style={[styles.dot, activeImageIndex === idx && styles.activeDot]}
              />
            ))}
          </View>
        )}
      </Animated.View>
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    height: HERO_HEIGHT,
    width: "100%",
    backgroundColor: "#f3f4f6",
    overflow: "hidden",
  },
  carouselContainer: {
    height: "100%",
    width: "100%",
    position: "relative",
  },
  carouselScrollView: {
    width: "100%",
    height: "100%",
  },
  carouselImageContainer: {
    height: HERO_HEIGHT,
  },
  carouselImage: {
    width: "100%",
    height: "100%",
  },
  dotsRow: {
    position: "absolute",
    bottom: spacing.md,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.4)",
  },
  activeDot: {
    width: 14,
    backgroundColor: "#ffffff",
  },
});
