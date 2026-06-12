import { create } from "zustand";

export type JarvisState = "standby" | "listening" | "thinking" | "speaking";
export type RouterDecision = "local" | "remote";

export interface Message {
  id: string;
  role: "user" | "jarvis";
  text: string;
  timestamp: number;
  source?: "local" | "remote";
}

interface JarvisStore {
  // Core state
  state: JarvisState;
  emotion: string;
  output: string;
  messages: Message[];

  // Connection
  wsConnected: boolean;
  jarvisIp: string;
  jarvisPort: number;

  // Model state
  localModelLoaded: boolean;
  localModelProgress: number;

  // Settings
  muted: boolean;
  localRoutingEnabled: boolean;

  // Actions
  setState: (s: JarvisState) => void;
  setEmotion: (e: string) => void;
  setOutput: (o: string) => void;
  addMessage: (m: Message) => void;
  updateLastUserMessage: (text: string) => void;
  setWsConnected: (v: boolean) => void;
  setJarvisIp: (ip: string) => void;
  setLocalModelLoaded: (v: boolean) => void;
  setLocalModelProgress: (v: number) => void;
  setMuted: (v: boolean) => void;
  setLocalRoutingEnabled: (v: boolean) => void;
}

export const useJarvisStore = create<JarvisStore>((set) => ({
  state: "standby",
  emotion: "neutral",
  output: "Systems online. Ready for input.",
  messages: [],
  wsConnected: false,
  jarvisIp: "192.168.1.100", // change to your WSL2 IP
  jarvisPort: 7900,
  localModelLoaded: false,
  localModelProgress: 0,
  muted: false,
  localRoutingEnabled: true,

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
  setWsConnected: (wsConnected) => set({ wsConnected }),
  setJarvisIp: (jarvisIp) => set({ jarvisIp }),
  setLocalModelLoaded: (localModelLoaded) => set({ localModelLoaded }),
  setLocalModelProgress: (localModelProgress) => set({ localModelProgress }),
  setMuted: (muted) => set({ muted }),
  setLocalRoutingEnabled: (localRoutingEnabled) => set({ localRoutingEnabled }),
}));
