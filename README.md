# Jarvis Mobile

React Native mobile client for JARVIS OS. On-device Gemma 4 routing, voice interface, camera vision, SQLite memory, and Telegram-loadable skills. Dispatches complex tasks to the main Jarvis desktop via a shared Telegram group.

**Version:** 0.2.0
**Platform:** Android (iOS untested)
**Location:** `E:/coding/jarvis-mobile`

---

## Architecture

```
[Mic / Camera / Text]
        |
  [Whisper STT]  (remote, jarvisIp:7900)
        |
  [Gemma 4 E2B]  on-device via llama.rn
    |- Skill router     picks skill or routes to desktop
    |- Vision (mmproj)  camera frame -> multimodal context
    |- Memory context   recent SQLite memories injected
        |
  .-----+------.
  |            |
[Skills]   [Dispatch]
  |            |
  |      [Telegram Group]  <- Mobile Bot writes
  |            |
  |      [Main Jarvis]     <- reads + executes
  |            |
  '------> [Reply via Bot]
        |
  [TTS / Output]  Kokoro (remote) or expo-speech
```

---

## Requirements

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 18+ | |
| JDK | 17 | `jdk-17.0.15+6` at `%LOCALAPPDATA%\Programs\` |
| Android SDK | API 35 | `%LOCALAPPDATA%\Android\Sdk` |
| NDK | 26.1.10909125 | required by llama.rn |
| CMake | 3.22.1 | exact version — 4.x breaks expo-av |
| Expo CLI | via npx | `npx expo` |

---

## Installation

```powershell
# Navigate to project
cd E:\coding\jarvis-mobile

# Install dependencies (applies patches automatically via postinstall)
npm install

# Prebuild Android native project
npx expo prebuild --platform android

# Set environment (required each new terminal session)
$env:JAVA_HOME    = "$env:LOCALAPPDATA\Programs\jdk-17.0.15+6"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:PATH         = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:PATH"

# Run on emulator or connected device (starts Metro bundler)
npx expo run:android
```

### Local APK build (standalone, no Metro required)

```powershell
cd android
.\gradlew --stop           # kill daemon to pick up JAVA_HOME
.\gradlew assembleRelease
# APK: android\app\build\outputs\apk\release\app-release.apk

# Install to connected device/emulator
adb install android\app\build\outputs\apk\release\app-release.apk
```

### Known build gotchas

| Issue | Fix |
|-------|-----|
| `newArchEnabled=true` required | llama.rn 0.12.4 uses TurboModules |
| `android.enableJetifier=true` | legacy support-lib conflict |
| `jetifier.ignorelist=react-android,...` | prevents OOM during Jetifier |
| CMake must be exactly 3.22.1 | react-native-reanimated hardcodes it; 4.x breaks expo-av |
| `expo-modules-core` AGP 8.x bug | patched via `patches/expo-modules-core+2.2.3.patch` |
| Gradle env vars don't persist | set `$env:JAVA_HOME` manually each session or add to profile |

---

## Configuration

Tap the **⚙ gear** icon on the main screen to open Settings:

| Field | Description |
|-------|-------------|
| Mobile Bot Token | New bot from @BotFather (separate from desktop Jarvis bot) |
| Group Chat ID | Shared Telegram group ID — negative number, e.g. `-100123456789` |
| Jarvis IP | Desktop Jarvis ReAct server IP — LAN only, e.g. `192.168.0.247` |

### Telegram group setup (one-time)

1. Open Telegram → @BotFather → `/newbot` → copy token (this is the **mobile bot token**)
2. Create a new Telegram group
3. Add the mobile bot AND the main Jarvis bot to the group
4. Send any message in the group
5. Visit `https://api.telegram.org/bot{mobile_token}/getUpdates`
6. Find `chat.id` in the response — it's a **negative number** like `-1001234567890`
7. Enter that ID in Settings → Group Chat ID
8. Add the same group chat ID to main Jarvis config so it reads from the group

---

## Skills

Skills are prompt templates that guide Gemma 4 to handle specific intents locally or dispatch structured requests to the desktop.

### Built-in skills (13)

| Skill | What Gemma does |
|-------|----------------|
| `PlanTask` | Structures a coding task spec, ends with `DISPATCH` |
| `LogDecision` | Records technical decisions to SQLite memory |
| `CaptureThought` | Saves ideas/notes with tags to memory |
| `MorningStandup` | Guides a structured daily check-in |
| `ReviewApproach` | Architecture / approach discussion |
| `WebSearch` | `ROUTE: web search for [query]` → main Jarvis |
| `GetNews` | `ROUTE: get latest news about [topic]` → main Jarvis |
| `GetWeather` | `ROUTE: get weather for [location]` → main Jarvis |
| `SetTimer` | `TIMER:[seconds]` → live countdown appears in UI |
| `MakeCall` | `CALL:[number]` → opens phone dialer via Linking |
| `SendSMS` | `SMS:[to]:[body]` → opens Messages app via Linking |
| `SetReminder` | `REMINDER:[HH:MM]:[text]` — push notifications TODO |
| `OpenApp` | `OPEN:[app]` → maps/spotify/youtube/search via Linking |

### Loading new skills via Telegram

Send a message to the shared group:
```
/skill SkillName | one-line description | prompt template for Gemma 4
```

Or drop a `.json` file attachment:
```json
{
  "name": "ReviewPR",
  "description": "Review a pull request for issues",
  "prompt": "When user asks to review a PR, ask for the diff or URL, then analyze for: bugs, security issues, performance, code style."
}
```

Mobile bot replies `✅ Skill loaded: SkillName`. The skill is stored in SQLite and immediately available — Gemma 4's routing context updates on the next message.

---

## Memory

SQLite database via `expo-sqlite ~14.0.0`, stored in the app's document directory.

| Table | Purpose |
|-------|---------|
| `memories` | Conversations, decisions, thoughts with `type`, `content`, `tags`, `created_at` |
| `skills` | Built-in and Telegram-loaded skill definitions with enable/disable |

Recent memories are injected into Gemma 4's system prompt automatically on each message.

---

## Models

Downloaded from HuggingFace on first launch. Progress shown in UI.

| File | Size | Purpose |
|------|------|---------|
| `google_gemma-4-E2B-it-Q4_K_M.gguf` | 3.46 GB | Routing + chat + skill execution |
| `mmproj-google_gemma-4-E2B-it-f16.gguf` | 986 MB | Vision — processes camera frames |

Stored in the app's document directory (`expo-file-system`). Not re-downloaded if already present.

---

## Project Structure

```
jarvis-mobile/
├── app/
│   ├── _layout.tsx          Root layout (Stack navigator, no header)
│   ├── index.tsx            Main Jarvis screen
│   └── settings.tsx         Telegram + network settings
├── components/
│   ├── LatticeFaceRN.tsx    Animated SVG lattice face
│   └── WaveformBars.tsx     Audio waveform visualizer
├── hooks/
│   ├── useLocalModel.ts     Gemma 4 init, routing, vision, skill injection
│   ├── useSkills.ts         Skills CRUD + getSkillsPrompt()
│   ├── useMemory.ts         SQLite read/write + getMemoryContext()
│   ├── useAudio.ts          Record (expo-av) + playback
│   ├── useTelegram.ts       Bot polling, sendText, skill file loading
│   ├── useWhisper.ts        Remote Whisper STT (jarvisIp:7900)
│   └── useCamera.ts         Permission + takePictureAsync frame capture
├── utils/
│   ├── store.ts             Zustand global state
│   ├── db.ts                SQLite schema, seed, Skill/Memory types
│   └── theme.ts             COLORS + design tokens
├── patches/
│   └── expo-modules-core+2.2.3.patch   AGP 8.x components.release fix
├── android/
│   ├── local.properties     sdk.dir + cmake.dir (gitignored)
│   └── gradle.properties    newArch, Jetifier, heap, CMake flags
└── assets/
```

---

## Skill response protocol

Gemma 4 signals actions on the first line of its reply:

| Prefix | App action |
|--------|-----------|
| `ROUTE: ...` | Send to main Jarvis via Telegram group |
| `SKILL:Name\n...` | Skill matched; rest of reply is execution output |
| `TIMER:seconds` | Start countdown, display MM:SS in UI, haptic on finish |
| `CALL:target` | `Linking.openURL('tel:target')` |
| `SMS:to:body` | `Linking.openURL('sms:to?body=...')` |
| `OPEN:app` | `Linking.openURL(...)` for maps/spotify/youtube/search |
| `REMINDER:HH:MM:text` | Placeholder — expo-notifications TODO |
| *(plain text)* | Local answer — display + speak via TTS |

---

## Changelog

### v0.2.0 — 2026-06-19
- SQLite memory system (memories + skills tables, seeded on first run)
- 13 built-in skills covering productivity, phone actions, and web routing
- Telegram skill loading via `/skill` command or `.json` file attachment
- Skill action dispatcher: TIMER, CALL, SMS, OPEN, ROUTE
- Skills + memory context auto-injected into Gemma 4 routing prompt
- Live countdown timer with haptic alert in UI
- Camera repositioned to jaw-level overlay on face
- Settings screen with full Telegram group setup guide
- WebSearch skill added

### v0.1.0 — 2026-06-17
- Initial build: Gemma 4 E2B on-device routing via llama.rn 0.12.4
- Whisper STT via remote jarvis-os (:7900)
- Camera (expo-camera) + microphone with individual mute controls
- Telegram group polling + task dispatch
- Animated lattice face + waveform visualizer
- Zustand store, Expo SDK 52 bare workflow, New Architecture enabled
- Local APK build pipeline (NDK 26 + CMake 3.22.1 + Jetifier)

---

## Related

- **Operation Jarvis** — Desktop AI brain at `E:/coding/jarvis-os`
- **Jarvis Vault** — Obsidian knowledge base at `D:/Jarvis_vault`
- **UE5 MCP** — Unreal Engine control server at `D:/coding/ue-mcp-server`
