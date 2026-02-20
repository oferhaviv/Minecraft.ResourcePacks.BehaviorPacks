/**
 * Harvest Guard – menu UI (settings form and apply logic).
 */

import { ModalFormData } from "@minecraft/server-ui";
import { system } from "@minecraft/server";
import { DEFAULT_SETTINGS } from "../data/data.js";
import { getSettings, saveSettings, mergeSettings, logHG } from "../settingsManager.js";

export function buildMenu(settings) {
  return new ModalFormData()
    .title("Harvest Guard Settings")
    .toggle("Enable", { defaultValue: settings.enabled })
    .dropdown("Action", ["Always"], { defaultValueIndex: settings.actionModeIndex ?? 0 })
    .dropdown("Tool", ["Iron Hoe"], { defaultValueIndex: settings.toolIndex ?? 0 })
    .label("Protect Crops:")
    .toggle("Wheat", { defaultValue: settings.crops.wheat })
    .toggle("Carrots", { defaultValue: settings.crops.carrots })
    .toggle("Potatoes", { defaultValue: settings.crops.potatoes })
    .toggle("Beetroot", { defaultValue: settings.crops.beetroot })
    .toggle("Nether Wart", { defaultValue: settings.crops.netherWart })
    .toggle("Cocoa", { defaultValue: settings.crops.cocoa })
    .label("Protect Base:")
    .toggle("Sugar Cane", { defaultValue: settings.bases.sugarCane })
    .toggle("Bamboo", { defaultValue: settings.bases.bamboo })
    .toggle("Cactus", { defaultValue: settings.bases.cactus })
    .toggle("Protect Breaking Farmland", { defaultValue: settings.protectFarmland })
    .dropdown("Debug level", ["None", "Basic"], { defaultValueIndex: settings.debugLevelIndex ?? 0 });
}

/**
 * Form values order MUST match buildMenu().
 * Labels consume a slot (undefined) in formValues.
 */
export function applyFormValuesToSettings(values, currentSettings) {
  const s = mergeSettings(DEFAULT_SETTINGS, currentSettings);

  s.enabled = !!values[0];
  s.actionModeIndex = Number(values[1] ?? 0);
  s.toolIndex = Number(values[2] ?? 0);

  s.crops.wheat = !!values[4];
  s.crops.carrots = !!values[5];
  s.crops.potatoes = !!values[6];
  s.crops.beetroot = !!values[7];
  s.crops.netherWart = !!values[8];
  s.crops.cocoa = !!values[9];

  s.bases.sugarCane = !!values[11];
  s.bases.bamboo = !!values[12];
  s.bases.cactus = !!values[13];

  s.protectFarmland = !!values[14];
  s.debugLevelIndex = Number(values[15] ?? 0);

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
