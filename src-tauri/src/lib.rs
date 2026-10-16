mod audio;
mod client_device;
mod diagnostics;
mod engine;
mod networking;
mod platform;
mod receiver;
mod settings;

use receiver::{Receiver, Request};
use serde::Serialize;
use settings::Settings;
use std::os::windows::process::CommandExt;
use std::{
    path::PathBuf,
    sync::atomic::{AtomicBool, Ordering},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_autostart::ManagerExt;

struct AppState {
    settings: tokio::sync::Mutex<Settings>,
    path: PathBuf,
    receiver: Receiver,
    quitting: AtomicBool,
    config_error: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Bootstrap {
    settings: Settings,
    receiver: receiver::Snapshot,
    devices: Vec<audio::OutputDevice>,
    version: &'static str,
    config_error: Option<String>,
}

#[tauri::command]
async fn bootstrap(state: tauri::State<'_, AppState>) -> Result<Bootstrap, String> {
    let devices = tokio::task::spawn_blocking(audio::devices)
        .await
        .map_err(|e| e.to_string())??;
    Ok(Bootstrap {
        settings: state.settings.lock().await.clone(),
        receiver: state.receiver.snapshot(),
        devices,
        version: env!("CARGO_PKG_VERSION"),
        config_error: state.config_error.clone(),
    })
}
#[tauri::command]
async fn output_devices() -> Result<Vec<audio::OutputDevice>, String> {
    tokio::task::spawn_blocking(audio::devices)
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
fn receiver_logs(state: tauri::State<'_, AppState>) -> Vec<diagnostics::LogEntry> {
    state.receiver.logs()
}
#[tauri::command]
async fn save_settings(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    mut settings: Settings,
) -> Result<Settings, String> {
    if let Some(e) = &state.config_error {
        return Err(e.clone());
    }
    settings.validate()?;
    let mut previous = state.settings.lock().await;
    if settings.onboarded
        && !previous.onboarded
        && !matches!(
            state.receiver.snapshot().state.as_str(),
            "ready" | "connected" | "streaming"
        )
    {
        return Err("Start the receiver successfully before completing setup.".into());
    }
    if let Some(id) = &settings.output_id {
        if previous.output_id.as_ref() != Some(id) {
            let devices = tokio::task::spawn_blocking(audio::devices)
                .await
                .map_err(|e| e.to_string())??;
            if !devices.iter().any(|d| &d.id == id) {
                return Err(
                    "That playback device is no longer available. Choose another output.".into(),
                );
            }
        }
    }
    let autostart = app.autolaunch();
    if previous.launch_at_login != settings.launch_at_login {
        (if settings.launch_at_login {
            autostart.enable()
        } else {
            autostart.disable()
        })
        .map_err(|e| format!("Cannot update Windows startup: {e}"))?;
    }
    if let Err(e) = settings::save(&state.path, &settings) {
        if previous.launch_at_login != settings.launch_at_login {
            let _ = if previous.launch_at_login {
                autostart.enable()
            } else {
                autostart.disable()
            };
        }
        return Err(e);
    }
    *previous = settings.clone();
    state
        .receiver
        .send(Request::Configure(settings.clone()))
        .await?;
    app.emit("settings://changed", &settings)
        .map_err(|e| e.to_string())?;
    Ok(settings)
}
#[tauri::command]
async fn start_receiver(state: tauri::State<'_, AppState>) -> Result<(), String> {
    if let Some(e) = &state.config_error {
        return Err(e.clone());
    }
    state
        .receiver
        .send(Request::Start(state.settings.lock().await.clone()))
        .await
}
#[tauri::command]
async fn stop_receiver(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.receiver.stop().await
}
#[tauri::command]
async fn disconnect(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.receiver.send(Request::Disconnect).await
}
#[tauri::command]
async fn prepare_update(state: tauri::State<'_, AppState>) -> Result<bool, String> {
    let running = !matches!(
        state.receiver.snapshot().state.as_str(),
        "stopped" | "error"
    );
    state.receiver.stop().await?;
    Ok(running)
}
#[tauri::command]
fn open_repository() -> Result<(), String> {
    // Fixed project URL only. Frontend/network input cannot select a command or URL.
    std::process::Command::new("explorer.exe")
        .arg("https://github.com/Abwtt09/AirBridge")
        .creation_flags(0x08000000)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}
#[tauri::command]
async fn quit(app: tauri::AppHandle) {
    shutdown(app).await;
}
async fn shutdown(app: tauri::AppHandle) {
    let state = app.state::<AppState>();
    if state.quitting.swap(true, Ordering::SeqCst) {
        return;
    }
    state.receiver.shutdown().await;
    app.exit(0);
}
fn show(app: &tauri::AppHandle, settings: bool) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        if settings {
            let _ = window.emit("navigate://settings", ());
        }
    }
}
// Shared close policy is tested independently of a running WebView.
fn close_to_tray(minimize_to_tray: bool, quitting: bool) -> bool {
    minimize_to_tray && !quitting
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .args(["--background"])
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            bootstrap,
            output_devices,
            receiver_logs,
            save_settings,
            start_receiver,
            stop_receiver,
            disconnect,
            prepare_update,
            open_repository,
            quit
        ])
        .setup(|app| {
            let path = app.path().app_config_dir()?.join("settings.json");
            let (settings, config_error) = match settings::load(&path) {
                Ok(s) => (s, None),
                Err(e) => (Settings::default(), Some(e)),
            };
            let packaged = app.path().resource_dir()?.join("engine");
            let runtime = if cfg!(debug_assertions) {
                PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../engine/runtime")
            } else {
                packaged
            };
            let receiver = Receiver::new(app.handle().clone(), runtime);
            let start = settings.auto_start && settings.onboarded && config_error.is_none();
            app.manage(AppState {
                settings: tokio::sync::Mutex::new(settings.clone()),
                path,
                receiver: receiver.clone(),
                quitting: AtomicBool::new(false),
                config_error,
            });
            let open = MenuItem::with_id(app, "open", "Open AirBridge", true, None::<&str>)?;
            let start_item = MenuItem::with_id(app, "start", "Start receiver", true, None::<&str>)?;
            let stop = MenuItem::with_id(app, "stop", "Stop receiver", true, None::<&str>)?;
            let preferences = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit AirBridge", true, None::<&str>)?;
            let menu =
                Menu::with_items(app, &[&open, &start_item, &stop, &preferences, &quit_item])?;
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("AirBridge · stopped")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        }
                    ) {
                        show(tray.app_handle(), false);
                    }
                })
                .on_menu_event(|app, event| {
                    let app = app.clone();
                    match event.id.as_ref() {
                        "open" => show(&app, false),
                        "settings" => show(&app, true),
                        "start" => {
                            tauri::async_runtime::spawn(async move {
                                let state = app.state::<AppState>();
                                if state.config_error.is_none() {
                                    let _ = state
                                        .receiver
                                        .send(Request::Start(state.settings.lock().await.clone()))
                                        .await;
                                }
                            });
                        }
                        "stop" => {
                            tauri::async_runtime::spawn(async move {
                                let _ = app.state::<AppState>().receiver.stop().await;
                            });
                        }
                        "quit" => {
                            tauri::async_runtime::spawn(shutdown(app));
                        }
                        _ => {}
                    }
                })
                .build(app)?;
            if start {
                tauri::async_runtime::spawn(async move {
                    let _ = receiver.send(Request::Start(settings)).await;
                });
            }
            if std::env::args().any(|a| a == "--background") && start {
                if let Some(window) = app.get_webview_window("main") {
                    window.hide()?;
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<AppState>();
                let minimize = state
                    .settings
                    .try_lock()
                    .map(|s| s.minimize_to_tray)
                    .unwrap_or(true);
                if close_to_tray(minimize, state.quitting.load(Ordering::SeqCst)) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("Unable to initialize AirBridge");
    app.run(|app, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            if !app.state::<AppState>().quitting.load(Ordering::SeqCst) {
                api.prevent_exit();
                tauri::async_runtime::spawn(shutdown(app.clone()));
            }
        }
    });
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn tray_close_policy() {
        assert!(close_to_tray(true, false));
        assert!(!close_to_tray(false, false));
        assert!(!close_to_tray(true, true));
    }
}
