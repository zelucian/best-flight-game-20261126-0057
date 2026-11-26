// The screenshot scenes behind ?shot=start|play|end. Each one plays the real rules forward
// from a fresh sortie for a fixed number of steps, steered by the same autopilot a player
// could imitate, so the frame is what a short game really looks like and the same seed
// always gives the same frame.

import { STEP } from './config.js';
import { autopilotControls, createFlight, resetFlight, STATUS_CRASHED, STATUS_LANDED, stepFlight } from './flight.js';
import { SCREEN_LANDED, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

/** Seconds of idling on the runway before the title frame. */
const START_SECONDS = 2;
/** Seconds of flying before the mid-flight frame. */
const PLAY_SECONDS = 11;
/** The longest the landing scene may fly before it is staged as it stands. */
const END_LIMIT_SECONDS = 420;

const SAMPLE = STEP;

/**
 * Set `flight` to the named scene (start, play or end; any other name is start) and return
 * the screen to draw over it and the best score to show.
 */
export function stageShot(name, flight) {
  resetFlight(flight);
  if (name !== 'play' && name !== 'end') {
    // Parked on the runway, engine idling: the title view.
    return { screen: SCREEN_TITLE, best: 0 };
  }

  flight.status = 'flying';
  const limit = name === 'end' ? END_LIMIT_SECONDS : PLAY_SECONDS;
  for (let index = 0; index < limit / SAMPLE; index += 1) {
    const events = stepFlight(flight, autopilotControls(flight), SAMPLE);
    void events;
    if (flight.status === STATUS_CRASHED || flight.status === STATUS_LANDED) break;
  }
  if (flight.status === STATUS_LANDED) return { screen: SCREEN_LANDED, best: flight.score };
  if (flight.status === STATUS_CRASHED) return { screen: SCREEN_OVER, best: flight.score };
  return { screen: SCREEN_PLAY, best: flight.score };
}
