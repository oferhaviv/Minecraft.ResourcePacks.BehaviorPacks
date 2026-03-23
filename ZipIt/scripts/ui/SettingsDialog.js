import { ModalFormData } from "@minecraft/server-ui";
import { logZI, getSettings, saveSettings } from "../settingsManager.js";

// Keep the dialog logic out of `main.js` to reduce its size.
export function createZpSettingsDialogHandlers({ RULES }) {
  const deepClone = (value) => JSON.parse(JSON.stringify(value));

  const stringifyError = (error) => {
    try {
      if (error instanceof Error) return `${error.name}: ${error.message}`;
      return String(error);
    } catch {
      return "Unknown error";
    }
  };

  function getDebugLevelIndexFromLevel(level) {
    return level === "basic" ? 1 : 0;
  }

  function getRuleFriendlyName(rule) {
    if (typeof rule?.friendlyName === "string" && rule.friendlyName.trim() !== "") {
      return rule.friendlyName.trim();
    }

    const raw = rule?.id ?? rule?.sourceItem ?? "unknown_rule";
    const s = String(raw).replace(/^minecraft:/, "").replace(/_/g, " ");
    return s.replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function getProfileBasedRuleEnabled(playerSettings, rule) {
    const ruleProfiles = Array.isArray(rule?.profile) ? rule.profile : [];
    if (ruleProfiles.length === 0) return rule.enabledByDefault ?? true;
    return ruleProfiles.some((p) => playerSettings?.profiles?.[p] === true);
  }

  async function handleZpShowSettings(player) {
    try {
      const draft = getSettings(player);
      showBasicSettingsTab(player, draft);
    } catch (error) {
      logZI(`Failed to open settings dialog: ${stringifyError(error)}`, "showSettings", true, true);
      player.sendMessage(`ZipIt: failed to open settings dialog. ${stringifyError(error)} See log.`);
    }
  }

  async function showBasicSettingsTab(player, baseSettings) {
    const draft = deepClone(baseSettings);
    const debugIndex = getDebugLevelIndexFromLevel(draft?.debug?.level);

    const form = new ModalFormData();
    form.title("ZipIt Settings");

    // 1. Toggle for feature Enable
    form.toggle("Enable Feature", { defaultValue: !!draft.enabled });

    // 2. Toggle for Sorting
    form.toggle("Inventory Sort", { defaultValue: !!draft?.features?.inventorySort });

    // 3. Toggle for Miner mode
    form.toggle("Miner", { defaultValue: !!draft?.profiles?.miner });

    // 4. Toggle for Builder mode
    form.toggle("Builder", { defaultValue: !!draft?.profiles?.builder });

    // 5. Dropdown for Debug level
    form.dropdown("Debug Level", ["none", "basic"], { defaultValue: debugIndex });

    const res = await form.show(player);
    if (res.canceled) return;

    // TODO: apply basic settings form values
  }

  async function showAdvancedSettingsTab(player, baseSettings) {
    const draft = deepClone(baseSettings);
    const debugIndex = getDebugLevelIndexFromLevel(draft?.debug?.level);

    const ruleIds = [];
    const ruleProfiles = {};

    const form = new ModalFormData();
    form.title("ZipIt Advanced Settings");

    // One toggle per packing rule
    for (const rule of RULES) {
      ruleIds.push(rule.id);
      const profileEnabled = getProfileBasedRuleEnabled(draft, rule);
      const explicit = draft?.rules?.[rule.id]?.enabled;
      const value = typeof explicit === "boolean" ? explicit : profileEnabled;
      form.toggle(getRuleFriendlyName(rule), { defaultValue: value });

      if (Array.isArray(rule?.profile)) {
        for (const profile of rule.profile) {
          ruleProfiles[profile] = ruleProfiles[profile] ?? [];
          ruleProfiles[profile].push(ruleIds.length - 1);
        }
      }
    }

    form.dropdown("Debug Level", ["none", "basic"], { defaultValue: debugIndex });
    form.action("Submit", "");

    const res = await form.show(player);
    if (res.canceled) return;

    const values = res.formValues;

    // Store rule toggles
    for (let i = 0; i < ruleIds.length; i++) {
      const ruleId = ruleIds[i];
      const enabled = !!values[i];
      const rule = RULES[i];

      const profileEnabled = getProfileBasedRuleEnabled(draft, rule);

      draft.rules = draft.rules ?? {};
      draft.rules[ruleId] = draft.rules[ruleId] ?? {};

      if (enabled === profileEnabled) {
        delete draft.rules[ruleId].enabled;
      } else {
        draft.rules[ruleId].enabled = enabled;
      }
    }

    draft.profiles = draft.profiles ?? { miner: true, builder: true };

    for (const [profileName, ruleIndices] of Object.entries(ruleProfiles)) {
      const allRulesEnabled = ruleIndices.every((idx) => !!values[idx]);
      draft.profiles[profileName] = allRulesEnabled;
    }

    const debugLevel = values[ruleIds.length] === 1 ? "basic" : "none";
    draft.debug = draft.debug ?? {};
    draft.debug.level = debugLevel;

    const saved = saveSettings(player, draft);
    if (!saved) {
      player.sendMessage("ZipIt: failed to save settings.");
      return;
    }

    player.sendMessage("ZipIt: advanced settings saved.");
  }

  return { handleZpShowSettings };
}
