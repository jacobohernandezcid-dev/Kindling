#!/usr/bin/env node
/**
 * Kindling Ores — tin textures.
 *
 * Recolors iron textures to a tin palette: vanilla iron ore (from Mojang's
 * bedrock-samples) for the ore blocks and raw tin, and the pack's own iron
 * ore slab for the tin slab. Stone / deepslate pixels are kept as-is.
 *
 *   node tools/gen-tin-textures.mjs
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

/** Speck gradient, darkest to brightest. Silvery-white with a faint blue cast. */
const TIN_PALETTE = ["#4A5966", "#7491A6", "#BDD2DF", "#F2F8FB"];

/** Pixels more saturated than this are treated as ore specks. */
const SPECK_SATURATION = 0.16;

const SOURCE = "https://raw.githubusercontent.com/Mojang/bedrock-samples/main/resource_pack/textures";
const RP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "OresRP", "textures");

/** `local: true` reads from OresRP/textures instead of bedrock-samples. */
const JOBS = [
  { from: "blocks/iron_ore.png", to: ["blocks/tin_ore.png"] },
  { from: "blocks/iron_ore_slab.png", to: ["blocks/tin_ore_slab.png"], local: true },
  { from: "blocks/deepslate/deepslate_iron_ore.png", to: ["blocks/deepslate_tin_ore.png"] },
  { from: "items/raw_iron.png", to: ["items/raw_tin.png"], recolorAll: true },
];

function decodePng(buf) {
  const sig = "89504e470d0a1a0a";
  if (buf.subarray(0, 8).toString("hex") !== sig) {
    throw new Error("not a PNG");
  }
  let width, height, depth, colorType, interlace;
  let palette = null;
  let trns = null;
  const idat = [];
  for (let off = 8; off < buf.length; ) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("latin1", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "PLTE") {
      palette = data;
    } else if (type === "tRNS") {
      trns = data;
    } else if (type === "IDAT") {
      idat.push(data);
    }
    off += 12 + len;
  }
  if (interlace) {
    throw new Error("interlaced PNG not supported");
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (depth === 16 || (depth < 8 && colorType !== 3 && colorType !== 0)) {
    throw new Error(`unsupported PNG depth ${depth} / type ${colorType}`);
  }
  const bitsPerPixel = channels * depth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const bpp = Math.max(1, bitsPerPixel >> 3);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const rows = [];
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1);
    const filter = raw[start];
    const line = Buffer.from(raw.subarray(start + 1, start + 1 + stride));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = v & 0xff;
    }
    rows.push(line);
    prev = line;
  }

  const rgba = Buffer.alloc(width * height * 4);
  const sample = (line, x) => {
    if (depth === 8) return line[x];
    const perByte = 8 / depth;
    const byte = line[Math.floor(x / perByte)];
    const shift = 8 - depth * ((x % perByte) + 1);
    return (byte >> shift) & ((1 << depth) - 1);
  };
  for (let y = 0; y < height; y++) {
    const line = rows[y];
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (colorType === 3) {
        const idx = sample(line, x);
        rgba[o] = palette[idx * 3];
        rgba[o + 1] = palette[idx * 3 + 1];
        rgba[o + 2] = palette[idx * 3 + 2];
        rgba[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
      } else if (colorType === 0) {
        const g = depth === 8 ? line[x] : Math.round((sample(line, x) * 255) / ((1 << depth) - 1));
        rgba.fill(g, o, o + 3);
        rgba[o + 3] = 255;
      } else if (colorType === 4) {
        rgba.fill(line[x * 2], o, o + 3);
        rgba[o + 3] = line[x * 2 + 1];
      } else if (colorType === 2) {
        line.copy(rgba, o, x * 3, x * 3 + 3);
        rgba[o + 3] = 255;
      } else {
        line.copy(rgba, o, x * 4, x * 4 + 4);
      }
    }
  }
  return { width, height, rgba };
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng({ width, height, rgba }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function gradient(t) {
  const stops = TIN_PALETTE.map(hexToRgb);
  const f = Math.min(0.9999, Math.max(0, t)) * (stops.length - 1);
  const i = Math.floor(f);
  const k = f - i;
  return stops[i].map((v, c) => Math.round(v + (stops[i + 1][c] - v) * k));
}

const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const saturation = (r, g, b) => {
  const max = Math.max(r, g, b);
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
};

function recolor(img, recolorAll) {
  const { rgba } = img;
  const specks = [];
  for (let o = 0; o < rgba.length; o += 4) {
    if (rgba[o + 3] === 0) continue;
    const [r, g, b] = [rgba[o], rgba[o + 1], rgba[o + 2]];
    if (recolorAll || saturation(r, g, b) > SPECK_SATURATION) {
      specks.push([o, luma(r, g, b)]);
    }
  }
  const ls = specks.map(([, l]) => l);
  const lo = Math.min(...ls);
  const hi = Math.max(...ls);
  for (const [o, l] of specks) {
    const [r, g, b] = gradient(hi > lo ? (l - lo) / (hi - lo) : 0.5);
    rgba[o] = r;
    rgba[o + 1] = g;
    rgba[o + 2] = b;
  }
  return specks.length;
}

async function load(job) {
  if (job.local) {
    return fs.readFileSync(path.join(RP, job.from));
  }
  const res = await fetch(`${SOURCE}/${job.from}`);
  if (!res.ok) {
    throw new Error(`${job.from}: HTTP ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

for (const job of JOBS) {
  const img = decodePng(await load(job));
  const n = recolor(img, job.recolorAll);
  const png = encodePng(img);
  for (const target of job.to) {
    const file = path.join(RP, target);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, png);
  }
  console.log(`${job.from} (${img.width}x${img.height}, ${n} px recolored) -> ${job.to.join(", ")}`);
}
