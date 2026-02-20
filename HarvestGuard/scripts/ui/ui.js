/**
 * Harvest Guard – menu UI (settings form and apply logic).
 * Form is built from ui_schema.js.
 */

import { ModalFormData } from "@minecraft/server-ui";
import { system } from "@minecraft/server";
import { DEFAULT_SETTINGS,UI_SCHEMA } from "../data/data.js";
import { getSettings, saveSettings, mergeSettings, logHG } from "../settingsManager.js";

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

export function buildMenu(settings) {
  const form = new ModalFormData().title(UI_SCHEMA.title);
  for (const section of UI_SCHEMA.sections) {
    if (section.type === "label") {
      form.label(section.label);
    } else if (section.type === "toggle") {
      const def = getNested(settings, section.path);
      form.toggle(section.label, { defaultValue: !!def });
    } else if (section.type === "dropdown" && section.options) {
      const def = getNested(settings, section.path);
      const idx = typeof def === "number" ? def : 0;
      form.dropdown(section.label, section.options, { defaultValueIndex: idx });
    }
  }
  return form;
}

/**
 * Form values order matches schema: formValues[i] is the value for the i-th section
 * (labels have a slot too, typically undefined). So we use section index, not a separate counter.
 */
export function applyFormValuesToSettings(values, currentSettings) {
  const s = mergeSettings(DEFAULT_SETTINGS, currentSettings);
  for (let i = 0; i < UI_SCHEMA.sections.length; i++) {
    const section = UI_SCHEMA.sections[i];
    if (section.type === "label") continue;
    const raw = values[i];
    if (section.type === "toggle") {
      setNested(s, section.path, !!raw);
    } else if (section.type === "dropdown") {
      setNested(s, section.path, Number(raw ?? 0));
    }
  }
  return s;
}

export function showMenuWithRetry(player, triesLeft = 30, waitTime = 2) {
  const current = getSettings(player);
  const form = buildMenu(current);

  form.show(player).then((res) => {
    if (res.canceled && res.cancelationReason === "UserBusy" && triesLeft > 0) {
      system.runTimeout(() => showMenuWithRetry(player, triesLeft - 1, waitTime), waitTime);
      return;
    }
    if (res.canceled) {
      logHG(`UI canceled reason=${res.cancelationReason}`, "showMenuWithRetry", true);
      return;
    }

    const fv = res.formValues ?? [];
    logHG(`formValues len=${fv.length} values=${JSON.stringify(fv)}`, "showMenuWithRetry");
    fv.forEach((v, i) => logHG(`idx ${i} = ${JSON.stringify(v)}`, "showMenuWithRetry"));

    const next = applyFormValuesToSettings(res.formValues ?? [], current);
    saveSettings(player, next);

    player.sendMessage("§a[Harvest Guard] Settings saved.");
    logHG(`Saved settings for ${player.name}: ${JSON.stringify(next)}`, "showMenuWithRetry");
  });
}
