import { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useRoute } from "@react-navigation/native";
import { ActivityIndicator, Text } from "react-native-paper";
import { WebView } from "react-native-webview";

import { getAssetDownloadUrl } from "../../api/ledger.api";
import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Button } from "../../components/ui/Button";
import { colors, spacing } from "../../theme";

type AssetViewerParams = {
  assetId: string;
  shopId: string;
  fileName: string;
};

export function AssetViewer() {
  const route = useRoute<any>();
  const { assetId, shopId, fileName } = route.params as AssetViewerParams;
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAssetDownloadUrl(assetId, { shopId });
      setUrl(result.downloadUrl);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not load this PDF.";
      setError(message);
      Alert.alert("PDF unavailable", message);
    } finally {
      setLoading(false);
    }
  }, [assetId, shopId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <AppHeader title={fileName} showBack hideAvatar />
      <View style={styles.container}>
        {url && !error ? (
          <WebView
            source={{ uri: url }}
            originWhitelist={["https://*", "http://*"]}
            setSupportMultipleWindows={false}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onHttpError={({ nativeEvent }) => setError(`Could not load PDF (${nativeEvent.statusCode}).`)}
            onError={({ nativeEvent }) => setError(nativeEvent.description || "Could not display this PDF.")}
            style={styles.webview}
          />
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.errorTitle}>PDF could not be displayed</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Button label="Try Again" icon="refresh" onPress={load} />
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceOffset,
  },
  webview: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.xl,
  },
  errorTitle: {
    color: colors.textPrimary,
    fontWeight: "700",
  },
  errorText: {
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
});
