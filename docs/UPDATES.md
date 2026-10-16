# Signed GitHub releases and updates

Official repository: https://github.com/Abwtt09/AirBridge

AirBridge uses the official Tauri 2 updater. Its fixed HTTPS endpoint is
`https://github.com/Abwtt09/AirBridge/releases/latest/download/latest.json`.
Checks run once after startup and at six-hour intervals when enabled. Manual
checks are under Settings → About. An unavailable network does not stop audio.

A newer version produces an in-app notice. The user chooses to download/install;
there is no silent installation. The receiver stays active during downloading.
Tauri verifies the signature, then AirBridge gracefully stops the receiver before
launching the per-user installer. Windows restarts the app after the update.

## Signing identity

The public verification key is embedded in `src-tauri/tauri.conf.json`. The private
key must never be committed or attached to a release. Repository Actions secrets
`TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` hold the release
identity. A local recovery copy is in the gitignored `artifacts/private` directory;
the local password file is protected with Windows DPAPI for the current user.
Keep a secure independent backup. Losing the private key prevents trusted updates
for already-installed copies.

This updater signature is independent of Windows Authenticode. The first release
has signed updater artifacts but no publisher certificate.

## Publish a release locally

1. Update the same semantic version in `package.json`, `src-tauri/Cargo.toml` and
   `src-tauri/tauri.conf.json`; update lockfiles and release notes.
2. Build the native engine, stage its dependency/licenses manifest, and run checks.
3. Collect matching native sources with `scripts/collect-native-sources.py`, and
   Rust sources with `cargo vendor --locked --manifest-path src-tauri/Cargo.toml artifacts/cargo-vendor`.
4. Set `TAURI_SIGNING_PRIVATE_KEY` to the protected private-key path and
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` in the build process environment.
5. Run `npm run tauri -- build`. Tauri emits the NSIS installer and `.sig` file.
6. Run `scripts/prepare-release.py` to create the manifest and asset hashes, then
   verify the real installer with `scripts/verify-release.ps1`.
7. Publish the matching `v<version>` tag and a GitHub release with the installer,
   its signature, `latest.json`, SHA-256 list, app/Rust/native sources and SBOM.
   Create the release as a draft until every asset has uploaded and checks pass.
8. Verify the public download manifest and an in-app check after publishing.

The release must be published as a normal release to be served by GitHub's
`releases/latest` endpoint. Drafts and prereleases do not advance this channel.
Never republish different bytes under an existing released version.

The Windows release workflow on `main` automates these steps for future version
tags and manual runs using the repository secrets. The first release is built
and verified locally, then that workflow is added for subsequent releases.

## Source and reproducibility

The app source archive includes the modified engine, build scripts, lockfiles,
notices and license inventories. Native source parts contain official MSYS2
source-only archives matching the installed package versions, including their
PKGBUILDs/patches. `docs/native-dependencies.json` maps each shipped native file to
its package and source archive, with SHA-256 hashes. These archive assets are large
because the dependency source sets include upstream test/build material; users
only need the setup executable.

Rust sources are supplied as a separate vendor archive with an offline Cargo
configuration. The frontend source asset contains exact npm runtime package tarballs,
verified against `package-lock.json` integrity fields; runtime license copies are
shipped in `docs/frontend-licenses`. Full npm build dependencies remain locked in
the same lockfile.

Hosted release builds run the automated Rust, frontend, network and UDP checks.
They do not substitute for physical-device audio testing. Record manual hardware
results for each release; hosted runners may have no real playback endpoint.

The integration-patch check can fetch the pinned pristine UxPlay source when its
local Git metadata cache is absent. This is a developer check, not app behavior.
