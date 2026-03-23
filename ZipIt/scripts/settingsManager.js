/**
 * ZipIt – per-player settings management.
 *
 * Storage/caching → shared/playerSettingsStore.js
 * Logging         → shared/logger.js
 * Pack-specific:  settings merge logic and public API wrappers.
 */

import { createLogger }              from "./shared/logger.js";
import { createPlayerSettingsStore } from "./shared/playerSettingsStore.js";
import { DEFAULT_PLAYER_SETTINGS }   from "./data/default_player_settings.js";

const SETTINGS_KEY_PREFIX = "zipit_settings";

// ─── ZipIt-specific settings merge ───────────────────────────────────────────

/** Merge a saved settings object into a fresh copy of defaults (safe migration). */
export function mergeSettings(saved) {
  const out = JSON.parse(JSON.stringify(DEFAULT_PLAYER_SETTINGS));
  if (!saved || typeof saved !== "object") return out;

  if (typeof saved.enabled === "boolean") out.enabled = saved.enabled;

  if (saved.profiles && typeof saved.profiles === "object") {
    if (typeof saved.profiles.miner   === "boolean") out.profiles.miner   = saved.profiles.miner;
    if (typeof saved.profiles.builder === "boolean") out.profiles.builder = saved.profiles.builder;
  }

  if (saved.features && typeof saved.features === "object") {
    if (typeof saved.features.inventorySort === "boolean")
      out.features.inventorySort = saved.features.inventorySort;
  }

  if (saved.debug && typeof saved.debug === "object") {
    if (saved.debug.level === "none" || saved.debug.level === "basic")
      out.debug.level = saved.debug.level;
  }

  if (saved.rules && typeof saved.rules === "object") {
    for (const ruleId of Object.keys(saved.rules)) {
      const r = saved.rules[ruleId];
      if (!r || typeof r !== "object") continue;
      out.rules[ruleId] = {};
      if (typeof r.enabled === "boolean")
        out.rules[ruleId].enabled = r.enabled;
      if (typeof r.minSourceCount === "number" && Number.isFinite(r.minSourceCount) && r.minSourceCount >= 1)
        out.rules[ruleId].minSourceCount = Math.floor(r.minSourceCount);
    }
  }

  return out;
}

// ─── Store & logger ───────────────────────────────────────────────────────────

const _store = createPlayerSettingsStore({
  keyPrefix: SETTINGS_KEY_PREFIX,
  defaults:  DEFAULT_PLAYER_SETTINGS,
  merge:     mergeSettings,
});

/** Pack logger. Active when any cached player has debug.level !== "none".
 *  critical=true bypasses the debug gate and always prints. */
export const logZI = createLogger(
  "ZipIt",
  () => _store.isAnyActive(s => (s.debug?.level ?? "none") !== "none")
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
    logZI(`getSettings ERROR -> defaults. err=${e}`, "getSettings", true, true);
    return _store.cloneDefaults();
  }
}

/** Persists settings. Returns true on success, false on failure. */
export function saveSettings(player, settings) {
  try {
    return _store.saveSettings(player, settings);
  } catch (e) {
    logZI(`saveSettings FAILED err=${e}`, "saveSettings", true, true);
    return false;
  }
}

/** Removes a player's entry from the settings cache. Call on playerLeave. */
export function clearPlayerCache(playerId) {
  _store.clearPlayerCache(playerId);
}
