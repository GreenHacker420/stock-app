import { Platform } from "react-native";
import { isAvailableAsync, getItemAsync, setItemAsync, deleteItemAsync } from "expo-secure-store";

const canUseLocalStorage = Platform.OS === "web" && typeof window !== "undefined";

export async function getToken(key: string) {
  if (canUseLocalStorage) {
    return window.localStorage.getItem(key);
  }

  const isAvailable = await isAvailableAsync();
  if (!isAvailable) return null;

  return getItemAsync(key);
}

export async function setToken(key: string, value: string) {
  if (canUseLocalStorage) {
    window.localStorage.setItem(key, value);
    return;
  }

  const isAvailable = await isAvailableAsync();
  if (!isAvailable) return;

  await setItemAsync(key, value);
}

export async function deleteToken(key: string) {
  if (canUseLocalStorage) {
    window.localStorage.removeItem(key);
    return;
  }

  const isAvailable = await isAvailableAsync();
  if (!isAvailable) return;

  await deleteItemAsync(key);
}
