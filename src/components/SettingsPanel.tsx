import { useState } from "react";
import {
  ArrowLeft,
  AudioLines,
  Check,
  Info,
  Monitor,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import type { OutputDevice, Receiver, Settings } from "../types";
import { AudioControls } from "./AudioControls";
import { ReceiverMark } from "./ReceiverMark";
import { labels } from "../lib/bridge";
import { UpdateControls } from "../features/updates/Updates";
type Props = {
  settings: Settings;
  devices: OutputDevice[];
  receiver: Receiver | null;
  version: string;
  busy: boolean;
  save: (patch: Partial<Settings>) => Promise<void>;
  restart: () => void;
  refresh: () => void;
  close: () => void;
};
export function SettingsPanel({
  settings,
  devices,
  receiver,
  version,
  busy,
  save,
  restart,
  refresh,
  close,
}: Props) {
  const [section, setSection] = useState("general");
  const [name, setName] = useState(settings.receiverName);
  const tabs = [
    { id: "general", label: "General", Icon: Settings2 },
    { id: "audio", label: "Audio", Icon: AudioLines },
    { id: "network", label: "Network", Icon: Wifi },
    { id: "about", label: "About", Icon: Info },
  ];
  return (
    <div className="settings-page">
      <div className="page-heading">
        <button
          className="icon-button"
          aria-label="Back to receiver"
          onClick={close}
        >
          <ArrowLeft size={19} />
        </button>
        <h2>Settings</h2>
        <span />
      </div>
      <nav className="settings-tabs" aria-label="Settings sections">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={section === id ? "selected" : ""}
            onClick={() => setSection(id)}
            aria-current={section === id ? "page" : undefined}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </nav>
      <div className="settings-content">
        {section === "general" && (
          <>
            <div className="settings-intro">
              <div className="section-icon gray">
                <Settings2 />
              </div>
              <h3>Make yourself at home.</h3>
              <p>A little setup. A seamless connection.</p>
            </div>
            <h4>RECEIVER</h4>
            <div className="group">
              <label className="field-label" htmlFor="receiver-name">
                Receiver name
              </label>
              <div className="name-field">
                <input
                  id="receiver-name"
                  value={name}
                  maxLength={48}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void save({ receiverName: name });
                  }}
                />
                <button
                  className="small-button"
                  disabled={busy || name === settings.receiverName}
                  onClick={() => void save({ receiverName: name })}
                >
                  <Check size={15} />
                  <span>Save</span>
                </button>
              </div>
              <p className="hint">
                This is the name shown on your iPhone. Changing it restarts the
                receiver.
              </p>
            </div>
            <h4>BEHAVIOR</h4>
            <div className="group rows">
              <Toggle
                title="Launch at Windows startup"
                checked={settings.launchAtLogin}
                disabled={busy}
                change={(v) => void save({ launchAtLogin: v })}
              />
              <Toggle
                title="Start receiver automatically"
                checked={settings.autoStart}
                disabled={busy}
                change={(v) => void save({ autoStart: v })}
              />
              <Toggle
                title="Close window to system tray"
                checked={settings.minimizeToTray}
                disabled={busy}
                change={(v) => void save({ minimizeToTray: v })}
              />
              <Toggle
                title="Check for updates automatically"
                checked={settings.checkUpdates}
                disabled={busy}
                change={(v) => void save({ checkUpdates: v })}
              />
            </div>
            <p className="hint outside">
              Checks GitHub at startup and every six hours. Downloads and
              installation begin only when you choose. Audio reception works
              offline.
            </p>
            <h4>APPEARANCE</h4>
            <div className="group">
              <label className="setting-row" htmlFor="theme">
                <span>
                  <Monitor size={16} />
                  Theme
                </span>
                <select
                  id="theme"
                  value={settings.theme}
                  disabled={busy}
                  onChange={(e) =>
                    void save({ theme: e.target.value as Settings["theme"] })
                  }
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
            </div>
          </>
        )}
        {section === "audio" && (
          <>
            <div className="settings-intro">
              <div className="section-icon">
                <AudioLines />
              </div>
              <h3>Sound, your way.</h3>
              <p>Choose where your music goes.</p>
            </div>
            <div className="group">
              <AudioControls
                settings={settings}
                devices={devices}
                save={save}
                disabled={busy}
              />
              <button className="text-button" onClick={refresh}>
                <RefreshCw size={13} />
                Refresh devices
              </button>
            </div>
            <h4>PLAYBACK BUFFER</h4>
            <div className="group buffer-options">
              {(
                [
                  {
                    id: "lowLatency",
                    title: "Low latency",
                    detail: "A smaller WASAPI buffer.",
                  },
                  {
                    id: "balanced",
                    title: "Balanced",
                    detail: "A comfortable starting point.",
                  },
                  {
                    id: "stable",
                    title: "Stable",
                    detail: "More room for output scheduling.",
                  },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  aria-pressed={settings.buffer === p.id}
                  disabled={busy}
                  onClick={() => void save({ buffer: p.id })}
                >
                  <span>
                    <strong>{p.title}</strong>
                    <small>{p.detail}</small>
                  </span>
                  <span
                    className={`radio ${settings.buffer === p.id ? "active" : ""}`}
                  />
                </button>
              ))}
            </div>
            <p className="hint outside">
              Changing output or buffering restarts the receiver and disconnects
              the current session. AirPlay buffering and synchronization still
              apply; these presets do not guarantee end-to-end latency.
            </p>
          </>
        )}
        {section === "network" && (
          <>
            <div className="settings-intro">
              <div className="section-icon green">
                <Wifi />
              </div>
              <h3>Connected, locally.</h3>
              <p>Your network. Your audio.</p>
            </div>
            <div className="group rows">
              <Detail
                label="Receiver"
                value={receiver ? labels[receiver.state] : "Unavailable"}
              />
              <Detail
                label="Local addresses"
                value={receiver?.localIps.join(", ") || "No private network"}
              />
              <Detail
                label="mDNS"
                value={
                  receiver?.advertised ? "Locally registered" : "Not registered"
                }
              />
              <Detail
                label="Engine"
                value={receiver?.engineVersion || "Unavailable"}
              />
            </div>
            <p className="hint outside">
              Local registration does not verify that an iPhone can discover the
              receiver. Guest-network isolation, VPNs, and firewalls may block
              discovery.
            </p>
            <button
              className="secondary full"
              disabled={busy}
              onClick={restart}
            >
              <RefreshCw size={15} />
              Restart receiver
            </button>
            <h4>WINDOWS FIREWALL</h4>
            <div className="group firewall">
              <ShieldCheck size={21} />
              <div>
                <strong>Allow private network access</strong>
                <p>
                  In Windows Security → Firewall & network protection → Allow an
                  app, allow the bundled uxplay.exe on Private networks. Keep
                  Public access off.
                </p>
                <p>
                  TCP/UDP 5100–5102 and mDNS UDP 5353 must be reachable on your
                  local subnet. See docs/TROUBLESHOOTING.md for a scoped
                  firewall rule.
                </p>
              </div>
            </div>
          </>
        )}
        {section === "about" && (
          <div className="about">
            <ReceiverMark />
            <h2>AirBridge</h2>
            <p>Wireless Audio Receiver</p>
            <span className="version">Version {version} · Windows x64</span>
            <div className="privacy-note">
              <ShieldCheck size={18} />
              <p>
                Locally connected.
                <br />
                No accounts, telemetry, or recording.
              </p>
            </div>
            <UpdateControls />
            <div className="group license-copy">
              <strong>Open source, thoughtfully connected.</strong>
              <p>
                AirBridge and its UxPlay integration are GPL-3.0-or-later.
                GStreamer, FFmpeg, OpenSSL, libplist, Tauri, and other libraries
                retain their own licenses.
              </p>
              <p>
                Complete notices and licenses ship with the app in
                THIRD_PARTY_NOTICES.md and engine/licenses. Build provenance is
                recorded in engine/manifest.json.
              </p>
              <p>
                Legacy AirPlay audio reception. No multi-room audio, DRM video,
                or screen mirroring. Tested with iPhone 16 on iOS 27;
                compatibility with other devices may vary.
              </p>
            </div>
            <p className="fine">
              An independent project. Not affiliated with Apple Inc.
              <br />
              AirPlay is a trademark of Apple Inc.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
function Toggle({
  title,
  checked,
  change,
  disabled,
}: {
  title: string;
  checked: boolean;
  change: (value: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label className="setting-row">
      <span>{title}</span>
      <input
        type="checkbox"
        role="switch"
        className="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => change(e.target.checked)}
      />
    </label>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="setting-row detail">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
