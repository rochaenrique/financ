import { vi } from "vitest";

// The data layer talks to localStorage and window directly, and the unit
// tests run in plain Node. This installs minimal in-memory stand-ins for
// just the parts it uses, and returns helpers to inspect and reset them.
export function installBrowserStorage() {
  const data = new Map<string, string>();
  const listeners = new Map<string, Set<() => void>>();

  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, String(value)),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
  });

  vi.stubGlobal("window", {
    addEventListener: (type: string, listener: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener: (type: string, listener: () => void) => listeners.get(type)?.delete(listener),
  });

  return {
    data,
    listenerCount: (type: string) => listeners.get(type)?.size ?? 0,
    // simulates another tab writing to localStorage
    fireStorageEvent: () => listeners.get("storage")?.forEach((listener) => listener()),
  };
}
