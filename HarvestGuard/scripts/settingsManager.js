/**
 * Harvest Guard – get/set and merge of per-player settings.
 */

import { DEFAULT_SETTINGS, HG_SETTINGS_KEY_ROOT } from "./data/data.js";

const settingsCache = new Map(); // player.id -> settings object

function sdbg(message) {
  logHG(message, "SETTINGS", false);
}

export function cloneDefaultSettings() {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

/** Merge saved settings into defaults (safe migration). */
export function mergeSettings(saved) {
  const out = cloneDefaultSettings();
  if (!saved || typeof saved !== "object") {
    sdbg("mergeSettings: saved invalid -> returning defaults");
    return out;
  }

  sdbg(`mergeSettings IN saved=${JSON.stringify(saved)}`);

  if (typeof saved.enabled === "boolean") out.enabled = saved.enabled;
  if (typeof saved.actionModeIndex === "number") out.actionModeIndex = saved.actionModeIndex;
  if (typeof saved.toolIndex === "number") out.toolIndex = saved.toolIndex;
  if (typeof saved.protectFarmland === "boolean") out.protectFarmland = saved.protectFarmland;
  if (typeof saved.debugLevelIndex === "number") out.debugLevelIndex = saved.debugLevelIndex;

  if (saved.crops && typeof saved.crops === "object") {
    for (const k of Object.keys(out.crops)) {
      if (typeof saved.crops[k] === "boolean") out.crops[k] = saved.crops[k];
    }
  }

  if (saved.bases && typeof saved.bases === "object") {
    for (const k of Object.keys(out.bases)) {
      if (typeof saved.bases[k] === "boolean") out.bases[k] = saved.bases[k];
    }
  }

  if (saved.stems && typeof saved.stems === "object") {
    for (const k of Object.keys(out.stems)) {
      if (typeof saved.stems[k] === "boolean") out.stems[k] = saved.stems[k];
    }
  }

  if (saved.vines && typeof saved.vines === "object") {
    for (const k of Object.keys(out.vines)) {
      if (typeof saved.vines[k] === "boolean") out.vines[k] = saved.vines[k];
    }
  }

  sdbg(`mergeSettings OUT out=${JSON.stringify(out)}`);
  return out;
}

export function getSettings(player) {
  try {
    if (settingsCache.has(player.id)) {
      // fix #1/#6: return a defensive clone so callers cannot corrupt the cache by mutation.
      return JSON.parse(JSON.stringify(settingsCache.get(player.id)));
    }

    const HG_SETTINGS_KEY = `${HG_SETTINGS_KEY_ROOT}_${player.id}`;
    const raw = player.getDynamicProperty(HG_SETTINGS_KEY);

    if (typeof raw !== "string" || raw.length === 0) {
      const defaults = cloneDefaultSettings();
      settingsCache.set(player.id, defaults);
      return defaults;
    }

    const parsed = JSON.parse(raw);
    sdbg(`getSettings parsed keys=${Object.keys(parsed ?? {}).join(",")}`);
    const merged = mergeSettings(parsed);  // fix #1: was mergeSettings(DEFAULT_SETTINGS, parsed)
    settingsCache.set(player.id, merged);
    return merged;
  } catch (e) {
    logHG(`getSettings ERROR -> defaults. err=${e}`, "getSettings", true, true);
    const fallback = cloneDefaultSettings();
    if (player?.id) settingsCache.set(player.id, fallback);  // fix #6: cache on error path
    return fallback;
  }
}

/** Returns true on success, false on failure. */
export function saveSettings(player, settings) {
  try {
    const str = JSON.stringify(settings);
    const HG_SETTINGS_KEY = `${HG_SETTINGS_KEY_ROOT}_${player.id}`;
    player.setDynamicProperty(HG_SETTINGS_KEY, str);
    settingsCache.set(player.id, settings);
    const back = player.getDynamicProperty(HG_SETTINGS_KEY);
    sdbg(`saveSettings readBack type=${typeof back} value=${String(back).slice(0, 200)}`);
    return true;
  } catch (e) {
    logHG(`saveSettings FAILED err=${e}`, "saveSettings", true, true);  // fix #3: critical + visible
    return false;
  }
}

export function restoreToDefault(player) {
  const d = cloneDefaultSettings();
  const ok = saveSettings(player, d);
  if (ok) {
    player.sendMessage("§a[Harvest Guard] Restored settings to defaults.");
  } else {
    player.sendMessage("§c[Harvest Guard] Failed to restore settings. Please try again.");
  }
}

/** Removes a player's entry from the settings cache. Call on player leave. */
export function clearPlayerCache(playerId) {
  settingsCache.delete(playerId);
}

/** Log helper. Logging is active when any cached player has debugLevelIndex > 0.
 *  critical=true bypasses the debug check and always prints. */
export function logHG(m, event = "", warning = false, critical = false) {
  if (!critical) {
    // fix #8: scan cache instead of relying on a single shared scalar
    let active = false;
    for (const s of settingsCache.values()) {
      if ((s.debugLevelIndex ?? 0) > 0) { active = true; break; }
    }
    if (!active) return;
  }
  const prefix = event ? `[HG][${event}] ` : "[HG] ";
  if (!warning) console.info(prefix + m);
  else console.warn(prefix + m);
}
