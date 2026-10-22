# Generates Kindling Ores BP + RP. Run from Kindling/Ores.
import json, os, struct, zlib, random
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BP = ROOT
RP = ROOT.parent / "OresRP"

STONE = [
    "minecraft:stone",
    "minecraft:granite",
    "minecraft:diorite",
    "minecraft:andesite",
    "minecraft:tuff",
    "minecraft:calcite",
    "minecraft:dripstone_block",
    "minecraft:smooth_basalt",
]
DEEPSLATE = ["minecraft:deepslate", "minecraft:tuff"]
NETHERRACK = ["minecraft:netherrack", "minecraft:basalt", "minecraft:blackstone"]


def dump(path: Path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2) + "\n", encoding="utf-8")


def png(path: Path, pixels, w=16, h=16):
    raw = b""
    for y in range(h):
        raw += b"\x00"
        for x in range(w):
            r, g, b, a = pixels[y * w + x]
            raw += bytes((r, g, b, a))
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)

    def chunk(tag, data):
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def noise_tex(base, specks, n=28, seed=1):
    rng = random.Random(seed)
    px = [base[:] for _ in range(256)]
    for i in range(256):
        j = rng.randint(-8, 8)
        px[i] = [max(0, min(255, c + j)) for c in base[:3]] + [255]
    for _ in range(n):
        i = rng.randrange(256)
        px[i] = specks[rng.randrange(len(specks))] + [255]
    return px


def _clamp(c):
    return [max(0, min(255, int(v))) for v in c]


def item_chunk_mask():
    """Irregular raw-ore silhouette (not a full square)."""
    # 1 = solid, 0 = empty. Hand-tuned like vanilla raw metals.
    rows = [
        "....XXXXXXX.....",
        "...XXXXXXXXX....",
        "..XXXXXXXXXXX...",
        ".XXXXX.XXXXXXX..",
        ".XXXXXXXXXXXXX..",
        "XXXXXXXXXXXXXXX.",
        "XXXXXXXXXXXXXX..",
        ".XXXXXXXXXXXXX..",
        ".XXXXXXXXXXXX...",
        "..XXXXXXXXXXXX..",
        "..XXXXXXXXXXX...",
        "...XXXXXXXXXX...",
        "....XXXXXXXX....",
        ".....XXXXXX.....",
        "......XXXX......",
        "................",
    ]
    return [[ch == "X" for ch in row] for row in rows]


def item_crystal_mask():
    """Faceted rough-gem silhouette."""
    rows = [
        ".......XX.......",
        "......XXXX......",
        ".....XXXXXX.....",
        "....XXXXXXXX....",
        "...XXXXXXXXXX...",
        "..XXXXXXXXXXXX..",
        ".XXXXXXXXXXXXXX.",
        ".XXXXXXXXXXXXXX.",
        "..XXXXXXXXXXXX..",
        "...XXXXXXXXXX...",
        "....XXXXXXXX....",
        ".....XXXXXX.....",
        "......XXXX......",
        ".......XX.......",
        "................",
        "................",
    ]
    return [[ch == "X" for ch in row] for row in rows]


def paint_item(mask, palette, seed, shade_strength=18):
    """palette: list of [r,g,b] mid -> light accents -> dark."""
    rng = random.Random(seed)
    mid, light, dark, accent = palette
    px = [[0, 0, 0, 0] for _ in range(256)]
    for y in range(16):
        for x in range(16):
            if not mask[y][x]:
                continue
            # Fake lighting: top-left bright, bottom-right dark
            lit = (15 - x) + (15 - y)
            roll = rng.randint(-shade_strength, shade_strength)
            if lit > 22 or rng.random() < 0.12:
                base = light
            elif lit < 10 or rng.random() < 0.15:
                base = dark
            elif rng.random() < 0.1:
                base = accent
            else:
                base = mid
            c = _clamp([base[0] + roll, base[1] + roll, base[2] + roll])
            # Edge outline
            edge = False
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                yy, xx = y + dy, x + dx
                if yy < 0 or yy > 15 or xx < 0 or xx > 15 or not mask[yy][xx]:
                    edge = True
                    break
            if edge:
                c = _clamp([c[0] - 35, c[1] - 35, c[2] - 35])
            px[y * 16 + x] = c + [255]
    return px


def raw_tin_item():
    # Silvery-beige lump, distinct from brown-flecked tin ore block
    return paint_item(
        item_chunk_mask(),
        [
            [168, 158, 138],  # mid
            [210, 200, 175],  # light
            [110, 100, 85],   # dark
            [145, 155, 150],  # cool accent
        ],
        seed=101,
        shade_strength=14,
    )


def rough_gem_item(kind):
    masks = item_crystal_mask()
    pals = {
        "diamond": [
            [90, 170, 185],
            [200, 245, 255],
            [35, 75, 95],
            [255, 255, 255],
        ],
        "emerald": [
            [35, 150, 85],
            [120, 230, 150],
            [12, 55, 30],
            [180, 255, 190],
        ],
        "lapis": [
            [40, 70, 170],
            [90, 130, 230],
            [15, 25, 90],
            [160, 190, 255],
        ],
        "redstone": [
            [160, 35, 35],
            [230, 70, 55],
            [70, 12, 12],
            [255, 120, 80],
        ],
    }
    seeds = {"diamond": 201, "emerald": 202, "lapis": 203, "redstone": 204}
    return paint_item(masks, pals[kind], seeds[kind], shade_strength=16)


def simple_drop_loot(item, count=None):
    fns = []
    if count is not None:
        fns.append({"function": "set_count", "count": count})
    else:
        fns.append({"function": "set_count", "count": {"min": 1, "max": 1}})
    fns.append({"function": "explosion_decay"})
    return {
        "pools": [
            {
                "rolls": 1,
                "entries": [{"type": "item", "name": item, "functions": fns}],
            }
        ]
    }


def paint_rubble_item(seed, mid, light, dark, accent=None):
    return paint_item(
        item_chunk_mask(),
        [mid, light, dark, accent or mid],
        seed=seed,
        shade_strength=12,
    )


def biome_any(tags):
    return {
        "any_of": [
            {"test": "has_biome_tag", "operator": "==", "value": t} for t in tags
        ]
    }


def biome_overworld():
    return biome_any(["overworld", "overworld_generation"])


def rule(ident, places, pass_, biomes, iterations, y_ext, y_dist="triangle", extra_filter=None):
    filt = [biomes] if isinstance(biomes, dict) else biomes
    if extra_filter:
        filt = list(filt) + extra_filter
    return {
        "format_version": "1.13.0",
        "minecraft:feature_rules": {
            "description": {"identifier": ident, "places_feature": places},
            "conditions": {
                "placement_pass": pass_,
                "minecraft:biome_filter": filt,
            },
            "distribution": {
                "iterations": iterations,
                "coordinate_eval_order": "zyx",
                "x": {"distribution": "uniform", "extent": [0, 16]},
                "y": {"distribution": y_dist, "extent": y_ext},
                "z": {"distribution": "uniform", "extent": [0, 16]},
            },
        },
    }


def ore_feature(ident, count, stone_block, deep_block=None, discard=0.15, extra_replace=None):
    rules = [{"places_block": stone_block, "may_replace": list(STONE)}]
    if deep_block:
        rules.append({"places_block": deep_block, "may_replace": list(DEEPSLATE)})
    if extra_replace:
        rules.extend(extra_replace)
    obj = {
        "format_version": "1.13.0",
        "minecraft:ore_feature": {
            "description": {"identifier": ident},
            "count": count,
            "discard_chance_on_air_exposure": discard,
            "replace_rules": rules,
        },
    }
    return obj


def neuter(ident, block="minecraft:iron_ore"):
    return {
        "format_version": "1.13.0",
        "minecraft:ore_feature": {
            "description": {"identifier": ident},
            "count": 1,
            "replace_rules": [
                {"places_block": block, "may_replace": ["minecraft:structure_void"]}
            ],
        },
    }


def block_def(ident, texture, loot, seconds, explosion=3, pick="iron"):
    tags = {"tag:minecraft:is_pickaxe_item_destructible": {}}
    if pick == "stone":
        tags["tag:minecraft:stone_pick_diggable"] = {}
    elif pick == "iron":
        tags["tag:minecraft:iron_pick_diggable"] = {}
    elif pick == "wood":
        tags["tag:minecraft:wooden_pick_diggable"] = {}
    return {
        "format_version": "1.21.40",
        "minecraft:block": {
            "description": {
                "identifier": ident,
                "menu_category": {"category": "nature"},
            },
            "components": {
                "minecraft:loot": loot,
                "minecraft:destructible_by_mining": {"seconds_to_destroy": seconds},
                "minecraft:destructible_by_explosion": {"explosion_resistance": explosion},
                "minecraft:map_color": "#6a6a6a",
                "minecraft:material_instances": {
                    "*": {"texture": texture, "render_method": "opaque"}
                },
                "minecraft:geometry": "minecraft:geometry.full_block",
                **tags,
            },
        },
    }


def slab_def(ident, texture, loot):
    return {
        "format_version": "1.21.40",
        "minecraft:block": {
            "description": {
                "identifier": ident,
                "menu_category": {"category": "nature"},
            },
            "components": {
                "minecraft:loot": loot,
                "minecraft:destructible_by_mining": {"seconds_to_destroy": 2.0},
                "minecraft:destructible_by_explosion": {"explosion_resistance": 3},
                "minecraft:collision_box": {"origin": [-8, 0, -8], "size": [16, 8, 16]},
                "minecraft:selection_box": {"origin": [-8, 0, -8], "size": [16, 8, 16]},
                "minecraft:material_instances": {
                    "*": {"texture": texture, "render_method": "opaque"}
                },
                "minecraft:geometry": "geometry.kindling.ore_slab",
                "tag:minecraft:is_pickaxe_item_destructible": {},
                "tag:minecraft:iron_pick_diggable": {},
            },
        },
    }


def item_def(ident, icon, cat="items", lore=None, display=None):
    components = {
        "minecraft:icon": {"textures": {"default": icon}},
        "minecraft:max_stack_size": 64,
    }
    if display:
        components["minecraft:display_name"] = {"value": display}
    if lore:
        components["minecraft:lore"] = {"value": lore if isinstance(lore, list) else [lore]}
    return {
        "format_version": "1.21.40",
        "minecraft:item": {
            "description": {
                "identifier": ident,
                "menu_category": {"category": cat},
            },
            "components": components,
        },
    }


def drop_fns(extra_count=None):
    fns = []
    if extra_count:
        fns.append({"function": "set_count", "count": extra_count})
    fns += [
        {"function": "fortune_enchant", "formula": "ore_drops"},
        {"function": "explosion_decay"},
    ]
    return fns


def silk_cond(inverse=False):
    cond = {
        "condition": "match_tool",
        "enchantments": [{"enchantment": "silk_touch", "levels": {"min": 1}}],
    }
    if inverse:
        cond["inverse"] = True
    return cond


def vanilla_gem_loot(item, extra_count=None):
    # Vanilla ores keep engine silk-touch (drop the ore block). Do not gate the
    # rough drop on inverse silk or a failed condition can yield nothing.
    return {
        "pools": [
            {
                "rolls": 1,
                "entries": [{"type": "item", "name": item, "functions": drop_fns(extra_count)}],
            }
        ]
    }


def custom_silk_loot(item, silk_block, extra_count=None):
    # Keep tin drops simple: inverse silk_touch + fortune ore_drops often
    # yields nothing for custom items on Bedrock.
    fns = []
    if extra_count:
        fns.append({"function": "set_count", "count": extra_count})
    else:
        fns.append({"function": "set_count", "count": {"min": 1, "max": 1}})
    fns.append({"function": "explosion_decay"})
    return {
        "pools": [
            {
                "rolls": 1,
                "entries": [{"type": "item", "name": item, "functions": fns}],
            }
        ]
    }


def write_scatter(ident, places, chance, y_ext, iterations=1):
    return {
        "format_version": "1.13.0",
        "minecraft:scatter_feature": {
            "description": {"identifier": ident},
            "places_feature": places,
            "distribution": {
                "iterations": iterations,
                "scatter_chance": chance,
                "x": {"distribution": "uniform", "extent": [0, 16]},
                "y": {"distribution": "uniform", "extent": y_ext},
                "z": {"distribution": "uniform", "extent": [0, 16]},
            },
        },
    }


def chance(num, den):
    return {"numerator": num, "denominator": den}


def main():
    import shutil

    recipes_dir = BP / "recipes"
    if recipes_dir.exists():
        shutil.rmtree(recipes_dir)

    for p in (BP / "features", BP / "feature_rules", BP / "blocks", BP / "items", BP / "loot_tables" / "blocks"):
        p.mkdir(parents=True, exist_ok=True)

    # --- neuter vanilla ore features so Kindling does not double ---
    vanilla_neuter = {
        "coal_ore_feature": "minecraft:coal_ore",
        "coal_ore_upper_feature": "minecraft:coal_ore",
        "iron_ore_feature": "minecraft:iron_ore",
        "iron_ore_small_feature": "minecraft:iron_ore",
        "iron_ore_upper_feature": "minecraft:iron_ore",
        "gold_ore_feature": "minecraft:gold_ore",
        "gold_ore_lower_feature": "minecraft:gold_ore",
        "gold_ore_extra_feature": "minecraft:gold_ore",
        "copper_ore_feature": "minecraft:copper_ore",
        "copper_ore_small_feature": "minecraft:copper_ore",
        "dripstone_caves_copper_ore_feature": "minecraft:copper_ore",
        "diamond_ore_feature": "minecraft:diamond_ore",
        "diamond_ore_large_feature": "minecraft:diamond_ore",
        "diamond_ore_buried_feature": "minecraft:diamond_ore",
        "lapis_ore_feature": "minecraft:lapis_ore",
        "lapis_ore_buried_feature": "minecraft:lapis_ore",
        "redstone_ore_feature": "minecraft:redstone_ore",
        "redstone_ore_lower_feature": "minecraft:redstone_ore",
        "emerald_ore_feature": "minecraft:emerald_ore",
        "nether_gold_ore_feature": "minecraft:nether_gold_ore",
        "nether_quartz_ore_feature": "minecraft:quartz_ore",
        "nether_netherite_deep_feature": "minecraft:ancient_debris",
        "nether_netherite_tall_feature": "minecraft:ancient_debris",
        "netherite_feature": "minecraft:ancient_debris",
        "netherite_hidden_feature": "minecraft:ancient_debris",
        "ancient_debris_feature": "minecraft:ancient_debris",
    }
    for name, block in vanilla_neuter.items():
        dump(BP / "features" / f"{name}.json", neuter(f"minecraft:{name}", block))

    dump(
        BP / "features" / "empty_feature.json",
        {
            "format_version": "1.13.0",
            "minecraft:single_block_feature": {
                "description": {"identifier": "kindling:empty_feature"},
                "places_block": "minecraft:air",
                "enforce_survivability_rules": False,
                "enforce_placement_rules": False,
                "may_replace": ["minecraft:structure_void"],
            },
        },
    )
    vanilla_rules = [
        "overworld_underground_coal_ore",
        "overworld_underground_coal_ore_upper",
        "overworld_underground_coal_ore_lower",
        "overworld_underground_iron_ore",
        "overworld_underground_iron_ore_small",
        "overworld_underground_iron_ore_upper",
        "overworld_underground_gold_ore",
        "overworld_underground_gold_ore_lower",
        "overworld_underground_extra_gold_ore",
        "overworld_underground_gold_ore_extra",
        "overworld_underground_copper_ore",
        "overworld_dripstone_caves_copper_ore",
        "overworld_underground_diamond_ore",
        "overworld_underground_diamond_ore_large",
        "overworld_underground_diamond_ore_buried",
        "overworld_underground_lapis_ore",
        "overworld_underground_lapis_ore_buried",
        "overworld_underground_redstone_ore",
        "overworld_underground_redstone_ore_lower",
        "overworld_underground_emerald_ore",
        "nether_nether_gold_ore",
        "nether_nether_quartz_ore",
        "nether_netherite_deep",
        "nether_netherite_tall",
        "nether_ancient_debris",
    ]
    for name in vanilla_rules:
        dump(
            BP / "feature_rules" / f"{name}.json",
            rule(
                f"minecraft:{name}",
                "kindling:empty_feature",
                "underground_pass",
                biome_overworld(),
                1,
                [-64, 320],
                "uniform",
            ),
        )
        dump(
            BP / "feature_rules" / f"{name}_feature.json",
            rule(
                f"minecraft:{name}_feature",
                "kindling:empty_feature",
                "underground_pass",
                biome_overworld(),
                1,
                [-64, 320],
                "uniform",
            ),
        )

    # --- Kindling vein sizes (count = blob size) ---
    # typical ~16, rare tiny ~8 (never intended as 1-block), rare large ~32, mother ~64
    metals = {
        "iron": ("minecraft:iron_ore", "minecraft:deepslate_iron_ore"),
        "copper": ("minecraft:copper_ore", "minecraft:deepslate_copper_ore"),
        "gold": ("minecraft:gold_ore", "minecraft:deepslate_gold_ore"),
        "coal": ("minecraft:coal_ore", "minecraft:deepslate_coal_ore"),
        "tin": ("kindling:tin_ore", "kindling:deepslate_tin_ore"),
        "diamond": ("minecraft:diamond_ore", "minecraft:deepslate_diamond_ore"),
        "emerald": ("minecraft:emerald_ore", "minecraft:deepslate_emerald_ore"),
        "lapis": ("minecraft:lapis_ore", "minecraft:deepslate_lapis_ore"),
        "redstone": ("minecraft:redstone_ore", "minecraft:deepslate_redstone_ore"),
    }
    sizes = {"tiny": 8, "typical": 16, "large": 32, "mother": 72}
    for name, (st, ds) in metals.items():
        # Low discard so cave exposure does not collapse veins to 1 block
        disc = 0.05 if name in ("diamond", "lapis") else 0.02
        for sz, count in sizes.items():
            dump(
                BP / "features" / f"{name}_{sz}_feature.json",
                ore_feature(f"kindling:{name}_{sz}_feature", count, st, ds, discard=disc),
            )

    nether_metals = {
        "nether_gold": ("minecraft:nether_gold_ore", None, NETHERRACK),
        "quartz": ("minecraft:quartz_ore", None, NETHERRACK),
        "debris": ("minecraft:ancient_debris", None, NETHERRACK),
    }
    for name, (block, _, replace) in nether_metals.items():
        for sz, count in (("typical", 14), ("tiny", 8), ("large", 28), ("mother", 48)):
            dump(
                BP / "features" / f"{name}_{sz}_feature.json",
                {
                    "format_version": "1.13.0",
                    "minecraft:ore_feature": {
                        "description": {"identifier": f"kindling:{name}_{sz}_feature"},
                        "count": count if name != "debris" or sz != "mother" else 14,
                        "discard_chance_on_air_exposure": 0.4 if name == "debris" else 0.02,
                        "replace_rules": [{"places_block": block, "may_replace": list(replace)}],
                    },
                },
            )

    # mixed: aggregate big + specks, or two typical patches
    def aggregate(ident, feats):
        return {
            "format_version": "1.13.0",
            "minecraft:aggregate_feature": {
                "description": {"identifier": ident},
                "features": feats,
            },
        }

    dump(BP / "features" / "mix_fe_cu_equal_feature.json",
         aggregate("kindling:mix_fe_cu_equal_feature", ["kindling:iron_typical_feature", "kindling:copper_typical_feature"]))
    dump(BP / "features" / "mix_cu_au_speck_feature.json",
         aggregate("kindling:mix_cu_au_speck_feature", ["kindling:copper_typical_feature", "kindling:gold_tiny_feature"]))
    dump(BP / "features" / "mix_fe_cu_au_feature.json",
         aggregate("kindling:mix_fe_cu_au_feature", ["kindling:iron_typical_feature", "kindling:copper_tiny_feature", "kindling:gold_tiny_feature"]))
    dump(BP / "features" / "mix_au_redstone_feature.json",
         aggregate("kindling:mix_au_redstone_feature", ["kindling:gold_typical_feature", "kindling:redstone_tiny_feature"]))
    dump(BP / "features" / "mix_cu_tin_feature.json",
         aggregate("kindling:mix_cu_tin_feature", ["kindling:copper_typical_feature", "kindling:tin_typical_feature"]))
    dump(BP / "features" / "mix_fe_coal_feature.json",
         aggregate("kindling:mix_fe_coal_feature", ["kindling:iron_typical_feature", "kindling:coal_tiny_feature"]))

    # mother lode pick
    dump(
        BP / "features" / "mother_lode_pick_feature.json",
        {
            "format_version": "1.13.0",
            "minecraft:weighted_random_feature": {
                "description": {"identifier": "kindling:mother_lode_pick_feature"},
                "features": [
                    ["kindling:iron_mother_feature", 12],
                    ["kindling:copper_mother_feature", 10],
                    ["kindling:coal_mother_feature", 10],
                    ["kindling:tin_mother_feature", 8],
                    ["kindling:gold_mother_feature", 6],
                    ["kindling:redstone_mother_feature", 5],
                    ["kindling:lapis_mother_feature", 4],
                    ["kindling:diamond_mother_feature", 3],
                    ["kindling:emerald_mother_feature", 2],
                ],
            },
        },
    )
    dump(
        BP / "features" / "mother_lode_scatter_feature.json",
        write_scatter("kindling:mother_lode_scatter_feature", "kindling:mother_lode_pick_feature", chance(1, 400), [-56, 48]),
    )
    dump(
        BP / "features" / "tiny_vein_try_feature.json",
        write_scatter("kindling:tiny_vein_try_feature", "kindling:tiny_vein_scatter_feature", chance(1, 48), [-48, 72]),
    )

    dump(
        BP / "features" / "tiny_vein_scatter_feature.json",
        {
            "format_version": "1.13.0",
            "minecraft:weighted_random_feature": {
                "description": {"identifier": "kindling:tiny_vein_scatter_feature"},
                "features": [
                    ["kindling:iron_tiny_feature", 8],
                    ["kindling:copper_tiny_feature", 8],
                    ["kindling:coal_tiny_feature", 8],
                    ["kindling:tin_tiny_feature", 5],
                    ["kindling:gold_tiny_feature", 4],
                    ["kindling:redstone_tiny_feature", 3],
                    ["kindling:lapis_tiny_feature", 2],
                    ["kindling:diamond_tiny_feature", 1],
                ],
            },
        },
    )

    # gravel / netherrack / slabs
    dump(
        BP / "features" / "auriferous_gravel_feature.json",
        {
            "format_version": "1.13.0",
            "minecraft:ore_feature": {
                "description": {"identifier": "kindling:auriferous_gravel_feature"},
                "count": 18,
                "replace_rules": [
                    {"places_block": "kindling:auriferous_gravel", "may_replace": ["minecraft:gravel", "minecraft:sand"]}
                ],
            },
        },
    )
    dump(
        BP / "features" / "gold_flecked_netherrack_feature.json",
        {
            "format_version": "1.13.0",
            "minecraft:ore_feature": {
                "description": {"identifier": "kindling:gold_flecked_netherrack_feature"},
                "count": 14,
                "replace_rules": [
                    {"places_block": "kindling:gold_flecked_netherrack", "may_replace": ["minecraft:netherrack"]}
                ],
            },
        },
    )

    def slab_feat(name, block):
        return {
            "format_version": "1.13.0",
            "minecraft:single_block_feature": {
                "description": {"identifier": f"kindling:{name}_slab_place_feature"},
                "places_block": block,
                "enforce_survivability_rules": False,
                "enforce_placement_rules": False,
                "may_replace": ["minecraft:air"],
                "may_attach_to": {
                    "bottom": ["minecraft:stone", "minecraft:granite", "minecraft:diorite", "minecraft:andesite", "minecraft:tuff"]
                },
            },
        }

    for n, b in (
        ("iron", "kindling:iron_ore_slab"),
        ("copper", "kindling:copper_ore_slab"),
        ("coal", "kindling:coal_ore_slab"),
        ("gold", "kindling:gold_ore_slab"),
        ("tin", "kindling:tin_ore_slab"),
    ):
        dump(BP / "features" / f"{n}_slab_place_feature.json", slab_feat(n, b))

    # ---------- feature rules ----------
    OW = biome_overworld()
    mountains = biome_any(["mountains", "extreme_hills", "mountain", "frozen"])
    desert = biome_any(["desert"])
    mesa = biome_any(["mesa"])
    savanna = biome_any(["savanna"])
    jungle = biome_any(["jungle"])
    swamp = biome_any(["swamp"])
    taiga = biome_any(["taiga"])
    ocean = biome_any(["ocean"])
    drip = biome_any(["dripstone_caves"])
    lush = biome_any(["lush_caves"])
    shroom = biome_any(["mooshroom_island"])
    dark = biome_any(["deep_dark", "caves"])
    river = biome_any(["river"])
    nether_wastes = biome_any(["nether_wastes"])
    crimson = biome_any(["crimson_forest"])
    warped = biome_any(["warped_forest"])
    soul = biome_any(["soulsand_valley"])
    deltas = biome_any(["basalt_deltas"])

    rules = []

    def add_rule(name, places, biomes, it, y, dist="triangle", pass_="underground_pass"):
        ident = f"kindling:{name}"
        dump(BP / "feature_rules" / f"{name}.json", rule(ident, places, pass_, biomes, it, y, dist))

    # typical iron: a bit leaner than v1.0.1 (caves felt crowded)
    add_rule("iron_typical_overworld", "kindling:iron_typical_feature", OW, 5, [-24, 56])
    add_rule("iron_upper", "kindling:iron_typical_feature", OW, 3, [80, 256], "triangle")
    add_rule("iron_rich_mountains", "kindling:iron_typical_feature", mountains, 3, [-16, 96])
    add_rule("iron_rich_arid", "kindling:iron_typical_feature", biome_any(["desert", "savanna", "mesa"]), 3, [-16, 72])
    add_rule("iron_rich_taiga", "kindling:iron_typical_feature", taiga, 2, [-24, 72])
    add_rule("iron_poor_jungle", "kindling:iron_typical_feature", jungle, 1, [-16, 48], "uniform")
    add_rule("iron_poor_ocean", "kindling:iron_typical_feature", ocean, 1, [-40, 32], "uniform")
    add_rule("iron_large_rare", "kindling:iron_large_feature", OW, 1, [-32, 48], "uniform")

    add_rule("copper_typical", "kindling:copper_typical_feature", OW, 5, [-16, 96])
    add_rule("copper_rich_mountains", "kindling:copper_typical_feature", mountains, 4, [-16, 112])
    add_rule("copper_rich_arid", "kindling:copper_typical_feature", biome_any(["desert", "savanna"]), 3, [-16, 80])
    add_rule("copper_dripstone", "kindling:copper_typical_feature", drip, 5, [-48, 48])
    add_rule("copper_poor_jungle", "kindling:copper_typical_feature", jungle, 1, [-8, 64], "uniform")
    add_rule("copper_large_rare", "kindling:copper_large_feature", OW, 1, [-16, 80], "uniform")

    add_rule("gold_typical", "kindling:gold_typical_feature", OW, 3, [-64, 32])
    add_rule("gold_badlands", "kindling:gold_typical_feature", mesa, 5, [-64, 256], "uniform")
    add_rule("gold_dripstone", "kindling:gold_typical_feature", drip, 1, [-48, 16])
    add_rule("gold_poor_jungle", "kindling:gold_typical_feature", jungle, 1, [-32, 16], "uniform")
    add_rule("gold_large_rare", "kindling:gold_large_feature", mesa, 1, [-32, 80], "uniform")

    add_rule("coal_typical", "kindling:coal_typical_feature", OW, 8, [0, 192], "triangle")
    add_rule("coal_swamp", "kindling:coal_typical_feature", swamp, 5, [8, 128])
    add_rule("coal_taiga", "kindling:coal_typical_feature", taiga, 3, [16, 160])
    add_rule("coal_poor_desert", "kindling:coal_typical_feature", desert, 1, [16, 80], "uniform")
    add_rule("coal_poor_mountains", "kindling:coal_typical_feature", mountains, 1, [32, 128], "uniform")
    add_rule("coal_large_rare", "kindling:coal_large_feature", OW, 1, [16, 96], "uniform")

    add_rule("tin_typical", "kindling:tin_typical_feature", OW, 4, [-16, 96])
    add_rule("tin_mountains", "kindling:tin_typical_feature", mountains, 3, [-16, 96])
    add_rule("tin_deep_less", "kindling:tin_typical_feature", OW, 1, [-32, 0], "uniform")
    add_rule("tin_large_rare", "kindling:tin_large_feature", mountains, 1, [-8, 64], "uniform")

    add_rule("diamond_typical", "kindling:diamond_typical_feature", OW, 5, [-64, 16])
    add_rule("diamond_mountains", "kindling:diamond_typical_feature", mountains, 1, [-64, 8])
    add_rule("diamond_poor_ocean", "kindling:diamond_typical_feature", ocean, 1, [-64, 0], "uniform")
    add_rule("diamond_large_rare", "kindling:diamond_large_feature", OW, 1, [-64, 8], "uniform")

    add_rule("emerald_mountains", "kindling:emerald_typical_feature", mountains, 4, [-16, 256], "uniform")
    add_rule("emerald_large_rare", "kindling:emerald_large_feature", mountains, 1, [32, 160], "uniform")

    add_rule("lapis_typical", "kindling:lapis_typical_feature", OW, 3, [-32, 32])
    add_rule("lapis_desert", "kindling:lapis_typical_feature", desert, 3, [-32, 48])
    add_rule("lapis_dripstone", "kindling:lapis_typical_feature", drip, 2, [-48, 16])
    add_rule("lapis_large_rare", "kindling:lapis_large_feature", desert, 1, [-24, 24], "uniform")

    add_rule("redstone_typical", "kindling:redstone_typical_feature", OW, 4, [-64, 16])
    add_rule("redstone_badlands", "kindling:redstone_typical_feature", mesa, 2, [-64, 32])
    add_rule("redstone_dripstone", "kindling:redstone_typical_feature", drip, 2, [-64, 16])
    add_rule("redstone_large_rare", "kindling:redstone_large_feature", OW, 1, [-64, 8], "uniform")

    # mixed — still present, less crowded
    add_rule("mix_arid_fe_cu_au", "kindling:mix_fe_cu_au_feature", biome_any(["desert", "savanna", "mesa"]), 3, [-16, 64])
    add_rule("mix_peak_cu_au", "kindling:mix_cu_au_speck_feature", mountains, 3, [-16, 96])
    add_rule("mix_drip_cu_au", "kindling:mix_cu_au_speck_feature", drip, 3, [-48, 32])
    add_rule("mix_arid_fe_cu", "kindling:mix_fe_cu_equal_feature", biome_any(["desert", "savanna"]), 2, [-8, 56])
    add_rule("mix_cu_tin", "kindling:mix_cu_tin_feature", mountains, 2, [-16, 80])
    add_rule("mix_cu_tin_ow", "kindling:mix_cu_tin_feature", OW, 1, [-16, 72])
    add_rule("mix_fe_cu_ow", "kindling:mix_fe_cu_equal_feature", OW, 1, [-24, 56])
    add_rule("mix_fe_coal", "kindling:mix_fe_coal_feature", biome_any(["taiga", "swamp"]), 2, [0, 96])
    add_rule("mix_au_redstone", "kindling:mix_au_redstone_feature", mesa, 1, [-48, 16], "uniform")

    # rare tiny (1-block-ish) — few chunks
    dump(
        BP / "feature_rules" / "tiny_vein_rare.json",
        rule(
            "kindling:tiny_vein_rare",
            "kindling:tiny_vein_try_feature",
            "underground_pass",
            OW,
            1,
            [-48, 72],
            "uniform",
        ),
    )
    dump(
        BP / "feature_rules" / "mother_lode.json",
        rule(
            "kindling:mother_lode",
            "kindling:mother_lode_scatter_feature",
            "underground_pass",
            OW,
            1,
            [-56, 48],
            "uniform",
        ),
    )

    add_rule("river_gold_gravel", "kindling:auriferous_gravel_feature", river, 4, [48, 80], "uniform", "surface_pass")

    add_rule("iron_slab_surface", "kindling:iron_slab_place_feature", biome_any(["mountains", "desert", "savanna", "taiga", "extreme_hills"]), 2, [48, 96], "uniform", "surface_pass")
    add_rule("copper_slab_surface", "kindling:copper_slab_place_feature", biome_any(["mountains", "desert", "dripstone_caves"]), 2, [48, 100], "uniform", "surface_pass")
    add_rule("coal_slab_surface", "kindling:coal_slab_place_feature", biome_any(["swamp", "taiga"]), 2, [52, 90], "uniform", "surface_pass")
    add_rule("gold_slab_surface", "kindling:gold_slab_place_feature", mesa, 1, [48, 80], "uniform", "surface_pass")
    add_rule("tin_slab_surface", "kindling:tin_slab_place_feature", mountains, 1, [52, 96], "uniform", "surface_pass")

    add_rule("nether_gold_wastes", "kindling:nether_gold_typical_feature", nether_wastes, 8, [8, 117], "uniform")
    add_rule("nether_gold_fleck", "kindling:gold_flecked_netherrack_feature", nether_wastes, 5, [8, 117], "uniform")
    add_rule("nether_gold_poor_soul", "kindling:nether_gold_tiny_feature", soul, 2, [8, 117], "uniform")
    add_rule("nether_gold_mother", "kindling:nether_gold_mother_feature", nether_wastes, 1, [16, 96], "uniform")
    add_rule("quartz_crimson", "kindling:quartz_typical_feature", crimson, 11, [8, 117], "uniform")
    add_rule("quartz_warped", "kindling:quartz_typical_feature", warped, 11, [8, 117], "uniform")
    add_rule("quartz_wastes", "kindling:quartz_typical_feature", nether_wastes, 7, [8, 117], "uniform")
    add_rule("quartz_poor_soul", "kindling:quartz_tiny_feature", soul, 3, [8, 117], "uniform")
    add_rule("debris_deltas", "kindling:debris_typical_feature", deltas, 1, [8, 22], "uniform")
    add_rule("debris_nether", "kindling:debris_tiny_feature", biome_any(["nether", "nether_wastes", "crimson_forest", "warped_forest"]), 1, [8, 22], "uniform")

    # ---------- blocks / items / loot ----------
    dump(BP / "blocks" / "tin_ore.json", block_def("kindling:tin_ore", "tin_ore", "loot_tables/blocks/tin_ore.json", 3.0))
    dump(BP / "blocks" / "deepslate_tin_ore.json", block_def("kindling:deepslate_tin_ore", "deepslate_tin_ore", "loot_tables/blocks/deepslate_tin_ore.json", 4.5))
    dump(BP / "blocks" / "auriferous_gravel.json", {
        "format_version": "1.21.40",
        "minecraft:block": {
            "description": {
                "identifier": "kindling:auriferous_gravel",
                "menu_category": {"category": "nature"},
            },
            "components": {
                "minecraft:loot": "loot_tables/blocks/auriferous_gravel.json",
                "minecraft:destructible_by_mining": {"seconds_to_destroy": 0.6},
                "minecraft:destructible_by_explosion": {"explosion_resistance": 0.6},
                "minecraft:material_instances": {"*": {"texture": "auriferous_gravel", "render_method": "opaque"}},
                "minecraft:geometry": "minecraft:geometry.full_block",
                "minecraft:map_color": "#837c70",
            },
        },
    })
    dump(BP / "blocks" / "gold_flecked_netherrack.json", {
        "format_version": "1.21.40",
        "minecraft:block": {
            "description": {
                "identifier": "kindling:gold_flecked_netherrack",
                "menu_category": {"category": "nature"},
            },
            "components": {
                "minecraft:loot": "loot_tables/blocks/gold_flecked_netherrack.json",
                "minecraft:destructible_by_mining": {"seconds_to_destroy": 0.4},
                "minecraft:destructible_by_explosion": {"explosion_resistance": 0.4},
                "minecraft:material_instances": {"*": {"texture": "gold_flecked_netherrack", "render_method": "opaque"}},
                "minecraft:geometry": "minecraft:geometry.full_block",
                "minecraft:map_color": "#6f3030",
            },
        },
    })
    for n, tex, loot in (
        ("iron", "iron_ore_slab", "loot_tables/blocks/iron_ore_slab.json"),
        ("copper", "copper_ore_slab", "loot_tables/blocks/copper_ore_slab.json"),
        ("coal", "coal_ore_slab", "loot_tables/blocks/coal_ore_slab.json"),
        ("gold", "gold_ore_slab", "loot_tables/blocks/gold_ore_slab.json"),
        ("tin", "tin_ore_slab", "loot_tables/blocks/tin_ore_slab.json"),
    ):
        dump(BP / "blocks" / f"{n}_ore_slab.json", slab_def(f"kindling:{n}_ore_slab", tex, loot))

    dump(BP / "items" / "raw_tin.json", item_def("kindling:raw_tin", "raw_tin", display="Raw Tin", lore=["§7Unfinished tin. Refine in another pack."]))
    dump(BP / "items" / "rough_diamond.json", item_def("kindling:rough_diamond", "rough_diamond", display="Rough Diamond", lore=["§7Unfinished gem. Refine in another pack."]))
    dump(BP / "items" / "rough_emerald.json", item_def("kindling:rough_emerald", "rough_emerald", display="Rough Emerald", lore=["§7Unfinished gem. Refine in another pack."]))
    dump(BP / "items" / "rough_lapis.json", item_def("kindling:rough_lapis", "rough_lapis", display="Rough Lapis", lore=["§7Unfinished gem. Refine in another pack."]))
    dump(BP / "items" / "rough_redstone.json", item_def("kindling:rough_redstone", "rough_redstone", display="Rough Redstone", lore=["§7Unfinished gem. Refine in another pack."]))

    # unfinished drops (vanilla already-processed mining)
    raw_item_meta = [
        ("rocks", "Rocks", "§7Unfinished stone. Refine in another pack."),
        ("deepslate_rubble", "Deepslate Rubble", "§7Unfinished deepslate. Refine in another pack."),
        ("blackstone_chips", "Blackstone Chips", "§7Unfinished blackstone. Refine in another pack."),
        ("end_grit", "End Grit", "§7Unfinished end stone. Refine in another pack."),
        ("raw_coal", "Raw Coal", "§7Unfinished fuel. Refine in another pack."),
        ("rough_quartz", "Rough Quartz", "§7Unfinished quartz. Refine in another pack."),
        ("glowstone_shard", "Glowstone Shard", "§7Unfinished glowstone. Refine in another pack."),
        ("rough_amethyst", "Rough Amethyst", "§7Unfinished amethyst. Refine in another pack."),
        ("debris_chunk", "Debris Chunk", "§7Unfinished debris. Refine in another pack."),
    ]
    for n, disp, tip in raw_item_meta:
        dump(BP / "items" / f"{n}.json", item_def(f"kindling:{n}", n, display=disp, lore=[tip]))

    dump(BP / "loot_tables" / "blocks" / "tin_ore.json", custom_silk_loot("kindling:raw_tin", "kindling:tin_ore"))
    dump(BP / "loot_tables" / "blocks" / "deepslate_tin_ore.json", custom_silk_loot("kindling:raw_tin", "kindling:deepslate_tin_ore"))
    dump(BP / "loot_tables" / "blocks" / "diamond_ore.json", vanilla_gem_loot("kindling:rough_diamond"))
    dump(BP / "loot_tables" / "blocks" / "deepslate_diamond_ore.json", vanilla_gem_loot("kindling:rough_diamond"))
    dump(BP / "loot_tables" / "blocks" / "emerald_ore.json", vanilla_gem_loot("kindling:rough_emerald"))
    dump(BP / "loot_tables" / "blocks" / "deepslate_emerald_ore.json", vanilla_gem_loot("kindling:rough_emerald"))
    dump(BP / "loot_tables" / "blocks" / "lapis_ore.json", vanilla_gem_loot("kindling:rough_lapis", {"min": 2, "max": 5}))
    dump(BP / "loot_tables" / "blocks" / "deepslate_lapis_ore.json", vanilla_gem_loot("kindling:rough_lapis", {"min": 2, "max": 5}))
    dump(BP / "loot_tables" / "blocks" / "redstone_ore.json", vanilla_gem_loot("kindling:rough_redstone", {"min": 1, "max": 3}))
    dump(BP / "loot_tables" / "blocks" / "deepslate_redstone_ore.json", vanilla_gem_loot("kindling:rough_redstone", {"min": 1, "max": 3}))
    dump(BP / "loot_tables" / "blocks" / "lit_redstone_ore.json", vanilla_gem_loot("kindling:rough_redstone", {"min": 1, "max": 3}))

    # Stone-likes: do not override loot tables (silk touch). Script swaps finished drops.
    dump(BP / "loot_tables" / "blocks" / "coal_ore.json", simple_drop_loot("kindling:raw_coal"))
    dump(BP / "loot_tables" / "blocks" / "deepslate_coal_ore.json", simple_drop_loot("kindling:raw_coal"))
    dump(BP / "loot_tables" / "blocks" / "quartz_ore.json", simple_drop_loot("kindling:rough_quartz"))
    dump(BP / "loot_tables" / "blocks" / "nether_quartz_ore.json", simple_drop_loot("kindling:rough_quartz"))
    dump(BP / "loot_tables" / "blocks" / "glowstone.json", simple_drop_loot("kindling:glowstone_shard", {"min": 2, "max": 4}))
    dump(BP / "loot_tables" / "blocks" / "amethyst_cluster.json", simple_drop_loot("kindling:rough_amethyst", {"min": 2, "max": 4}))
    dump(BP / "loot_tables" / "blocks" / "ancient_debris.json", simple_drop_loot("kindling:debris_chunk"))

    # Ores has no recipes — refining belongs in a later pack.

    def nugget_gravel(silk, extra):
        return {
            "pools": [
                {
                    "rolls": 1,
                    "entries": [
                        {
                            "type": "item",
                            "name": silk,
                            "conditions": [
                                {
                                    "condition": "match_tool",
                                    "enchantments": [{"enchantment": "silk_touch", "levels": {"min": 1}}],
                                }
                            ],
                        },
                        extra,
                    ],
                }
            ]
        }

    dump(
        BP / "loot_tables" / "blocks" / "auriferous_gravel.json",
        {
            "pools": [
                {
                    "rolls": 1,
                    "entries": [
                        {
                            "type": "item",
                            "name": "kindling:auriferous_gravel",
                            "conditions": [
                                {
                                    "condition": "match_tool",
                                    "enchantments": [{"enchantment": "silk_touch", "levels": {"min": 1}}],
                                }
                            ],
                        },
                        {
                            "type": "item",
                            "name": "minecraft:gravel",
                            "conditions": [silk_cond(True)],
                        },
                    ],
                },
                {
                    "rolls": 1,
                    "conditions": [silk_cond(True)],
                    "entries": [
                        {
                            "type": "item",
                            "name": "minecraft:gold_nugget",
                            "functions": [
                                {"function": "set_count", "count": {"min": 1, "max": 3}},
                                {"function": "fortune_enchant", "formula": "ore_drops"},
                            ],
                        }
                    ],
                },
            ]
        },
    )
    dump(
        BP / "loot_tables" / "blocks" / "gold_flecked_netherrack.json",
        {
            "pools": [
                {
                    "rolls": 1,
                    "entries": [
                        {
                            "type": "item",
                            "name": "kindling:gold_flecked_netherrack",
                            "conditions": [
                                {
                                    "condition": "match_tool",
                                    "enchantments": [{"enchantment": "silk_touch", "levels": {"min": 1}}],
                                }
                            ],
                        },
                        {
                            "type": "item",
                            "name": "minecraft:netherrack",
                            "conditions": [silk_cond(True)],
                        },
                    ],
                },
                {
                    "rolls": 1,
                    "conditions": [silk_cond(True)],
                    "entries": [
                        {
                            "type": "item",
                            "name": "minecraft:gold_nugget",
                            "functions": [{"function": "set_count", "count": {"min": 0, "max": 2}}],
                        }
                    ],
                },
            ]
        },
    )

    def slab_loot(drop):
        return {
            "pools": [
                {
                    "rolls": 1,
                    "entries": [
                        {
                            "type": "item",
                            "name": drop,
                            "functions": [
                                {"function": "set_count", "count": 1},
                                {"function": "fortune_enchant", "formula": "ore_drops"},
                                {"function": "explosion_decay"},
                            ],
                        }
                    ],
                }
            ]
        }

    dump(BP / "loot_tables" / "blocks" / "iron_ore_slab.json", slab_loot("minecraft:raw_iron"))
    dump(BP / "loot_tables" / "blocks" / "copper_ore_slab.json", slab_loot("minecraft:raw_copper"))
    dump(BP / "loot_tables" / "blocks" / "coal_ore_slab.json", slab_loot("minecraft:coal"))
    dump(BP / "loot_tables" / "blocks" / "gold_ore_slab.json", slab_loot("minecraft:raw_gold"))
    dump(BP / "loot_tables" / "blocks" / "tin_ore_slab.json", slab_loot("kindling:raw_tin"))

    # ---------- RP ----------
    geo = {
        "format_version": "1.12.0",
        "minecraft:geometry": [
            {
                "description": {
                    "identifier": "geometry.kindling.ore_slab",
                    "texture_width": 16,
                    "texture_height": 16,
                    "visible_bounds_width": 2,
                    "visible_bounds_height": 1.5,
                    "visible_bounds_offset": [0, 0.25, 0],
                },
                "bones": [
                    {
                        "name": "slab",
                        "pivot": [0, 0, 0],
                        "cubes": [{"origin": [-8, 0, -8], "size": [16, 8, 16], "uv": [0, 0]}],
                    }
                ],
            }
        ],
    }
    dump(RP / "models" / "blocks" / "ore_slab.geo.json", geo)

    terrains = {
        "resource_pack_name": "kindling_ores",
        "texture_name": "atlas.terrain",
        "padding": 8,
        "num_mip_levels": 4,
        "texture_data": {},
    }
    items_tex = {
        "resource_pack_name": "kindling_ores",
        "texture_name": "atlas.items",
        "texture_data": {},
    }
    blocks_json = {"format_version": [1, 1, 0]}

    def add_block_tex(name):
        terrains["texture_data"][name] = {"textures": f"textures/blocks/{name}"}
        blocks_json[f"kindling:{name}"] = {"sound": "stone", "textures": name}

    for n in (
        "tin_ore",
        "deepslate_tin_ore",
        "auriferous_gravel",
        "gold_flecked_netherrack",
        "iron_ore_slab",
        "copper_ore_slab",
        "coal_ore_slab",
        "gold_ore_slab",
        "tin_ore_slab",
    ):
        add_block_tex(n)
    blocks_json["kindling:tin_ore"] = {"sound": "stone", "textures": "tin_ore"}
    blocks_json["kindling:deepslate_tin_ore"] = {"sound": "stone", "textures": "deepslate_tin_ore"}
    blocks_json["kindling:auriferous_gravel"] = {"sound": "gravel", "textures": "auriferous_gravel"}
    blocks_json["kindling:gold_flecked_netherrack"] = {"sound": "netherrack", "textures": "gold_flecked_netherrack"}
    dump(RP / "textures" / "terrain_texture.json", terrains)
    dump(RP / "blocks.json", blocks_json)

    for n in ("raw_tin", "rough_diamond", "rough_emerald", "rough_lapis", "rough_redstone",
              "rocks", "deepslate_rubble", "blackstone_chips", "end_grit", "raw_coal",
              "rough_quartz", "glowstone_shard", "rough_amethyst", "debris_chunk"):
        items_tex["texture_data"][n] = {"textures": f"textures/items/{n}"}
    dump(RP / "textures" / "item_texture.json", items_tex)

    # textures
    png(RP / "textures" / "blocks" / "tin_ore.png", noise_tex([120, 120, 118, 255], [[70, 55, 40], [90, 80, 50], [50, 45, 40]], 36, 1))
    png(RP / "textures" / "blocks" / "deepslate_tin_ore.png", noise_tex([55, 55, 58, 255], [[80, 65, 45], [40, 35, 30]], 32, 2))
    png(RP / "textures" / "blocks" / "auriferous_gravel.png", noise_tex([130, 125, 118, 255], [[220, 180, 50], [240, 200, 70], [90, 85, 80]], 40, 3))
    png(RP / "textures" / "blocks" / "gold_flecked_netherrack.png", noise_tex([90, 40, 40, 255], [[220, 175, 45], [70, 30, 28]], 34, 4))
    png(RP / "textures" / "blocks" / "iron_ore_slab.png", noise_tex([120, 120, 120, 255], [[210, 190, 170], [80, 80, 80]], 30, 5))
    png(RP / "textures" / "blocks" / "copper_ore_slab.png", noise_tex([120, 120, 118, 255], [[180, 90, 50], [80, 140, 90]], 30, 6))
    png(RP / "textures" / "blocks" / "coal_ore_slab.png", noise_tex([118, 118, 118, 255], [[20, 20, 20], [40, 40, 40]], 28, 7))
    png(RP / "textures" / "blocks" / "gold_ore_slab.png", noise_tex([120, 120, 118, 255], [[230, 190, 50], [200, 160, 40]], 28, 8))
    png(RP / "textures" / "blocks" / "tin_ore_slab.png", noise_tex([120, 120, 118, 255], [[70, 55, 40], [90, 80, 50]], 30, 9))
    png(RP / "textures" / "items" / "raw_tin.png", raw_tin_item())
    png(RP / "textures" / "items" / "rough_diamond.png", rough_gem_item("diamond"))
    png(RP / "textures" / "items" / "rough_emerald.png", rough_gem_item("emerald"))
    png(RP / "textures" / "items" / "rough_lapis.png", rough_gem_item("lapis"))
    png(RP / "textures" / "items" / "rough_redstone.png", rough_gem_item("redstone"))
    png(RP / "textures" / "items" / "rocks.png", paint_rubble_item(301, [140, 140, 140], [185, 185, 185], [90, 90, 90], [160, 155, 145]))
    png(RP / "textures" / "items" / "deepslate_rubble.png", paint_rubble_item(302, [55, 55, 60], [90, 90, 95], [30, 30, 35], [70, 75, 80]))
    png(RP / "textures" / "items" / "blackstone_chips.png", paint_rubble_item(303, [35, 30, 35], [70, 65, 70], [15, 12, 15], [50, 40, 45]))
    png(RP / "textures" / "items" / "end_grit.png", paint_rubble_item(304, [200, 200, 150], [230, 230, 190], [140, 140, 100], [180, 175, 120]))
    png(RP / "textures" / "items" / "raw_coal.png", paint_rubble_item(305, [40, 40, 40], [80, 80, 80], [15, 15, 15], [55, 50, 45]))
    png(RP / "textures" / "items" / "rough_quartz.png", paint_item(item_crystal_mask(), [[210, 200, 190], [250, 245, 235], [150, 140, 130], [255, 255, 255]], 306, 14))
    png(RP / "textures" / "items" / "glowstone_shard.png", paint_item(item_crystal_mask(), [[200, 160, 70], [255, 230, 140], [120, 80, 30], [255, 255, 200]], 307, 14))
    png(RP / "textures" / "items" / "rough_amethyst.png", paint_item(item_crystal_mask(), [[140, 90, 190], [210, 160, 240], [70, 40, 110], [240, 210, 255]], 308, 14))
    png(RP / "textures" / "items" / "debris_chunk.png", paint_rubble_item(309, [90, 55, 45], [140, 90, 70], [40, 25, 20], [110, 70, 50]))

    rng = random.Random(42)
    icon = []
    for y in range(128):
        for x in range(128):
            j = rng.randint(-10, 10)
            c = [max(0, min(255, 92 + j)), max(0, min(255, 78 + j)), max(0, min(255, 58 + j)), 255]
            if rng.random() < 0.08:
                c = [220, 175, 55, 255]
            elif rng.random() < 0.05:
                c = [70, 55, 40, 255]
            icon.append(c)
    png(BP / "pack_icon.png", icon, 128, 128)
    png(RP / "pack_icon.png", icon, 128, 128)

    print("generated", BP, RP)


if __name__ == "__main__":
    main()
