import { test } from "node:test";
import assert from "node:assert/strict";
import { trustedUpdateUrl } from "../src/features/updates/trust.ts";
const manifest = (url: string) => ({
  platforms: { "windows-x86_64": { url } },
});
test("accept the official HTTPS release namespace", () => {
  const url =
    "https://github.com/Abwtt09/AirBridge/releases/download/v0.1.1/AirBridge_0.1.1_x64-setup.exe";
  assert.equal(trustedUpdateUrl(manifest(url)), url);
});
test("reject plaintext, other repositories, credentials and deceptive hosts", () => {
  for (const url of [
    "http://github.com/Abwtt09/AirBridge/releases/download/v0.1.1/a.exe",
    "https://github.com/other/repo/releases/download/v0.1.1/a.exe",
    "https://github.com.evil.example/Abwtt09/AirBridge/releases/download/v0.1.1/a.exe",
    "https://github.com@evil.example/Abwtt09/AirBridge/releases/download/v0.1.1/a.exe",
    "https://name:pass@github.com/Abwtt09/AirBridge/releases/download/v0.1.1/a.exe",
    "https://github.com:444/Abwtt09/AirBridge/releases/download/v0.1.1/a.exe",
  ])
    assert.equal(trustedUpdateUrl(manifest(url)), null);
});
test("reject missing or malformed platform metadata", () => {
  for (const value of [
    {},
    { platforms: null },
    { platforms: "url" },
    { platforms: { "windows-x86_64": { url: 42 } } },
  ])
    assert.equal(trustedUpdateUrl(value), null);
});
