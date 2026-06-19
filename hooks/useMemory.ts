import { useCallback } from "react";
import { getDb, type Memory } from "../utils/db";

function rowToMemory(r: any): Memory {
  return { ...r, tags: JSON.parse(r.tags || "[]") };
}

export function useMemory() {
  const saveMemory = useCallback(async (
    type: string,
    content: string,
    tags: string[] = []
  ): Promise<void> => {
    const db = await getDb();
    await db.runAsync(
      "INSERT INTO memories (type, content, tags, created_at) VALUES (?, ?, ?, ?)",
      [type, content, JSON.stringify(tags), Date.now()]
    );
    console.log(`[MEM] saved ${type}`);
  }, []);

  const queryRecent = useCallback(async (
    limit = 20,
    type?: string
  ): Promise<Memory[]> => {
    const db = await getDb();
    const rows = type
      ? await db.getAllAsync<any>(
          "SELECT * FROM memories WHERE type = ? ORDER BY created_at DESC LIMIT ?",
          [type, limit]
        )
      : await db.getAllAsync<any>(
          "SELECT * FROM memories ORDER BY created_at DESC LIMIT ?",
          [limit]
        );
    return rows.map(rowToMemory);
  }, []);

  const searchMemory = useCallback(async (query: string): Promise<Memory[]> => {
    const db = await getDb();
    const rows = await db.getAllAsync<any>(
      "SELECT * FROM memories WHERE content LIKE ? ORDER BY created_at DESC LIMIT 20",
      [`%${query}%`]
    );
    return rows.map(rowToMemory);
  }, []);

  // Returns last N memories as a context string for Gemma4
  const getMemoryContext = useCallback(async (limit = 5): Promise<string> => {
    const recent = await queryRecent(limit);
    if (!recent.length) return "";
    return (
      "\n\nRecent memory:\n" +
      recent
        .reverse()
        .map((m) => `[${m.type}] ${m.content}`)
        .join("\n")
    );
  }, [queryRecent]);

  return { saveMemory, queryRecent, searchMemory, getMemoryContext };
}
