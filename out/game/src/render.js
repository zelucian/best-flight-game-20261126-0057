// The painter: a pseudo-3D chase view over the valley — sky, sun and mountain ridges,
// a projected terrain grid, the runway and its markings, the courier rings, the plane
// itself, and a lit instrument HUD — plus the title, pause, landing and crash screens.
// Everything is drawn from the flight state, so a screenshot is exactly what a player sees.

import { GAME_SUBTITLE, GAME_TITLE, PALETTE, PLANE, RUNWAY, VIEW, FONT, FONT_MONO } from './config.js';
import { clamp } from './random.js';
import { buildClouds, groundColor, heightAt, isOnRunway, nextRing, ringsCollected, riverCenter } from './terrain.js';
import { STATUS_CRASHED, STATUS_LANDED } from './flight.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_LANDED = 'landed';

/** Camera chase distance behind the plane, and height above it, in feet. */
const CAMERA_BEHIND = 42;
const CAMERA_ABOVE = 6;
/** The camera's field of view, in radians. */
const FOV = (68 * Math.PI) / 180;
/** Terrain grid rows: distance ahead of the camera, in feet. */
const GRID_ROWS = [35, 60, 95, 140, 200, 280, 390, 530, 710, 950, 1260, 1650];
const GRID_COLUMNS = 12;

const CLOUDS = buildClouds(1337);

/** The sun sits north-west, about 26 degrees up. */
const SUN_DIRECTION = { x: -0.58, y: 0.44, z: 0.69 };

function headingToDegrees(heading) {
  const degrees = (heading * 180) / Math.PI;
  return ((degrees % 360) + 360) % 360;
}

/** Darken or lighten a #rrggbb colour by a factor (1 keeps it, 0.8 darkens by a fifth). */
function shadeHex(hex, factor) {
  const red = Math.round(parseInt(hex.slice(1, 3), 16) * factor);
  const green = Math.round(parseInt(hex.slice(3, 5), 16) * factor);
  const blue = Math.round(parseInt(hex.slice(5, 7), 16) * factor);
  return `rgb(${red}, ${green}, ${blue})`;
}

/** Clamp a projected point to just outside the viewport, so a quad with a corner far off
 * screen never paints as a giant polygon across the sky. */
function clampToViewport(point) {
  return {
    x: Math.max(-160, Math.min(VIEW.width + 160, point.x)),
    y: Math.max(-160, Math.min(VIEW.height + 160, point.y)),
    distance: point.distance,
  };
}

function compassLabel(degrees) {
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return points[Math.round(degrees / 45) % 8];
}

export function createRenderer(canvas) {
  canvas.width = VIEW.width;
  canvas.height = VIEW.height;
  const ctx = canvas.getContext('2d');
  const focal = VIEW.height / 2 / Math.tan(FOV / 2);
  const centreX = VIEW.width / 2;
  const centreY = VIEW.height / 2;

  /** The camera for this frame, chasing the plane. */
  function cameraFor(plane) {
    const sinH = Math.sin(plane.heading);
    const cosH = Math.cos(plane.heading);
    return {
      x: plane.x - sinH * CAMERA_BEHIND,
      y: plane.y + CAMERA_ABOVE,
      z: plane.z - cosH * CAMERA_BEHIND,
      heading: plane.heading,
      pitch: plane.pitch * 0.55 + 0.02,
      bank: plane.bank * 0.9,
      sinH,
      cosH,
    };
  }

  /** Project a world point to screen space; null when behind the camera. */
  function project(camera, x, y, z) {
    const relX = x - camera.x;
    const relY = y - camera.y;
    const relZ = z - camera.z;
    // Camera basis: forward along the heading, right across it, up against gravity.
    const forwardX = camera.sinH;
    const forwardZ = camera.cosH;
    const fwd = relX * forwardX + relZ * forwardZ;
    if (fwd < 4) return null;
    const rgt = relX * forwardZ - relZ * forwardX;
    const sinP = Math.sin(camera.pitch);
    const cosP = Math.cos(camera.pitch);
    const up = relY;
    const fwdP = fwd * cosP + up * sinP;
    const upP = -fwd * sinP + up * cosP;
    // Roll the view: banking right tips the world counter-clockwise.
    const sinB = Math.sin(camera.bank);
    const cosB = Math.cos(camera.bank);
    const rgtR = rgt * cosB - upP * sinB;
    const upR = rgt * sinB + upP * cosB;
    return {
      x: centreX + (focal * rgtR) / fwdP,
      y: centreY - (focal * upR) / fwdP,
      distance: fwdP,
    };
  }

  /** A point ahead of the camera along its heading, at a lateral offset. */
  function aheadPoint(camera, distance, lateral, height) {
    return {
      x: camera.x + camera.sinH * distance + camera.cosH * lateral,
      y: height,
      z: camera.z + camera.cosH * distance - camera.sinH * lateral,
    };
  }

  function drawSky(camera, plane) {
    const gradient = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    gradient.addColorStop(0, PALETTE.skyTop);
    gradient.addColorStop(0.45, PALETTE.skyMid);
    gradient.addColorStop(0.62, PALETTE.skyHorizon);
    gradient.addColorStop(1, '#9db98a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);

    // The sun, glowing where it sits in the sky.
    const sun = project(camera, camera.x + SUN_DIRECTION.x * 6000, camera.y + SUN_DIRECTION.y * 6000, camera.z + SUN_DIRECTION.z * 6000);
    if (sun) {
      const glow = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 130);
      glow.addColorStop(0, PALETTE.sunGlow);
      glow.addColorStop(1, 'rgba(255, 236, 170, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sun.x - 130, sun.y - 130, 260, 260);
      ctx.fillStyle = PALETTE.sun;
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, 30, 0, Math.PI * 2);
      ctx.fill();
    }

    // Two mountain ridges on the horizon, far and near.
    drawRidge(camera, 5200, 300, 420, PALETTE.mountainFar);
    drawRidge(camera, 3400, 180, 300, PALETTE.mountainNear);
    void plane;
  }

  function drawRidge(camera, distance, baseHeight, variation, colour) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    let started = false;
    let firstX = 0;
    let firstY = 0;
    let lastX = 0;
    let lastY = 0;
    for (let lateral = -5200; lateral <= 5200; lateral += 260) {
      const peak = baseHeight + Math.abs(Math.sin(lateral * 0.0011 + distance)) * variation;
      const point = aheadPoint(camera, distance, lateral, peak);
      const projected = project(camera, point.x, point.y, point.z);
      const ground = aheadPoint(camera, distance, lateral, 0);
      const groundProjected = project(camera, ground.x, ground.y, ground.z);
      if (!projected || !groundProjected) continue;
      const top = clampToViewport(projected);
      const bottom = clampToViewport(groundProjected);
      if (!started) {
        ctx.moveTo(top.x, bottom.y);
        ctx.lineTo(top.x, top.y);
        firstX = top.x;
        firstY = bottom.y;
        started = true;
      } else {
        ctx.lineTo(top.x, top.y);
      }
      lastX = top.x;
      lastY = bottom.y;
    }
    if (!started) return;
    ctx.lineTo(lastX, lastY);
    ctx.lineTo(firstX, firstY);
    ctx.closePath();
    ctx.fill();
  }

  function drawGroundBase(camera) {
    // A dark ground plane under the horizon line, so no gap of sky ever shows below it
    // where the terrain grid runs out at the screen's edges.
    const left = aheadPoint(camera, 3000, -3200, 0);
    const right = aheadPoint(camera, 3000, 3200, 0);
    const leftProjected = project(camera, left.x, left.y, left.z);
    const rightProjected = project(camera, right.x, right.y, right.z);
    if (!leftProjected || !rightProjected) return;
    ctx.fillStyle = '#3d6b34';
    ctx.beginPath();
    ctx.moveTo(-20, leftProjected.y);
    ctx.lineTo(VIEW.width + 20, rightProjected.y);
    ctx.lineTo(VIEW.width + 20, VIEW.height + 20);
    ctx.lineTo(-20, VIEW.height + 20);
    ctx.closePath();
    ctx.fill();
  }

  function drawTerrain(camera, time) {
    drawGroundBase(camera);
    // Rows far to near, so near ground overdraws far ground.
    for (let row = GRID_ROWS.length - 1; row >= 0; row -= 1) {
      const near = GRID_ROWS[row];
      const far = row + 1 < GRID_ROWS.length ? GRID_ROWS[row + 1] : near + 420;
      const halfWidth = Math.min(near * 1.05 + 140, 1250);
      const step = (halfWidth * 2) / GRID_COLUMNS;
      for (let column = 0; column < GRID_COLUMNS; column += 1) {
        const left = -halfWidth + column * step;
        const right = left + step;
        const corners = [];
        const heights = [];
        let visible = true;
        for (const [distance, lateral] of [[near, left], [near, right], [far, right], [far, left]]) {
          const point = aheadPoint(camera, distance, lateral, 0);
          const groundY = heightAt(point.x, point.z);
          const projected = project(camera, point.x, groundY, point.z);
          if (!projected) {
            visible = false;
            break;
          }
          corners.push(clampToViewport(projected));
          heights.push(groundY);
        }
        if (!visible) continue;
        const centre = aheadPoint(camera, (near + far) / 2, (left + right) / 2, 0);
        const centreHeight = heightAt(centre.x, centre.z);
        // Shade steep ground darker, so hills read as hills instead of flat cardboard.
        const slope = Math.max(...heights) - Math.min(...heights);
        const shade = clamp(1 - slope * 0.006, 0.8, 1);
        ctx.fillStyle = shadeHex(groundColor(centre.x, centre.z, centreHeight), shade);
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let index = 1; index < 4; index += 1) ctx.lineTo(corners[index].x, corners[index].y);
        ctx.closePath();
        ctx.fill();
      }
    }
    void time;
  }

  function drawClouds(camera, time) {
    for (const cloud of CLOUDS) {
      const driftedX = cloud.x + ((time * cloud.drift) % 5200) - 2600;
      const projected = project(camera, driftedX, cloud.y, cloud.z);
      if (!projected || projected.distance < 60) continue;
      const scale = focal / projected.distance;
      const radius = cloud.radius * scale;
      if (radius < 3 || projected.x < -radius || projected.x > VIEW.width + radius) continue;
      ctx.fillStyle = PALETTE.cloud;
      ctx.globalAlpha = 0.9;
      for (const [offsetX, offsetY, factor] of [[-0.5, 0.1, 0.55], [0, -0.12, 0.7], [0.5, 0.08, 0.5], [0.15, 0.18, 0.6]]) {
        ctx.beginPath();
        ctx.ellipse(projected.x + offsetX * radius, projected.y + offsetY * radius, radius * factor, radius * factor * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawRunwayMarkings(camera) {
    // Centreline dashes and edge lines, drawn over the strip.
    ctx.strokeStyle = PALETTE.runwayLine;
    ctx.lineCap = 'round';
    for (let z = RUNWAY.zStart + 20; z < RUNWAY.zEnd - 10; z += 46) {
      const rawA = project(camera, RUNWAY.x, 3, z);
      const rawB = project(camera, RUNWAY.x, 3, z + 22);
      if (!rawA || !rawB) continue;
      const a = clampToViewport(rawA);
      const b = clampToViewport(rawB);
      ctx.lineWidth = Math.max(1.5, 900 / a.distance);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.lineWidth = 2;
    for (const edge of [-RUNWAY.width / 2 + 1.5, RUNWAY.width / 2 - 1.5]) {
      ctx.beginPath();
      let started = false;
      for (let z = RUNWAY.zStart; z <= RUNWAY.zEnd; z += 30) {
        const rawPoint = project(camera, RUNWAY.x + edge, 3, z);
        if (!rawPoint) continue;
        const point = clampToViewport(rawPoint);
        if (!started) {
          ctx.moveTo(point.x, point.y);
          started = true;
        } else ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
    }
    // Threshold bars at both ends.
    for (const z of [RUNWAY.zStart + 4, RUNWAY.zEnd - 4]) {
      const rawA = project(camera, RUNWAY.x - 12, 3, z);
      const rawB = project(camera, RUNWAY.x + 12, 3, z);
      if (!rawA || !rawB) continue;
      const a = clampToViewport(rawA);
      const b = clampToViewport(rawB);
      ctx.lineWidth = Math.max(2, 1100 / a.distance);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  function drawRing(camera, ring, index, isNext, time, showLabel) {
    const projected = project(camera, ring.x, ring.y, ring.z);
    if (!projected || projected.distance < 20) return;
    const radius = (focal * ring.radius) / projected.distance;
    if (radius < 2) return;
    const forwardX = camera.sinH;
    const forwardZ = camera.cosH;
    const squash = clamp(Math.abs(forwardZ), 0.3, 1);
    void forwardX;
    ctx.save();
    ctx.translate(projected.x, projected.y);
    ctx.scale(squash, 1);
    if (isNext) {
      const pulse = 1 + 0.08 * Math.sin(time * 5);
      ctx.strokeStyle = 'rgba(255, 180, 0, 0.35)';
      ctx.lineWidth = 14 * pulse;
      ctx.beginPath();
      ctx.arc(0, 0, radius * pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Rings further down the course are drawn faint, so the valley does not fill with
    // bubbles: only the next ring reads as a gate to fly through.
    if (!isNext) ctx.globalAlpha = 0.45;
    ctx.strokeStyle = ring.collected ? PALETTE.ringCollected : PALETTE.ring;
    ctx.lineWidth = Math.max(2, radius * (isNext ? 0.14 : 0.08));
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
    if (isNext) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = Math.max(1.5, radius * 0.04);
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.82, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    if (showLabel && isNext && radius > 8) {
      ctx.fillStyle = PALETTE.hudAmber;
      ctx.font = `bold ${Math.max(13, Math.min(20, radius * 0.28))}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`RING ${index + 1} — ${Math.round(projected.distance)} ft`, projected.x, projected.y - radius - 12);
    }
  }

  function drawPlaneShadow(camera, plane) {
    const ground = heightAt(plane.x, plane.z);
    const projected = project(camera, plane.x, ground + 1, plane.z);
    if (!projected || projected.distance < 10) return;
    const size = clamp((focal * 26) / projected.distance, 4, 90);
    ctx.fillStyle = 'rgba(10, 20, 30, 0.35)';
    ctx.beginPath();
    ctx.ellipse(projected.x, projected.y, size, size * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** The courier plane itself, seen from the chase camera: tail, wings and lit wingtips. */
  function drawPlane(plane) {
    const x = centreX;
    const y = centreY + 88;
    const span = 330;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(plane.bank * 0.9);
    ctx.lineJoin = 'round';

    // Main wings, swept back a little, teal tips.
    ctx.fillStyle = PALETTE.planeWhite;
    ctx.strokeStyle = PALETTE.planeDark;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-span / 2, 18);
    ctx.lineTo(-34, -6);
    ctx.lineTo(34, -6);
    ctx.lineTo(span / 2, 18);
    ctx.lineTo(span / 2 - 8, 34);
    ctx.lineTo(-span / 2 + 8, 34);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PALETTE.planeTeal;
    ctx.beginPath();
    ctx.moveTo(-span / 2, 18);
    ctx.lineTo(-span / 2 + 34, 14);
    ctx.lineTo(-span / 2 + 30, 30);
    ctx.lineTo(-span / 2 + 8, 34);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(span / 2, 18);
    ctx.lineTo(span / 2 - 34, 14);
    ctx.lineTo(span / 2 - 30, 30);
    ctx.lineTo(span / 2 - 8, 34);
    ctx.closePath();
    ctx.fill();

    // Tailplane.
    ctx.fillStyle = PALETTE.planeWhite;
    ctx.beginPath();
    ctx.moveTo(-86, -72);
    ctx.lineTo(-14, -82);
    ctx.lineTo(14, -82);
    ctx.lineTo(86, -72);
    ctx.lineTo(78, -58);
    ctx.lineTo(-78, -58);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Fuselage, wider toward the viewer, with the courier's teal stripe.
    ctx.fillStyle = PALETTE.planeWhite;
    ctx.beginPath();
    ctx.moveTo(-13, -92);
    ctx.quadraticCurveTo(-26, -30, -30, 42);
    ctx.quadraticCurveTo(-30, 62, 0, 62);
    ctx.quadraticCurveTo(30, 62, 30, 42);
    ctx.quadraticCurveTo(26, -30, 13, -92);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PALETTE.planeTeal;
    ctx.fillRect(-7, -88, 14, 146);
    // Cockpit hump and rear window.
    ctx.fillStyle = '#bfe3f2';
    ctx.beginPath();
    ctx.ellipse(0, -34, 15, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.planeDark;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Tail fin, orange, with the courier's number.
    ctx.fillStyle = PALETTE.planeOrange;
    ctx.beginPath();
    ctx.moveTo(-12, -84);
    ctx.lineTo(-4, -128);
    ctx.lineTo(10, -128);
    ctx.lineTo(16, -84);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = PALETTE.planeDark;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 17px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('77', 2, -102);

    // Navigation lights: red port, green starboard, glowing.
    for (const [tipX, colour] of [[-span / 2 + 2, '#ff4d3d'], [span / 2 - 2, '#3dff7a']]) {
      const glow = ctx.createRadialGradient(tipX, 24, 1, tipX, 24, 14);
      glow.addColorStop(0, colour);
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(tipX, 24, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(tipX, 24, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function panel(x, y, width, height) {
    ctx.fillStyle = PALETTE.hudPanel;
    ctx.strokeStyle = 'rgba(141, 255, 176, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 8);
    ctx.fill();
    ctx.stroke();
  }

  function instrumentBox(x, y, label, value, unit, colour) {
    panel(x, y, 108, 58);
    ctx.fillStyle = 'rgba(238, 244, 248, 0.75)';
    ctx.font = `bold 11px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 10, y + 17);
    ctx.fillStyle = colour || PALETTE.hudText;
    ctx.font = `bold 24px ${FONT_MONO}`;
    ctx.fillText(value, x + 10, y + 44);
    if (unit) {
      ctx.fillStyle = 'rgba(238, 244, 248, 0.6)';
      ctx.font = `11px ${FONT_MONO}`;
      ctx.fillText(unit, x + 10 + ctx.measureText(value).width + 6, y + 44);
    }
  }

  function drawCompass(heading) {
    const degrees = headingToDegrees(heading);
    const width = 380;
    const x0 = centreX - width / 2;
    panel(x0, 14, width, 44);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x0, 14, width, 44, 8);
    ctx.clip();
    for (let offset = -180; offset <= 180; offset += 15) {
      let tick = Math.round((degrees + offset) / 15) * 15;
      const wrapped = ((tick % 360) + 360) % 360;
      const x = centreX + ((wrapped - degrees + 540) % 360 - 180) * (width / 400);
      if (x < x0 + 8 || x > x0 + width - 8) continue;
      const major = wrapped % 45 === 0;
      ctx.strokeStyle = major ? PALETTE.hudText : 'rgba(238, 244, 248, 0.45)';
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 22);
      ctx.lineTo(x, major ? 34 : 30);
      ctx.stroke();
      if (major) {
        ctx.fillStyle = PALETTE.hudText;
        ctx.font = `bold 12px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(wrapped % 90 === 0 ? compassLabel(wrapped) : String(wrapped), x, 50);
      }
    }
    ctx.restore();
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.beginPath();
    ctx.moveTo(centreX, 16);
    ctx.lineTo(centreX - 6, 26);
    ctx.lineTo(centreX + 6, 26);
    ctx.closePath();
    ctx.fill();
  }

  function drawArtificialHorizon(plane) {
    const x = 92;
    const y = VIEW.height - 92;
    const radius = 58;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(x, y);
    ctx.rotate(-plane.bank);
    const pitchOffset = plane.pitch * radius * 1.6;
    ctx.fillStyle = '#4d8fd6';
    ctx.fillRect(-radius, -radius + pitchOffset, radius * 2, radius - pitchOffset);
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(-radius, pitchOffset, radius * 2, radius - pitchOffset + radius);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-radius, pitchOffset);
    ctx.lineTo(radius, pitchOffset);
    ctx.stroke();
    for (const offset of [-28, 28]) {
      ctx.beginPath();
      ctx.moveTo(-22, pitchOffset + offset);
      ctx.lineTo(22, pitchOffset + offset);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = PALETTE.hudText;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.beginPath();
    ctx.moveTo(x - 26, y);
    ctx.lineTo(x + 26, y);
    ctx.lineTo(x, y + 7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(238, 244, 248, 0.8)';
    ctx.font = `bold 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('ATTITUDE', x, y + radius + 16);
  }

  function drawHud(flight, screen, time) {
    const plane = flight.plane;
    const degrees = headingToDegrees(plane.heading);
    const knots = Math.round(plane.speed * 0.592);
    instrumentBox(16, 14, 'ALTITUDE', String(Math.round(plane.y)), 'ft', PALETTE.hudText);
    instrumentBox(132, 14, 'AIRSPEED', String(knots), 'kt', PALETTE.hudText);
    instrumentBox(248, 14, 'HEADING', String(Math.round(degrees)).padStart(3, '0'), '°', PALETTE.hudText);
    drawCompass(plane.heading);

    // Score, rings and fuel on the right.
    panel(VIEW.width - 224, 14, 208, 58);
    ctx.fillStyle = 'rgba(238, 244, 248, 0.75)';
    ctx.font = `bold 11px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('SCORE', VIEW.width - 212, 31);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = `bold 22px ${FONT_MONO}`;
    ctx.fillText(String(flight.score), VIEW.width - 212, 55);
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.font = `bold 13px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(`RINGS ${ringsCollected(flight.course)}/${flight.course.length}`, VIEW.width - 28, 33);
    ctx.fillStyle = 'rgba(238, 244, 248, 0.6)';
    ctx.font = `11px ${FONT}`;
    ctx.fillText(`TIME ${Math.floor(flight.time / 60)}:${String(Math.floor(flight.time % 60)).padStart(2, '0')}`, VIEW.width - 28, 52);

    // Fuel and throttle bars.
    panel(VIEW.width - 224, 80, 208, 66);
    ctx.fillStyle = 'rgba(238, 244, 248, 0.75)';
    ctx.font = `bold 11px ${FONT}`;
    ctx.textAlign = 'left';
    const fuelLow = plane.fuel < 22;
    ctx.fillStyle = fuelLow && Math.floor(time * 3) % 2 === 0 ? PALETTE.hudRed : 'rgba(238, 244, 248, 0.75)';
    ctx.fillText(fuelLow ? 'FUEL — LOW!' : 'FUEL', VIEW.width - 212, 97);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.fillRect(VIEW.width - 212, 104, 184, 10);
    ctx.fillStyle = fuelLow ? PALETTE.hudRed : plane.fuel < 45 ? PALETTE.hudAmber : PALETTE.hudText;
    ctx.fillRect(VIEW.width - 212, 104, 184 * (plane.fuel / 100), 10);
    ctx.fillStyle = 'rgba(238, 244, 248, 0.75)';
    ctx.fillText('THROTTLE', VIEW.width - 212, 130);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.fillRect(VIEW.width - 212, 135, 184, 8);
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.fillRect(VIEW.width - 212, 135, 184 * plane.throttle, 8);

    drawArtificialHorizon(plane);

    // Centre crosshair: the flight-path marker.
    ctx.strokeStyle = 'rgba(238, 244, 248, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centreX, centreY, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.beginPath();
    ctx.arc(centreX, centreY, 3, 0, Math.PI * 2);
    ctx.fill();

    // Stall warning.
    const stalled = plane.speed < PLANE.stallSpeed && plane.airborne;
    if (stalled && Math.floor(time * 4) % 2 === 0) {
      ctx.fillStyle = PALETTE.hudRed;
      ctx.font = `bold 30px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('STALL — NOSE DOWN, FULL THROTTLE', centreX, 190);
    }

    // Mission line and transient messages at the bottom — hidden once the sortie is
    // over, because the landing / crash panel already carries the same words.
    const showMissionLine = screen === SCREEN_PLAY || screen === SCREEN_PAUSED;
    if (!showMissionLine) return;
    const ring = nextRing(flight.course);
    ctx.textAlign = 'center';
    if (flight.message && flight.messageTime > 0) {
      ctx.fillStyle = PALETTE.hudAmber;
      ctx.font = `bold 24px ${FONT}`;
      ctx.fillText(flight.message, centreX, VIEW.height - 96);
    } else if (ring) {
      const distance = Math.round(Math.hypot(ring.x - plane.x, ring.y - plane.y, ring.z - plane.z));
      ctx.fillStyle = 'rgba(238, 244, 248, 0.9)';
      ctx.font = `bold 20px ${FONT}`;
      ctx.fillText(`NEXT RING ${ringsCollected(flight.course) + 1}/${flight.course.length} — ${distance} ft ahead`, centreX, VIEW.height - 96);
    } else {
      ctx.fillStyle = PALETTE.hudAmber;
      ctx.font = `bold 20px ${FONT}`;
      ctx.fillText('ALL RINGS DONE — LAND ON THE RUNWAY', centreX, VIEW.height - 96);
    }
    ctx.fillStyle = 'rgba(238, 244, 248, 0.65)';
    ctx.font = `13px ${FONT}`;
    ctx.fillText('W/S pitch · A/D bank · Shift/Ctrl throttle · mouse steers · P pause · M mute', centreX, VIEW.height - 66);
  }

  function drawScene(flight, time, showRingLabels) {
    const camera = cameraFor(flight.plane);
    drawSky(camera, flight.plane);
    drawTerrain(camera, time);
    drawClouds(camera, time);
    drawRunwayMarkings(camera);
    const ring = nextRing(flight.course);
    flight.course.forEach((item, index) => {
      if (!item.collected) drawRing(camera, item, index, item === ring, time, showRingLabels);
    });
    drawPlaneShadow(camera, flight.plane);
    drawPlane(flight.plane);
  }

  function overlayPanel(title, lines, accent) {
    ctx.fillStyle = PALETTE.overlay;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const width = 640;
    const height = 130 + lines.length * 34;
    const x = centreX - width / 2;
    const y = centreY - height / 2 - 150;
    ctx.fillStyle = 'rgba(7, 18, 30, 0.88)';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.font = `bold 44px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(title, centreX, y + 62);
    ctx.fillStyle = PALETTE.hudWhite;
    ctx.font = `19px ${FONT}`;
    lines.forEach((line, index) => {
      ctx.fillText(line, centreX, y + 108 + index * 34);
    });
  }

  function drawTitle(flight, best) {
    drawScene(flight, 0, false);
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(6, 14, 24, 0.72)');
    gradient.addColorStop(1, 'rgba(6, 14, 24, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, VIEW.width, 300);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 78px ${FONT}`;
    ctx.fillText(GAME_TITLE, centreX, 108);
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.font = `bold 24px ${FONT}`;
    ctx.fillText(GAME_SUBTITLE, centreX, 146);
    ctx.fillStyle = 'rgba(238, 244, 248, 0.95)';
    ctx.font = `20px ${FONT}`;
    ctx.fillText('Fly the valley course: six golden rings, then bring her home to the grass strip.', centreX, 196);
    ctx.fillText('Fuel is limited — throttle discipline wins the delivery bonus.', centreX, 226);

    const boxY = VIEW.height - 208;
    panel(centreX - 330, boxY, 660, 118);
    ctx.fillStyle = PALETTE.hudWhite;
    ctx.font = `17px ${FONT}`;
    ctx.fillText('W / ↑  climb      S / ↓  dive      A D / ← →  bank & turn', centreX, boxY + 32);
    ctx.fillText('Shift / Ctrl  throttle      mouse steers      wheel = throttle', centreX, boxY + 62);
    ctx.fillText('Fly through every ring, then land gently on the runway.', centreX, boxY + 92);
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.font = `bold 26px ${FONT}`;
    ctx.fillText('PRESS SPACE OR CLICK TO TAKE OFF', centreX, VIEW.height - 44);
    if (best > 0) {
      ctx.fillStyle = 'rgba(238, 244, 248, 0.85)';
      ctx.font = `17px ${FONT}`;
      ctx.fillText(`Best score: ${best}`, centreX, VIEW.height - 18);
    }
  }

  /** Paint one frame. `screen` is one of the SCREEN_* constants. */
  function draw(flight, screen, best, muted) {
    ctx.clearRect(0, 0, VIEW.width, VIEW.height);
    if (screen === SCREEN_TITLE) {
      drawTitle(flight, best);
      return;
    }
    drawScene(flight, flight.time, true);
    drawHud(flight, screen, flight.time);
    if (screen === SCREEN_PAUSED) {
      overlayPanel('PAUSED', ['Press P or Space to keep flying.', muted ? 'Sound: off (M to unmute)' : 'Sound: on (M to mute)'], PALETTE.hudAmber);
    } else if (screen === SCREEN_LANDED) {
      const collected = ringsCollected(flight.course);
      overlayPanel(
        collected === flight.course.length ? 'DELIVERED!' : 'LANDED',
        [
          flight.message,
          `Rings ${collected}/${flight.course.length}  ·  Score ${flight.score}  ·  Best ${Math.max(best, flight.score)}`,
          'Press R or Space to fly another sortie.',
        ],
        PALETTE.ringCollected,
      );
    } else if (screen === SCREEN_OVER) {
      overlayPanel('CRASHED', [flight.message, `Score ${flight.score}  ·  Best ${Math.max(best, flight.score)}`, 'Press R or Space to try again.'], PALETTE.hudRed);
    }
  }

  return { draw };
}
