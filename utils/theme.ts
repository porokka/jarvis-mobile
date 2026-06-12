import { StyleSheet } from "react-native";

export const COLORS = {
  background: "#06060b",
  surface: "#0d0d14",
  surfaceAlt: "#0a0a12",
  border: "rgba(64,160,240,0.12)",
  borderBright: "rgba(64,160,240,0.3)",
  accent: "#40a0f0",
  accentDim: "rgba(64,160,240,0.15)",
  accentGlow: "rgba(64,160,240,0.4)",
  green: "#40f080",
  red: "#f03c3c",
  yellow: "#f0c040",
  orange: "#f08040",
  purple: "#c080f0",
  text: "rgba(255,255,255,0.85)",
  textDim: "rgba(255,255,255,0.4)",
  textFaint: "rgba(255,255,255,0.15)",
};

export const STATE_COLORS: Record<string, string> = {
  standby: COLORS.green,
  listening: COLORS.red,
  thinking: COLORS.yellow,
  speaking: COLORS.accent,
};

export const FONTS = {
  mono: "SpaceMono-Regular",
  // Falls back to system monospace if not loaded
};

export const hud = StyleSheet.create({
  panel: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 2,
  },
  panelTitle: {
    fontSize: 7,
    letterSpacing: 3,
    color: COLORS.accent,
    textTransform: "uppercase",
    opacity: 0.6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  label: {
    fontSize: 8,
    letterSpacing: 2,
    color: COLORS.textDim,
    textTransform: "uppercase",
  },
  value: {
    fontSize: 9,
    letterSpacing: 1,
    color: COLORS.accent,
    textTransform: "uppercase",
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 6,
  },
});
