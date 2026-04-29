import type { TauriPage } from "../fixtures";
import { invoke } from "./ipc";

export type TrayState = "recording" | "idle";

// Calls the e2e-only `__test_get_tray_state` Rust command. The command is
// compiled out of release builds, so this helper is useless (and harmless)
// outside the e2e suite.
export async function readTrayState(tauriPage: TauriPage): Promise<TrayState> {
  const value = await invoke<string>(tauriPage, "__test_get_tray_state");
  if (value !== "recording" && value !== "idle") {
    throw new Error(`unexpected tray state: ${value}`);
  }
  return value;
}
