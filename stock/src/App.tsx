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
import { Navigation } from './navigation';
import { Login } from './navigation/screens/Login';
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
  icon: ({ name, color, size, testID }: { name: string; color?: string; size: number; testID?: string }) => (
    <MaterialCommunityIcons name={name as never} color={color ?? "#4d584f"} size={size} testID={testID} />
  ),
};
const rneTheme = createTheme({
  lightColors: {
    primary: "#246b4b",
    secondary: "#8a5a12",
    background: "#f4f6f1",
    white: "#ffffff",
    black: "#17211b",
    grey0: "#f4f6f1",
    grey1: "#eef2ea",
    grey2: "#d9dfd2",
    grey3: "#b9c3b5",
    grey4: "#7a8578",
    grey5: "#4d584f",
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
            <Navigation
              theme={navigationTheme}
              linking={{
                enabled: 'auto',
                prefixes: [prefix],
              }}
              onReady={() => {
                SplashScreen.hideAsync();
              }}
            />
          </RneThemeProvider>
        </PaperProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
