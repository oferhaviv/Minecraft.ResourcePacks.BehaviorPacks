/**
 * Shared logger factory for Minecraft Bedrock behavior packs.
 *
 * Usage (once per pack, in settingsManager.js or equivalent):
 *
 *   import { createLogger } from "./shared/logger.js";
 *   export const logXX = createLogger("XX", () => <returns true when debug is on>);
 *
 * The returned function has the signature:
 *   log(message, event?, warning?, critical?)
 *   - event    : string label shown as [TAG][event] in the prefix (default "")
 *   - warning  : true → console.warn, false → console.info (default false)
 *   - critical : true → bypasses the debug gate and always prints (default false)
 *
 * @param {string}        tag           Pack prefix shown in output, e.g. "HG" → [HG][event]
 * @param {()=>boolean}   isDebugActive Returns true when debug logging should be active.
 * @returns {(message: string, event?: string, warning?: boolean, critical?: boolean) => void}
 */
export function createLogger(tag, isDebugActive) {
  return function log(message, event = "", warning = false, critical = false) {
    if (!critical && !isDebugActive()) return;
    const prefix = event ? `[${tag}][${event}] ` : `[${tag}] `;
    if (!warning) console.info(prefix + message);
    else          console.warn(prefix + message);
  };
}
