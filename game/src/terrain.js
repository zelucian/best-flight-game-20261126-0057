// The Alder Valley: a procedural heightfield with a winding river, patchwork fields,
// forest, a flat grass runway at the origin, and the six courier rings of the course.
// Everything here is a pure function of position, so the terrain never changes shape.

import { RINGS, RUNWAY, PALETTE } from './config.js';
import { clamp, createRandom, fbmNoise, hash2 } from './random.js';

/** The river's centreline wanders east and west as it runs down the valley. */
export function riverCenter(z) {
  return 190 * Math.sin(z * 0.0011 + 1.7) + 120 * Math.sin(z * 0.0029 + 0.4) + 260;
}

/** True when the point lies on the home runway's flat strip. */
export function isOnRunway(x, z) {
  return Math.abs(x - RUNWAY.x) <= RUNWAY.width / 2 && z >= RUNWAY.zStart && z <= RUNWAY.zEnd;
}

/** True when the point lies in the river. */
export function isInRiver(x, z) {
  return Math.abs(x - riverCenter(z)) < 26;
}

function runwayBlend(x, z) {
  // 1 on the strip, fading to 0 within 90 ft of its edge, so the ground flattens for it.
  const dx = Math.abs(x - RUNWAY.x) - RUNWAY.width / 2;
  const dz = z < RUNWAY.zStart ? RUNWAY.zStart - z : z > RUNWAY.zEnd ? z - RUNWAY.zEnd : 0;
  const distance = Math.max(dx, dz);
  return clamp(1 - distance / 90, 0, 1);
}

/** Ground height in feet at (x, z). The runway sits at height 2; the riverbed dips below 0. */
export function heightAt(x, z) {
  let height = fbmNoise(x * 0.0042, z * 0.0042, 11) * 34 + fbmNoise(x * 0.013, z * 0.013, 23) * 12;
  height -= 14;
  // The valley walls rise steeply far east and west, beyond the flown valley floor.
  const wall = Math.max(0, Math.abs(x) - 1400) / 300;
  height += wall * wall * 130;
  // The river carves a shallow channel.
  const riverDistance = Math.abs(x - riverCenter(z));
  if (riverDistance < 60) height -= (1 - riverDistance / 60) * 16;
  // Blend down to the runway's flat strip.
  return height * (1 - runwayBlend(x, z)) + 2 * runwayBlend(x, z);
}

/** The colour of the ground at (x, z, height): fields, forest, river, runway or sand. */
export function groundColor(x, z, height) {
  if (isOnRunway(x, z)) return PALETTE.runway;
  if (isInRiver(x, z)) return PALETTE.river;
  if (Math.abs(x - riverCenter(z)) < 38) return PALETTE.riverBank;
  if (height > 52) return '#8a7f72';
  const cellX = Math.floor(x / 170);
  const cellZ = Math.floor(z / 170);
  const pick = hash2(cellX, cellZ, 41);
  if (pick < 0.16) return PALETTE.forest;
  if (pick < 0.30) return PALETTE.wheat;
  if (pick < 0.52) return PALETTE.fieldLight;
  if (pick < 0.78) return PALETTE.fieldGreen;
  return PALETTE.fieldDark;
}

/** A drifting cloud puff: a fixed world position, size and drift speed. */
export function buildClouds(seed) {
  const random = createRandom(seed);
  const clouds = [];
  for (let index = 0; index < 26; index += 1) {
    clouds.push({
      x: (random() - 0.5) * 5200,
      y: 520 + random() * 320,
      z: -600 + random() * 5200,
      radius: 90 + random() * 150,
      drift: 4 + random() * 7,
    });
  }
  return clouds;
}

/** The course: the rings in order, each with its collected / missed state. */
export function buildCourse() {
  return RINGS.map((ring) => ({ ...ring, collected: false, missed: false }));
}

/** The next ring still to fly through, or null once the course is done. */
export function nextRing(course) {
  for (const ring of course) {
    if (!ring.collected && !ring.missed) return ring;
  }
  return null;
}

/** How many rings the pilot has collected. */
export function ringsCollected(course) {
  return course.filter((ring) => ring.collected).length;
}
