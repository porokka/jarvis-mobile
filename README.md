# JARVIS Mobile

React Native mobile client for JARVIS OS. Voice + chat interface with local Gemma routing via llama.rn.

## Stack

- **Expo 52** (managed workflow → eject to bare for llama.rn)
- **llama.rn** — Gemma 3 1B Q4 on-device routing
- **expo-av** — audio recording + WAV playback
- **WebSocket** → JARVIS react_server.py at port 7900
- **react-native-svg** — lattice face rendering

## Setup

```bash
npx create-expo-app jarvis-mobile --template blank-typescript
# copy these files in, then:
npm install
```

### ⚠️ llama.rn requires bare workflow

```bash
npx expo prebuild
# then build natively:
npx expo run:android
npx expo run:ios
```

llama.rn does not work with Expo Go — needs a dev build.

## Configuration

Edit `utils/store.ts`:
```typescript
jarvisIp: "192.168.1.XXX",  // your WSL2 machine IP
jarvisPort: 7900,
```

Find your WSL2 IP:
```bash
# on WSL2:
ip addr show eth0 | grep 'inet '
# or on Windows:
ipconfig  # look for WSL adapter
```

Make sure react_server.py binds to `0.0.0.0:7900` not `127.0.0.1:7900`.

## Model

Gemma 3 1B Q4_K_M downloads automatically on first launch (~700MB).
Source: `bartowski/gemma-3-1b-it-GGUF` on HuggingFace.

To use a different model, edit `MODEL_URL` and `MODEL_FILENAME` in `hooks/useLocalModel.ts`.

## Architecture

```
[Hold button] → expo-av records WAV
             → base64 → WebSocket → react_server.py
             ← tts_blob (Kokoro WAV) ← response

[Text input] → Gemma 3 1B routes locally or remotely
             → local: answer in ~200ms, no network
             → remote: WebSocket → JARVIS
```

## Phase 2 (coming)

- Whisper tiny GGUF for on-device STT (remove dependency on JARVIS Whisper)
- Kokoro ONNX for on-device TTS
- Background listening with VAD
- Task/reminder local SQLite store
