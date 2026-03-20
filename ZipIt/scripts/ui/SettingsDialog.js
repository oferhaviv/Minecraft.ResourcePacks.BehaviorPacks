import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

// Keep the dialog logic out of `main.js` to reduce its size.
export function createZpSettingsDialogHandlers({
  RULES,
  getPlayerSettings,
  savePlayerSettings,
  myLog,
}) {
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

  function syncGlobalDebugFromDraft(draft) {
    const level = draft?.debug?.level ?? "none";
    globalThis.GLOBAL_SETTINGS = globalThis.GLOBAL_SETTINGS ?? { debugLevelIndex: 0 };
    globalThis.GLOBAL_SETTINGS.debugLevelIndex = level === "basic" ? 1 : 0;
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
      const draft = getPlayerSettings(player);
      syncGlobalDebugFromDraft(draft);

      // Start with basic settings form
      await showBasicSettingsTab(player, draft);
    } catch (error) {
      myLog(`Failed to open settings dialog: ${stringifyError(error)}`, "ZipIt", true);
      player.sendMessage("ZipIt: failed to open settings dialog. See log.");
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
    
    form.action("Advanced Settings", "");
    //form.action("Submit", "");

    const res = await form.show(player);
    if (res.canceled) return;

    // Check if action button was clicked
    // if (res.action === "Advanced Settings") {
    //   await showAdvancedSettingsTab(player, draft);
    //   return;
    // }
    return; // Exit for debug
    // const values = res.formValues;
    // // [0]=Enable, [1]=Sorting, [2]=Miner, [3]=Builder, [4]=Debug dropdown index
    // draft.enabled = !!values[0];
    
    // draft.features = draft.features ?? { inventorySort: false };
    // draft.features.inventorySort = !!values[1];
    
    // draft.profiles = draft.profiles ?? { miner: true, builder: true };
    // draft.profiles.miner = !!values[2];
    // draft.profiles.builder = !!values[3];

    // const debugLevel = values[4] === 1 ? "basic" : "none";
    // draft.debug = draft.debug ?? {};
    // draft.debug.level = debugLevel;

    // syncGlobalDebugFromDraft(draft);

    // const saved = savePlayerSettings(player, draft);
    // if (!saved) {
    //   player.sendMessage("ZipIt: failed to save settings.");
    //   return;
    // }

    player.sendMessage("ZipIt: settings saved.");
  }

  async function showAdvancedSettingsTab(player, baseSettings) {
    const draft = deepClone(baseSettings);
    const debugIndex = getDebugLevelIndexFromLevel(draft?.debug?.level);

    const ruleIds = [];
    const ruleProfiles = {}; // Map to track which rules belong to which profiles

    const form = new ModalFormData();
    form.title("ZipIt Advanced Settings");

    // One toggle per packing rule
    for (const rule of RULES) {
      ruleIds.push(rule.id);
      const profileEnabled = getProfileBasedRuleEnabled(draft, rule);
      const explicit = draft?.rules?.[rule.id]?.enabled;
      const value = typeof explicit === "boolean" ? explicit : profileEnabled;
      form.toggle(getRuleFriendlyName(rule), { defaultValue: value });

      // Track which profiles this rule belongs to
      if (Array.isArray(rule?.profile)) {
        for (const profile of rule.profile) {
          ruleProfiles[profile] = ruleProfiles[profile] ?? [];
          ruleProfiles[profile].push(ruleIds.length - 1); // Store index
        }
      }
    }

    // Footer
    form.dropdown("Debug Level", ["none", "basic"], { defaultValue: debugIndex });
    
    // Submit button
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

      // Only store explicit per-rule enabled when it differs from profile defaults.
      if (enabled === profileEnabled) {
        delete draft.rules[ruleId].enabled;
      } else {
        draft.rules[ruleId].enabled = enabled;
      }
    }

    // Smart profile logic: only enable miner/builder if ALL their rules are toggled
    draft.profiles = draft.profiles ?? { miner: true, builder: true };

    for (const [profileName, ruleIndices] of Object.entries(ruleProfiles)) {
      const allRulesEnabled = ruleIndices.every((idx) => !!values[idx]);
      
      // Only enable the profile if all its rules are toggled
      if (allRulesEnabled) {
        draft.profiles[profileName] = true;
      } else {
        // If not all rules are toggled, disable the profile
        draft.profiles[profileName] = false;
      }
    }

    const debugLevel = values[ruleIds.length] === 1 ? "basic" : "none";
    draft.debug = draft.debug ?? {};
    draft.debug.level = debugLevel;

    syncGlobalDebugFromDraft(draft);

    const saved = savePlayerSettings(player, draft);
    if (!saved) {
      player.sendMessage("ZipIt: failed to save settings.");
      return;
    }

    player.sendMessage("ZipIt: advanced settings saved.");
  }

  return { handleZpShowSettings };
}

