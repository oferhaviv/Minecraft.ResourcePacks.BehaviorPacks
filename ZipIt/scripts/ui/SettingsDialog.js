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

      // Global toggle first (above tabs), then choose which tab to edit.
      const chooseForm = new ModalFormData()
        .title("ZipIt Settings")
        .toggle("Enable", { defaultValue: !!draft.enabled })
        .dropdown("Tab", ["Basic", "Advanced"], 0);

      const chooseRes = await chooseForm.show(player);
      if (chooseRes.canceled) return;

      const values = chooseRes.formValues;
      // [0]=Enable, [1]=Tab index
      draft.enabled = !!values[0];
      const tabIndex = values[1] === 1 ? 1 : 0;

      if (tabIndex === 0) {
        await showBasicSettingsTab(player, draft);
        return;
      }

      await showAdvancedSettingsTab(player, draft);
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
    form.toggle("Miner", { defaultValue: !!draft?.profiles?.miner });
    form.toggle("Builder", { defaultValue: !!draft?.profiles?.builder });
    form.toggle("Inventory Sort", {
      defaultValue: !!draft?.features?.inventorySort,
    });
    form.dropdown("Debug Level", ["none", "basic"], debugIndex);

    const res = await form.show(player);
    if (res.canceled) return;

    const values = res.formValues;
    // [0]=Miner, [1]=Builder, [2]=Inventory Sort, [3]=Debug dropdown index
    draft.profiles = draft.profiles ?? { miner: true, builder: true };
    draft.profiles.miner = !!values[0];
    draft.profiles.builder = !!values[1];

    draft.features = draft.features ?? { inventorySort: false };
    draft.features.inventorySort = !!values[2];

    const debugLevel = values[3] === 1 ? "basic" : "none";
    draft.debug = draft.debug ?? {};
    draft.debug.level = debugLevel;

    syncGlobalDebugFromDraft(draft);

    const saved = savePlayerSettings(player, draft);
    if (!saved) {
      player.sendMessage("ZipIt: failed to save settings.");
      return;
    }

    player.sendMessage("ZipIt: settings saved.");
  }

  async function showAdvancedSettingsTab(player, baseSettings) {
    const draft = deepClone(baseSettings);
    const debugIndex = getDebugLevelIndexFromLevel(draft?.debug?.level);

    const enableIndex = 0;
    const ruleControlsStartIndex = 1;

    const form = new ModalFormData();
    form.title("ZipIt Settings");
    // Global enable is edited in the first screen; don't repeat it here.

    // One toggle per packing rule
    const ruleIds = [];
    for (const rule of RULES) {
      ruleIds.push(rule.id);
      const profileEnabled = getProfileBasedRuleEnabled(draft, rule);
      const explicit = draft?.rules?.[rule.id]?.enabled;
      const value = typeof explicit === "boolean" ? explicit : profileEnabled;
      form.toggle(getRuleFriendlyName(rule), { defaultValue: value });
    }

    // Footer
    form.dropdown("Debug Level", ["none", "basic"], debugIndex);

    const res = await form.show(player);
    if (res.canceled) return;

    const values = res.formValues;
    // rule toggles shift one index down because enable toggle isn't present
    // values[0..ruleIds.length-1] = rule toggles
    // values[ruleIds.length] = debug dropdown index

    // rule toggles follow in the same order as RULES
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

    const debugLevel = values[ruleIds.length] === 1 ? "basic" : "none";
    draft.debug = draft.debug ?? {};
    draft.debug.level = debugLevel;

    syncGlobalDebugFromDraft(draft);

    const saved = savePlayerSettings(player, draft);
    if (!saved) {
      player.sendMessage("ZipIt: failed to save settings.");
      return;
    }

    player.sendMessage("ZipIt: settings saved.");
  }

  return { handleZpShowSettings };
}

