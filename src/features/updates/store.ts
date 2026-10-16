import { useEffect, useSyncExternalStore } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { command, native } from "../../lib/bridge";
import { trustedUpdateUrl } from "./trust";

type Status =
  | "idle"
  | "checking"
  | "current"
  | "available"
  | "downloading"
  | "installing"
  | "error";
interface UpdateState {
  status: Status;
  version: string | null;
  notes: string;
  percent: number | null;
  error: string | null;
  dialog: boolean;
}
let state: UpdateState = {
  status: "idle",
  version: null,
  notes: "",
  percent: null,
  error: null,
  dialog: false,
};
let pending: Update | null = null;
let checking: Promise<void> | null = null;
let lastCheck = 0;
const listeners = new Set<() => void>();
const notify = (patch: Partial<UpdateState>) => {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
};
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export const useUpdates = () => useSyncExternalStore(subscribe, () => state);
export const showUpdate = (dialog: boolean) => notify({ dialog });
const busy = () =>
  state.status === "downloading" || state.status === "installing";

export function checkForUpdates(manual = false): Promise<void> {
  if (!native || busy()) return Promise.resolve();
  if (checking) return checking;
  if (!manual && Date.now() - lastCheck < 6 * 60 * 60 * 1000)
    return Promise.resolve();
  lastCheck = Date.now();
  notify({ status: "checking", error: null });
  checking = (async () => {
    try {
      const update = await check({ timeout: 12000 });
      if (update && !trustedUpdateUrl(update.rawJson)) {
        await update.close();
        throw new Error("Unexpected update download location");
      }
      if (pending) await pending.close();
      pending = update;
      notify(
        update
          ? {
              status: "available",
              version: update.version,
              notes: update.body ?? "",
              percent: null,
            }
          : { status: "current", version: null, notes: "", percent: null },
      );
    } catch {
      // An offline PC can continue receiving AirPlay. Do not surface network payloads.
      notify({
        status: pending ? "available" : "error",
        error:
          "Could not check GitHub. Check your internet connection and try again. Audio reception still works offline.",
      });
    } finally {
      checking = null;
    }
  })();
  return checking;
}

export async function installUpdate() {
  if (!pending || busy() || checking) return;
  const update = pending;
  notify({ status: "downloading", percent: null, error: null });
  let received = 0,
    total = 0;
  let receiverWasRunning = false;
  try {
    // Tauri verifies the signature before download() resolves. Audio keeps playing until then.
    await update.download(
      (event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
          received = 0;
        }
        if (event.event === "Progress") received += event.data.chunkLength;
        const percent = total
          ? Math.min(100, Math.floor((received * 100) / total))
          : null;
        if (state.percent !== percent) notify({ percent });
      },
      { timeout: 120000 },
    );
    receiverWasRunning = await command<boolean>("prepare_update");
    notify({ status: "installing", percent: 100 });
    // Windows exits this process only after successfully starting the trusted installer.
    await update.install({ restartAfterInstall: true });
  } catch {
    if (receiverWasRunning) await command("start_receiver").catch(() => {});
    notify({
      status: "available",
      error:
        "The update could not be verified or installed. No unverified update was installed. Try again or download it from GitHub Releases.",
    });
  }
}

export function useAutomaticUpdates(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !native) return;
    const initial = window.setTimeout(() => {
      void checkForUpdates();
    }, 5000);
    const recurring = window.setInterval(
      () => {
        void checkForUpdates();
      },
      6 * 60 * 60 * 1000,
    );
    return () => {
      clearTimeout(initial);
      clearInterval(recurring);
    };
  }, [enabled]);
}
