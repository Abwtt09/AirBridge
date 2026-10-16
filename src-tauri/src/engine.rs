//! Receiver adapter boundary. Engines produce the normalized local IPC contract;
//! no engine command line or pipeline is accepted from the frontend.
use crate::{audio, settings::Settings};
use std::{path::Path, process::Stdio};
use tokio::process::Command;

pub trait ReceiverEngine {
    fn command(&self, runtime: &Path, settings: &Settings) -> Result<Command, String>;
}
pub struct UxPlay;
impl ReceiverEngine for UxPlay {
    fn command(&self, runtime: &Path, settings: &Settings) -> Result<Command, String> {
        let exe = runtime.join("uxplay.exe");
        if !exe.is_file() {
            return Err("The UxPlay runtime is missing. Build it with npm run engine:build, or reinstall AirBridge.".into());
        }
        let mut cmd = Command::new(exe);
        cmd.current_dir(runtime)
            .args([
                "-n",
                &settings.receiver_name,
                "-nh",
                "-vs",
                "0",
                "-as",
                &audio::sink(settings),
                "-async",
                "no",
                "-vsync",
                "no",
                "-p",
                "5100",
                "-nohold",
                "-rc",
                "airbridge-no-config",
            ])
            .env("GST_PLUGIN_PATH", runtime.join("lib/gstreamer-1.0"))
            .env("GST_PLUGIN_SYSTEM_PATH", runtime.join("lib/gstreamer-1.0"))
            .env("GST_PLUGIN_SCANNER", runtime.join("gst-plugin-scanner.exe"))
            .env(
                "PATH",
                format!(
                    "{};{}",
                    runtime.display(),
                    std::env::var("PATH").unwrap_or_default()
                ),
            )
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .creation_flags(0x08000000)
            .kill_on_drop(true);
        Ok(cmd)
    }
}
