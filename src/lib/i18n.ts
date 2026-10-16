// Typed namespaces are the localization boundary. Add locales here, then extract
// the remaining English feature copy as translators and language choices are added.
export const en = {
  receiver: {
    stopped: "Receiver off",
    starting: "Starting receiver",
    ready: "Ready to connect",
    connecting: "Connecting",
    connected: "Connected",
    streaming: "Streaming audio",
    error: "Needs attention",
  },
  common: {
    appName: "AirBridge",
    subtitle: "Wireless Audio Receiver",
    settings: "Settings",
    quit: "Quit AirBridge",
  },
} as const;
export type Messages = {
  [N in keyof typeof en]: { [K in keyof (typeof en)[N]]: string };
};
export type Locale = "en";
const locales: Record<Locale, Messages> = { en };
export function messages(locale: Locale = "en"): Messages {
  return locales[locale] ?? en;
}
