import { useEffect, type ComponentType } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { fetchWhatsAppCapability } from "../../api/whatsapp.api";
import { useAuthStore } from "../../auth/auth-store";
import { useShopStore } from "../../auth/shop-store";
import { queryKeys } from "../../hooks/query-keys";
import { setWhatsAppRuntimeConfig } from "./whatsapp-runtime-config";

type RouteProps = {
  route?: {
    params?: {
      shopId?: string;
      integrationId?: string;
    };
  };
};

export function whatsappCapabilityScreen<TProps extends RouteProps>(Component: ComponentType<TProps>) {
  return function WhatsAppCapabilityScreen(props: TProps) {
    const token = useAuthStore((state) => state.token);
    const userId = useAuthStore((state) => state.user?.id);
    const activeShopId = useShopStore((state) => state.activeShopId);
    const setActiveShopId = useShopStore((state) => state.setActiveShopId);
    const requestedShopId = props.route?.params?.shopId || activeShopId;
    const requestedIntegrationId = props.route?.params?.integrationId;

    const capability = useQuery({
      queryKey: queryKeys.whatsapp.capability(requestedShopId || "missing"),
      enabled: Boolean(token && requestedShopId),
      queryFn: () => fetchWhatsAppCapability(token!, requestedShopId!),
      staleTime: 60_000,
      retry: false,
    });

    const allowed = Boolean(
      requestedShopId
      && capability.data?.enabled
      && capability.data.integrationId
      && (!requestedIntegrationId || requestedIntegrationId === capability.data.integrationId),
    );

    useEffect(() => {
      if (!allowed || !requestedShopId) return;
      setWhatsAppRuntimeConfig(capability.data?.runtimeConfig);
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

    if (capability.isPending) {
      return (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.message}>Checking WhatsApp access…</Text>
        </View>
      );
    }

    if (!allowed) {
      return (
        <View style={styles.center}>
          <Text style={styles.title}>WhatsApp unavailable</Text>
          <Text style={styles.message}>
            This integration is disabled or you no longer have access to it.
          </Text>
        </View>
      );
    }

    if (requestedShopId !== activeShopId) {
      return (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.message}>Opening the authorized shop…</Text>
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
    return <Component {...gatedProps} />;
  };
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#f8fafc",
  },
  title: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "700",
  },
  message: {
    marginTop: 8,
    color: "#64748b",
    textAlign: "center",
  },
});
