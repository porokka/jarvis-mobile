#!/usr/bin/env node
// Adds addListener/removeListeners stubs required by React Native 0.65+
// to react-native-audio-record's Android module (the library doesn't include them).
const fs = require("fs");
const path = require("path");

const target = path.join(
  __dirname, "..", "node_modules", "react-native-audio-record",
  "android", "src", "main", "java", "com", "goodatlas", "audiorecord",
  "RNAudioRecordModule.java"
);

if (!fs.existsSync(target)) {
  console.log("[patch] react-native-audio-record not found, skipping");
  process.exit(0);
}

let src = fs.readFileSync(target, "utf8");

if (src.includes("addListener")) {
  console.log("[patch] react-native-audio-record already patched");
  process.exit(0);
}

const ANCHOR = "    @ReactMethod\n    public void stop(Promise promise) {";
const INSERTION = [
  "",
  "    // Required by React Native's NativeEventEmitter — no-ops are sufficient.",
  "    @ReactMethod",
  "    public void addListener(String eventName) {}",
  "",
  "    @ReactMethod",
  "    public void removeListeners(Integer count) {}",
].join("\n");

const stopEnd = "        stopRecordingPromise = promise;\n    }";
src = src.replace(stopEnd, stopEnd + "\n" + INSERTION);
fs.writeFileSync(target, src, "utf8");
console.log("[patch] react-native-audio-record patched OK");
