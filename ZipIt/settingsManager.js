/** Log helper; respects debugLevelIndex from current GLOBAL_SETTINGS. */
export function myLog(m, event = "", warning = false) {
    let logDebug = 0;
    if (GLOBAL_SETTINGS != null) {
      logDebug = GLOBAL_SETTINGS.debugLevelIndex;
    }
    if (logDebug === 0) return;
    const prefix = event ? `[HG][${event}] ` : "[HG] ";
    if (!warning) console.info(prefix + m);
    else console.warn(prefix + m);
  }