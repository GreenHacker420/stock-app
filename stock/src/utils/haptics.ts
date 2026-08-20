import { Platform } from "react-native";
import {
  impactAsync,
  selectionAsync,
  notificationAsync,
  ImpactFeedbackStyle,
  NotificationFeedbackType,
} from "expo-haptics";

export function triggerLightHaptic() {
  if (Platform.OS === "web") return;
  void impactAsync(ImpactFeedbackStyle.Light).catch(() => {});
}

export function triggerSelectionHaptic() {
  if (Platform.OS === "web") return;
  void selectionAsync().catch(() => {});
}

export function triggerMediumHaptic() {
  if (Platform.OS === "web") return;
  void impactAsync(ImpactFeedbackStyle.Medium).catch(() => {});
}

export function triggerHeavyHaptic() {
  if (Platform.OS === "web") return;
  void impactAsync(ImpactFeedbackStyle.Heavy).catch(() => {});
}

export function triggerRigidHaptic() {
  if (Platform.OS === "web") return;
  void impactAsync(ImpactFeedbackStyle.Rigid).catch(() => {});
}

export function triggerSoftHaptic() {
  if (Platform.OS === "web") return;
  void impactAsync(ImpactFeedbackStyle.Soft).catch(() => {});
}

export function triggerSuccessHaptic() {
  if (Platform.OS === "web") return;
  void notificationAsync(NotificationFeedbackType.Success).catch(() => {});
}

export function triggerWarningHaptic() {
  if (Platform.OS === "web") return;
  void notificationAsync(NotificationFeedbackType.Warning).catch(() => {});
}

export function triggerErrorHaptic() {
  if (Platform.OS === "web") return;
  void notificationAsync(NotificationFeedbackType.Error).catch(() => {});
}
