/**
 * Harvest Guard – get/set and merge of per-player settings.
 */

import { DEFAULT_SETTINGS, HG_SETTINGS_KEY } from "./data/data.js";

let GLOBAL_SETTINGS = null;

function sdbg(message) {
  logHG(message, "SETTINGS", false);
}

export function cloneDefaultSettings() {
  const out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  GLOBAL_SETTINGS = out;
  return out;
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

  sdbg(`mergeSettings OUT out=${JSON.stringify(out)}`);
  GLOBAL_SETTINGS = out;
  return out;
}

export function getSettings(player) {
  try {
    if (GLOBAL_SETTINGS) {
      return GLOBAL_SETTINGS;
    }
    const raw = player.getDynamicProperty(HG_SETTINGS_KEY);

    if (typeof raw !== "string" || raw.length === 0) {
      return cloneDefaultSettings();
    }

    const parsed = JSON.parse(raw);
    sdbg(`getSettings parsed keys=${Object.keys(parsed ?? {}).join(",")}`);
    const merged = mergeSettings(DEFAULT_SETTINGS, parsed);
    return merged;
  } catch (e) {
    logHG(`getSettings ERROR -> defaults. err=${e}`, "getSettings", true);
    return cloneDefaultSettings();
  }
}

export function saveSettings(player, settings) {
  try {
    const str = JSON.stringify(settings);
    player.setDynamicProperty(HG_SETTINGS_KEY, str);
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

/** Log helper; respects debugLevelIndex from current GLOBAL_SETTINGS. */
export function logHG(m, event = "", warning = false) {
  let logDebug = 0;
  if (GLOBAL_SETTINGS != null) {
    logDebug = GLOBAL_SETTINGS.debugLevelIndex;
  }
  if (logDebug === 0) return;
  const prefix = event ? `[HG][${event}] ` : "[HG] ";
  if (!warning) console.info(prefix + m);
  else console.warn(prefix + m);
}
