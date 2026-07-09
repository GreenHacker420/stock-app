import { Component, ErrorInfo, ReactNode } from "react";
import { View, StyleSheet, ScrollView, Platform } from "react-native";
import { Text, Icon } from "react-native-paper";
import { Button } from "./ui/Button";
import { colors, spacing, radius, fontSize, fontWeight } from "../theme";
import { logError, logInfo } from "../utils/logger";
import { createMMKV } from "react-native-mmkv";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logError("App crashed inside React tree", error);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  private handleClearCache = () => {
    try {
      const storage = createMMKV({ id: "stock-app-storage" });
      storage.clearAll();
      logInfo("MMKV cache cleared via ErrorBoundary recovery");
      this.setState({ hasError: false, error: null, errorInfo: null });
    } catch (err) {
      console.error("Failed to clear MMKV on recovery:", err);
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.card}>
            <View style={styles.iconContainer}>
              <Icon source="alert-octagon" size={48} color={colors.danger} />
            </View>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.subtitle}>
              ShopControl encountered a runtime crash. The operations log has recorded this incident.
            </Text>

            {this.state.error && (
              <ScrollView style={styles.errorScroll} contentContainerStyle={styles.errorContent}>
                <Text style={styles.errorText}>{this.state.error.toString()}</Text>
                {this.state.errorInfo && (
                  <Text style={styles.stackText}>{this.state.errorInfo.componentStack}</Text>
                )}
              </ScrollView>
            )}

            <View style={styles.actions}>
              <Button
                label="Attempt Restart"
                onPress={this.handleReset}
                style={styles.btn}
              />
              <Button
                label="Wipe Cache & Restart"
                variant="ghost"
                onPress={this.handleClearCache}
                style={[styles.btn, styles.clearBtn]}
              />
            </View>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.dangerLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  errorScroll: {
    width: "100%",
    maxHeight: 180,
    backgroundColor: colors.surfaceOffset,
    borderRadius: radius.md,
    marginBottom: spacing.xl,
    padding: spacing.md,
  },
  errorContent: {
    paddingBottom: spacing.sm,
  },
  errorText: {
    fontSize: fontSize.xs,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    color: colors.danger,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.xs,
  },
  stackText: {
    fontSize: fontSize.xs - 2,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    color: colors.textMuted,
    lineHeight: 14,
  },
  actions: {
    width: "100%",
    gap: spacing.sm,
  },
  btn: {
    width: "100%",
    borderRadius: radius.md,
  },
  clearBtn: {
    borderColor: colors.danger,
  },
});
