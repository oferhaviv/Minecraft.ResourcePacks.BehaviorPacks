/**
 * Simple logger for ZipIt scripts.
 * Kept inside `scripts/` because Bedrock module imports are scoped there.
 */
export function myLog(message, event = "ZipIt", warning = false) {
  // Logging level is controlled by GLOBAL_SETTINGS.debugLevelIndex, if present.
  // This matches the pattern used in other packs (e.g. HarvestGuard) so a future
  // UI or settings screen can toggle debug levels.
  let logDebug = 0;
  try {
    const gs = globalThis?.GLOBAL_SETTINGS;
    if (gs != null) {
      logDebug = gs.debugLevelIndex ?? 0;
    }
  } catch {
    // ignore, fall back to default
  }

  if (logDebug === 0) return;

  const prefix = event ? `[ZipIt][${event}] ` : "[ZipIt] ";
  const text = prefix + String(message);

  if (!warning) {
    console.info(text);
  } else {
    console.warn(text);
  }
}

