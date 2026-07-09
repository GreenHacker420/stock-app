import SpInAppUpdates, {
  IAUUpdateKind,
  NeedsUpdateResponse,
} from "sp-react-native-in-app-updates";
import { Platform } from "react-native";
import { logInfo, logError } from "./logger";

export async function checkAppUpdatesBackground() {
  if (__DEV__ || Platform.OS === "web") return;

  const inAppUpdates = new SpInAppUpdates(__DEV__);
  try {
    const result: NeedsUpdateResponse = await inAppUpdates.checkNeedsUpdate();
    if (result.shouldUpdate) {
      logInfo(`In-App Update available: latest store version is ${result.storeVersion}`);
      
      let updateType = IAUUpdateKind.FLEXIBLE
      const other = (result as any).other;
      const priority = other ? other.updatePriority : 0;
      if (Platform.OS === "android" && priority >= 4) {
        updateType = IAUUpdateKind.IMMEDIATE;
      }

      await inAppUpdates.startUpdate({ updateType });
    } else {
      logInfo("In-App Update check: App is up to date");
    }
  } catch (err) {
    logError("Background in-app update check failed", err);
  }
}
