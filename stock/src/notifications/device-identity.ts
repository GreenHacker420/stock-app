import * as Crypto from "expo-crypto";
import { getToken, setToken } from "../auth/token-storage";

const INSTALLATION_ID_KEY = "shopcontrol_device_installation_id";

export async function getDeviceInstallationId() {
  const existing = await getToken(INSTALLATION_ID_KEY);
  if (existing) return existing;
  const installationId = `sc-${Crypto.randomUUID()}`;
  await setToken(INSTALLATION_ID_KEY, installationId);
  return installationId;
}
