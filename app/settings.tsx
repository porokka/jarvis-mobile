import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { COLORS } from "../utils/theme";

const STORAGE_KEY = "jarvis_settings";

export default function SettingsScreen() {
  const router = useRouter();
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId]     = useState("");
  const [jarvisIp, setJarvisIp] = useState("192.168.1.100");
  const [saved, setSaved]       = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const s = JSON.parse(raw);
          if (s.telegramBotToken) setBotToken(s.telegramBotToken);
          if (s.telegramChatId)   setChatId(s.telegramChatId);
          if (s.jarvisIp)         setJarvisIp(s.jarvisIp);
        }
      } catch {}
    })();
  }, []);

  const handleSave = async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
        telegramBotToken: botToken.trim(),
        telegramChatId:   chatId.trim(),
        jarvisIp:         jarvisIp.trim(),
      }));
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {}
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backIcon}>←</Text>
            <Text style={styles.backLabel}>BACK</Text>
          </TouchableOpacity>
          <Text style={styles.title}>SETTINGS</Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={styles.divider} />

        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

          <Section label="TELEGRAM">
            <Field
              label="MOBILE BOT TOKEN"
              hint="new bot from @BotFather for mobile"
              value={botToken}
              onChangeText={setBotToken}
              placeholder="123456:ABC-DEF..."
              secureTextEntry
            />
            <Field
              label="GROUP CHAT ID"
              hint="shared group with main Jarvis bot (negative number)"
              value={chatId}
              onChangeText={setChatId}
              placeholder="-100123456789"
            />
          </Section>

          <Section label="NETWORK">
            <Field
              label="JARVIS IP"
              hint="desktop Jarvis OS address"
              value={jarvisIp}
              onChangeText={setJarvisIp}
              placeholder="192.168.1.100"
              keyboardType="url"
            />
          </Section>

          <Section label="HOW TO SET UP">
            <View style={styles.helpBox}>
              <Text style={styles.helpText}>1. @BotFather → /newbot → copy token (mobile bot)</Text>
              <Text style={styles.helpText}>2. Create a Telegram group</Text>
              <Text style={styles.helpText}>3. Add mobile bot + main Jarvis bot to the group</Text>
              <Text style={styles.helpText}>4. Send any message in the group</Text>
              <Text style={styles.helpText}>5. Open: api.telegram.org/bot{"{token}"}/getUpdates</Text>
              <Text style={styles.helpText}>6. Find chat.id — it's a negative number like -100...</Text>
              <Text style={styles.helpText}>7. Also add that group chat ID to main Jarvis config</Text>
            </View>
          </Section>

        </ScrollView>

        <View style={styles.divider} />

        <View style={styles.footer}>
          <TouchableOpacity onPress={handleSave} style={styles.saveBtn}>
            <Text style={styles.saveBtnLabel}>
              {saved ? "✓  SAVED" : "SAVE SETTINGS"}
            </Text>
          </TouchableOpacity>
        </View>

      </KeyboardAvoidingView>

      {/* Corner brackets */}
      <View style={[styles.corner, styles.cTL]} />
      <View style={[styles.corner, styles.cTR]} />
      <View style={[styles.corner, styles.cBL]} />
      <View style={[styles.corner, styles.cBR]} />
    </SafeAreaView>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={sectionStyles.wrap}>
      <Text style={sectionStyles.label}>{label}</Text>
      <View style={sectionStyles.box}>{children}</View>
    </View>
  );
}

function Field({
  label, hint, value, onChangeText, placeholder, secureTextEntry, keyboardType,
}: {
  label: string; hint?: string; value: string;
  onChangeText: (v: string) => void; placeholder?: string;
  secureTextEntry?: boolean; keyboardType?: any;
}) {
  return (
    <View style={fieldStyles.wrap}>
      <View style={fieldStyles.labelRow}>
        <Text style={fieldStyles.label}>{label}</Text>
        {hint && <Text style={fieldStyles.hint}>{hint}</Text>}
      </View>
      <TextInput
        style={fieldStyles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textFaint}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  wrap:  { marginBottom: 24 },
  label: { fontSize: 7, letterSpacing: 3, color: COLORS.accent, fontFamily: "monospace", marginBottom: 8, opacity: 0.7 },
  box:   { borderWidth: 1, borderColor: COLORS.border, borderRadius: 2, paddingHorizontal: 12, paddingVertical: 4 },
});

const fieldStyles = StyleSheet.create({
  wrap:     { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 },
  label:    { fontSize: 8, letterSpacing: 2, color: COLORS.textDim, fontFamily: "monospace" },
  hint:     { fontSize: 7, color: COLORS.textFaint, fontFamily: "monospace" },
  input:    { height: 36, backgroundColor: COLORS.surfaceAlt, borderWidth: 1, borderColor: COLORS.border, borderRadius: 2, paddingHorizontal: 10, color: COLORS.text, fontSize: 11, fontFamily: "monospace" },
});

const styles = StyleSheet.create({
  root:      { flex: 1, backgroundColor: COLORS.background },
  header:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  backBtn:   { flexDirection: "row", alignItems: "center", gap: 6, width: 60 },
  backIcon:  { fontSize: 16, color: COLORS.accent },
  backLabel: { fontSize: 8, letterSpacing: 2, color: COLORS.textDim, fontFamily: "monospace" },
  title:     { fontSize: 10, letterSpacing: 5, color: COLORS.accent, fontFamily: "monospace" },
  divider:   { height: 1, backgroundColor: COLORS.border },
  scroll:    { flex: 1 },
  content:   { padding: 20, paddingTop: 24 },
  helpBox:   { paddingVertical: 6, gap: 6 },
  helpText:  { fontSize: 9, color: COLORS.textFaint, fontFamily: "monospace", lineHeight: 16 },
  footer:    { padding: 16 },
  saveBtn:   { borderWidth: 1, borderColor: COLORS.accent, borderRadius: 2, paddingVertical: 14, alignItems: "center", backgroundColor: COLORS.accentDim },
  saveBtnLabel: { fontSize: 9, letterSpacing: 4, color: COLORS.accent, fontFamily: "monospace" },
  corner:    { position: "absolute", width: 12, height: 12 },
  cTL:       { top: 4, left: 4,    borderTopWidth: 1,    borderLeftWidth: 1,   borderColor: "rgba(64,160,240,0.2)" },
  cTR:       { top: 4, right: 4,   borderTopWidth: 1,    borderRightWidth: 1,  borderColor: "rgba(64,160,240,0.2)" },
  cBL:       { bottom: 4, left: 4, borderBottomWidth: 1, borderLeftWidth: 1,   borderColor: "rgba(64,160,240,0.2)" },
  cBR:       { bottom: 4, right: 4,borderBottomWidth: 1, borderRightWidth: 1,  borderColor: "rgba(64,160,240,0.2)" },
});
