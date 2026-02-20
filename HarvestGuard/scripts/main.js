/**
 * Harvest Guard – flow, guard logic, and event wiring.
 */

import * as mc from "@minecraft/server";
import { GUARDED, TOOL, USAGE_MESSAGE } from "./data/data.js";
import { getSettings, restoreToDefault, logHG, cloneDefaultSettings } from "./settingsManager.js";
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

  return true;
}

function applyGuard({ eventName, ev, block, itemStack, player }) {
  if (!block) return;

  if (!itemStack || itemStack.typeId !== TOOL) return;

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

    if (message === ".hg show settings") {
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
