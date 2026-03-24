/**
 * Harvest Guard – flow, guard logic, and event wiring.
 */

import * as mc from "@minecraft/server";
import { GUARDED, TOOL_GROUPS, USAGE_MESSAGE } from "./data/data.js";
import { getSettings, saveSettings, restoreToDefault, logHG, cloneDefaultSettings, clearPlayerCache } from "./settingsManager.js";
import { showMenuWithRetry, clearPlayerMenuState } from "./ui/ui.js";
import registerValidation from "./devValidation.js"; // DEV ONLY – remove before publishing


const { world, system } = mc;

//#region Guard helpers

function checkBlockBelowEqual(block) {
  try {
    const below = block.dimension.getBlock({
      x: block.location.x,
      y: block.location.y - 1,
      z: block.location.z,
    });
    return !!below && below.typeId === block.typeId;
  } catch (e) {
    // Out-of-bounds y (e.g. y=-64) or chunk not loaded — treat as base block (protect it).
    logHG(`checkBlockBelowEqual error: ${e}`, "checkBlockBelowEqual", true, true);
    return false;
  }
}

// Returns true if the rule should be applied to the block based on the settings, false if it should be ignored.
function shouldApplyRuleForBlock(blockTypeId, settings) {
  if (!settings.enabled) return false;

  if (blockTypeId === "minecraft:farmland") {
    return !!settings.protectFarmland;
  }

  if (blockTypeId === "minecraft:reeds" || blockTypeId === "minecraft:sugar_cane") {
    return !!settings.bases.sugarCane;
  }
  if (blockTypeId === "minecraft:bamboo") return !!settings.bases.bamboo;
  if (blockTypeId === "minecraft:bamboo_sapling") return !!settings.bases.bamboo;
  if (blockTypeId === "minecraft:cactus") return !!settings.bases.cactus;

  if (blockTypeId === "minecraft:wheat") return !!settings.crops.wheat;
  if (blockTypeId === "minecraft:carrots") return !!settings.crops.carrots;
  if (blockTypeId === "minecraft:potatoes") return !!settings.crops.potatoes;
  if (blockTypeId === "minecraft:beetroot") return !!settings.crops.beetroot;
  if (blockTypeId === "minecraft:nether_wart") return !!settings.crops.netherWart;
  if (blockTypeId === "minecraft:cocoa") return !!settings.crops.cocoa;
  // Jungle log: checked via cocoaBase rule (looks for an attached unripe pod).
  if (blockTypeId === "minecraft:jungle_log") return !!settings.crops.cocoa;

  if (blockTypeId === "minecraft:melon_stem") return !!settings.stems?.melonStem;
  if (blockTypeId === "minecraft:pumpkin_stem") return !!settings.stems?.pumpkinStem;

  if (blockTypeId === "minecraft:sweet_berry_bush") return !!settings.vines?.sweetBerryBush;
  if (blockTypeId === "minecraft:cave_vines") return !!settings.vines?.caveVines;
  if (blockTypeId === "minecraft:cave_vines_head_with_berries") return !!settings.vines?.caveVines;
  if (blockTypeId === "minecraft:cave_vines_body_with_berries") return !!settings.vines?.caveVines; // fix #5

  return true;
}

function applyGuard({ eventName, ev, block, itemStack, player }) {
  try {
    if (!block) return;
    if (!itemStack) return; // fix #3: exit before clone if no item held

    // Resolve settings — needed to determine the active tool group.
    const settings = player ? getSettings(player) : cloneDefaultSettings();

    // Validate the item against the player's selected tool group.
    const toolGroup = TOOL_GROUPS[settings.toolIndex ?? 0] ?? TOOL_GROUPS[0];
    if (!toolGroup.includes(itemStack.typeId)) return;

    if (!shouldApplyRuleForBlock(block.typeId, settings)) return;

    const states = block?.permutation?.getAllStates?.() ?? {};
    logHG(
      `${block.typeId} @ ${block.location.x},${block.location.y},${block.location.z} | ${JSON.stringify(states)}`,
      eventName
    );

    const cfg = GUARDED[eventName]?.[block.typeId];
    if (!cfg) return;

    let cancel = false;
    let reason = null;

    if (cfg.rule === "preventAlways") {
      cancel = true;
      reason = "preventAlways";
    } else if (cfg.rule === "preventBase") {
      if (!checkBlockBelowEqual(block)) {
        cancel = true;
        reason = "preventBase";
      }
    } else if (cfg.rule === "growth") {
      const v = states[cfg.state];
      if (typeof v === "number") {
        if (v !== cfg.mature) {
          cancel = true;
          reason = `growth(${cfg.state}=${v}!=${cfg.mature})`;
        }
      } else {
        logHG(`No numeric state '${cfg.state}' on ${block.typeId}`, eventName, true);
      }
    } else if (cfg.rule === "cocoaBase") {
      // Cancel if any horizontally adjacent face has an unripe cocoa pod (age < 2).
      // Breaking the jungle log would otherwise destroy the pod without dropping it as a planted crop.
      const offsets = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }];
      for (const o of offsets) {
        try {
          const neighbor = block.dimension.getBlock({
            x: block.location.x + o.x,
            y: block.location.y,
            z: block.location.z + o.z,
          });
          if (neighbor?.typeId === "minecraft:cocoa") {
            const age = neighbor.permutation.getState("age") ?? 2;
            if (age < 2) { cancel = true; reason = `cocoaBase(age=${age})`; break; }
          }
        } catch (e) {
          logHG(`cocoaBase neighbor check error: ${e}`, eventName, true, true);
        }
      }
    }

    if (cancel) {
      ev.cancel = true;
      if (reason) logHG(`CANCELLED ${block.typeId} reason=${reason}`, eventName, true);
    }
  } catch (e) {
    logHG(`applyGuard error: ${e}`, eventName, true, true);
  }
}

//#endregion

//#region Event wiring

if (world.beforeEvents?.playerBreakBlock?.subscribe) {
  world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    applyGuard({
      eventName: "playerBreakBlock",
      ev,
      block: ev.block,
      itemStack: ev.itemStack,
      player: ev.player ?? ev.source,
    });
  });
} else {
  logHG("not available in this API version.", "beforeEvents.playerBreakBlock", true, true);
}

//usage example: /scriptevent hg:active true
if (system.afterEvents?.scriptEventReceive?.subscribe) {
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    try { // fix #4: outer try/catch so no single handler error kills the subscriber
      logHG(`scriptEventRecieved: id: ${ev.id} ${ev.message}`);

      if (ev.id === "hg:settings") {
        const player = ev.sourceEntity;
        if (!player) { logHG("sourceEntity is null", "hg:settings", true, true); return; }
        system.runTimeout(() => {  // fix #1: guard against player leaving in the 2-tick window
          try { showMenuWithRetry(player); }
          catch (e) { logHG(`showMenuWithRetry error: ${e}`, "hg:settings", true, true); }
        }, 2);
        return;
      }
      if (ev.id === "hg:restore") {
        const player = ev.sourceEntity;
        if (!player) { logHG("sourceEntity is null", "hg:restore", true, true); return; }
        system.runTimeout(() => {  // fix #1: guard against player leaving in the 2-tick window
          try { restoreToDefault(player); }
          catch (e) { logHG(`restoreToDefault error: ${e}`, "hg:restore", true, true); }
        }, 2);
        return;
      }
      if (ev.id === "hg:show") {
        const player = ev.sourceEntity;
        if (!player) { logHG("sourceEntity is null", "hg:show", true, true); return; }
        const s = getSettings(player);
        player.sendMessage("[Harvest Guard] " + JSON.stringify(s));
        return;
      }
      if (ev.id === "hg:active") {
        const player = ev.sourceEntity;
        if (!player) { logHG("player is null", "hg:active", true, true); return; }
        const msg = String(ev.message).toLowerCase();
        const s = getSettings(player); // fix #1/#6: getSettings returns a clone — safe to mutate
        if (msg === "true" || msg === "false") {
          s.enabled = (msg === "true");
          if (!saveSettings(player, s)) {
            player.sendMessage("§c[Harvest Guard] Failed to save settings. Please try again.");
            return;
          }
        }
        player.sendMessage(s.enabled
          ? "§a[Harvest Guard] Harvest Guard is enabled."
          : "§a[Harvest Guard] Harvest Guard is disabled.");
        return;
      }
      if (ev.id === "hg:validation") { registerValidation(ev.sourceEntity); return; } // DEV ONLY – handled by devValidation.js; remove with the import
      if (ev.id.toString().startsWith("hg:")) {
        const player = ev.sourceEntity;
        if (!player) return;
        system.runTimeout(() => player.sendMessage(USAGE_MESSAGE), 2);
        return;
      }
    } catch (e) {
      logHG(`scriptEvent handler error: ${e}`, "scriptEventReceive", true, true);
    }
  });
} else {
  logHG("not available in this API version.", "system.afterEvents.scriptEventReceive", true, true);
}

// Clear both caches when a player leaves to prevent unbounded memory growth.
if (world.afterEvents?.playerLeave?.subscribe) {
  world.afterEvents.playerLeave.subscribe((ev) => {
    clearPlayerCache(ev.playerId);
    clearPlayerMenuState(ev.playerId); // fix #8: also remove from menu-dedup set
    logHG(`cache cleared for player ${ev.playerId}`, "playerLeave");
  });
}

//#endregion



