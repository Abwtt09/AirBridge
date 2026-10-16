import { useEffect, useState } from "react";
import { useLevel } from "../lib/bridge";
export function Activity({ streaming }: { streaming: boolean }) {
  const [visible, setVisible] = useState(!document.hidden);
  const level = useLevel(visible);
  useEffect(() => {
    const change = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
  // Every bar is a scaled copy of measured RMS, with no synthetic oscillation.
  return (
    <div
      className="activity"
      aria-label={streaming ? "Measured audio activity" : "No audio activity"}
    >
      {[0.35, 0.55, 0.78, 1, 0.78, 0.55, 0.35].map((factor, i) => (
        <i
          key={i}
          style={{
            height:
              visible && streaming
                ? `${4 + Math.sqrt(level) * 18 * factor}px`
                : "4px",
          }}
        />
      ))}
    </div>
  );
}
