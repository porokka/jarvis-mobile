import { useRef, useCallback, useEffect } from "react";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";

interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface SkillDefinition {
  name: string;
  description: string;
  prompt: string;
}

interface UseTelegramOptions {
  onText: (text: string) => void;
  onVoice: (fileId: string) => void;
  onTranscript?: (text: string) => void;
  onSkill?: (skill: SkillDefinition) => void;
  enabled: boolean;
}

export function useTelegram(
  config: TelegramConfig,
  opts: UseTelegramOptions
) {
  const offsetRef = useRef<number>(0);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const base = `https://api.telegram.org/bot${config.botToken}`;

  // ── Send text message ────────────────────────────────────────────────────
  const sendText = useCallback(async (text: string) => {
    if (!config.botToken || !config.chatId) {
      console.warn("[TG] sendText blocked — token or chatId not set");
      return;
    }
    try {
      const res  = await fetch(`${base}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: config.chatId,
          text,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        console.warn(`[TG] sendMessage failed: ${data.error_code} ${data.description}`);
      } else {
        console.log(`[TG] sent ok (msg_id:${data.result?.message_id})`);
      }
    } catch (e) {
      console.warn("[TG] sendText failed", e);
    }
  }, [config.botToken, config.chatId]);

  // ── Request Kokoro TTS from main Jarvis ─────────────────────────────────
  // Sends JARVIS_MOBILE {"type":"tts","text":"..."} — Jarvis calls Kokoro and
  // sends WAV audio back; the caller's onVoice callback handles playback.
  const requestTts = useCallback(async (text: string) => {
    if (!config.botToken || !config.chatId) return;
    const packet = JSON.stringify({ type: "tts", text });
    await sendText(`JARVIS_MOBILE ${packet}`);
    console.log("[TG] TTS request sent");
  }, [config.botToken, config.chatId, sendText]);

  // ── Send structured query packet to main Jarvis ─────────────────────────
  // Format: JARVIS_MOBILE {"type":"query","input":"voice","model":"offline","text":"..."}
  // Main Jarvis parses this, generates reply + optional TTS audio.
  const sendQuery = useCallback(async (
    text: string,
    input: "voice" | "text" | "image",
    modelState: "offline" | "online" | "routed"
  ) => {
    if (!config.botToken || !config.chatId) return;
    const packet = JSON.stringify({ type: "query", input, model: modelState, text });
    await sendText(`JARVIS_MOBILE ${packet}`);
  }, [config.botToken, config.chatId, sendText]);

  // ── Send voice to main Jarvis via Telegram ──────────────────────────────
  // Android records M4A/AAC, iOS records CAF — send with correct MIME type
  // so main Jarvis can download and transcribe with Whisper.
  // transcribeOnly=true → Jarvis just returns the transcript text (local model will route it)
  // transcribeOnly=false → Jarvis handles the full reply + sends TTS audio back
  const sendVoice = useCallback(async (audioBase64: string, transcribeOnly = false) => {
    if (!config.botToken || !config.chatId) return;
    try {
      const isAndroid = Platform.OS === "android";
      const ext      = isAndroid ? ".m4a" : ".caf";
      const mime     = isAndroid ? "audio/mp4" : "audio/x-caf";
      const path     = `${FileSystem.cacheDirectory}jarvis_voice_out${ext}`;

      await FileSystem.writeAsStringAsync(path, audioBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const caption = transcribeOnly ? "JARVIS_VOICE_TRANSCRIBE" : "JARVIS_VOICE_QUERY";
      const formData = new FormData();
      formData.append("chat_id", config.chatId);
      formData.append("caption", caption);
      formData.append("audio", { uri: path, name: `voice${ext}`, type: mime } as any);

      await fetch(`${base}/sendAudio`, { method: "POST", body: formData });
      await FileSystem.deleteAsync(path, { idempotent: true });
      console.log(`[TG] voice sent (${caption})`);
    } catch (e) {
      console.warn("[TG] sendVoice failed", e);
    }
  }, [config.botToken, config.chatId]);

  // ── Download voice file from Telegram ───────────────────────────────────
  const downloadVoice = useCallback(async (fileId: string): Promise<string | null> => {
    try {
      // Get file path
      const res = await fetch(`${base}/getFile?file_id=${fileId}`);
      const data = await res.json();
      const filePath = data?.result?.file_path;
      if (!filePath) return null;

      const url = `https://api.telegram.org/file/bot${config.botToken}/${filePath}`;
      const localPath = `${FileSystem.cacheDirectory}jarvis_reply.ogg`;

      await FileSystem.downloadAsync(url, localPath);

      // Read as base64
      const base64 = await FileSystem.readAsStringAsync(localPath, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await FileSystem.deleteAsync(localPath, { idempotent: true });
      return base64;
    } catch (e) {
      console.warn("[TG] downloadVoice failed", e);
      return null;
    }
  }, [config.botToken]);

  // ── Poll for updates ─────────────────────────────────────────────────────
  const poll = useCallback(async () => {
    if (!config.botToken || !config.chatId || !optsRef.current.enabled) return;

    try {
      const res = await fetch(
        `${base}/getUpdates?offset=${offsetRef.current}&timeout=10&allowed_updates=["message"]`
      );
      const data = await res.json();

      if (!data.ok) return;

      for (const update of data.result || []) {
        offsetRef.current = update.update_id + 1;

        const msg = update.message;
        if (!msg) continue;

        // Only process messages from our chat
        if (String(msg.chat?.id) !== String(config.chatId)) continue;

        if (msg.text?.startsWith("/skill ")) {
          // /skill Name | description | prompt
          const parts = msg.text.slice(7).split("|").map((s: string) => s.trim());
          if (parts.length >= 3 && optsRef.current.onSkill) {
            optsRef.current.onSkill({ name: parts[0], description: parts[1], prompt: parts[2] });
          } else if (parts.length === 2 && optsRef.current.onSkill) {
            optsRef.current.onSkill({ name: parts[0], description: parts[0], prompt: parts[1] });
          }
        } else if (msg.document?.file_name?.endsWith(".json")) {
          // JSON file attachment — parse as skill definition
          tryLoadSkillFile(msg.document.file_id);
        } else if (msg.text) {
          // Parse structured JARVIS_REPLY packets from main Jarvis
          if (msg.text.startsWith("JARVIS_REPLY ")) {
            try {
              const payload = JSON.parse(msg.text.slice(13));
              if (payload.text) optsRef.current.onText(payload.text);
            } catch {
              optsRef.current.onText(msg.text);
            }
          } else if (msg.text.startsWith("JARVIS_TRANSCRIPT ")) {
            try {
              const payload = JSON.parse(msg.text.slice(18));
              if (payload.text) optsRef.current.onTranscript?.(payload.text);
            } catch {
              optsRef.current.onTranscript?.(msg.text.slice(18));
            }
          } else if (!msg.text.startsWith("JARVIS_MOBILE ")) {
            // Don't echo our own outgoing packets back
            optsRef.current.onText(msg.text);
          }
        } else if (msg.voice || msg.audio) {
          const fileId = msg.voice?.file_id || msg.audio?.file_id;
          if (fileId) optsRef.current.onVoice(fileId);
        }
      }
      return;  // retry scheduled below
    } catch (e) {
      console.warn("[TG] poll failed", e);
      // Back off on error so we don't spam the console
      pollRef.current = setTimeout(poll, 5000);
      return;
    }

    // Schedule next poll
    pollRef.current = setTimeout(poll, 1500);
  }, [config.botToken, config.chatId]);

  const tryLoadSkillFile = useCallback(async (fileId: string) => {
    try {
      const res  = await fetch(`${base}/getFile?file_id=${fileId}`);
      const data = await res.json();
      const path = data?.result?.file_path;
      if (!path) return;
      const json = await (await fetch(`https://api.telegram.org/file/bot${config.botToken}/${path}`)).json();
      if (!optsRef.current.onSkill) return;

      // Array of skills (e.g. from /skills export by main Jarvis)
      if (Array.isArray(json)) {
        for (const item of json) {
          if (item?.name && item?.prompt) {
            optsRef.current.onSkill({
              name:        item.name,
              description: item.description ?? item.name,
              prompt:      item.prompt,
            });
          }
        }
        return;
      }

      // Single skill object
      if (json.name && json.prompt) {
        optsRef.current.onSkill({
          name:        json.name,
          description: json.description ?? json.name,
          prompt:      json.prompt,
        });
      }
    } catch (e) {
      console.warn("[TG] skill file parse failed", e);
    }
  }, [config.botToken]);

  // Start/stop polling
  useEffect(() => {
    if (!opts.enabled || !config.botToken || !config.chatId) return;

    poll();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [opts.enabled, config.botToken, config.chatId, poll]);

  return { sendText, sendQuery, sendVoice, downloadVoice, requestTts };
}
