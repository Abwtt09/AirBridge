import { Airplay, Check, Smartphone, Wifi, X } from "lucide-react";
import { useEffect, useRef } from "react";
export function Guide({ name, close }: { name: string; close: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = dialog.current;
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !node) return;
      const buttons = node.querySelectorAll<HTMLButtonElement>("button");
      const first = buttons[0],
        last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    node?.addEventListener("keydown", trap);
    return () => {
      node?.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, []);
  return (
    <div ref={dialog} className="modal-backdrop" onClick={close}>
      <section
        className="guide modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="icon-button modal-close"
          aria-label="Close guide"
          onClick={close}
          autoFocus
        >
          <X size={18} />
        </button>
        <div className="section-icon">
          <Airplay />
        </div>
        <h2 id="guide-title">Your audio. Over the air.</h2>
        <p className="muted">
          A few taps, and your iPhone sounds right at home.
        </p>
        <ol className="steps">
          <li>
            <span>
              <Wifi size={19} />
            </span>
            <div>
              <strong>Share a network</strong>
              <p>
                Connect your iPhone and PC to the same private Wi-Fi or Ethernet
                network.
              </p>
            </div>
          </li>
          <li>
            <span>
              <Smartphone size={19} />
            </span>
            <div>
              <strong>Open Control Center</strong>
              <p>
                On your iPhone, touch and hold the audio card, then tap the
                AirPlay icon.
              </p>
            </div>
          </li>
          <li>
            <span>
              <Check size={19} />
            </span>
            <div>
              <strong>Select {name}</strong>
              <p>
                Play audio from a compatible app. Sound comes through your
                selected PC output.
              </p>
            </div>
          </li>
        </ol>
        <button className="primary full" onClick={close}>
          Got it
        </button>
        <p className="fine">Audio only · No internet connection required</p>
      </section>
    </div>
  );
}
