import { Assets as NavigationAssets } from '@react-navigation/elements';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Asset } from 'expo-asset';
import { createURL } from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import * as React from 'react';
import { useColorScheme } from 'react-native';
import { ActivityIndicator, PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import "../global.css";
import { useAuthStore } from './auth/auth-store';
import { Navigation } from './navigation';
import { Login } from './navigation/screens/Login';
import { navigationThemes, paperDarkTheme, paperLightTheme } from './theme/paper';

Asset.loadAsync([
  ...NavigationAssets,
  require('./assets/newspaper.png'),
  require('./assets/bell.png'),
]);

SplashScreen.preventAutoHideAsync();

const prefix = createURL('/');
const queryClient = new QueryClient();

export function App() {
  const colorScheme = useColorScheme();
  const restoreSession = useAuthStore((state) => state.restoreSession);
  const isBootstrapping = useAuthStore((state) => state.isBootstrapping);
  const user = useAuthStore((state) => state.user);

  React.useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const paperTheme = colorScheme === 'dark' ? paperDarkTheme : paperLightTheme;
  const navigationTheme =
    colorScheme === 'dark'
      ? navigationThemes.DarkTheme
      : navigationThemes.LightTheme;

  if (isBootstrapping) {
    return (
      <SafeAreaProvider>
        <PaperProvider theme={paperTheme}>
          <ActivityIndicator style={{ flex: 1 }} />
        </PaperProvider>
      </SafeAreaProvider>
    );
  }

  if (!user) {
    SplashScreen.hideAsync();
    return (
      <SafeAreaProvider>
        <PaperProvider theme={paperTheme}>
          <Login />
        </PaperProvider>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <PaperProvider theme={paperTheme}>
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
        </PaperProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
