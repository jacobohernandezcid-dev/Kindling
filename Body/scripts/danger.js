/**
 * Danger: how much of a killer the player looks like.
 * 0 = vanilla. Rises on kills. Nearby villagers, traders, illagers, and
 * passive mobs keep away. Holding a mob's food still lures it.
 * Wolves go on alert above WOLF_ALERT.
 */

export const DANGER_MAX = 100;
export const DANGER_DECAY_PER_SEC = 0.02;
export const DANGER_SLEEP_CUT = 8;
export const WOLF_ALERT = 35;
/** Passive mobs keep a gap below this; at/above it they run. */
export const PASSIVE_FLEE_START = 75;
export const DANGER_TICK_EVERY = 8;
export const DANGER_QUERY_RANGE = 40;

export const DANGER_KILL = {
  villager: 12,
  illager: 6,
  player: 15,
  wolf: 8,
  passive: 4,
  hostile: 2,
};

export const HUMAN_VILLAGER = new Set([
  "minecraft:villager",
  "minecraft:villager_v2",
  "minecraft:wandering_trader",
  "minecraft:npc",
]);

export const HUMAN_ILLAGER = new Set([
  "minecraft:pillager",
  "minecraft:vindicator",
  "minecraft:evoker",
  "minecraft:illusioner",
  "minecraft:witch",
]);

export const WOLF_TYPES = new Set(["minecraft:wolf"]);

export const PASSIVE_TYPES = new Set([
  "minecraft:cow",
  "minecraft:mooshroom",
  "minecraft:sheep",
  "minecraft:pig",
  "minecraft:chicken",
  "minecraft:rabbit",
  "minecraft:horse",
  "minecraft:donkey",
  "minecraft:mule",
  "minecraft:llama",
  "minecraft:trader_llama",
  "minecraft:camel",
  "minecraft:fox",
  "minecraft:panda",
  "minecraft:ocelot",
  "minecraft:cat",
  "minecraft:parrot",
  "minecraft:axolotl",
  "minecraft:frog",
  "minecraft:tadpole",
  "minecraft:turtle",
  "minecraft:goat",
  "minecraft:sniffer",
  "minecraft:armadillo",
  "minecraft:bee",
  "minecraft:allay",
  "minecraft:strider",
  "minecraft:squid",
  "minecraft:glow_squid",
  "minecraft:dolphin",
  "minecraft:bat",
  "minecraft:snow_golem",
]);

export const TEMPT_FOOD = {
  "minecraft:cow": ["minecraft:wheat"],
  "minecraft:mooshroom": ["minecraft:wheat"],
  "minecraft:sheep": ["minecraft:wheat"],
  "minecraft:goat": ["minecraft:wheat"],
  "minecraft:pig": ["minecraft:carrot", "minecraft:potato", "minecraft:beetroot"],
  "minecraft:chicken": [
    "minecraft:wheat_seeds",
    "minecraft:beetroot_seeds",
    "minecraft:melon_seeds",
    "minecraft:pumpkin_seeds",
    "minecraft:torchflower_seeds",
  ],
  "minecraft:rabbit": ["minecraft:carrot", "minecraft:golden_carrot", "minecraft:yellow_flower"],
  "minecraft:horse": [
    "minecraft:golden_apple",
    "minecraft:enchanted_golden_apple",
    "minecraft:golden_carrot",
    "minecraft:apple",
    "minecraft:wheat",
    "minecraft:sugar",
  ],
  "minecraft:donkey": [
    "minecraft:golden_apple",
    "minecraft:golden_carrot",
    "minecraft:apple",
    "minecraft:wheat",
    "minecraft:sugar",
  ],
  "minecraft:mule": [
    "minecraft:golden_apple",
    "minecraft:golden_carrot",
    "minecraft:apple",
    "minecraft:wheat",
    "minecraft:sugar",
  ],
  "minecraft:llama": ["minecraft:hay_block", "minecraft:wheat"],
  "minecraft:trader_llama": ["minecraft:hay_block", "minecraft:wheat"],
  "minecraft:camel": ["minecraft:cactus"],
  "minecraft:fox": ["minecraft:sweet_berries", "minecraft:glow_berries"],
  "minecraft:panda": ["minecraft:bamboo"],
  "minecraft:ocelot": ["minecraft:cod", "minecraft:salmon"],
  "minecraft:cat": ["minecraft:cod", "minecraft:salmon"],
  "minecraft:parrot": [
    "minecraft:wheat_seeds",
    "minecraft:beetroot_seeds",
    "minecraft:melon_seeds",
    "minecraft:pumpkin_seeds",
  ],
  "minecraft:axolotl": ["minecraft:tropical_fish", "minecraft:tropical_fish_bucket"],
  "minecraft:turtle": ["minecraft:seagrass"],
  "minecraft:strider": ["minecraft:warped_fungus"],
  "minecraft:bee": [
    "minecraft:yellow_flower",
    "minecraft:red_flower",
    "minecraft:wither_rose",
    "minecraft:torchflower",
  ],
  "minecraft:sniffer": ["minecraft:torchflower_seeds", "minecraft:pitcher_pod"],
  "minecraft:armadillo": ["minecraft:spider_eye"],
};

export function dangerKillAmount(typeId) {
  if (!typeId || typeId.includes("item") || typeId.includes("orb")) {
    return 0;
  }
  if (typeId === "minecraft:player") {
    return DANGER_KILL.player;
  }
  if (HUMAN_VILLAGER.has(typeId)) {
    return DANGER_KILL.villager;
  }
  if (HUMAN_ILLAGER.has(typeId)) {
    return DANGER_KILL.illager;
  }
  if (WOLF_TYPES.has(typeId)) {
    return DANGER_KILL.wolf;
  }
  if (PASSIVE_TYPES.has(typeId)) {
    return DANGER_KILL.passive;
  }
  if (typeId.startsWith("minecraft:")) {
    return DANGER_KILL.hostile;
  }
  return 0;
}

export function keepAwayRadius(danger, kind) {
  const t = Math.max(0, Math.min(1, danger / DANGER_MAX));
  if (kind === "villager") {
    return 4 + t * 20;
  }
  if (kind === "illager") {
    return 3 + t * 8;
  }
  if (kind === "passive") {
    return 4 + t * 12;
  }
  return 0;
}

export function fleeRadius(danger, kind) {
  if (kind !== "passive" || danger < PASSIVE_FLEE_START) {
    return 0;
  }
  const t = (danger - PASSIVE_FLEE_START) / (DANGER_MAX - PASSIVE_FLEE_START);
  return 18 + Math.max(0, Math.min(1, t)) * 14;
}

export function entityKind(typeId) {
  if (HUMAN_VILLAGER.has(typeId)) {
    return "villager";
  }
  if (HUMAN_ILLAGER.has(typeId)) {
    return "illager";
  }
  if (WOLF_TYPES.has(typeId)) {
    return "wolf";
  }
  if (PASSIVE_TYPES.has(typeId)) {
    return "passive";
  }
  return "";
}

function heldIds(player) {
  const ids = [];
  try {
    const eq = player.getComponent("minecraft:equippable");
    if (!eq) {
      return ids;
    }
    for (const slot of ["Mainhand", "Offhand"]) {
      try {
        const item = eq.getEquipment(slot);
        if (item?.typeId) {
          ids.push(item.typeId);
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return ids;
}

function isTempted(typeId, held) {
  const foods = TEMPT_FOOD[typeId];
  if (!foods || !held.length) {
    return false;
  }
  return foods.some((f) => held.includes(f));
}

function isHostileMob(entity, typeId) {
  if (typeId === "minecraft:drowned" || typeId.includes("drowned")) {
    return true;
  }
  try {
    if (entity.matches({ families: ["monster"] }) || entity.matches({ families: ["undead"] })) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function isTamed(entity) {
  try {
    const tame = entity.getComponent("minecraft:tameable");
    if (tame && (tame.isTamed || tame.tamed)) {
      return true;
    }
  } catch {
    /* ignore */
  }
  try {
    const mount = entity.getComponent("minecraft:tamemount");
    if (mount && (mount.isTamed || mount.isTamedToPlayer)) {
      return true;
    }
  } catch {
    /* ignore */
  }
  try {
    if (entity.hasComponent("minecraft:is_tamed") || entity.hasComponent("minecraft:is_saddled")) {
      return true;
    }
  } catch {
    /* ignore */
  }
  try {
    if (entity.matches({ families: ["tamed"] })) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function pushAway(entity, player, strength) {
  const dx = entity.location.x - player.location.x;
  const dz = entity.location.z - player.location.z;
  const len = Math.hypot(dx, dz) || 0.001;
  const x = dx / len;
  const z = dz / len;
  try {
    entity.applyKnockback({ x: x * strength, z: z * strength }, 0.04);
    return;
  } catch {
    /* try impulse */
  }
  try {
    entity.applyImpulse({ x: x * strength * 0.35, y: 0.02, z: z * strength * 0.35 });
  } catch {
    /* ignore */
  }
}

function alertWolf(wolf, player) {
  try {
    wolf.lookAt(player.getHeadLocation());
  } catch {
    try {
      wolf.lookAt(player.location);
    } catch {
      /* ignore */
    }
  }
  try {
    wolf.triggerEvent("minecraft:become_angry");
  } catch {
    try {
      wolf.applyDamage(0, { damagingEntity: player, cause: "entityAttack" });
    } catch {
      /* ignore */
    }
  }
}

/**
 * Keep scared mobs out of the player's space. Passives keep a gap
 * around danger 50. At 75+ they flee. Food in hand skips passive flee.
 * Hostiles (drowned, zombies, etc.) are never pushed.
 */
export function tickDanger(player, danger, mountedId, tickClock) {
  if (!(danger >= 1) || tickClock % DANGER_TICK_EVERY !== 0) {
    return;
  }
  let nearby;
  try {
    nearby = player.dimension.getEntities({
      location: player.location,
      maxDistance: DANGER_QUERY_RANGE,
      excludeTypes: ["minecraft:player", "minecraft:item", "minecraft:xp_orb", "minecraft:drowned"],
    });
  } catch {
    return;
  }
  const held = heldIds(player);
  for (const entity of nearby) {
    try {
      if (mountedId && entity.id === mountedId) {
        continue;
      }
      const typeId = entity.typeId;
      if (isHostileMob(entity, typeId)) {
        continue;
      }
      const kind = entityKind(typeId);
      if (!kind) {
        continue;
      }
      if (kind === "wolf") {
        if (danger >= WOLF_ALERT && !isTamed(entity)) {
          alertWolf(entity, player);
        }
        continue;
      }
      if (kind === "passive" && (isTamed(entity) || isTempted(typeId, held))) {
        continue;
      }
      const dx = entity.location.x - player.location.x;
      const dz = entity.location.z - player.location.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.05) {
        continue;
      }
      const runRadius = fleeRadius(danger, kind);
      if (runRadius > 0 && dist < runRadius) {
        const t = (danger - PASSIVE_FLEE_START) / (DANGER_MAX - PASSIVE_FLEE_START);
        const flee = 0.85 + Math.max(0, Math.min(1, t)) * 1.15;
        pushAway(entity, player, flee);
        continue;
      }
      const radius = keepAwayRadius(danger, kind);
      if (radius <= 0 || dist >= radius) {
        continue;
      }
      const closeness = 1 - dist / radius;
      const strength = kind === "illager" ? 0.25 + closeness * 0.45 : 0.35 + closeness * 0.9;
      pushAway(entity, player, strength);
    } catch {
      /* ignore one entity */
    }
  }
}

export function clampDanger(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  if (value < 0.05) {
    return 0;
  }
  return Math.max(0, Math.min(DANGER_MAX, value));
}
