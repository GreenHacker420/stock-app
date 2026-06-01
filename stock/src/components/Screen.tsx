import React from 'react';
import { View, StyleSheet, StatusBar, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';

interface Props {
  children: React.ReactNode;
  scroll?: boolean;   // kept for API compat but deprecated — use FlashList inside instead
  style?: object;
  bg?: string;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}

export function Screen({ children, style, bg = colors.bg, edges = ['top', 'left', 'right'] }: Props) {
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]} edges={edges}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={bg}
        translucent={false}
      />
      <View style={[styles.container, { backgroundColor: bg }, style]}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1 },
  container: { flex: 1 },
});
