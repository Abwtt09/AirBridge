import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useSyncExternalStore } from "react";
import type { Receiver } from "../types";
import { messages } from "./i18n";

export const native = isTauri();
export async function command<T>(
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!native)
    throw new Error(
      "Open the AirBridge desktop app to use the native receiver. Browser preview cannot receive AirPlay audio.",
    );
  return invoke<T>(name, args);
}
let receiver: Receiver | null = null;
let level = 0;
let revision = -1;
const subscribers = new Set<() => void>();
const meterSubscribers = new Set<() => void>();
export function updateReceiver(next: Receiver) {
  if (next.revision < revision) return;
  revision = next.revision;
  level = next.level;
  meterSubscribers.forEach((fn) => fn());
  // The main app doesn't re-render for every meter sample.
  const summary = { ...next, level: 0, revision: 0 };
  if (JSON.stringify(receiver) !== JSON.stringify(summary)) {
    receiver = summary;
    subscribers.forEach((fn) => fn());
  }
}
const subscribe = (fn: () => void) => {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
};
const subscribeMeter = (fn: () => void) => {
  meterSubscribers.add(fn);
  return () => {
    meterSubscribers.delete(fn);
  };
};
export const useReceiver = () =>
  useSyncExternalStore(subscribe, () => receiver);
const noSubscribe = () => () => {};
export const useLevel = (active = true) =>
  useSyncExternalStore(active ? subscribeMeter : noSubscribe, () =>
    active ? level : 0,
  );
export async function on<T>(
  name: string,
  handler: (payload: T) => void,
): Promise<UnlistenFn> {
  return native ? listen<T>(name, (event) => handler(event.payload)) : () => {};
}
export const labels: Record<Receiver["state"], string> = messages().receiver;
