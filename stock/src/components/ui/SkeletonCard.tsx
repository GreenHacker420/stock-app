import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '../../theme';

interface Props {
  height?: number;
  width?: number | string;
  borderRadius?: number;
  style?: object;
}

export function SkeletonCard({ height = 80, width, borderRadius = radius.lg, style }: Props) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 750, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.base,
        { height, borderRadius, opacity },
        width ? { width } : styles.fullWidth,
        style,
      ]}
    />
  );
}

export function SkeletonList({ count = 6, itemHeight = 88 }: { count?: number; itemHeight?: number }) {
  return (
    <View style={styles.listContainer}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} height={itemHeight} style={{ marginBottom: spacing.sm }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  base:          { backgroundColor: colors.surfaceDark },
  fullWidth:     { marginHorizontal: spacing.lg },
  listContainer: { paddingTop: spacing.md },
});
