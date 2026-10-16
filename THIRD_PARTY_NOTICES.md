# Third-party notices

AirBridge application and integration modifications: Copyright (c) 2026 AirBridge contributors. GPL-3.0-or-later; see LICENSE. This application is independent of Apple Inc. No proprietary Apple UI assets, fonts or SDK binaries are distributed by AirBridge.

## Native engine

- **UxPlay**, source `vendor/uxplay`, [FDH2/UxPlay](https://github.com/FDH2/UxPlay), commit `ec203121355220dd90278a369eeabb0b8ba4f14a`. GPL-3.0-or-later for the application/renderers, with individual LGPL notices in protocol libraries and MIT llhttp. Preserve all source headers, author credits and license files. AirBridge's changes are marked and reproduced by scripts/patch-engine.py.
- **playfair** and inherited FairPlay interoperability code/tables are present inside UxPlay. Retain its GPL source/provenance. These source licenses do not convey Apple certification, trademarks, patent rights, or a legal determination about all protocol data. Review provenance before public redistribution; do not assert that lack of enforcement grants permission.
- **GStreamer 1.28.8** and included plugins: primarily LGPL-2.1-or-later, subject to individual plugin/library licenses. [Upstream](https://gstreamer.freedesktop.org/). Only the required app/libav/convert/resample/volume/level/WASAPI/core plugins are staged. Shared DLLs retain user replacement rights.
- **FFmpeg 9.0.2** from MSYS2 UCRT64: actual build enables `--enable-gpl --enable-version3`, with no `--enable-nonfree` in the inspected build configuration. Treat this build as GPL-3.0-or-later, **not LGPL-only**. [Upstream legal information](https://ffmpeg.org/legal.html). Dependencies such as codec and compression libraries retain their own terms.
- **OpenSSL 3.6.5**, Apache-2.0. [Upstream](https://www.openssl.org/).
- **libplist 2.7.0**, LGPL-2.1-or-later. [Upstream](https://github.com/libimobiledevice/libplist).
- **GLib/GObject**, LGPL-2.1-or-later, and related runtime libraries. [Upstream](https://gitlab.gnome.org/GNOME/glib).
- **GCC runtime, MinGW-w64/UCRT support libraries**: preserve upstream GCC Runtime Library Exception, MinGW and component notices. Microsoft system libraries are not copied from System32.

The staged `engine/licenses/` directory contains the license material provided by the installed MSYS2 packages. `engine/manifest.json` lists exact SHA-256 hashes for staged files. `docs/native-packages.txt` records package versions; the staging inventory may contain notices for more packages than the final DLL closure. MSYS2 is a build environment and its shell is not shipped.

## Desktop and frontend

- Tauri and Tauri plugins: MIT OR Apache-2.0. [Tauri](https://github.com/tauri-apps/tauri).
- React, React DOM and Scheduler: MIT. [React](https://github.com/facebook/react).
- Motion / Framer Motion, motion-dom and motion-utils: MIT. [Motion](https://github.com/motiondivision/motion).
- Lucide icons: ISC, with portions under MIT where marked. [Lucide](https://github.com/lucide-icons/lucide).
- Tailwind CSS: MIT. [Tailwind](https://github.com/tailwindlabs/tailwindcss).
- Rust runtime dependencies retain their Cargo package licenses, including Serde, Tokio, tempfile, windows-rs and if-addrs. Cargo.lock records exact versions; package sources retain full license texts.

Frontend license texts are copied into docs/frontend-licenses by the release preparation script. Vite, TypeScript and other build tools are development dependencies rather than an Electron-style shipped runtime.

## Corresponding source / public distribution

The GitHub release supplies the modified application/engine source, locked Rust and npm runtime source archives, and matching native source archives with MSYS2 package recipes and patches. `docs/native-dependencies.json` maps the shipped binaries to exact source packages and archive hashes; `docs/sbom.cdx.json` inventories dependencies. Preserve these materials and all notices when redistributing. Native shared libraries remain separately replaceable in the installed `engine` directory; replacements must preserve ABI compatibility. Build instructions are in docs/BUILD.md and release preparation in docs/UPDATES.md. Source licenses do not constitute Apple certification or a patent/trademark clearance.
