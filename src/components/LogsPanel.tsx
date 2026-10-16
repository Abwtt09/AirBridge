import { useEffect, useRef, useState } from "react";
import { Copy, Trash2, X } from "lucide-react";
import { command, on } from "../lib/bridge";

interface LogEntry {
  id: number;
  timestampMs: number;
  level: string;
  source: string;
  message: string;
}
const line = (entry: LogEntry) =>
  `${new Date(entry.timestampMs).toLocaleTimeString()} [${entry.level}] ${entry.source}: ${entry.message}`;

export function LogsPanel({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const floor = useRef(0);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [message, setMessage] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const merge = (items: LogEntry[]) => {
      if (disposed) return;
      setEntries((previous) =>
        Array.from(
          new Map(
            [...previous, ...items]
              .filter((e) => e.id > floor.current)
              .map((e) => [e.id, e]),
          ).values(),
        )
          .sort((a, b) => a.id - b.id)
          .slice(-300),
      );
    };
    void (async () => {
      const off = await on<LogEntry>("receiver://log", (e) => merge([e]));
      if (disposed) {
        off();
        return;
      }
      unlisten = off;
      merge(await command<LogEntry[]>("receiver_logs"));
    })().catch((e) => {
      if (!disposed) setMessage(String(e));
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="logs-dialog"
      aria-labelledby="logs-title"
      onCancel={close}
    >
      <header>
        <div>
          <h2 id="logs-title">Connection logs</h2>
          <p>Live diagnostics · Last 300 events · Memory only</p>
        </div>
        <button className="icon-button" aria-label="Close logs" onClick={close}>
          <X size={18} />
        </button>
      </header>
      <p className="logs-hint">
        Try connecting from your iPhone’s audio AirPlay menu. “TCP connection
        arrived” confirms the request reached this receiver. Logs include local
        IPs and device names; review before sharing.
      </p>
      <textarea
        className="logs-output"
        readOnly
        aria-label="Connection log entries"
        value={entries.map(line).join("\n") || "Waiting for receiver events…"}
        spellCheck={false}
      />
      <footer>
        <button
          className="secondary"
          onClick={() => {
            floor.current = entries.at(-1)?.id ?? floor.current;
            setEntries([]);
            setMessage("");
          }}
        >
          <Trash2 size={14} /> Clear view
        </button>
        <button
          className="primary"
          onClick={() => {
            void navigator.clipboard
              .writeText(entries.map(line).join("\n"))
              .then(() => setMessage("Copied"))
              .catch(() =>
                setMessage("Select the log text and press Ctrl+C to copy."),
              );
          }}
          disabled={!entries.length}
        >
          <Copy size={14} /> Copy logs
        </button>
      </footer>
      <p className="logs-message" role="status">
        {message ||
          "No audio, encryption keys, or raw protocol payloads are logged."}
      </p>
    </dialog>
  );
}
