// Small helpers for browser storage. Everything here stays in this browser:
// nothing is sent anywhere. Storage can be blocked (private windows), so every
// read and write is wrapped and falls back to the default.

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const KEYS = {
  play: "gr.play.v1",
  adopted: "gr.measure.adopted.v1",
  matters: "gr.matters.v1",
} as const;
