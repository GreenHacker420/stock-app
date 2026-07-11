import { Assets as NavigationAssets } from '@react-navigation/elements';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ThemeProvider as RneThemeProvider, createTheme } from '@rneui/themed';
import { focusManager, onlineManager, QueryClientProvider } from '@tanstack/react-query';
import { Asset } from 'expo-asset';
import { createURL } from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { AppState, Platform, Image, StatusBar, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, PaperProvider, Text } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from './auth/auth-store';
import { useShopStore } from './auth/shop-store';
import { runDataHardeningStorageMigration, runEventSequenceCursorMigration } from './auth/mmkv-storage';
import { initializeDomainReadCache } from './auth/domain-cache';
import { OwnerNavigation, StaffNavigation } from './navigation';
import { navigationRef } from './navigation/navigation-ref';
import { Login } from './navigation/screens/Login';
import { SelectShop } from './navigation/screens/SelectShop';
import { RealtimeProvider } from './realtime/RealtimeProvider';
import { navigationThemes, paperLightTheme } from './theme/paper';
import { useNotificationSetup } from './notifications/FCMManager';
import { useEnsureActiveShop } from './hooks/useActiveShop';
import { queryClient } from './query/queryClient';
import NetInfo from '@react-native-community/netinfo';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OfflineBanner } from './components/OfflineBanner';
import { checkAppUpdatesBackground } from './utils/inAppUpdates';

Asset.loadAsync([
  ...NavigationAssets,
  require('./assets/newspaper.png'),
  require('./assets/bell.png'),
  require('../assets/splash-icon.png'),
]);

SplashScreen.preventAutoHideAsync();

const prefix = createURL('/');
const paperSettings = {
  icon: ({ name, color, size, testID }: any) => (
    <MaterialCommunityIcons name={name as never} color={color ?? "#6b7280"} size={size} testID={testID} />
  ),
};
import { colors } from './theme';

const rneTheme = createTheme({
  lightColors: {
    primary: colors.primary,
    secondary: "#8a5a12",
    background: colors.bg,
    white: colors.surface,
    black: colors.textPrimary,
    grey0: colors.bg,
    grey1: colors.surfaceOffset,
    grey2: colors.border,
    grey3: colors.borderStrong,
    grey4: colors.textMuted,
    grey5: colors.textSecondary,
  },
});

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(Boolean(state.isConnected) && state.isInternetReachable !== false);
  });
});

focusManager.setEventListener((handleFocus) => {
  const subscription = AppState.addEventListener('change', (state) => {
    if (Platform.OS !== 'web') {
      handleFocus(state === 'active');
    }
  });
  return () => subscription.remove();
});

export function App() {
  const restoreSession = useAuthStore((state) => state.restoreSession);
  const isBootstrapping = useAuthStore((state) => state.isBootstrapping);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    runDataHardeningStorageMigration();
    runEventSequenceCursorMigration();
    restoreSession();
  }, [restoreSession]);

  const paperTheme = paperLightTheme;
  const navigationTheme = navigationThemes.LightTheme;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <PaperProvider theme={paperTheme} settings={paperSettings}>
            <RneThemeProvider theme={rneTheme}>
              <ErrorBoundary>
                <AppContent
                  isBootstrapping={isBootstrapping}
                  user={user}
                  navigationTheme={navigationTheme}
                  prefix={prefix}
                />
                <OfflineBanner />
              </ErrorBoundary>
            </RneThemeProvider>
          </PaperProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

function AppContent({
  isBootstrapping,
  user,
  navigationTheme,
  prefix,
}: {
  isBootstrapping: boolean;
  user: any;
  navigationTheme: any;
  prefix: string;
}) {
  useNotificationSetup();

  useEffect(() => {
    if (!user?.id) return;
    initializeDomainReadCache(user.id).catch((error) => {
      if (__DEV__) console.warn("[domain-cache] initialization failed", error);
    });
  }, [user?.id]);

  useEffect(() => {
    checkAppUpdatesBackground();
  }, []);

  if (isBootstrapping) {
    return <AppLoading />;
  }

  if (!user) {
    SplashScreen.hideAsync();
    return <Login />;
  }

  return (
    <RealtimeProvider>
      <AuthenticatedApp theme={navigationTheme} prefix={prefix} />
    </RealtimeProvider>
  );
}

function AuthenticatedApp({ theme, prefix }: { theme: typeof navigationThemes.LightTheme; prefix: string }) {
  const user = useAuthStore((state) => state.user);
  const activeShopId = useShopStore((state) => state.activeShopId);
  useEnsureActiveShop();

  useEffect(() => {
    if (!activeShopId) {
      SplashScreen.hideAsync();
    }
  }, [activeShopId]);

  if (!activeShopId) {
    return <SelectShop />;
  }

  const Navigation = user?.role === "OWNER" ? OwnerNavigation : StaffNavigation;

  return (
    <Navigation
      ref={navigationRef}
      theme={theme}
      linking={{
        enabled: "auto",
        prefixes: [prefix],
      }}
      onReady={() => {
        SplashScreen.hideAsync();
      }}
    />
  );
}

function AppLoading() {
  return (
    <LinearGradient
      colors={[colors.surface, colors.surfaceOffset]}
      style={styles.loadingContainer}
    >
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
      <View style={styles.loadingInner}>
        <Image 
          source={require('../assets/splash-icon.png')} 
          style={styles.loadingLogo} 
          resizeMode="contain"
        />
        <Text style={styles.loadingTitle}>ShopControl</Text>
        <Text style={styles.loadingSubtitle}>Retail & Distribution Operations</Text>
        <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 24 }} />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingLogo: {
    width: 100,
    height: 100,
    marginBottom: 16,
  },
  loadingTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#0f172a',
    letterSpacing: -0.5,
  },
  loadingSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },
});
