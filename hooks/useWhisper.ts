import { useRef, useCallback } from "react";
import * as FileSystem from "expo-file-system";

// Whisper tiny Q5 GGUF - ~150MB
const WHISPER_MODEL_URL =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin";
const WHISPER_MODEL_FILE = "whisper-tiny-en.bin";

interface UseWhisperOptions {
  // Fallback: send to JARVIS Whisper endpoint over local network
  jarvisIp?: string;
  jarvisPort?: number;
}

export function useWhisper(opts: UseWhisperOptions = {}) {
  const modelReadyRef = useRef(false);
  const modelPathRef = useRef<string>("");

  // For Phase 1: send WAV to JARVIS /api/transcribe if on same WiFi
  // For Phase 2: use whisper.rn on-device
  const transcribeRemote = useCallback(
    async (wavBase64: string): Promise<string> => {
      if (!opts.jarvisIp) return "";
      try {
        // Write temp wav
        const path = `${FileSystem.cacheDirectory}stt_input.wav`;
        await FileSystem.writeAsStringAsync(path, wavBase64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const blob = await FileSystem.readAsStringAsync(path, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const res = await fetch(
          `http://${opts.jarvisIp}:${opts.jarvisPort || 7900}/api/transcribe`,
          {
            method: "POST",
            headers: { "Content-Type": "audio/wav" },
            body: blob,
          }
        );
        const data = await res.json();
        await FileSystem.deleteAsync(path, { idempotent: true });
        return data.text || "";
      } catch (e) {
        console.warn("[STT] remote transcribe failed", e);
        return "";
      }
    },
    [opts.jarvisIp, opts.jarvisPort]
  );

  // Phase 2: on-device via whisper.rn
  // const transcribeLocal = useCallback(async (wavPath: string) => {
  //   const { WhisperContext } = await import("whisper.rn");
  //   const ctx = await WhisperContext.load(modelPathRef.current);
  //   const { result } = await ctx.transcribe(wavPath, { language: "en" });
  //   return result;
  // }, []);

  const transcribe = useCallback(
    async (wavBase64: string): Promise<string> => {
      return transcribeRemote(wavBase64);
    },
    [transcribeRemote]
  );

  return { transcribe, modelReady: modelReadyRef.current };
}