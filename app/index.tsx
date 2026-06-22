import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Pressable, KeyboardAvoidingView,
  Platform, Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Linking } from "react-native";
import * as Haptics from "expo-haptics";
import { useKeepAwake } from "expo-keep-awake";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CameraView } from "expo-camera";
import * as FileSystem from "expo-file-system";
import * as Speech from "expo-speech";

import { useJarvisStore } from "../utils/store";
import { useSkills } from "../hooks/useSkills";
import { useMemory } from "../hooks/useMemory";
import { useLocalModel } from "../hooks/useLocalModel";
import { useAudio } from "../hooks/useAudio";
import { useTelegram } from "../hooks/useTelegram";
import { useCamera } from "../hooks/useCamera";
import { COLORS, STATE_COLORS } from "../utils/theme";
import { LatticeFaceRN } from "../components/LatticeFaceRN";
import { WaveformBars } from "../components/WaveformBars";

const { width: SW, height: SH } = Dimensions.get("window");
const FACE_SIZE = SW;
const CAM_W    = 70;
const CAM_H    = 96;

const STATE_LABEL: Record<string, string> = {
  standby:   "STANDBY",
  listening: "LISTENING",
  thinking:  "PROCESSING",
  speaking:  "SPEAKING",
};

const STORAGE_KEY = "jarvis_settings";

export default function JarvisScreen() {
  useKeepAwake();
  const router = useRouter();

  // ── Store ──────────────────────────────────────────────────────────────
  const {
    state, emotion, output, messages,
    localModelLoaded, localModelProgress, localModelError, localModelLog,
    muted, micMuted, cameraMuted, routingMode, ttsMode, botToken, chatId,
    setState, setOutput, addMessage, updateLastUserMessage,
    setMuted, setMicMuted, setCameraMuted, setRoutingMode, setTtsMode, setBotToken, setChatId,
  } = useJarvisStore();

  // ── Skills + Memory ────────────────────────────────────────────────────
  const { getSkillsPrompt, addSkill } = useSkills();
  const { saveMemory, getMemoryContext } = useMemory();
  const { route, routeWithVision, routeWithAudio, isLoaded: modelLoaded } = useLocalModel(getSkillsPrompt, getMemoryContext);

  // ── Local settings ─────────────────────────────────────────────────────
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const s = JSON.parse(raw);
          if (s.telegramBotToken) setBotToken(s.telegramBotToken);
          if (s.telegramChatId)   setChatId(s.telegramChatId);
          if (s.routingMode)      setRoutingMode(s.routingMode);
          if (s.ttsMode)          setTtsMode(s.ttsMode);
        }
      } catch {}
      setSettingsLoaded(true);
    })();
  }, []);

  useEffect(() => {
    console.log(`[TG] config — token:${botToken ? botToken.slice(0,8)+"…" : "MISSING"} chatId:${chatId || "MISSING"} mode:${routingMode}`);
  }, [botToken, chatId, routingMode]);

  // ── UI state ───────────────────────────────────────────────────────────
  const [textInput, setTextInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [amplitude, setAmplitude] = useState(0);
  const [showChat, setShowChat]   = useState(false);
  const [showLog, setShowLog]     = useState(false);
  const ampIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // ── Amplitude sim when speaking ────────────────────────────────────────
  useEffect(() => {
    if (state === "speaking") {
      ampIntervalRef.current = setInterval(() => {
        setAmplitude(Math.max(0, Math.sin(Date.now() * 0.007) * 0.7 + Math.random() * 0.3));
      }, 80);
    } else {
      if (ampIntervalRef.current) clearInterval(ampIntervalRef.current);
      setAmplitude(0);
    }
    return () => { if (ampIntervalRef.current) clearInterval(ampIntervalRef.current); };
  }, [state]);

  // ── Hooks ──────────────────────────────────────────────────────────────
  const { startRecording, stopRecording, playAudioBase64, stopPlayback } = useAudio();
  const { cameraRef, permission, requestPermission, setIsReady, captureFrame } = useCamera();

  // Request camera permission when camera is unmuted
  useEffect(() => {
    if (!cameraMuted && permission && !permission.granted) {
      requestPermission();
    }
  }, [cameraMuted, permission]);

  // ── Warm up Android TTS engine at mount so first reply is instant ─────────
  useEffect(() => {
    Speech.speak(" ", { volume: 0, onDone: () => {}, onError: () => {} });
  }, []);

  // ── TTS — local (Android native) or remote (Kokoro via Jarvis) ────────────
  // Brain mode always uses local TTS regardless of ttsMode (no network).
  const speakWithKokoro = useCallback((text: string) => {
    if (muted) return;
    if (ttsMode === "kokoro" && routingMode !== "brain") {
      // Request Kokoro WAV — audio returns via onVoice callback and plays there
      setState("thinking");
      requestTts(text).catch(() => {
        // Kokoro unavailable — fall back to local
        Speech.stop();
        setState("speaking");
        Speech.speak(text, { onDone: () => setState("standby"), onError: () => setState("standby") });
      });
      return;
    }
    Speech.stop();
    setState("speaking");
    Speech.speak(text, {
      onDone:  () => setState("standby"),
      onError: () => setState("standby"),
    });
  }, [muted, ttsMode, routingMode, requestTts]);

  // ── Telegram callbacks ──────────────────────────────────────────────────
  const onTelegramText = useCallback(async (text: string) => {
    setOutput(text);
    addMessage({
      id: Date.now().toString(), role: "jarvis",
      text, timestamp: Date.now(), source: "remote",
    });
    let speakText = text;
    if (modelLoaded && text.length > 300) {
      try {
        const { localReply } = await route(
          `Condense this to 2 sentences max for text-to-speech. Reply with only the condensed text: ${text}`
        );
        if (localReply && localReply.length < text.length) speakText = localReply;
      } catch {}
    }
    speakWithKokoro(speakText);
  }, [modelLoaded, route, speakWithKokoro]);

  const onTelegramVoice = useCallback(async (_fileId: string) => {}, []);

  const { sendText, sendQuery, sendVoice, downloadVoice, requestTts } = useTelegram(
    { botToken, chatId },
    {
      onText:  onTelegramText,
      onVoice: async (fileId: string) => {
        // Main Jarvis sent TTS audio back — download and play it
        try {
          const base64 = await downloadVoice(fileId);
          if (base64) {
            setState("speaking");
            await playAudioBase64(base64, "audio/ogg", () => setState("standby"));
          }
        } catch (e) {
          console.warn("[TG] voice playback failed", e);
          setState("standby");
        }
      },
      onTranscript: async (transcript: string) => {
        // Jarvis transcribed our voice — now route the text through local model
        console.log("[VOICE] transcript received:", transcript);
        addMessage({ id: Date.now().toString(), role: "user", text: transcript, timestamp: Date.now() });
        await handleTranscribed(transcript, null);
      },
      onSkill: (skill) => {
        addSkill(skill.name, skill.description, skill.prompt, "telegram");
        sendText(`✅ Skill loaded: *${skill.name}*`);
      },
      enabled: settingsLoaded && !!botToken,
    }
  );

  // ── Timer state ─────────────────────────────────────────────────────────
  const [timerLeft, setTimerLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = useCallback((seconds: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerLeft(seconds);
    timerRef.current = setInterval(() => {
      setTimerLeft(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(timerRef.current!);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setOutput("⏰ Timer done!");
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // ── Skill action dispatcher ──────────────────────────────────────────────
  const handleSkillAction = useCallback((reply: string): string => {
    const firstLine = reply.split("\n")[0].trim();
    const rest = reply.split("\n").slice(1).join("\n").trim();

    if (firstLine.startsWith("TIMER:")) {
      const secs = parseInt(firstLine.slice(6), 10);
      if (!isNaN(secs)) startTimer(secs);
      return rest || `Timer set for ${secs}s.`;
    }
    if (firstLine.startsWith("CALL:")) {
      const target = firstLine.slice(5).trim();
      Linking.openURL(`tel:${target}`).catch(() => {});
      return rest || `Calling ${target}…`;
    }
    if (firstLine.startsWith("SMS:")) {
      const parts = firstLine.slice(4).split(":");
      const to  = parts[0]?.trim() ?? "";
      const msg = parts.slice(1).join(":").trim();
      Linking.openURL(`sms:${to}${msg ? `?body=${encodeURIComponent(msg)}` : ""}`).catch(() => {});
      return rest || `Opening message to ${to}…`;
    }
    if (firstLine.startsWith("OPEN:")) {
      const target = firstLine.slice(5).trim().toLowerCase();
      const urlMap: Record<string, string> = {
        maps: "https://maps.google.com",
        spotify: "spotify://",
        youtube: "https://youtube.com",
        settings: "app-settings:",
      };
      if (target.startsWith("search:")) {
        Linking.openURL(`https://google.com/search?q=${encodeURIComponent(target.slice(7))}`).catch(() => {});
      } else {
        Linking.openURL(urlMap[target] ?? `https://${target}.com`).catch(() => {});
      }
      return rest || `Opening ${target}…`;
    }
    if (firstLine.startsWith("REMINDER:")) {
      // TODO: wire expo-notifications for scheduled reminders
      return rest || "Reminder noted (push notifications not yet configured).";
    }
    return reply;
  }, [startTimer]);

  // ── Full pipeline ───────────────────────────────────────────────────────
  const handleTranscribed = useCallback(async (text: string, imageUri?: string | null) => {
    if (!text.trim()) { setState("standby"); return; }

    updateLastUserMessage(text);
    setState("thinking");

    // BRAIN: local model only, never Telegram
    if (routingMode === "brain") {
      if (modelLoaded) {
        const ctx = messages.slice(-6).map(m => `${m.role}: ${m.text}`).join("\n");
        const { decision, localReply } = await routeWithVision(text, imageUri, ctx);
        const reply = (decision === "local" && localReply) ? localReply : "I need to connect to main Jarvis for that — switch to Hybrid or Remote mode.";
        const displayReply = handleSkillAction(reply);
        setOutput(displayReply);
        addMessage({ id: Date.now().toString(), role: "jarvis", text: displayReply, timestamp: Date.now(), source: "local" });
        if (imageUri) FileSystem.deleteAsync(imageUri, { idempotent: true }).catch(() => {});
        speakWithKokoro(displayReply);
      } else {
        setOutput("Local model not loaded yet.");
        setState("standby");
      }
      return;
    }

    // REMOTE: skip local model, always Telegram
    if (routingMode === "remote") {
      await sendQuery(text, "text", "offline");
      if (imageUri) FileSystem.deleteAsync(imageUri, { idempotent: true }).catch(() => {});
      return;
    }

    // HYBRID (default): try local first, Telegram as fallback
    if (modelLoaded) {
      const ctx = messages.slice(-6).map(m => `${m.role}: ${m.text}`).join("\n");
      const { decision, localReply } = await routeWithVision(text, imageUri, ctx);
      if (decision === "local" && localReply) {
        const displayReply = handleSkillAction(localReply);
        setOutput(displayReply);
        addMessage({ id: Date.now().toString(), role: "jarvis", text: displayReply, timestamp: Date.now(), source: "local" });
        if (imageUri) FileSystem.deleteAsync(imageUri, { idempotent: true }).catch(() => {});
        speakWithKokoro(displayReply);
        return;
      }
    }

    await sendQuery(text, "text", modelLoaded ? "routed" : "offline");
    if (imageUri) FileSystem.deleteAsync(imageUri, { idempotent: true }).catch(() => {});
  }, [routingMode, modelLoaded, messages, routeWithVision, sendQuery, speakWithKokoro, handleSkillAction]);

  // ── Hold to talk ────────────────────────────────────────────────────────
  const handlePressIn = useCallback(async () => {
    if (micMuted) return;
    if (state === "speaking") {
      await stopPlayback();
      setState("standby");
      return;
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsRecording(true);
    setState("listening");
    addMessage({ id: Date.now().toString(), role: "user", text: "…", timestamp: Date.now() });
    await startRecording();
  }, [state, micMuted]);

  const handlePressOut = useCallback(async () => {
    if (!isRecording) return;
    setIsRecording(false);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const wavBase64 = await stopRecording();
    if (!wavBase64) { setState("standby"); return; }

    setState("thinking");
    const imageUri = cameraMuted ? null : await captureFrame();
    const ctx = messages.slice(-6).map(m => `${m.role}: ${m.text}`).join("\n");

    if (routingMode === "brain") {
      // Brain mode: local audio only, no Telegram
      if (modelLoaded) {
        const { decision, localReply } = await routeWithAudio(wavBase64, ctx);
        const reply = (decision === "local" && localReply) ? localReply : "I need main Jarvis for that — switch to Hybrid or Remote mode.";
        const displayReply = handleSkillAction(reply);
        setOutput(displayReply);
        addMessage({ id: Date.now().toString(), role: "jarvis", text: displayReply, timestamp: Date.now(), source: "local" });
        speakWithKokoro(displayReply);
      } else {
        setOutput("Local model not loaded.");
        setState("standby");
      }
      if (imageUri) FileSystem.deleteAsync(imageUri, { idempotent: true }).catch(() => {});
      return;
    }

    if (routingMode === "remote") {
      // Remote mode: always full Telegram handling
      await sendVoice(wavBase64, false);
      if (imageUri) FileSystem.deleteAsync(imageUri, { idempotent: true }).catch(() => {});
      return;
    }

    // Hybrid: try local audio, Telegram fallback
    if (modelLoaded) {
      const { decision, localReply } = await routeWithAudio(wavBase64, ctx);
      if (decision === "local" && localReply) {
        const displayReply = handleSkillAction(localReply);
        setOutput(displayReply);
        addMessage({ id: Date.now().toString(), role: "jarvis", text: displayReply, timestamp: Date.now(), source: "local" });
        if (imageUri) FileSystem.deleteAsync(imageUri, { idempotent: true }).catch(() => {});
        speakWithKokoro(displayReply);
        return;
      }
      if (decision === "remote") {
        await sendVoice(wavBase64, true);
        if (imageUri) FileSystem.deleteAsync(imageUri, { idempotent: true }).catch(() => {});
        return;
      }
    }

    // Offline or no audio support: full Telegram handling
    await sendVoice(wavBase64, false);
    if (imageUri) FileSystem.deleteAsync(imageUri, { idempotent: true }).catch(() => {});
  }, [isRecording, cameraMuted, captureFrame, sendVoice, routingMode, modelLoaded, routeWithAudio, messages, handleSkillAction, speakWithKokoro]);

  // ── Text send ───────────────────────────────────────────────────────────
  const handleSendText = useCallback(async () => {
    const text = textInput.trim();
    if (!text) return;
    setTextInput("");
    addMessage({ id: Date.now().toString(), role: "user", text, timestamp: Date.now() });
    const imageUri = cameraMuted ? null : await captureFrame();
    await handleTranscribed(text, imageUri);
  }, [textInput, cameraMuted, captureFrame, handleTranscribed]);

  // ── Render ──────────────────────────────────────────────────────────────
  const stateColor    = STATE_COLORS[state] || COLORS.accent;
  const telegramReady = !!botToken && !!chatId;
  const camGranted    = permission?.granted ?? false;
  const camActive     = !cameraMuted && camGranted;
  const displayOutput = output;

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.logo}>J.A.R.V.I.S</Text>
            <Text style={styles.logoSub}>
              {modelLoaded ? "LOCAL·GEMMA4·ACTIVE" : "REMOTE·ONLY"} · MOBILE
            </Text>
          </View>
          <View style={styles.headerRight}>
            {/* Buttons row */}
            <View style={styles.btnRow}>
              <TouchableOpacity onPress={() => router.push("/logs")} style={styles.gearBtn}>
                <Text style={styles.gearIcon}>▤</Text>
                <Text style={styles.gearLabel}>LOG</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push("/ram")} style={styles.gearBtn}>
                <Text style={styles.gearIcon}>◈</Text>
                <Text style={styles.gearLabel}>MEM</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push("/settings")} style={styles.gearBtn}>
                <Text style={styles.gearIcon}>⚙</Text>
                <Text style={styles.gearLabel}>SET</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.statusRow}>
              <View style={[styles.dot, { backgroundColor: telegramReady ? COLORS.green : COLORS.red }]} />
              <Text style={[styles.statusText, { color: telegramReady ? COLORS.green : COLORS.red }]}>
                {telegramReady ? "TELEGRAM·ON" : "NO·TOKEN"}
              </Text>
            </View>
            <View style={styles.statusRow}>
              <View style={[styles.dot, { backgroundColor: stateColor }]} />
              <Text style={[styles.statusText, { color: stateColor }]}>
                {STATE_LABEL[state]}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Face area with jaw-level camera overlay */}
        <View style={styles.faceArea}>
          <View style={styles.faceRow}>
            <LatticeFaceRN
              size={FACE_SIZE}
              speaking={state === "speaking"}
              thinking={state === "thinking"}
              amplitude={amplitude}
              emotion={emotion}
            />
          </View>

          {/* Camera — jaw-level overlay, right side */}
          <TouchableOpacity
            onPress={() => setCameraMuted(!cameraMuted)}
            style={[
              styles.camJaw,
              { borderColor: cameraMuted ? COLORS.red : camActive ? COLORS.borderBright : COLORS.border },
            ]}
            activeOpacity={0.8}
          >
            {camActive ? (
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFillObject}
                facing="back"
                onCameraReady={() => setIsReady(true)}
              />
            ) : (
              <View style={styles.camOff}>
                <Text style={styles.camOffIcon}>📷</Text>
                <Text style={styles.camOffLabel}>{cameraMuted ? "CAM·OFF" : "NO·PERM"}</Text>
              </View>
            )}
            {camActive && <View style={styles.camLiveDot} />}
            <View style={styles.camLabel}>
              <View style={[styles.muteDot, { backgroundColor: cameraMuted ? COLORS.red : COLORS.green }]} />
              <Text style={styles.camOffLabel}>CAM</Text>
            </View>
          </TouchableOpacity>

          {/* Waveform */}
          <WaveformBars state={state} amplitude={amplitude} />

          {/* Model loading / error */}
          {!localModelLoaded && (
            <View style={styles.progressWrap}>
              <Text style={styles.loadingTitle}>J.A.R.V.I.S</Text>
              <Text style={styles.loadingBy}>by Sami Porokka</Text>
              {localModelError ? (
                <Text style={[styles.progressLabel, { color: "#f04040", fontSize: 9, marginTop: 8 }]} numberOfLines={3}>
                  {"ERR: " + localModelError}
                </Text>
              ) : (
                <Text style={[styles.progressLabel, { marginTop: 8 }]}>
                  {localModelProgress === 0
                    ? "INITIALIZING MODEL..."
                    : localModelProgress >= 100
                    ? "LOADING INTO MEMORY..."
                    : `DOWNLOADING GEMMA4  ${localModelProgress}%`}
                </Text>
              )}
              <View style={styles.progressBg}>
                <View style={[styles.progressFill, {
                  width: localModelError ? "100%" : localModelProgress === 0 ? "4%" : `${localModelProgress}%`,
                  opacity: localModelError ? 0.4 : localModelProgress === 0 ? 0.5 : 1,
                  backgroundColor: localModelError ? "#f04040" : undefined,
                }]} />
              </View>
            </View>
          )}

          {/* Pipeline chips */}
          <View style={styles.pipelineRow}>
            <Chip label="WHISPER" active />
            <Text style={styles.arrow}>→</Text>
            <Chip label="GEMMA4" active={modelLoaded} />
            <Text style={styles.arrow}>→</Text>
            <Chip label="TELEGRAM" active={telegramReady} />
            <Text style={styles.arrow}>→</Text>
            <Chip label="JARVIS" active={telegramReady} />
          </View>
        </View>

        {/* Output — always visible when there's content; hidden during silent download */}
        {(!!displayOutput || timerLeft !== null || !!localModelLog) && (
          <View style={styles.outputWrap}>
            {timerLeft !== null && (
              <Text style={styles.timerText}>
                ⏱ {Math.floor(timerLeft / 60)}:{String(timerLeft % 60).padStart(2, "0")}
              </Text>
            )}
            <View style={styles.outputRow}>
              <Text style={styles.outputText} numberOfLines={showLog ? 1 : 3}>
                {showLog ? localModelLog || "— no log yet —" : displayOutput}
              </Text>
              {!!localModelLog && (
                <TouchableOpacity onPress={() => setShowLog(v => !v)} style={styles.logTab}>
                  <Text style={[styles.logTabLabel, showLog && styles.logTabActive]}>
                    {showLog ? "OUT" : "LOG"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        <View style={styles.divider} />

        {/* Voice row — MIC | HOLD | SPEAKER */}
        <View style={styles.voiceRow}>

          {/* Mic mute */}
          <TouchableOpacity
            onPress={() => setMicMuted(!micMuted)}
            style={[styles.muteBtn, { borderColor: micMuted ? COLORS.red : COLORS.border }]}
          >
            <View style={[styles.muteDot, { backgroundColor: micMuted ? COLORS.red : COLORS.green }]} />
            <Text style={[styles.muteBtnLabel, { color: micMuted ? COLORS.red : COLORS.textDim }]}>
              MIC
            </Text>
          </TouchableOpacity>

          {/* Hold to speak */}
          <Pressable
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            style={({ pressed }) => [
              styles.holdButton,
              micMuted && styles.holdButtonMuted,
              {
                borderColor: isRecording ? COLORS.red : micMuted ? COLORS.border : stateColor,
                backgroundColor: isRecording
                  ? `${COLORS.red}15`
                  : pressed ? COLORS.accentDim : "transparent",
                transform: [{ scale: pressed ? 0.96 : 1 }],
              },
            ]}
          >
            <Text style={[styles.holdIcon, { color: isRecording ? COLORS.red : micMuted ? COLORS.textFaint : COLORS.accent }]}>
              {isRecording ? "⬛" : micMuted ? "🔇" : "🎙"}
            </Text>
            <Text style={[styles.holdLabel, { color: isRecording ? COLORS.red : micMuted ? COLORS.textFaint : COLORS.textDim }]}>
              {isRecording ? "RELEASE TO SEND" : micMuted ? "MIC·MUTED" : state === "speaking" ? "TAP TO STOP" : "HOLD TO SPEAK"}
            </Text>
          </Pressable>

          {/* Speaker mute */}
          <TouchableOpacity
            onPress={() => setMuted(!muted)}
            style={[styles.muteBtn, { borderColor: muted ? COLORS.red : COLORS.border }]}
          >
            <View style={[styles.muteDot, { backgroundColor: muted ? COLORS.red : COLORS.green }]} />
            <Text style={[styles.muteBtnLabel, { color: muted ? COLORS.red : COLORS.textDim }]}>
              SPK
            </Text>
          </TouchableOpacity>
        </View>

        {/* Text input */}
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

        {/* Chat history */}
        {messages.length > 0 && (
          <TouchableOpacity onPress={() => setShowChat(v => !v)} style={styles.chatToggle}>
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
            {messages.slice(-40).map(msg => (
              <View key={msg.id} style={[styles.bubble, msg.role === "user" ? styles.bubbleUser : styles.bubbleJarvis]}>
                <Text style={styles.bubbleRole}>
                  {msg.role === "user" ? "YOU" : msg.source === "local" ? "JARVIS·LOCAL" : "JARVIS·REMOTE"}
                </Text>
                <Text style={styles.bubbleText}>{msg.text}</Text>
              </View>
            ))}
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      {/* Corner brackets */}
      <View style={[styles.corner, styles.cTL]} />
      <View style={[styles.corner, styles.cTR]} />
      <View style={[styles.corner, styles.cBL]} />
      <View style={[styles.corner, styles.cBR]} />
    </SafeAreaView>
  );
}

function Chip({ label, active }: { label: string; active: boolean }) {
  return (
    <View style={[chipStyles.wrap, active && chipStyles.active]}>
      <Text style={[chipStyles.label, active && chipStyles.labelActive]}>{label}</Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  wrap:       { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 2, borderWidth: 1, borderColor: COLORS.border },
  active:     { borderColor: COLORS.accent, backgroundColor: COLORS.accentDim },
  label:      { fontSize: 6, letterSpacing: 1, color: COLORS.textFaint, fontFamily: "monospace" },
  labelActive:{ color: COLORS.accent },
});

const styles = StyleSheet.create({
  root:         { flex: 1, backgroundColor: COLORS.background },
  header:       { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 16, paddingVertical: 10 },
  logo:         { fontSize: 13, letterSpacing: 6, color: COLORS.accent, fontFamily: "monospace", textShadowColor: COLORS.accentGlow, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 },
  logoSub:      { fontSize: 7, letterSpacing: 2, color: COLORS.textFaint, marginTop: 2, fontFamily: "monospace" },
  headerRight:  { alignItems: "flex-end", gap: 5 },
  btnRow:       { flexDirection: "row", gap: 12, marginBottom: 4 },
  gearBtn:      { alignItems: "center", gap: 2 },
  gearIcon:     { fontSize: 16, color: COLORS.textFaint },
  gearLabel:    { fontSize: 5, letterSpacing: 1, color: COLORS.textFaint, fontFamily: "monospace" },
  statusRow:    { flexDirection: "row", alignItems: "center", gap: 5 },
  dot:          { width: 5, height: 5, borderRadius: 3 },
  statusText:   { fontSize: 8, letterSpacing: 2, fontFamily: "monospace" },
  divider:      { height: 1, backgroundColor: COLORS.border },

  // Face area
  faceArea:     { alignItems: "center", paddingVertical: 8, flex: 1 },
  faceRow:      { alignItems: "center", justifyContent: "center", width: "100%" },

  // Camera — jaw-level overlay (absolute within faceArea, right side, ~72% down)
  camJaw:       { position: "absolute", bottom: "16%", right: 10, width: CAM_W, height: CAM_H, borderWidth: 1, borderRadius: 4, overflow: "hidden", backgroundColor: COLORS.surface },
  camView:      { flex: 1 },
  camOff:       { flex: 1, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", gap: 2 },
  camOffIcon:   { fontSize: 14 },
  camOffLabel:  { fontSize: 5, letterSpacing: 1, color: COLORS.textFaint, fontFamily: "monospace" },
  camLiveDot:   { position: "absolute", top: 3, right: 3, width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.red },
  camLabel:     { position: "absolute", bottom: 2, left: 3, flexDirection: "row", alignItems: "center", gap: 2 },
  camMuteLabel: { fontSize: 6, letterSpacing: 2, fontFamily: "monospace" },

  // Progress
  progressWrap:  { marginTop: 6, alignItems: "center", width: "80%" },
  loadingTitle:  { fontSize: 22, letterSpacing: 10, color: COLORS.accent, fontFamily: "monospace", textShadowColor: COLORS.accentGlow, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 12 },
  loadingBy:     { fontSize: 8, letterSpacing: 3, color: COLORS.textFaint, fontFamily: "monospace", marginTop: 2 },
  progressLabel: { fontSize: 7, letterSpacing: 3, color: COLORS.accent, marginBottom: 3, fontFamily: "monospace" },
  progressBg:    { width: "100%", height: 2, backgroundColor: COLORS.border, borderRadius: 1 },
  progressFill:  { height: 2, backgroundColor: COLORS.accent, borderRadius: 1 },
  pipelineRow:  { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 10 },
  arrow:        { fontSize: 8, color: COLORS.textFaint },

  // Output
  outputWrap:    { paddingHorizontal: 20, paddingVertical: 10, minHeight: 52, justifyContent: "center" },
  outputRow:     { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  outputText:    { flex: 1, fontSize: 12, color: "rgba(255,255,255,0.75)", textAlign: "center", fontFamily: "monospace", lineHeight: 18 },
  outputLoading: { color: COLORS.accent, opacity: 0.6, fontSize: 11 },
  timerText:     { fontSize: 22, color: COLORS.accent, textAlign: "center", fontFamily: "monospace", letterSpacing: 4, marginBottom: 4 },
  logTab:        { paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: COLORS.border, borderRadius: 2 },
  logTabLabel:   { fontSize: 6, letterSpacing: 2, color: COLORS.textFaint, fontFamily: "monospace" },
  logTabActive:  { color: COLORS.accent },

  // Voice row
  voiceRow:     { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  muteBtn:      { width: 44, height: 44, borderWidth: 1, borderRadius: 2, alignItems: "center", justifyContent: "center", gap: 3 },
  muteDot:      { width: 5, height: 5, borderRadius: 3 },
  muteBtnLabel: { fontSize: 6, letterSpacing: 2, fontFamily: "monospace" },
  holdButton:   { flex: 1, borderWidth: 1, borderRadius: 4, paddingVertical: 14, alignItems: "center", gap: 4 },
  holdButtonMuted: { opacity: 0.5 },
  holdIcon:     { fontSize: 22 },
  holdLabel:    { fontSize: 8, letterSpacing: 3, fontFamily: "monospace" },

  // Input
  inputRow:     { flexDirection: "row", paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  textInput:    { flex: 1, height: 38, backgroundColor: COLORS.surfaceAlt, borderWidth: 1, borderColor: COLORS.border, borderRadius: 2, paddingHorizontal: 12, color: COLORS.text, fontSize: 11, fontFamily: "monospace" },
  sendBtn:      { paddingHorizontal: 14, height: 38, borderWidth: 1, borderColor: COLORS.borderBright, borderRadius: 2, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.accentDim },
  sendLabel:    { fontSize: 8, letterSpacing: 3, color: COLORS.accent, fontFamily: "monospace" },

  // Chat
  chatToggle:      { alignItems: "center", paddingVertical: 5 },
  chatToggleLabel: { fontSize: 7, letterSpacing: 3, color: COLORS.accent, opacity: 0.4, fontFamily: "monospace" },
  chatScroll:      { maxHeight: 180, paddingHorizontal: 12, marginBottom: 6 },
  bubble:          { marginBottom: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 2, borderWidth: 1 },
  bubbleUser:      { borderColor: "rgba(64,240,128,0.15)", backgroundColor: "rgba(64,240,128,0.04)", alignSelf: "flex-end", maxWidth: "85%" },
  bubbleJarvis:    { borderColor: COLORS.border, backgroundColor: COLORS.surface, alignSelf: "flex-start", maxWidth: "85%" },
  bubbleRole:      { fontSize: 6, letterSpacing: 2, color: COLORS.textFaint, marginBottom: 2, fontFamily: "monospace" },
  bubbleText:      { fontSize: 10, color: "rgba(255,255,255,0.65)", lineHeight: 14, fontFamily: "monospace" },

  // Corner brackets
  corner: { position: "absolute", width: 12, height: 12 },
  cTL:    { top: 4, left: 4,    borderTopWidth: 1,    borderLeftWidth: 1,   borderColor: "rgba(64,160,240,0.2)" },
  cTR:    { top: 4, right: 4,   borderTopWidth: 1,    borderRightWidth: 1,  borderColor: "rgba(64,160,240,0.2)" },
  cBL:    { bottom: 4, left: 4, borderBottomWidth: 1, borderLeftWidth: 1,   borderColor: "rgba(64,160,240,0.2)" },
  cBR:    { bottom: 4, right: 4,borderBottomWidth: 1, borderRightWidth: 1,  borderColor: "rgba(64,160,240,0.2)" },
});
