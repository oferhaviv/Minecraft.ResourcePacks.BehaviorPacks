/**
 * Harvest Guard – flow, guard logic, and event wiring.
 */

import * as mc from "@minecraft/server";
import { GUARDED, TOOLS, USAGE_MESSAGE } from "./data/data.js";
import { getSettings, saveSettings,restoreToDefault, logHG, cloneDefaultSettings } from "./settingsManager.js";
import { showMenuWithRetry } from "./ui/ui.js";


const { world, system } = mc;

//#region Guard helpers

function checkBlockBelowEqual(block) {
  const below = block.dimension.getBlock({
    x: block.location.x,
    y: block.location.y - 1,
    z: block.location.z,
  });
  return !!below && below.typeId === block.typeId;
}

function shouldApplyRuleForBlock(blockTypeId, settings) {
  if (!settings.enabled) return false;

  if (blockTypeId === "minecraft:farmland") {
    return !!settings.protectFarmland;
  }

  if (blockTypeId === "minecraft:reeds" || blockTypeId === "minecraft:sugar_cane") {
    return !!settings.bases.sugarCane;
  }
  if (blockTypeId === "minecraft:bamboo") return !!settings.bases.bamboo;
  if (blockTypeId === "minecraft:cactus") return !!settings.bases.cactus;

  if (blockTypeId === "minecraft:wheat") return !!settings.crops.wheat;
  if (blockTypeId === "minecraft:carrots") return !!settings.crops.carrots;
  if (blockTypeId === "minecraft:potatoes") return !!settings.crops.potatoes;
  if (blockTypeId === "minecraft:beetroot") return !!settings.crops.beetroot;
  if (blockTypeId === "minecraft:nether_wart") return !!settings.crops.netherWart;
  if (blockTypeId === "minecraft:cocoa") return !!settings.crops.cocoa;

  if (blockTypeId === "minecraft:melon_stem") return !!settings.stems?.melonStem;
  if (blockTypeId === "minecraft:pumpkin_stem") return !!settings.stems?.pumpkinStem;

  if (blockTypeId === "minecraft:sweet_berry_bush") return !!settings.vines?.sweetBerryBush;
  if (blockTypeId === "minecraft:cave_vines") return !!settings.vines?.caveVines;
  if (blockTypeId === "minecraft:cave_vines_head_with_berries") return !!settings.vines?.caveVinesHead;

  return true;
}

function applyGuard({ eventName, ev, block, itemStack, player }) {
  if (!block) return;

  // Check if the item is one of the allowed tools
  if (!itemStack || !TOOLS.includes(itemStack.typeId)) return;

  const settings = player ? getSettings(player) : cloneDefaultSettings();
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
  }

  if (cancel) {
    ev.cancel = true;
    if (reason) logHG(`CANCELLED ${block.typeId} reason=${reason}`, eventName, true);
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
  logHG("not available in this API version.", "beforeEvents.playerBreakBlock", true);
}

//usage example: /scriptevent hg:active true
if (system.afterEvents?.scriptEventReceive?.subscribe) {
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    logHG(`scriptEventRecieved: id: ${ev.id} ${ev.message}`);

    if (ev.id === "hg:settings") {
      system.runTimeout(() => showMenuWithRetry(ev.sourceEntity), 2);
      return;
    }
    if (ev.id === "hg:restore") {
      system.runTimeout(() => restoreToDefault(ev.sourceEntity), 2);
      return;
    }
    if (ev.id === "hg:show") {
      const s = getSettings(ev.sourceEntity);
      ev.sourceEntity.sendMessage("[Harvest Guard] " + JSON.stringify(s));
      return;
    }
    if (ev.id === "hg:active") {
      const player = ev.sourceEntity;
      if (!player) {
        logHG("player is null", "hg:active", true);
        return;
      }
      const msg = String(ev.message).toLowerCase();
      const s = getSettings(player);
      if (msg === "true" || msg === "false") {
        s.enabled = (msg === "true");   // המרה ל-boolean
        saveSettings(player, s);
      }
      if (s.enabled) {
        player.sendMessage("§a[Harvest Guard] Harvest Guard is enabled.");
      } else {  
        player.sendMessage("§a[Harvest Guard] Harvest Guard is disabled.");
      }

      return;
    }
    if (ev.id.toString().startsWith("hg:")) {//show usage if no valid command after hg:
      system.runTimeout(() => ev.sourceEntity.sendMessage(USAGE_MESSAGE), 2);
      return;
    }
  });
} else {
  console.warn("world.afterEvents.scriptEventReceive.subscribe not available in this API version.");
}

if (world.beforeEvents?.chatSend?.subscribe) {
  world.beforeEvents.chatSend.subscribe((data) => {
    const message = data.message?.trim().toLowerCase().replace(/\s+/g, " ");

    if (message === ".hg") {
      logHG(`message with .hg found, sender:${data.sender?.name ?? "null"} message: ${message}`);
      data.cancel = true;
      data.sender.sendMessage(USAGE_MESSAGE);
      return;
    }

    if (message === ".hg settings") {
      data.cancel = true;
      system.runTimeout(() => showMenuWithRetry(data.sender), 2);
      return;
    }

    if (message === ".hg restore") {
      data.cancel = true;
      restoreToDefault(data.sender);
      return;
    }

    if (message === ".hg show") {
      data.cancel = true;
      const s = getSettings(data.sender);
      data.sender.sendMessage("§a[Harvest Guard] " + JSON.stringify(s));
      return;
    }
  });
} else {
  logHG("not available in this API version.", "beforeEvents.chatSend", true);
}

//#endregion
