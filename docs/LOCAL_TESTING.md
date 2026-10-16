# Local testing before the first release

This record describes the local validation preceding the first public release. An iPhone running iOS 27 has discovered and
connected to the local development receiver. The initial “unable to connect”
report progressed to connection without audio. A concrete bug was then fixed in
the upstream UDP fallback: `recvfrom` was passed the address of the address-length
pointer instead of the pointer itself. A native regression probe now verifies
repeated reads both with and without a sender-address buffer.

After that fix, the live iPhone session reached RTP synchronization, audio UDP
reception, decryption/decoding, and nonzero measured RMS in the actual output
pipeline. The user then confirmed audible playback through the selected
SteelSeries Sonar Media virtual device, with mild stuttering. Audio-only output
now uses the upstream default of no client-video timestamp scheduling with the
Stable WASAPI buffering preset. The subsequent user test confirmed stable audible
playback. No absolute latency is claimed.
The remaining device checklist is recorded in VALIDATION.md. The user subsequently authorized publishing the first release after stable playback and correct model identification were confirmed.

A subsequent attempt exposed a separate failure: the iPhone selected IPv6 and
the initial RFC1918/ULA-only filter rejected its on-link global-format address.
The Windows listener now validates IPv4/IPv6 peers against actual prefixes on the
adapter owning the local socket address. Native policy tests accepted on-link
IPv4/IPv6, rejected off-link addresses, and covered prefix boundaries. Real RTSP
`/info` checks passed on IPv6 loopback, link-local, ULA and global-format PC
interface addresses. The subsequent iPhone reconnection succeeded: the user
confirmed stable audio and the correct model illustration/name. The reported
identifier was `iPhone17,3`, correctly displayed as **iPhone 16**. Live receiver
state was `streaming`, with nonzero RMS and no engine error. Recent five-second
intervals showed 628–629 audio packets and decoder frames; most intervals had no
retransmission requests, while one had 15 requested retransmissions. These are
session observations, not a general network-performance guarantee.

Run `npm run tauri -- dev` from the repository. This opens the native Tauri app
with the local UxPlay runtime in `engine/runtime`. Quit an installed AirBridge
first so that only one receiver owns TCP port 5101. Approve Windows Firewall
access for the development receiver on your trusted private network if prompted.

Open the scroll-shaped **Connection logs** button in the title bar, then try
AirPlay from the iPhone audio card. Logs show:

- Receiver startup, output selection, IP addresses and registration.
- TCP connection arrival, acceptance or local-address policy rejection.
- Allowlisted protocol methods/paths and response status codes.
- Session transitions, process failures and shutdown.
- First RTP sync, first audio UDP packet and first decrypted frame sent to decoder.

No arriving TCP event means the attempt has not reached this engine's listener;
check the advertised address/port, firewall rules and network reachability.
A TCP event followed by pairing requests narrows the failure to negotiation.
Registration alone does not prove reachability from another device.

Logs retain only the most recent 300 events in memory. There is no log file,
recording, raw network payload, encryption key or telemetry upload. Local IPs,
receiver/output names and an available client name may appear. **Copy logs**
copies only on request. **Clear view** hides existing entries in that panel;
reopening the panel restores the current in-memory history.

## Connected-device illustration

UxPlay's accepted-client callback supplies a `model` identifier from SETUP when
the client sends one. AirBridge forwards that field through local IPC and maps
known identifiers to names in `client_device.rs`. For example, the identifier's
numeric prefix is not used as a marketing generation number. The factual lookup
was checked against [DeviceKit's identifier table](https://github.com/devicekit/DeviceKit/blob/master/Source/Device.generated.swift).

Original SVG silhouettes distinguish a home button, a notch, a pill-shaped camera
cutout and a tablet. Unknown identifiers show a general device shape and family
name; missing or invalid model information is not inferred from the user's device
name. The model is cleared when the session ends and is not saved to settings.

## Audio stability test

The current joint test uses the existing Stable preset (250000 microseconds of
requested WASAPI output buffering), with `-async no -vsync no` for the audio-only
product. These are sink scheduling choices, not a measured end-to-end latency.
AirPlay RTP synchronization and packet recovery still run. Every approximately
five seconds during reception, sanitized diagnostics count audio UDP packets,
decoder frames and requested retransmissions. Retransmission counts may include
repeated requests and must not be presented as unique lost-packet counts.
