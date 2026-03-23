/**
 * Harvest Guard – per-player settings management.
 *
 * Public API is unchanged from the pre-shared version; all other HarvestGuard
 * files import from here without modification.
 *
 * Storage and caching are delegated to shared/playerSettingsStore.js.
 * Logging is delegated to shared/logger.js.
 * What stays here: the HG-specific settings merge logic and the public wrappers
 * that add error handling and pack-level messaging.
 */

import { createLogger }             from "./shared/logger.js";
import { createPlayerSettingsStore } from "./shared/playerSettingsStore.js";
import { DEFAULT_SETTINGS, HG_SETTINGS_KEY_ROOT } from "./data/data.js";

// ─── HG-specific settings merge ──────────────────────────────────────────────

/** Merge a saved settings object into a fresh copy of defaults (safe migration). */
export function mergeSettings(saved) {
  const out = _store.cloneDefaults();
  if (!saved || typeof saved !== "object") {
    logHG("mergeSettings: saved invalid -> returning defaults", "SETTINGS");
    return out;
  }

  logHG(`mergeSettings IN saved=${JSON.stringify(saved)}`, "SETTINGS");

  if (typeof saved.enabled          === "boolean") out.enabled          = saved.enabled;
  if (typeof saved.toolIndex        === "number")  out.toolIndex        = saved.toolIndex;
  if (typeof saved.protectFarmland  === "boolean") out.protectFarmland  = saved.protectFarmland;
  if (typeof saved.debugLevelIndex  === "number")  out.debugLevelIndex  = saved.debugLevelIndex;

  for (const group of ["crops", "stems", "vines", "bases"]) {
    if (saved[group] && typeof saved[group] === "object") {
      for (const k of Object.keys(out[group])) {
        if (typeof saved[group][k] === "boolean") out[group][k] = saved[group][k];
      }
    }
  }

  logHG(`mergeSettings OUT out=${JSON.stringify(out)}`, "SETTINGS");
  return out;
}

// ─── Store & logger ───────────────────────────────────────────────────────────
// Store is created first so the logger can reference its cache via isAnyActive().
// mergeSettings is safe to pass here even though it references logHG below —
// the store only calls merge() at runtime (inside event callbacks), by which
// point all module-level consts are fully initialised.

const _store = createPlayerSettingsStore({
  keyPrefix: HG_SETTINGS_KEY_ROOT,
  defaults:  DEFAULT_SETTINGS,
  merge:     mergeSettings,
});

/** Pack logger. Active when any cached player has debugLevelIndex > 0.
 *  critical=true bypasses the debug gate and always prints. */
export const logHG = createLogger(
  "HG",
  () => _store.isAnyActive(s => (s.debugLevelIndex ?? 0) > 0)
);

// ─── Public API ───────────────────────────────────────────────────────────────

/** Returns a deep clone of the default settings. */
export function cloneDefaultSettings() {
  return _store.cloneDefaults();
}

/** Returns a clone of the player's current settings (reads from cache or storage). */
export function getSettings(player) {
  try {
    return _store.getSettings(player);
  } catch (e) {
    logHG(`getSettings ERROR -> defaults. err=${e}`, "getSettings", true, true);
    return _store.cloneDefaults();
  }
}

/** Persists settings. Returns true on success, false on failure. */
export function saveSettings(player, settings) {
  try {
    return _store.saveSettings(player, settings);
  } catch (e) {
    logHG(`saveSettings FAILED err=${e}`, "saveSettings", true, true);
    return false;
  }
}

/** Resets the player's settings to defaults and notifies them. */
export function restoreToDefault(player) {
  const d  = _store.cloneDefaults();
  const ok = saveSettings(player, d);
  try {
    player.sendMessage(ok
      ? "§a[Harvest Guard] Restored settings to defaults."
      : "§c[Harvest Guard] Failed to restore settings. Please try again."
    );
  } catch (e) {
    logHG(`restoreToDefault sendMessage error: ${e}`, "restoreToDefault", true, true);
  }
}

/** Removes a player's entry from the settings cache. Call on playerLeave. */
export function clearPlayerCache(playerId) {
  _store.clearPlayerCache(playerId);
}
