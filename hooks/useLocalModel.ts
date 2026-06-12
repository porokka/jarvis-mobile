import { useEffect, useRef, useCallback } from "react";
import { initLlama, LlamaContext } from "llama.rn";
import * as FileSystem from "expo-file-system";
import { useJarvisStore } from "../utils/store";

// Download Gemma 3 1B Q4 from HuggingFace or bundle with app
// ~700MB — user downloads on first run
const MODEL_URL =
  "https://huggingface.co/bartowski/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it-Q4_K_M.gguf";
const MODEL_FILENAME = "gemma-3-1b-it-Q4_K_M.gguf";

const ROUTER_SYSTEM = `You are a routing layer for JARVIS, an AI assistant. 
Given a user message, decide if you can answer locally (short factual answers, 
greetings, simple questions, task logging) or must route to the main JARVIS brain.

Rules:
- Answer locally for: greetings, time/date questions, simple math, "log task: X", 
  "remind me: X", "what did I say about X" (from context), small talk
- Route for: complex questions, coding, news, system commands, anything needing 
  real-time data or tool execution

If answering locally: reply with just your answer.
If routing: reply with exactly "ROUTE:" followed by nothing else.

Be very concise. Local answers max 2 sentences.`;

export function useLocalModel() {
  const ctxRef = useRef<LlamaContext | null>(null);
  const { setLocalModelLoaded, setLocalModelProgress, localRoutingEnabled } =
    useJarvisStore();

  useEffect(() => {
    if (!localRoutingEnabled) return;
    loadModel();
    return () => {
      ctxRef.current?.release();
      ctxRef.current = null;
    };
  }, [localRoutingEnabled]);

  async function loadModel() {
    const modelPath = `${FileSystem.documentDirectory}${MODEL_FILENAME}`;
    const info = await FileSystem.getInfoAsync(modelPath);

    if (!info.exists) {
      console.log("[LLM] downloading model...");
      const dl = FileSystem.createDownloadResumable(
        MODEL_URL,
        modelPath,
        {},
        (prog) => {
          const pct = prog.totalBytesWritten / (prog.totalBytesExpectedToWrite || 1);
          setLocalModelProgress(Math.round(pct * 100));
        }
      );
      await dl.downloadAsync();
    }

    console.log("[LLM] loading model...");
    ctxRef.current = await initLlama({
      model: modelPath,
      use_mlock: true,
      n_ctx: 2048,
      n_threads: 4,
      n_gpu_layers: 0, // CPU only on mobile
    });

    setLocalModelLoaded(true);
    console.log("[LLM] model ready");
  }

  const route = useCallback(
    async (
      text: string,
      conversationContext: string = ""
    ): Promise<{ decision: "local" | "remote"; localReply?: string }> => {
      if (!ctxRef.current) return { decision: "remote" };

      try {
        const prompt = conversationContext
          ? `Recent context:\n${conversationContext}\n\nUser: ${text}`
          : `User: ${text}`;

        const result = await ctxRef.current.completion({
          messages: [
            { role: "system", content: ROUTER_SYSTEM },
            { role: "user", content: prompt },
          ],
          n_predict: 128,
          temperature: 0.1,
          stop: ["\n\n", "<end_of_turn>"],
        });

        const reply = result.text.trim();

        if (reply.startsWith("ROUTE:") || reply === "ROUTE") {
          return { decision: "remote" };
        }

        return { decision: "local", localReply: reply };
      } catch (e) {
        console.warn("[LLM] routing error", e);
        return { decision: "remote" };
      }
    },
    []
  );

  return { route, isLoaded: !!ctxRef.current };
}
