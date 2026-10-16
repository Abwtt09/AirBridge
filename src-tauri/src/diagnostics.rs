//! Bounded session diagnostics. No raw protocol payloads or audio are retained.
use serde::Serialize;
use std::{
    collections::VecDeque,
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub id: u64,
    pub timestamp_ms: u64,
    pub level: String,
    pub source: String,
    pub message: String,
}
#[derive(Default)]
pub struct LogBuffer {
    entries: VecDeque<LogEntry>,
    sequence: u64,
}
impl LogBuffer {
    pub fn push(&mut self, level: &str, source: &str, message: &str) -> LogEntry {
        self.sequence += 1;
        let entry = LogEntry {
            id: self.sequence,
            timestamp_ms: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
            level: level.into(),
            source: source.into(),
            message: message
                .chars()
                .filter(|c| !c.is_control())
                .take(512)
                .collect(),
        };
        if self.entries.len() == 300 {
            self.entries.pop_front();
        }
        self.entries.push_back(entry.clone());
        entry
    }
    pub fn entries(&self) -> Vec<LogEntry> {
        self.entries.iter().cloned().collect()
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounds_history_and_untrusted_text() {
        let mut logs = LogBuffer::default();
        for _ in 0..350 {
            logs.push("info", "engine", "ready");
        }
        assert_eq!(logs.entries().len(), 300);
        assert_eq!(logs.entries()[0].id, 51);
        let entry = logs.push("info", "engine", &format!("\n\t{}", "é".repeat(600)));
        assert_eq!(entry.message.chars().count(), 512);
        assert!(!entry.message.contains('\n'));
    }
}
