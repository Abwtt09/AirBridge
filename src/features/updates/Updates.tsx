import { useEffect, useRef } from "react";
import { ArrowUpCircle, Github, RefreshCw, X } from "lucide-react";
import { command } from "../../lib/bridge";
import {
  checkForUpdates,
  installUpdate,
  showUpdate,
  useUpdates,
} from "./store";

export function UpdateControls() {
  const state = useUpdates();
  const busy = ["checking", "downloading", "installing"].includes(state.status);
  return (
    <div className="group update-controls">
      <strong>Software updates</strong>
      <p>
        {state.status === "current"
          ? "You’re up to date."
          : state.version
            ? `AirBridge ${state.version} is available.`
            : "Check GitHub Releases for the latest version."}
      </p>
      <div className="update-actions">
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            void checkForUpdates(true);
          }}
        >
          <RefreshCw size={14} />
          {state.status === "checking" ? "Checking…" : "Check for updates"}
        </button>
        {state.version && (
          <button className="primary" onClick={() => showUpdate(true)}>
            View update
          </button>
        )}
      </div>
      {state.error && <p role="status">{state.error}</p>}
      <button
        className="text-button"
        onClick={() => {
          void command("open_repository").catch(() => {});
        }}
      >
        <Github size={15} /> GitHub · Abwtt09/AirBridge
      </button>
    </div>
  );
}
export function UpdateNotice() {
  const state = useUpdates();
  const dialog = useRef<HTMLDialogElement>(null);
  const busy = state.status === "downloading" || state.status === "installing";
  useEffect(() => {
    if (state.dialog) dialog.current?.showModal();
  }, [state.dialog]);
  return (
    <>
      {state.version && (
        <div className="update-banner" role="status">
          <ArrowUpCircle size={16} />
          <span>AirBridge {state.version} is available</span>
          <button onClick={() => showUpdate(true)}>
            {busy ? "Progress" : "View update"}
          </button>
        </div>
      )}
      {state.dialog && (
        <dialog
          ref={dialog}
          className="update-dialog"
          aria-labelledby="update-title"
          onCancel={(e) => {
            if (busy) e.preventDefault();
            else showUpdate(false);
          }}
        >
          <button
            className="icon-button modal-close"
            aria-label="Close update"
            disabled={busy}
            onClick={() => showUpdate(false)}
          >
            <X size={18} />
          </button>
          <div className="section-icon">
            <ArrowUpCircle />
          </div>
          <h2 id="update-title">A new AirBridge awaits.</h2>
          <p>Version {state.version}</p>
          <div className="update-notes">
            {state.notes ||
              "Improvements and fixes from the AirBridge project."}
          </div>
          <p className="hint">
            The download is verified with AirBridge’s signing key. Installing
            will stop the receiver and restart the app.
          </p>
          {busy && (
            <>
              <progress
                aria-label="Update download progress"
                max={100}
                value={state.percent ?? undefined}
              />
              <p role="status">
                {state.status === "installing"
                  ? "Starting the installer…"
                  : `Downloading${state.percent === null ? "…" : ` · ${state.percent}%`}`}
              </p>
            </>
          )}
          {state.error && (
            <p className="update-error" role="alert">
              {state.error}
            </p>
          )}
          <div className="update-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => showUpdate(false)}
            >
              Later
            </button>
            <button
              className="primary"
              disabled={busy || state.status === "checking"}
              onClick={() => {
                void installUpdate();
              }}
            >
              {busy ? "Updating…" : "Download and install"}
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
