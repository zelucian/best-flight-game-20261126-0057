// Keyboard and mouse input. Held keys give steering targets; one-shot presses (start,
// pause, restart, mute) are queued as bit flags and taken once by the loop, so a press
// between two frames is never lost and never counted twice. The mouse steers too: move it
// off-centre and the plane banks and pitches toward the pointer; the wheel is the throttle.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_MUTE = 8;

const PITCH_UP = new Set(['ArrowUp', 'KeyW']);
const PITCH_DOWN = new Set(['ArrowDown', 'KeyS']);
const BANK_LEFT = new Set(['ArrowLeft', 'KeyA']);
const BANK_RIGHT = new Set(['ArrowRight', 'KeyD']);
const THROTTLE_UP = new Set(['ShiftLeft', 'ShiftRight', 'KeyR']);
const THROTTLE_DOWN = new Set(['ControlLeft', 'ControlRight', 'KeyF']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const RESTART = new Set(['KeyR']);
const MUTE = new Set(['KeyM']);

/** How far the pointer must sit from the centre before it steers, as a fraction of the view. */
const MOUSE_DEAD_ZONE = 0.06;

export function createInput(target) {
  const keys = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseSeenAt = -Infinity;
  let wheelDelta = 0;

  window.addEventListener('keydown', (event) => {
    if (
      PITCH_UP.has(event.code) || PITCH_DOWN.has(event.code) ||
      BANK_LEFT.has(event.code) || BANK_RIGHT.has(event.code) ||
      THROTTLE_UP.has(event.code) || THROTTLE_DOWN.has(event.code) ||
      CONFIRM.has(event.code) || PAUSE.has(event.code) || RESTART.has(event.code) || MUTE.has(event.code)
    ) {
      event.preventDefault();
    }
    if (event.repeat) return;
    keys.add(event.code);
    if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    if (RESTART.has(event.code)) actions |= ACTION_RESTART;
    if (MUTE.has(event.code)) actions |= ACTION_MUTE;
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    keys.clear();
  });
  target.addEventListener('pointermove', (event) => {
    const rect = target.getBoundingClientRect();
    mouseX = (event.clientX - rect.left) / rect.width - 0.5;
    mouseY = (event.clientY - rect.top) / rect.height - 0.5;
    mouseSeenAt = performance.now();
  });
  target.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });
  target.addEventListener('wheel', (event) => {
    event.preventDefault();
    wheelDelta += event.deltaY;
  }, { passive: false });

  function hasAny(codes) {
    for (const code of codes) if (keys.has(code)) return true;
    return false;
  }

  function mouseIsSteering() {
    return performance.now() - mouseSeenAt < 2500;
  }

  return {
    /** Pitch target in [-1, 1]: 1 climbs, -1 dives. The mouse steers when it moved lately. */
    pitch() {
      if (mouseIsSteering() && Math.abs(mouseY) > MOUSE_DEAD_ZONE) return Math.max(-1, Math.min(1, -mouseY * 2.4));
      return (hasAny(PITCH_UP) ? 1 : 0) - (hasAny(PITCH_DOWN) ? 1 : 0);
    },
    /** Bank target in [-1, 1]: 1 banks right, -1 banks left. */
    bank() {
      if (mouseIsSteering() && Math.abs(mouseX) > MOUSE_DEAD_ZONE) return Math.max(-1, Math.min(1, mouseX * 2.4));
      return (hasAny(BANK_RIGHT) ? 1 : 0) - (hasAny(BANK_LEFT) ? 1 : 0);
    },
    /** Throttle change per second from the keys and the wheel: 1 raises it, -1 lowers it. */
    throttleDelta() {
      let delta = (hasAny(THROTTLE_UP) ? 1 : 0) - (hasAny(THROTTLE_DOWN) ? 1 : 0);
      if (wheelDelta !== 0) {
        delta -= Math.max(-1, Math.min(1, wheelDelta / 120));
        wheelDelta = 0;
      }
      return delta * 0.9;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
