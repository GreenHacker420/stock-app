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

import { colors } from "./index";

export const paperLightTheme = {
  ...MD3LightTheme,
  roundness: 2,
  fonts: configureFonts({ config: fontConfig }),
  colors: {
    ...MD3LightTheme.colors,
    primary: colors.primary,
    onPrimary: colors.textInverse,
    primaryContainer: colors.primaryLight,
    onPrimaryContainer: colors.primaryDark,
    secondary: colors.textSecondary,
    secondaryContainer: colors.surfaceOffset,
    onSecondaryContainer: colors.textPrimary,
    tertiary: colors.primaryMid,
    surface: colors.surface,
    surfaceVariant: colors.surfaceOffset,
    background: colors.bg,
    outline: colors.border,
    onSurface: colors.textPrimary,
    onSurfaceVariant: colors.textSecondary,
    error: colors.danger,
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
