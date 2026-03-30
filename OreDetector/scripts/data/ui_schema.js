/**
 * Ore Location Detector — UI schema.
 *
 * Drives the ModalFormData form in ui/SettingsDialog.js.
 * Each entry is one of:
 *   { type: "label",    label }
 *   { type: "toggle",   label, path }          path → dot-notation into settings
 *   { type: "dropdown", label, path, options }  options → string[] shown in the dropdown
 */

import { ORE_LIST } from "./ore_list.js";

export const UI_SCHEMA = [
  { type: "toggle", label: "Enable OreDetector", path: "enabled" },

  { type: "label", label: "§7─── Ore Types ───" },
  ...ORE_LIST.map(ore => ({
    type:  "toggle",
    label: `${ore.color}◆ ${ore.label}`,
    path:  `ores.${ore.key}`,
  })),

  { type: "label", label: "§7─── Debug ───" },
  { type: "dropdown", label: "Debug Level", path: "debug.level", options: ["None", "Basic"] },
];
