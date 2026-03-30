/**
 * Ore Location Detector — per-player settings management.
 *
 * Storage/caching → shared/playerSettingsStore.js
 * Logging         → shared/logger.js
 */

import { createLogger }              from "./shared/logger.js";
import { createPlayerSettingsStore } from "./shared/playerSettingsStore.js";
import { DEFAULT_PLAYER_SETTINGS }   from "./data/default_player_settings.js";

const SETTINGS_KEY_PREFIX = "oredetector_settings";

// ─── Settings merge ───────────────────────────────────────────────────────────

/** Merge a saved settings object into a fresh copy of defaults (safe migration). */
export function mergeSettings(saved) {
  const out = JSON.parse(JSON.stringify(DEFAULT_PLAYER_SETTINGS));
  if (!saved || typeof saved !== "object") return out;

  if (typeof saved.enabled === "boolean") out.enabled = saved.enabled;

  if (saved.ores && typeof saved.ores === "object") {
    for (const key of Object.keys(out.ores)) {
      if (typeof saved.ores[key] === "boolean") out.ores[key] = saved.ores[key];
    }
  }

  if (saved.debug && typeof saved.debug === "object") {
    if (saved.debug.level === "none" || saved.debug.level === "basic")
      out.debug.level = saved.debug.level;
  }

  return out;
}

// ─── Store & logger ───────────────────────────────────────────────────────────

const _store = createPlayerSettingsStore({
  keyPrefix: SETTINGS_KEY_PREFIX,
  defaults:  DEFAULT_PLAYER_SETTINGS,
  merge:     mergeSettings,
});

export const logOD = createLogger(
  "OreDetector",
  () => _store.isAnyActive(s => (s.debug?.level ?? "none") !== "none")
);

// ─── Public API ───────────────────────────────────────────────────────────────

export function cloneDefaultSettings() {
  return _store.cloneDefaults();
}

export function getSettings(player) {
  try {
    return _store.getSettings(player);
  } catch (e) {
    logOD(`getSettings ERROR -> defaults. err=${e}`, "getSettings", true, true);
    return _store.cloneDefaults();
  }
}

export function saveSettings(player, settings) {
  try {
    return _store.saveSettings(player, settings);
  } catch (e) {
    logOD(`saveSettings FAILED err=${e}`, "saveSettings", true, true);
    return false;
  }
}

export function clearPlayerCache(playerId) {
  _store.clearPlayerCache(playerId);
}
