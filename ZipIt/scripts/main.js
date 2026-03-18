import { world, ItemStack } from "@minecraft/server";

const TRIGGER_ITEM = "minecraft:blaze_rod";
const SOURCE_ITEM = "minecraft:redstone";
const TARGET_ITEM = "minecraft:redstone_block";
const RATIO = 9;

// Optional: avoid double-trigger feel if the event fires again very quickly
const lastUseByPlayer = new Map();
const COOLDOWN_MS = 250;

world.afterEvents.itemUse.subscribe((event) => {
  const player = event.source;
  const usedItem = event.itemStack;

  if (!player || !usedItem) return;
  if (usedItem.typeId !== TRIGGER_ITEM) return;

  const now = Date.now();
  const last = lastUseByPlayer.get(player.id) ?? 0;
  if (now - last < COOLDOWN_MS) return;
  lastUseByPlayer.set(player.id, now);

  try {
    const inventoryComp = player.getComponent("minecraft:inventory");
    const container = inventoryComp?.container;
    if (!container) {
      player.sendMessage("§cNo inventory found.");
      return;
    }

    const result = compactRedstone(container);

    if (result.blocksMade > 0) {
      player.sendMessage(
        `§aPacked ${result.redstoneUsed} redstone dust into ${result.blocksMade} redstone block(s).`
      );
    } else {
      player.sendMessage("§eNot enough redstone dust to pack.");
    }
  } catch (err) {
    player.sendMessage(`§cPacker error: ${String(err)}`);
  }
});

function compactRedstone(container) {
  let totalRedstone = 0;

  // 1) Count all redstone dust in inventory
  for (let slot = 0; slot < container.size; slot++) {
    const item = container.getItem(slot);
    if (!item) continue;

    if (item.typeId === SOURCE_ITEM) {
      totalRedstone += item.amount;
    }
  }

  const blocksToMake = Math.floor(totalRedstone / RATIO);
  if (blocksToMake <= 0) {
    return {
      redstoneUsed: 0,
      blocksMade: 0
    };
  }

  const redstoneToRemove = blocksToMake * RATIO;
  let remainingToRemove = redstoneToRemove;

  // 2) Remove the needed amount of redstone dust
  for (let slot = 0; slot < container.size; slot++) {
    if (remainingToRemove <= 0) break;

    const item = container.getItem(slot);
    if (!item) continue;
    if (item.typeId !== SOURCE_ITEM) continue;

    if (item.amount <= remainingToRemove) {
      remainingToRemove -= item.amount;
      container.setItem(slot, undefined);
    } else {
      item.amount -= remainingToRemove;
      remainingToRemove = 0;
      container.setItem(slot, item);
    }
  }

  // 3) Add redstone blocks
  //    Since blocks stack to 64, split into multiple stacks if needed.
  let blocksLeft = blocksToMake;
  while (blocksLeft > 0) {
    const stackAmount = Math.min(blocksLeft, 64);
    const stack = new ItemStack(TARGET_ITEM, stackAmount);

    const leftover = container.addItem(stack);

    // Safety rollback if somehow inventory couldn't accept the result
    if (leftover) {
      rollbackRedstone(container, redstoneToRemove - remainingToRemove);
      throw new Error("Could not add packed redstone blocks to inventory.");
    }

    blocksLeft -= stackAmount;
  }

  return {
    redstoneUsed: redstoneToRemove,
    blocksMade: blocksToMake
  };
}

function rollbackRedstone(container, amountToRestore) {
  let left = amountToRestore;

  while (left > 0) {
    const stackAmount = Math.min(left, 64);
    const stack = new ItemStack(SOURCE_ITEM, stackAmount);
    const leftover = container.addItem(stack);

    if (leftover) {
      // In a real production version we'd handle this more carefully.
      break;
    }

    left -= stackAmount;
  }
}