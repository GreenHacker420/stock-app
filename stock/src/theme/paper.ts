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
  roundness: 2,
  fonts: configureFonts({ config: fontConfig }),
  colors: {
    ...MD3LightTheme.colors,
    primary: "#1e40af",
    onPrimary: "#ffffff",
    primaryContainer: "#dbeafe",
    onPrimaryContainer: "#1e3a8a",
    secondary: "#64748b",
    secondaryContainer: "#f1f5f9",
    onSecondaryContainer: "#0f172a",
    tertiary: "#0ea5e9",
    surface: "#ffffff",
    surfaceVariant: "#f3f4f6",
    background: "#f9fafb",
    outline: "#e5e7eb",
    onSurface: "#111827",
    onSurfaceVariant: "#4b5563",
    error: "#ef4444",
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
