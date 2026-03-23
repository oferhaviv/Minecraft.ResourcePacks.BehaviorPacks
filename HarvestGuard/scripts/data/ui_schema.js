/**
 * Harvest Guard – UI form schema.
 * Defines title and sections (label, toggle, dropdown) for the settings form.
 *
 * Alignment: Form order = sections order = formValues[i] for section i.
 * - label:    no path; still occupies formValues[i].
 * - toggle:   path must exist in settingsSchema.defaults.
 * - dropdown: path + options; path must exist in settingsSchema.defaults.
 *
 * Tool dropdown options are derived from config.js so they stay in sync
 * with the actual toolGroups definition automatically.
 */

import CONFIG_DATA from "./config.js";

const toolGroupLabels = Array.isArray(CONFIG_DATA.toolGroups)
  ? CONFIG_DATA.toolGroups.map(g => (typeof g.label === "string" ? g.label : ""))
  : ["Hoes"];

export default {
  title: "Harvest Guard Settings",
  sections: [
    { type: "toggle",   label: "Enable",                     path: "enabled" },
    { type: "dropdown", label: "Tool",                       path: "toolIndex",       options: toolGroupLabels },
    { type: "label",    label: "Protect Crops" },
    { type: "toggle",   label: "Wheat",                      path: "crops.wheat" },
    { type: "toggle",   label: "Carrots",                    path: "crops.carrots" },
    { type: "toggle",   label: "Potatoes",                   path: "crops.potatoes" },
    { type: "toggle",   label: "Beetroot",                   path: "crops.beetroot" },
    { type: "toggle",   label: "Nether Wart",                path: "crops.netherWart" },
    { type: "toggle",   label: "Cocoa",                      path: "crops.cocoa" },
    { type: "label",    label: "Protect Stems" },
    { type: "toggle",   label: "Melon Stem",                 path: "stems.melonStem" },
    { type: "toggle",   label: "Pumpkin Stem",               path: "stems.pumpkinStem" },
    { type: "label",    label: "Protect Vines & Berries" },
    { type: "toggle",   label: "Sweet Berry Bush",           path: "vines.sweetBerryBush" },
    { type: "toggle",   label: "Cave Vines",                 path: "vines.caveVines" },
    { type: "toggle",   label: "Cave Vines (Head)",          path: "vines.caveVinesHead" },
    { type: "label",    label: "Protect Bases" },
    { type: "toggle",   label: "Sugar Cane",                 path: "bases.sugarCane" },
    { type: "toggle",   label: "Bamboo",                     path: "bases.bamboo" },
    { type: "toggle",   label: "Cactus",                     path: "bases.cactus" },
    { type: "toggle",   label: "Protect Breaking Farmland",  path: "protectFarmland" },
    { type: "dropdown", label: "Debug Level",                path: "debugLevelIndex", options: ["None", "Basic"] }
  ]
};
