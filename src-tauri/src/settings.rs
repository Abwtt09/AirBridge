use serde::{Deserialize, Serialize};
use std::{io::Write, path::Path};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct Settings {
    pub receiver_name: String,
    pub output_id: Option<String>,
    pub volume: f64,
    pub muted: bool,
    pub buffer: Buffer,
    pub theme: Theme,
    pub auto_start: bool,
    pub launch_at_login: bool,
    pub minimize_to_tray: bool,
    pub onboarded: bool,
    pub check_updates: bool,
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub enum Buffer {
    LowLatency,
    #[default]
    Balanced,
    Stable,
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub enum Theme {
    Light,
    Dark,
    #[default]
    System,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            receiver_name: "AirBridge".into(),
            output_id: None,
            volume: 0.8,
            muted: false,
            buffer: Buffer::Balanced,
            theme: Theme::System,
            auto_start: true,
            launch_at_login: false,
            minimize_to_tray: true,
            onboarded: false,
            check_updates: true,
        }
    }
}
impl Settings {
    pub fn validate(&mut self) -> Result<(), String> {
        self.receiver_name = self.receiver_name.trim().to_string();
        if self.receiver_name.is_empty()
            || self.receiver_name.len() > 48
            || self.receiver_name.chars().any(char::is_control)
        {
            return Err(
                "Use a receiver name between 1 and 48 UTF-8 bytes, without control characters."
                    .into(),
            );
        }
        if !self.volume.is_finite() || !(0.0..=1.0).contains(&self.volume) {
            return Err("Volume must be between 0 and 1.".into());
        }
        if let Some(id) = &self.output_id {
            if id.len() > 160
                || !id
                    .chars()
                    .all(|c| c.is_ascii_hexdigit() || "{}.-".contains(c))
            {
                return Err("Invalid Windows audio endpoint identifier.".into());
            }
        }
        Ok(())
    }
    pub fn gain(&self) -> f64 {
        if self.muted {
            0.0
        } else {
            self.volume
        }
    }
    pub fn engine_changed(&self, other: &Self) -> bool {
        self.receiver_name != other.receiver_name
            || self.output_id != other.output_id
            || self.buffer != other.buffer
    }
}
pub fn load(path: &Path) -> Result<Settings, String> {
    match std::fs::read(path) {
        Ok(bytes) => {
            let mut settings: Settings = serde_json::from_slice(&bytes).map_err(|e| {
                format!(
                    "Settings are damaged: {e}. Restore or rename {}.",
                    path.display()
                )
            })?;
            settings.validate()?;
            Ok(settings)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Settings::default()),
        Err(e) => Err(format!("Cannot read settings: {e}")),
    }
}
pub fn save(path: &Path, settings: &Settings) -> Result<(), String> {
    let parent = path.parent().ok_or("Invalid settings path")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut file = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    file.write_all(&serde_json::to_vec_pretty(settings).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    file.as_file().sync_all().map_err(|e| e.to_string())?;
    file.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn atomic_roundtrip_and_replace() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let mut s = Settings::default();
        save(&path, &s).unwrap();
        s.receiver_name = "Studio PC".into();
        save(&path, &s).unwrap();
        assert_eq!(load(&path).unwrap(), s);
    }
    #[test]
    fn corruption_is_reported() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("settings.json");
        std::fs::write(&p, b"bad").unwrap();
        assert!(load(&p).is_err());
    }
    #[test]
    fn update_preference_migrates_and_does_not_restart_audio() {
        let mut old = serde_json::to_value(Settings::default()).unwrap();
        old.as_object_mut().unwrap().remove("checkUpdates");
        let previous: Settings = serde_json::from_value(old).unwrap();
        assert!(previous.check_updates);
        let mut opted_out = previous.clone();
        opted_out.check_updates = false;
        assert!(!previous.engine_changed(&opted_out));
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        save(&path, &opted_out).unwrap();
        assert!(!load(&path).unwrap().check_updates);
    }
    #[test]
    fn reject_injection_and_invalid_gain() {
        let mut s = Settings {
            volume: f64::NAN,
            ..Settings::default()
        };
        assert!(s.validate().is_err());
        s.volume = 1.;
        s.output_id = Some("! fakesink".into());
        assert!(s.validate().is_err());
        s.output_id = None;
        s.receiver_name = "\n".into();
        assert!(s.validate().is_err());
    }
}
