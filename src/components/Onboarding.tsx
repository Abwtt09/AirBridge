import { useState } from "react";
import {
  Airplay,
  ArrowLeft,
  ArrowRight,
  Check,
  ShieldCheck,
  Speaker,
  Wifi,
} from "lucide-react";
import type { OutputDevice, Receiver, Settings } from "../types";
import { ReceiverMark } from "./ReceiverMark";
import { labels } from "../lib/bridge";
export function Onboarding({
  settings,
  devices,
  receiver,
  busy,
  save,
  start,
}: {
  settings: Settings;
  devices: OutputDevice[];
  receiver: Receiver | null;
  busy: boolean;
  save: (patch: Partial<Settings>) => Promise<void>;
  start: () => void;
}) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(settings.receiverName);
  const ready =
    !!receiver && ["ready", "connected", "streaming"].includes(receiver.state);
  async function next() {
    if (step === 1) await save({ receiverName: name });
    if (step === 5) await save({ onboarded: true });
    else setStep((s) => s + 1);
  }
  const titles = [
    "Meet your new connection.",
    "Give your receiver a name.",
    "Let the sound in.",
    "Keep it close to home.",
    "Ready when you are.",
    "Now, over to your iPhone.",
  ];
  return (
    <div className="onboarding">
      <div className="onboarding-art">
        {step < 2 ? (
          <ReceiverMark />
        ) : (
          <div className="onboarding-symbol">
            {step === 2 ? (
              <Speaker />
            ) : step === 3 ? (
              <ShieldCheck />
            ) : step === 4 ? (
              <Wifi />
            ) : (
              <Airplay />
            )}
          </div>
        )}
      </div>
      <span className="eyebrow">
        {step === 0
          ? "WELCOME TO AIRBRIDGE"
          : `LET’S GET CONNECTED · ${step + 1} OF 6`}
      </span>
      <h1>{titles[step]}</h1>
      {step === 0 && (
        <p>
          Your iPhone’s audio.
          <br />
          Your PC’s speakers. Beautifully together.
        </p>
      )}
      {step === 1 && (
        <>
          <p>Choose the name you’ll find in the AirPlay menu on your iPhone.</p>
          <label className="sr-only" htmlFor="setup-name">
            Receiver name
          </label>
          <input
            id="setup-name"
            className="setup-input"
            value={name}
            maxLength={48}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </>
      )}
      {step === 2 && (
        <>
          <p>
            Pick a Windows playback device.
            <br />
            You can change this anytime.
          </p>
          <label className="sr-only" htmlFor="setup-output">
            Audio output
          </label>
          <select
            id="setup-output"
            value={settings.outputId ?? ""}
            disabled={busy}
            onChange={(e) => void save({ outputId: e.target.value || null })}
          >
            <option value="">Default Windows output</option>
            {devices.map((d) => (
              <option value={d.id} key={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </>
      )}
      {step === 3 && (
        <>
          <p>Connect both devices to the same trusted local network.</p>
          <div className="setup-network">
            <Wifi size={18} />
            <span>
              {receiver?.localIps.join(", ") ||
                "No private network address detected"}
            </span>
          </div>
          <div className="setup-tip">
            <ShieldCheck size={19} />
            <p>
              Allow uxplay.exe through Windows Firewall on{" "}
              <strong>Private</strong> networks when prompted. Guest Wi-Fi and
              VPNs can block discovery.
            </p>
          </div>
        </>
      )}
      {step === 4 && (
        <>
          <p>
            Start the native receiver to register
            <br />
            {settings.receiverName} on your network.
          </p>
          <div className={`setup-status ${ready ? "success" : ""}`}>
            {ready ? <Check size={18} /> : <Wifi size={18} />}
            <span>
              {receiver ? labels[receiver.state] : "Receiver unavailable"}
            </span>
          </div>
          {!ready && (
            <button
              className="secondary full"
              disabled={busy || receiver?.state === "starting"}
              onClick={start}
            >
              {receiver?.state === "starting" ? "Starting…" : "Start receiver"}
            </button>
          )}
          <p className="hint">
            A successful start confirms local registration. Your iPhone
            connection is the final check.
          </p>
        </>
      )}
      {step === 5 && (
        <>
          <p>
            Open Control Center, touch and hold
            <br />
            the audio card, then tap{" "}
            <Airplay size={16} className="inline-icon" />.
          </p>
          <div className="airplay-destination">
            <Airplay size={20} />
            <strong>{settings.receiverName}</strong>
            <Check size={18} />
          </div>
          <p className="hint">
            Select your receiver and play audio from a compatible app. No
            pairing code is configured.
          </p>
        </>
      )}
      <div className="onboarding-bottom">
        <button
          className="primary full"
          disabled={
            busy || (step === 4 && !ready) || (step === 1 && !name.trim())
          }
          onClick={() => void next().catch(() => {})}
        >
          {step === 0
            ? "Get started"
            : step === 5
              ? "Open AirBridge"
              : "Continue"}
          <ArrowRight size={16} />
        </button>
        <div className="step-controls">
          {step > 0 ? (
            <button
              className="text-button"
              onClick={() => setStep((s) => s - 1)}
            >
              <ArrowLeft size={13} />
              Back
            </button>
          ) : (
            <span />
          )}
          <div className="step-dots" aria-label={`Step ${step + 1} of 6`}>
            {titles.map((_, i) => (
              <i key={i} className={i === step ? "active" : ""} />
            ))}
          </div>
          <span />
        </div>
        <p className="fine">Private by design. No accounts. No cloud.</p>
      </div>
    </div>
  );
}
