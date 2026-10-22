#!/usr/bin/env node
/**
 * Kindling Ores — deposit generator.
 *
 * Writes the multi-ore deposit worldgen into Ores/features and
 * Ores/feature_rules (every file it owns starts with "deposit_" or
 * "pocket_"), then validates every feature reference in the pack.
 *
 *   node tools/gen-veins.mjs                  regenerate + validate
 *   node tools/gen-veins.mjs --check          validate only
 *   node tools/gen-veins.mjs --prune          also delete unreachable kindling features
 *
 * Shape: a deposit is a chain of overlapping ore pods along one heading.
 * Each segment scatters several pods with jitter, so the vein is thick and
 * wobbles, but stays long rather than round. Huge deposits repeat the big
 * chain twice, shifted along the same heading.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CONFIG = {
  /** One deposit (of any type) per this many chunks on average. */
  chunksPerDeposit: 4,
  /** Blocks between segment centers along the heading. Pods overlap below ~6. */
  segmentStep: 5,
  /** Segments in a big vein. Length ≈ segmentsPerVein * segmentStep. */
  segmentsPerVein: 8,
  /** Pods scattered per segment; drives thickness. */
  podsPerSegment: 5,
  /** Pod scatter around the vein center line. */
  jitter: { xz: 2, y: 1 },
  /** Huge = big chain placed at ±hugeShift along the heading. */
  hugeShift: 20,
  sizeWeights: { big: 7, huge: 3 },
  /** Vertical blocks per horizontal block on dipping headings (~19°). */
  dip: 0.35,
  hostPods: [
    { name: "s", count: 24, weight: 3 },
    { name: "m", count: 36, weight: 4 },
    { name: "l", count: 48, weight: 3 },
  ],
  types: {
    iron_coal: {
      weight: 22,
      y: [-24, 80],
      host: "iron",
      accessories: [{ ore: "coal", chance: 0.5, count: 12 }],
    },
    coal_seam: {
      weight: 22,
      y: [0, 128],
      host: "coal",
      flatOnly: true,
      accessories: [{ ore: "iron", chance: 0.25, count: 6 }],
    },
    copper_tin_gold: {
      weight: 22,
      y: [-16, 96],
      host: "copper",
      accessories: [
        { ore: "tin", chance: 0.7, count: 24 },
        { ore: "gold", chance: 0.2, count: 6 },
      ],
    },
    gold_redstone: {
      weight: 16,
      y: [-64, 32],
      host: "gold",
      accessories: [{ ore: "redstone", chance: 0.8, count: 28 }],
    },
    lapis_diamond: {
      weight: 10,
      y: [-64, 16],
      host: "lapis",
      hostScale: 0.75,
      accessories: [{ ore: "diamond", chance: 0.15, count: 4 }],
    },
    diamond_lapis: {
      weight: 8,
      y: [-64, -16],
      host: "diamond",
      hostScale: 0.6,
      accessories: [{ ore: "lapis", chance: 0.5, count: 10 }],
    },
  },
  /** Rare single blocks and small pockets between deposits. */
  pockets: {
    attemptsPerChunk: 2,
    chance: { numerator: 1, denominator: 3 },
    y: [-56, 96],
    single: { count: 1, weight: 3 },
    small: { count: 5, weight: 1 },
    ores: { coal: 8, iron: 8, copper: 7, tin: 5, gold: 4, redstone: 4, lapis: 2, diamond: 1 },
  },
};

const ORES = {
  coal: ["minecraft:coal_ore", "minecraft:deepslate_coal_ore"],
  iron: ["minecraft:iron_ore", "minecraft:deepslate_iron_ore"],
  copper: ["minecraft:copper_ore", "minecraft:deepslate_copper_ore"],
  gold: ["minecraft:gold_ore", "minecraft:deepslate_gold_ore"],
  redstone: ["minecraft:redstone_ore", "minecraft:deepslate_redstone_ore"],
  lapis: ["minecraft:lapis_ore", "minecraft:deepslate_lapis_ore"],
  diamond: ["minecraft:diamond_ore", "minecraft:deepslate_diamond_ore"],
  tin: ["kindling:tin_ore", "kindling:deepslate_tin_ore"],
};

const STONE = [
  "minecraft:stone",
  "minecraft:granite",
  "minecraft:diorite",
  "minecraft:andesite",
  "minecraft:tuff",
  "minecraft:calcite",
  "minecraft:dripstone_block",
  "minecraft:smooth_basalt",
];
const DEEPSLATE = ["minecraft:deepslate", "minecraft:tuff"];

const OVERWORLD_FILTER = [
  {
    any_of: [
      { test: "has_biome_tag", operator: "==", value: "overworld" },
      { test: "has_biome_tag", operator: "==", value: "overworld_generation" },
    ],
  },
];

const SQ = Math.SQRT1_2;
const AXES = [
  ["e", 1, 0],
  ["s", 0, 1],
  ["se", SQ, SQ],
  ["ne", SQ, -SQ],
];

const ORES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "Ores");
const FEATURES_DIR = path.join(ORES_DIR, "features");
const RULES_DIR = path.join(ORES_DIR, "feature_rules");
const OWNED_PREFIXES = ["deposit_", "pocket_"];

const out = new Map();

function id(name) {
  return `kindling:${name}`;
}

function emitFeature(name, body) {
  out.set(path.join(FEATURES_DIR, `${name}.json`), { format_version: "1.13.0", ...body });
  return id(name);
}

function oreFeature(name, ore, count) {
  const [stoneBlock, deepBlock] = ORES[ore];
  return emitFeature(name, {
    "minecraft:ore_feature": {
      description: { identifier: id(name) },
      count: Math.max(1, Math.round(count)),
      discard_chance_on_air_exposure: 0.02,
      replace_rules: [
        { places_block: stoneBlock, may_replace: STONE },
        { places_block: deepBlock, may_replace: DEEPSLATE },
      ],
    },
  });
}

function weighted(name, pairs) {
  const features = pairs.filter(([, w]) => w > 0).map(([f, w]) => [f, Math.round(w)]);
  return emitFeature(name, {
    "minecraft:weighted_random_feature": { description: { identifier: id(name) }, features },
  });
}

function aggregate(name, features) {
  return emitFeature(name, {
    "minecraft:aggregate_feature": { description: { identifier: id(name) }, features },
  });
}

function axis(lo, hi) {
  return { distribution: "uniform", extent: [lo, hi] };
}

function scatter(name, places, iterations, x, y, z) {
  return emitFeature(name, {
    "minecraft:scatter_feature": {
      description: { identifier: id(name) },
      places_feature: places,
      distribution: {
        iterations,
        coordinate_eval_order: "xzy",
        x: axis(...x),
        y: axis(...y),
        z: axis(...z),
      },
    },
  });
}

function rule(name, places, { iterations, chance, y, yDistribution = "uniform" }) {
  const distribution = {
    iterations,
    coordinate_eval_order: "zyx",
    x: axis(0, 16),
    y: { distribution: yDistribution, extent: y },
    z: axis(0, 16),
  };
  if (chance) {
    distribution.scatter_chance = chance;
  }
  out.set(path.join(RULES_DIR, `${name}.json`), {
    format_version: "1.13.0",
    "minecraft:feature_rules": {
      description: { identifier: id(name), places_feature: places },
      conditions: { placement_pass: "underground_pass", "minecraft:biome_filter": OVERWORLD_FILTER },
      distribution,
    },
  });
}

function headingsFor(type) {
  const dips = type.flatOnly
    ? [["flat", 0]]
    : [
        ["flat", 0],
        ["down", -CONFIG.dip],
        ["up", CONFIG.dip],
      ];
  const list = [];
  for (const [axisName, ux, uz] of AXES) {
    for (const [dipName, dy] of dips) {
      list.push({ name: `${axisName}_${dipName}`, ux, uz, dy });
    }
  }
  return list;
}

/** Pod variants: every host size × every subset of accessories. */
function buildPods(typeName, type) {
  const scale = type.hostScale ?? 1;
  const acc = type.accessories.map((a) => ({
    ...a,
    id: oreFeature(`deposit_${typeName}_acc_${a.ore}`, a.ore, a.count),
  }));
  const variants = [];
  for (const pod of CONFIG.hostPods) {
    const host = oreFeature(`deposit_${typeName}_host_${pod.name}`, type.host, pod.count * scale);
    for (let mask = 0; mask < 1 << acc.length; mask++) {
      let p = pod.weight;
      const parts = [];
      acc.forEach((a, i) => {
        const on = (mask >> i) & 1;
        p *= on ? a.chance : 1 - a.chance;
        if (on) {
          parts.push(a.id);
        }
      });
      // Accessories first so the host blob fills the stone around them.
      const feature =
        parts.length === 0
          ? host
          : aggregate(`deposit_${typeName}_pod_${pod.name}_${mask}`, [...parts, host]);
      variants.push([feature, p * 100]);
    }
  }
  return weighted(`deposit_${typeName}_pod`, variants);
}

function buildType(typeName, type) {
  const pod = buildPods(typeName, type);
  const { segmentsPerVein: n, segmentStep: step, podsPerSegment, jitter, hugeShift } = CONFIG;
  const big = [];
  const huge = [];
  for (const h of headingsFor(type)) {
    const segs = [];
    for (let k = 0; k < n; k++) {
      const t = (k - (n - 1) / 2) * step;
      const cx = Math.round(t * h.ux);
      const cz = Math.round(t * h.uz);
      const cy = Math.round(t * h.dy);
      segs.push(
        scatter(
          `deposit_${typeName}_${h.name}_seg${k}`,
          pod,
          podsPerSegment,
          [cx - jitter.xz, cx + jitter.xz],
          [cy - jitter.y, cy + jitter.y],
          [cz - jitter.xz, cz + jitter.xz]
        )
      );
    }
    const chain = aggregate(`deposit_${typeName}_${h.name}_big`, segs);
    const shifts = [-1, 1].map((sign, i) => {
      const sx = Math.round(sign * hugeShift * h.ux);
      const sz = Math.round(sign * hugeShift * h.uz);
      const sy = Math.round(sign * hugeShift * h.dy);
      return scatter(
        `deposit_${typeName}_${h.name}_shift${i}`,
        chain,
        1,
        [sx, sx],
        [sy, sy],
        [sz, sz]
      );
    });
    big.push([chain, 1]);
    huge.push([aggregate(`deposit_${typeName}_${h.name}_huge`, shifts), 1]);
  }
  const root = weighted(`deposit_${typeName}`, [
    [weighted(`deposit_${typeName}_big`, big), CONFIG.sizeWeights.big],
    [weighted(`deposit_${typeName}_huge`, huge), CONFIG.sizeWeights.huge],
  ]);

  const totalWeight = Object.values(CONFIG.types).reduce((s, t) => s + t.weight, 0);
  rule(`deposit_${typeName}`, root, {
    iterations: 1,
    chance: { numerator: type.weight, denominator: totalWeight * CONFIG.chunksPerDeposit },
    y: type.y,
    yDistribution: "triangle",
  });
}

function buildPockets() {
  const p = CONFIG.pockets;
  const picks = [];
  for (const [ore, w] of Object.entries(p.ores)) {
    picks.push([oreFeature(`pocket_${ore}_single`, ore, p.single.count), w * p.single.weight]);
    picks.push([oreFeature(`pocket_${ore}_small`, ore, p.small.count), w * p.small.weight]);
  }
  rule("pocket_sparse", weighted("pocket_pick", picks), {
    iterations: p.attemptsPerChunk,
    chance: p.chance,
    y: p.y,
  });
}

/** Rough ore blocks per chunk, ignoring overlap and air discard. */
function estimate() {
  const totalWeight = Object.values(CONFIG.types).reduce((s, t) => s + t.weight, 0);
  const podTotal = CONFIG.hostPods.reduce((s, p) => s + p.weight, 0);
  const avgHost = CONFIG.hostPods.reduce((s, p) => s + p.count * p.weight, 0) / podTotal;
  const sizeTotal = CONFIG.sizeWeights.big + CONFIG.sizeWeights.huge;
  const sizeMult = (CONFIG.sizeWeights.big + 2 * CONFIG.sizeWeights.huge) / sizeTotal;
  const pods = CONFIG.segmentsPerVein * CONFIG.podsPerSegment * sizeMult;
  const perOre = {};
  let perDeposit = 0;
  for (const type of Object.values(CONFIG.types)) {
    const rate = type.weight / totalWeight / CONFIG.chunksPerDeposit;
    const host = avgHost * (type.hostScale ?? 1) * pods;
    perOre[type.host] = (perOre[type.host] ?? 0) + rate * host;
    let blocks = host;
    for (const a of type.accessories) {
      const acc = a.count * a.chance * pods;
      perOre[a.ore] = (perOre[a.ore] ?? 0) + rate * acc;
      blocks += acc;
    }
    perDeposit += (type.weight / totalWeight) * blocks;
  }
  console.log(`avg deposit ≈ ${Math.round(perDeposit)} ore blocks (before overlap)`);
  console.log(
    "ore blocks / chunk ≈ " +
      Object.entries(perOre)
        .map(([o, v]) => `${o} ${v.toFixed(0)}`)
        .join(", ")
  );
}

function clean() {
  let removed = 0;
  for (const dir of [FEATURES_DIR, RULES_DIR]) {
    for (const f of fs.readdirSync(dir)) {
      if (OWNED_PREFIXES.some((p) => f.startsWith(p))) {
        fs.unlinkSync(path.join(dir, f));
        removed++;
      }
    }
  }
  return removed;
}

function generate() {
  for (const [name, type] of Object.entries(CONFIG.types)) {
    buildType(name, type);
  }
  buildPockets();
  const removed = clean();
  for (const [file, json] of out) {
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
  }
  console.log(`removed ${removed} old generated files, wrote ${out.size}`);
  estimate();
}

/** Every string a feature or rule points at. */
function refsOf(body) {
  const refs = [];
  const visit = (node, key) => {
    if (typeof node === "string") {
      if (key === "places_feature" || key === "features") {
        refs.push(node);
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((n) => visit(n, key));
      return;
    }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        visit(v, k === "description" ? key : k);
      }
    }
  };
  visit(body, "");
  return refs;
}

function validate({ prune }) {
  const defined = new Map();
  const edges = new Map();
  const roots = [];
  let errors = 0;

  const load = (dir) =>
    fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => {
      const file = path.join(dir, f);
      try {
        return { file, json: JSON.parse(fs.readFileSync(file, "utf8")) };
      } catch (e) {
        console.error(`PARSE ${path.relative(ORES_DIR, file)}: ${e.message}`);
        errors++;
        return null;
      }
    });

  for (const entry of load(FEATURES_DIR)) {
    if (!entry) continue;
    const [kind, body] = Object.entries(entry.json).find(([k]) => k.startsWith("minecraft:"));
    const fid = body.description.identifier;
    if (defined.has(fid)) {
      console.error(`DUPLICATE ${fid}`);
      errors++;
    }
    defined.set(fid, entry.file);
    edges.set(fid, refsOf({ ...body, description: undefined }));
    void kind;
  }
  for (const entry of load(RULES_DIR)) {
    if (!entry) continue;
    roots.push(entry.json["minecraft:feature_rules"].description.places_feature);
  }

  const all = [...roots, ...[...edges.values()].flat()];
  for (const ref of new Set(all)) {
    if (ref.startsWith("kindling:") && !defined.has(ref)) {
      console.error(`MISSING ${ref}`);
      errors++;
    }
  }

  const reached = new Set();
  const stack = [...roots];
  while (stack.length) {
    const f = stack.pop();
    if (reached.has(f)) continue;
    reached.add(f);
    stack.push(...(edges.get(f) ?? []));
  }
  const unreachable = [...defined.keys()].filter((f) => f.startsWith("kindling:") && !reached.has(f));
  if (unreachable.length) {
    console.log(`${unreachable.length} kindling features not reached by any rule${prune ? " (deleted)" : ""}:`);
    for (const f of unreachable) {
      console.log(`  ${f}`);
      if (prune) {
        fs.unlinkSync(defined.get(f));
      }
    }
  }
  console.log(`${defined.size} features, ${roots.length} rules, ${errors} errors`);
  if (errors) {
    process.exitCode = 1;
  }
}

const args = new Set(process.argv.slice(2));
if (!args.has("--check")) {
  generate();
}
validate({ prune: args.has("--prune") });
