/** Keep update downloads in this project's HTTPS GitHub release namespace. */
export function trustedUpdateUrl(
  manifest: Record<string, unknown>,
): string | null {
  const platforms = manifest.platforms;
  if (!platforms || typeof platforms !== "object") return null;
  const candidates = platforms as Record<string, unknown>;
  const platform =
    candidates["windows-x86_64-nsis"] ?? candidates["windows-x86_64"];
  if (!platform || typeof platform !== "object") return null;
  const value = (platform as Record<string, unknown>).url;
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "github.com" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      url.pathname.startsWith("/Abwtt09/AirBridge/releases/download/")
      ? url.href
      : null;
  } catch {
    return null;
  }
}
