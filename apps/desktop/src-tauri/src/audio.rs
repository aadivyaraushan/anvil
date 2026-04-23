//! Mic audio capture using cpal + hound.
//!
//! cpal's `Stream` type is not `Send` on macOS (the CoreAudio backend ties it
//! to a particular thread), so we spawn a dedicated audio thread and
//! communicate with it over a command channel. Tauri command handlers stay on
//! whatever thread pool they run on and just talk to the controller.
//!
//! The output format is 16-bit signed PCM in a standard WAV container.
//! Multichannel and sample-rate conversion are not performed — we record at
//! whatever the default input device prefers, which keeps things simple. The
//! upload endpoint (`/api/interviews/upload`) hands off to Deepgram, which
//! handles whatever sample rate comes in.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use hound::{SampleFormat, WavSpec, WavWriter};
use std::fs::File;
use std::io::BufWriter;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread;

type WriterHandle = Arc<Mutex<Option<WavWriter<BufWriter<File>>>>>;

enum AudioCmd {
    Start {
        path: PathBuf,
        reply: Sender<Result<(), String>>,
    },
    Stop {
        reply: Sender<Result<PathBuf, String>>,
    },
}

/// Thin clonable handle for issuing commands to the audio thread.
pub struct AudioController {
    tx: Sender<AudioCmd>,
}

impl AudioController {
    pub fn new() -> Self {
        let (tx, rx) = channel::<AudioCmd>();
        thread::spawn(move || audio_thread(rx));
        AudioController { tx }
    }

    pub fn start(&self, path: PathBuf) -> Result<(), String> {
        let (reply_tx, reply_rx) = channel();
        self.tx
            .send(AudioCmd::Start {
                path,
                reply: reply_tx,
            })
            .map_err(|e| format!("audio thread gone: {e}"))?;
        reply_rx
            .recv()
            .map_err(|e| format!("audio thread died: {e}"))?
    }

    pub fn stop(&self) -> Result<PathBuf, String> {
        let (reply_tx, reply_rx) = channel();
        self.tx
            .send(AudioCmd::Stop { reply: reply_tx })
            .map_err(|e| format!("audio thread gone: {e}"))?;
        reply_rx
            .recv()
            .map_err(|e| format!("audio thread died: {e}"))?
    }
}

impl Default for AudioController {
    fn default() -> Self {
        Self::new()
    }
}

struct ActiveCapture {
    // Drop order matters: stream first (stops callbacks) before we finalize
    // the writer, otherwise the callback could try to write after finalize.
    _stream: cpal::Stream,
    writer: WriterHandle,
    path: PathBuf,
}

fn audio_thread(rx: Receiver<AudioCmd>) {
    let mut active: Option<ActiveCapture> = None;

    for cmd in rx {
        match cmd {
            AudioCmd::Start { path, reply } => {
                if active.is_some() {
                    let _ = reply.send(Err("Already recording".into()));
                    continue;
                }
                match start_capture(&path) {
                    Ok(cap) => {
                        active = Some(cap);
                        let _ = reply.send(Ok(()));
                    }
                    Err(e) => {
                        let _ = reply.send(Err(e));
                    }
                }
            }
            AudioCmd::Stop { reply } => {
                let Some(cap) = active.take() else {
                    let _ = reply.send(Err("Not recording".into()));
                    continue;
                };
                // Explicitly drop the stream first so no more samples arrive
                // while we're finalizing the WAV file.
                drop(cap._stream);

                let result = (|| -> Result<PathBuf, String> {
                    let writer = cap
                        .writer
                        .lock()
                        .map_err(|e| format!("writer poisoned: {e}"))?
                        .take();
                    match writer {
                        Some(w) => {
                            w.finalize().map_err(|e| format!("finalize: {e}"))?;
                            Ok(cap.path)
                        }
                        None => Err("writer already taken".into()),
                    }
                })();
                let _ = reply.send(result);
            }
        }
    }
}

fn start_capture(path: &Path) -> Result<ActiveCapture, String> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| "No default input device".to_string())?;
    let config = device
        .default_input_config()
        .map_err(|e| format!("query default input config: {e}"))?;

    let sample_rate = config.sample_rate().0;
    let channels = config.channels();

    let spec = WavSpec {
        channels,
        sample_rate,
        bits_per_sample: 16,
        sample_format: SampleFormat::Int,
    };

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    let file = File::create(path).map_err(|e| format!("create wav: {e}"))?;
    let writer: WriterHandle = Arc::new(Mutex::new(Some(
        WavWriter::new(BufWriter::new(file), spec)
            .map_err(|e| format!("wav writer: {e}"))?,
    )));

    let err_fn = |e| eprintln!("audio input stream error: {e}");
    let sample_format = config.sample_format();
    let stream_config: cpal::StreamConfig = config.into();

    let stream = match sample_format {
        cpal::SampleFormat::F32 => {
            let writer_cb = writer.clone();
            device
                .build_input_stream(
                    &stream_config,
                    move |data: &[f32], _| write_f32(data, &writer_cb),
                    err_fn,
                    None,
                )
                .map_err(|e| format!("build f32 stream: {e}"))?
        }
        cpal::SampleFormat::I16 => {
            let writer_cb = writer.clone();
            device
                .build_input_stream(
                    &stream_config,
                    move |data: &[i16], _| write_i16(data, &writer_cb),
                    err_fn,
                    None,
                )
                .map_err(|e| format!("build i16 stream: {e}"))?
        }
        cpal::SampleFormat::U16 => {
            let writer_cb = writer.clone();
            device
                .build_input_stream(
                    &stream_config,
                    move |data: &[u16], _| write_u16(data, &writer_cb),
                    err_fn,
                    None,
                )
                .map_err(|e| format!("build u16 stream: {e}"))?
        }
        other => return Err(format!("Unsupported sample format: {other:?}")),
    };

    stream
        .play()
        .map_err(|e| format!("play stream: {e}"))?;

    Ok(ActiveCapture {
        _stream: stream,
        writer,
        path: path.to_path_buf(),
    })
}

fn write_f32(data: &[f32], writer: &WriterHandle) {
    let Ok(mut guard) = writer.lock() else {
        return;
    };
    let Some(w) = guard.as_mut() else { return };
    for &sample in data {
        let s = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
        let _ = w.write_sample(s);
    }
}

fn write_i16(data: &[i16], writer: &WriterHandle) {
    let Ok(mut guard) = writer.lock() else {
        return;
    };
    let Some(w) = guard.as_mut() else { return };
    for &sample in data {
        let _ = w.write_sample(sample);
    }
}

fn write_u16(data: &[u16], writer: &WriterHandle) {
    let Ok(mut guard) = writer.lock() else {
        return;
    };
    let Some(w) = guard.as_mut() else { return };
    for &sample in data {
        let s = (sample as i32 - 32_768) as i16;
        let _ = w.write_sample(s);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn start_then_stop_without_started_errors_cleanly() {
        let c = AudioController::new();
        let err = c.stop().unwrap_err();
        assert!(err.contains("Not recording"));
    }
}
