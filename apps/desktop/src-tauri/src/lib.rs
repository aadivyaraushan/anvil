mod audio;

use audio::AudioController;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Listener, Manager, State, Url};

// Tracks whether the system tray currently shows the recording or idle icon.
// Owned via Mutex so the e2e `__test_get_tray_state` command can read it.
#[derive(Default)]
struct TrayState {
    is_recording_icon: Mutex<bool>,
}

#[derive(Default)]
struct DeepLinkState {
    last_url: Mutex<Option<String>>,
}

// ─── Recording state ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingState {
    pub is_recording: bool,
    pub duration_secs: u64,
    pub project_id: Option<String>,
    pub attendee_name: Option<String>,
    pub recording_id: Option<String>,
}

impl Default for RecordingState {
    fn default() -> Self {
        Self {
            is_recording: false,
            duration_secs: 0,
            project_id: None,
            attendee_name: None,
            recording_id: None,
        }
    }
}

struct AppState {
    recording: Mutex<RecordingState>,
    started_at: Mutex<Option<Instant>>,
    audio: AudioController,
}

// ─── Tauri commands ───────────────────────────────────────────────────────────

/// Start capturing mic audio to a WAV file in the app data directory.
/// Returns a `recording_id` the frontend can use to match start/stop events.
#[tauri::command]
fn start_recording(
    project_id: String,
    attendee_name: Option<String>,
    state: State<Arc<AppState>>,
    app: AppHandle,
) -> Result<String, String> {
    let mut rec = state.recording.lock().map_err(|e| e.to_string())?;
    if rec.is_recording {
        return Err("Already recording".into());
    }

    let recording_id = uuid_v4();

    let file_path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?
        .join("recordings")
        .join(format!("{recording_id}.wav"));

    // Spin up the cpal input stream via the audio controller. This actually
    // starts writing samples to disk immediately; on macOS the first call
    // triggers the system mic-permission prompt.
    state.audio.start(file_path.clone())?;

    *rec = RecordingState {
        is_recording: true,
        duration_secs: 0,
        project_id: Some(project_id),
        attendee_name,
        recording_id: Some(recording_id.clone()),
    };
    *state.started_at.lock().map_err(|e| e.to_string())? = Some(Instant::now());

    app.emit("recording-started", &*rec).ok();
    update_tray_icon(&app, true);

    Ok(recording_id)
}

/// Stop capture. Drops the stream, finalizes the WAV header, and returns the
/// absolute path on disk so the frontend can hand it off to the upload flow.
#[tauri::command]
fn stop_recording(
    recording_id: String,
    state: State<Arc<AppState>>,
    app: AppHandle,
) -> Result<String, String> {
    let mut rec = state.recording.lock().map_err(|e| e.to_string())?;
    if !rec.is_recording {
        return Err("Not recording".into());
    }
    if rec.recording_id.as_deref() != Some(&recording_id) {
        return Err("Recording ID mismatch".into());
    }

    let duration = state
        .started_at
        .lock()
        .ok()
        .and_then(|s| s.map(|t| t.elapsed().as_secs()))
        .unwrap_or(0);

    // Stop the cpal stream and finalize the WAV file.
    let path = state.audio.stop()?;

    rec.is_recording = false;
    rec.duration_secs = duration;

    app.emit("recording-stopped", &*rec).ok();
    update_tray_icon(&app, false);

    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn get_recording_state(state: State<Arc<AppState>>) -> RecordingState {
    let rec = state.recording.lock().unwrap();
    let mut s = rec.clone();
    if s.is_recording {
        if let Ok(started) = state.started_at.lock() {
            if let Some(t) = *started {
                s.duration_secs = t.elapsed().as_secs();
            }
        }
    }
    s
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn uuid_v4() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(0))
        .as_nanos();
    format!("{:x}-{:x}", t, t.wrapping_mul(6364136223846793005))
}

fn update_tray_icon(app: &AppHandle, recording: bool) {
    if let Some(tray) = app.tray_by_id("main") {
        let icon_name = if recording { "tray-recording" } else { "tray-idle" };
        if let Ok(icon) = tauri::image::Image::from_path(
            app.path()
                .resource_dir()
                .unwrap_or_default()
                .join(format!("icons/{icon_name}.png")),
        ) {
            tray.set_icon(Some(icon)).ok();
        }
    }
    // Mirror the icon state into TrayState so e2e tests can assert without
    // hashing the icon bytes (resource lookup races on first-run macOS).
    if let Some(state) = app.try_state::<Arc<TrayState>>() {
        if let Ok(mut flag) = state.is_recording_icon.lock() {
            *flag = recording;
        }
    }
}

fn forward_deep_link(app: &AppHandle, payload: String) -> Result<(), tauri::Error> {
    if let Some(state) = app.try_state::<Arc<DeepLinkState>>() {
        if let Ok(mut last_url) = state.last_url.lock() {
            *last_url = Some(payload.clone());
        }
    }
    if let Some(window) = app.get_webview_window("main") {
        window.emit("deep-link", payload)
    } else {
        app.emit("deep-link", payload)
    }
}

/// Optional e2e-only override of the bundled webview URLs. When
/// `ANVIL_E2E_DEV_URL` is set (e.g. `http://localhost:3000`), navigate the main
/// window to that origin instead of `https://app.anvil-dev.com`.
/// No-op when the env var is unset, so production binaries are unaffected.
fn maybe_override_webview_urls(app: &AppHandle) {
    let Ok(base) = std::env::var("ANVIL_E2E_DEV_URL") else {
        return;
    };
    let base = base.trim_end_matches('/');
    for (label, path) in [("main", "/dashboard")] {
        let url = format!("{base}{path}");
        if let (Some(window), Ok(parsed)) = (app.get_webview_window(label), Url::parse(&url)) {
            if let Err(e) = window.navigate(parsed) {
                eprintln!("[e2e] navigate {label} → {url} failed: {e}");
            }
        }
    }
}

// ─── App entry point ──────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = Arc::new(AppState {
        recording: Mutex::new(RecordingState::default()),
        started_at: Mutex::new(None),
        audio: AudioController::new(),
    });
    let tray_state = Arc::new(TrayState::default());
    let deep_link_state = Arc::new(DeepLinkState::default());

    let builder = tauri::Builder::default()
        .manage(app_state)
        .manage(tray_state)
        .manage(deep_link_state)
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init());

    #[cfg(feature = "e2e")]
    let builder = builder.plugin(tauri_plugin_playwright::init());

    builder
        .setup(|app| {
            // Forward anvil:// deep links to the main window as an event.
            app.listen("deep-link://new-url", {
                let handle = app.handle().clone();
                move |event| {
                    forward_deep_link(&handle, event.payload().to_string()).ok();
                }
            });

            // System tray with id "main" (referenced in update_tray_icon).
            let tray = tauri::tray::TrayIconBuilder::with_id("main")
                .tooltip("Anvil")
                .build(app)?;
            drop(tray);

            // Redirect the prod webviews at a local dev server when running
            // under e2e (gated by env var, not feature flag — even a non-e2e
            // build can be steered to a staging origin if useful).
            maybe_override_webview_urls(app.handle());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_recording,
            stop_recording,
            get_recording_state,
            #[cfg(feature = "e2e")]
            test_commands::__test_get_tray_state,
            #[cfg(feature = "e2e")]
            test_commands::__test_dispatch_deep_link,
            #[cfg(feature = "e2e")]
            test_commands::__test_get_last_deep_link,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Anvil");
}

// ─── Test-only IPC commands (compiled out of production binaries) ────────────

#[cfg(feature = "e2e")]
mod test_commands {
    use super::{forward_deep_link, DeepLinkState, TrayState};
    use std::sync::Arc;
    use tauri::{AppHandle, State};

    /// Returns "recording" or "idle" so the tray spec can assert state without
    /// reading the rendered icon image off the macOS menu bar.
    #[tauri::command]
    pub fn __test_get_tray_state(state: State<Arc<TrayState>>) -> String {
        match state.is_recording_icon.lock() {
            Ok(g) if *g => "recording".to_string(),
            _ => "idle".to_string(),
        }
    }

    /// Emits the same internal event tauri-plugin-deep-link uses. This keeps
    /// the e2e spec focused on our app-level forwarding logic without relying
    /// on whichever installed app macOS LaunchServices picked for anvil://.
    #[tauri::command]
    pub fn __test_dispatch_deep_link(app: AppHandle, url: String) -> Result<(), String> {
        forward_deep_link(&app, url).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn __test_get_last_deep_link(state: State<Arc<DeepLinkState>>) -> Option<String> {
        state.last_url.lock().ok().and_then(|url| url.clone())
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recording_state_default_is_not_recording() {
        let s = RecordingState::default();
        assert!(!s.is_recording);
        assert_eq!(s.duration_secs, 0);
        assert!(s.project_id.is_none());
    }

    #[test]
    fn recording_state_serializes() {
        let s = RecordingState {
            is_recording: true,
            duration_secs: 42,
            project_id: Some("proj-1".into()),
            attendee_name: Some("Sarah Chen".into()),
            recording_id: Some("rec-1".into()),
        };
        let json = serde_json::to_string(&s).unwrap();
        let back: RecordingState = serde_json::from_str(&json).unwrap();
        assert!(back.is_recording);
        assert_eq!(back.duration_secs, 42);
        assert_eq!(back.project_id.as_deref(), Some("proj-1"));
    }

    #[test]
    fn uuid_v4_produces_non_empty_string() {
        let id = uuid_v4();
        assert!(!id.is_empty());
    }
}
