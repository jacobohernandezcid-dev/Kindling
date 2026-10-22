/**
 * Kindling Ores — unfinished mining drops.
 * Replaces finished vanilla drops with rough/raw Kindling items when loot
 * overrides do not stick.
 */
import { ItemStack, system, world } from "@minecraft/server";

/** blockId -> { vanillaDropId: kindlingItemId } */
const REPLACE_BY_BLOCK = {
  "minecraft:stone": { "minecraft:cobblestone": "kindling:rocks" },
  "minecraft:granite": { "minecraft:granite": "kindling:rocks" },
  "minecraft:diorite": { "minecraft:diorite": "kindling:rocks" },
  "minecraft:andesite": { "minecraft:andesite": "kindling:rocks" },
  "minecraft:deepslate": {
    "minecraft:cobbled_deepslate": "kindling:deepslate_rubble",
    "minecraft:deepslate": "kindling:deepslate_rubble",
  },
  "minecraft:blackstone": { "minecraft:blackstone": "kindling:blackstone_chips" },
  "minecraft:end_stone": { "minecraft:end_stone": "kindling:end_grit" },
  "minecraft:coal_ore": { "minecraft:coal": "kindling:raw_coal" },
  "minecraft:deepslate_coal_ore": { "minecraft:coal": "kindling:raw_coal" },
  "minecraft:quartz_ore": { "minecraft:quartz": "kindling:rough_quartz" },
  "minecraft:nether_quartz_ore": { "minecraft:quartz": "kindling:rough_quartz" },
  "minecraft:glowstone": { "minecraft:glowstone_dust": "kindling:glowstone_shard" },
  "minecraft:amethyst_cluster": { "minecraft:amethyst_shard": "kindling:rough_amethyst" },
  "minecraft:ancient_debris": {
    "minecraft:ancient_debris": "kindling:debris_chunk",
    "minecraft:netherite_scrap": "kindling:debris_chunk",
  },
  "minecraft:diamond_ore": { "minecraft:diamond": "kindling:rough_diamond" },
  "minecraft:deepslate_diamond_ore": { "minecraft:diamond": "kindling:rough_diamond" },
  "minecraft:emerald_ore": { "minecraft:emerald": "kindling:rough_emerald" },
  "minecraft:deepslate_emerald_ore": { "minecraft:emerald": "kindling:rough_emerald" },
  "minecraft:lapis_ore": { "minecraft:lapis_lazuli": "kindling:rough_lapis" },
  "minecraft:deepslate_lapis_ore": { "minecraft:lapis_lazuli": "kindling:rough_lapis" },
  "minecraft:redstone_ore": { "minecraft:redstone": "kindling:rough_redstone" },
  "minecraft:deepslate_redstone_ore": { "minecraft:redstone": "kindling:rough_redstone" },
  "minecraft:lit_redstone_ore": { "minecraft:redstone": "kindling:rough_redstone" },
  "minecraft:lit_deepslate_redstone_ore": { "minecraft:redstone": "kindling:rough_redstone" },
};

const TIN_ORES = {
  "kindling:tin_ore": "kindling:raw_tin",
  "kindling:deepslate_tin_ore": "kindling:raw_tin",
  "kindling:tin_ore_slab": "kindling:raw_tin",
};

const ENSURE_IF_EMPTY = {
  "minecraft:stone": "kindling:rocks",
  "minecraft:granite": "kindling:rocks",
  "minecraft:diorite": "kindling:rocks",
  "minecraft:andesite": "kindling:rocks",
  "minecraft:deepslate": "kindling:deepslate_rubble",
  "minecraft:blackstone": "kindling:blackstone_chips",
  "minecraft:end_stone": "kindling:end_grit",
  "minecraft:coal_ore": "kindling:raw_coal",
  "minecraft:deepslate_coal_ore": "kindling:raw_coal",
  "minecraft:quartz_ore": "kindling:rough_quartz",
  "minecraft:nether_quartz_ore": "kindling:rough_quartz",
  "minecraft:glowstone": "kindling:glowstone_shard",
  "minecraft:amethyst_cluster": "kindling:rough_amethyst",
  "minecraft:ancient_debris": "kindling:debris_chunk",
};

function hasSilkTouch(item) {
  if (!item) {
    return false;
  }
  try {
    const ench = item.getComponent("minecraft:enchantable");
    return Boolean(ench && ench.getEnchantment("silk_touch"));
  } catch {
    return false;
  }
}

function replaceDrops(dimension, location, map) {
  const items = dimension.getEntities({
    type: "minecraft:item",
    location,
    maxDistance: 2.5,
  });
  let sawKindling = false;
  for (const ent of items) {
    try {
      const stack = ent.getComponent("minecraft:item")?.itemStack;
      if (!stack) {
        continue;
      }
      if (stack.typeId.startsWith("kindling:")) {
        sawKindling = true;
        continue;
      }
      const rough = map[stack.typeId];
      if (!rough) {
        continue;
      }
      const amount = Math.max(1, stack.amount);
      ent.remove();
      dimension.spawnItem(new ItemStack(rough, amount), location);
      sawKindling = true;
    } catch {
      /* ignore */
    }
  }
  return sawKindling;
}

function ensureDrop(dimension, location, itemId) {
  const items = dimension.getEntities({
    type: "minecraft:item",
    location,
    maxDistance: 2.5,
  });
  for (const ent of items) {
    try {
      const stack = ent.getComponent("minecraft:item")?.itemStack;
      if (stack && (stack.typeId === itemId || stack.typeId.startsWith("kindling:"))) {
        return;
      }
    } catch {
      /* ignore */
    }
  }
  try {
    dimension.spawnItem(new ItemStack(itemId, 1), location);
  } catch {
    /* ignore */
  }
}

world.afterEvents.playerBreakBlock.subscribe((event) => {
  const blockId = event.brokenBlockPermutation.type.id;
  const { dimension, block } = event;
  const location = {
    x: block.location.x + 0.5,
    y: block.location.y + 0.5,
    z: block.location.z + 0.5,
  };

  if (hasSilkTouch(event.itemStackBeforeBreak)) {
    return;
  }

  const tin = TIN_ORES[blockId];
  if (tin) {
    system.run(() => {
      ensureDrop(dimension, location, tin);
      system.runTimeout(() => ensureDrop(dimension, location, tin), 1);
    });
    return;
  }

  const map = REPLACE_BY_BLOCK[blockId];
  if (!map) {
    return;
  }
  const fallback = ENSURE_IF_EMPTY[blockId];
  system.run(() => {
    const ok = replaceDrops(dimension, location, map);
    if (!ok && fallback) {
      ensureDrop(dimension, location, fallback);
    }
    system.runTimeout(() => {
      const ok2 = replaceDrops(dimension, location, map);
      if (!ok2 && fallback) {
        ensureDrop(dimension, location, fallback);
      }
    }, 1);
  });
});

world.afterEvents.worldLoad.subscribe(() => {
  console.warn("[Kindling Ores] unfinished-drop script loaded");
});
