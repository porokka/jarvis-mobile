import * as SQLite from "expo-sqlite";

let _db: SQLite.SQLiteDatabase | null = null;

export interface Skill {
  id: number;
  name: string;
  description: string;
  prompt: string;
  source: "builtin" | "telegram";
  enabled: boolean;
  updated_at: number;
}

export interface Memory {
  id: number;
  type: string;
  content: string;
  tags: string[];
  created_at: number;
}

const BUILTIN_SKILLS: Omit<Skill, "id" | "updated_at">[] = [
  {
    name: "PlanTask",
    description: "Break a coding task into steps for desktop Jarvis to execute",
    prompt:
      "When user describes a coding task or feature, ask clarifying questions (scope, constraints, approach), then produce a structured spec: goal, steps, files to change, acceptance criteria. End with DISPATCH to send to main coder.",
    source: "builtin",
    enabled: true,
  },
  {
    name: "LogDecision",
    description: "Record a technical decision to memory",
    prompt:
      "When user says 'log decision' or describes a technical choice, capture: what was decided, why, alternatives considered. Confirm and save to memory.",
    source: "builtin",
    enabled: true,
  },
  {
    name: "CaptureThought",
    description: "Quickly save a thought or idea",
    prompt:
      "When user wants to capture a thought or idea, record it concisely with any context (project, tags). Confirm it was saved.",
    source: "builtin",
    enabled: true,
  },
  {
    name: "MorningStandup",
    description: "Quick structured morning check-in",
    prompt:
      "Guide user through a standup: yesterday, today, blockers. Summarize and optionally dispatch daily plan to main Jarvis.",
    source: "builtin",
    enabled: true,
  },
  {
    name: "ReviewApproach",
    description: "Talk through a technical approach before coding",
    prompt:
      "When user wants to review an approach or architecture, ask them to describe it, then give feedback: pros, cons, risks, alternatives. Keep it concise.",
    source: "builtin",
    enabled: true,
  },
  // ── Web search ────────────────────────────────────────────────────────
  {
    name: "WebSearch",
    description: "Search the web for any information",
    prompt:
      "When user wants to search the web or asks about something that needs current information, extract the search query. Reply with 'ROUTE: web search for [query]' to dispatch to main Jarvis which has web access.",
    source: "builtin",
    enabled: true,
  },
  // ── News ──────────────────────────────────────────────────────────────
  {
    name: "GetNews",
    description: "Get latest news headlines on a topic",
    prompt:
      "When user asks for news, identify the topic (or 'general' if unspecified). Reply with 'ROUTE: get latest news about [topic]' to dispatch to main Jarvis which has web access.",
    source: "builtin",
    enabled: true,
  },
  // ── Weather ───────────────────────────────────────────────────────────
  {
    name: "GetWeather",
    description: "Get current weather or forecast for a location",
    prompt:
      "When user asks about weather, extract the location (default to 'current location' if not given). Reply with 'ROUTE: get weather for [location]' to dispatch to main Jarvis.",
    source: "builtin",
    enabled: true,
  },
  // ── Timer ─────────────────────────────────────────────────────────────
  {
    name: "SetTimer",
    description: "Set a countdown timer",
    prompt:
      "When user wants a timer, extract the duration. Convert to seconds. Reply with exactly 'TIMER:[seconds]' on the first line, then a brief confirmation on the second line. Example: 'TIMER:300\nTimer set for 5 minutes.'",
    source: "builtin",
    enabled: true,
  },
  // ── Phone actions ─────────────────────────────────────────────────────
  {
    name: "MakeCall",
    description: "Call a contact by name or phone number",
    prompt:
      "When user wants to make a phone call, extract the contact name or number. Reply with exactly 'CALL:[number or contact name]' on the first line, then a brief confirmation.",
    source: "builtin",
    enabled: true,
  },
  {
    name: "SendSMS",
    description: "Send an SMS to a contact",
    prompt:
      "When user wants to send a text message, extract recipient and message text. Reply with exactly 'SMS:[recipient]:[message text]' on the first line, then confirmation.",
    source: "builtin",
    enabled: true,
  },
  {
    name: "SetReminder",
    description: "Set a reminder or alarm at a specific time",
    prompt:
      "When user wants a reminder or alarm, extract the time and what it's for. Reply with exactly 'REMINDER:[HH:MM]:[description]' on the first line, then a confirmation.",
    source: "builtin",
    enabled: true,
  },
  {
    name: "OpenApp",
    description: "Open an app or perform a quick phone action",
    prompt:
      "When user wants to open an app (maps, camera, settings, spotify, etc.), reply with exactly 'OPEN:[app name]' on the first line. For web searches reply 'OPEN:search:[query]'.",
    source: "builtin",
    enabled: true,
  },
];

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;

  _db = await SQLite.openDatabaseAsync("jarvis.db");

  await _db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS memories (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      type       TEXT    NOT NULL,
      content    TEXT    NOT NULL,
      tags       TEXT    NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skills (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL UNIQUE,
      description TEXT    NOT NULL,
      prompt      TEXT    NOT NULL,
      source      TEXT    NOT NULL DEFAULT 'builtin',
      enabled     INTEGER NOT NULL DEFAULT 1,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kill_list (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      package_name TEXT    NOT NULL UNIQUE,
      app_name     TEXT    NOT NULL,
      added_at     INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memories_type    ON memories(type);
    CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);
  `);

  await seedBuiltinSkills(_db);
  return _db;
}

async function seedBuiltinSkills(db: SQLite.SQLiteDatabase) {
  const now = Date.now();
  for (const skill of BUILTIN_SKILLS) {
    await db.runAsync(
      `INSERT OR IGNORE INTO skills (name, description, prompt, source, enabled, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [skill.name, skill.description, skill.prompt, skill.source, 1, now]
    );
  }
}

// ── Kill list ─────────────────────────────────────────────────────────────────

export interface KillEntry {
  id: number;
  package_name: string;
  app_name: string;
  added_at: number;
}

export async function getKillList(): Promise<KillEntry[]> {
  const db = await getDb();
  return db.getAllAsync<KillEntry>("SELECT * FROM kill_list ORDER BY app_name ASC");
}

export async function addToKillList(packageName: string, appName: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "INSERT OR IGNORE INTO kill_list (package_name, app_name, added_at) VALUES (?, ?, ?)",
    [packageName, appName, Date.now()]
  );
}

export async function removeFromKillList(packageName: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM kill_list WHERE package_name = ?", [packageName]);
}
