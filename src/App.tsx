import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import {
  Airplay,
  ArrowUpRight,
  CircleHelp,
  Headphones,
  ScrollText,
  Minus,
  Power,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Wifi,
  X,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  command,
  labels,
  native,
  on,
  updateReceiver,
  useReceiver,
} from "./lib/bridge";
import type { Bootstrap, OutputDevice, Receiver, Settings } from "./types";
import { ReceiverMark } from "./components/ReceiverMark";
import { AudioControls } from "./components/AudioControls";
import { Activity } from "./components/Activity";
import { Guide } from "./components/Guide";
import { Onboarding } from "./components/Onboarding";
import { SettingsPanel } from "./components/SettingsPanel";
import { LogsPanel } from "./components/LogsPanel";
import { DeviceMark } from "./components/DeviceMark";
import { UpdateNotice } from "./features/updates/Updates";
import { useAutomaticUpdates } from "./features/updates/store";

export function App() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState<"receiver" | "settings">("receiver");
  const [guide, setGuide] = useState(false);
  const [logs, setLogs] = useState(false);
  const receiver = useReceiver();
  useAutomaticUpdates(data?.settings.checkUpdates ?? false);
  const settingsRef = useRef<Settings | null>(null);
  const saveLock = useRef(false);
  useEffect(() => {
    let disposed = false;
    const cleanup: (() => void)[] = [];
    async function init() {
      const listeners = await Promise.all([
        on<Receiver>("receiver://state", updateReceiver),
        on<Settings>("settings://changed", (s) => {
          settingsRef.current = s;
          setData((d) => (d ? { ...d, settings: s } : d));
        }),
        on("navigate://settings", () => setPage("settings")),
        on("audio://devices-changed", () => {
          void command<OutputDevice[]>("output_devices")
            .then((devices) => setData((d) => (d ? { ...d, devices } : d)))
            .catch((e) => setError(String(e)));
        }),
      ]);
      if (disposed) {
        listeners.forEach((fn) => fn());
        return;
      }
      cleanup.push(...listeners);
      const initial = await command<Bootstrap>("bootstrap");
      if (disposed) return;
      settingsRef.current = initial.settings;
      setData(initial);
      updateReceiver(initial.receiver);
      if (initial.configError) setError(initial.configError);
    }
    void init().catch((e) => {
      if (!disposed) setError(String(e));
    });
    return () => {
      disposed = true;
      cleanup.forEach((fn) => fn());
    };
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      (document.documentElement.dataset.theme =
        data?.settings.theme === "system"
          ? media.matches
            ? "dark"
            : "light"
          : (data?.settings.theme ?? "light"));
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [data?.settings.theme]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setGuide(false);
        setPage("receiver");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const save = useCallback(async (patch: Partial<Settings>) => {
    if (!settingsRef.current || saveLock.current) return;
    saveLock.current = true;
    setBusy(true);
    setError(null);
    try {
      const settings = await command<Settings>("save_settings", {
        settings: { ...settingsRef.current, ...patch },
      });
      settingsRef.current = settings;
      setData((d) => (d ? { ...d, settings } : d));
    } catch (e) {
      setError(String(e));
      throw e;
    } finally {
      saveLock.current = false;
      setBusy(false);
    }
  }, []);
  // UI callbacks consume errors; onboarding's explicit save still prevents advancement on failure.
  const safeSave = useCallback(
    async (patch: Partial<Settings>) => {
      try {
        await save(patch);
      } catch {
        /* shown in the alert */
      }
    },
    [save],
  );
  const act = useCallback(async (name: string) => {
    setBusy(true);
    setError(null);
    try {
      await command(name);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, []);
  const refresh = useCallback(() => {
    void command<OutputDevice[]>("output_devices")
      .then((devices) => setData((d) => (d ? { ...d, devices } : d)))
      .catch((e) => setError(String(e)));
  }, []);
  const running =
    !!receiver &&
    ["ready", "connected", "streaming", "connecting"].includes(receiver.state);
  const connected =
    receiver?.state === "connected" || receiver?.state === "streaming";
  const state = receiver?.state ?? "stopped";
  const shownError = error || receiver?.error;
  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell">
        <header
          className="titlebar"
          onPointerDown={(e) => {
            if (
              native &&
              e.button === 0 &&
              !(e.target as HTMLElement).closest("button")
            )
              void getCurrentWindow().startDragging();
          }}
        >
          <div className="brand">
            <span className="brand-glyph">
              <Airplay size={16} />
            </span>
            <strong>AirBridge</strong>
          </div>
          <div className="window-actions">
            <button
              className="icon-button"
              aria-label="Open connection logs"
              title="Connection logs"
              onClick={() => setLogs(true)}
            >
              <ScrollText size={16} />
            </button>
            <button
              className="icon-button"
              aria-label="Minimize window"
              onClick={() => {
                if (native) void getCurrentWindow().minimize();
              }}
            >
              <Minus size={15} />
            </button>
            <button
              className="icon-button close-button"
              aria-label="Close window"
              onClick={() => {
                if (native) void getCurrentWindow().close();
              }}
            >
              <X size={16} />
            </button>
          </div>
        </header>
        <UpdateNotice />
        {shownError && (
          <div className="error-banner" role="alert">
            <span>{shownError}</span>
            {error && (
              <button
                className="icon-button"
                aria-label="Dismiss message"
                onClick={() => setError(null)}
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}
        {!data ? (
          <main className="unavailable">
            <ReceiverMark />
            <h1>{native ? "Opening AirBridge…" : "A native connection."}</h1>
            <p>
              {native
                ? "Loading your receiver and audio devices."
                : "Launch the Windows desktop app to receive AirPlay audio. This browser page cannot access the native engine."}
            </p>
            {native && error && (
              <button className="secondary" onClick={() => location.reload()}>
                Try again
              </button>
            )}
            <span className="fine">Windows 11 · AirPlay audio · WASAPI</span>
          </main>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.main
              key={!data.settings.onboarded ? "onboarding" : page}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
            >
              {!data.settings.onboarded ? (
                <Onboarding
                  settings={data.settings}
                  devices={data.devices}
                  receiver={receiver}
                  busy={busy}
                  save={save}
                  start={() => void act("start_receiver")}
                />
              ) : page === "settings" ? (
                <SettingsPanel
                  settings={data.settings}
                  devices={data.devices}
                  receiver={receiver}
                  version={data.version}
                  busy={busy}
                  save={safeSave}
                  restart={() => void act("start_receiver")}
                  refresh={refresh}
                  close={() => setPage("receiver")}
                />
              ) : (
                <div className="receiver-page">
                  <div className="receiver-heading">
                    <div>
                      <span className="eyebrow">A LITTLE MORE WIRELESS.</span>
                      <p>Wireless Audio Receiver</p>
                    </div>
                    <button
                      className="icon-button settings-button"
                      aria-label="Open settings"
                      onClick={() => setPage("settings")}
                    >
                      <Settings2 size={19} />
                    </button>
                  </div>
                  <section className={`receiver-card state-${state}`}>
                    <div className="receiver-orbit">
                      {receiver?.clientDevice ? (
                        <DeviceMark device={receiver.clientDevice} />
                      ) : (
                        <ReceiverMark />
                      )}
                      <span
                        className={`connection-dot ${running ? "online" : ""}`}
                      />
                    </div>
                    <h1>{data.settings.receiverName}</h1>
                    <div
                      className={`status-pill ${running ? "online" : ""} ${state === "error" ? "error" : ""}`}
                      role="status"
                    >
                      <i />
                      {labels[state]}
                    </div>
                    <Activity streaming={state === "streaming"} />
                    <h2>
                      {connected
                        ? receiver?.client || "AirPlay audio connected"
                        : running
                          ? "Ready to receive audio"
                          : state === "starting"
                            ? "Getting things ready…"
                            : "Your music belongs here."}
                    </h2>
                    {receiver?.clientDevice && (
                      <div
                        className="device-model"
                        title={receiver.clientDevice.model}
                      >
                        {receiver.clientDevice.label}
                      </div>
                    )}
                    <p>
                      {connected ? (
                        `${state === "streaming" ? "Playing" : "Connected"} through ${receiver?.outputName}`
                      ) : running ? (
                        <>
                          Select {data.settings.receiverName} from the
                          <br />
                          AirPlay menu on your iPhone.
                        </>
                      ) : state === "error" ? (
                        "Review the message above, then try restarting."
                      ) : (
                        "Start your receiver, then connect your iPhone."
                      )}
                    </p>
                    <button
                      className={
                        connected
                          ? "text-button disconnect"
                          : "primary connect-button"
                      }
                      disabled={busy || state === "starting"}
                      onClick={() =>
                        void act(
                          connected
                            ? "disconnect"
                            : running
                              ? "stop_receiver"
                              : "start_receiver",
                        )
                      }
                    >
                      {connected ? (
                        "Disconnect"
                      ) : running ? (
                        <>
                          <Power size={14} />
                          Stop receiver
                        </>
                      ) : state === "starting" ? (
                        "Starting…"
                      ) : (
                        <>
                          <Power size={15} />
                          Start receiver
                        </>
                      )}
                    </button>
                  </section>
                  {receiver?.notice && (
                    <p className="notice" role="status">
                      {receiver.notice}
                    </p>
                  )}
                  <section className="output-card">
                    <AudioControls
                      settings={data.settings}
                      devices={data.devices}
                      save={safeSave}
                      disabled={busy}
                    />
                  </section>
                  <button className="guide-link" onClick={() => setGuide(true)}>
                    <span className="guide-link-icon">
                      <Headphones size={19} />
                    </span>
                    <span>
                      <strong>First time connecting?</strong>
                      <small>Your iPhone, meet your speakers.</small>
                    </span>
                    <ArrowUpRight size={17} />
                  </button>
                  <footer className="app-footer">
                    <span>
                      <Wifi size={12} />
                      {receiver?.localIps.length
                        ? "Local network"
                        : "Network unavailable"}
                    </span>
                    <span>
                      <ShieldCheck size={12} />
                      Private by design
                    </span>
                    <button
                      className="icon-button"
                      aria-label="Connection help"
                      onClick={() => setGuide(true)}
                    >
                      <CircleHelp size={14} />
                    </button>
                  </footer>
                </div>
              )}
            </motion.main>
          </AnimatePresence>
        )}
        {guide && data && (
          <Guide
            name={data.settings.receiverName}
            close={() => setGuide(false)}
          />
        )}
        {logs && <LogsPanel close={() => setLogs(false)} />}
      </div>
    </MotionConfig>
  );
}
