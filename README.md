<p align="center"><img src="docs/images/airbridge.png" alt="AirBridge" width="88" /></p>
<h1 align="center">AirBridge</h1>
<p align="center"><strong>Your iPhone's audio. Your PC's speakers.</strong><br/>A local AirPlay audio receiver for Windows 11.</p>
<p align="center"><a href="https://github.com/Abwtt09/AirBridge/releases/latest">Download the latest release</a> · <a href="#how-to-connect">How to connect</a> · <a href="#updates">Updates</a> · <a href="#roadmap">Roadmap</a> · <a href="docs/BUILD.md">Build from source</a></p>

---

AirBridge turns your Windows PC into a real AirPlay audio receiver. Select it from your iPhone's audio output menu and listen through the speakers or headphones chosen in the app, over your local network.

**Windows 11 x64 · Tauri 2 + Rust · React + TypeScript · WASAPI · GPL-3.0-or-later**

> The first release, **0.1.0**, focuses on audio reception. Connection, stable audible playback and model identification were confirmed with **iPhone 16 on iOS 27**. Compatibility with other devices, apps and networks may vary. Screen sharing and file sharing are planned features.

## A look at AirBridge

<p align="center"><img src="docs/images/receiver-dark.png" alt="AirBridge receiver in dark mode" width="43%" /> <img src="docs/images/receiver-light.png" alt="AirBridge receiver in light mode" width="43%" /></p>

**Receiver view:** See connection readiness, streaming status, the selected audio output and application volume. These screenshots show the actual desktop app in dark and light modes.

<p align="center"><img src="docs/images/streaming.png" alt="A real streaming session from an iPhone 16" width="43%" /> <img src="docs/images/settings.png" alt="AirBridge settings" width="43%" /></p>

**While streaming:** The device name and model appear when supplied by the sender, alongside an original device illustration and an activity indicator driven by measured audio levels. The screenshot records a real test session. **Settings:** Startup, audio, network, appearance and update preferences are organized in one place.

## Features

| Feature | Details |
|---|---|
| Real AirPlay reception | Native audio pipeline: UxPlay → GStreamer → Windows WASAPI. |
| Local discovery | mDNS/DNS-SD advertising with a customizable receiver name and local IPv4/IPv6 connections. |
| Audio output selection | Follow the Windows default or select an available USB, Bluetooth or HDMI playback device. Changing the output restarts the receiver. |
| Application volume | Independent volume and mute without changing the Windows master volume. |
| Buffer presets | Low Latency, Balanced and Stable configure WASAPI output buffering; they do not guarantee an end-to-end latency value. |
| Device identification | Known iPhone model names and original phone/iPad illustrations based on the supplied model identifier. Unknown devices receive a generic icon. |
| Measured activity | An RMS-based indicator that pauses when the window is hidden or reduced motion is enabled. |
| Background operation | Close to the system tray, with controls to open the app, start or stop the receiver, and quit. |
| Connection diagnostics | The last 300 events remain in memory, covering connection stages, responses and audio-packet diagnostics. Audio and encryption keys are not logged. |
| Persistent settings | Receiver name, output, volume, appearance, startup and update preferences are saved locally. |
| Signed updates | GitHub release checks and an in-app notice, with download and installation after user selection and signature verification. |

## Download and install

1. Open the [latest release](https://github.com/Abwtt09/AirBridge/releases/latest).
2. Download **`AirBridge_0.1.0_x64-setup.exe`** and install it for your Windows account.
3. Complete onboarding and choose your receiver name and audio output.
4. Allow the receiver, `uxplay.exe`, through Windows Firewall on your trusted private network.

Requirements: **Windows 11 x64**, an available audio output and Microsoft Edge WebView2. If WebView2 is missing, the installer may need internet access to install it. Normal use does not require administrator privileges.

The first installer does not have a Windows Authenticode publisher certificate, so Windows may display an unknown-publisher warning. **Updater signatures** are separate from Windows publisher signing and are verified inside the app. Download official builds from this repository.

## How to connect

1. Connect your PC and iPhone to the same local network.
2. Open AirBridge and wait for **Ready to connect**.
3. In iPhone Control Center, press and hold the **audio card**, then tap the AirPlay icon.
4. Select **AirBridge**, or your custom receiver name.
5. Play audio in a compatible app. AirBridge displays **Streaming audio** when audio arrives.

The **Screen Mirroring** menu is for screen sharing, which is planned for a future release. Selecting an audio destination alone does not start media playback.

If playback stutters, try **Stable** and check your network and selected output. When using a virtual device such as Sonar, ensure it routes to your physical speakers or headphones. See [Troubleshooting](docs/TROUBLESHOOTING.md) and open **Connection logs** from the title bar when needed.

## Updates

- When enabled, AirBridge checks this repository at startup and every six hours.
- A newer release produces an in-app notice with release details.
- Choose **Download and install** to download and verify the update. Audio continues during downloading; the receiver stops before installation and the app restarts afterward.
- Disable automatic checks in **Settings → General**, or check manually in **Settings → About**.
- Audio reception works offline. Update requests go to GitHub for release information and update files.

See [Releases and updates](docs/UPDATES.md) for signing and release preparation instructions.

## Privacy and compatibility

No accounts, subscriptions, usage telemetry or audio recording. Audio is processed locally and is not saved to files. Diagnostic logs remain in session memory and are shared only if you choose to copy them.

This release receives AirPlay audio supported by the selected engine. It is **not a complete implementation of every AirPlay 2 feature**. Screen mirroring, video, multi-room playback and guaranteed protected-content compatibility are not included. Use a trusted local network; device discovery does not authenticate the sender.

Model names depend on information supplied by the device. Some clients provide no model identifier, and this field cannot identify the device's color or storage capacity. Device icons are original simplified illustrations.

<a id="الخطة-المستقبلية"></a>

## Roadmap

These features are **planned and are not available in 0.1.0**. Timing depends on compatibility research and testing.

- [ ] **Screen sharing** from iPhone and iPad, through a module independent of the audio engine.
- [ ] **AirDrop-style local file sharing**, with device selection and approval before receiving files. This does not imply compatibility with Apple's AirDrop protocol.
- [ ] Appearance, animation, accessibility and multi-device experience improvements.
- [ ] Lower memory use, smaller installation size and performance improvements backed by published measurements.
- [ ] Better network stability, reconnection and audio output routing.
- [ ] Additional languages, including Arabic.
- [ ] Research into video and multi-room audio where protocols and licensing permit.

## Development

```powershell
git clone https://github.com/Abwtt09/AirBridge.git
cd AirBridge
npm ci
# Set up MSYS2 and the engine packages first; see docs/BUILD.md.
npm run engine:build
npm run tauri -- dev
```

```powershell
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
python scripts/smoke-engine.py
```

Official release builds require the project's updater signing key; local development does not. The repository contains the modified UxPlay source, while the MSYS2 environment and generated executable files are excluded.

- [Building on Windows](docs/BUILD.md)
- [Architecture and security boundaries](docs/ARCHITECTURE.md)
- [Receiver engine selection and compatibility](docs/FEASIBILITY.md)
- [Validation results and limitations](docs/VALIDATION.md)
- [First release notes](docs/releases/v0.1.0.md)
- [Licenses and corresponding source](THIRD_PARTY_NOTICES.md)

## License and acknowledgments

AirBridge and its UxPlay integration are licensed under **GPL-3.0-or-later**. Other libraries retain their own licenses. Application source, matching native dependency sources and inventories are available as release assets. The large source archives are intended for developers and are not needed to install or use the app.

Thanks to [UxPlay](https://github.com/FDH2/UxPlay), [GStreamer](https://gstreamer.freedesktop.org/), [FFmpeg](https://ffmpeg.org/), [Tauri](https://tauri.app/) and their contributors. AirBridge is independent of Apple Inc. AirPlay and AirDrop are trademarks of Apple Inc.
