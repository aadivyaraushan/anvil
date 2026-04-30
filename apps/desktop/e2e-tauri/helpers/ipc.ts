// Tauri 2 doesn't inject `window.__TAURI__` into remote-loaded webviews,
// even with `withGlobalTauri: true`. The stable surface available is
// `window.__TAURI_INTERNALS__` (invoke, transformCallback, …). All test-side
// IPC and event listening goes through this helper rather than a missing
// `window.__TAURI__.core.invoke`.

import type { TauriPage } from "../fixtures";

export async function invoke<T = unknown>(
  tauriPage: TauriPage,
  command: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const argsJson = JSON.stringify(args);
  return tauriPage.evaluate<T>(
    `(async () => window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)}, ${argsJson}))()`
  );
}

export async function tryInvoke<T = unknown>(
  tauriPage: TauriPage,
  command: string,
  args: Record<string, unknown> = {}
): Promise<T | undefined> {
  try {
    return await invoke<T>(tauriPage, command, args);
  } catch {
    return undefined;
  }
}

export async function isWindowVisible(
  tauriPage: TauriPage,
  label: string
): Promise<boolean> {
  return invoke<boolean>(tauriPage, "plugin:window|is_visible", { label });
}

export async function isWindowAlwaysOnTop(
  tauriPage: TauriPage,
  label: string
): Promise<boolean> {
  return invoke<boolean>(tauriPage, "plugin:window|is_always_on_top", {
    label,
  });
}

// Bridge a one-shot event listen from the WKWebView. The plugin:event|listen
// IPC takes a `handler` callback ID produced by `transformCallback`, which
// turns a JS function into something Rust can invoke by ID. We resolve a
// promise on the first event and unlisten so the spec can `await` it.
export async function awaitEvent<T = unknown>(
  tauriPage: TauriPage,
  eventName: string,
  timeoutMs: number
): Promise<T> {
  const json = await tauriPage.evaluate<string>(
    `(async () => {
       const internals = window.__TAURI_INTERNALS__;
       return await new Promise(async (resolve, reject) => {
         const timer = setTimeout(() => reject(new Error('timeout')), ${timeoutMs});
         let handlerId;
         const cb = internals.transformCallback((event) => {
           clearTimeout(timer);
           if (handlerId !== undefined) {
             internals.invoke('plugin:event|unlisten', { event: ${JSON.stringify(eventName)}, eventId: handlerId }).catch(() => {});
           }
           resolve(JSON.stringify(event));
         });
         try {
           handlerId = await internals.invoke('plugin:event|listen', {
             event: ${JSON.stringify(eventName)},
             target: { kind: 'Any' },
             handler: cb,
           });
         } catch (e) { reject(e); }
       });
     })()`
  );
  return JSON.parse(json) as T;
}

export async function captureNextEvent(
  tauriPage: TauriPage,
  eventName: string,
  slotName = "__ANVIL_E2E_CAPTURED_EVENT__"
): Promise<void> {
  await tauriPage.evaluate(
    `(async () => {
       const internals = window.__TAURI_INTERNALS__;
       window[${JSON.stringify(slotName)}] = null;
       let handlerId;
       const cb = internals.transformCallback((event) => {
         window[${JSON.stringify(slotName)}] = JSON.stringify(event);
         if (handlerId !== undefined) {
           internals.invoke('plugin:event|unlisten', { event: ${JSON.stringify(eventName)}, eventId: handlerId }).catch(() => {});
         }
       });
       handlerId = await internals.invoke('plugin:event|listen', {
         event: ${JSON.stringify(eventName)},
         target: { kind: 'AnyLabel', label: 'main' },
         handler: cb,
       });
     })()`
  );
}

export async function readCapturedEvent<T = unknown>(
  tauriPage: TauriPage,
  slotName = "__ANVIL_E2E_CAPTURED_EVENT__"
): Promise<T | null> {
  const json = await tauriPage.evaluate<string | null>(
    `(() => window[${JSON.stringify(slotName)}] ?? null)()`
  );
  return json ? (JSON.parse(json) as T) : null;
}
