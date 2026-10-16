# Setup and troubleshooting

1. Launch AirBridge, choose a receiver name and a Windows audio output.
2. Connect the PC and iPhone to the same trusted LAN. Ethernet on the PC and Wi-Fi on the iPhone are fine when the router bridges them.
3. Allow the bundled `uxplay.exe` on Private networks if Windows asks. Do not disable the firewall globally.
4. Start the receiver. The setup wizard only completes after an explicit local readiness event.
5. On iPhone, open Control Center, touch and hold the audio card, tap its AirPlay audio icon and select your receiver. Play audio from a compatible app. This release does not provide screen mirroring.

## Receiver not visible

Check Network settings for local IP addresses and local mDNS registration. Registration does not verify remote reachability. Turn off VPN routing temporarily if appropriate, avoid guest networks, and check AP/client isolation. Ensure multicast UDP 5353 is allowed. The bundled internal responder is experimental upstream; test with your router and all active adapters.

The application does not change Windows Firewall automatically. If manual rule setup is needed, open an **elevated PowerShell for this operation only**, resolve the actual installed engine path, and use a narrowly scoped rule. Review the executable path before running:

```powershell
$receiver = (Resolve-Path 'C:/actual/install/path/engine/uxplay.exe').Path
New-NetFirewallRule -DisplayName 'AirBridge audio TCP' -Direction Inbound -Action Allow -Program $receiver -Protocol TCP -LocalPort 5100-5102 -Profile Private -RemoteAddress LocalSubnet
New-NetFirewallRule -DisplayName 'AirBridge audio UDP' -Direction Inbound -Action Allow -Program $receiver -Protocol UDP -LocalPort 5100-5102,5353 -Profile Private -RemoteAddress LocalSubnet
```

Rules are guidance only; AirBridge does not execute these commands. Native receiver RTSP normally listens on TCP 5101; UDP 5100–5102 handles the audio/timing/control allocation. Restrict mDNS and the receiver to local/private networks. Do not forward these ports on your router. Firewalls from other vendors may require equivalent rules.

## Startup errors

Missing runtime: rebuild `npm run engine:build` or reinstall. Missing DLL/plugin: inspect `engine/manifest.json`, retain the supplied directory layout, and do not move uxplay.exe away from its libraries. Port in use: stop other AirBridge/UxPlay instances and restart. A failed bind or registration must not become Ready. Restarting interrupts a current session.

## Connected but silent

Check the selected playback endpoint, AirBridge volume/mute, iPhone volume, Windows per-app mixer, and the device's own controls. AirBridge does not change Windows master volume. Try a non-DRM local audio source. Unavailable formats/negotiation may be incompatible; current-iOS support requires real-device testing. The activity indicator is measured RMS after gain; a silent stream has little or no meter movement.

Output changes restart the receiver. A removed output falls back to Windows default with a visible notice; it does not silently claim continued playback on the unplugged device. AirPlay sender buffering remains even in Low Latency mode. Bluetooth headphones add their own latency.

## Background and quit

Closing the window normally hides it to the system tray. Open/stop/settings/quit are in the tray menu. Quit requests clean shutdown and then terminates any remaining owned helpers. Disable “Close window to system tray” to quit on close. Startup launch is optional, per-user, and may be disabled by Windows policy.

## Settings recovery

Settings live in Tauri's per-user app configuration directory (`%APPDATA%/dev.airbridge.desktop/settings.json` under the usual Windows configuration). If corruption is reported, close AirBridge and restore a valid backup or rename that file to start with defaults. The app does not silently overwrite a damaged file. Settings contain receiver/output/UI preferences, no audio recordings or accounts.
