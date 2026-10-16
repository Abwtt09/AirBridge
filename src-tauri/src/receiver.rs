use crate::{
    audio,
    client_device::{self, ClientDevice},
    diagnostics::{LogBuffer, LogEntry},
    engine::{ReceiverEngine, UxPlay},
    networking,
    platform::ProcessJob,
    settings::Settings,
};
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{Arc, RwLock},
    time::Duration,
};
use tauri::{AppHandle, Emitter};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWriteExt},
    process::{Child, ChildStdin},
    sync::{mpsc, oneshot, Notify},
    time::{interval, Instant},
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub revision: u64,
    pub state: String,
    pub advertised: bool,
    pub client: Option<String>,
    pub client_device: Option<ClientDevice>,
    pub level: f64,
    pub error: Option<String>,
    pub notice: Option<String>,
    pub local_ips: Vec<String>,
    pub engine_version: String,
    pub retries: u8,
    pub output_name: String,
}
impl Default for Snapshot {
    fn default() -> Self {
        Self {
            revision: 0,
            state: "stopped".into(),
            advertised: false,
            client: None,
            client_device: None,
            level: 0.,
            error: None,
            notice: None,
            local_ips: networking::local_ips(),
            engine_version: "UxPlay 1.74 · ec203121".into(),
            retries: 0,
            output_name: "Default Windows output".into(),
        }
    }
}
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct EngineEvent {
    event: String,
    detail: String,
    level: f64,
}
impl Snapshot {
    fn apply(&mut self, event: EngineEvent) {
        match event.event.as_str() {
            "ready" => {
                self.state = "ready".into();
                self.advertised = true;
                self.error = None;
            }
            "connecting" => {
                self.state = "connecting".into();
                self.client = (!event.detail.is_empty()).then_some(event.detail);
                self.client_device = None;
            }
            "model" => self.client_device = client_device::identify(&event.detail),
            "connected" => self.state = "connected".into(),
            "audio" => {
                self.state = "streaming".into();
                self.level = if event.level.is_finite() {
                    event.level.clamp(0., 1.)
                } else {
                    0.
                };
            }
            "paused" => {
                if self.state == "streaming" {
                    self.state = "connected".into();
                }
                self.level = 0.;
            }
            "idle" => {
                self.state = "ready".into();
                self.client = None;
                self.client_device = None;
                self.level = 0.;
            }
            "error" => {
                self.state = "error".into();
                self.error = Some(event.detail);
                self.level = 0.;
            }
            _ => {}
        }
    }
}
pub enum Request {
    Start(Settings),
    Stop(oneshot::Sender<()>),
    Configure(Settings),
    Disconnect,
    Shutdown(oneshot::Sender<()>),
}
#[derive(Clone)]
pub struct Receiver {
    tx: mpsc::Sender<Request>,
    snapshot: Arc<RwLock<Snapshot>>,
    logs: Arc<RwLock<LogBuffer>>,
}
impl Receiver {
    pub fn new(app: AppHandle, runtime: PathBuf) -> Self {
        let (tx, rx) = mpsc::channel(32);
        let snapshot = Arc::new(RwLock::new(Snapshot::default()));
        let logs = Arc::new(RwLock::new(LogBuffer::default()));
        let actor = Actor {
            app,
            runtime,
            rx,
            snapshot: snapshot.clone(),
            logs: logs.clone(),
            view: Snapshot::default(),
            active: None,
            wanted: false,
            settings: Settings::default(),
            retry_at: None,
            generation: 0,
            last_audio: Instant::now(),
            active_output_id: None,
        };
        tauri::async_runtime::spawn(actor.run());
        Self { tx, snapshot, logs }
    }
    pub fn logs(&self) -> Vec<LogEntry> {
        self.logs
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .entries()
    }
    pub fn snapshot(&self) -> Snapshot {
        self.snapshot
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }
    pub async fn send(&self, r: Request) -> Result<(), String> {
        self.tx
            .send(r)
            .await
            .map_err(|_| "Receiver supervisor stopped".into())
    }
    pub async fn stop(&self) -> Result<(), String> {
        let (tx, rx) = oneshot::channel();
        self.send(Request::Stop(tx)).await?;
        rx.await.map_err(|_| "Receiver shutdown failed".into())
    }
    pub async fn shutdown(&self) {
        let (tx, rx) = oneshot::channel();
        if self.send(Request::Shutdown(tx)).await.is_ok() {
            let _ = rx.await;
        }
    }
}
struct Active {
    child: Child,
    stdin: ChildStdin,
    _job: ProcessJob,
    deadline: Instant,
    ready: bool,
}
struct Actor {
    app: AppHandle,
    runtime: PathBuf,
    rx: mpsc::Receiver<Request>,
    snapshot: Arc<RwLock<Snapshot>>,
    logs: Arc<RwLock<LogBuffer>>,
    view: Snapshot,
    active: Option<Active>,
    wanted: bool,
    settings: Settings,
    retry_at: Option<Instant>,
    generation: u64,
    last_audio: Instant,
    active_output_id: Option<String>,
}
enum Output {
    Event(u64, EngineEvent),
    Log(u64, String),
}
impl Actor {
    fn log(&self, level: &str, source: &str, message: &str) {
        let entry = self
            .logs
            .write()
            .unwrap_or_else(|e| e.into_inner())
            .push(level, source, message);
        let _ = self.app.emit("receiver://log", entry);
    }
    fn publish(&mut self) {
        self.view.revision += 1;
        *self.snapshot.write().unwrap_or_else(|e| e.into_inner()) = self.view.clone();
        let _ = self.app.emit("receiver://state", &self.view);
        if let Some(tray) = self.app.tray_by_id("main") {
            let _ = tray.set_tooltip(Some(format!("AirBridge · {}", self.view.state)));
        }
    }
    fn fail(&mut self, error: String) {
        self.log("error", "receiver", &error);
        self.view.state = "error".into();
        self.view.error = Some(error);
        self.view.level = 0.;
        self.view.advertised = false;
        self.publish();
    }
    async fn write(&mut self, line: String) -> Result<(), String> {
        if let Some(active) = &mut self.active {
            tokio::time::timeout(
                Duration::from_secs(2),
                active.stdin.write_all(line.as_bytes()),
            )
            .await
            .map_err(|_| "Receiver control timed out".to_string())?
            .map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    async fn halt(&mut self) {
        self.generation += 1; // ignore buffered events from the previous instance
        if let Some(mut a) = self.active.take() {
            self.log("info", "receiver", "Stopping receiver process");
            let _ = tokio::time::timeout(Duration::from_millis(500), a.stdin.write_all(b"stop\n"))
                .await;
            if tokio::time::timeout(Duration::from_secs(4), a.child.wait())
                .await
                .is_err()
            {
                let _ = a.child.kill().await;
            }
            // Job drop also terminates any decoder helpers, including after a crash.
        }
        self.view.advertised = false;
        self.view.level = 0.;
        self.view.client = None;
        self.view.client_device = None;
    }
    async fn launch(&mut self, out: mpsc::Sender<Output>) -> Result<(), String> {
        self.halt().await;
        self.view.local_ips = networking::local_ips();
        if self.view.local_ips.is_empty() {
            return Err("No private local network address. Connect to your home Wi-Fi or Ethernet, then restart the receiver.".into());
        }
        let devices = tokio::task::spawn_blocking(audio::devices)
            .await
            .map_err(|e| e.to_string())??;
        if devices.is_empty() {
            self.active_output_id = None;
            return Err("Windows has no active playback device. Connect speakers or headphones and restart.".into());
        }
        let mut effective_settings = self.settings.clone();
        if self
            .settings
            .output_id
            .as_ref()
            .is_some_and(|id| !devices.iter().any(|d| &d.id == id))
        {
            effective_settings.output_id = None;
            self.view.notice=Some("Selected audio device disconnected. Using the Windows default output until you choose another device.".into());
        }
        let selected = audio::resolve_output(effective_settings.output_id.as_deref(), &devices)
            .ok_or("Windows has no default playback endpoint. Select a connected output device.")?;
        self.view.output_name = selected.name.clone();
        self.log(
            "info",
            "receiver",
            &format!(
                "Starting {} · Output: {} · Local IPs: {} · TCP 5101",
                self.settings.receiver_name,
                selected.name,
                self.view.local_ips.join(", ")
            ),
        );
        self.active_output_id = Some(selected.id.clone());
        self.generation += 1;
        let mut cmd = UxPlay.command(&self.runtime, &effective_settings)?;
        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Cannot start UxPlay: {e}. Check the bundled DLLs."))?;
        let job = match ProcessJob::attach(child.id().ok_or("Receiver has no process ID")?) {
            Ok(j) => j,
            Err(e) => {
                let _ = child.kill().await;
                return Err(format!("Cannot protect receiver process lifetime: {e}"));
            }
        };
        let stdin = child
            .stdin
            .take()
            .ok_or("Missing receiver control channel")?;
        let stdout = child
            .stdout
            .take()
            .ok_or("Missing receiver event channel")?;
        let stderr = child
            .stderr
            .take()
            .ok_or("Missing receiver error channel")?;
        tokio::spawn(read_output(stdout, out.clone(), self.generation, true));
        tokio::spawn(read_output(stderr, out, self.generation, false));
        self.active = Some(Active {
            child,
            stdin,
            _job: job,
            deadline: Instant::now() + Duration::from_secs(20),
            ready: false,
        });
        self.view.state = "starting".into();
        self.view.error = None;
        self.publish();
        self.write(format!("volume {}\n", self.settings.gain()))
            .await?;
        Ok(())
    }
    async fn run(mut self) {
        let (out_tx, mut out_rx) = mpsc::channel(64);
        let network = Arc::new(Notify::new());
        let _watch = match networking::NetworkWatch::new(network.clone()) {
            Ok(w) => Some(w),
            Err(e) => {
                self.view.notice = Some(e);
                self.publish();
                None
            }
        };
        let mut tick = interval(Duration::from_millis(250));
        let mut network_due: Option<Instant> = None;
        let mut check_audio = Instant::now() + Duration::from_secs(5);
        loop {
            tokio::select! {
                request=self.rx.recv()=>match request {
                    Some(Request::Start(s))=>{self.wanted=true;self.settings=s;self.view.retries=0;self.retry_at=None;if let Err(e)=self.launch(out_tx.clone()).await{self.fail(e);}},
                    Some(Request::Configure(s))=>{
                        let restart=self.settings.engine_changed(&s); self.settings=s;
                        if self.wanted && restart {self.view.retries=0;if let Err(e)=self.launch(out_tx.clone()).await{self.fail(e);}}
                        else if let Err(e)=self.write(format!("volume {}\n",self.settings.gain())).await {self.fail(e);}
                    },
                    Some(Request::Stop(done))=>{self.wanted=false;self.retry_at=None;self.halt().await;self.view.state="stopped".into();self.view.error=None;self.publish();let _=done.send(());},
                    Some(Request::Disconnect)=>{if let Err(e)=self.write("disconnect\n".into()).await{self.fail(e);}},
                    Some(Request::Shutdown(done))=>{self.halt().await;let _=done.send(());break;},
                    None=>{self.halt().await;break;}
                },
                Some(output)=out_rx.recv()=>match output {
                    Output::Event(gen,e) if gen==self.generation=>{
                        if e.event=="diagnostic" {self.log("info", "protocol", &e.detail);continue;}
                        if e.event!="audio" {self.log(if e.event=="error" {"error"} else {"info"}, "engine", &format!("{}: {}",e.event,e.detail));}
                        if e.event=="ready" {if let Some(a)=&mut self.active {a.ready=true;}}
                        if e.event=="audio" {self.last_audio=Instant::now();}
                        let is_error=e.event=="error";
                        self.view.apply(e);self.publish();
                        if is_error {self.halt().await;self.view.advertised=false;self.publish();}
                    },
                    Output::Log(gen,line) if gen==self.generation=>{
                        if line.contains("httpd error in parsing") {self.log("error", "protocol", "Protocol request could not be parsed; raw payload omitted");}
                        else if line.contains("client closed connection") || line.contains("Connection closed on socket") {self.log("info", "protocol", "TCP connection closed");}
                    },
                    _=>{}
                },
                _=network.notified()=>{network_due=Some(Instant::now()+Duration::from_secs(1));},
                _=tick.tick()=>{
                    if network_due.is_some_and(|d|Instant::now()>=d) {
                        network_due=None;let ips=networking::local_ips();
                        if ips!=self.view.local_ips {self.view.local_ips=ips;self.publish();if self.wanted {self.view.retries=0;if let Err(e)=self.launch(out_tx.clone()).await{self.fail(e);}}}
                    }
                    let mut failure=None;
                    if let Some(a)=&mut self.active {
                        match a.child.try_wait() {Ok(Some(code))=>failure=Some(format!("Receiver exited ({code}). Check runtime dependencies and restart.")),Err(e)=>failure=Some(e.to_string()),_=>{}}
                        if !a.ready && Instant::now()>a.deadline {failure=Some("Receiver did not confirm startup within 20 seconds.".into());}
                    }
                    if let Some(e)=failure {
                        self.halt().await;self.fail(e);
                        if self.wanted && self.view.retries<3 {self.view.retries+=1;self.retry_at=Some(Instant::now()+Duration::from_secs(1<<self.view.retries));}
                    }
                    if self.retry_at.is_some_and(|d|Instant::now()>=d) {self.retry_at=None;if let Err(e)=self.launch(out_tx.clone()).await{self.fail(e);}}
                    if self.view.state=="streaming" && self.last_audio.elapsed()>Duration::from_secs(2) {self.view.state="connected".into();self.view.level=0.;self.publish();}
                    if self.wanted && Instant::now()>check_audio {
                        check_audio=Instant::now()+Duration::from_secs(5);
                        if let Ok(Ok(devices))=tokio::task::spawn_blocking(audio::devices).await {
                            let current=audio::resolve_output(self.settings.output_id.as_deref(),&devices);
                            let next_id=current.map(|d|d.id.clone());
                            if next_id!=self.active_output_id {
                                if let Err(e)=self.launch(out_tx.clone()).await {self.fail(e);}
                                let _=self.app.emit("audio://devices-changed",());
                            }
                        }
                    }
                }
            }
        }
    }
}
// Never allocate an unbounded line, even if a compromised child writes malformed IPC.
async fn read_output(
    mut reader: impl AsyncRead + Unpin,
    tx: mpsc::Sender<Output>,
    gen: u64,
    events: bool,
) {
    let mut buf = [0u8; 2048];
    let mut line = Vec::with_capacity(1024);
    let mut overlong = false;
    loop {
        let n = match reader.read(&mut buf).await {
            Ok(0) | Err(_) => break,
            Ok(n) => n,
        };
        for &b in &buf[..n] {
            if b == b'\n' {
                if !overlong {
                    let s = String::from_utf8_lossy(&line);
                    let output = if events {
                        s.strip_prefix("AIRBRIDGE:")
                            .and_then(|json| serde_json::from_str::<EngineEvent>(json).ok())
                            .map(|e| Output::Event(gen, e))
                    } else {
                        Some(Output::Log(gen, s.chars().take(512).collect()))
                    };
                    if let Some(output) = output {
                        if tx.send(output).await.is_err() {
                            return;
                        }
                    }
                }
                line.clear();
                overlong = false;
            } else if line.len() < 16384 {
                line.push(b);
            } else {
                overlong = true;
            }
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn event(s: &str) -> EngineEvent {
        serde_json::from_str(s).unwrap()
    }
    #[test]
    fn discovery_requires_explicit_ready() {
        let mut s = Snapshot {
            state: "starting".into(),
            ..Snapshot::default()
        };
        assert!(!s.advertised);
        s.apply(event(r#"{"event":"ready","detail":"","level":0}"#));
        assert!(s.advertised);
        assert_eq!(s.state, "ready");
    }
    #[test]
    fn no_fake_audio_or_metadata() {
        let mut s = Snapshot::default();
        s.apply(event(
            r#"{"event":"connecting","detail":"iPhone","level":0}"#,
        ));
        assert_eq!(s.level, 0.);
        assert_eq!(s.state, "connecting");
        s.apply(event(
            r#"{"event":"model","detail":"iPhone17,3","level":0}"#,
        ));
        assert_eq!(s.client_device.as_ref().unwrap().label, "iPhone 16");
        s.apply(event(r#"{"event":"audio","detail":"","level":0.25}"#));
        assert_eq!(s.level, 0.25);
        assert_eq!(s.state, "streaming");
        s.apply(event(r#"{"event":"idle","detail":"","level":0}"#));
        assert!(s.client.is_none());
        assert!(s.client_device.is_none());
        assert_eq!(s.level, 0.);
    }
    #[tokio::test]
    async fn bounded_reader_rejects_oversized_input() {
        let (tx, mut rx) = mpsc::channel(3);
        let mut bytes = vec![b'x'; 20000];
        bytes.extend_from_slice(b"\nAIRBRIDGE:{\"event\":\"ready\",\"detail\":\"\",\"level\":0}\n");
        read_output(&bytes[..], tx, 1, true).await;
        assert!(matches!(rx.recv().await, Some(Output::Event(1, _))));
        assert!(rx.recv().await.is_none());
    }
}
