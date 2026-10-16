export type Theme = "light" | "dark" | "system";
export interface Settings {
  receiverName: string;
  outputId: string | null;
  volume: number;
  muted: boolean;
  buffer: "lowLatency" | "balanced" | "stable";
  theme: Theme;
  autoStart: boolean;
  launchAtLogin: boolean;
  minimizeToTray: boolean;
  onboarded: boolean;
  checkUpdates: boolean;
}
export interface Receiver {
  revision: number;
  state:
    | "stopped"
    | "starting"
    | "ready"
    | "connecting"
    | "connected"
    | "streaming"
    | "error";
  advertised: boolean;
  client: string | null;
  clientDevice: ClientDevice | null;
  level: number;
  error: string | null;
  notice: string | null;
  localIps: string[];
  engineVersion: string;
  retries: number;
  outputName: string;
}
export interface ClientDevice {
  model: string;
  label: string;
  kind: "phone" | "tablet" | "other";
  shape: "home" | "notch" | "island" | "phone" | "tablet" | "generic";
}
export interface OutputDevice {
  id: string;
  name: string;
  isDefault: boolean;
}
export interface Bootstrap {
  settings: Settings;
  receiver: Receiver;
  devices: OutputDevice[];
  version: string;
  configError: string | null;
}
