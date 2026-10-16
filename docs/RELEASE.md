# Release policy

AirBridge 0.1.0 is the first public audio-only release. Joint testing confirmed
discovery, connection, stable audible playback and correct iPhone 16 identification
on the user's Windows/iOS 27 setup. This is limited hardware evidence; see
[VALIDATION.md](VALIDATION.md) for the recorded checks and remaining acceptance work.

## Required for each published version

- Match the version in npm, Cargo, Tauri configuration, release tag and update manifest.
- Build the pinned modified native source; stage its dependency hashes and notices.
- Run frontend/Rust checks, native receiver probes and the real WebView smoke test.
- Build updater-signed NSIS assets. Verify the actual installer with the embedded
  key, reject changed bytes and a falsely announced version, and verify asset hashes.
- Supply corresponding app/engine, Rust and native dependency sources, matching
  package recipes/patches, license texts and the dependency inventory/SBOM.
- Upload a draft with all assets before publishing it on the normal latest channel.
- Keep private signing material outside Git. See [UPDATES.md](UPDATES.md).

## Disclosed first-release limitations

Clean Windows VM installation, broader iPad/router coverage, extended sleep/resume
and device-removal sessions remain pending. No universal iOS compatibility or
specific latency/resource target is claimed. Measure streaming CPU/memory and
latency before making performance promises. The native dependency set is large;
reducing it is planned.

The experimental upstream mDNS/parser/crypto stack has not received a complete
security audit here. Local on-link restrictions and input limits do not authenticate
the sender. Use trusted private networks and appropriately scoped Windows Firewall
rules. Pairing access controls and full AirPlay 2 functionality are not product claims.
Review protocol-code provenance and legal constraints in FEASIBILITY.md and notices.

The first installer has no Windows Authenticode publisher certificate. Its updater
signature is a separate identity, verified by Tauri before an update is installed.
Screen sharing, file sharing, video and multi-room support are future work.
