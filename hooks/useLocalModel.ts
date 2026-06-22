import { useEffect, useRef, useCallback } from "react";
import { NativeModules, PermissionsAndroid, Platform } from "react-native";
import { initLlama, LlamaContext, type RNLlamaMessagePart } from "llama.rn";
import * as FileSystem from "expo-file-system";
import { useJarvisStore } from "../utils/store";

const { MemoryManager } = NativeModules;

async function requestNotificationPermission() {
  if (Platform.OS === "android" && Platform.Version >= 33) {
    await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    );
  }
}

const HF_BASE = "https://huggingface.co/bartowski/google_gemma-4-E2B-it-GGUF/resolve/main";
const MODEL_FILENAME  = "google_gemma-4-E2B-it-Q4_K_M.gguf";   // 3.46 GB
const MMPROJ_FILENAME = "mmproj-google_gemma-4-E2B-it-f16.gguf"; // 986 MB
const MODEL_URL  = `${HF_BASE}/${MODEL_FILENAME}`;
const MMPROJ_URL = `${HF_BASE}/${MMPROJ_FILENAME}`;

// Gemma 4 channel token formats observed in the wild:
//   <|channel>REASONING<channel|>REPLY   ← most common
//   <|channel>REASONING<channel>REPLY    ← alternate
//   <|channel|>REASONING<|channel|>REPLY ← symmetric form
// Strip ALL variants; split at first closing-style delimiter.
const CHANNEL_ANY  = /<\|?channel\|?>/gi;
const CHANNEL_OPEN = /^<\|channel\|?>/i;

function parseModelReply(raw: string): { reply: string; log: string } {
  // Try each possible separator in priority order
  for (const sep of ["<channel|>", "<channel>", "<|channel|>"]) {
    const idx = raw.indexOf(sep);
    if (idx !== -1) {
      const log   = raw.slice(0, idx).replace(CHANNEL_ANY, "").trim();
      const reply = raw.slice(idx + sep.length).replace(CHANNEL_ANY, "").trim();
      return { reply, log };
    }
  }

  // Only an opening token (stop fired before separator) — reasoning only, no reply
  if (CHANNEL_OPEN.test(raw)) {
    return { reply: "", log: raw.replace(CHANNEL_ANY, "").trim() };
  }

  return { reply: raw, log: "" };
}

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
  const { setLocalModelLoaded, setLocalModelProgress, setLocalModelError, setLocalModelLog, localRoutingEnabled } =
    useJarvisStore();

  useEffect(() => {
    if (!localRoutingEnabled) return;
    let active = true;
    loadModel(active, (ctx) => { if (active) ctxRef.current = ctx; });
    return () => {
      active = false;
      ctxRef.current?.release();
      ctxRef.current = null;
    };
  }, [localRoutingEnabled]);

  async function loadModel(active: boolean, setCtx: (ctx: LlamaContext) => void) {
    let localCtx: LlamaContext | null = null;
    try {
      setLocalModelError(null);
      await requestNotificationPermission();
      MemoryManager?.startDownloadService("Downloading JARVIS AI model — keep app in background").catch?.(() => {});
      const modelPath  = `${FileSystem.documentDirectory}${MODEL_FILENAME}`;
      const mmprojPath = `${FileSystem.documentDirectory}${MMPROJ_FILENAME}`;

      console.log("[LLM] checking model...");
      await downloadFile(MODEL_URL, modelPath, (pct) =>
        setLocalModelProgress(Math.round(pct * 0.7))
      );

      console.log("[LLM] checking mmproj...");
      await downloadFile(MMPROJ_URL, mmprojPath, (pct) =>
        setLocalModelProgress(70 + Math.round(pct * 0.3))
      );

      // Verify files are complete before handing to llama
      const modelInfo  = await FileSystem.getInfoAsync(modelPath,  { size: true });
      const mmprojInfo = await FileSystem.getInfoAsync(mmprojPath, { size: true });
      const modelSize  = (modelInfo  as any).size ?? 0;
      const mmprojSize = (mmprojInfo as any).size ?? 0;
      console.log(`[LLM] model: ${(modelSize  / 1073741824).toFixed(2)} GB`);
      console.log(`[LLM] mmproj: ${(mmprojSize / 1048576).toFixed(0)} MB`);

      if (modelSize < 2_000_000_000) {
        await FileSystem.deleteAsync(modelPath, { idempotent: true });
        throw new Error(`Model too small (${(modelSize / 1073741824).toFixed(2)} GB) — restart to re-download`);
      }
      if (mmprojSize < 500_000_000) {
        await FileSystem.deleteAsync(mmprojPath, { idempotent: true });
        throw new Error(`mmproj too small (${(mmprojSize / 1048576).toFixed(0)} MB) — restart to re-download`);
      }

      console.log("[LLM] initializing llama context...");
      setLocalModelProgress(95);
      localCtx = await initLlama({
        model: modelPath,
        use_mlock: false,
        n_ctx: 4096,
        n_threads: 4,
        n_gpu_layers: 0,
      });

      if (!active) { localCtx.release(); return; }

      console.log("[LLM] loading mmproj...");
      try {
        const mmCheck = await FileSystem.getInfoAsync(mmprojPath, { size: true });
        const mmSize  = (mmCheck as any).size ?? 0;
        console.log(`[LLM] mmproj size at init: ${(mmSize / 1048576).toFixed(0)} MB`);
        if (mmSize < 900_000_000) {
          await FileSystem.deleteAsync(mmprojPath, { idempotent: true });
          console.warn("[LLM] mmproj truncated — deleted, restart to re-download");
        } else {
          await localCtx.initMultimodal({ path: mmprojPath, use_gpu: false });
          const support = await localCtx.getMultimodalSupport();
          console.log(`[LLM] multimodal: vision=${support.vision} audio=${support.audio}`);
        }
      } catch (e) {
        console.warn("[LLM] mmproj skipped:", e);
      }

      if (!active) { localCtx.release(); return; }

      setCtx(localCtx);
      setLocalModelProgress(100);
      setLocalModelLoaded(true);
      console.log("[LLM] ready");
      MemoryManager?.stopDownloadService().catch?.(() => {});
      MemoryManager?.notifyModelReady().catch?.(() => {});
    } catch (e: any) {
      localCtx?.release();
      const msg = e?.message ?? String(e);
      console.error("[LLM] init failed:", msg);
      setLocalModelError(msg);
      MemoryManager?.stopDownloadService().catch?.(() => {});
    }
  }

  const route = useCallback(
    async (
      text: string,
      conversationContext: string = ""
    ): Promise<{ decision: "local" | "remote"; skillName?: string; localReply?: string }> => {
      if (!ctxRef.current) return { decision: "remote" };

      try {
        const memCtx  = (await getMemoryContext()).slice(0, 800);
        const system  = buildRouterSystem(getSkillsPrompt().slice(0, 600), memCtx);
        const prompt  = conversationContext
          ? `Recent context:\n${conversationContext.slice(0, 400)}\n\nUser: ${text}`
          : `User: ${text}`;

        const result = await ctxRef.current.completion({
          messages: [
            { role: "system", content: system },
            { role: "user",   content: prompt },
          ],
          n_predict: 128,
          temperature: 0.1,
          stop: ["\n\n", "<end_of_turn>", "<|end|>"],
        });

        const { reply, log } = parseModelReply(result.text.trim());
        if (log) setLocalModelLog(log);

        if (!reply || reply.startsWith("ROUTE:") || reply === "ROUTE") {
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
        const mmEnabled = await ctxRef.current.isMultimodalEnabled();
        if (!mmEnabled) return route(text, conversationContext);
        const support = await ctxRef.current.getMultimodalSupport();
        if (!support.vision) return route(text, conversationContext);

        const memCtx = await getMemoryContext();
        const system = buildRouterSystem(getSkillsPrompt(), memCtx);
        const contextPrefix = conversationContext
          ? `Recent context:\n${conversationContext}\n\nUser: `
          : "User: ";

        const content: RNLlamaMessagePart[] = [
          { type: "image_url", image_url: { url: imageUri } },
          { type: "text", text: contextPrefix + text },
        ];

        const result = await ctxRef.current.completion({
          messages: [
            { role: "system", content: system },
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
    [route, getSkillsPrompt, getMemoryContext]
  );

  const routeWithAudio = useCallback(
    async (
      wavBase64: string,
      conversationContext = ""
    ): Promise<{ decision: "local" | "remote" | "no_audio_support"; localReply?: string }> => {
      if (!ctxRef.current) return { decision: "no_audio_support" };

      try {
        const mmEnabled = await ctxRef.current.isMultimodalEnabled();
        if (!mmEnabled) return { decision: "no_audio_support" };
        const support = await ctxRef.current.getMultimodalSupport();
        if (!support.audio) return { decision: "no_audio_support" };

        const memCtx = (await getMemoryContext()).slice(0, 800);
        const system = buildRouterSystem(getSkillsPrompt().slice(0, 600), memCtx);
        const contextPrefix = conversationContext
          ? `Recent context:\n${conversationContext.slice(0, 400)}\n\nUser (voice): `
          : "User (voice): ";

        // Write 16kHz mono WAV to temp file for llama.rn
        const tmpPath = `${FileSystem.cacheDirectory}jarvis_audio_in.wav`;
        await FileSystem.writeAsStringAsync(tmpPath, wavBase64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const content: RNLlamaMessagePart[] = [
          { type: "input_audio", input_audio: { format: "wav", url: tmpPath } },
          { type: "text", text: contextPrefix + "Transcribe and respond." },
        ];

        const result = await ctxRef.current.completion({
          messages: [
            { role: "system", content: system },
            { role: "user", content },
          ],
          n_predict: 128,
          temperature: 0.1,
          stop: ["\n\n", "<end_of_turn>", "<|end|>"],
        });

        const { reply, log } = parseModelReply(result.text.trim());
        if (log) setLocalModelLog(log);
        FileSystem.deleteAsync(tmpPath, { idempotent: true }).catch(() => {});

        if (!reply || reply.startsWith("ROUTE:") || reply === "ROUTE") {
          return { decision: "remote" };
        }
        return { decision: "local", localReply: reply };
      } catch (e) {
        console.warn("[LLM] audio routing error", e);
        return { decision: "no_audio_support" };
      }
    },
    [getSkillsPrompt, getMemoryContext]
  );

  return { route, routeWithVision, routeWithAudio, isLoaded: !!ctxRef.current };
}
