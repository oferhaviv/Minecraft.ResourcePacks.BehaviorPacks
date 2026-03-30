/**
 * Ore Location Detector — settings menu UI.
 *
 * Data-driven form built from data/ui_schema.js.
 * Mirrors HarvestGuard's ui.js: build/apply split, retry on UserBusy, dedup lock.
 */

import { ModalFormData } from "@minecraft/server-ui";
import { system }        from "@minecraft/server";
import { UI_SCHEMA }     from "../data/ui_schema.js";
import { logOD, getSettings, saveSettings, mergeSettings } from "../settingsManager.js";

// Prevent concurrent duplicate menu chains for the same player.
const openMenuPlayers = new Set();

/** Call on playerLeave to release the dedup lock for that player. */
export function clearPlayerMenuState(playerId) {
  openMenuPlayers.delete(playerId);
}

// ─── Nested property helpers ──────────────────────────────────────────────────

function getNested(obj, path) {
  const parts = path.split(".");
  let v = obj;
  for (const p of parts) {
    if (v == null) return undefined;
    v = v[p];
  }
  return v;
}

function setNested(obj, path, value) {
  const parts = path.split(".");
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (o[p] == null || typeof o[p] !== "object") o[p] = {};
    o = o[p];
  }
  o[parts[parts.length - 1]] = value;
}

// ─── Form build / apply ───────────────────────────────────────────────────────

export function buildMenu(settings) {
  const form = new ModalFormData().title("Ore Location Detector");

  for (const section of UI_SCHEMA) {
    if (section.type === "label") {
      form.label(section.label);
    } else if (section.type === "toggle") {
      form.toggle(section.label, { defaultValue: !!getNested(settings, section.path) });
    } else if (section.type === "dropdown") {
      const val = getNested(settings, section.path);
      // debug.level is stored as "none"/"basic"; all other dropdowns store the index.
      const idx = section.path === "debug.level"
        ? (val === "basic" ? 1 : 0)
        : (typeof val === "number" ? Math.max(0, Math.floor(val)) : 0);
      form.dropdown(section.label, section.options, { defaultValueIndex: idx });
    }
  }

  return form;
}

/**
 * Map submitted form values back onto a settings clone.
 * formValues[i] corresponds to UI_SCHEMA[i] — labels occupy a slot (undefined).
 */
export function applyFormValuesToSettings(values, currentSettings) {
  const s = mergeSettings(currentSettings);

  for (let i = 0; i < UI_SCHEMA.length; i++) {
    if (i >= values.length) break;
    const section = UI_SCHEMA[i];
    if (section.type === "label") continue;

    const raw = values[i];

    if (section.type === "toggle") {
      setNested(s, section.path, !!raw);
    } else if (section.type === "dropdown") {
      const n = Number(raw ?? 0);
      if (section.path === "debug.level") {
        // Stored as string "none"/"basic", not an index.
        setNested(s, section.path, (Number.isFinite(n) && Math.floor(n) === 1) ? "basic" : "none");
      } else {
        // All other dropdowns store the selected index as a number.
        setNested(s, section.path, Number.isFinite(n) ? Math.floor(n) : 0);
      }
    }
  }

  return s;
}

// ─── Menu chain ───────────────────────────────────────────────────────────────

function _runMenuChain(player, triesLeft, waitTime, onSaved) {
  try {
    if (!player?.isValid) {
      openMenuPlayers.delete(player?.id);
      return;
    }

    const current = getSettings(player);
    const form    = buildMenu(current);

    form.show(player).then((res) => {
      if (res.canceled && res.cancelationReason === "UserBusy" && triesLeft > 0) {
        system.runTimeout(() => _runMenuChain(player, triesLeft - 1, waitTime, onSaved), waitTime);
        return; // keep player in openMenuPlayers while retrying
      }

      openMenuPlayers.delete(player.id);

      if (res.canceled) {
        logOD(`UI canceled: ${res.cancelationReason}`, "settings", true);
        return;
      }

      const next = applyFormValuesToSettings(res.formValues ?? [], current);
      if (saveSettings(player, next)) {
        player.sendMessage("§a[OreDetector] Settings saved.");
        logOD(`settings saved for ${player.name}: ${JSON.stringify(next)}`, "settings");
        onSaved?.();
      } else {
        player.sendMessage("§c[OreDetector] Failed to save settings. Please try again.");
        logOD(`saveSettings failed for ${player.name}`, "settings", true, true);
      }
    }).catch((e) => {
      openMenuPlayers.delete(player.id);
      logOD(`form.show error: ${e}`, "settings", true, true);
    });
  } catch (e) {
    openMenuPlayers.delete(player?.id);
    logOD(`_runMenuChain error: ${e}`, "settings", true, true);
  }
}

/**
 * Show the settings menu. Silently skips if a chain is already active for this player.
 * @param {Function} [onSaved] Optional callback fired after a successful save.
 */
export function showMenuWithRetry(player, onSaved = null, triesLeft = 30, waitTime = 2) {
  if (openMenuPlayers.has(player.id)) return;
  openMenuPlayers.add(player.id);
  _runMenuChain(player, triesLeft, waitTime, onSaved);
}
