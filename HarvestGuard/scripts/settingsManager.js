/**
 * Harvest Guard – get/set and merge of per-player settings.
 */

import { DEFAULT_SETTINGS, HG_SETTINGS_KEY_ROOT } from "./data/data.js";

const settingsCache = new Map(); // player.id -> settings object
let debugLevelIndex = 0;

function sdbg(message) {
  logHG(message, "SETTINGS", false);
}

export function cloneDefaultSettings() {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

/** Merge saved settings into defaults (safe migration). */
export function mergeSettings(defaults, saved) {
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
      return settingsCache.get(player.id);
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
    const merged = mergeSettings(DEFAULT_SETTINGS, parsed);
    settingsCache.set(player.id, merged);
    debugLevelIndex = merged.debugLevelIndex ?? 0;
    return merged;
  } catch (e) {
    logHG(`getSettings ERROR -> defaults. err=${e}`, "getSettings", true);
    return cloneDefaultSettings();
  }
}

export function saveSettings(player, settings) {
  try {
    const str = JSON.stringify(settings);
    const HG_SETTINGS_KEY = `${HG_SETTINGS_KEY_ROOT}_${player.id}`;
    player.setDynamicProperty(HG_SETTINGS_KEY, str);
    settingsCache.set(player.id, settings);
    debugLevelIndex = settings.debugLevelIndex ?? 0;
    const back = player.getDynamicProperty(HG_SETTINGS_KEY);
    sdbg(`saveSettings readBack type=${typeof back} value=${String(back).slice(0, 200)}`);
  } catch (e) {
    sdbg(`saveSettings FAILED err=${e}`);
  }
}

export function restoreToDefault(player) {
  const d = cloneDefaultSettings();
  saveSettings(player, d);
  player.sendMessage("§a[Harvest Guard] Restored settings to defaults.");
}

/** Log helper; respects debugLevelIndex updated on each settings read/write. */
export function logHG(m, event = "", warning = false) {
  if (debugLevelIndex === 0) return;
  const prefix = event ? `[HG][${event}] ` : "[HG] ";
  if (!warning) console.info(prefix + m);
  else console.warn(prefix + m);
}
