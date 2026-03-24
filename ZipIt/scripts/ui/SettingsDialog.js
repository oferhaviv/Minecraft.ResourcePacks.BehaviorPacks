/**
 * ZipIt – settings menu UI.
 * Mirrors HarvestGuard's ui.js structure: data-driven form built from ui_schema,
 * with retry/dedup logic and a clean build/apply split.
 */

import { ModalFormData } from "@minecraft/server-ui";
import { system } from "@minecraft/server";
import { buildUiSections, resolveRuleEnabled } from "../data/ui_schema.js";
import { logZI, getSettings, saveSettings, mergeSettings } from "../settingsManager.js";

// Prevent concurrent duplicate menu chains for the same player.
const openMenuPlayers = new Set();

/** Call on player leave to release the menu-dedup entry for that player. */
export function clearPlayerMenuState(playerId) {
  openMenuPlayers.delete(playerId);
}

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

export function buildMenu(settings, rules, settingsType = "basic") {
  const sections = buildUiSections(rules, settingsType);
  const form = new ModalFormData().title("ZipIt Settings");

  for (const section of sections) {
    if (section.type === "label") {
      form.label(section.label);
    } else if (section.type === "toggle") {
      form.toggle(section.label, { defaultValue: !!getNested(settings, section.path) });
    } else if (section.type === "rule") {
      form.toggle(section.label, { defaultValue: resolveRuleEnabled(settings, section.rule) });
    } else if (section.type === "dropdown") {
      // debug.level is stored as "none"/"basic" — convert to index for the dropdown.
      const val = getNested(settings, section.path);
      const idx = val === "basic" ? 1 : 0;
      form.dropdown(section.label, section.options, { defaultValueIndex: idx });
    }
  }

  return form;
}

/**
 * Form values order matches sections order: formValues[i] is the value for section i.
 * Labels occupy a slot (typically undefined) so we use section index, not a separate counter.
 */
export function applyFormValuesToSettings(values, currentSettings, rules, settingsType = "basic") {
  const s = mergeSettings(currentSettings);
  const sections = buildUiSections(rules, settingsType);

  for (let i = 0; i < sections.length; i++) {
    if (i >= values.length) break;
    const section = sections[i];
    if (section.type === "label") continue;

    const raw = values[i];

    if (section.type === "toggle") {
      setNested(s, section.path, !!raw);
    } else if (section.type === "rule") {
      if (!s.rules) s.rules = {};
      if (!s.rules[section.ruleId]) s.rules[section.ruleId] = {};
      s.rules[section.ruleId].enabled = !!raw;
    } else if (section.type === "dropdown") {
      // debug.level: index 0 → "none", index 1 → "basic"
      const n = Number(raw ?? 0);
      setNested(s, section.path, (Number.isFinite(n) && Math.floor(n) === 1) ? "basic" : "none");
    }
  }

  return s;
}

// Internal retry loop — does not check openMenuPlayers (entry point handles that).
function _runMenuChain(player, rules, triesLeft, waitTime, settingsType = "basic") {
  try {
    // BUG-04: player may have disconnected during a retry delay.
    // isValid is a property (not a method) in @minecraft/server 2.5.0.
    if (!player?.isValid) {
      openMenuPlayers.delete(player?.id);
      return;
    }

    const current = getSettings(player);
    const form = buildMenu(current, rules, settingsType);

    form.show(player).then((res) => {
      if (res.canceled && res.cancelationReason === "UserBusy" && triesLeft > 0) {
        system.runTimeout(() => _runMenuChain(player, rules, triesLeft - 1, waitTime), waitTime);
        return; // keep player in openMenuPlayers while retrying
      }

      openMenuPlayers.delete(player.id); // chain is done regardless of outcome

      if (res.canceled) {
        logZI(`UI canceled reason=${res.cancelationReason}`, "showAdvMenuWithRetry", true);
        return;
      }

      const fv = res.formValues ?? [];
      logZI(`formValues len=${fv.length} values=${JSON.stringify(fv)}`, "showAdvMenuWithRetry");

      const next = applyFormValuesToSettings(fv, current, rules, settingsType);
      const ok = saveSettings(player, next);

      if (ok) {
        player.sendMessage("§a[ZipIt] Settings saved.");
        logZI(`Saved settings for ${player.name}: ${JSON.stringify(next)}`, "showAdvMenuWithRetry");
      } else {
        player.sendMessage("§c[ZipIt] Failed to save settings. Please try again.");
        logZI(`saveSettings failed for ${player.name}`, "showAdvMenuWithRetry", true, true);
      }
    }).catch((e) => {
      openMenuPlayers.delete(player.id);
      logZI(`form.show error: ${e}`, "showAdvMenuWithRetry", true, true);
    });
  } catch (e) {
    // BUG-05: any synchronous throw (e.g. getSettings failure) must still release the dedup lock.
    openMenuPlayers.delete(player?.id);
    logZI(`_runMenuChain error: ${e}`, "showAdvMenuWithRetry", true, true);
  }
}

/** Show the settings menu. Silently skips if a chain is already active for this player. */
export function showMenuWithRetry(player, rules,settingsType = "basic", triesLeft = 30, waitTime = 2) {
  if (openMenuPlayers.has(player.id)) return; // deduplicate concurrent chains
  openMenuPlayers.add(player.id);

  _runMenuChain(player, rules, triesLeft, waitTime, settingsType);
}

