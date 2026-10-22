import {
  CAMPFIRE_RANGE,
  COLD_BIOMES,
  COLD_BUILD,
  COLD_DAMAGE,
  COLD_DAMAGE_AT,
  COLD_DECAY,
  COLD_MAX,
  COLD_RAIN_EXTRA,
  COLD_SLOW_AT,
  DAY_END,
  DP,
  HEAT_BUILD,
  HEAT_DECAY,
  HEAT_HUNGER_AT,
  HEAT_MAX,
  HEAT_SLOW_AT,
  HOT_BIOMES,
  HUNGER_DRAIN,
  INSOMNIA_COLD_CAP,
  INSOMNIA_COLD_PER_DAY,
  MIDDAY,
  MIDDAY_HEAT_SPIKE,
  MIDNIGHT,
  MIDNIGHT_COLD_SPIKE,
  NETHER_HEAT_BUILD,
  RESIST_CAP,
  SEASON_COLD_MULT,
  SEASON_HEAT_MULT,
} from "./config.js";

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

export function num(player, key, fallback = 0) {
  try {
    const v = player.getDynamicProperty(key);
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export function setNum(player, key, value) {
  try {
    player.setDynamicProperty(key, value);
  } catch {
    /* ignore */
  }
}

export function resistFactor(player, key) {
  const r = clamp(num(player, key, 0), 0, RESIST_CAP);
  return 1 - r;
}

export function insomniaColdFactor(player) {
  const days = Math.max(0, num(player, DP.insomniaDays, 0));
  return 1 + Math.min(INSOMNIA_COLD_CAP - 1, days * INSOMNIA_COLD_PER_DAY);
}

export function isDay(timeOfDay) {
  return timeOfDay >= 0 && timeOfDay < DAY_END;
}

function inBand(time, band) {
  return time >= band[0] && time <= band[1];
}

export function biomeIdAt(dimension, location) {
  try {
    if (typeof dimension.getBiome === "function") {
      const b = dimension.getBiome(location);
      if (b && b.id) {
        return b.id;
      }
    }
  } catch {
    /* ignore */
  }
  return "";
}

export function isHotBiome(id) {
  if (!id) {
    return false;
  }
  if (HOT_BIOMES.has(id)) {
    return true;
  }
  return id.includes("desert") || id.includes("badlands") || id.includes("mesa");
}

export function isColdBiome(id) {
  if (!id) {
    return false;
  }
  if (COLD_BIOMES.has(id)) {
    return true;
  }
  return (
    id.includes("frozen") ||
    id.includes("snowy") ||
    id.includes("ice_") ||
    id.includes("cold_") ||
    id.includes("grove") ||
    (id.includes("peaks") &&
      (id.includes("frozen") || id.includes("jagged") || id.includes("snowy")))
  );
}

export function canSeeSky(dimension, location) {
  const x = Math.floor(location.x);
  const z = Math.floor(location.z);
  let y = Math.floor(location.y) + 1;
  const maxY = 320;
  try {
    while (y < maxY) {
      const block = dimension.getBlock({ x, y, z });
      if (!block) {
        break;
      }
      if (block.isAir) {
        y += 1;
        continue;
      }
      const id = block.typeId || "";
      if (
        id.includes("leaves") ||
        id.includes("glass") ||
        id.includes("trapdoor") ||
        id.includes("slab") ||
        id.includes("fence") ||
        id.includes("sign") ||
        id.includes("torch") ||
        id.includes("button") ||
        id.includes("carpet")
      ) {
        y += 1;
        continue;
      }
      try {
        if (block.isSolid) {
          return false;
        }
      } catch {
        return false;
      }
      y += 1;
    }
  } catch {
    return true;
  }
  return true;
}

export function nearCampfire(dimension, location) {
  const cx = Math.floor(location.x);
  const cy = Math.floor(location.y);
  const cz = Math.floor(location.z);
  const r = CAMPFIRE_RANGE;
  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dz = -r; dz <= r; dz++) {
        try {
          const b = dimension.getBlock({ x: cx + dx, y: cy + dy, z: cz + dz });
          if (!b) {
            continue;
          }
          const id = b.typeId || "";
          if (id === "minecraft:campfire" || id === "minecraft:soul_campfire") {
            return true;
          }
        } catch {
          /* ignore */
        }
      }
    }
  }
  return false;
}

export function isRaining(dimension) {
  try {
    if (typeof dimension.getWeather === "function") {
      const w = dimension.getWeather();
      const name = typeof w === "string" ? w : w?.id || String(w);
      return /rain|thunder|storm/i.test(name);
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function inWater(player) {
  try {
    if (player.isInWater) {
      return true;
    }
  } catch {
    /* ignore */
  }
  try {
    const block = player.dimension.getBlock({
      x: Math.floor(player.location.x),
      y: Math.floor(player.location.y),
      z: Math.floor(player.location.z),
    });
    const id = block?.typeId || "";
    return id.includes("water") || id.includes("bubble");
  } catch {
    return false;
  }
}

function drainHunger(player, amount) {
  try {
    const hunger =
      player.getComponent("minecraft:player.hunger") ||
      player.getComponent("minecraft:hunger");
    if (!hunger) {
      return;
    }
    hunger.currentValue = Math.max(0, (hunger.currentValue ?? 20) - amount);
  } catch {
    /* ignore */
  }
}

function pulseEffect(player, effectId, seconds, amplifier) {
  try {
    player.addEffect(effectId, Math.max(1, Math.floor(seconds * 20)), {
      amplifier,
      showParticles: false,
    });
  } catch {
    /* ignore */
  }
}

function maybeNotify(player, key, message, everyMs = 12000) {
  const now = Date.now();
  const last = player.__klClimateNotify?.[key] || 0;
  if (now - last < everyMs) {
    return;
  }
  if (!player.__klClimateNotify) {
    player.__klClimateNotify = {};
  }
  player.__klClimateNotify[key] = now;
  try {
    player.sendMessage(message);
  } catch {
    /* ignore */
  }
}

function applyHeatEffects(player, heat, heatMul) {
  if (heat >= HEAT_HUNGER_AT) {
    drainHunger(player, HUNGER_DRAIN * heatMul);
    maybeNotify(
      player,
      "heat",
      "§6You're overheating. §7Find shade, water, or wait for night."
    );
  }
  if (heat >= HEAT_SLOW_AT) {
    pulseEffect(player, "slowness", 3, 0);
  }
  try {
    if (heat >= HEAT_HUNGER_AT && Math.random() < 0.35) {
      player.dimension.spawnParticle("minecraft:basic_flame_particle", {
        x: player.location.x,
        y: player.location.y + 1,
        z: player.location.z,
      });
    }
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} seasonName spring|summer|autumn|winter
 */
export function tickClimate(player, timeOfDay, seasonName = "spring") {
  const dimId = player.dimension.id;
  let heat = num(player, DP.heat, 0);
  let coldV = num(player, DP.cold, 0);
  const heatMul = resistFactor(player, DP.heatRes);
  const coldMul = resistFactor(player, DP.coldRes);
  const seasonHeat = SEASON_HEAT_MULT[seasonName] ?? 1;
  const seasonCold = SEASON_COLD_MULT[seasonName] ?? 1;
  const insomniaN = insomniaColdFactor(player);

  if (dimId === "minecraft:nether") {
    coldV = 0;
    const fire = nearCampfire(player.dimension, player.location);
    const wet = inWater(player);
    if (!fire && !wet) {
      heat = clamp(heat + NETHER_HEAT_BUILD * heatMul * seasonHeat, 0, HEAT_MAX);
    } else {
      heat = clamp(heat - HEAT_DECAY, 0, HEAT_MAX);
    }
    setNum(player, DP.heat, heat);
    setNum(player, DP.cold, 0);
    if (heat >= HEAT_HUNGER_AT) {
      drainHunger(player, HUNGER_DRAIN * 0.75 * heatMul);
      maybeNotify(
        player,
        "nether_heat",
        "§6The Nether is sweltering. §7Soul campfire or water helps a little."
      );
    }
    if (heat >= HEAT_SLOW_AT) {
      pulseEffect(player, "slowness", 2, 0);
    }
    return;
  }

  if (dimId !== "minecraft:overworld") {
    setNum(player, DP.heat, 0);
    setNum(player, DP.cold, 0);
    return;
  }

  const loc = player.location;
  const dim = player.dimension;
  const biome = biomeIdAt(dim, loc);
  const day = isDay(timeOfDay);
  const sky = canSeeSky(dim, loc);
  const wet = inWater(player) || isRaining(dim);
  const fire = nearCampfire(dim, loc);
  const hot = isHotBiome(biome);
  const cold = isColdBiome(biome);
  const temperateWinterNight =
    seasonName === "winter" && !day && sky && !hot && !fire && !inWater(player);

  let heatSpike = inBand(timeOfDay, MIDDAY) ? MIDDAY_HEAT_SPIKE : 1;
  let coldSpike = inBand(timeOfDay, MIDNIGHT) ? MIDNIGHT_COLD_SPIKE * insomniaN : 1;

  const heatZone = hot && day && sky && !wet && !fire;
  if (heatZone) {
    heat = clamp(
      heat + HEAT_BUILD * heatMul * seasonHeat * heatSpike,
      0,
      HEAT_MAX
    );
  } else if (seasonName === "summer" && day && sky && !wet && !fire && !cold) {
    // Mild summer warmth outside deserts
    heat = clamp(heat + HEAT_BUILD * 0.25 * heatMul * seasonHeat, 0, HEAT_MAX);
  } else {
    heat = clamp(heat - HEAT_DECAY, 0, HEAT_MAX);
  }

  const coldZone = (cold || temperateWinterNight) && !fire && !inWater(player);
  if (coldZone) {
    const nightBuild = COLD_BUILD * coldMul * seasonCold * coldSpike * (day ? 0 : insomniaN);
    if (!day && sky) {
      coldV = clamp(coldV + nightBuild, 0, COLD_MAX);
    } else if (isRaining(dim) && sky) {
      coldV = clamp(
        coldV + (COLD_BUILD * 0.5 + COLD_RAIN_EXTRA) * coldMul * seasonCold * insomniaN,
        0,
        COLD_MAX
      );
    } else if (!sky) {
      coldV = clamp(coldV - COLD_DECAY, 0, COLD_MAX);
    } else {
      coldV = clamp(coldV - COLD_DECAY * 0.5, 0, COLD_MAX);
    }
  } else {
    coldV = clamp(coldV - COLD_DECAY, 0, COLD_MAX);
  }

  setNum(player, DP.heat, heat);
  setNum(player, DP.cold, coldV);

  applyHeatEffects(player, heat, heatMul);

  if (coldV >= COLD_SLOW_AT) {
    pulseEffect(player, "slowness", 3, coldV >= COLD_DAMAGE_AT ? 1 : 0);
    const tip =
      num(player, DP.insomniaDays, 0) >= 3
        ? "§bExhaustion makes the cold bite harder. §7Sleep, or find shelter."
        : "§bYou're freezing. §7Get under a roof or by a campfire.";
    maybeNotify(player, "cold", tip);
  }
  if (coldV >= COLD_DAMAGE_AT) {
    try {
      player.applyDamage(Math.max(1, Math.round(COLD_DAMAGE * coldMul * Math.min(1.4, insomniaN))), {
        cause: "freezing",
      });
    } catch {
      try {
        player.applyDamage(1);
      } catch {
        /* ignore */
      }
    }
  }

  try {
    if (coldV >= COLD_SLOW_AT && Math.random() < 0.35) {
      dim.spawnParticle("minecraft:snowflake_particle", {
        x: loc.x,
        y: loc.y + 1.2,
        z: loc.z,
      });
    }
  } catch {
    /* ignore */
  }
}
