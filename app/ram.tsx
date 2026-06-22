import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from "react-native";
import { router } from "expo-router";
import {
  getSystemMemory, getTopProcesses, killApp,
  hasUsagePermission, openUsageSettings,
  isMemoryManagerAvailable,
  type SystemMemory, type ProcessInfo,
} from "../utils/memoryManager";
import {
  getKillList, addToKillList, removeFromKillList, type KillEntry,
} from "../utils/db";

const C = {
  bg: "#0a0a0a", surface: "#111", border: "#1a3a1a",
  green: "#40f080", red: "#f04040", yellow: "#f0c040",
  dim: "#446644", text: "#c0e0c0", muted: "#557755",
};


export default function RamScreen() {
  const [sysMem, setSysMem]         = useState<SystemMemory | null>(null);
  const [procs, setProcs]           = useState<ProcessInfo[]>([]);
  const [killList, setKillList]     = useState<KillEntry[]>([]);
  const [loading, setLoading]       = useState(true);
  const [killing, setKilling]       = useState<string | null>(null);
  const [hasPerm, setHasPerm]       = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [mem, ps, kl, perm] = await Promise.all([
        getSystemMemory(),
        getTopProcesses(20),
        getKillList(),
        hasUsagePermission(),
      ]);
      setSysMem(mem);
      setProcs(ps);
      setKillList(kl);
      setHasPerm(perm);
    } catch (e) {
      console.warn("[RAM]", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, []);

  const kill = useCallback(async (pkg: string, name: string) => {
    setKilling(pkg);
    try {
      await killApp(pkg);
      await refresh();
    } finally {
      setKilling(null);
    }
  }, [refresh]);

  const blacklist = useCallback(async (pkg: string, name: string) => {
    await addToKillList(pkg, name);
    await killApp(pkg);
    setKillList(await getKillList());
    await refresh();
  }, [refresh]);

  const unblacklist = useCallback(async (pkg: string) => {
    await removeFromKillList(pkg);
    setKillList(await getKillList());
  }, []);

  const killAll = useCallback(async () => {
    const list = await getKillList();
    if (list.length === 0) {
      Alert.alert("Kill list is empty", "Add apps to the kill list first.");
      return;
    }
    for (const entry of list) {
      await killApp(entry.package_name).catch(() => {});
    }
    await refresh();
  }, [refresh]);

  if (!isMemoryManagerAvailable) {
    return (
      <View style={s.root}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.back}>
            <Text style={s.backTxt}>← BACK</Text>
          </TouchableOpacity>
          <Text style={s.title}>RAM MONITOR</Text>
          <View style={s.back} />
        </View>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
          <Text style={{ color: C.yellow, fontFamily: "monospace", fontSize: 13, fontWeight: "bold", marginBottom: 12 }}>
            REBUILD REQUIRED
          </Text>
          <Text style={{ color: C.muted, fontFamily: "monospace", fontSize: 11, textAlign: "center", lineHeight: 18 }}>
            The MemoryManager native module was added after the last build.{"\n\n"}
            Run:{"\n"}
            npx expo run:android --device{"\n\n"}
            Metro hot-reload cannot load new native modules.
          </Text>
        </View>
      </View>
    );
  }

  const usedPct = sysMem ? (sysMem.usedMb / sysMem.totalMb) * 100 : 0;
  const barColor = usedPct > 85 ? C.red : usedPct > 65 ? C.yellow : C.green;
  const blacklisted = new Set(killList.map(k => k.package_name));

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Text style={s.backTxt}>← BACK</Text>
        </TouchableOpacity>
        <Text style={s.title}>RAM MONITOR</Text>
        <TouchableOpacity onPress={refresh} style={s.back}>
          <Text style={s.backTxt}>REFRESH</Text>
        </TouchableOpacity>
      </View>

      {/* System memory bar */}
      {sysMem && (
        <View style={s.memBlock}>
          <View style={s.memRow}>
            <Text style={s.memLabel}>USED</Text>
            <Text style={[s.memVal, { color: barColor }]}>
              {sysMem.usedMb.toFixed(0)} MB
            </Text>
            <Text style={s.memLabel}>FREE</Text>
            <Text style={[s.memVal, { color: C.green }]}>
              {sysMem.availMb.toFixed(0)} MB
            </Text>
            <Text style={s.memLabel}>TOTAL</Text>
            <Text style={s.memVal}>{sysMem.totalMb.toFixed(0)} MB</Text>
          </View>
          <View style={s.barTrack}>
            <View style={[s.barFill, { width: `${usedPct.toFixed(1)}%` as any, backgroundColor: barColor }]} />
          </View>
          {sysMem.lowMemory && (
            <Text style={s.lowMem}>⚠ LOW MEMORY</Text>
          )}
        </View>
      )}

      {/* Kill list summary */}
      {killList.length > 0 && (
        <View style={s.killListBar}>
          <Text style={s.killListTxt}>
            AUTO-KILL ({killList.length}): {killList.map(k => k.app_name).join(", ")}
          </Text>
          <TouchableOpacity onPress={killAll} style={s.killAllBtn}>
            <Text style={s.killAllTxt}>KILL ALL NOW</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Process list */}
      {loading ? (
        <ActivityIndicator color={C.green} style={{ marginTop: 40 }} />
      ) : procs.length === 0 ? (
        <Text style={s.empty}>No apps found.</Text>
      ) : (
        <FlatList
          data={procs}
          keyExtractor={p => p.packageName}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListHeaderComponent={hasPerm === false ? (
            <TouchableOpacity style={s.permBanner} onPress={() => openUsageSettings().then(refresh)}>
              <Text style={s.permTitle}>⚠ USAGE ACCESS NOT GRANTED</Text>
              <Text style={s.permSub}>
                Showing installed apps — no "last used" data.{"\n"}
                Tap here → enable Jarvis in Usage access → REFRESH.
              </Text>
            </TouchableOpacity>
          ) : null}
          renderItem={({ item, index }) => {
            const isBlacklisted = blacklisted.has(item.packageName);
            const isKilling = killing === item.packageName;
            const lastUsedAgo = item.lastUsed
              ? Math.round((Date.now() - item.lastUsed) / 60000)
              : null;
            const lastUsedTxt = lastUsedAgo === null ? "?" :
              lastUsedAgo < 60 ? `${lastUsedAgo}m ago` :
              lastUsedAgo < 1440 ? `${Math.round(lastUsedAgo / 60)}h ago` : "1d+ ago";

            return (
              <View style={[s.row, isBlacklisted && s.rowBlacklisted]}>
                <Text style={s.rank}>#{index + 1}</Text>
                <View style={s.rowInfo}>
                  <Text style={s.appName} numberOfLines={1}>{item.appName}</Text>
                  <Text style={s.pkgName} numberOfLines={1}>{item.packageName}</Text>
                </View>
                <Text style={s.mem}>{lastUsedTxt}</Text>
                <View style={s.actions}>
                  <TouchableOpacity
                    style={[s.btn, s.btnKill]}
                    onPress={() => kill(item.packageName, item.appName)}
                    disabled={isKilling}
                  >
                    <Text style={s.btnTxt}>{isKilling ? "…" : "KILL"}</Text>
                  </TouchableOpacity>
                  {isBlacklisted ? (
                    <TouchableOpacity
                      style={[s.btn, s.btnUnlist]}
                      onPress={() => unblacklist(item.packageName)}
                    >
                      <Text style={s.btnTxt}>–LIST</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[s.btn, s.btnList]}
                      onPress={() => blacklist(item.packageName, item.appName)}
                    >
                      <Text style={s.btnTxt}>+LIST</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root:            { flex: 1, backgroundColor: C.bg },
  header:          { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  back:            { padding: 4 },
  backTxt:         { color: C.dim, fontFamily: "monospace", fontSize: 12 },
  title:           { color: C.green, fontFamily: "monospace", fontSize: 14, fontWeight: "bold", letterSpacing: 3 },
  memBlock:        { margin: 12, padding: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 4 },
  memRow:          { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  memLabel:        { color: C.muted, fontFamily: "monospace", fontSize: 10 },
  memVal:          { color: C.text, fontFamily: "monospace", fontSize: 13, fontWeight: "bold", marginRight: 8 },
  barTrack:        { height: 6, backgroundColor: "#1a2a1a", borderRadius: 3, overflow: "hidden" },
  barFill:         { height: "100%", borderRadius: 3 },
  lowMem:          { color: C.red, fontFamily: "monospace", fontSize: 11, marginTop: 6 },
  killListBar:     { marginHorizontal: 12, marginBottom: 4, padding: 10, backgroundColor: "#1a1000", borderWidth: 1, borderColor: "#3a2a00", borderRadius: 4, flexDirection: "row", alignItems: "center", gap: 8 },
  killListTxt:     { flex: 1, color: C.yellow, fontFamily: "monospace", fontSize: 10 },
  killAllBtn:      { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: "#3a1000", borderWidth: 1, borderColor: C.red, borderRadius: 3 },
  killAllTxt:      { color: C.red, fontFamily: "monospace", fontSize: 11, fontWeight: "bold" },
  permBanner:      { margin: 12, padding: 12, backgroundColor: "#0d0a00", borderWidth: 1, borderColor: C.yellow, borderRadius: 4 },
  permTitle:       { color: C.yellow, fontFamily: "monospace", fontSize: 12, fontWeight: "bold", marginBottom: 4 },
  permSub:         { color: C.muted, fontFamily: "monospace", fontSize: 10, lineHeight: 16 },
  empty:           { color: C.muted, fontFamily: "monospace", fontSize: 12, textAlign: "center", marginTop: 40, lineHeight: 20 },
  row:             { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#111" },
  rowBlacklisted:  { backgroundColor: "#0d0a00" },
  rank:            { color: C.dim, fontFamily: "monospace", fontSize: 11, width: 28 },
  rowInfo:         { flex: 1, marginRight: 8 },
  appName:         { color: C.text, fontFamily: "monospace", fontSize: 12 },
  pkgName:         { color: C.muted, fontFamily: "monospace", fontSize: 9, marginTop: 1 },
  mem:             { fontFamily: "monospace", fontSize: 12, width: 60, textAlign: "right", marginRight: 8 },
  actions:         { flexDirection: "row", gap: 6 },
  btn:             { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 3, borderWidth: 1 },
  btnKill:         { borderColor: C.red, backgroundColor: "#1a0000" },
  btnList:         { borderColor: C.dim, backgroundColor: "#0d1a0d" },
  btnUnlist:       { borderColor: C.yellow, backgroundColor: "#1a1000" },
  btnTxt:          { color: C.text, fontFamily: "monospace", fontSize: 10, fontWeight: "bold" },
});
