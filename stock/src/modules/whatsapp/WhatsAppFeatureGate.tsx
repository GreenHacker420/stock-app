import {
  useEffect,
  type ComponentType,
} from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchWhatsAppCapability,
  type WhatsAppCapability,
} from "../../api/whatsapp.api";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { queryKeys } from "../../hooks/query-keys";
import { setWhatsAppRuntimeConfig } from "./whatsapp-runtime-config";
import { waColors } from "./whatsapp-ui";
import { WhatsAppPendingOperationSync } from "./components/WhatsAppPendingOperationSync";
import { WhatsAppScopeProvider } from "./whatsapp-scope";
import { whatsappDb } from "./services/whatsapp-db";
import { markWhatsAppOpenMeasurement } from "./whatsapp-open-performance";

type RouteProps = {
  route?: {
    params?: {
      shopId?: string;
      integrationId?: string;
      conversationId?: string;
      conversation?: {
        id: string;
      };
    };
  };
};

type CapabilityOptions = {
  requireConnected?: boolean;
};

export function whatsappCapabilityScreen<TProps extends RouteProps>(
  Component: ComponentType<TProps>,
  options: CapabilityOptions = {},
) {
  const requireConnected = options.requireConnected ?? true;
  return function WhatsAppCapabilityScreen(props: TProps) {
    const navigation = useNavigation<any>();
    const queryClient = useQueryClient();
    const token = useAuthStore((state) => state.token);
    const userId = useAuthStore((state) => state.user?.id);
    const role = useAuthStore((state) => state.user?.role);
    const activeShopId = useShopStore((state) => state.activeShopId);
    const setActiveShopId = useShopStore((state) => state.setActiveShopId);
    const requestedShopId = props.route?.params?.shopId || activeShopId;
    const requestedIntegrationId = props.route?.params?.integrationId;
    const requestedConversationId = props.route?.params?.conversationId;
    const internalConversation =
      props.route?.params?.conversation?.id === requestedConversationId;

    const capability = useQuery({
      queryKey: queryKeys.whatsapp.capability(
        requestedShopId || "missing",
        requestedIntegrationId,
        requestedConversationId,
      ),
      enabled: Boolean(token && requestedShopId),
      queryFn: () => fetchWhatsAppCapability(token!, requestedShopId!, {
        integrationId: requestedIntegrationId,
        conversationId: requestedConversationId,
      }),
      placeholderData: (previousData) => {
        if (previousData) return previousData;
        const fast = whatsappDb.getFastCapability(requestedShopId);
        if (fast) return fast;
        if (!internalConversation || !requestedShopId) return undefined;
        const candidates = queryClient.getQueriesData<WhatsAppCapability>({
          queryKey: ["whatsapp", "capability", requestedShopId],
        });
        return candidates
          .map(([, data]) => data)
          .find((data) => (
            data?.enabled
            && Boolean(data.integrationId)
            && (!requestedIntegrationId || data.integrationId === requestedIntegrationId)
          ));
      },
      staleTime: 5 * 60 * 1000,
      retry: false,
    });

    const routeScopeValid = Boolean(
      requestedShopId
      && (!requestedIntegrationId || requestedIntegrationId === capability.data?.integrationId),
    );
    const connectedScope = Boolean(capability.data?.enabled && capability.data.integrationId);
    const allowed = routeScopeValid && (!requireConnected || connectedScope);

    useEffect(() => {
      if (!requestedConversationId || capability.isPending) return;
      markWhatsAppOpenMeasurement(
        requestedConversationId,
        "capability-ready",
        `placeholder=${capability.isPlaceholderData}`,
      );
    }, [
      capability.isPending,
      capability.isPlaceholderData,
      requestedConversationId,
    ]);

    useEffect(() => {
      if (!allowed || !requestedShopId) return;
      if (capability.data) {
        whatsappDb.saveFastCapability(requestedShopId, capability.data);
      }
      setWhatsAppRuntimeConfig(capability.data?.runtimeConfig);
      if (capability.data?.runtimeConfig.retention) {
        void (async () => {
          try {
            await whatsappDb.cleanup(capability.data.runtimeConfig.retention);
            await whatsappDb.supportsFts5();
          } catch {
            // The server remains authoritative when the optional local cache is unavailable.
          }
        })();
      }
      if (requestedShopId !== activeShopId) {
        setActiveShopId(requestedShopId, userId);
      }
    }, [
      activeShopId,
      allowed,
      capability.data?.runtimeConfig,
      requestedShopId,
      setActiveShopId,
      userId,
    ]);

    if (capability.isPending || (allowed && requestedShopId !== activeShopId)) {
      return (
        <View style={styles.center}>
          <View style={styles.loadingMark}>
            <MaterialCommunityIcons name="whatsapp" size={34} color="#fff" />
          </View>
          <ActivityIndicator color={waColors.green} />
          <Text style={styles.message}>
            {capability.isPending ? "Opening your WhatsApp workspace…" : "Switching to the authorized shop…"}
          </Text>
        </View>
      );
    }

    if (capability.isError) {
      return (
        <View style={styles.center}>
          <View style={[styles.stateIcon, styles.errorIcon]}>
            <MaterialCommunityIcons name="wifi-alert" size={30} color="#b42318" />
          </View>
          <Text style={styles.title}>Couldn’t open WhatsApp</Text>
          <Text style={styles.message}>
            Check your connection and try again. Your conversations are safe.
          </Text>
          <Pressable style={styles.primaryButton} onPress={() => capability.refetch()}>
            <Text style={styles.primaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      );
    }

    if (!allowed) {
      const canConfigure = role === "OWNER" && Boolean(requestedShopId);
      return (
        <View style={styles.center}>
          <View style={styles.stateIcon}>
            <MaterialCommunityIcons name="whatsapp" size={32} color={waColors.green} />
          </View>
          <Text style={styles.title}>
            {capability.data?.integrationId ? "Finish connecting WhatsApp" : "WhatsApp isn’t connected"}
          </Text>
          <Text style={styles.message}>
            {canConfigure
              ? "Connect your business number to start and manage customer conversations here."
              : "Ask the shop owner to connect the business WhatsApp number."}
          </Text>
          {canConfigure && (
            <Pressable
              style={styles.primaryButton}
              onPress={() => navigation.navigate("WhatsAppSetup", { shopId: requestedShopId })}
            >
              <MaterialCommunityIcons name="link-variant" size={19} color="#fff" />
              <Text style={styles.primaryButtonText}>Connect WhatsApp</Text>
            </Pressable>
          )}
        </View>
      );
    }

    const gatedProps = {
      ...props,
      route: {
        ...props.route,
        params: {
          ...props.route?.params,
          shopId: requestedShopId,
          integrationId: capability.data!.integrationId!,
          phoneNumberId: capability.data!.phoneNumberId || undefined,
        },
      },
    } as TProps;
    if (!capability.data!.integrationId) {
      return <Component {...gatedProps} />;
    }
    return (
      <WhatsAppScopeProvider capability={capability.data!} shopId={requestedShopId!}>
        <WhatsAppPendingOperationSync />
        <Component {...gatedProps} />
      </WhatsAppScopeProvider>
    );
  };
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
    backgroundColor: "#f7faf9",
  },
  title: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "800",
  },
  message: {
    color: "#64748b",
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 320,
  },
  loadingMark: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: waColors.green,
  },
  stateIcon: {
    width: 68,
    height: 68,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#dcfce7",
  },
  errorIcon: {
    backgroundColor: "#fee4e2",
  },
  primaryButton: {
    minHeight: 48,
    marginTop: 8,
    paddingHorizontal: 22,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: waColors.green,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
});
