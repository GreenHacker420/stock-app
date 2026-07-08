import React, { useState, useEffect } from "react";
import { View, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { WebView } from "react-native-webview";
import { useRoute } from "@react-navigation/native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { Screen } from "../../components/Screen";
import { AppHeader } from "../../components/ui/AppHeader";
import { Button } from "../../components/ui/Button";
import { generateSaleInvoiceHtml } from "../../utils/pdf";
import { colors, spacing } from "../../theme";
import { Sale, Shop } from "../../api/client";

export function InvoiceViewer() {
  const route = useRoute<any>();
  const { sale, shop } = route.params as { sale: Sale; shop: Shop };
  
  const [loading, setLoading] = useState(true);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);

  useEffect(() => {
    generateSaleInvoiceHtml({ sale, shop })
      .then(setHtmlContent)
      .catch((err) => {
        Alert.alert("Error", "Failed to generate invoice preview.");
        console.error(err);
      });
  }, [sale, shop]);

  const handlePrint = async () => {
    if (!htmlContent) return;
    try {
      await Print.printAsync({ html: htmlContent });
    } catch (err: any) {
      Alert.alert("Print Error", err?.message || "Failed to print invoice.");
    }
  };

  const handleShare = async () => {
    if (!htmlContent) return;
    try {
      const result = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(result.uri, {
        mimeType: "application/pdf",
        dialogTitle: `Invoice - ${sale.saleNumber}`,
        UTI: "com.adobe.pdf",
      });
    } catch (err: any) {
      Alert.alert("Share Error", err?.message || "Failed to share invoice.");
    }
  };

  return (
    <Screen edges={["top", "left", "right"]}>
      <AppHeader 
        title="Invoice Preview" 
        subtitle={`Sale #${sale.saleNumber}`} 
        showBack 
      />

      <View style={styles.container}>
        {htmlContent ? (
          <WebView
            originWhitelist={["*"]}
            source={{ html: htmlContent }}
            style={styles.webview}
            onLoadEnd={() => setLoading(false)}
          />
        ) : (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}

        {loading && htmlContent && (
          <View style={styles.overlay}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
      </View>

      <View style={styles.footerActions}>
        <Button
          label="Print"
          variant="ghost"
          icon="printer"
          onPress={handlePrint}
          style={{ flex: 1 }}
        />
        <Button
          label="Share PDF"
          variant="primary"
          icon="share-variant"
          onPress={handleShare}
          style={{ flex: 1 }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
  },
  footerActions: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
