import {
  MD3DarkTheme,
  MD3LightTheme,
  adaptNavigationTheme,
  configureFonts,
} from "react-native-paper";
import { DarkTheme, DefaultTheme } from "@react-navigation/native";

const fontConfig = {
  fontFamily: "System",
};

export const paperLightTheme = {
  ...MD3LightTheme,
  roundness: 3,
  fonts: configureFonts({ config: fontConfig }),
  colors: {
    ...MD3LightTheme.colors,
    primary: "#246b4b",
    onPrimary: "#ffffff",
    primaryContainer: "#d8f2e3",
    onPrimaryContainer: "#0b3d28",
    secondary: "#8a5a12",
    secondaryContainer: "#ffe2ad",
    onSecondaryContainer: "#3f2800",
    tertiary: "#2c5d89",
    surface: "#ffffff",
    surfaceVariant: "#eef2ea",
    background: "#f4f6f1",
    outline: "#7a8578",
    onSurface: "#17211b",
    onSurfaceVariant: "#4d584f",
    error: "#b42318",
  },
};

export const paperDarkTheme = {
  ...MD3DarkTheme,
  roundness: 2,
  fonts: configureFonts({ config: fontConfig }),
  colors: {
    ...MD3DarkTheme.colors,
    primary: "#7cc9a6",
    secondary: "#e0ad5f",
    tertiary: "#8bb7e8",
    surface: "#18211c",
    background: "#0f1512",
    error: "#ffb4ab",
  },
};

export const navigationThemes = adaptNavigationTheme({
  reactNavigationLight: DefaultTheme,
  reactNavigationDark: DarkTheme,
  materialLight: paperLightTheme,
  materialDark: paperDarkTheme,
});
