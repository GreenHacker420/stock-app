import { createMMKV } from "react-native-mmkv";
import { Platform } from "react-native";
import * as Sharing from "expo-sharing";
import { File, Directory, Paths } from "expo-file-system";

const logStorage = Platform.OS === "web" ? null : createMMKV({ id: "shop-control-logs" });

export interface LogEntry {
  timestamp: string;
  level: "info" | "error";
  message: string;
}

export function logInfo(message: string) {
  addLog("info", message);
}

export function logError(message: string, error?: unknown) {
  const errMsg = error instanceof Error ? error.message : String(error);
  addLog("error", `${message}${error ? ` | Error: ${errMsg}` : ""}`);
}

function addLog(level: "info" | "error", message: string) {
  const timestamp = new Date().toISOString();
  // Mirror to console in development
  if (__DEV__) {
    console.log(`[${level.toUpperCase()}] ${timestamp} - ${message}`);
  }
  
  if (!logStorage) return;

  try {
    const raw = logStorage.getString("logs") || "[]";
    const logs: LogEntry[] = JSON.parse(raw);
    logs.push({ timestamp, level, message });
    
    // Keep last 100 entries
    if (logs.length > 100) {
      logs.shift();
    }
    
    logStorage.set("logs", JSON.stringify(logs));
  } catch (err) {
    console.error("Logger write error:", err);
  }
}

export function getLogs(): LogEntry[] {
  if (!logStorage) return [];
  try {
    const raw = logStorage.getString("logs") || "[]";
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function clearLogs() {
  if (!logStorage) return;
  logStorage.set("logs", "[]");
}

export async function shareLogs() {
  const logs = getLogs();
  if (logs.length === 0) {
    throw new Error("No diagnostics logs available yet.");
  }

  const logText = logs
    .map((l) => `[${l.level.toUpperCase()}] ${l.timestamp} - ${l.message}`)
    .join("\n");

  const cacheDir = new Directory(Paths.cache, "diagnostics");
  await cacheDir.create({ idempotent: true });
  const localFile = new File(cacheDir, `diagnostics_log_${Date.now()}.txt`);
  localFile.write(logText);

  await Sharing.shareAsync(localFile.uri, {
    mimeType: "text/plain",
    dialogTitle: "ShopControl Diagnostics Log",
  });
}
