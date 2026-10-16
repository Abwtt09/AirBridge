# Receiver feasibility and selection

Research date: 2026-10-15. The repository was empty at the start. No iPhone is attached to this environment. The result is a native implementation candidate; the MVP's iPhone acceptance gate remains open until the checklist in VALIDATION.md is completed.

## Evaluation

| Candidate | Windows and protocols | Audio, authentication, output | Dependencies / redistribution | Decision |
|---|---|---|---|---|
| [FDH2/UxPlay](https://github.com/FDH2/UxPlay) | Documents tested Windows 10/11 x64 builds through MSYS2. Legacy AirPlay audio and AirPlay 2 Mirror are distinct from AirPlay 2 buffered/multi-room audio. | Audio-only ALAC 44.1 kHz stereo; AAC-ELD decoder path. Legacy pair setup/verify, FairPlay session-key processing; optional PIN/password upstream. GStreamer WASAPI sink. | GPLv3+ application, LGPL protocol components, playfair GPL; OpenSSL 3, libplist, GStreamer, FFmpeg, GCC runtime. | **Selected**, supervised executable with an explicit local IPC patch. |
| [Circle1688/AirPlay-Windows](https://github.com/Circle1688/AirPlay-Windows) | Native MSVC port derived from UxPlay, claims current-device operation. Its “AirPlay 2” description is not evidence of complete AirPlay 2 audio or multi-room interoperability. | RAOP, AAC/ALAC and pairing implementation, SDL/WASAPI output. Primarily mirror/video UI. | GPLv3 notices; native Windows DNS registration; OpenSSL, FFmpeg, libplist, SDL, ImGui. Notices explicitly flag uncertain rights to captured FairPlay reply bytes. | Inspected source at `40e0d63cb77da9800574d441fe4a0279d942a94b`. More UI/video code and less established maintenance history than the selected upstream. Not shipped. |
| [Shairport Sync](https://github.com/mikebrady/shairport-sync) | Established audio-focused project. Classic and AirPlay 2 are separate build modes. Main supported hosts are Unix-like; classic Cygwin support does not establish a supported native Win11 AirPlay 2 build. | Audio synchronization, metadata, access controls, AirPlay 2 with limitations; Unix audio backends. | MIT main project plus component notices. AirPlay 2 introduces extra services/libraries including NQPTP. | Strong audio choice for Unix, higher Windows porting/service burden here. Not shipped. |
| [UxPlayEnhanced](https://github.com/Kylepossible/UxPlayEnhanced) | Windows/audio-focused derivative surfaced during research. | Wraps UxPlay. | Additional fork provenance and runtime audit needed. | Prefer maintaining a narrow patch against upstream rather than another wrapper. |

Primary evidence is retained locally in `vendor/uxplay/README.md`, `LICENSE`, source headers, and the pinned commit. Shairport's [README](https://github.com/mikebrady/shairport-sync#readme) and [license inventory](https://github.com/mikebrady/shairport-sync/blob/master/LICENSES) distinguish its support and licensing. Current [UxPlay releases](https://github.com/FDH2/UxPlay/releases) document ongoing maintenance.

## Selected integration

UxPlay source commit: `ec203121355220dd90278a369eeabb0b8ba4f14a`. This checkout identifies itself as **1.74 Experimental**. The internal mDNS responder avoids Apple's Bonjour runtime, but is experimental upstream; this is a release risk to test across adapters and routers. Do not call the build production-validated because it compiles.

Build UxPlay as native UCRT64 code. MSYS2 is a build tool only; its shell is not shipped. GStreamer handles decryption-adjacent decoded audio processing, ALAC/AAC decoding, resampling and WASAPI playback. Rust supervises it in a kill-on-close Windows Job Object. Separate processes isolate native decoder faults and make upstream updates reviewable. A direct Rust port would add substantial unverified protocol/crypto code without an established stability benefit.

The AirBridge patch adds bounded stdout events and fixed stdin controls, limits RTSP request sizes, restricts Windows TCP peers to actual local adapter prefixes, disables advertised video/photo/mirroring features, checks listener startup errors, applies independent application gain, emits measured RMS, and exits cleanly on supervisor EOF. The frontend cannot supply executable paths, shell commands, GStreamer pipelines, recording flags or arbitrary engine arguments.

## Compatibility boundaries

- This release offers legacy AirPlay audio reception. It **does not implement full AirPlay 2 buffered audio, multi-room audio, HomeKit, DRM video, screen mirroring, or video reception**.
- The user confirmed stable audible reception from iPhone 16 on iOS 27 in the local app. This validates one setup only; see VALIDATION.md. Some apps choose unsupported delivery/DRM protocols.
- No password/PIN UI is provided in this MVP. Upstream supports controls, but enabling them requires reliable PIN presentation and pairing-persistence tests. Any reachable trusted-LAN peer may attempt to connect.
- Only audio formats actually handled by the selected renderer are accepted: ALAC and AAC-ELD. Unsupported compression reports an error. AirPlay's network encryption and pairing are provided by upstream, not invented here.
- Receiver name, output endpoint or buffer changes restart the engine, interrupting the current session. Volume/mute work live without changing system master volume.
- Buffer presets configure WASAPI's buffer request. They do not remove sender buffering or provide measured end-to-end latency guarantees. RTP timing and retransmission remain active; client-video timestamp scheduling is disabled for this audio-only pipeline.
- Metadata/artwork are intentionally absent from this UI. No audio files are recorded or persisted. The display uses sanitized client names and locally mapped model identifiers when supplied by the sender.
- The native runtime currently depends on packaged GStreamer/FFmpeg builds. Its measured size is recorded in VALIDATION.md; it has not yet been reduced to a custom codec-only FFmpeg build.

## License decision and release gate

AirBridge is GPL-3.0-or-later, including its integration modifications. This is compatible with the selected GPLv3+ engine and OpenSSL **3** (Apache-2.0); do not substitute OpenSSL 1.x without resolving license compatibility. Preserve individual LGPL/MIT/BSD notices and user replacement/relink rights. The MSYS2 FFmpeg build used here enables GPL and version3; it must not be described as an LGPL-only binary. `--enable-nonfree` is absent in the inspected configuration.

Source licenses do not grant Apple trademarks, patents, or blanket rights to proprietary material. UxPlay's reverse-engineered FairPlay interoperability code/tables retain their upstream provenance. Do not market this as an Apple-certified receiver or claim that prior public redistribution resolves all legal questions. Before public distribution, review that provenance and supply the complete corresponding source/build material for every redistributed GPL/LGPL binary, along with notices. See THIRD_PARTY_NOTICES.md and RELEASE.md. An unsigned local test installer is not a completed public release.
