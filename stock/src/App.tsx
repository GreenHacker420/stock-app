import { Assets as NavigationAssets } from '@react-navigation/elements';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ThemeProvider as RneThemeProvider, createTheme } from '@rneui/themed';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Asset } from 'expo-asset';
import { createURL } from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import * as React from 'react';
import { ActivityIndicator, PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import "../global.css";
import { useAuthStore } from './auth/auth-store';
import { useShopStore } from './auth/shop-store';
import { clientPersister } from './auth/mmkv-storage';
import { OwnerNavigation, StaffNavigation } from './navigation';
import { navigationRef } from './navigation/navigation-ref';
import { Login } from './navigation/screens/Login';
import { SelectShop } from './navigation/screens/SelectShop';
import { RealtimeProvider } from './realtime/RealtimeProvider';
import { navigationThemes, paperLightTheme } from './theme/paper';

Asset.loadAsync([
  ...NavigationAssets,
  require('./assets/newspaper.png'),
  require('./assets/bell.png'),
]);

SplashScreen.preventAutoHideAsync();

const prefix = createURL('/');
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:            5 * 60 * 1000,  // 5 minutes — shared cache across all screens
      gcTime:               10 * 60 * 1000, // 10 minutes garbage collection
      retry:                2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});
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

export function App() {
  const restoreSession = useAuthStore((state) => state.restoreSession);
  const isBootstrapping = useAuthStore((state) => state.isBootstrapping);
  const user = useAuthStore((state) => state.user);

  React.useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const paperTheme = paperLightTheme;
  const navigationTheme = navigationThemes.LightTheme;

  if (isBootstrapping) {
    return (
      <SafeAreaProvider>
        <PaperProvider theme={paperTheme} settings={paperSettings}>
          <RneThemeProvider theme={rneTheme}>
            <ActivityIndicator style={{ flex: 1 }} />
          </RneThemeProvider>
        </PaperProvider>
      </SafeAreaProvider>
    );
  }

  if (!user) {
    SplashScreen.hideAsync();
    return (
      <SafeAreaProvider>
        <PaperProvider theme={paperTheme} settings={paperSettings}>
          <RneThemeProvider theme={rneTheme}>
            <Login />
          </RneThemeProvider>
        </PaperProvider>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister: clientPersister }}
      >
        <PaperProvider theme={paperTheme} settings={paperSettings}>
          <RneThemeProvider theme={rneTheme}>
            <RealtimeProvider>
              <AuthenticatedApp theme={navigationTheme} prefix={prefix} />
            </RealtimeProvider>
          </RneThemeProvider>
        </PaperProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}

function AuthenticatedApp({ theme, prefix }: { theme: typeof navigationThemes.LightTheme; prefix: string }) {
  const user = useAuthStore((state) => state.user);
  const activeShopId = useShopStore((state) => state.activeShopId);

  React.useEffect(() => {
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
