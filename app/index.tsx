import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Pressable, ActivityIndicator,
  KeyboardAvoidingView, Platform, Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useKeepAwake } from "expo-keep-awake";

import { useJarvisStore } from "../utils/store";
import { useJarvisWs } from "../hooks/useJarvisWs";
import { useLocalModel } from "../hooks/useLocalModel";
import { useAudio } from "../hooks/useAudio";
import { COLORS, STATE_COLORS, hud } from "../utils/theme";
import { LatticeFaceRN } from "../components/LatticeFaceRN";
import { WaveformBars } from "../components/WaveformBars";

const { width: SW, height: SH } = Dimensions.get("window");
const FACE_SIZE = Math.min(SW * 0.72, 280);

const STATE_LABEL: Record<string, string> = {
  standby: "STANDBY",
  listening: "LISTENING",
  thinking: "PROCESSING",
  speaking: "SPEAKING",
};

export default function JarvisScreen() {
  useKeepAwake();

  const {
    state, emotion, output, messages, wsConnected,
    localModelLoaded, localModelProgress, muted,
    setState, setOutput, addMessage, updateLastUserMessage,
    setMuted,
  } = useJarvisStore();

  const [textInput, setTextInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [amplitude, setAmplitude] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const amplitudeRef = useRef(0);
  const ampAnimRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { route } = useLocalModel();
  const { startRecording, stopRecording, playAudioBase64, stopPlayback, requestPermissions } = useAudio();

  // ── Simulated amplitude when speaking ─────────────────────────────────
  useEffect(() => {
    if (state === "speaking") {
      ampAnimRef.current = setInterval(() => {
        const raw = Math.max(0, Math.sin(Date.now() * 0.007) * 0.7 + Math.random() * 0.3);
        amplitudeRef.current += (raw - amplitudeRef.current) * 0.4;
        setAmplitude(amplitudeRef.current);
      }, 80);
    } else {
      if (ampAnimRef.current) clearInterval(ampAnimRef.current);
      amplitudeRef.current = 0;
      setAmplitude(0);
    }
    return () => {
      if (ampAnimRef.current) clearInterval(ampAnimRef.current);
    };
  }, [state]);

  // ── WS handlers ────────────────────────────────────────────────────────
  const onText = useCallback((text: string, transcription?: string) => {
    setOutput(text);
    addMessage({ id: Date.now().toString(), role: "jarvis", text, timestamp: Date.now() });
    if (transcription) updateLastUserMessage(transcription);
    setState("standby");
  }, []);

  const onAudioBlob = useCallback(async (base64: string, mime: string) => {
    setState("speaking");
    await playAudioBase64(base64, mime, () => {
      setState("standby");
    });
  }, []);

  const onAudioChunk = useCallback((_chunk: string) => {
    // Streaming PCM — for now just set speaking state
    // Full PCM streaming queue can be added like page.tsx
    setState("speaking");
  }, []);

  const onAudioEnd = useCallback(() => {
    setState("standby");
  }, []);

  const { sendAudio, sendText, sendInterrupt } = useJarvisWs({
    onText,
    onAudioBlob,
    onAudioChunk,
    onAudioEnd,
  });

  // ── Hold to talk ────────────────────────────────────────────────────────
  const handlePressIn = useCallback(async () => {
    if (state === "speaking") {
      stopPlayback();
      sendInterrupt();
      setState("listening");
      return;
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await requestPermissions();
    setIsRecording(true);
    setState("listening");
    await startRecording();
  }, [state]);

  const handlePressOut = useCallback(async () => {
    if (!isRecording) return;
    setIsRecording(false);
    setState("thinking");
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const wavBase64 = await stopRecording();
    if (!wavBase64) { setState("standby"); return; }

    addMessage({ id: Date.now().toString(), role: "user", text: "…", timestamp: Date.now() });
    sendAudio(wavBase64);
  }, [isRecording]);

  // ── Text send with local routing ────────────────────────────────────────
  const handleSendText = useCallback(async () => {
    const text = textInput.trim();
    if (!text) return;
    setTextInput("");
    addMessage({ id: Date.now().toString(), role: "user", text, timestamp: Date.now() });

    // Try local routing first
    if (localModelLoaded) {
      setState("thinking");
      const ctx = messages.slice(-6).map(m => `${m.role}: ${m.text}`).join("\n");
      const { decision, localReply } = await route(text, ctx);

      if (decision === "local" && localReply) {
        setOutput(localReply);
        addMessage({ id: Date.now().toString(), role: "jarvis", text: localReply, timestamp: Date.now(), source: "local" });
        setState("standby");
        return;
      }
    }

    setState("thinking");
    sendText(text);
  }, [textInput, localModelLoaded, messages]);

  const stateColor = STATE_COLORS[state] || COLORS.accent;

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.logo}>J.A.R.V.I.S</Text>
            <Text style={styles.logoSub}>
              {localModelLoaded ? "LOCAL AI ACTIVE" : "REMOTE MODE"} · MOBILE
            </Text>
          </View>

          <View style={styles.headerRight}>
            {/* WS status */}
            <View style={styles.statusRow}>
              <View style={[styles.dot, { backgroundColor: wsConnected ? COLORS.green : COLORS.red }]} />
              <Text style={[styles.statusText, { color: wsConnected ? COLORS.green : COLORS.red }]}>
                {wsConnected ? "CONNECTED" : "OFFLINE"}
              </Text>
            </View>

            {/* State */}
            <View style={styles.statusRow}>
              <View style={[styles.dot, { backgroundColor: stateColor }]} />
              <Text style={[styles.statusText, { color: stateColor }]}>
                {STATE_LABEL[state]}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        {/* ── Face area ── */}
        <View style={styles.faceContainer}>
          <LatticeFaceRN
            size={FACE_SIZE}
            speaking={state === "speaking"}
            thinking={state === "thinking"}
            amplitude={amplitude}
            emotion={emotion}
          />

          {/* Waveform */}
          <View style={styles.waveformWrap}>
            <WaveformBars state={state} amplitude={amplitude} />
          </View>

          {/* Model loading progress */}
          {!localModelLoaded && localModelProgress > 0 && (
            <View style={styles.progressWrap}>
              <Text style={styles.progressLabel}>
                LOADING MODEL {localModelProgress}%
              </Text>
              <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${localModelProgress}%` }]} />
              </View>
            </View>
          )}
        </View>

        {/* ── Output text ── */}
        <View style={styles.outputWrap}>
          <Text style={styles.outputText} numberOfLines={3}>
            {output}
          </Text>
        </View>

        <View style={styles.divider} />

        {/* ── Hold to talk button ── */}
        <View style={styles.voiceRow}>
          <Pressable
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            style={({ pressed }) => [
              styles.holdButton,
              {
                borderColor: isRecording ? COLORS.red : stateColor,
                backgroundColor: isRecording
                  ? `${COLORS.red}15`
                  : pressed
                  ? COLORS.accentDim
                  : "transparent",
                transform: [{ scale: pressed ? 0.96 : 1 }],
              },
            ]}
          >
            <View style={[styles.holdInner, isRecording && styles.holdInnerActive]}>
              {/* Mic icon */}
              <Text style={[styles.holdIcon, { color: isRecording ? COLORS.red : COLORS.accent }]}>
                {isRecording ? "⬛" : "🎙"}
              </Text>
              <Text style={[styles.holdLabel, { color: isRecording ? COLORS.red : COLORS.textDim }]}>
                {isRecording ? "RELEASE TO SEND" : state === "speaking" ? "TAP TO INTERRUPT" : "HOLD TO SPEAK"}
              </Text>
            </View>
          </Pressable>

          {/* Mute toggle */}
          <TouchableOpacity
            onPress={() => setMuted(!muted)}
            style={[styles.muteBtn, { borderColor: muted ? COLORS.red : COLORS.border }]}
          >
            <Text style={{ color: muted ? COLORS.red : COLORS.textDim, fontSize: 16 }}>
              {muted ? "🔇" : "🔊"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Text input ── */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.textInput}
            value={textInput}
            onChangeText={setTextInput}
            placeholder="type a message…"
            placeholderTextColor={COLORS.textFaint}
            onSubmitEditing={handleSendText}
            returnKeyType="send"
            blurOnSubmit={false}
          />
          <TouchableOpacity
            onPress={handleSendText}
            disabled={!textInput.trim()}
            style={[styles.sendBtn, !textInput.trim() && { opacity: 0.3 }]}
          >
            <Text style={styles.sendLabel}>SEND</Text>
          </TouchableOpacity>
        </View>

        {/* ── Chat history toggle ── */}
        {messages.length > 0 && (
          <TouchableOpacity
            onPress={() => setShowChat((v) => !v)}
            style={styles.chatToggle}
          >
            <Text style={styles.chatToggleLabel}>
              {showChat ? "HIDE CHAT" : `SHOW CHAT (${messages.length})`}
            </Text>
          </TouchableOpacity>
        )}

        {showChat && (
          <ScrollView
            ref={scrollRef}
            style={styles.chatScroll}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.slice(-40).map((msg) => (
              <View
                key={msg.id}
                style={[
                  styles.chatBubble,
                  msg.role === "user" ? styles.chatUser : styles.chatJarvis,
                ]}
              >
                <Text style={styles.chatRole}>
                  {msg.role === "user" ? "YOU" : msg.source === "local" ? "JARVIS·LOCAL" : "JARVIS"}
                </Text>
                <Text style={styles.chatText}>{msg.text}</Text>
              </View>
            ))}
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      {/* Corner brackets */}
      <View style={[styles.corner, styles.cornerTL]} />
      <View style={[styles.corner, styles.cornerTR]} />
      <View style={[styles.corner, styles.cornerBL]} />
      <View style={[styles.corner, styles.cornerBR]} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  logo: {
    fontSize: 13,
    letterSpacing: 6,
    color: COLORS.accent,
    fontFamily: "monospace",
    textShadowColor: COLORS.accentGlow,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  logoSub: {
    fontSize: 7,
    letterSpacing: 2,
    color: COLORS.textFaint,
    marginTop: 2,
    fontFamily: "monospace",
  },
  headerRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 8,
    letterSpacing: 2,
    fontFamily: "monospace",
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: 0,
  },
  faceContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    flex: 1,
    minHeight: FACE_SIZE * 0.8,
  },
  waveformWrap: {
    marginTop: 4,
  },
  progressWrap: {
    marginTop: 8,
    alignItems: "center",
    paddingHorizontal: 24,
    width: "100%",
  },
  progressLabel: {
    fontSize: 7,
    letterSpacing: 3,
    color: COLORS.accent,
    marginBottom: 4,
    fontFamily: "monospace",
  },
  progressBg: {
    width: "100%",
    height: 2,
    backgroundColor: COLORS.border,
    borderRadius: 1,
  },
  progressFill: {
    height: 2,
    backgroundColor: COLORS.accent,
    borderRadius: 1,
  },
  outputWrap: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    minHeight: 56,
    justifyContent: "center",
  },
  outputText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
    fontFamily: "monospace",
    lineHeight: 18,
  },
  voiceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  holdButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  holdInner: {
    alignItems: "center",
    gap: 4,
  },
  holdInnerActive: {},
  holdIcon: {
    fontSize: 22,
  },
  holdLabel: {
    fontSize: 8,
    letterSpacing: 3,
    fontFamily: "monospace",
  },
  muteBtn: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  inputRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  textInput: {
    flex: 1,
    height: 38,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 2,
    paddingHorizontal: 12,
    color: COLORS.text,
    fontSize: 11,
    fontFamily: "monospace",
  },
  sendBtn: {
    paddingHorizontal: 14,
    height: 38,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    borderRadius: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accentDim,
  },
  sendLabel: {
    fontSize: 8,
    letterSpacing: 3,
    color: COLORS.accent,
    fontFamily: "monospace",
  },
  chatToggle: {
    alignItems: "center",
    paddingVertical: 6,
  },
  chatToggleLabel: {
    fontSize: 7,
    letterSpacing: 3,
    color: COLORS.accent,
    opacity: 0.4,
    fontFamily: "monospace",
  },
  chatScroll: {
    maxHeight: 200,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  chatBubble: {
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 2,
    borderWidth: 1,
  },
  chatUser: {
    borderColor: "rgba(64,240,128,0.15)",
    backgroundColor: "rgba(64,240,128,0.04)",
    alignSelf: "flex-end",
    maxWidth: "85%",
  },
  chatJarvis: {
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignSelf: "flex-start",
    maxWidth: "85%",
  },
  chatRole: {
    fontSize: 6,
    letterSpacing: 2,
    color: COLORS.textFaint,
    marginBottom: 3,
    fontFamily: "monospace",
  },
  chatText: {
    fontSize: 10,
    color: "rgba(255,255,255,0.65)",
    lineHeight: 14,
    fontFamily: "monospace",
  },
  corner: {
    position: "absolute",
    width: 12,
    height: 12,
  },
  cornerTL: { top: 4, left: 4, borderTopWidth: 1, borderLeftWidth: 1, borderColor: "rgba(64,160,240,0.2)" },
  cornerTR: { top: 4, right: 4, borderTopWidth: 1, borderRightWidth: 1, borderColor: "rgba(64,160,240,0.2)" },
  cornerBL: { bottom: 4, left: 4, borderBottomWidth: 1, borderLeftWidth: 1, borderColor: "rgba(64,160,240,0.2)" },
  cornerBR: { bottom: 4, right: 4, borderBottomWidth: 1, borderRightWidth: 1, borderColor: "rgba(64,160,240,0.2)" },
});
