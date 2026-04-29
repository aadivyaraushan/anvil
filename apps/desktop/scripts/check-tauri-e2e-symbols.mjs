import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const tauriRoot = path.join(desktopRoot, "src-tauri");

const debugCandidates = [
  path.join(tauriRoot, "target", "debug", "anvil"),
  path.join(tauriRoot, "target", "universal-apple-darwin", "debug", "anvil"),
  path.join(tauriRoot, "target", "debug", "bundle", "macos", "Anvil.app", "Contents", "MacOS", "Anvil"),
  path.join(
    tauriRoot,
    "target",
    "universal-apple-darwin",
    "debug",
    "bundle",
    "macos",
    "Anvil.app",
    "Contents",
    "MacOS",
    "Anvil"
  ),
];

const releaseCandidates = [
  path.join(tauriRoot, "target", "release", "anvil"),
  path.join(tauriRoot, "target", "universal-apple-darwin", "release", "anvil"),
  path.join(tauriRoot, "target", "release", "bundle", "macos", "Anvil.app", "Contents", "MacOS", "Anvil"),
  path.join(
    tauriRoot,
    "target",
    "universal-apple-darwin",
    "release",
    "bundle",
    "macos",
    "Anvil.app",
    "Contents",
    "MacOS",
    "Anvil"
  ),
];

const requiredE2eStrings = [
  "__test_get_tray_state",
  "__test_dispatch_deep_link",
  "__test_get_window_labels",
  "__test_fail_next_recording_start",
  "tauri-plugin-playwright",
];

const forbiddenReleaseStrings = [
  "__test_get_tray_state",
  "__test_dispatch_deep_link",
  "__test_get_window_labels",
  "__test_fail_next_recording_start",
  "__test_make_next_stop_return_missing_file",
  "tauri-plugin-playwright",
  "tauri_playwright",
];

function firstExisting(candidates) {
  return candidates.find((candidate) => existsSync(candidate));
}

function strings(binary) {
  return execFileSync("strings", [binary], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

const e2eBinary = firstExisting(debugCandidates);
if (!e2eBinary) {
  throw new Error(
    `Missing debug e2e Tauri binary. Run 'pnpm --filter desktop tauri:build:e2e'. Checked: ${debugCandidates.join(", ")}`
  );
}

const e2eStrings = strings(e2eBinary);
for (const needle of requiredE2eStrings) {
  if (!e2eStrings.includes(needle)) {
    throw new Error(`Expected e2e binary to contain '${needle}': ${e2eBinary}`);
  }
}

const releaseBinary = firstExisting(releaseCandidates);
if (!releaseBinary) {
  throw new Error(
    `Missing release Tauri binary. Run 'pnpm --filter desktop exec tauri build' before this check. Checked: ${releaseCandidates.join(", ")}`
  );
}

const releaseStrings = strings(releaseBinary);
for (const needle of forbiddenReleaseStrings) {
  if (releaseStrings.includes(needle)) {
    throw new Error(`Production release binary contains e2e-only string '${needle}': ${releaseBinary}`);
  }
}

console.log(`e2e symbols present only in debug/e2e binary:
  e2e:     ${e2eBinary}
  release: ${releaseBinary}`);
