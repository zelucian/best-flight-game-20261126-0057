// The flight model: a forgiving arcade envelope with a real stall, fuel that runs out,
// banked turns, ring gates and a runway that only forgives a gentle touchdown. The same
// step function drives both the player's game and the screenshot autopilot.

import { FUEL, PLANE, RUNWAY, SCORE, STEP } from './config.js';
import { angleDifference, clamp } from './random.js';
import { buildCourse, heightAt, isOnRunway, nextRing, ringsCollected } from './terrain.js';

export const EVENT_NONE = 0;
export const EVENT_RING = 1;
export const EVENT_MISSED = 2;
export const EVENT_LANDED = 4;
export const EVENT_CRASHED = 8;
export const EVENT_FUEL_LOW = 16;

export const STATUS_TITLE = 'title';
export const STATUS_FLYING = 'flying';
export const STATUS_LANDED = 'landed';
export const STATUS_CRASHED = 'crashed';

/** A fresh sortie: the plane parked at the runway threshold, engine idling. */
export function createFlight() {
  return {
    status: STATUS_TITLE,
    plane: {
      x: RUNWAY.x,
      y: heightAt(RUNWAY.x, 0) + 3,
      z: 20,
      heading: 0,
      pitch: 0,
      bank: 0,
      speed: 0,
      verticalSpeed: 0,
      throttle: 0,
      fuel: FUEL.start,
      airborne: false,
    },
    course: buildCourse(),
    score: 0,
    time: 0,
    message: '',
    messageTime: 0,
    landingQuality: '',
    fuelLowAnnounced: false,
    /** The screenshot autopilot's phase: takeoff, course, return, final. */
    autopilotPhase: 'takeoff',
    autopilotGoArounds: 0,
  };
}

/** Reset a flight to a fresh sortie. */
export function resetFlight(flight) {
  const fresh = createFlight();
  Object.assign(flight, fresh);
}

/** The steering a pilot (or the autopilot) hands the model each step. */
export function emptyControls() {
  return { pitch: 0, bank: 0, throttleDelta: 0, throttleSet: null, rudder: 0 };
}

function landPlane(flight, quality) {
  const plane = flight.plane;
  flight.status = STATUS_LANDED;
  flight.landingQuality = quality;
  plane.speed = 0;
  plane.verticalSpeed = 0;
  plane.pitch = 0;
  plane.bank = 0;
  const collected = ringsCollected(flight.course);
  const fuelBonus = Math.round(plane.fuel) * SCORE.fuelBonusPerUnit;
  const timeBonus = Math.max(0, Math.round(300 - flight.time)) * SCORE.timeBonusPerSecond;
  const landingBonus = collected === flight.course.length ? SCORE.landing + fuelBonus + timeBonus : 0;
  flight.score += landingBonus;
  flight.message =
    collected === flight.course.length
      ? `DELIVERED! All ${collected} rings + landing bonus ${landingBonus}`
      : `Landed early — ${collected}/${flight.course.length} rings. Sortie over.`;
  flight.messageTime = 6;
}

function crashPlane(flight, reason) {
  flight.status = STATUS_CRASHED;
  flight.message = reason;
  flight.messageTime = 6;
  flight.plane.speed = 0;
  flight.plane.verticalSpeed = 0;
}

/**
 * Advance the flight one fixed step. `controls` carries pitch and bank targets in [-1, 1],
 * a throttle change, an optional absolute throttle, and a rudder in [-1, 1]. Returns an
 * event bitmask (EVENT_RING when a ring is flown through, and so on).
 */
export function stepFlight(flight, controls, dt = STEP) {
  const plane = flight.plane;
  let events = EVENT_NONE;
  if (flight.status !== STATUS_FLYING) return events;
  flight.time += dt;

  // Throttle: keys nudge it, the autopilot sets it outright, fuel caps it at zero.
  if (controls.throttleSet !== null && controls.throttleSet !== undefined) {
    plane.throttle = clamp(controls.throttleSet, 0, 1);
  } else {
    plane.throttle = clamp(plane.throttle + controls.throttleDelta * dt, 0, 1);
  }
  const effectiveThrottle = plane.fuel > 0 ? plane.throttle : 0;
  if (plane.fuel > 0) {
    plane.fuel = Math.max(0, plane.fuel - FUEL.drainPerSecond * (0.25 + effectiveThrottle) * dt);
    if (plane.fuel <= FUEL.lowWarning && !flight.fuelLowAnnounced) {
      flight.fuelLowAnnounced = true;
      events |= EVENT_FUEL_LOW;
      flight.message = 'FUEL LOW — head for the runway';
      flight.messageTime = 4;
    }
  }

  // Speed chases the throttle's target; a stalled wing drags it down further.
  const targetSpeed = PLANE.minSpeed + effectiveThrottle * (PLANE.maxSpeed - PLANE.minSpeed);
  plane.speed += (targetSpeed - plane.speed) * Math.min(1, PLANE.speedResponse * dt);
  const stalled = plane.speed < PLANE.stallSpeed && plane.y > heightAt(plane.x, plane.z) + 4;

  // Attitude follows the controls at a fixed rate, so the plane never snaps.
  const pitchTarget = controls.pitch * PLANE.maxPitch;
  const bankTarget = controls.bank * PLANE.maxBank;
  const pitchStep = PLANE.pitchRate * dt;
  const bankStep = PLANE.bankRate * dt;
  plane.pitch += clamp(pitchTarget - plane.pitch, -pitchStep, pitchStep);
  plane.bank += clamp(bankTarget - plane.bank, -bankStep, bankStep);

  // A banked wing turns the nose: banking right (positive bank) turns right, so the
  // wings tip the same way the nose swings — as a pilot expects.
  plane.heading += (plane.bank * PLANE.turnRate * (plane.speed / PLANE.maxSpeed) + controls.rudder * 0.12) * dt;

  // Climb comes from pitch and speed; a stalled wing sinks instead.
  const sink = stalled ? PLANE.stallSink * (1 - plane.speed / PLANE.stallSpeed) : 0;
  plane.verticalSpeed = plane.speed * Math.sin(plane.pitch) - sink;
  plane.x += Math.sin(plane.heading) * plane.speed * dt;
  plane.z += Math.cos(plane.heading) * plane.speed * dt;
  plane.y += plane.verticalSpeed * dt;
  if (plane.y > PLANE.ceiling) {
    plane.y = PLANE.ceiling;
    plane.pitch = Math.min(plane.pitch, 0);
  }
  plane.airborne = plane.y > heightAt(plane.x, plane.z) + 6;

  // Ring gates: flying through the hoop scores; flying past it misses it.
  for (const ring of flight.course) {
    if (ring.collected || ring.missed) continue;
    const dz = plane.z - ring.z;
    if (Math.abs(dz) < 28) {
      const dx = plane.x - ring.x;
      const dy = plane.y - ring.y;
      if (dx * dx + dy * dy < ring.radius * ring.radius) {
        ring.collected = true;
        flight.score += SCORE.ring;
        events |= EVENT_RING;
        const count = ringsCollected(flight.course);
        flight.message =
          count === flight.course.length
            ? 'All rings collected — turn for home, land on the runway!'
            : `Ring ${count}/${flight.course.length} — +${SCORE.ring}`;
        flight.messageTime = 3;
      }
    } else if (dz > 28) {
      ring.missed = true;
      events |= EVENT_MISSED;
      flight.message = `Ring missed — ${ringsCollected(flight.course)}/${flight.course.length} collected`;
      flight.messageTime = 3;
    }
  }

  // The ground: a gentle touchdown on the runway lands; anything else is a crash.
  const ground = heightAt(plane.x, plane.z);
  if (plane.y <= ground + 2) {
    plane.y = ground + 2;
    const onStrip = isOnRunway(plane.x, plane.z);
    const gentle = Math.abs(plane.verticalSpeed) < 26 && plane.speed < 205 && Math.abs(plane.bank) < 0.4;
    if (onStrip && gentle) {
      landPlane(flight, 'smooth');
      events |= EVENT_LANDED;
    } else if (onStrip && plane.speed > 205) {
      crashPlane(flight, 'Too fast for the strip — the courier overshot and broke up.');
      events |= EVENT_CRASHED;
    } else if (Math.abs(plane.verticalSpeed) >= 26) {
      crashPlane(flight, 'Crashed into the valley floor — mind your sink rate on approach.');
      events |= EVENT_CRASHED;
    } else {
      crashPlane(flight, 'Forced landing in the fields — the courier never made the runway.');
      events |= EVENT_CRASHED;
    }
  }

  if (flight.messageTime > 0) flight.messageTime -= dt;
  return events;
}

/**
 * The screenshot autopilot: take off, steer through the rings, then fly a proper return
 * pattern — downwind, lined up on the runway from the north — and land on a gentle glide
 * slope. It flies the same controls a player has, so its frames are real gameplay.
 * A botched final goes around and tries the pattern again instead of circling the valley.
 */
export function autopilotControls(flight) {
  const plane = flight.plane;
  const controls = emptyControls();
  const ring = nextRing(flight.course);
  const ground = heightAt(plane.x, plane.z);

  if (flight.autopilotPhase === 'takeoff') {
    // Takeoff roll: full throttle, rotate once the wing bites, then join the course.
    controls.throttleSet = 1;
    controls.pitch = plane.speed > 105 ? 1 : 0;
    if (plane.airborne && plane.speed > 120) flight.autopilotPhase = 'course';
    return controls;
  }
  if (ring) flight.autopilotPhase = 'course';
  else if (flight.autopilotPhase === 'course') flight.autopilotPhase = 'return';

  let targetX;
  let targetY;
  let targetZ;
  let cruiseThrottle = 0.8;
  let pitchGain = 120;
  let pitchLimit = 1;
  if (flight.autopilotPhase === 'course') {
    targetX = ring.x;
    targetY = ring.y;
    targetZ = ring.z;
  } else if (flight.autopilotPhase === 'return') {
    // Downwind entry north of the runway: fly south through the z = 2700 gate, lined up.
    targetX = 0;
    targetY = 200;
    targetZ = 2600;
    cruiseThrottle = 0.65;
    const headingSouth = Math.abs(angleDifference(plane.heading, Math.PI)) < 0.6;
    const distance = Math.hypot(plane.x - targetX, plane.z - targetZ);
    if ((plane.z <= 2700 && headingSouth) || distance < 200) {
      flight.autopilotPhase = 'base';
    }
  } else if (flight.autopilotPhase === 'base') {
    // Base leg: converge on the centreline, still heading south, then join the final.
    targetX = 0;
    targetY = 120;
    targetZ = 1600;
    cruiseThrottle = 0.6;
    const headingSouth = Math.abs(angleDifference(plane.heading, Math.PI)) < 0.6;
    const distance = Math.hypot(plane.x - targetX, plane.z - targetZ);
    if ((plane.z <= 1700 && headingSouth && Math.abs(plane.x) < 200) || distance < 200) {
      flight.autopilotPhase = 'final';
    }
  } else {
    // Final approach: a gentle glide slope down to the touchdown point, measured from the
    // runway's own height — the valley floor beside it is higher and must not lift the slope.
    // Steer at a point beyond the runway's far end, so the heading stays south straight
    // through the touchdown instead of flipping around once the touchdown point is passed.
    const distanceToTouchdown = Math.max(0, plane.z - 150);
    targetX = 0;
    targetY = 6 + distanceToTouchdown * 0.07;
    targetZ = -400;
    cruiseThrottle = plane.speed > 160 ? 0.25 : 0.45;
    pitchGain = 100;
    pitchLimit = 0.5;
    // Past the runway's near end without touching down: go around and fly the pattern again.
    if ((plane.z < -40 && plane.airborne) || Math.abs(plane.x) > 160) {
      flight.autopilotPhase = 'return';
      flight.autopilotGoArounds += 1;
    }
  }

  // Steer: bank toward the bearing of the target, pitch toward its height.
  const dx = targetX - plane.x;
  const dz = targetZ - plane.z;
  const wantedHeading = Math.atan2(dx, dz);
  const headingError = angleDifference(plane.heading, wantedHeading);
  controls.bank = clamp(headingError * 2.0, -1, 1);
  const altitudeError = targetY - plane.y;
  controls.pitch = clamp(altitudeError / pitchGain, -pitchLimit, pitchLimit);
  // Feedforward on final: holding the glide slope already needs a nose-down pitch, so the
  // proportional loop alone would fly a constant height above the slope and run out of runway.
  if (flight.autopilotPhase === 'final') {
    controls.pitch = clamp(controls.pitch - 0.14, -pitchLimit, pitchLimit);
  }
  controls.throttleSet = cruiseThrottle;
  // Never scrape the valley floor on the way out — but not on final, where the runway is.
  // (No flare is needed: the glide slope itself brings the plane down at about 10 ft/s.)
  if (flight.autopilotPhase !== 'final' && plane.y < ground + 40 && plane.airborne) {
    controls.pitch = Math.max(controls.pitch, 0.25);
  }
  return controls;
}
