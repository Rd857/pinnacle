import { SAVE_KEY, SAVE_VERSION } from "./constants";
import { deserialize, serialize, emptyState } from "./sim";
import type { SimState } from "./types";

export function hasSave(): boolean {
  try {
    return Boolean(localStorage.getItem(SAVE_KEY));
  } catch {
    return false;
  }
}

export function loadSave(): SimState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version?: number; blob?: string };
    if ((parsed.version ?? 1) !== SAVE_VERSION) return deserialize(raw);
    return deserialize(parsed.blob ?? raw);
  } catch {
    return null;
  }
}

export function writeSave(state: SimState) {
  try {
    const blob = serialize(state);
    localStorage.setItem(`${SAVE_KEY}.bak`, localStorage.getItem(SAVE_KEY) ?? "");
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, blob }));
  } catch {
    /* private mode / quota */
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export function newGame(money?: number): SimState {
  const s = emptyState();
  if (typeof money === "number" && Number.isFinite(money)) {
    s.money = Math.max(0, Math.round(money));
  }
  return s;
}
