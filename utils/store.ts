import { create } from "zustand";

export type JarvisState = "standby" | "listening" | "thinking" | "speaking";
export type RouterDecision = "local" | "remote";

export interface LogEntry {
  id: number;
  level: "log" | "warn" | "error";
  tag: string;
  msg: string;
  ts: number;
}

export interface Message {
  id: string;
  role: "user" | "jarvis";
  text: string;
  timestamp: number;
  source?: "local" | "remote";
}

interface JarvisStore {
  // Logs
  logs: LogEntry[];
  addLog: (entry: Omit<LogEntry, "id">) => void;
  clearLogs: () => void;

  // Core state
  state: JarvisState;
  emotion: string;
  output: string;
  messages: Message[];

  // Connection / Telegram config
  botToken: string;
  chatId: string;
  wsConnected: boolean;
  jarvisIp: string;
  jarvisPort: number;

  // Model state
  localModelLoaded: boolean;
  localModelProgress: number;
  localModelError: string | null;
  localModelLog: string;

  // Settings
  muted: boolean;
  micMuted: boolean;
  cameraMuted: boolean;
  localRoutingEnabled: boolean;
  routingMode: "brain" | "hybrid" | "remote";
  ttsMode: "local" | "kokoro";

  // Actions
  setState: (s: JarvisState) => void;
  setEmotion: (e: string) => void;
  setOutput: (o: string) => void;
  addMessage: (m: Message) => void;
  updateLastUserMessage: (text: string) => void;
  setBotToken: (v: string) => void;
  setChatId: (v: string) => void;
  setWsConnected: (v: boolean) => void;
  setJarvisIp: (ip: string) => void;
  setLocalModelLoaded: (v: boolean) => void;
  setLocalModelProgress: (v: number) => void;
  setLocalModelError: (e: string | null) => void;
  setLocalModelLog: (log: string) => void;
  setMuted: (v: boolean) => void;
  setMicMuted: (v: boolean) => void;
  setCameraMuted: (v: boolean) => void;
  setLocalRoutingEnabled: (v: boolean) => void;
  setRoutingMode: (m: "brain" | "hybrid" | "remote") => void;
  setTtsMode: (m: "local" | "kokoro") => void;
}

let _logId = 0;

export const useJarvisStore = create<JarvisStore>((set) => ({
  logs: [],
  addLog: (entry) => set((s) => ({
    logs: [...s.logs.slice(-999), { ...entry, id: ++_logId }],
  })),
  clearLogs: () => set({ logs: [] }),

  state: "standby",
  emotion: "neutral",
  output: "Systems online. Ready for input.",
  messages: [],
  botToken: "",
  chatId: "",
  wsConnected: false,
  jarvisIp: "192.168.1.100",
  jarvisPort: 7900,
  localModelLoaded: false,
  localModelProgress: 0,
  localModelError: null,
  localModelLog: "",
  muted: false,
  micMuted: false,
  cameraMuted: false,
  localRoutingEnabled: true,
  routingMode: "hybrid",
  ttsMode: "local",

  setState: (state) => set({ state }),
  setEmotion: (emotion) => set({ emotion }),
  setOutput: (output) => set({ output }),
  addMessage: (m) =>
    set((s) => ({ messages: [...s.messages.slice(-100), m] })),
  updateLastUserMessage: (text) =>
    set((s) => {
      const msgs = [...s.messages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "user") {
          msgs[i] = { ...msgs[i], text };
          break;
        }
      }
      return { messages: msgs };
    }),
  setBotToken: (botToken) => set({ botToken }),
  setChatId: (chatId) => set({ chatId }),
  setWsConnected: (wsConnected) => set({ wsConnected }),
  setJarvisIp: (jarvisIp) => set({ jarvisIp }),
  setLocalModelLoaded: (localModelLoaded) => set({ localModelLoaded }),
  setLocalModelProgress: (localModelProgress) => set({ localModelProgress }),
  setLocalModelError: (localModelError) => set({ localModelError }),
  setLocalModelLog: (localModelLog) => set({ localModelLog }),
  setMuted: (muted) => set({ muted }),
  setMicMuted: (micMuted) => set({ micMuted }),
  setCameraMuted: (cameraMuted) => set({ cameraMuted }),
  setLocalRoutingEnabled: (localRoutingEnabled) => set({ localRoutingEnabled }),
  setRoutingMode: (routingMode) => set({ routingMode }),
  setTtsMode: (ttsMode) => set({ ttsMode }),
}));
