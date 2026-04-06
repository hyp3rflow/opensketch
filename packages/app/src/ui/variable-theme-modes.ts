import type { Editor } from "../editor";

export interface ThemeModeOption {
  id: string;
  label: string;
}

const ALIASES: Record<string, string[]> = {
  light: ["light", "day", "default"],
  dark: ["dark", "night"],
};

function normalizeName(name: string): string {
  return (name || "").trim().toLowerCase();
}

export function listThemeModeOptions(editor: Editor): ThemeModeOption[] {
  const collections = JSON.parse(editor.engine.get_collections() || "[]") as any[];
  const names = new Set<string>();

  for (const col of collections) {
    for (const mode of col.modes || []) {
      const n = normalizeName(mode.name);
      if (n) names.add(n);
    }
  }

  const opts: ThemeModeOption[] = [];
  if (Array.from(names).some((n) => ALIASES.light.includes(n))) {
    opts.push({ id: "light", label: "Light" });
  }
  if (Array.from(names).some((n) => ALIASES.dark.includes(n))) {
    opts.push({ id: "dark", label: "Dark" });
  }

  const skip = new Set<string>([...ALIASES.light, ...ALIASES.dark]);
  const custom = Array.from(names)
    .filter((n) => !skip.has(n))
    .sort((a, b) => a.localeCompare(b));
  custom.forEach((n) => opts.push({ id: n, label: n[0].toUpperCase() + n.slice(1) }));
  return opts;
}

export function detectActiveThemeMode(editor: Editor): string {
  const collections = JSON.parse(editor.engine.get_collections() || "[]") as any[];
  const activeNames = new Set<string>();
  for (const col of collections) {
    const active = (col.modes || []).find((m: any) => Number(m.id) === Number(col.active_mode_id));
    if (active?.name) activeNames.add(normalizeName(active.name));
  }
  if (Array.from(activeNames).some((n) => ALIASES.dark.includes(n))) return "dark";
  if (Array.from(activeNames).some((n) => ALIASES.light.includes(n))) return "light";
  const first = Array.from(activeNames)[0];
  return first || "";
}

function modeMatches(targetThemeId: string, modeName: string): boolean {
  const n = normalizeName(modeName);
  if (targetThemeId === "light") return ALIASES.light.includes(n);
  if (targetThemeId === "dark") return ALIASES.dark.includes(n);
  return n === normalizeName(targetThemeId);
}

/**
 * Apply a theme-ish mode across all collections by matching mode name.
 * Returns number of collections switched.
 */
export function applyThemeMode(editor: Editor, themeId: string): number {
  const collections = JSON.parse(editor.engine.get_collections() || "[]") as any[];
  let switched = 0;
  for (const col of collections) {
    const match = (col.modes || []).find((m: any) => modeMatches(themeId, m.name || ""));
    if (!match) continue;
    editor.engine.set_active_mode(BigInt(col.id), BigInt(match.id));
    switched += 1;
  }
  if (switched > 0) {
    editor.engine.apply_variables();
    editor.requestRender();
  }
  return switched;
}
