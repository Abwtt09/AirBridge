// Developer-only test of the real packaged WebView + native commands via CDP.
// Remote debugging is set only in this child process's environment, never shipped config.
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const exe = path.join(root, "src-tauri/target/release/airbridge.exe");
const child = spawn(exe, [], {
  cwd: path.dirname(exe),
  windowsHide: true,
  env: {
    ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:
      "--remote-debugging-port=9229 --remote-debugging-address=127.0.0.1 --no-first-run",
    WEBVIEW2_USER_DATA_FOLDER: path.join(root, "artifacts/webview-test"),
  },
});
let socket, original;
let counter = 0;
const pending = new Map();
const report = { completed: false };
async function cdp(method, params = {}) {
  const id = ++counter;
  const response = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`CDP timeout: ${method}`));
    }, 10000);
    pending.set(id, { resolve, reject, timer });
  });
  socket.send(JSON.stringify({ id, method, params }));
  return response;
}
async function evaluate(expression) {
  const result = await cdp("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails)
    throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function invoke(name, args = {}) {
  return evaluate(
    `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(name)},${JSON.stringify(args)})`,
  );
}
async function screenshot(name) {
  const capture = await cdp("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await fs.writeFile(
    path.join(root, "artifacts", name),
    Buffer.from(capture.data, "base64"),
  );
}
try {
  let targets;
  for (let i = 0; i < 100; i++) {
    try {
      targets = await (await fetch("http://127.0.0.1:9229/json/list")).json();
      if (targets.some((t) => t.type === "page")) break;
    } catch {}
    if (child.exitCode !== null)
      throw new Error(
        `Desktop exited before WebView startup: ${child.exitCode}`,
      );
    await pause(200);
  }
  const target = targets?.find((t) => t.type === "page");
  if (!target) throw new Error("No native WebView debugging target");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    const waiter = pending.get(data.id);
    if (waiter) {
      pending.delete(data.id);
      clearTimeout(waiter.timer);
      if (data.error) waiter.reject(new Error(JSON.stringify(data.error)));
      else waiter.resolve(data.result);
    }
  });
  socket.addEventListener("close", () => {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error("Native WebView closed"));
    }
    pending.clear();
  });
  await cdp("Page.enable");
  for (let i = 0; i < 50; i++) {
    if (await evaluate("!!window.__TAURI_INTERNALS__")) break;
    await pause(100);
  }
  original = await invoke("bootstrap");
  if (original.configError) throw new Error(original.configError);
  report.nativeBootstrap = "passed";
  await invoke("save_settings", {
    settings: { ...original.settings, checkUpdates: false },
  });
  report.playbackDevices = original.devices.map((d) => ({
    name: d.name,
    isDefault: d.isDefault,
  }));
  await pause(500);
  await screenshot("onboarding.png");
  // Drain any automatic startup before this test requests its own generation.
  await invoke("stop_receiver");
  await invoke("start_receiver");
  let snapshot;
  for (let i = 0; i < 100; i++) {
    snapshot = (await invoke("bootstrap")).receiver;
    if (snapshot.advertised) break;
    if (snapshot.state === "error") throw new Error(snapshot.error);
    await pause(200);
  }
  if (!snapshot.advertised)
    throw new Error("Native receiver never confirmed readiness");
  report.nativeReceiverStartup = "passed";
  // Kill only this test app's owned receiver, then observe the real supervisor recover.
  const owned = JSON.parse(
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Get-CimInstance Win32_Process -Filter "ParentProcessId = ${child.pid}" | Where-Object Name -eq 'uxplay.exe' | Select-Object ProcessId | ConvertTo-Json -Compress`,
      ],
      { encoding: "utf8", windowsHide: true },
    ),
  );
  if (!Number.isInteger(owned?.ProcessId))
    throw new Error("No owned receiver process found for recovery test");
  process.kill(owned.ProcessId);
  for (let i = 0; i < 100; i++) {
    snapshot = (await invoke("bootstrap")).receiver;
    if (snapshot.advertised && snapshot.retries >= 1) break;
    await pause(200);
  }
  if (!snapshot.advertised || snapshot.retries < 1)
    throw new Error("Supervisor did not recover its crashed receiver");
  report.crashRecovery = "passed";
  const alternate = original.devices.find(
    (d) => !d.isDefault && d.name.startsWith("Speakers"),
  );
  if (alternate) {
    await invoke("save_settings", {
      settings: {
        ...original.settings,
        checkUpdates: false,
        outputId: alternate.id,
      },
    });
    for (let i = 0; i < 100; i++) {
      snapshot = (await invoke("bootstrap")).receiver;
      if (snapshot.advertised && snapshot.outputName === alternate.name) break;
      await pause(200);
    }
    if (!snapshot.advertised || snapshot.outputName !== alternate.name)
      throw new Error(
        "Output selection did not restart onto the selected endpoint",
      );
    report.nativeOutputSelection = "passed";
  }
  await invoke("save_settings", {
    settings: {
      ...original.settings,
      checkUpdates: false,
      onboarded: true,
      theme: "light",
    },
  });
  const expectedOutput =
    original.devices.find((d) => d.id === original.settings.outputId) ??
    original.devices.find((d) => d.isDefault);
  for (let i = 0; i < 100; i++) {
    snapshot = (await invoke("bootstrap")).receiver;
    if (snapshot.advertised && snapshot.outputName === expectedOutput?.name)
      break;
    await pause(200);
  }
  await pause(500);
  const mainText = await evaluate("document.body.innerText");
  if (!mainText.includes("Ready to connect"))
    throw new Error("Native readiness was not rendered");
  await screenshot("receiver-light.png");
  report.eventToUi = "passed";
  report.mainWindowFits = await evaluate(
    "document.documentElement.scrollHeight <= window.innerHeight",
  );
  if (!report.mainWindowFits)
    throw new Error("Main controls overflow the default window");
  await invoke("save_settings", {
    settings: {
      ...original.settings,
      checkUpdates: false,
      onboarded: true,
      theme: "dark",
    },
  });
  await pause(250);
  await screenshot("receiver-dark.png");
  await evaluate(
    `document.querySelector('button[aria-label="Open settings"]').click()`,
  );
  await pause(250);
  await screenshot("settings.png");
  await evaluate(
    `Array.from(document.querySelectorAll('.settings-tabs button')).find(b=>b.textContent.includes('About')).click()`,
  );
  await pause(250);
  if (
    !(await evaluate("document.body.innerText")).includes("Check for updates")
  )
    throw new Error("Updater controls are missing");
  await screenshot("about.png");
  await evaluate(
    `document.querySelector('button[aria-label="Back to receiver"]').click()`,
  );
  await evaluate(
    `document.querySelector('button[aria-label="Open connection logs"]').click()`,
  );
  await pause(250);
  if (
    !(await evaluate("document.querySelector('.logs-output').value")).includes(
      "receiver",
    )
  )
    throw new Error("Native diagnostic logs are missing");
  report.logsAndUpdateControls = "passed";
  await evaluate(
    `document.querySelector('button[aria-label="Close logs"]').click()`,
  );
  await invoke("save_settings", {
    settings: {
      ...original.settings,
      checkUpdates: false,
      onboarded: true,
      muted: true,
      volume: 0.27,
    },
  });
  const saved = (await invoke("bootstrap")).settings;
  if (!saved.muted || saved.volume !== 0.27)
    throw new Error("Native settings did not persist");
  report.settingsCommands = "passed";
  await invoke("plugin:window|close", { label: "main" });
  if (!(await invoke("bootstrap")).receiver.advertised)
    throw new Error("Closing to tray stopped the receiver");
  report.trayCloseKeepsReceiver = "passed";
  await invoke("stop_receiver");
  if ((await invoke("bootstrap")).receiver.state !== "stopped")
    throw new Error("Stop did not finish");
  report.nativeStop = "passed";
  await invoke("save_settings", { settings: original.settings });
  report.realIPhoneAudio =
    "separate user-confirmed iPhone 16 / iOS 27 validation; not automated here";
  report.completed = true;
  await fs.writeFile(
    path.join(root, "artifacts/ui-smoke.json"),
    JSON.stringify(report, null, 2),
  );
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    if (original)
      await invoke("save_settings", { settings: original.settings }).catch(
        () => {},
      );
    await invoke("quit").catch(() => {});
    socket.close();
  }
  for (let i = 0; i < 50 && child.exitCode === null; i++) await pause(100);
  if (child.exitCode === null) {
    child.kill();
    throw new Error("Native app did not quit gracefully");
  }
  if (child.exitCode !== 0)
    throw new Error(`Native app quit with code ${child.exitCode}`);
  report.gracefulAppQuit = "passed";
  await fs.writeFile(
    path.join(root, "artifacts/ui-smoke.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
