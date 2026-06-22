import React, { useRef, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useJarvisStore, LogEntry } from "../utils/store";
import { COLORS } from "../utils/theme";

const LEVEL_COLOR: Record<string, string> = {
  log:   COLORS.textDim,
  warn:  "#f0a040",
  error: "#f04040",
};

const TAG_COLOR: Record<string, string> = {
  LLM:  "#40a0f0",
  TG:   "#40f0a0",
  STT:  "#a040f0",
  RAM:  "#f0f040",
  TTS:  "#f040a0",
};

const FILTERS = ["ALL", "LLM", "TG", "STT", "RAM", "WARN", "ERR"];

export default function LogsScreen() {
  const router = useRouter();
  const { logs, clearLogs } = useJarvisStore();
  const [filter, setFilter] = useState("ALL");
  const listRef = useRef<FlatList>(null);

  const filtered = filter === "ALL"   ? logs
    : filter === "WARN" ? logs.filter(l => l.level === "warn")
    : filter === "ERR"  ? logs.filter(l => l.level === "error")
    : logs.filter(l => l.tag === filter);

  function fmt(ts: number) {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;
  }

  function renderItem({ item }: { item: LogEntry }) {
    const tagColor  = TAG_COLOR[item.tag] ?? COLORS.textFaint;
    const lvlColor  = LEVEL_COLOR[item.level];
    return (
      <View style={styles.row}>
        <Text style={styles.ts}>{fmt(item.ts)}</Text>
        <Text style={[styles.tag, { color: tagColor }]}>{item.tag.slice(0,6).padEnd(6)}</Text>
        <Text style={[styles.msg, { color: lvlColor }]} numberOfLines={4}>
          {item.msg}
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
          <Text style={styles.backLabel}>BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title}>SYS LOG</Text>
        <TouchableOpacity onPress={clearLogs} style={styles.clearBtn}>
          <Text style={styles.clearLabel}>CLR</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.chip, filter === f && styles.chipActive]}
          >
            <Text style={[styles.chipLabel, filter === f && styles.chipLabelActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.divider} />

      {/* Log list — newest at bottom */}
      <FlatList
        ref={listRef}
        data={filtered}
        keyExtractor={i => String(i.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <Text style={styles.empty}>— no logs yet —</Text>
        }
      />

      {/* Scroll to bottom */}
      <TouchableOpacity
        style={styles.bottomBtn}
        onPress={() => listRef.current?.scrollToEnd({ animated: true })}
      >
        <Text style={styles.bottomLabel}>▼ LATEST</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1, backgroundColor: "#06060b" },
  header:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 },
  backBtn:    { flexDirection: "row", alignItems: "center", gap: 6, width: 60 },
  backIcon:   { fontSize: 16, color: COLORS.accent },
  backLabel:  { fontSize: 8, letterSpacing: 2, color: COLORS.textDim, fontFamily: "monospace" },
  title:      { fontSize: 10, letterSpacing: 5, color: COLORS.accent, fontFamily: "monospace" },
  clearBtn:   { width: 60, alignItems: "flex-end" },
  clearLabel: { fontSize: 8, letterSpacing: 2, color: "#f04040", fontFamily: "monospace" },
  divider:    { height: 1, backgroundColor: COLORS.border },

  filterRow:  { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, paddingVertical: 6, gap: 6 },
  chip:       { paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: COLORS.border, borderRadius: 2 },
  chipActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accentDim },
  chipLabel:  { fontSize: 7, letterSpacing: 2, color: COLORS.textFaint, fontFamily: "monospace" },
  chipLabelActive: { color: COLORS.accent },

  list:       { paddingHorizontal: 8, paddingVertical: 4 },
  row:        { flexDirection: "row", paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.03)", gap: 6 },
  ts:         { fontSize: 8, color: COLORS.textFaint, fontFamily: "monospace", width: 56 },
  tag:        { fontSize: 8, fontFamily: "monospace", width: 46 },
  msg:        { flex: 1, fontSize: 8, fontFamily: "monospace", lineHeight: 12 },

  empty:      { textAlign: "center", color: COLORS.textFaint, fontFamily: "monospace", fontSize: 9, marginTop: 40 },
  bottomBtn:  { padding: 8, alignItems: "center", borderTopWidth: 1, borderTopColor: COLORS.border },
  bottomLabel:{ fontSize: 7, letterSpacing: 3, color: COLORS.accent, fontFamily: "monospace" },
});
