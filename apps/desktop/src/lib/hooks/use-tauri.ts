"use client";

// Safe wrappers around Tauri invoke — all return null gracefully when the
// app is running in a browser (dev) rather than inside Tauri.

export function useTauri() {
  const isTauri =
    typeof window !== "undefined" && "__TAURI__" in window;

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

  return { isTauri, invoke, emit, listen };
}
