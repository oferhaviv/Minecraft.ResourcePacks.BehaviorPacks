/**
 * Harvest Guard – data layer.
 * Re-exports from guarded.js, config.js, settingsSchema.js.
 */

import GUARDED_DATA from "./guarded.js";
import CONFIG_DATA from "./config.js";
import SETTINGS_DATA from "./settingsSchema.js";
import UI_SCHEMA_DATA from "./ui_schema.js";

// Config exports
export const TOOLS = Array.isArray(CONFIG_DATA.tools) ? CONFIG_DATA.tools : (CONFIG_DATA.tool ? [CONFIG_DATA.tool] : ["minecraft:iron_hoe"]);
export const TOOL = TOOLS[0];
export const HG_SETTINGS_KEY = CONFIG_DATA.hgSettingsKey;
export const USAGE_MESSAGE = CONFIG_DATA.usageMessage;

// Guarded + settings exports
export const GUARDED = GUARDED_DATA;
export const DEFAULT_SETTINGS = SETTINGS_DATA.defaults;
export const UI_SCHEMA = UI_SCHEMA_DATA;