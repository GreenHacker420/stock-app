import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, DeviceEventEmitter, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { setStringAsync } from "expo-clipboard";
import { maybeCompleteAuthSession, openAuthSessionAsync } from "expo-web-browser";
import { useNavigation } from "@react-navigation/native";
import { ActivityIndicator, Button, Text } from "react-native-paper";

import { sendTestPushNotification } from "../../../api/client";
import {
  type WaOnboardingSession,
  type WhatsAppIntegrationHealth,
  type WhatsAppSetupInfo,
  whatsappSetupApi,
} from "../../../api/whatsapp-setup.api";
import { useAuthStore } from "../../../auth/auth-store";
import { useShopStore } from "../../../auth/shop-store";
import { Screen } from "../../../components/Screen";
import { FormTextField } from "../../../components/forms/FormTextField";
import { KeyboardAwareScreen } from "../../../components/keyboard/KeyboardAwareScreen";
import { colors, fontSize, fontWeight, radius, spacing } from "../../../theme";
import {
  triggerErrorHaptic,
  triggerLightHaptic,
  triggerSelectionHaptic,
  triggerSuccessHaptic,
} from "../../../utils/haptics";
import { waColors } from "../whatsapp-ui";

maybeCompleteAuthSession();

type OnboardingMode = "CLOUD_API" | "COEXISTENCE";
type BusyAction = "connect" | "retry" | "disconnect" | "manual" | "keys" | "notification" | null;
type ManualCredentials = {
  verifyToken: string;
  accessToken: string;
  appSecret: string;
  businessAccountId: string;
  phoneNumberId: string;
  phoneNumber: string;
  businessName: string;
};

const EMPTY_MANUAL: ManualCredentials = {
  verifyToken: "",
  accessToken: "",
  appSecret: "",
  businessAccountId: "",
  phoneNumberId: "",
  phoneNumber: "",
  businessName: "",
};

const TERMINAL_STATUSES = new Set([
  "CONNECTED",
  "FAILED",
  "ACTION_REQUIRED",
  "CANCELLED",
  "EXPIRED",
]);

const STATUS_LABELS: Record<string, string> = {
  CREATED: "Waiting for Meta",
  AUTHORIZED: "Meta authorized",
  ASSETS_DISCOVERED: "Business selected",
  APP_SUBSCRIBED: "Webhook connected",
  NUMBER_REGISTERED: "Phone registered",
  CONNECTED: "Connected",
  ACTION_REQUIRED: "Action required",
  FAILED: "Connection failed",
  CANCELLED: "Setup cancelled",
  EXPIRED: "Session expired",
};

function cleanStatus(value?: string | null) {
  if (!value) return "Not available";
  const label = value.replace(/_/g, " ").toLowerCase();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatDate(value?: string | null) {
  if (!value) return "Not received yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleString();
}

function SectionCard({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "warning" | "error" }) {
  return <View style={[styles.card, tone === "warning" && styles.warningCard, tone === "error" && styles.errorCard]}>{children}</View>;
}

function DetailRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text selectable numberOfLines={3} style={[styles.detailValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

function ModeOption({
  selected,
  icon,
  title,
  description,
  onPress,
}: {
  selected: boolean;
  icon: string;
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.modeOption, selected && styles.modeOptionSelected, pressed && styles.pressed]}
    >
      <View style={[styles.modeIcon, selected && styles.modeIconSelected]}>
        <MaterialCommunityIcons name={icon as never} size={22} color={selected ? waColors.greenDark : colors.textSecondary} />
      </View>
      <View style={styles.modeCopy}>
        <Text style={styles.modeTitle}>{title}</Text>
        <Text style={styles.modeDescription}>{description}</Text>
      </View>
      <MaterialCommunityIcons name={selected ? "radiobox-marked" : "radiobox-blank"} size={22} color={selected ? waColors.green : colors.textMuted} />
    </Pressable>
  );
}

function ProgressRow({ complete, active, title, description }: { complete: boolean; active: boolean; title: string; description: string }) {
  return (
    <View style={styles.progressRow}>
      <View style={[styles.progressIcon, complete && styles.progressIconDone, active && styles.progressIconActive]}>
        <MaterialCommunityIcons
          name={complete ? "check" : active ? "dots-horizontal" : "circle-small"}
          size={complete ? 15 : 18}
          color={complete ? "#fff" : active ? waColors.greenDark : colors.textMuted}
        />
      </View>
      <View style={styles.progressCopy}>
        <Text style={styles.progressTitle}>{title}</Text>
        <Text style={styles.progressDescription}>{description}</Text>
      </View>
    </View>
  );
}

function SessionProgress({ session }: { session: WaOnboardingSession }) {
  const completed = new Set(session.completedSteps || []);
  const hasError = ["FAILED", "ACTION_REQUIRED", "CANCELLED", "EXPIRED"].includes(session.status);
  const metaDone = completed.has("AUTHORIZED") || completed.has("ASSETS_DISCOVERED");
  const webhookDone = completed.has("APP_SUBSCRIBED");
  const phoneDone = completed.has("NUMBER_REGISTERED") || session.status === "CONNECTED";
  return (
    <SectionCard tone={hasError ? "error" : "default"}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>CONNECTION PROGRESS</Text>
          <Text style={styles.cardTitle}>{STATUS_LABELS[session.status] || cleanStatus(session.status)}</Text>
        </View>
        {!TERMINAL_STATUSES.has(session.status) && <ActivityIndicator size="small" color={waColors.green} />}
      </View>
      <View style={styles.progressList}>
        <ProgressRow complete={metaDone} active={!metaDone && !hasError} title="Authorize with Meta" description="Select your business and allow WhatsApp access." />
        <ProgressRow complete={webhookDone} active={metaDone && !webhookDone && !hasError} title="Connect account" description="Subscribe ShopControl to account events." />
        <ProgressRow
          complete={phoneDone}
          active={webhookDone && !phoneDone && !hasError}
          title="Activate phone"
          description={session.mode === "COEXISTENCE" ? "Link the existing WhatsApp Business app number." : "Verify and register the Cloud API number."}
        />
      </View>
      {!!session.lastErrorMessage && <InlineError message={session.lastErrorMessage} />}
    </SectionCard>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <View style={styles.inlineError}>
      <MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.danger} />
      <Text selectable style={styles.inlineErrorText}>{message}</Text>
    </View>
  );
}

export const WhatsAppSetupScreen = () => {
  const navigation = useNavigation<any>();
  const activeShopId = useShopStore((state) => state.activeShopId);
  const authToken = useAuthStore((state) => state.token);
  const [setup, setSetup] = useState<WhatsAppSetupInfo | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [onboardingMode, setOnboardingMode] = useState<OnboardingMode>("CLOUD_API");
  const [onboardingSession, setOnboardingSession] = useState<WaOnboardingSession | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState<ManualCredentials>(EMPTY_MANUAL);

  const integration = setup?.integration ?? null;
  const isConnected = integration?.status === "CONNECTED";
  const onboardingAvailable = setup?.onboarding.available ?? true;

  useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitle: "WhatsApp",
      headerStyle: { backgroundColor: colors.surface },
      headerTintColor: colors.textPrimary,
      headerShadowVisible: false,
      headerTitleStyle: { fontWeight: fontWeight.semibold },
    });
  }, [navigation]);

  const fetchSetup = useCallback(async (showRefresh = false) => {
    if (!activeShopId) return;
    if (showRefresh) setRefreshing(true);
    setLoadError(null);
    try {
      setSetup(await whatsappSetupApi.getSetupInfo(activeShopId));
    } catch (error: any) {
      setLoadError(error.message || "Could not load WhatsApp settings.");
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [activeShopId]);

  useEffect(() => { void fetchSetup(); }, [fetchSetup]);
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener("wa:integration_health_updated", () => { void fetchSetup(); });
    return () => subscription.remove();
  }, [fetchSetup]);

  const refreshSession = useCallback(async (sessionId: string, poll: boolean) => {
    if (!activeShopId) return null;
    const attempts = poll ? 22 : 1;
    let latest: WaOnboardingSession | null = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      latest = await whatsappSetupApi.getOnboardingSession(activeShopId, sessionId);
      setOnboardingSession(latest);
      if (TERMINAL_STATUSES.has(latest.status)) return latest;
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    return latest;
  }, [activeShopId]);

  const connect = useCallback(async () => {
    if (!activeShopId || busyAction) return;
    setBusyAction("connect");
    setFlowError(null);
    triggerLightHaptic();
    try {
      const created = await whatsappSetupApi.createOnboardingSession(activeShopId, onboardingMode);
      setOnboardingSession(created.session);
      const result = await openAuthSessionAsync(created.launchUrl, created.redirectUri);
      const latest = await refreshSession(created.session.id, result.type === "success");
      if (latest?.status === "CONNECTED") {
        triggerSuccessHaptic();
        await fetchSetup();
      } else if (latest?.lastErrorMessage) {
        triggerErrorHaptic();
        setFlowError(latest.lastErrorMessage);
      } else if (result.type === "cancel" || result.type === "dismiss") {
        setFlowError("Setup was paused before Meta returned to ShopControl. You can continue when ready.");
      } else {
        setFlowError("Meta finished, but the connection is still processing. Pull down to refresh.");
      }
    } catch (error: any) {
      triggerErrorHaptic();
      setFlowError(error.message || "Could not start Meta Embedded Signup.");
    } finally {
      setBusyAction(null);
    }
  }, [activeShopId, busyAction, fetchSetup, onboardingMode, refreshSession]);

  const retry = useCallback(async () => {
    if (!activeShopId || !onboardingSession || busyAction) return;
    const canContinue = onboardingSession.completedSteps?.includes("ASSETS_DISCOVERED")
      && onboardingSession.lastErrorCode !== "PHONE_NUMBER_REQUIRED";
    if (!canContinue) return connect();
    setBusyAction("retry");
    setFlowError(null);
    try {
      const session = await whatsappSetupApi.continueOnboardingSession(activeShopId, onboardingSession.id);
      setOnboardingSession(session);
      if (session.status === "CONNECTED") {
        triggerSuccessHaptic();
        await fetchSetup();
      } else if (session.lastErrorMessage) {
        triggerErrorHaptic();
        setFlowError(session.lastErrorMessage);
      }
    } catch (error: any) {
      triggerErrorHaptic();
      setFlowError(error.message || "Could not continue setup.");
    } finally {
      setBusyAction(null);
    }
  }, [activeShopId, busyAction, connect, fetchSetup, onboardingSession]);

  const disconnect = useCallback(() => {
    if (!activeShopId || busyAction) return;
    Alert.alert("Disconnect WhatsApp?", "ShopControl will stop sending and receiving messages for this shop.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: async () => {
          setBusyAction("disconnect");
          try {
            await whatsappSetupApi.deleteSetupInfo(activeShopId);
            setOnboardingSession(null);
            await fetchSetup();
            triggerSuccessHaptic();
          } catch (error: any) {
            triggerErrorHaptic();
            setFlowError(error.message || "Could not disconnect WhatsApp.");
          } finally {
            setBusyAction(null);
          }
        },
      },
    ]);
  }, [activeShopId, busyAction, fetchSetup]);

  const saveManual = useCallback(async () => {
    if (!activeShopId || busyAction) return;
    setBusyAction("manual");
    setFlowError(null);
    try {
      await whatsappSetupApi.saveSetupInfo({ shopId: activeShopId, ...manual });
      setShowManual(false);
      await fetchSetup();
      triggerSuccessHaptic();
    } catch (error: any) {
      triggerErrorHaptic();
      setFlowError(error.message || "Could not save the recovery credentials.");
    } finally {
      setBusyAction(null);
    }
  }, [activeShopId, busyAction, fetchSetup, manual]);

  const rotateKeys = useCallback(async () => {
    if (!activeShopId || busyAction) return;
    setBusyAction("keys");
    try {
      await whatsappSetupApi.rotateKeys(activeShopId);
      await fetchSetup();
      triggerSuccessHaptic();
    } catch (error: any) {
      triggerErrorHaptic();
      setFlowError(error.message || "Could not rotate the Flow encryption key.");
    } finally {
      setBusyAction(null);
    }
  }, [activeShopId, busyAction, fetchSetup]);

  const testNotification = useCallback(async () => {
    if (!activeShopId || !authToken || busyAction) return;
    setBusyAction("notification");
    try {
      await sendTestPushNotification(authToken, activeShopId);
      triggerSuccessHaptic();
    } catch (error: any) {
      triggerErrorHaptic();
      setFlowError(error.message || "Could not send a test notification.");
    } finally {
      setBusyAction(null);
    }
  }, [activeShopId, authToken, busyAction]);

  const qualityColor = useMemo(() => {
    if (integration?.qualityRating === "GREEN") return colors.success;
    if (integration?.qualityRating === "YELLOW") return colors.warning;
    if (integration?.qualityRating === "RED") return colors.danger;
    return colors.textSecondary;
  }, [integration?.qualityRating]);

  if (initialLoading) return <CenteredState loading message="Checking WhatsApp connection…" />;
  if (!setup && loadError) return <CenteredState error message={loadError} onRetry={() => void fetchSetup()} />;

  return (
    <Screen bg="#F5F7F6" edges={["bottom", "left", "right"]}>
      <KeyboardAwareScreen
        contentInsetAdjustmentBehavior="automatic"
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void fetchSetup(true)} tintColor={waColors.green} />}
      >
        {isConnected && integration ? (
          <ConnectedView
            integration={integration}
            navigation={navigation}
            qualityColor={qualityColor}
            busyAction={busyAction}
            expanded={showAdvanced}
            onToggle={() => { triggerSelectionHaptic(); setShowAdvanced((value) => !value); }}
            onCopyKey={() => integration.rsaPublicKey && void setStringAsync(integration.rsaPublicKey)}
            onRotateKeys={() => void rotateKeys()}
            onTestNotification={() => void testNotification()}
            onDisconnect={disconnect}
          />
        ) : (
          <>
            <View style={styles.hero}>
              <View style={styles.heroIcon}><MaterialCommunityIcons name="whatsapp" size={34} color="#fff" /></View>
              <Text style={styles.heroTitle}>Connect your business WhatsApp</Text>
              <Text style={styles.heroDescription}>Bring conversations, templates and order updates into ShopControl while your business keeps ownership of its WhatsApp account.</Text>
              <View style={styles.trustRow}>
                <View style={styles.trustPill}><MaterialCommunityIcons name="shield-check-outline" size={17} color={waColors.greenDark} /><Text style={styles.trustText}>Secure Meta sign-in</Text></View>
                <View style={styles.trustPill}><MaterialCommunityIcons name="clock-fast" size={17} color={waColors.greenDark} /><Text style={styles.trustText}>About 2 minutes</Text></View>
              </View>
            </View>

            {!onboardingAvailable && (
              <SectionCard tone="warning">
                <View style={styles.noticeRow}>
                  <View style={styles.noticeIcon}><MaterialCommunityIcons name="tools" size={22} color={colors.warning} /></View>
                  <View style={styles.noticeCopy}><Text style={styles.noticeTitle}>Embedded Signup is not ready</Text><Text style={styles.noticeText}>ShopControl’s Meta configuration must be completed before businesses can connect.</Text></View>
                </View>
              </SectionCard>
            )}

            <SectionCard>
              <Text style={styles.eyebrow}>CHOOSE HOW TO CONNECT</Text>
              <Text style={styles.cardTitle}>Which number are you using?</Text>
              <View accessibilityRole="radiogroup" style={styles.modeList}>
                <ModeOption selected={onboardingMode === "CLOUD_API"} icon="cloud-outline" title="New or API-only number" description="Set up a number directly on WhatsApp Cloud API." onPress={() => { triggerSelectionHaptic(); setOnboardingMode("CLOUD_API"); }} />
                <ModeOption selected={onboardingMode === "COEXISTENCE"} icon="cellphone-message" title="Existing WhatsApp Business app" description="Keep using the supported Business app while connecting ShopControl." onPress={() => { triggerSelectionHaptic(); setOnboardingMode("COEXISTENCE"); }} />
              </View>
            </SectionCard>

            {!!onboardingSession && <SessionProgress session={onboardingSession} />}
            {!!flowError && <InlineError message={flowError} />}

            {["FAILED", "ACTION_REQUIRED", "CANCELLED", "EXPIRED"].includes(onboardingSession?.status || "") ? (
              <Button mode="contained" icon="refresh" onPress={() => void retry()} loading={busyAction === "retry" || busyAction === "connect"} disabled={!!busyAction || !onboardingAvailable} buttonColor={waColors.greenDark} contentStyle={styles.primaryButtonContent} style={styles.primaryButton}>
                {onboardingSession?.lastErrorCode === "PHONE_NUMBER_REQUIRED" ? "Choose a phone number" : "Try connection again"}
              </Button>
            ) : (
              <Button mode="contained" icon="facebook" onPress={() => void connect()} loading={busyAction === "connect"} disabled={!!busyAction || !onboardingAvailable} buttonColor="#1877F2" contentStyle={styles.primaryButtonContent} style={styles.primaryButton}>Continue with Meta</Button>
            )}
            <Text style={styles.consentText}>Meta will ask you to select a Business Portfolio, WhatsApp Business Account and phone number. ShopControl never receives your Facebook password.</Text>

            <AdvancedRecovery
              open={showAdvanced}
              showManual={showManual}
              setup={setup}
              manual={manual}
              busyAction={busyAction}
              onToggle={() => { triggerSelectionHaptic(); setShowAdvanced((value) => !value); }}
              onToggleManual={() => setShowManual((value) => !value)}
              onChange={(key, value) => setManual((current) => ({ ...current, [key]: value }))}
              onSave={() => void saveManual()}
            />
          </>
        )}
        {!!loadError && setup && <Text selectable style={styles.staleWarning}>Could not refresh: {loadError}</Text>}
      </KeyboardAwareScreen>
    </Screen>
  );
};

function CenteredState({ loading, error, message, onRetry }: { loading?: boolean; error?: boolean; message: string; onRetry?: () => void }) {
  return (
    <Screen bg="#F5F7F6" edges={["bottom", "left", "right"]}>
      <View style={styles.centerState}>
        {loading ? <ActivityIndicator size="large" color={waColors.green} /> : <View style={styles.errorStateIcon}><MaterialCommunityIcons name="cloud-alert-outline" size={30} color={colors.danger} /></View>}
        {error && <Text style={styles.centerStateTitle}>Couldn’t load WhatsApp</Text>}
        <Text selectable style={styles.centerStateText}>{message}</Text>
        {!!onRetry && <Button mode="contained" onPress={onRetry} buttonColor={waColors.greenDark}>Try again</Button>}
      </View>
    </Screen>
  );
}

function ConnectedView({ integration, navigation, qualityColor, busyAction, expanded, onToggle, onCopyKey, onRotateKeys, onTestNotification, onDisconnect }: {
  integration: WhatsAppIntegrationHealth;
  navigation: any;
  qualityColor: string;
  busyAction: BusyAction;
  expanded: boolean;
  onToggle: () => void;
  onCopyKey: () => void;
  onRotateKeys: () => void;
  onTestNotification: () => void;
  onDisconnect: () => void;
}) {
  const phone = integration.phoneNumber ? `+${integration.phoneNumber.replace(/^\+/, "")}` : "Phone connected";
  return (
    <>
      <View style={styles.connectedHero}>
        <View style={styles.connectedIcon}><MaterialCommunityIcons name="check" size={25} color="#fff" /></View>
        <View style={styles.connectedCopy}><Text style={styles.connectedEyebrow}>CONNECTED</Text><Text style={styles.connectedTitle}>{integration.businessName || "WhatsApp Business"}</Text><Text selectable style={styles.connectedPhone}>{phone}</Text></View>
        <View style={styles.liveBadge}><View style={styles.liveDot} /><Text style={styles.liveText}>Live</Text></View>
      </View>

      <SectionCard>
        <View style={styles.headingRow}>
          <View style={styles.headingCopy}><Text style={styles.eyebrow}>CHANNEL HEALTH</Text><Text style={styles.cardTitle}>Ready for conversations</Text></View>
          <View style={[styles.qualityBadge, { backgroundColor: `${qualityColor}18` }]}><View style={[styles.qualityDot, { backgroundColor: qualityColor }]} /><Text style={[styles.qualityText, { color: qualityColor }]}>{cleanStatus(integration.qualityRating)}</Text></View>
        </View>
        <View style={styles.detailList}>
          <DetailRow label="Display name" value={cleanStatus(integration.displayNameStatus)} />
          <DetailRow label="Messaging limit" value={cleanStatus(integration.messagingLimitTier)} />
          <DetailRow label="Last message event" value={formatDate(integration.lastWebhookAt)} />
        </View>
      </SectionCard>

      <View style={styles.quickActions}>
        <QuickAction icon="message-text-outline" label="Inbox" onPress={() => navigation.navigate("WhatsAppChats")} />
        <QuickAction icon="text-box-outline" label="Templates" onPress={() => navigation.navigate("TemplateLibrary")} />
        <QuickAction icon="call-split" label="Flows" onPress={() => navigation.navigate("FlowLibrary")} />
      </View>

      <Disclosure icon="tune-variant" title="Connection details & tools" subtitle="IDs, encryption keys and diagnostics" open={expanded} onPress={onToggle} />
      {expanded && (
        <SectionCard>
          <View style={styles.detailList}>
            <DetailRow label="WABA ID" value={integration.businessAccountId} />
            <DetailRow label="Phone ID" value={integration.phoneNumberId} />
            <DetailRow label="Account review" value={cleanStatus(integration.accountReviewStatus)} />
            <DetailRow label="Last health event" value={cleanStatus(integration.lastManagementEventField)} />
          </View>
          {!!integration.rsaPublicKey && (
            <View style={styles.keyBox}><View style={styles.keyCopy}><Text style={styles.keyTitle}>Flow encryption key</Text><Text selectable numberOfLines={2} style={styles.keyValue}>{integration.rsaPublicKey}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Copy Flow encryption key" onPress={onCopyKey} style={styles.copyButton}><MaterialCommunityIcons name="content-copy" size={20} color={waColors.greenDark} /></Pressable></View>
          )}
          <View style={styles.toolList}>
            <Button mode="outlined" icon="key-change" onPress={onRotateKeys} loading={busyAction === "keys"} disabled={!!busyAction}>Rotate Flow key</Button>
            <Button mode="outlined" icon="bell-check-outline" onPress={onTestNotification} loading={busyAction === "notification"} disabled={!!busyAction}>Test notification</Button>
            <Button mode="text" icon="link-off" textColor={colors.danger} onPress={onDisconnect} loading={busyAction === "disconnect"} disabled={!!busyAction}>Disconnect WhatsApp</Button>
          </View>
        </SectionCard>
      )}
    </>
  );
}

function QuickAction({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}><View style={styles.quickActionIcon}><MaterialCommunityIcons name={icon as never} size={22} color={waColors.greenDark} /></View><Text style={styles.quickActionText}>{label}</Text></Pressable>;
}

function Disclosure({ icon, title, subtitle, open, onPress }: { icon: string; title: string; subtitle: string; open: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.disclosure, pressed && styles.pressed]}><View style={styles.disclosureIcon}><MaterialCommunityIcons name={icon as never} size={21} color={colors.textSecondary} /></View><View style={styles.disclosureCopy}><Text style={styles.disclosureTitle}>{title}</Text><Text style={styles.disclosureDescription}>{subtitle}</Text></View><MaterialCommunityIcons name={open ? "chevron-up" : "chevron-down"} size={23} color={colors.textMuted} /></Pressable>;
}

function AdvancedRecovery({ open, showManual, setup, manual, busyAction, onToggle, onToggleManual, onChange, onSave }: {
  open: boolean;
  showManual: boolean;
  setup: WhatsAppSetupInfo | null;
  manual: ManualCredentials;
  busyAction: BusyAction;
  onToggle: () => void;
  onToggleManual: () => void;
  onChange: (key: keyof ManualCredentials, value: string) => void;
  onSave: () => void;
}) {
  return (
    <>
      <Disclosure icon="lifebuoy" title="Advanced recovery" subtitle="For administrators and Meta support" open={open} onPress={onToggle} />
      {open && (
        <SectionCard>
          <Text style={styles.eyebrow}>SYSTEM READINESS</Text>
          <View style={styles.detailList}>
            <DetailRow label="Embedded Signup" value={setup?.onboarding.available ? "Ready" : "Configuration required"} color={setup?.onboarding.available ? colors.success : colors.warning} />
            <DetailRow label="Return URL" value={setup?.onboarding.redirectUri || "shopcontrol://whatsapp-onboarding"} />
            {!!setup?.onboarding.missing.length && <DetailRow label="Missing server settings" value={setup.onboarding.missing.join(", ")} />}
          </View>
          <Pressable onPress={onToggleManual} style={({ pressed }) => [styles.manualDisclosure, pressed && styles.pressed]}><Text style={styles.manualDisclosureText}>{showManual ? "Hide manual credentials" : "Use manual credentials"}</Text><MaterialCommunityIcons name={showManual ? "chevron-up" : "chevron-right"} size={20} color={waColors.greenDark} /></Pressable>
          {showManual && (
            <View style={styles.manualForm}>
              <View style={styles.manualWarning}><MaterialCommunityIcons name="shield-alert-outline" size={21} color={colors.warning} /><Text style={styles.manualWarningText}>Recovery only. Embedded Signup is safer and should be used for customer onboarding.</Text></View>
              <FormTextField label="Webhook verify token" value={manual.verifyToken} onChangeText={(value) => onChange("verifyToken", value)} />
              <FormTextField label="App secret" value={manual.appSecret} onChangeText={(value) => onChange("appSecret", value)} secureTextEntry />
              <FormTextField label="Permanent access token" value={manual.accessToken} onChangeText={(value) => onChange("accessToken", value)} secureTextEntry multiline numberOfLines={3} />
              <FormTextField label="WhatsApp Business Account ID" value={manual.businessAccountId} onChangeText={(value) => onChange("businessAccountId", value)} />
              <FormTextField label="Phone number ID" value={manual.phoneNumberId} onChangeText={(value) => onChange("phoneNumberId", value)} />
              <FormTextField label="Phone number" placeholder="919876543210" value={manual.phoneNumber} onChangeText={(value) => onChange("phoneNumber", value)} />
              <FormTextField label="Business verified name" value={manual.businessName} onChangeText={(value) => onChange("businessName", value)} />
              <Button mode="contained" buttonColor={waColors.greenDark} onPress={onSave} loading={busyAction === "manual"} disabled={!!busyAction}>Save recovery connection</Button>
            </View>
          )}
        </SectionCard>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F5F7F6" },
  content: { padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.md },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.md },
  centerStateTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.textPrimary, textAlign: "center" },
  centerStateText: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: "center", lineHeight: 22 },
  errorStateIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.dangerLight, alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, borderCurve: "continuous", padding: spacing.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: "#E2E7E4", gap: spacing.md, boxShadow: "0 2px 12px rgba(17, 24, 39, 0.05)" },
  warningCard: { backgroundColor: "#FFF9ED", borderColor: "#F3D7A0" },
  errorCard: { borderColor: "#F1B8B8" },
  hero: { alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.xl, gap: spacing.md },
  heroIcon: { width: 66, height: 66, borderRadius: 21, borderCurve: "continuous", backgroundColor: waColors.green, alignItems: "center", justifyContent: "center", boxShadow: "0 8px 20px rgba(18, 140, 126, 0.22)" },
  heroTitle: { fontSize: fontSize.xxl, lineHeight: 30, fontWeight: fontWeight.bold, color: colors.textPrimary, textAlign: "center" },
  heroDescription: { fontSize: fontSize.md, lineHeight: 22, color: colors.textSecondary, textAlign: "center" },
  trustRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.sm },
  trustPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#E8F5F0", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full },
  trustText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: waColors.greenDark },
  eyebrow: { fontSize: fontSize.xs, letterSpacing: 1.1, fontWeight: fontWeight.bold, color: waColors.greenDark },
  cardTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary },
  headingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  headingCopy: { flex: 1, gap: spacing.xs },
  noticeRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  noticeIcon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.warningLight, alignItems: "center", justifyContent: "center" },
  noticeCopy: { flex: 1, gap: spacing.xs },
  noticeTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textPrimary },
  noticeText: { fontSize: fontSize.sm, lineHeight: 19, color: colors.textSecondary },
  modeList: { gap: spacing.sm },
  modeOption: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderCurve: "continuous", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  modeOptionSelected: { borderColor: waColors.green, backgroundColor: "#F0FAF6" },
  modeIcon: { width: 42, height: 42, borderRadius: radius.md, borderCurve: "continuous", backgroundColor: colors.surfaceOffset, alignItems: "center", justifyContent: "center" },
  modeIconSelected: { backgroundColor: "#DDF3EA" },
  modeCopy: { flex: 1, gap: 2 },
  modeTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  modeDescription: { fontSize: fontSize.sm, lineHeight: 18, color: colors.textSecondary },
  pressed: { opacity: 0.68 },
  progressList: { gap: spacing.md },
  progressRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  progressIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surfaceOffset, alignItems: "center", justifyContent: "center" },
  progressIconDone: { backgroundColor: waColors.green },
  progressIconActive: { backgroundColor: "#DDF3EA" },
  progressCopy: { flex: 1, gap: 1 },
  progressTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  progressDescription: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 18 },
  inlineError: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.dangerLight },
  inlineErrorText: { flex: 1, fontSize: fontSize.sm, lineHeight: 19, color: "#991B1B" },
  primaryButton: { borderRadius: radius.lg, borderCurve: "continuous" },
  primaryButtonContent: { minHeight: 52 },
  consentText: { paddingHorizontal: spacing.md, fontSize: fontSize.xs, lineHeight: 17, textAlign: "center", color: colors.textMuted },
  disclosure: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderCurve: "continuous", backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  disclosureIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceOffset, alignItems: "center", justifyContent: "center" },
  disclosureCopy: { flex: 1, gap: 2 },
  disclosureTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  disclosureDescription: { fontSize: fontSize.sm, color: colors.textSecondary },
  detailList: { gap: spacing.sm },
  detailRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.lg, paddingVertical: spacing.xs },
  detailLabel: { flex: 1, fontSize: fontSize.sm, color: colors.textSecondary },
  detailValue: { flex: 1.45, fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary, textAlign: "right", fontVariant: ["tabular-nums"] },
  connectedHero: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, borderRadius: radius.xl, borderCurve: "continuous", backgroundColor: waColors.greenDark, boxShadow: "0 8px 24px rgba(7, 94, 84, 0.22)" },
  connectedIcon: { width: 50, height: 50, borderRadius: 17, borderCurve: "continuous", backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  connectedCopy: { flex: 1, gap: 2 },
  connectedEyebrow: { fontSize: fontSize.xs, letterSpacing: 1.1, fontWeight: fontWeight.bold, color: "#A7F3D0" },
  connectedTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: "#fff" },
  connectedPhone: { fontSize: fontSize.sm, color: "#D1FAE5", fontVariant: ["tabular-nums"] },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.14)", paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.full },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#86EFAC" },
  liveText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: "#fff" },
  qualityBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.full },
  qualityDot: { width: 7, height: 7, borderRadius: 4 },
  qualityText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold },
  quickActions: { flexDirection: "row", gap: spacing.sm },
  quickAction: { flex: 1, alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md, borderRadius: radius.lg, borderCurve: "continuous", backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  quickActionIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#E8F5F0", alignItems: "center", justifyContent: "center" },
  quickActionText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  keyBox: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceOffset },
  keyCopy: { flex: 1, gap: spacing.xs },
  keyTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary },
  keyValue: { fontSize: fontSize.xs, color: colors.textSecondary, fontFamily: "monospace" },
  copyButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#DDF3EA", alignItems: "center", justifyContent: "center" },
  toolList: { gap: spacing.sm },
  manualDisclosure: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm },
  manualDisclosureText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: waColors.greenDark },
  manualForm: { gap: spacing.md },
  manualWarning: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.warningLight },
  manualWarningText: { flex: 1, fontSize: fontSize.sm, lineHeight: 19, color: "#854D0E" },
  staleWarning: { fontSize: fontSize.xs, color: colors.warning, textAlign: "center" },
});
