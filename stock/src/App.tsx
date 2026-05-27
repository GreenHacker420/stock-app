import { Assets as NavigationAssets } from '@react-navigation/elements';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ThemeProvider as RneThemeProvider, createTheme } from '@rneui/themed';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Asset } from 'expo-asset';
import { createURL } from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import * as React from 'react';
import { ActivityIndicator, PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import "../global.css";
import { useAuthStore } from './auth/auth-store';
import { useShopStore } from './auth/shop-store';
import { OwnerNavigation, StaffNavigation } from './navigation';
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
const queryClient = new QueryClient();
const paperSettings = {
  icon: ({ name, color, size, testID }: any) => (
    <MaterialCommunityIcons name={name as never} color={color ?? "#6b7280"} size={size} testID={testID} />
  ),
};
const rneTheme = createTheme({
  lightColors: {
    primary: "#1e40af",
    secondary: "#8a5a12",
    background: "#f9fafb",
    white: "#ffffff",
    black: "#111827",
    grey0: "#f9fafb",
    grey1: "#eef2ea",
    grey2: "#e5e7eb",
    grey3: "#b9c3b5",
    grey4: "#7a8578",
    grey5: "#6b7280",
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
      <QueryClientProvider client={queryClient}>
        <PaperProvider theme={paperTheme} settings={paperSettings}>
          <RneThemeProvider theme={rneTheme}>
            <RealtimeProvider>
              <AuthenticatedApp theme={navigationTheme} prefix={prefix} />
            </RealtimeProvider>
          </RneThemeProvider>
        </PaperProvider>
      </QueryClientProvider>
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
