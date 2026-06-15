import React, { useRef, useState, useEffect } from 'react';
import { View, StyleSheet, PanResponder, Pressable, Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text, Icon } from 'react-native-paper';
import { colors, spacing, radius, fontSize, fontWeight } from '../../theme';

interface SignaturePadProps {
  onSave: (signatureBase64: string) => void;
  onClear?: () => void;
  onDrawingStateChange?: (isDrawing: boolean) => void;
}

export function SignaturePad({ onSave, onClear, onDrawingStateChange }: SignaturePadProps) {
  const [paths, setPaths] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState<string | null>(null);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        // Use relative coordinates for SVG
        const path = `M${locationX} ${locationY}`;
        setCurrentPath(path);
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        setCurrentPath((prev) => prev ? `${prev} L${locationX} ${locationY}` : `M${locationX} ${locationY}`);
      },
      onPanResponderRelease: () => {
        // We need to capture the currentPath value into the paths array
        // but currentPath might be updated asynchronously. 
        // We'll use a functional update to get the latest state safely.
      },
    })
  ).current;

  // We handle the release logic with an effect or by keeping track of the path in a ref for immediate access
  const currentPathRef = useRef<string | null>(null);
  
  // Create a customized pan responder that updates refs for stability
  const stablePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const path = `M${locationX} ${locationY}`;
        currentPathRef.current = path;
        setCurrentPath(path);
        if (onDrawingStateChange) onDrawingStateChange(true);
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const newPath = `${currentPathRef.current} L${locationX} ${locationY}`;
        currentPathRef.current = newPath;
        setCurrentPath(newPath);
      },
      onPanResponderRelease: () => {
        if (currentPathRef.current) {
          const finalPath = currentPathRef.current;
          setPaths((prev) => {
            const next = [...prev, finalPath];
            // Notify parent about the change
            onSave(JSON.stringify(next));
            return next;
          });
          currentPathRef.current = null;
          setCurrentPath(null);
        }
        if (onDrawingStateChange) onDrawingStateChange(false);
      },
      onPanResponderTerminate: () => {
        currentPathRef.current = null;
        setCurrentPath(null);
        if (onDrawingStateChange) onDrawingStateChange(false);
      },
    })
  ).current;

  const handleClear = () => {
    setPaths([]);
    setCurrentPath(null);
    currentPathRef.current = null;
    if (onClear) onClear();
    onSave(""); // Clear parent state too
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Icon source="pencil-lock" size={20} color={colors.primary} />
          <Text style={styles.title}>Customer Signature</Text>
        </View>
        <Pressable onPress={handleClear} style={styles.clearBtn}>
          <Text style={styles.clearText}>Clear</Text>
        </Pressable>
      </View>

      <View 
        style={styles.pad} 
        {...stablePanResponder.panHandlers}
      >
        <Svg style={styles.svg}>
          {paths.map((path, index) => (
            <Path
              key={index}
              d={path}
              stroke={colors.textPrimary}
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {currentPath ? (
            <Path
              d={currentPath}
              stroke={colors.textPrimary}
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
        </Svg>
        {paths.length === 0 && !currentPath && (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>Sign here</Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.hint}>By signing, the customer acknowledges receipt of goods on credit.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    flex: 1, // Use available height
    minHeight: 300,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceOffset,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    fontSize: 12,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  clearBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  clearText: {
    fontSize: 12,
    color: colors.danger,
    fontWeight: fontWeight.bold,
  },
  pad: {
    flex: 1, // Fill available space
    backgroundColor: 'white',
    position: 'relative',
    ...Platform.select({
      web: {
        touchAction: 'none',
        userSelect: 'none',
      } as any,
      default: {},
    }),
  },
  svg: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  placeholder: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  placeholderText: {
    fontSize: 24,
    color: colors.surfaceOffset,
    fontWeight: fontWeight.bold,
    opacity: 0.5,
  },
  footer: {
    padding: spacing.md,
    backgroundColor: colors.surfaceOffset,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  hint: {
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
