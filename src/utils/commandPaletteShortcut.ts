import { ref } from "vue";

import { getSetting, setSetting } from "./settingsStore";

export const COMMAND_PALETTE_SHORTCUT_KEY = "command-palette-shortcut";
export const DEFAULT_COMMAND_PALETTE_SHORTCUT = "Ctrl+K";
export const OPEN_COMMAND_PALETTE_EVENT = "Mindrizzle:open-command-palette";

export const commandPaletteShortcut = ref(DEFAULT_COMMAND_PALETTE_SHORTCUT);

const MODIFIER_ORDER = ["Ctrl", "Alt", "Shift", "Meta"] as const;
const MODIFIER_NAMES: Record<string, (typeof MODIFIER_ORDER)[number]> = {
  ctrl: "Ctrl",
  control: "Ctrl",
  alt: "Alt",
  shift: "Shift",
  meta: "Meta",
  cmd: "Meta",
  command: "Meta",
};
const VALID_SHORTCUT_KEY = /^(?:[A-Z0-9]|F(?:[1-9]|1[0-2])|SPACE)$/;
const MODIFIER_KEY = /^(?:CONTROL|CTRL|ALT|SHIFT|META|COMMAND|CMD)$/;

function normalizeKey(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  if (normalized === " ") return "SPACE";
  return VALID_SHORTCUT_KEY.test(normalized) ? normalized : null;
}

function formatShortcut(
  modifiers: Set<(typeof MODIFIER_ORDER)[number]>,
  key: string,
): string {
  return [...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)), key]
    .join("+");
}

export function normalizeCommandPaletteShortcut(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parts = value.split("+").map((part) => part.trim());
  if (parts.length < 2) return null;

  const modifiers = new Set<(typeof MODIFIER_ORDER)[number]>();
  for (const part of parts.slice(0, -1)) {
    const modifier = MODIFIER_NAMES[part.toLowerCase()];
    if (!modifier || modifiers.has(modifier)) return null;
    modifiers.add(modifier);
  }
  if (!modifiers.has("Ctrl") && !modifiers.has("Alt") && !modifiers.has("Meta"))
    return null;

  const key = normalizeKey(parts[parts.length - 1] ?? "");
  if (!key || MODIFIER_KEY.test(key)) return null;
  return formatShortcut(modifiers, key);
}

export function commandPaletteShortcutFromEvent(
  event: KeyboardEvent,
): string | null {
  const modifiers = new Set<(typeof MODIFIER_ORDER)[number]>();
  if (event.ctrlKey) modifiers.add("Ctrl");
  if (event.altKey) modifiers.add("Alt");
  if (event.shiftKey) modifiers.add("Shift");
  if (event.metaKey) modifiers.add("Meta");
  if (!modifiers.has("Ctrl") && !modifiers.has("Alt") && !modifiers.has("Meta"))
    return null;

  const key = normalizeKey(event.key);
  if (!key || MODIFIER_KEY.test(key)) return null;
  return formatShortcut(modifiers, key);
}

export function matchesCommandPaletteShortcut(event: KeyboardEvent): boolean {
  return (
    commandPaletteShortcutFromEvent(event) === commandPaletteShortcut.value
  );
}

export async function loadCommandPaletteShortcut(): Promise<void> {
  const saved = await getSetting<unknown>(COMMAND_PALETTE_SHORTCUT_KEY);
  if (saved === null) return;
  const normalized = normalizeCommandPaletteShortcut(saved);
  if (!normalized) {
    console.warn("命令面板快捷键无效，使用默认快捷键", saved);
    return;
  }
  commandPaletteShortcut.value = normalized;
}

export async function saveCommandPaletteShortcut(value: string): Promise<void> {
  const normalized = normalizeCommandPaletteShortcut(value);
  if (!normalized) throw new Error("请设置包含 Ctrl、Alt 或 Meta 的快捷键组合");
  await setSetting(COMMAND_PALETTE_SHORTCUT_KEY, normalized);
  commandPaletteShortcut.value = normalized;
}
