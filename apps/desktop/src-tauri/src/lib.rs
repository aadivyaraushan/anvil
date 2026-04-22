use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

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
}

// ─── Tauri commands ───────────────────────────────────────────────────────────

/// Start recording mic audio. Returns a recording_id that the frontend uses
/// to track this session. Actual cpal audio capture is stubbed — replace with
/// cpal mic stream when the native audio crate is integrated.
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

    *rec = RecordingState {
        is_recording: true,
        duration_secs: 0,
        project_id: Some(project_id),
        attendee_name: attendee_name.clone(),
        recording_id: Some(recording_id.clone()),
    };

    *state.started_at.lock().map_err(|e| e.to_string())? = Some(Instant::now());

    // TODO: replace stub with cpal mic capture
    // let host = cpal::default_host();
    // let device = host.default_input_device().ok_or("no mic")?;
    // ...

    // Emit state update to all windows
    app.emit("recording-started", &*rec).ok();

    // Update tray icon to red dot state
    update_tray_icon(&app, true);

    Ok(recording_id)
}

/// Stop recording. Saves audio to the Tauri app data directory, returns the
/// local file path so the frontend can POST it to /api/interviews/upload.
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

    rec.is_recording = false;
    rec.duration_secs = duration;

    // TODO: flush cpal stream buffer → write WAV/M4A to disk
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let file_path = data_dir
        .join("recordings")
        .join(format!("{recording_id}.m4a"));

    // Stub: in production write the captured PCM frames here
    std::fs::create_dir_all(file_path.parent().unwrap()).ok();

    app.emit("recording-stopped", &*rec).ok();
    update_tray_icon(&app, false);

    Ok(file_path.to_string_lossy().to_string())
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
    let capsule = app.get_webview_window("capsule").ok_or("no capsule window")?;
    capsule.show().map_err(|e| e.to_string())?;
    capsule.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn hide_capsule(app: AppHandle) -> Result<(), String> {
    let capsule = app.get_webview_window("capsule").ok_or("no capsule window")?;
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
    // Swap tray icon between idle (azure dot) and recording (red dot).
    // Icons must be provided at src-tauri/icons/tray-idle.png and tray-recording.png.
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
    });

    tauri::Builder::default()
        .manage(app_state)
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            // Register ⌥⌘R global shortcut → show capsule
            use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
            app.global_shortcut().on_shortcut("Alt+Meta+R", {
                let handle = app.handle().clone();
                move |_app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        handle
                            .get_webview_window("capsule")
                            .map(|w| { w.show().ok(); w.set_focus().ok(); });
                    }
                }
            })?;

            // Handle anvil:// deep links → forward to main window as event
            app.listen("deep-link://new-url", {
                let handle = app.handle().clone();
                move |event| {
                    handle.emit("deep-link", event.payload()).ok();
                }
            });

            // System tray
            let tray = tauri::tray::TrayIconBuilder::new()
                .id("main")
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
