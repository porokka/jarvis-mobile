import { useRef, useCallback, useEffect, useState } from "react";
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
    if (!config.botToken || !config.chatId) return;
    try {
      await fetch(`${base}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: config.chatId,
          text,
          parse_mode: "Markdown",
        }),
      });
    } catch (e) {
      console.warn("[TG] sendText failed", e);
    }
  }, [config.botToken, config.chatId]);

  // ── Send voice (WAV base64) ──────────────────────────────────────────────
  // Telegram requires OGG/OPUS for sendVoice, but sendAudio accepts WAV
  const sendVoice = useCallback(async (wavBase64: string) => {
    if (!config.botToken || !config.chatId) return;
    try {
      // Write to temp file
      const path = `${FileSystem.cacheDirectory}jarvis_voice_out.wav`;
      await FileSystem.writeAsStringAsync(path, wavBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Upload as audio file
      const formData = new FormData();
      formData.append("chat_id", config.chatId);
      formData.append("audio", {
        uri: path,
        name: "voice.wav",
        type: "audio/wav",
      } as any);

      await fetch(`${base}/sendAudio`, {
        method: "POST",
        body: formData,
      });

      await FileSystem.deleteAsync(path, { idempotent: true });
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
          optsRef.current.onText(msg.text);
        } else if (msg.voice || msg.audio) {
          const fileId = msg.voice?.file_id || msg.audio?.file_id;
          if (fileId) optsRef.current.onVoice(fileId);
        }
      }
    } catch (e) {
      console.warn("[TG] poll failed", e);
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
      if (json.name && json.prompt && optsRef.current.onSkill) {
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

  return { sendText, sendVoice, downloadVoice };
}
