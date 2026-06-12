import { useRef, useCallback } from "react";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import { useJarvisStore } from "../utils/store";

export function useAudio() {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const { muted } = useJarvisStore();

  // ── Request permissions ──────────────────────────────────────────────────
  const requestPermissions = useCallback(async () => {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== "granted") throw new Error("Mic permission denied");

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
    });
  }, []);

  // ── Start recording ──────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    await requestPermissions();

    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );
    recordingRef.current = recording;
    return recording;
  }, [requestPermissions]);

  // ── Stop recording → base64 WAV ──────────────────────────────────────────
  const stopRecording = useCallback(async (): Promise<string | null> => {
    const recording = recordingRef.current;
    if (!recording) return null;

    await recording.stopAndUnloadAsync();
    recordingRef.current = null;

    const uri = recording.getURI();
    if (!uri) return null;

    // Read as base64
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Clean up temp file
    await FileSystem.deleteAsync(uri, { idempotent: true });

    return base64;
  }, []);

  // ── Play base64 WAV/audio ────────────────────────────────────────────────
  const playAudioBase64 = useCallback(
    async (
      base64: string,
      mime = "audio/wav",
      onEnd?: () => void
    ) => {
      if (muted) {
        onEnd?.();
        return;
      }

      // Unload previous
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const uri = `data:${mime};base64,${base64}`;

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true }
      );

      soundRef.current = sound;

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
          soundRef.current = null;
          onEnd?.();
        }
      });
    },
    [muted]
  );

  // ── Stop playback ────────────────────────────────────────────────────────
  const stopPlayback = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
  }, []);

  // ── Convert float32 PCM → WAV base64 (same as page.tsx) ─────────────────
  const float32ToWavBase64 = useCallback((samples: Float32Array): string => {
    const buf = new ArrayBuffer(44 + samples.length * 2);
    const v = new DataView(buf);
    const w = (o: number, s: string) => {
      for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
    };
    w(0, "RIFF");
    v.setUint32(4, 36 + samples.length * 2, true);
    w(8, "WAVE");
    w(12, "fmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, 16000, true);
    v.setUint32(28, 32000, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    w(36, "data");
    v.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }, []);

  return {
    startRecording,
    stopRecording,
    playAudioBase64,
    stopPlayback,
    float32ToWavBase64,
    requestPermissions,
  };
}
