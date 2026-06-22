import { useEffect } from "react";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { getKillList } from "../utils/db";
import { killApp } from "../utils/memoryManager";
import { useJarvisStore } from "../utils/store";

// Patch console to capture logs into the store for the in-app log screen.
// Called once at module load, before any components mount.
const _origLog   = console.log.bind(console);
const _origWarn  = console.warn.bind(console);
const _origError = console.error.bind(console);

function patchConsole() {
  function capture(level: "log" | "warn" | "error", args: unknown[]) {
    const raw = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    const tagMatch = raw.match(/^\[([A-Z0-9_]+)\]/);
    const tag = tagMatch ? tagMatch[1] : level.toUpperCase();
    useJarvisStore.getState().addLog({ level, tag, msg: raw, ts: Date.now() });
  }
  console.log   = (...a) => { _origLog(...a);   capture("log",   a); };
  console.warn  = (...a) => { _origWarn(...a);  capture("warn",  a); };
  console.error = (...a) => { _origError(...a); capture("error", a); };
}
patchConsole();

async function runAutoKill() {
  try {
    const list = await getKillList();
    for (const entry of list) {
      await killApp(entry.package_name).catch(() => {});
    }
    if (list.length > 0) {
      console.log(`[RAM] Auto-killed ${list.length} apps on startup`);
    }
  } catch (e) {
    console.warn("[RAM] Auto-kill failed:", e);
  }
}

export default function RootLayout() {
  useEffect(() => { runAutoKill(); }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#06060b" }}>
      <StatusBar style="light" backgroundColor="#06060b" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#06060b" },
          animation: "none",
        }}
      />
    </GestureHandlerRootView>
  );
}
