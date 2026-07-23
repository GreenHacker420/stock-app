import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
} from "react";
import type { WhatsAppCapability } from "../../api/whatsapp.api";

export type WhatsAppScope = {
  shopId: string;
  integrationId: string;
  phoneNumberId?: string;
  capability: WhatsAppCapability;
};

const WhatsAppScopeContext = createContext<WhatsAppScope | null>(null);

export function useWhatsAppScope() {
  const value = useContext(WhatsAppScopeContext);
  if (!value) {
    throw new Error("useWhatsAppScope must be used inside the WhatsApp capability boundary");
  }
  return value;
}

export function WhatsAppScopeProvider({
  children,
  capability,
  shopId,
}: PropsWithChildren<{ capability: WhatsAppCapability; shopId: string }>) {
  const value = useMemo<WhatsAppScope>(() => ({
    shopId,
    integrationId: capability.integrationId!,
    phoneNumberId: capability.phoneNumberId || undefined,
    capability,
  }), [capability, shopId]);
  return (
    <WhatsAppScopeContext.Provider value={value}>
      {children}
    </WhatsAppScopeContext.Provider>
  );
}
