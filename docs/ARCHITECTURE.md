# AirBridge architecture

```text
React UI  ← Tauri events ← Rust receiver actor
    │                         │
    └─ validated commands ────┘
                              ├─ atomic local settings
                              ├─ Windows Core Audio endpoint enumeration
                              ├─ Windows IP change notification
                              └─ Windows Job Object → UxPlay executable
                                                      ├─ mDNS _raop / _airplay
                                                      ├─ RTSP + pairing / session keys
                                                      ├─ RAOP UDP + sync / buffering
                                                      └─ ALAC / AAC → GStreamer → WASAPI
```

`src-tauri/src/receiver.rs` is a single-owner actor. Commands are serialized through a bounded channel. Each process generation has its own tag so stale readiness/level events cannot overwrite a stopped/restarted instance. Readiness requires an explicit post-registration engine event, rather than successful process creation. Timeout, unexpected exit, bounded crash recovery, explicit stop, and graceful shutdown are separate paths. Backoff is 2/4/8 seconds with a maximum of three automatic retries per user start. Repeated engine errors remain visible.

`engine.rs` defines the receiver command adapter interface. The UxPlay adapter owns all fixed arguments/environment setup; no frontend option can become an arbitrary engine pipeline or executable path. Native integration tests exercise the actual actor through the desktop command boundary and terminate only the test app's owned child for recovery validation.

The owner tries stdin `stop`, waits up to four seconds, then kills. Job Object closure kills remaining owned helpers. Dropping a Tokio child also kills it. No frontend shell plugin is installed. Quit awaits shutdown; closing the window follows the persisted tray preference. Windows startup is per-user via Tauri's autostart plugin and does not require an elevated app session.

`audio.rs` enumerates active render endpoints through `IMMDeviceEnumerator`, preserving endpoint IDs and the default endpoint. Device IDs are validated and checked against enumeration before applying settings. Output changes restart the engine. The supervisor checks audio availability every five seconds, follows default-device changes, and falls back to default if a selected device disappears. This limited backend hardware check does not cause UI polling. Engine status and samples use events; RMS events are at most ten per second. The UI isolates meter subscriptions from the main app state.

`networking.rs` subscribes to `NotifyUnicastIpAddressChange`. Changes are coalesced before comparing private addresses and re-registering via engine restart. Notification registration failure is visible. The periodic supervisor timer handles deadlines/liveness, not frontend data fetching. Settings are validated and atomically replaced after flush. Corrupted settings stop automatic startup and report a recovery path instead of overwriting evidence.

The engine's only stdin commands are `stop`, `disconnect`, and finite bounded `volume`. Stdout IPC has a fixed `AIRBRIDGE:` prefix and a three-field JSON schema. Rust bounds line memory to 16 KiB and discards oversized lines. Remote strings are JSON escaped. The Logs dialog exposes at most 300 in-memory lifecycle entries and explicitly sanitized protocol summaries through events and a snapshot command. Raw network payloads and stderr are not exposed as log text. Reported client model IDs are mapped locally to a normalized device name/silhouette and cleared on session end. No audio, pairing keys or metadata files are requested by AirBridge's launch arguments. The private test fixtures under artifacts are generated developer input, not received recordings.

Security: on Windows, RTSP accepts loopback or peers matching an on-link prefix on the adapter owning the accepted socket's local address, using `GetAdaptersAddresses`. This includes global-format IPv6 addresses on the home LAN. Temporary IPv6 /128 addresses are checked against the other unicast prefixes on the same adapter, and link-local scope IDs are validated/normalized. Unknown adapters, API failures and off-link peers fail closed. Windows Firewall should additionally restrict the executable to Private profiles and LocalSubnet. An on-link address is not authentication; VPN interfaces can also have on-link prefixes. UDP and the upstream native parser/crypto stack remain an attack surface. This is for trusted LANs. Upstream source has not undergone a full security audit here; see RELEASE.md.

Future receiver adapters can replace the process/event boundary without changing React's Settings/Receiver/OutputDevice contract. New video, mirroring and multi-room modules should get their own capabilities and lifecycle rather than reusing audio UI state. No unused video product module has been scaffolded. The upstream source includes video code but it is disabled for this audio application. All visible UI is currently English; typed string namespaces in `src/lib/i18n.ts` provide the starting point for extracting the remaining copy for localization.

The updater is independent of receiver state. A fixed HTTPS GitHub endpoint is checked after startup and at six-hour intervals when enabled; opt-out is persisted. Only the official repository release download URLs are accepted. Tauri verifies the artifact signature and signed version before the receiver is stopped for installation. Failed checks leave audio running. This is the only automatic internet feature; no audio or diagnostic logs are uploaded.
