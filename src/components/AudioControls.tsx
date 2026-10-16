import { memo, useEffect, useState } from "react";
import { Volume2, VolumeX, Speaker } from "lucide-react";
import type { OutputDevice, Settings } from "../types";
export const AudioControls = memo(function AudioControls({
  settings,
  devices,
  save,
  disabled = false,
}: {
  settings: Settings;
  devices: OutputDevice[];
  save: (patch: Partial<Settings>) => Promise<void>;
  disabled?: boolean;
}) {
  const [volume, setVolume] = useState(settings.volume);
  useEffect(() => setVolume(settings.volume), [settings.volume]);
  return (
    <div className="audio-controls">
      <label className="output-label" htmlFor="output">
        <Speaker size={16} />
        <span>Audio output</span>
      </label>
      <select
        id="output"
        value={settings.outputId ?? ""}
        disabled={disabled}
        onChange={(e) => void save({ outputId: e.target.value || null })}
      >
        <option value="">Default Windows output</option>
        {devices.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
            {d.isDefault ? " · Default" : ""}
          </option>
        ))}
        {settings.outputId &&
          !devices.some((d) => d.id === settings.outputId) && (
            <option value={settings.outputId}>
              Unavailable · using Windows default
            </option>
          )}
      </select>
      <div className="volume-row">
        <button
          className="icon-button"
          aria-label={settings.muted ? "Unmute AirBridge" : "Mute AirBridge"}
          disabled={disabled}
          onClick={() => void save({ muted: !settings.muted })}
        >
          {settings.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <input
          aria-label="AirBridge volume"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          disabled={disabled}
          onChange={(e) => setVolume(Number(e.target.value))}
          onPointerUp={() => void save({ volume })}
          onKeyUp={(e) => {
            if (
              [
                "ArrowLeft",
                "ArrowRight",
                "Home",
                "End",
                "PageUp",
                "PageDown",
              ].includes(e.key)
            )
              void save({ volume });
          }}
          style={{ "--progress": `${volume * 100}%` } as React.CSSProperties}
        />
        <span className="volume-number">
          {settings.muted ? "Mute" : `${Math.round(volume * 100)}%`}
        </span>
      </div>
    </div>
  );
});
