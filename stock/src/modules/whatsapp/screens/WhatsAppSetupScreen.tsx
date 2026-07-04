import { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, TouchableOpacity, DeviceEventEmitter } from "react-native";
import { Button, Text, Divider, Card, HelperText, SegmentedButtons } from "react-native-paper";
import * as WebBrowser from "expo-web-browser";
import * as Clipboard from "expo-clipboard";
import { useShopStore } from "../../../auth/shop-store";
import { WaOnboardingSession, whatsappSetupApi } from "../../../api/whatsapp-setup.api";
import { Screen } from "../../../components/Screen";
import { LoadingState } from "../../../components/feedback/LoadingState";
import { FormTextField } from "../../../components/forms/FormTextField";
import { colors as Colors } from "../../../theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { waColors } from "../whatsapp-ui";
import { sendTestPushNotification } from "../../../api/client";
import { useAuthStore } from "../../../auth/auth-store";

WebBrowser.maybeCompleteAuthSession();

export const WhatsAppSetupScreen = () => {
  const navigation = useNavigation();
  const activeShopId = useShopStore((state) => state.activeShopId);
  const authToken = useAuthStore((state) => state.token);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"easy" | "developer">("easy");

  // Manual Form State
  const [verifyToken, setVerifyToken] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [status, setStatus] = useState("DISCONNECTED");
  const [rotatingKeys, setRotatingKeys] = useState(false);
  const [testingNotification, setTestingNotification] = useState(false);
  const [rsaPublicKey, setRsaPublicKey] = useState("");
  const [qualityRating, setQualityRating] = useState("UNKNOWN");
  const [messagingLimitTier, setMessagingLimitTier] = useState("");
  const [accountStatus, setAccountStatus] = useState("");
  const [accountReviewStatus, setAccountReviewStatus] = useState("");
  const [displayNameStatus, setDisplayNameStatus] = useState("");
  const [lastWebhookAt, setLastWebhookAt] = useState("");
  const [lastManagementEventField, setLastManagementEventField] = useState("");

  const [onboardingMode, setOnboardingMode] = useState<"CLOUD_API" | "COEXISTENCE">("CLOUD_API");
  const [onboardingSession, setOnboardingSession] = useState<WaOnboardingSession | null>(null);

  useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitle: "WhatsApp settings",
      headerStyle: { backgroundColor: waColors.greenDark },
      headerTintColor: "#fff",
      headerShadowVisible: false,
      headerTitleStyle: { fontWeight: "700" },
    });
  }, [navigation]);

  const fetchSetup = async () => {
    if (!activeShopId) return;
    setLoading(true);
    try {
      const res = await whatsappSetupApi.getSetupInfo(activeShopId);
      if (res.data.success && res.data.data) {
        const { data } = res.data;
        setBusinessAccountId(data.businessAccountId || "");
        setPhoneNumberId(data.phoneNumberId || "");
        setPhoneNumber(data.phoneNumber || "");
        setBusinessName(data.businessName || "");
        setStatus(data.status || "DISCONNECTED");
        setRsaPublicKey(data.rsaPublicKey || "");
        setQualityRating(data.qualityRating || "UNKNOWN");
        setMessagingLimitTier(data.messagingLimitTier || "");
        setAccountStatus(data.accountStatus || "");
        setAccountReviewStatus(data.accountReviewStatus || "");
        setDisplayNameStatus(data.displayNameStatus || "");
        setLastWebhookAt(data.lastWebhookAt || "");
        setLastManagementEventField(data.lastManagementEventField || "");
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
    setRsaPublicKey("");
    setQualityRating("UNKNOWN");
    setMessagingLimitTier("");
    setAccountStatus("");
    setAccountReviewStatus("");
    setDisplayNameStatus("");
    setLastWebhookAt("");
    setLastManagementEventField("");
  };


  useEffect(() => {
    fetchSetup();
  }, [activeShopId]);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener("wa:integration_health_updated", fetchSetup);
    return () => subscription.remove();
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

  const handleRotateKeys = async () => {
    if (!activeShopId) return;
    Alert.alert(
      "Rotate E2EE Keys",
      "Are you sure you want to rotate your WhatsApp Flows RSA encryption keys? Already published flows will need to be re-saved/updated with the new public key on Meta Business Manager.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Rotate Keys",
          style: "destructive",
          onPress: async () => {
            setRotatingKeys(true);
            try {
              const res = await whatsappSetupApi.rotateKeys(activeShopId);
              if (res.data.success) {
                Alert.alert("Success", "E2EE RSA Key pair rotated successfully. Please update your Flow configuration on Meta with the new public key.");
                await fetchSetup();
              } else {
                Alert.alert("Error", res.data.message || "Failed to rotate keys");
              }
            } catch (err: any) {
              Alert.alert("Error", err.message || "Failed to rotate keys");
            } finally {
              setRotatingKeys(false);
            }
          }
        }
      ]
    );
  };

  const handleTestNotification = async () => {
    if (!activeShopId || !authToken) return;
    setTestingNotification(true);
    try {
      await sendTestPushNotification(authToken, activeShopId);
      Alert.alert("Notification queued", "Check this device and the in-app notification center.");
    } catch (error: any) {
      Alert.alert("Notification test failed", error.message || "Could not queue the notification");
    } finally {
      setTestingNotification(false);
    }
  };

  const handleEmbeddedSignup = async () => {
    if (!activeShopId) return;
    setSaving(true);
    try {
      const created = await whatsappSetupApi.createOnboardingSession(activeShopId, onboardingMode);
      setOnboardingSession(created.session);
      const result = await WebBrowser.openAuthSessionAsync(created.launchUrl, created.redirectUri);
      if (result.type === "cancel" || result.type === "dismiss") {
        Alert.alert("Signup paused", "You can start a new session when you are ready.");
        return;
      }
      await refreshOnboardingSession(created.session.id, true);
    } catch (error: any) {
      Alert.alert("Embedded Signup Error", error.message || "Failed to launch Facebook login");
    } finally {
      setSaving(false);
    }
  };

  const refreshOnboardingSession = async (sessionId: string, poll = false) => {
    if (!activeShopId) return;
    const attempts = poll ? 15 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const session = await whatsappSetupApi.getOnboardingSession(activeShopId, sessionId);
      setOnboardingSession(session);
      if (session.status === "CONNECTED") {
        await fetchSetup();
        Alert.alert("WhatsApp connected", "The number is registered and subscribed to ShopControl webhooks.");
        return;
      }
      if (["FAILED", "ACTION_REQUIRED", "CANCELLED", "EXPIRED"].includes(session.status)) return;
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  };

  const retryOnboarding = async () => {
    if (!activeShopId || !onboardingSession) return;
    setSaving(true);
    try {
      const session = await whatsappSetupApi.continueOnboardingSession(activeShopId, onboardingSession.id);
      setOnboardingSession(session);
      if (session.status === "CONNECTED") await fetchSetup();
    } catch (error: any) {
      Alert.alert("Retry failed", error.message || "Could not continue onboarding");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <LoadingState label="Fetching Integration Status..." />
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
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Quality:</Text>
                  <Text style={[
                    styles.detailValue,
                    qualityRating === "GREEN" && { color: Colors.success },
                    qualityRating === "YELLOW" && { color: "#B7791F" },
                    qualityRating === "RED" && { color: "#DC2626" },
                  ]}>
                    {qualityRating}
                  </Text>
                </View>
                {!!messagingLimitTier && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Messaging Limit:</Text>
                    <Text style={styles.detailValue}>{messagingLimitTier.replace(/_/g, " ")}</Text>
                  </View>
                )}
                {!!displayNameStatus && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Display Name:</Text>
                    <Text style={styles.detailValue}>{displayNameStatus.replace(/_/g, " ")}</Text>
                  </View>
                )}
                {!!accountReviewStatus && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Account Review:</Text>
                    <Text style={styles.detailValue}>{accountReviewStatus.replace(/_/g, " ")}</Text>
                  </View>
                )}
                {!!accountStatus && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Account Event:</Text>
                    <Text style={styles.detailValue}>{accountStatus.replace(/_/g, " ")}</Text>
                  </View>
                )}
                {!!lastWebhookAt && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Last Webhook:</Text>
                    <Text style={styles.detailValue}>{new Date(lastWebhookAt).toLocaleString()}</Text>
                  </View>
                )}
                {!!lastManagementEventField && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Last Health Event:</Text>
                    <Text style={styles.detailValue}>{lastManagementEventField.replace(/_/g, " ")}</Text>
                  </View>
                )}
                
                <Divider style={styles.metaDivider} />
                <View style={styles.webhookUrlBox}>
                  <Text style={styles.webhookText}>Unified Webhook Endpoint (for Meta):</Text>
                  <Text selectable style={styles.webhookValue}>
                    https://your-api-url.com/whatsapp/webhook
                  </Text>
                </View>
                
                <Divider style={styles.metaDivider} />
                {rsaPublicKey ? (
                  <View style={styles.rsaKeyBox}>
                    <Text style={styles.webhookText}>Flows E2EE Public Key (PEM):</Text>
                    <Text selectable numberOfLines={3} style={styles.rsaKeyValue}>
                      {rsaPublicKey}
                    </Text>
                    <Button
                      mode="outlined"
                      compact
                      style={styles.copyKeyBtn}
                      onPress={async () => {
                        await Clipboard.setStringAsync(rsaPublicKey);
                        Alert.alert("Copied", "Public key copied to clipboard.");
                      }}
                      icon="content-copy"
                    >
                      Copy Public Key
                    </Button>
                  </View>
                ) : (
                  <Text style={[styles.webhookText, { color: "#EF4444", marginVertical: 10 }]}>E2EE Key pair not generated</Text>
                )}

                <Button
                  mode="outlined"
                  onPress={handleRotateKeys}
                  loading={rotatingKeys}
                  style={styles.rotateKeyBtn}
                  textColor={Colors.primary}
                  icon="key"
                >
                  Rotate E2EE Keys
                </Button>

                <Button
                  mode="outlined"
                  icon="bell-ring-outline"
                  loading={testingNotification}
                  disabled={testingNotification}
                  onPress={handleTestNotification}
                  style={styles.rotateKeyBtn}
                >
                  Test notification
                </Button>

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
                      <Text style={styles.stepText}>Select your business and WhatsApp assets</Text>
                    </View>
                    <View style={styles.timelineLine} />
                    <View style={styles.timelineItem}>
                      <View style={styles.timelineStep}><Text style={styles.stepNum}>2</Text></View>
                      <Text style={styles.stepText}>Exchange and validate the business token</Text>
                    </View>
                    <View style={styles.timelineLine} />
                    <View style={styles.timelineItem}>
                      <View style={styles.timelineStep}><Text style={styles.stepNum}>3</Text></View>
                      <Text style={styles.stepText}>Subscribe webhooks and register the number</Text>
                    </View>
                  </View>

                  <Text style={styles.modeLabel}>Number type</Text>
                  <SegmentedButtons
                    value={onboardingMode}
                    onValueChange={(value) => setOnboardingMode(value as "CLOUD_API" | "COEXISTENCE")}
                    buttons={[
                      { value: "CLOUD_API", label: "Cloud API", icon: "cloud-outline" },
                      { value: "COEXISTENCE", label: "Business app", icon: "cellphone-message" },
                    ]}
                  />
                  <HelperText type="info" visible>
                    Business app mode keeps supported WhatsApp Business app messaging and history synchronization.
                  </HelperText>

                  <Button
                    mode="contained"
                    onPress={handleEmbeddedSignup}
                    loading={saving}
                    disabled={saving}
                    icon="facebook"
                    style={styles.fbButton}
                    textColor="#fff"
                  >
                    Continue with Meta
                  </Button>

                  {!!onboardingSession && (
                    <View style={styles.onboardingStatus}>
                      <View style={styles.onboardingStatusHeader}>
                        <Text style={styles.onboardingStatusTitle}>{onboardingSession.status.replace(/_/g, " ")}</Text>
                        <Text style={styles.onboardingStatusMeta}>Attempt {onboardingSession.retryCount}</Text>
                      </View>
                      {!!onboardingSession.completedSteps?.length && (
                        <Text style={styles.onboardingStatusText}>
                          {onboardingSession.completedSteps.join(" · ").replace(/_/g, " ")}
                        </Text>
                      )}
                      {!!onboardingSession.lastErrorMessage && (
                        <Text selectable style={styles.onboardingError}>{onboardingSession.lastErrorMessage}</Text>
                      )}
                      {["FAILED", "ACTION_REQUIRED"].includes(onboardingSession.status) && (
                        <Button
                          mode="outlined"
                          icon="refresh"
                          loading={saving}
                          onPress={retryOnboarding}
                        >
                          Retry setup
                        </Button>
                      )}
                    </View>
                  )}
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

                  <FormTextField
                    label="Webhook Verify Token"
                    value={verifyToken}
                    onChangeText={setVerifyToken}
                    style={styles.input}
                  />
                  <FormTextField
                    label="App Secret"
                    value={appSecret}
                    onChangeText={setAppSecret}
                    secureTextEntry
                    style={styles.input}
                  />
                  <FormTextField
                    label="Permanent Access Token"
                    value={accessToken}
                    onChangeText={setAccessToken}
                    secureTextEntry
                    style={styles.input}
                    multiline
                    numberOfLines={3}
                  />
                  <FormTextField
                    label="WhatsApp Business Account ID"
                    value={businessAccountId}
                    onChangeText={setBusinessAccountId}
                    style={styles.input}
                  />
                  <FormTextField
                    label="Phone Number ID"
                    value={phoneNumberId}
                    onChangeText={setPhoneNumberId}
                    style={styles.input}
                  />
                  <FormTextField
                    label="Phone Number (E.164)"
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    style={styles.input}
                    placeholder="919876543210"
                  />
                  <FormTextField
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
  flex1: { flex: 1, backgroundColor: waColors.surface },
  scrollContent: { paddingBottom: 40 },
  
  // Status Banner
  statusCard: {
    margin: 0,
    borderRadius: 0,
    borderWidth: 0,
    elevation: 0,
  },
  cardConnected: {
    backgroundColor: waColors.greenPale,
    borderColor: waColors.greenPale,
  },
  cardDisconnected: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FEE2E2",
  },
  statusCardContent: {
    padding: 18,
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
    color: waColors.text,
  },
  statusSubtitle: {
    fontSize: 14,
    color: waColors.textSecondary,
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
    backgroundColor: waColors.surface,
    borderWidth: 1,
    borderColor: waColors.border,
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
    color: waColors.greenDark,
  },
  disconnectBtn: {
    marginTop: 10,
    borderColor: "#DC2626",
  },

  // Tabs
  tabBar: {
    flexDirection: "row",
    backgroundColor: waColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: waColors.border,
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
    borderBottomColor: waColors.green,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginLeft: 8,
  },
  activeTabText: {
    color: waColors.green,
  },

  // Form layouts
  tabContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  formCard: {
    borderRadius: 8,
    backgroundColor: waColors.surface,
    elevation: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: waColors.border,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: "bold",
    color: waColors.text,
    marginBottom: 4,
  },
  sectionSub: {
    fontSize: 14,
    color: waColors.textSecondary,
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
    backgroundColor: waColors.green,
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
    color: waColors.text,
    flex: 1,
  },
  timelineLine: {
    width: 2,
    height: 15,
    backgroundColor: waColors.border,
    marginLeft: 11,
    marginVertical: 4,
  },

  input: {
    marginBottom: 4,
    backgroundColor: waColors.surface,
  },
  modeLabel: {
    color: waColors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
  },
  onboardingStatus: {
    gap: 8,
    padding: 12,
    marginTop: 14,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: waColors.border,
    backgroundColor: waColors.surfaceMuted,
  },
  onboardingStatusHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  onboardingStatusTitle: {
    color: waColors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  onboardingStatusMeta: {
    color: waColors.textSecondary,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  onboardingStatusText: {
    color: waColors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  onboardingError: {
    color: "#B42318",
    fontSize: 12,
    lineHeight: 17,
  },
  fbButton: {
    backgroundColor: waColors.green,
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
  rsaKeyBox: {
    padding: 10,
    backgroundColor: waColors.surface,
    borderWidth: 1,
    borderColor: waColors.border,
    borderRadius: 8,
    marginBottom: 10,
  },
  rsaKeyValue: {
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "CourierNewPSMT" : "monospace",
    color: waColors.text,
    marginBottom: 6,
  },
  copyKeyBtn: {
    alignSelf: "flex-start",
    marginTop: 4,
  },
  rotateKeyBtn: {
    marginTop: 5,
    marginBottom: 15,
    borderColor: waColors.green,
  },
});
