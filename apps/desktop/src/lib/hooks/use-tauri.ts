"use client";

// Safe wrappers around Tauri invoke — all return null gracefully when the
// app is running in a browser (dev) rather than inside Tauri.
//
// Detection: Tauri v2 sets `window.__TAURI_INTERNALS__`. We check that plus
// the legacy `__TAURI__` key so this keeps working if either surface exists.

function detectTauri(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}

export function useTauri() {
  const isTauri = detectTauri();

  const invoke = async <T = unknown>(
    cmd: string,
    args?: Record<string, unknown>
  ): Promise<T | null> => {
    if (!isTauri) return null;
    const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
    return tauriInvoke<T>(cmd, args);
  };

  const emit = async (event: string, payload?: unknown): Promise<void> => {
    if (!isTauri) return;
    const { emit: tauriEmit } = await import("@tauri-apps/api/event");
    await tauriEmit(event, payload);
  };

  const listen = async <T = unknown>(
    event: string,
    handler: (payload: T) => void
  ): Promise<(() => void) | null> => {
    if (!isTauri) return null;
    const { listen: tauriListen } = await import("@tauri-apps/api/event");
    const unlisten = await tauriListen<T>(event, (e) => handler(e.payload));
    return unlisten;
  };

  // Read a file from disk via tauri-plugin-fs. Only usable inside Tauri;
  // returns null when running in a browser. The path must be inside the
  // capability scope declared in src-tauri/capabilities/default.json
  // (currently: $APPDATA/recordings/**).
  const readFileBytes = async (path: string): Promise<Uint8Array | null> => {
    if (!isTauri) return null;
    const { readFile } = await import("@tauri-apps/plugin-fs");
    return readFile(path);
  };

  return { isTauri, invoke, emit, listen, readFileBytes };
}
