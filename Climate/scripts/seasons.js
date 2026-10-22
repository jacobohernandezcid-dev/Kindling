import { world } from "@minecraft/server";
import {
  DAY_TICKS,
  DAYS_PER_SEASON,
  LEAF_CHANCE,
  MELT_TRIES,
  SEASONS,
  SNOW_CHANCE,
  SNOW_RADIUS,
} from "./config.js";
import { canSeeSky, isColdBiome, isHotBiome, biomeIdAt } from "./climate.js";

export function worldDayIndex() {
  try {
    if (typeof world.getAbsoluteTime === "function") {
      return Math.floor(world.getAbsoluteTime() / DAY_TICKS);
    }
  } catch {
    /* ignore */
  }
  try {
    return Math.floor(world.getTimeOfDay() / DAY_TICKS);
  } catch {
    return 0;
  }
}

export function seasonState(dayIndex = worldDayIndex()) {
  const idx = ((Math.floor(dayIndex / DAYS_PER_SEASON) % 4) + 4) % 4;
  const dayInSeason = ((dayIndex % DAYS_PER_SEASON) + DAYS_PER_SEASON) % DAYS_PER_SEASON;
  return {
    name: SEASONS[idx],
    index: idx,
    dayInSeason: dayInSeason + 1,
    daysPerSeason: DAYS_PER_SEASON,
    worldDay: dayIndex,
  };
}

function isTemperateBiome(id) {
  if (!id) {
    return true;
  }
  if (isHotBiome(id) || isColdBiome(id)) {
    return false;
  }
  if (id.includes("ocean") || id.includes("river") || id.includes("beach")) {
    return false;
  }
  if (id.includes("nether") || id.includes("end") || id.includes("mushroom")) {
    return false;
  }
  return true;
}

function topSolidY(dimension, x, z, fromY) {
  for (let y = Math.min(319, Math.floor(fromY) + 8); y >= -64; y--) {
    try {
      const b = dimension.getBlock({ x, y, z });
      if (!b || b.isAir) {
        continue;
      }
      const id = b.typeId || "";
      if (id.includes("snow_layer") || id.includes("powder_snow")) {
        continue;
      }
      if (id.includes("leaves") || id.includes("log") || id.includes("vine")) {
        continue;
      }
      try {
        if (b.isSolid) {
          return y;
        }
      } catch {
        return y;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Place a few snow layers near the player in winter (temperate or cold). */
export function tryWinterSnow(player, seasonName) {
  if (seasonName !== "winter") {
    return;
  }
  if (Math.random() > SNOW_CHANCE) {
    return;
  }
  const dim = player.dimension;
  if (dim.id !== "minecraft:overworld") {
    return;
  }
  const loc = player.location;
  const biome = biomeIdAt(dim, loc);
  if (isHotBiome(biome)) {
    return;
  }
  if (!isColdBiome(biome) && !isTemperateBiome(biome)) {
    return;
  }
  const ox = Math.floor(loc.x) + Math.floor(Math.random() * (SNOW_RADIUS * 2 + 1)) - SNOW_RADIUS;
  const oz = Math.floor(loc.z) + Math.floor(Math.random() * (SNOW_RADIUS * 2 + 1)) - SNOW_RADIUS;
  const ground = topSolidY(dim, ox, oz, loc.y);
  if (ground == null) {
    return;
  }
  const above = { x: ox, y: ground + 1, z: oz };
  try {
    if (!canSeeSky(dim, { x: ox + 0.5, y: ground + 1, z: oz + 0.5 })) {
      return;
    }
    const b = dim.getBlock(above);
    if (!b || !b.isAir) {
      return;
    }
    b.setType("minecraft:snow_layer");
  } catch {
    try {
      dim.runCommand(
        `setblock ${ox} ${ground + 1} ${oz} snow_layer keep`
      );
    } catch {
      /* ignore */
    }
  }
}

/** In spring, melt winter's snow layers in temperate biomes near the player. */
export function trySpringMelt(player, seasonName) {
  if (seasonName !== "spring") {
    return;
  }
  const dim = player.dimension;
  if (dim.id !== "minecraft:overworld") {
    return;
  }
  const loc = player.location;
  const r = SNOW_RADIUS * 3;
  for (let i = 0; i < MELT_TRIES; i++) {
    const x = Math.floor(loc.x) + Math.floor(Math.random() * (r * 2 + 1)) - r;
    const z = Math.floor(loc.z) + Math.floor(Math.random() * (r * 2 + 1)) - r;
    try {
      if (!isTemperateBiome(biomeIdAt(dim, { x, y: loc.y, z }))) {
        continue;
      }
      const ground = topSolidY(dim, x, z, loc.y);
      if (ground == null) {
        continue;
      }
      const b = dim.getBlock({ x, y: ground + 1, z });
      if (b?.typeId === "minecraft:snow_layer") {
        b.setType("minecraft:air");
      }
    } catch {
      /* unloaded */
    }
  }
}

/** Autumn leaf-fall particles near the player. */
export function tryAutumnLeaves(player, seasonName) {
  if (seasonName !== "autumn") {
    return;
  }
  if (Math.random() > LEAF_CHANCE) {
    return;
  }
  const dim = player.dimension;
  if (dim.id !== "minecraft:overworld") {
    return;
  }
  const loc = player.location;
  const x = loc.x + (Math.random() * 6 - 3);
  const y = loc.y + 2 + Math.random() * 4;
  const z = loc.z + (Math.random() * 6 - 3);
  try {
    dim.spawnParticle("minecraft:falling_dust_red_sand_particle", { x, y, z });
  } catch {
    /* ignore */
  }
}

export const SEASON_LABEL = {
  spring: "§aSpring",
  summer: "§eSummer",
  autumn: "§6Autumn",
  winter: "§bWinter",
};
