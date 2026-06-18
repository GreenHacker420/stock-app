import React, { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { Button, TextInput, Text, Divider } from "react-native-paper";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import { useShopStore } from "../../../auth/shop-store";
import { whatsappSetupApi } from "../../../api/whatsapp-setup.api";
import { Screen } from "../../../components/Screen";
import { Section } from "../../../components/ui/Section";
import { Colors } from "../../../theme/colors";

WebBrowser.maybeCompleteAuthSession();

export const WhatsAppSetupScreen = () => {
  const activeShopId = useShopStore((state) => state.activeShopId);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Manual Form State
  const [verifyToken, setVerifyToken] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [status, setStatus] = useState("");

  // Embedded Signup State
  const [oauthCode, setOauthCode] = useState("");

  const FB_APP_ID = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID || "YOUR_APP_ID"; 
  const redirectUri = AuthSession.makeRedirectUri({
    scheme: "shopcontrol" // Update according to app.json scheme
  });

  const fetchSetup = async () => {
    if (!activeShopId) return;
    setLoading(true);
    try {
      const res = await whatsappSetupApi.getSetupInfo(activeShopId);
      if (res.data.success && res.data.data) {
        const { data } = res.data;
        setVerifyToken(data.verifyToken || "");
        setAccessToken(data.accessToken || "");
        setAppSecret(data.appSecret || "");
        setBusinessAccountId(data.businessAccountId || "");
        setPhoneNumberId(data.phoneNumberId || "");
        setPhoneNumber(data.phoneNumber || "");
        setBusinessName(data.businessName || "");
        setStatus(data.status || "DISCONNECTED");
      }
    } catch (error) {
      console.log("Setup fetch failed, might be new", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSetup();
  }, [activeShopId]);

  const handleManualSave = async () => {
    if (!activeShopId) return;
    setSaving(true);
    try {
      const payload = {
        shopId: activeShopId,
        verifyToken,
        accessToken,
        appSecret,
        businessAccountId,
        phoneNumberId,
        phoneNumber,
        businessName,
      };
      await whatsappSetupApi.saveSetupInfo(payload);
      Alert.alert("Success", "WhatsApp integration settings saved successfully.");
      await fetchSetup(); 
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleEmbeddedSignup = async () => {
    if (!activeShopId) return;
    
    // Fallback: if user manually pasted the code
    if (oauthCode) {
      return submitOauthCode(oauthCode);
    }

    try {
      // 1. Launch Facebook Embedded Signup Flow
      const authUrl = `https://www.facebook.com/v20.0/dialog/oauth?client_id=${FB_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&config_id=YOUR_CONFIG_ID&state=${activeShopId}`;
      
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
      
      if (result.type === "success" && result.url) {
        const match = result.url.match(/[?&]code=([^&]+)/);
        const code = match ? match[1] : null;
        if (code) {
          await submitOauthCode(code);
        } else {
          Alert.alert("Error", "No authorization code returned");
        }
      } else {
        Alert.alert("Cancelled", "WhatsApp connection was cancelled.");
      }
    } catch (error: any) {
      Alert.alert("Embedded Signup Error", error.message || "Failed to launch Facebook login");
    }
  };

  const submitOauthCode = async (code: string) => {
    setSaving(true);
    try {
      await whatsappSetupApi.fbEmbeddedSignup({ shopId: activeShopId!, code });
      Alert.alert("Success", "WhatsApp Connected successfully via Facebook!");
      await fetchSetup();
      setOauthCode("");
    } catch (error: any) {
      Alert.alert("Error connecting WhatsApp", error.response?.data?.message || error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}><Text>Loading...</Text></View>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex1}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          
          <Section title="Connection Status">
            <View style={styles.statusBox}>
              <Text style={{ color: status === "CONNECTED" ? Colors.success : Colors.danger, fontWeight: "bold", fontSize: 16 }}>
                {status || "DISCONNECTED"}
              </Text>
              {status === "CONNECTED" && businessName ? (
                <Text style={{ marginTop: 5, color: Colors.grey }}>Connected to: {businessName}</Text>
              ) : null}
            </View>
            <View style={styles.webhookUrlBox}>
               <Text style={styles.webhookText}>Webhook URL (for Meta Dashboard):</Text>
               <Text selectable style={styles.webhookValue}>https://your-api-url.com/whatsapp/webhook/{activeShopId}</Text>
            </View>
          </Section>

          <Section title="1-Click Connect (Embedded Signup)">
            <View style={styles.formCard}>
              <Text style={{ marginBottom: 15, color: Colors.grey }}>
                Connect your WhatsApp Business Account instantly using Facebook Embedded Signup.
              </Text>
              <Button 
                mode="contained" 
                onPress={handleEmbeddedSignup} 
                loading={saving && !oauthCode} 
                icon="facebook"
                style={{ backgroundColor: "#1877F2", marginBottom: 15 }}
              >
                Connect with Facebook
              </Button>
              
              <Divider style={{ marginVertical: 15 }} />
              
              <Text style={{ marginBottom: 10, fontSize: 12, color: Colors.grey }}>
                Or, if you already have the OAuth code:
              </Text>
              <TextInput
                mode="outlined"
                label="OAuth Code"
                value={oauthCode}
                onChangeText={setOauthCode}
                style={styles.input}
              />
              <Button mode="outlined" onPress={() => submitOauthCode(oauthCode)} disabled={!oauthCode || saving}>
                Submit Code
              </Button>
            </View>
          </Section>

          <Section title="Manual Configuration">
            <View style={styles.formCard}>
              <Text style={{ marginBottom: 15, color: Colors.grey }}>
                Advanced: Manually enter Meta Cloud API credentials.
              </Text>
              <TextInput
                mode="outlined"
                label="Verify Token (Webhook)"
                value={verifyToken}
                onChangeText={setVerifyToken}
                style={styles.input}
              />
              <TextInput
                mode="outlined"
                label="App Secret"
                value={appSecret}
                onChangeText={setAppSecret}
                secureTextEntry
                style={styles.input}
              />
              <TextInput
                mode="outlined"
                label="Permanent Access Token"
                value={accessToken}
                onChangeText={setAccessToken}
                secureTextEntry
                style={styles.input}
                multiline
                numberOfLines={3}
              />
              <TextInput
                mode="outlined"
                label="WhatsApp Business Account ID"
                value={businessAccountId}
                onChangeText={setBusinessAccountId}
                style={styles.input}
              />
              <TextInput
                mode="outlined"
                label="Phone Number ID"
                value={phoneNumberId}
                onChangeText={setPhoneNumberId}
                style={styles.input}
              />
              <TextInput
                mode="outlined"
                label="Phone Number (Optional)"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                style={styles.input}
              />
              <TextInput
                mode="outlined"
                label="Business Name (Optional)"
                value={businessName}
                onChangeText={setBusinessName}
                style={styles.input}
              />
              <Button mode="contained" onPress={handleManualSave} loading={saving && !oauthCode} style={styles.saveBtn}>
                Save Manual Settings
              </Button>
            </View>
          </Section>

        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  formCard: { backgroundColor: Colors.white, padding: 15, borderRadius: 8, marginHorizontal: 15, marginBottom: 15 },
  input: { marginBottom: 10, backgroundColor: Colors.white },
  saveBtn: { marginTop: 10, backgroundColor: Colors.primary },
  statusBox: { padding: 15, marginHorizontal: 15, backgroundColor: Colors.white, borderRadius: 8, alignItems: "center", marginBottom: 10 },
  webhookUrlBox: { padding: 15, marginHorizontal: 15, backgroundColor: "#f0f0f0", borderRadius: 8, marginBottom: 15 },
  webhookText: { fontSize: 12, color: Colors.grey, marginBottom: 5 },
  webhookValue: { fontSize: 14, fontWeight: "500", color: Colors.primaryDark },
});
