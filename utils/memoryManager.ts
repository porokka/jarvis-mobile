import { NativeModules } from "react-native";

const { MemoryManager } = NativeModules;

const isAvailable = !!MemoryManager;

export interface SystemMemory {
  totalMb: number;
  availMb: number;
  usedMb: number;
  lowMemory: boolean;
}

export interface ProcessInfo {
  packageName: string;
  appName: string;
  memKb: number;
  lastUsed: number;
  needsPermission: boolean;
}

export async function getSystemMemory(): Promise<SystemMemory | null> {
  if (!isAvailable) return null;
  return MemoryManager.getSystemMemory();
}

export async function getTopProcesses(limit = 20): Promise<ProcessInfo[]> {
  if (!isAvailable) return [];
  return MemoryManager.getTopProcesses(limit);
}

export async function killApp(packageName: string): Promise<boolean> {
  if (!isAvailable) return false;
  return MemoryManager.killApp(packageName);
}

export async function hasUsagePermission(): Promise<boolean> {
  if (!isAvailable) return false;
  return MemoryManager.hasUsagePermission();
}

export async function openUsageSettings(): Promise<void> {
  if (!isAvailable) return;
  return MemoryManager.openUsageSettings();
}

export { isAvailable as isMemoryManagerAvailable };
