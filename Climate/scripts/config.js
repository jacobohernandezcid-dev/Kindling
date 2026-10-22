/**
 * Tunables for Kindling Climate (+ seasons cycle).
 * Soft-reads Body: np:heat_res, np:cold_res, np:insomnia_days.
 */

export const TICK_INTERVAL = 40; // 2 seconds
export const DAY_TICKS = 24000;
export const DAY_END = 12000;
export const RESIST_CAP = 0.9;

/** Build / decay per climate tick (before resist / season). */
export const HEAT_BUILD = 8;
export const HEAT_DECAY = 12;
export const NETHER_HEAT_BUILD = 3.5;
export const COLD_BUILD = 7;
export const COLD_DECAY = 10;
export const COLD_RAIN_EXTRA = 4;

export const HEAT_MAX = 100;
export const COLD_MAX = 100;

export const HEAT_HUNGER_AT = 35;
export const HEAT_SLOW_AT = 70;
export const COLD_SLOW_AT = 30;
export const COLD_DAMAGE_AT = 75;

export const HUNGER_DRAIN = 0.35;
export const COLD_DAMAGE = 1;
export const CAMPFIRE_RANGE = 5;

/** Seasons */
export const DAYS_PER_SEASON = 7;
export const SEASONS = ["spring", "summer", "autumn", "winter"];

/** Per climate tick, add this many day-ticks (negative = stretch). */
export const TIME_WARP = {
  spring: { day: 0, night: 0 },
  summer: { day: -14, night: 18 },
  autumn: { day: 6, night: -6 },
  winter: { day: 22, night: -16 },
};

/** Season multipliers on heat/cold build */
export const SEASON_HEAT_MULT = {
  spring: 0.9,
  summer: 1.35,
  autumn: 0.85,
  winter: 0.55,
};
export const SEASON_COLD_MULT = {
  spring: 0.85,
  summer: 0.5,
  autumn: 1.15,
  winter: 1.45,
};

/** Midday / midnight band spikes */
export const MIDDAY = [5000, 7500];
export const MIDNIGHT = [17000, 19500];
export const MIDDAY_HEAT_SPIKE = 1.45;
export const MIDNIGHT_COLD_SPIKE = 1.5;

/** Insomnia from Body: multiplies night cold / midnight spike */
export const INSOMNIA_COLD_PER_DAY = 0.12;
export const INSOMNIA_COLD_CAP = 1.6;

/** Winter snow in temperate biomes */
export const SNOW_CHANCE = 0.22;
export const SNOW_RADIUS = 3;

/** Autumn leaf particles */
export const LEAF_CHANCE = 0.4;

export const DP = {
  heatRes: "np:heat_res",
  coldRes: "np:cold_res",
  insomniaDays: "np:insomnia_days",
  heat: "kl:heat",
  cold: "kl:cold",
  lastSeason: "kl:last_season",
};

export const HOT_BIOMES = new Set([
  "minecraft:desert",
  "minecraft:desert_hills",
  "minecraft:desert_mutated",
  "minecraft:mesa",
  "minecraft:mesa_plateau",
  "minecraft:mesa_plateau_stone",
  "minecraft:mesa_bryce",
  "minecraft:mesa_plateau_mutated",
  "minecraft:mesa_plateau_stone_mutated",
  "minecraft:badlands",
  "minecraft:eroded_badlands",
  "minecraft:wooded_badlands",
  "minecraft:badlands_plateau",
]);

export const COLD_BIOMES = new Set([
  "minecraft:frozen_river",
  "minecraft:frozen_ocean",
  "minecraft:deep_frozen_ocean",
  "minecraft:frozen_peaks",
  "minecraft:jagged_peaks",
  "minecraft:snowy_slopes",
  "minecraft:grove",
  "minecraft:ice_spikes",
  "minecraft:snowy_plains",
  "minecraft:snowy_taiga",
  "minecraft:snowy_taiga_hills",
  "minecraft:snowy_taiga_mountains",
  "minecraft:snowy_beach",
  "minecraft:snowy_tundra",
  "minecraft:ice_plains",
  "minecraft:ice_mountains",
  "minecraft:cold_beach",
  "minecraft:cold_taiga",
  "minecraft:cold_taiga_hills",
  "minecraft:cold_taiga_mutated",
]);
