// A tiny seeded random source: mulberry32 plus a smooth value-noise field, so the valley,
// the clouds and every screenshot scene are the same for the same seed, run after run.

/** A fast seeded generator returning numbers in [0, 1). */
export function createRandom(seed) {
  let state = seed >>> 0;
  return function nextRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** A deterministic 2D hash in [0, 1) for integer lattice points. */
export function hash2(ix, iz, seed) {
  let value = (ix * 374761393 + iz * 668265263 + seed * 974634211) | 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

/** Smooth value noise in [0, 1), continuous across the plane. */
export function valueNoise(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smooth(x - ix);
  const fz = smooth(z - iz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

/** Two octaves of value noise, in roughly [0, 1]. */
export function fbmNoise(x, z, seed) {
  return valueNoise(x, z, seed) * 0.65 + valueNoise(x * 2.13 + 7.7, z * 2.13 + 3.1, seed + 5) * 0.35;
}

/** Clamp a number into [min, max]. */
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** The shortest signed turn from `from` to `to`, in (-PI, PI]. */
export function angleDifference(from, to) {
  let diff = (to - from) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff <= -Math.PI) diff += Math.PI * 2;
  return diff;
}
