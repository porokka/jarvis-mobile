import { useState, useCallback, useEffect } from "react";
import { getDb, type Skill } from "../utils/db";

function rowToSkill(r: any): Skill {
  return { ...r, enabled: !!r.enabled };
}

export function useSkills() {
  const [skills, setSkills] = useState<Skill[]>([]);

  const loadSkills = useCallback(async () => {
    const db = await getDb();
    const rows = await db.getAllAsync<any>(
      "SELECT * FROM skills ORDER BY source ASC, name ASC"
    );
    setSkills(rows.map(rowToSkill));
  }, []);

  useEffect(() => { loadSkills(); }, [loadSkills]);

  const addSkill = useCallback(async (
    name: string,
    description: string,
    prompt: string,
    source: "builtin" | "telegram" = "telegram"
  ) => {
    const db = await getDb();
    await db.runAsync(
      `INSERT OR REPLACE INTO skills (name, description, prompt, source, enabled, updated_at)
       VALUES (?, ?, ?, ?, 1, ?)`,
      [name.trim(), description.trim(), prompt.trim(), source, Date.now()]
    );
    await loadSkills();
    console.log(`[SKILLS] added: ${name}`);
  }, [loadSkills]);

  const toggleSkill = useCallback(async (id: number, enabled: boolean) => {
    const db = await getDb();
    await db.runAsync("UPDATE skills SET enabled = ? WHERE id = ?", [enabled ? 1 : 0, id]);
    await loadSkills();
  }, [loadSkills]);

  const deleteSkill = useCallback(async (id: number) => {
    const db = await getDb();
    await db.runAsync("DELETE FROM skills WHERE id = ? AND source != 'builtin'", [id]);
    await loadSkills();
  }, [loadSkills]);

  // Formats enabled skills as a context block for Gemma4
  const getSkillsPrompt = useCallback((): string => {
    const enabled = skills.filter((s) => s.enabled);
    if (!enabled.length) return "";
    return (
      "\n\nAvailable skills — call one if it fits the user request:\n" +
      enabled.map((s) => `- ${s.name}: ${s.description}`).join("\n")
    );
  }, [skills]);

  return { skills, loadSkills, addSkill, toggleSkill, deleteSkill, getSkillsPrompt };
}
