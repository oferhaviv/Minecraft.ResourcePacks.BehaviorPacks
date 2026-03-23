/**
 * Harvest Guard – data layer.
 * Re-exports from guarded.js, config.js, settingsSchema.js, ui_schema.js.
 */

import GUARDED_DATA from "./guarded.js";
import CONFIG_DATA from "./config.js";
import SETTINGS_DATA from "./settingsSchema.js";
import UI_SCHEMA_DATA from "./ui_schema.js";

// TOOL_GROUPS[i] is the flat array of item IDs for tool-set i (maps to settings.toolIndex).
export const TOOL_GROUPS = Array.isArray(CONFIG_DATA.toolGroups)
  ? CONFIG_DATA.toolGroups.map(g => (Array.isArray(g.items) ? g.items : []))
  : [["minecraft:iron_hoe"]];

// Flat deduplicated list of every item ID that appears in any group.
export const TOOLS = [...new Set(TOOL_GROUPS.flat())];

export const HG_SETTINGS_KEY_ROOT = CONFIG_DATA.hgSettingsKey;
export const USAGE_MESSAGE = CONFIG_DATA.usageMessage;

export const GUARDED = GUARDED_DATA;
export const DEFAULT_SETTINGS = SETTINGS_DATA.defaults;
export const UI_SCHEMA = UI_SCHEMA_DATA;
