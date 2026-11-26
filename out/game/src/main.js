// Boot and the one loop: input is read every frame, the flight advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between five screens: title, play, paused, landed and game over.
//
// ?seed=N fixes the valley's clouds. ?shot=start|play|end (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createAudioEngine } from './audio.js';
import { createFlight, EVENT_CRASHED, EVENT_LANDED, EVENT_RING, resetFlight, stepFlight, STATUS_CRASHED, STATUS_FLYING, STATUS_LANDED } from './flight.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createRenderer, SCREEN_LANDED, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
void seed;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const flight = createFlight();
const renderer = createRenderer(canvas);
const audio = createAudioEngine();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, flight);
  // A one-line summary a screenshot run can read back from the page title.
  const summary = {
    shot: name,
    screen: scene.screen,
    score: flight.score,
    status: flight.status,
    rings: flight.course.filter((ring) => ring.collected).length,
    fuel: Math.round(flight.plane.fuel),
    altitude: Math.round(flight.plane.y),
    speed: Math.round(flight.plane.speed),
    position: [Math.round(flight.plane.x), Math.round(flight.plane.y), Math.round(flight.plane.z)],
  };
  document.title = `shot:${JSON.stringify(summary)}`;
  let painted = 0;
  function paint() {
    renderer.draw(flight, scene.screen, scene.best, false);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let muted = false;
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and each ring.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.ensure();
    audio.click();
    resetFlight(flight);
    flight.status = STATUS_FLYING;
    flight.plane.throttle = 0.35;
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Flying. Six rings, then land on the runway.');
  }

  function endFlight() {
    if (flight.status === STATUS_LANDED) {
      screen = SCREEN_LANDED;
      audio.land();
      if (flight.score > best) {
        best = flight.score;
        saveBest(best);
      }
      announce(`Landed. Score ${flight.score}. Best ${best}.`);
    } else if (flight.status === STATUS_CRASHED) {
      screen = SCREEN_OVER;
      audio.crash();
      if (flight.score > best) {
        best = flight.score;
        saveBest(best);
      }
      announce(`Crashed. Score ${flight.score}. Best ${best}.`);
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      muted = !muted;
      audio.setMuted(muted);
    }
    if (actions & ACTION_RESTART && (screen === SCREEN_OVER || screen === SCREEN_LANDED)) {
      startGame();
      return;
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_LANDED)) {
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) return;
    const controls = {
      pitch: input.pitch(),
      bank: input.bank(),
      throttleDelta: input.throttleDelta(),
      throttleSet: null,
      rudder: 0,
    };
    const events = stepFlight(flight, controls, STEP);
    if (events & EVENT_RING) {
      audio.ring();
      announce(flight.message);
    }
    if (events & (EVENT_LANDED | EVENT_CRASHED)) endFlight();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    const plane = flight.plane;
    audio.setFlight(plane.throttle, plane.speed, plane.airborne);
    renderer.draw(flight, screen, best, muted);
  }

  // Leaving the tab pauses a running game rather than letting the fuel burn unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Skyline Courier. Press Space or click to take off.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
