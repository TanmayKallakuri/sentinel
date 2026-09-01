/**
 * A deployed instance can be published with live scanning switched off so it
 * cannot spend credits. Unset means enabled, so local development and the test
 * suite keep working without anyone setting an environment variable.
 */
export function liveScansEnabled(): boolean {
  return (process.env.LIVE_SCANS_ENABLED ?? "").trim().toLowerCase() !== "false";
}

export const LIVE_SCANS_DISABLED_MESSAGE =
  "Live scanning is switched off on this instance, so no new scan can be run. The bundled sample reports are stored results from real scans and are always available.";

export const SAMPLES_PATH = "/";
