#!/usr/bin/env node
/**
 * Writes BodyRP/ui/kindling_stamina.json.
 *
 * Body sends the action bar text "kNNaMM<tag>":
 *   NN  = spent twentieths of the bar (00-20)
 *   MM  = spent-or-locked twentieths (00-NN)
 *   tag = "" | h1-h3 (heat) | c1-c3 (cold), from Kindling Climate
 *
 * JSON UI can only compare whole strings, so every control lists each
 * exact text it should show for.
 *
 * Usage: node tools/gen-hud.mjs
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "BodyRP", "ui", "kindling_stamina.json");

const TAGS = ["", "h1", "h2", "h3", "c1", "c2", "c3"];
const LABELS = {
  h1: "§eWarm",
  h2: "§6Hot",
  h3: "§cOverheating",
  c1: "§bChilly",
  c2: "§3Cold",
  c3: "§9Freezing",
};

const pad2 = (n) => String(n).padStart(2, "0");

/** Every valid stamina token (locked share never below spent share). */
function staminaTokens() {
  const out = [];
  for (let k = 0; k <= 20; k++) {
    for (let a = 0; a <= k; a++) {
      out.push({ k, a, text: `k${pad2(k)}a${pad2(a)}` });
    }
  }
  return out;
}

function visibleFor(texts) {
  return `(${texts.map((t) => `($atext = '${t}')`).join(" or ")})`;
}

function withTags(tokens, tags = TAGS) {
  const out = [];
  for (const t of tokens) {
    for (const tag of tags) {
      out.push(t.text + tag);
    }
  }
  return out;
}

const tokens = staminaTokens();
const controls = [{ "empty@kindling.stamina_empty": {} }];

for (let a = 0; a <= 20; a++) {
  controls.push({
    [`spent_${pad2(a)}@kindling.stamina_spent`]: {
      clip_ratio: a / 20,
      $atext: "$actionbar_text",
      visible: visibleFor(withTags(tokens.filter((t) => t.a === a))),
    },
  });
}
for (let k = 0; k <= 20; k++) {
  controls.push({
    [`fill_${pad2(k)}@kindling.stamina_fill`]: {
      clip_ratio: k / 20,
      $atext: "$actionbar_text",
      visible: visibleFor(withTags(tokens.filter((t) => t.k === k))),
    },
  });
}

const labels = Object.entries(LABELS).map(([tag, text]) => ({
  [`climate_${tag}@kindling.climate_label`]: {
    text,
    $atext: "$actionbar_text",
    visible: visibleFor(withTags(tokens, [tag])),
  },
}));

const ui = {
  namespace: "kindling",
  stamina_empty: {
    type: "image",
    texture: "textures/ui/experiencebarempty",
    size: [182, 5],
    color: [0, 0, 0],
  },
  stamina_spent: {
    type: "image",
    texture: "textures/ui/experiencebarfull",
    size: [182, 5],
    clip_direction: "left",
    clip_pixelperfect: false,
    color: [0.55, 0.4, 0.05],
  },
  stamina_fill: {
    type: "image",
    texture: "textures/ui/experiencebarfull",
    size: [182, 5],
    clip_direction: "left",
    clip_pixelperfect: false,
    color: [1, 0.92, 0.28],
  },
  stamina_bar: {
    type: "panel",
    size: [182, 5],
    anchor_from: "bottom_middle",
    anchor_to: "bottom_middle",
    offset: [0, -34],
    controls,
  },
  climate_label: {
    type: "label",
    anchor_from: "bottom_middle",
    anchor_to: "right_middle",
    offset: [-95, -36.5],
    size: ["default", "default"],
    shadow: true,
  },
  stamina_hud: {
    type: "panel",
    size: ["100%", "100%"],
    controls: [{ "bar@kindling.stamina_bar": {} }, ...labels],
  },
};

writeFileSync(OUT, JSON.stringify(ui, null, 1) + "\n");
console.log(`wrote ${OUT}`);
