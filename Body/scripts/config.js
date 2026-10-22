/**
 * Tunable numbers for Kindling Body.
 * Bonuses (tomes / gear / food) stay at 0 until those exist; formulas still run.
 */

export const STAMINA_MAX_BASE = 100;
/** Baseline regen while acting. Idle multiplies this (see IDLE_REGEN_MULT). */
export const REGEN_PER_SEC_BASE = 1.2;
/**
 * When spending almost nothing this tick, regen is this many times faster.
 * ~1.2 * 6 = 7.2/sec → full bar from empty in ~14s while standing still.
 */
export const IDLE_REGEN_MULT = 6;
/** Vitality can push stamina max above 100 (asymptotic; soft target ~135). */
export const STAMINA_MAX_VITALITY_BONUS = 0.35;

/** Vanilla hunger bar: ignore lock until food drops to this fraction. */
export const HUNGER_LOCK_START = 0.75;
/** Never lock more than this; player always keeps 25% of max stamina. */
export const HUNGER_MAX_LOCK = 0.75;

/** Strength stays full until stamina falls below this share of the bright bar. */
export const STRENGTH_FULL_UNTIL = 0.5;
/** Strength floor while still able to act (stamina just above 0). */
export const STRENGTH_FLOOR = 0.4;

export const AGILITY_K = 25;
export const STRENGTH_K = 25;
export const REGEN_K = 20;
export const VITALITY_K = 20;
export const RESIST_CAP = 0.9;

export const INSOMNIA_FLOOR = 0.45;
export const INSOMNIA_GROWTH = 0.4;
/** Insomnia stops getting worse after this many sleepless days. */
export const INSOMNIA_MAX_DAYS = 10;
/**
 * A good night's sleep: the player must wake inside this window of the
 * day (vanilla morning after a skipped night is tick 0).
 */
export const MORNING_START = 23500;
export const MORNING_END = 1000;

export const HP_BASE = 20;
export const HP_BONUS_MAX = 10;
export const HP_REGEN_PER_SEC_AT_BASE = 0.25;
export const STARVE_DAMAGE = 1;
export const STARVE_INTERVAL_TICKS = 24000;

export const TICKS_PER_SECOND = 20;
export const DAY_TICKS = 24000;

/** Per-tick stamina costs at agility 0. Regen is REGEN_PER_SEC_BASE / 20 = 0.06. */
export const COST = {
  /** Crouch and normal walk always stay under regen (see WALK_MAX_REGEN_SHARE). */
  sneak: 0.01,
  walk: 0.025,
  sprint: 0.18,
  /** Moving up a ladder, vine, or scaffolding. */
  climb: 0.1,
  /** Holding a shield up (crouching with a shield). */
  shield: 0.07,
  /** Drawing a bow or crossbow, or charging a trident. */
  bowDraw: 0.09,
  /** Feet on the bottom in water. More than land run, less than swim. */
  wade: 0.12,
  swim: 0.16,
  swimSprint: 0.26,
  boatRow: 0.06,
  animalMove: 0.035,
  elytraGlide: 0.025,
  firework: 0.04,
  /** Held while swinging at / mining a block. Must beat regen (0.05/tick). */
  mine: 0.16,
};

export const BURST = {
  jump: 6,
  hitEntity: 4,
  hitBlock: 5,
  breakBlock: 8,
  fireworkUse: 2,
  placeBlock: 1.5,
  /** Tilling, stripping logs, making paths. */
  toolUse: 3,
};

/**
 * Crouch and walk cost at most this share of current regen, so walking
 * recovers stamina even with insomnia or no agility.
 */
export const WALK_MAX_REGEN_SHARE = 0.6;

/**
 * Climate HUD levels (heat / cold from Kindling Climate, 0-100).
 * Must match the h1-h3 / c1-c3 labels in tools/gen-hud.mjs.
 */
export const HEAT_LEVELS = [15, 35, 70];
export const COLD_LEVELS = [15, 30, 75];

export const ANALOG_IDLE = 0.05;
export const VEHICLE_MOVE_SPEED = 0.04;
export const EXHAUSTED_MOVE_SCALE = 0.25;
export const VANILLA_MOVE = 0.1;

export const BOAT_TYPES = new Set([
  "minecraft:boat",
  "minecraft:chest_boat",
]);

export const CART_TYPES = new Set([
  "minecraft:minecart",
  "minecraft:chest_minecart",
  "minecraft:hopper_minecart",
  "minecraft:tnt_minecart",
  "minecraft:command_block_minecart",
  "minecraft:furnace_minecart",
]);

export const DP = {
  stamina: "np:stamina",
  insomniaDays: "np:insomnia_days",
  lastSleepDay: "np:last_sleep_day",
  lastStarveDay: "np:last_starve_day",
  strength: "np:strength",
  agility: "np:agility",
  regenBonus: "np:regen",
  vitality: "np:vitality",
  fireRes: "np:fire_res",
  heatRes: "np:heat_res",
  coldRes: "np:cold_res",
  poisonRes: "np:poison_res",
  danger: "np:danger",
};
