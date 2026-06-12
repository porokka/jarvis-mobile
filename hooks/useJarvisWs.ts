import { useEffect, useRef, useCallback } from "react";
import { useJarvisStore } from "../utils/store";

export type WsMessage =
  | { type: "text"; text: string; transcription?: string }
  | { type: "tts_blob"; audio: string; mime?: string }
  | { type: "audio_start"; sample_rate?: number }
  | { type: "audio_chunk"; audio: string }
  | { type: "audio_end" }
  | { type: "tts"; audio: any[]; sample_rate?: number };

interface UseJarvisWsOptions {
  onText: (text: string, transcription?: string) => void;
  onAudioBlob: (base64: string, mime: string) => void;
  onAudioChunk: (base64: string) => void;
  onAudioEnd: () => void;
}

export function useJarvisWs(opts: UseJarvisWsOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const { jarvisIp, jarvisPort, setWsConnected } = useJarvisStore();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const url = `ws://${jarvisIp}:${jarvisPort}/ws`;
    console.log("[WS] connecting to", url);

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[WS] connected");
      setWsConnected(true);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };

    ws.onclose = () => {
      console.log("[WS] disconnected, reconnecting in 3s");
      setWsConnected(false);
      reconnectRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = (e) => {
      console.warn("[WS] error", e);
    };

    ws.onmessage = ({ data }) => {
      try {
        const msg: WsMessage = JSON.parse(data);

        if (msg.type === "text") {
          optsRef.current.onText(msg.text, msg.transcription);
        } else if (msg.type === "tts_blob") {
          optsRef.current.onAudioBlob(msg.audio, msg.mime || "audio/wav");
        } else if (msg.type === "audio_chunk") {
          optsRef.current.onAudioChunk(msg.audio);
        } else if (msg.type === "audio_end") {
          optsRef.current.onAudioEnd();
        } else if (msg.type === "tts") {
          // Batch TTS — play each chunk
          for (const chunk of msg.audio || []) {
            if (chunk?.audio) optsRef.current.onAudioChunk(chunk.audio);
          }
          optsRef.current.onAudioEnd();
        }
      } catch (e) {
        console.warn("[WS] parse error", e);
      }
    };
  }, [jarvisIp, jarvisPort, setWsConnected]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
      wsRef.current = null;
      setWsConnected(false);
    };
  }, [connect, setWsConnected]);

  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      console.warn("[WS] not connected, dropping message");
    }
  }, []);

  const sendAudio = useCallback(
    (wavBase64: string, imageBase64?: string | null) => {
      send({
        type: "audio",
        audio: wavBase64,
        ...(imageBase64 ? { image: imageBase64 } : {}),
      });
    },
    [send]
  );

  const sendText = useCallback(
    (text: string) => {
      send({
        type: "text",
        text,
        source: "mobile",
      });
    },
    [send]
  );

  const sendInterrupt = useCallback(() => {
    send({ type: "interrupt" });
  }, [send]);

  return { send, sendAudio, sendText, sendInterrupt };
}
