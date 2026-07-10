import { create } from "zustand";

interface NetworkState {
  isServerReachable: boolean;
  setServerReachable: (reachable: boolean) => void;
}

export const useNetworkStore = create<NetworkState>((set) => ({
  isServerReachable: true,
  setServerReachable: (reachable) => set({ isServerReachable: reachable }),
}));
