mod audio;

use audio::AudioController;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Listener, Manager, State};

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

#[tauri::command]
fn show_capsule(app: AppHandle) -> Result<(), String> {
    let capsule = app
        .get_webview_window("capsule")
        .ok_or("no capsule window")?;
    capsule.show().map_err(|e| e.to_string())?;
    capsule.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn hide_capsule(app: AppHandle) -> Result<(), String> {
    let capsule = app
        .get_webview_window("capsule")
        .ok_or("no capsule window")?;
    capsule.hide().map_err(|e| e.to_string())
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
}

// ─── App entry point ──────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = Arc::new(AppState {
        recording: Mutex::new(RecordingState::default()),
        started_at: Mutex::new(None),
        audio: AudioController::new(),
    });

    tauri::Builder::default()
        .manage(app_state)
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Register ⌥⌘R global shortcut → show capsule
            use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
            app.global_shortcut().on_shortcut("Alt+Meta+R", {
                let handle = app.handle().clone();
                move |_app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        if let Some(w) = handle.get_webview_window("capsule") {
                            w.show().ok();
                            w.set_focus().ok();
                        }
                    }
                }
            })?;

            // Forward anvil:// deep links to the main window as an event.
            app.listen("deep-link://new-url", {
                let handle = app.handle().clone();
                move |event| {
                    handle.emit("deep-link", event.payload()).ok();
                }
            });

            // System tray with id "main" (referenced in update_tray_icon).
            let tray = tauri::tray::TrayIconBuilder::with_id("main")
                .tooltip("Anvil")
                .build(app)?;
            drop(tray);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_recording,
            stop_recording,
            get_recording_state,
            show_capsule,
            hide_capsule,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Anvil");
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
