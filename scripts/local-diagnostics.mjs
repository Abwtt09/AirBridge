// Inspect only the locally running development WebView; never starts or stops a receiver.
import fs from "node:fs/promises";
const targets = await (await fetch("http://127.0.0.1:9229/json/list")).json();
const target = targets.find(
  (t) => t.type === "page" && /localhost:1420|127\.0\.0\.1:1420/.test(t.url),
);
if (!target) throw new Error("AirBridge development window is not running");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});
let id = 0;
const pending = new Map();
socket.onmessage = ({ data }) => {
  const value = JSON.parse(data);
  if (
    process.argv.includes("--reload-diagnostics") &&
    ["Log.entryAdded", "Runtime.exceptionThrown"].includes(value.method)
  )
    console.error(JSON.stringify(value));
  const call = pending.get(value.id);
  if (!call) return;
  pending.delete(value.id);
  clearTimeout(call.timer);
  if (value.error) call.reject(new Error(JSON.stringify(value.error)));
  else call.resolve(value.result);
};
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => {
      pending.delete(key);
      reject(new Error("CDP timed out"));
    }, 10000);
    pending.set(key, { resolve, reject, timer });
    socket.send(JSON.stringify({ id: key, method, params }));
  });
}
try {
  if (process.argv.includes("--stable-buffer")) {
    const response = await cdp("Runtime.evaluate", {
      expression: `(async()=>{const b=await window.__TAURI_INTERNALS__.invoke("bootstrap");return window.__TAURI_INTERNALS__.invoke("save_settings",{settings:{...b.settings,buffer:"stable"}})})()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (response.exceptionDetails)
      throw new Error(JSON.stringify(response.exceptionDetails));
  }
  if (
    process.argv.includes("--stop-receiver") ||
    process.argv.includes("--start-receiver")
  ) {
    const action = process.argv.includes("--stop-receiver")
      ? "stop_receiver"
      : "start_receiver";
    const response = await cdp("Runtime.evaluate", {
      expression: `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(action)})`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (response.exceptionDetails)
      throw new Error(JSON.stringify(response.exceptionDetails));
  }
  if (process.argv.includes("--reload-diagnostics")) {
    await cdp("Log.enable");
    await cdp("Runtime.enable");
    await cdp("Page.reload");
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  if (process.argv.includes("--open-logs"))
    await cdp("Runtime.evaluate", {
      expression: `new Promise(resolve=>{document.querySelector('[aria-label="Open connection logs"]')?.click();requestAnimationFrame(()=>requestAnimationFrame(resolve));})`,
      awaitPromise: true,
    });
  const result = await cdp("Runtime.evaluate", {
    expression: `(async()=>{const b=await window.__TAURI_INTERNALS__.invoke("bootstrap");const logs=await window.__TAURI_INTERNALS__.invoke("receiver_logs");return {receiver:b.receiver,logs,dialogOpen:!!document.querySelector("dialog[open]"),logText:document.querySelector(".logs-output")?.value,body:document.body.innerText,resources:performance.getEntriesByType("resource").filter(r=>r.duration>1000).map(r=>({name:r.name,duration:r.duration}))}})()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails)
    throw new Error(JSON.stringify(result.exceptionDetails));
  console.log(JSON.stringify(result.result.value, null, 2));
  if (process.argv.includes("--screenshot")) {
    const capture = await cdp("Page.captureScreenshot", { format: "png" });
    await fs.writeFile(
      new URL("../artifacts/local-logs.png", import.meta.url),
      Buffer.from(capture.data, "base64"),
    );
  }
} finally {
  socket.close();
}
