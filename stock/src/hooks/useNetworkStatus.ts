import NetInfo, { useNetInfo } from "@react-native-community/netinfo";

export function useNetworkStatus() {
  const netInfo = useNetInfo();
  const isInternetReachable = netInfo.isInternetReachable;
  const isOnline = netInfo.isConnected === true && isInternetReachable !== false;
  return {
    isOnline,
    isInternetReachable,
    isOffline: netInfo.isConnected === false || isInternetReachable === false,
  };
}

export async function getCurrentNetworkStatus() {
  const state = await NetInfo.fetch();
  const isInternetReachable = state.isInternetReachable;
  const isOnline = state.isConnected === true && isInternetReachable !== false;
  return {
    isOnline,
    isInternetReachable,
    isOffline: state.isConnected === false || isInternetReachable === false,
  };
}
