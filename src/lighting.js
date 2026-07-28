import { isSolid } from './world.js';

// ---------- Block-light propagation (Minecraft-style) ----------
// Discrete light levels, not real-time point lights. A source (torch) emits
// level 14; light flood-fills outward through open air, losing 1 per block,
// same as Minecraft's own lighting engine. meshBuilder.js reads these
// levels to decide which blocks render via the always-bright "lit" material
// bucket instead of the normal day/night-responsive one. This sidesteps
// relying on the WebGL renderer's dynamic PointLight behavior, which
// repeatedly failed to visibly light nearby blocks despite correct-looking
// intensity/decay math -- baking the result ourselves guarantees it works.

export const MAX_LIGHT = 14;

const sources = new Map();      // "x,y,z" -> base level
const lightLevels = new Map();  // "x,y,z" -> propagated level (only non-zero cells stored)

export function addLightSource(x, y, z, level = MAX_LIGHT) {
  sources.set(x + ',' + y + ',' + z, level);
  recomputeLighting();
}

export function removeLightSource(x, y, z) {
  sources.delete(x + ',' + y + ',' + z);
  recomputeLighting();
}

// Full BFS flood-fill from every active source. Bounded by MAX_LIGHT steps
// per source (14 blocks out), NOT by total world size -- cheap even with
// several torches placed.
export function recomputeLighting() {
  lightLevels.clear();
  const queue = [];
  for (const [k, level] of sources) {
    lightLevels.set(k, level);
    queue.push(k);
  }

  let head = 0;
  while (head < queue.length) {
    const k = queue[head++];
    const level = lightLevels.get(k);
    if (level <= 1) continue;

    const commaA = k.indexOf(',');
    const commaB = k.indexOf(',', commaA + 1);
    const x = +k.slice(0, commaA);
    const y = +k.slice(commaA + 1, commaB);
    const z = +k.slice(commaB + 1);
    const next = level - 1;

    const neighbors = [
      [x + 1, y, z], [x - 1, y, z],
      [x, y + 1, z], [x, y - 1, z],
      [x, y, z + 1], [x, y, z - 1]
    ];
    for (const [nx, ny, nz] of neighbors) {
      if (isSolid(nx, ny, nz)) continue; // light doesn't pass through solid blocks
      const nk = nx + ',' + ny + ',' + nz;
      if ((lightLevels.get(nk) || 0) < next) {
        lightLevels.set(nk, next);
        queue.push(nk);
      }
    }
  }
}

// Light level touching a SOLID block -- the max level among its neighboring
// (open) cells, since light lives in the space next to a block and
// illuminates the face touching it. Also checks its own cell, so the torch
// block itself (the source) reads as fully lit too.
export function getBlockLight(x, y, z) {
  let max = lightLevels.get(x + ',' + y + ',' + z) || 0;
  const neighbors = [
    [x + 1, y, z], [x - 1, y, z],
    [x, y + 1, z], [x, y - 1, z],
    [x, y, z + 1], [x, y, z - 1]
  ];
  for (const [nx, ny, nz] of neighbors) {
    const l = lightLevels.get(nx + ',' + ny + ',' + nz) || 0;
    if (l > max) max = l;
  }
  return max;
}

// Cheap check used before bothering to recompute after an ORDINARY block
// edit (not a light source itself) -- e.g. placing a wall next to a torch,
// or digging one open. Skips all lighting work entirely if nothing edited
// is anywhere near an active source.
export function isNearAnySource(x, y, z, radius = MAX_LIGHT) {
  for (const k of sources.keys()) {
    const commaA = k.indexOf(',');
    const commaB = k.indexOf(',', commaA + 1);
    const sx = +k.slice(0, commaA), sy = +k.slice(commaA + 1, commaB), sz = +k.slice(commaB + 1);
    if (Math.abs(sx - x) <= radius && Math.abs(sy - y) <= radius && Math.abs(sz - z) <= radius) return true;
  }
  return false;
}

export function clearLighting() {
  sources.clear();
  lightLevels.clear();
}