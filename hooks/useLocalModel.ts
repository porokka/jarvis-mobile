import { useEffect, useRef, useCallback } from "react";
import { initLlama, LlamaContext, type RNLlamaMessagePart } from "llama.rn";
import * as FileSystem from "expo-file-system";
import { useJarvisStore } from "../utils/store";

const HF_BASE = "https://huggingface.co/bartowski/google_gemma-4-E2B-it-GGUF/resolve/main";
const MODEL_FILENAME  = "google_gemma-4-E2B-it-Q4_K_M.gguf";   // 3.46 GB
const MMPROJ_FILENAME = "mmproj-google_gemma-4-E2B-it-f16.gguf"; // 986 MB
const MODEL_URL  = `${HF_BASE}/${MODEL_FILENAME}`;
const MMPROJ_URL = `${HF_BASE}/${MMPROJ_FILENAME}`;

function buildRouterSystem(skillsPrompt: string, memoryContext: string): string {
  return `You are a routing layer for JARVIS, an AI assistant.
Given a user message, decide: run a skill locally, answer directly, or route to main JARVIS.

Rules:
- Run a skill for: task planning, logging decisions, morning standup, capturing thoughts, reviewing approaches
- Answer locally for: greetings, time/date, simple math, small talk
- Route (reply "ROUTE:") for: complex coding, news, system commands, anything needing real-time data or tool execution

If running a skill: reply with "SKILL:SkillName" then execute its prompt.
If answering locally: reply with just your answer.
If routing: reply with exactly "ROUTE:".

Be very concise. Local answers max 2 sentences.${skillsPrompt}${memoryContext}`;
}

async function downloadFile(
  url: string,
  dest: string,
  onProgress: (pct: number) => void
) {
  const info = await FileSystem.getInfoAsync(dest);
  if (info.exists) return;
  const dl = FileSystem.createDownloadResumable(url, dest, {}, (prog) => {
    const pct = prog.totalBytesWritten / (prog.totalBytesExpectedToWrite || 1);
    onProgress(Math.round(pct * 100));
  });
  await dl.downloadAsync();
}

export function useLocalModel(
  getSkillsPrompt: () => string = () => "",
  getMemoryContext: () => Promise<string> = async () => ""
) {
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
    const modelPath  = `${FileSystem.documentDirectory}${MODEL_FILENAME}`;
    const mmprojPath = `${FileSystem.documentDirectory}${MMPROJ_FILENAME}`;

    // Download model (~3.46 GB) — progress 0-70%
    console.log("[LLM] checking model...");
    await downloadFile(MODEL_URL, modelPath, (pct) =>
      setLocalModelProgress(Math.round(pct * 0.7))
    );

    // Download mmproj (~986 MB) — progress 70-100%
    console.log("[LLM] checking mmproj...");
    await downloadFile(MMPROJ_URL, mmprojPath, (pct) =>
      setLocalModelProgress(70 + Math.round(pct * 0.3))
    );

    console.log("[LLM] loading model...");
    ctxRef.current = await initLlama({
      model: modelPath,
      use_mlock: true,
      n_ctx: 4096,
      n_threads: 4,
      n_gpu_layers: 0,
    });

    console.log("[LLM] loading mmproj...");
    await ctxRef.current.initMultimodal({
      path: mmprojPath,
      use_gpu: false,
    });

    setLocalModelLoaded(true);
    console.log("[LLM] model + mmproj ready");
  }

  const route = useCallback(
    async (
      text: string,
      conversationContext: string = ""
    ): Promise<{ decision: "local" | "remote"; skillName?: string; localReply?: string }> => {
      if (!ctxRef.current) return { decision: "remote" };

      try {
        const memCtx  = await getMemoryContext();
        const system  = buildRouterSystem(getSkillsPrompt(), memCtx);
        const prompt  = conversationContext
          ? `Recent context:\n${conversationContext}\n\nUser: ${text}`
          : `User: ${text}`;

        const result = await ctxRef.current.completion({
          messages: [
            { role: "system", content: system },
            { role: "user",   content: prompt },
          ],
          n_predict: 256,
          temperature: 0.1,
          stop: ["\n\n", "<end_of_turn>"],
        });

        const reply = result.text.trim();

        if (reply.startsWith("ROUTE:") || reply === "ROUTE") {
          return { decision: "remote" };
        }
        if (reply.startsWith("SKILL:")) {
          const skillName = reply.slice(6).split("\n")[0].trim();
          return { decision: "local", skillName, localReply: reply.slice(reply.indexOf("\n") + 1).trim() };
        }
        return { decision: "local", localReply: reply };
      } catch (e) {
        console.warn("[LLM] routing error", e);
        return { decision: "remote" };
      }
    },
    [getSkillsPrompt, getMemoryContext]
  );

  const routeWithVision = useCallback(
    async (
      text: string,
      imageUri?: string | null,
      conversationContext = ""
    ): Promise<{ decision: "local" | "remote"; localReply?: string }> => {
      if (!ctxRef.current) return { decision: "remote" };
      if (!imageUri) return route(text, conversationContext);

      try {
        const isEnabled = await ctxRef.current.isMultimodalEnabled();
        if (!isEnabled) return route(text, conversationContext);

        const contextPrefix = conversationContext
          ? `Recent context:\n${conversationContext}\n\nUser: `
          : "User: ";

        const content: RNLlamaMessagePart[] = [
          { type: "image_url", image_url: { url: imageUri } },
          { type: "text", text: contextPrefix + text },
        ];

        const result = await ctxRef.current.completion({
          messages: [
            { role: "system", content: ROUTER_SYSTEM },
            { role: "user", content },
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
        console.warn("[LLM] vision routing error, falling back", e);
        return route(text, conversationContext);
      }
    },
    [route]
  );

  return { route, routeWithVision, isLoaded: !!ctxRef.current };
}
