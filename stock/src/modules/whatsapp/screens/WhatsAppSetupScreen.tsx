import { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, TouchableOpacity } from "react-native";
import { Button, TextInput, Text, Divider, Card, HelperText } from "react-native-paper";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import { useShopStore } from "../../../auth/shop-store";
import { whatsappSetupApi } from "../../../api/whatsapp-setup.api";
import { Screen } from "../../../components/Screen";
import { colors as Colors } from "../../../theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";

WebBrowser.maybeCompleteAuthSession();

export const WhatsAppSetupScreen = () => {
  const activeShopId = useShopStore((state) => state.activeShopId);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"easy" | "developer">("easy");

  // Onboarding Settings (Prefilled or editable)
  const [fbAppId, setFbAppId] = useState(process.env.EXPO_PUBLIC_FACEBOOK_APP_ID || "");
  const [fbConfigId, setFbConfigId] = useState(process.env.EXPO_PUBLIC_FACEBOOK_CONFIG_ID || "");

  // Manual Form State
  const [verifyToken, setVerifyToken] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [status, setStatus] = useState("DISCONNECTED");

  // Embedded Signup State
  const [oauthCode, setOauthCode] = useState("");

  const redirectUri = AuthSession.makeRedirectUri({
    scheme: "shopcontrol"
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
      } else {
        resetFormState();
      }
    } catch (error) {
      console.log("Setup fetch failed, might be new", error);
      resetFormState();
    } finally {
      setLoading(false);
    }
  };

  const resetFormState = () => {
    setVerifyToken("");
    setAccessToken("");
    setAppSecret("");
    setBusinessAccountId("");
    setPhoneNumberId("");
    setPhoneNumber("");
    setBusinessName("");
    setStatus("DISCONNECTED");
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

  const handleDisconnect = async () => {
    if (!activeShopId) return;
    Alert.alert(
      "Disconnect Integration",
      "Are you sure you want to disconnect your WhatsApp Business Account? This will remove credentials and cease incoming webhooks.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            setSaving(true);
            try {
              await whatsappSetupApi.deleteSetupInfo(activeShopId);
              Alert.alert("Disconnected", "WhatsApp integration has been disconnected.");
              await fetchSetup();
            } catch (err: any) {
              Alert.alert("Error", err.message || "Failed to disconnect integration");
            } finally {
              setSaving(false);
            }
          }
        }
      ]
    );
  };

  const handleEmbeddedSignup = async () => {
    if (!activeShopId) return;
    
    const appIdToUse = fbAppId.trim();
    const configIdToUse = fbConfigId.trim();

    if (!appIdToUse || !configIdToUse) {
      Alert.alert("Required Fields", "Please enter both Meta App ID and Configuration ID to initiate onboarding.");
      return;
    }

    if (oauthCode) {
      return submitOauthCode(oauthCode);
    }

    try {
      const authUrl = `https://www.facebook.com/v25.0/dialog/oauth?client_id=${appIdToUse}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&config_id=${configIdToUse}&state=${activeShopId}`;
      
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
      
      if (result.type === "success" && result.url) {
        const match = result.url.match(/[?&]code=([^&]+)/);
        const code = match ? match[1] : null;
        if (code) {
          await submitOauthCode(code);
        } else {
          Alert.alert("Error", "No authorization code returned from Meta");
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
      await whatsappSetupApi.fbEmbeddedSignup({ shopId: activeShopId!, code, redirectUri });
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
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={{ marginTop: 10, color: Colors.textSecondary }}>Fetching Integration Status...</Text>
        </View>
      </Screen>
    );
  }

  const isConnected = status === "CONNECTED";

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex1}>
        {/* Connection Banner */}
        <Card style={[styles.statusCard, isConnected ? styles.cardConnected : styles.cardDisconnected]}>
          <Card.Content style={styles.statusCardContent}>
            <View style={styles.statusHeaderRow}>
              <MaterialCommunityIcons
                name={isConnected ? "check-circle" : "alert-circle"}
                size={36}
                color={isConnected ? Colors.success : "#EF4444"}
              />
              <View style={styles.statusHeaderText}>
                <Text style={styles.statusTitle}>
                  {isConnected ? "WhatsApp Connected" : "WhatsApp Disconnected"}
                </Text>
                <Text style={styles.statusSubtitle}>
                  {isConnected ? `Connected to: ${businessName || "WABA"}` : "Setup your channel integration"}
                </Text>
              </View>
            </View>

            {isConnected && (
              <View style={styles.metaDetailsBox}>
                <Divider style={styles.metaDivider} />
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Phone Number:</Text>
                  <Text style={styles.detailValue}>{phoneNumber || "Not Set"}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>WABA ID:</Text>
                  <Text style={styles.detailValue} numberOfLines={1}>{businessAccountId}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Phone ID:</Text>
                  <Text style={styles.detailValue} numberOfLines={1}>{phoneNumberId}</Text>
                </View>
                
                <Divider style={styles.metaDivider} />
                <View style={styles.webhookUrlBox}>
                  <Text style={styles.webhookText}>Dynamic Webhook Endpoint (for Meta):</Text>
                  <Text selectable style={styles.webhookValue}>
                    https://your-api-url.com/whatsapp/webhook/{activeShopId}
                  </Text>
                </View>

                <Button
                  mode="outlined"
                  onPress={handleDisconnect}
                  loading={saving}
                  style={styles.disconnectBtn}
                  textColor="#DC2626"
                >
                  Disconnect Integration
                </Button>
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Tab Controls (Only show if not connected, or let them view manual configs even if connected) */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeTab === "easy" && styles.activeTab]}
            onPress={() => setActiveTab("easy")}
          >
            <MaterialCommunityIcons
              name="flash"
              size={18}
              color={activeTab === "easy" ? Colors.primary : Colors.textSecondary}
            />
            <Text style={[styles.tabText, activeTab === "easy" && styles.activeTabText]}>
              1-Click Setup
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.tab, activeTab === "developer" && styles.activeTab]}
            onPress={() => setActiveTab("developer")}
          >
            <MaterialCommunityIcons
              name="cog"
              size={18}
              color={activeTab === "developer" ? Colors.primary : Colors.textSecondary}
            />
            <Text style={[styles.tabText, activeTab === "developer" && styles.activeTabText]}>
              Developer Mode
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {activeTab === "easy" ? (
            <View style={styles.tabContent}>
              <Card style={styles.formCard}>
                <Card.Content>
                  <Text style={styles.sectionHeader}>Facebook Embedded Signup</Text>
                  <Text style={styles.sectionSub}>
                    Securely connect your Meta Business Portfolio and launch your WhatsApp Business API.
                  </Text>

                  {/* Step Timeline Indicator */}
                  <View style={styles.timeline}>
                    <View style={styles.timelineItem}>
                      <View style={styles.timelineStep}><Text style={styles.stepNum}>1</Text></View>
                      <Text style={styles.stepText}>Grant permissions via Facebook Auth popup</Text>
                    </View>
                    <View style={styles.timelineLine} />
                    <View style={styles.timelineItem}>
                      <View style={styles.timelineStep}><Text style={styles.stepNum}>2</Text></View>
                      <Text style={styles.stepText}>Generate PIN & register your phone number</Text>
                    </View>
                    <View style={styles.timelineLine} />
                    <View style={styles.timelineItem}>
                      <View style={styles.timelineStep}><Text style={styles.stepNum}>3</Text></View>
                      <Text style={styles.stepText}>Override webhooks and subscribe dynamically</Text>
                    </View>
                  </View>

                  <TextInput
                    mode="outlined"
                    label="Meta App ID"
                    value={fbAppId}
                    onChangeText={setFbAppId}
                    style={styles.input}
                    placeholder="Enter Meta App ID"
                  />
                  <HelperText type="info" visible>
                    Found in Meta Developer Dashboard App Settings
                  </HelperText>

                  <TextInput
                    mode="outlined"
                    label="Meta Configuration ID"
                    value={fbConfigId}
                    onChangeText={setFbConfigId}
                    style={styles.input}
                    placeholder="Enter Login Configuration ID"
                  />
                  <HelperText type="info" visible>
                    Found under WhatsApp → Embedded Onboarding
                  </HelperText>

                  <Button
                    mode="contained"
                    onPress={handleEmbeddedSignup}
                    loading={saving && !oauthCode}
                    icon="facebook"
                    style={styles.fbButton}
                    textColor="#fff"
                  >
                    Onboard with Facebook
                  </Button>

                  <Divider style={styles.divider} />

                  <Text style={styles.helperPasteTitle}>Or, paste authorization code manually:</Text>
                  <TextInput
                    mode="outlined"
                    label="Pasted OAuth Code"
                    value={oauthCode}
                    onChangeText={setOauthCode}
                    style={styles.input}
                    placeholder="e.g. AQB123xyz..."
                  />
                  <Button
                    mode="outlined"
                    onPress={() => submitOauthCode(oauthCode)}
                    disabled={!oauthCode || saving}
                    style={styles.saveManualBtn}
                  >
                    Submit Pasted Code
                  </Button>
                </Card.Content>
              </Card>
            </View>
          ) : (
            <View style={styles.tabContent}>
              <Card style={styles.formCard}>
                <Card.Content>
                  <Text style={styles.sectionHeader}>Manual Meta Credentials</Text>
                  <Text style={styles.sectionSub}>
                    Advanced: Manually override integration credentials and IDs.
                  </Text>

                  <TextInput
                    mode="outlined"
                    label="Webhook Verify Token"
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
                    label="Phone Number (E.164)"
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    style={styles.input}
                    placeholder="919876543210"
                  />
                  <TextInput
                    mode="outlined"
                    label="Business Verified Name"
                    value={businessName}
                    onChangeText={setBusinessName}
                    style={styles.input}
                  />

                  <Button
                    mode="contained"
                    onPress={handleManualSave}
                    loading={saving}
                    style={[styles.fbButton, { backgroundColor: Colors.primary }]}
                  >
                    Save Credentials Override
                  </Button>
                </Card.Content>
              </Card>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  flex1: { flex: 1, backgroundColor: "#F7F7FA" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  scrollContent: { paddingBottom: 40 },
  
  // Status Banner
  statusCard: {
    margin: 15,
    borderRadius: 12,
    borderWidth: 1,
  },
  cardConnected: {
    backgroundColor: "#F0FDF4",
    borderColor: "#DCFCE7",
  },
  cardDisconnected: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FEE2E2",
  },
  statusCardContent: {
    padding: 15,
  },
  statusHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusHeaderText: {
    marginLeft: 15,
    flex: 1,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: Colors.textPrimary,
  },
  statusSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  
  // Meta details list
  metaDetailsBox: {
    marginTop: 10,
  },
  metaDivider: {
    marginVertical: 10,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 4,
  },
  detailLabel: {
    fontWeight: "600",
    color: Colors.textSecondary,
    fontSize: 14,
  },
  detailValue: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
    textAlign: "right",
    paddingLeft: 20,
  },
  webhookUrlBox: {
    padding: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    marginBottom: 10,
  },
  webhookText: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  webhookValue: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.primaryDark,
  },
  disconnectBtn: {
    marginTop: 10,
    borderColor: "#DC2626",
  },

  // Tabs
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  activeTab: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginLeft: 8,
  },
  activeTabText: {
    color: Colors.primary,
  },

  // Form layouts
  tabContent: {
    padding: 15,
  },
  formCard: {
    borderRadius: 12,
    backgroundColor: "#fff",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: "bold",
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  sectionSub: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 20,
  },
  
  // Timeline steps
  timeline: {
    marginBottom: 20,
    paddingLeft: 10,
  },
  timelineItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  timelineStep: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  stepNum: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  stepText: {
    marginLeft: 15,
    fontSize: 14,
    color: Colors.textPrimary,
    flex: 1,
  },
  timelineLine: {
    width: 2,
    height: 15,
    backgroundColor: Colors.borderStrong,
    marginLeft: 11,
    marginVertical: 4,
  },

  input: {
    marginBottom: 4,
    backgroundColor: "#fff",
  },
  fbButton: {
    backgroundColor: "#1877F2",
    marginTop: 15,
    paddingVertical: 4,
  },
  divider: {
    marginVertical: 20,
  },
  helperPasteTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  saveManualBtn: {
    marginTop: 10,
  },
});
