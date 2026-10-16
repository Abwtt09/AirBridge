# Windows build

Requirements: Windows 11 x64, Node 24+, npm, Rust MSVC toolchain, Visual Studio C++ Build Tools with Windows SDK, and WebView2. Build tools need network access; the resulting receiver runs locally without internet. Normal usage is per-user and non-administrator.

This workspace uses portable MSYS2 at `.tools/msys64`. On another machine install MSYS2 from [msys2.org](https://www.msys2.org/) or extract its official base archive to that path. Update it per MSYS2 instructions, then in its UCRT64 shell install:

```sh
pacman -S --needed mingw-w64-ucrt-x86_64-gcc mingw-w64-ucrt-x86_64-cmake \
  mingw-w64-ucrt-x86_64-ninja mingw-w64-ucrt-x86_64-pkgconf \
  mingw-w64-ucrt-x86_64-libplist mingw-w64-ucrt-x86_64-openssl \
  mingw-w64-ucrt-x86_64-gstreamer mingw-w64-ucrt-x86_64-gst-plugins-base \
  mingw-w64-ucrt-x86_64-gst-plugins-good mingw-w64-ucrt-x86_64-gst-plugins-bad \
  mingw-w64-ucrt-x86_64-gst-libav
```

`vendor/uxplay` contains the actual pinned source with AirBridge modifications. It does not need to be fetched at app runtime. `scripts/patch-engine.py` reproduces the integration over a clean checkout of upstream commit `ec203121355220dd90278a369eeabb0b8ba4f14a`; do not apply it to arbitrary upstream versions. The checked-in patched source builds directly without Python.

From PowerShell in this directory:

```powershell
npm ci
npm run engine:build
npm run tauri dev
```

For a different MSYS2 location:

```powershell
./scripts/build-engine.ps1 -MsysRoot C:/msys64
```

The staging script recursively copies imported non-system DLLs, a limited plugin set, the scanner, configuration, packaged licenses, and a SHA-256 manifest. It fails on unresolved dependencies. It does not copy the MSYS shell/compiler into the app. `engine/runtime` is a generated output and is not a binary dependency downloaded by the app.

```powershell
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
python scripts/smoke-engine.py
npm run tauri build
```

Developer-only native integration checks additionally use `scripts/build-audio-probe.sh`, `scripts/test-audio-probe.py`, and `node scripts/ui-smoke.mjs`. The UI test enables loopback WebView2 debugging only in its child process, exercises real native commands, restores settings, and quits. It must not run concurrently with installer bundling because Windows locks running executable files. The audio probe uses generated input; nonzero-tone/mute checks use a discard sink, while a silent-input pass exercises WASAPI.

After the executable is built, `npm run tauri -- bundle --bundles nsis` can regenerate the installer without recompiling Rust. Ensure the staged engine and copied release resources have matching hashes before final packaging. `python scripts/package-source.py` packages AirBridge and the modified UxPlay sources for review; see RELEASE.md for the separate complete corresponding-source obligations of redistributed native dependencies.

Rust test temporary paths must be writable. Managed sandbox environments may need project-local TEMP/TMP and permission to create Windows Job Objects / local sockets. This is a test environment restriction, not an app requirement for administrator rights.

Installer output: `src-tauri/target/release/bundle/nsis/`. Windows Authenticode signing requires a distributor certificate. Updater artifacts require the project signing key: see UPDATES.md. For a personal development build without release credentials, use `npm run tauri -- build --config '{"bundle":{"createUpdaterArtifacts":false}}'`. Never publish that build as an official signed update. WebView2 is a required Windows component; if absent, Tauri's default installer bootstrap may need internet to install it. Preinstall WebView2 or distribute an approved offline installer for disconnected computers. AirBridge's own receiver has no cloud dependency.

To regenerate original icons, run `scripts/make-icons.py` with Pillow installed. It is a developer tool only. Do not redistribute Apple's SF fonts or proprietary artwork.
