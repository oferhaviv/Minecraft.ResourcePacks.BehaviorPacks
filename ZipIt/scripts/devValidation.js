/**
 * ZipIt – DEV ONLY validation helper.
 *
 * Trigger: /scriptevent zp:validation
 *
 * Spawns a chest (or double chest if needed) stocked with enough raw items
 * to produce 4 packed outputs per rule — one stack per packing rule.
 * The player then picks up items and ZipIt should auto-pack them.
 *
 * IMPORTANT: remove the import of this file from main.js before publishing.
 */

import { system, ItemStack } from "@minecraft/server";
import { PACKING_RULES }     from "./data/packing_rules.js";
import { logZI, getSettings } from "./settingsManager.js";

const CHEST_SIZE = 27; // single chest slot count

export default function registerValidation() {
  if (!system.afterEvents?.scriptEventReceive?.subscribe) return;

  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id !== "zp:validation") return;

    const player = ev.sourceEntity;
    if (!player || player.typeId !== "minecraft:player") return;

    // Guard: only run for players with debug enabled.
    if ((getSettings(player)?.debug?.level ?? "none") === "none") {
      player.sendMessage("§e[ZipIt DEV] Enable Debug Level (Basic) first.");
      return;
    }

    system.runTimeout(() => {
      try {
        spawnValidationChest(player);
      } catch (e) {
        logZI(`zp:validation error: ${e}`, "zp:validation", true, true);
        player.sendMessage(`§c[ZipIt DEV] Failed: ${e}`);
      }
    }, 1);
  });
}

// ─── Chest builder ────────────────────────────────────────────────────────────

function spawnValidationChest(player) {
  const rules = Array.isArray(PACKING_RULES) ? PACKING_RULES : [];

  // One stack per rule: ratio × 4 items gives exactly 4 packable outputs.
  const stacks = rules.map((r) => new ItemStack(r.sourceItem, r.ratio * 4));

  const needsDouble = stacks.length > CHEST_SIZE;

  const dim  = player.dimension;
  const loc  = player.location;
  const base = {
    x: Math.floor(loc.x) + 2,
    y: Math.floor(loc.y),
    z: Math.floor(loc.z),
  };
  const second = { x: base.x, y: base.y, z: base.z + 1 };

  // Place chest block(s); two adjacent chests on the same axis form a double chest.
  dim.setBlockType(base,   "minecraft:chest");
  if (needsDouble) {
    dim.setBlockType(second, "minecraft:chest");
  }

  // Wait a tick for the block entity to initialise before writing to its inventory.
  system.runTimeout(() => {
    fillContainer(dim, base,   stacks, 0);
    if (needsDouble) {
      fillContainer(dim, second, stacks, CHEST_SIZE);
    }

    const label = needsDouble ? "double chest" : "chest";
    player.sendMessage(`§a[ZipIt DEV] Validation ${label} ready — ${stacks.length} rule types.`);
    logZI(`validation ${label} at ${JSON.stringify(base)} for ${player.name}`, "zp:validation");
  }, 2);
}

/**
 * Writes a slice of `stacks` into the container at `pos`.
 * @param {Dimension}   dim    - player's dimension
 * @param {{x,y,z}}     pos    - block position of the chest
 * @param {ItemStack[]} stacks - full stacks array
 * @param {number}      offset - index into stacks to start from
 */
function fillContainer(dim, pos, stacks, offset) {
  const block     = dim.getBlock(pos);
  const container = block?.getComponent("minecraft:inventory")?.container;
  if (!container) {
    logZI(`fillContainer: no inventory at ${JSON.stringify(pos)}`, "zp:validation", true, true);
    return;
  }
  for (let i = offset; i < stacks.length && (i - offset) < container.size; i++) {
    container.setItem(i - offset, stacks[i]);
  }
}
