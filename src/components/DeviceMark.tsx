import { useId } from "react";
import type { ClientDevice } from "../types";
import { ReceiverMark } from "./ReceiverMark";

/** Original vector silhouettes; no product photographs or proprietary artwork. */
export function DeviceMark({ device }: { device: ClientDevice }) {
  const gradient = useId();
  if (device.kind === "other") return <ReceiverMark />;
  const tablet = device.kind === "tablet";
  const home = device.shape === "home";
  const x = tablet ? 16 : 29;
  const width = tablet ? 68 : 42;
  return (
    <div
      className="receiver-mark device-mark"
      title={`${device.label} · ${device.model}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" fill="none">
        <defs>
          <linearGradient
            id={gradient}
            x1="25"
            y1="10"
            x2="75"
            y2="90"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#6bc5ff" />
            <stop offset="0.52" stopColor="#1687f8" />
            <stop offset="1" stopColor="#1243ac" />
          </linearGradient>
        </defs>
        <rect
          x={x}
          y="7"
          width={width}
          height="86"
          rx={tablet ? 9 : 11}
          fill="var(--device-body)"
          stroke="var(--device-edge)"
          strokeWidth="1.5"
        />
        <rect
          x={x + 3.5}
          y={home ? 19 : 11}
          width={width - 7}
          height={home ? 60 : 78}
          rx={tablet ? 5.5 : 8}
          fill={`url(#${gradient})`}
        />
        <path
          d={
            tablet
              ? "M20 65Q46 31 80 49V83Q80 89 75 89H25Q20 89 20 84Z"
              : "M33 65Q49 35 67 48V80Q67 89 60 89H40Q33 89 33 82Z"
          }
          fill="#b5e8ff"
          opacity=".22"
        />
        {device.shape === "island" && (
          <rect x="42" y="15" width="16" height="5" rx="2.5" fill="#132c49" />
        )}
        {device.shape === "notch" && (
          <path
            d="M39 10H61V14Q61 18 57 18H43Q39 18 39 14Z"
            fill="var(--device-body)"
          />
        )}
        {home ? (
          <>
            <rect
              x="45"
              y="12"
              width="10"
              height="1.5"
              rx=".75"
              fill="var(--device-edge)"
            />
            <circle cx="50" cy="86" r="3.5" stroke="var(--device-edge)" />
          </>
        ) : (
          <rect
            x={tablet ? 41 : 43}
            y="85"
            width={tablet ? 18 : 14}
            height="1.8"
            rx=".9"
            fill="#e0f2ff"
            opacity=".85"
          />
        )}
        {tablet && <circle cx="50" cy="9.2" r="1" fill="var(--device-edge)" />}
      </svg>
    </div>
  );
}
