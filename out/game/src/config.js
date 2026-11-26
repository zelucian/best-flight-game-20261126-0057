// Every tuning number, colour and label in one place. The playfield is a fixed 1280x800
// logical area; the renderer scales it to the window, so no rule below depends on the
// screen size. Distances are feet, speeds feet per second, angles radians.

export const VIEW = { width: 1280, height: 800 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The courier plane's flight envelope. */
export const PLANE = {
  /** Feet per second at full throttle, and at idle. */
  maxSpeed: 245,
  minSpeed: 55,
  /** Below this speed the wing stops lifting and the plane sinks. */
  stallSpeed: 82,
  /** How fast speed chases the throttle's target speed. */
  speedResponse: 0.55,
  /** How fast the nose follows the elevator, radians per second. */
  pitchRate: 1.15,
  /** The steepest climb / dive the elevator commands. */
  maxPitch: 0.5,
  /** How fast the wings follow the ailerons, radians per second. */
  bankRate: 2.4,
  /** The steepest bank the ailerons command. */
  maxBank: 1.05,
  /** Heading change per second at full bank and cruise speed. */
  turnRate: 0.85,
  /** Sink rate when fully stalled, feet per second. */
  stallSink: 46,
  /** Highest the plane may climb before the air thins out. */
  ceiling: 1150,
};

/** Fuel: 100 units, drained per second at full throttle. A sortie lasts about four minutes. */
export const FUEL = { start: 100, drainPerSecond: 0.42, lowWarning: 22 };

/** Scoring. */
export const SCORE = { ring: 250, landing: 500, fuelBonusPerUnit: 6, timeBonusPerSecond: 2 };

/** The home strip: a flat grass runway the sortie starts and ends on. */
export const RUNWAY = { x: 0, zStart: -60, zEnd: 380, width: 30, heading: 0 };

/** The valley course: six courier rings, each a gate to fly through. */
export const RINGS = [
  { x: 60, y: 180, z: 700, radius: 60 },
  { x: -130, y: 230, z: 1300, radius: 60 },
  { x: 110, y: 270, z: 1900, radius: 60 },
  { x: -60, y: 220, z: 2500, radius: 60 },
  { x: 150, y: 290, z: 3100, radius: 60 },
  { x: 0, y: 200, z: 3700, radius: 60 },
];

export const PALETTE = {
  skyTop: '#2b6fd2',
  skyMid: '#7fb2e8',
  skyHorizon: '#cfe6f7',
  sun: '#fff3c4',
  sunGlow: 'rgba(255, 236, 170, 0.55)',
  mountainFar: '#7d94b5',
  mountainNear: '#5a7194',
  fieldGreen: '#5da24a',
  fieldLight: '#7fb657',
  fieldDark: '#3f7d38',
  wheat: '#d9b45c',
  forest: '#2f6b34',
  river: '#3f8fd2',
  riverBank: '#c9b183',
  runway: '#3a3f46',
  runwayLine: '#f4f6f8',
  cloud: 'rgba(255, 255, 255, 0.92)',
  cloudShade: 'rgba(214, 230, 245, 0.85)',
  ring: '#ffb400',
  ringCollected: '#37d67a',
  planeWhite: '#f2f5f7',
  planeTeal: '#0e7c86',
  planeOrange: '#f07b2d',
  planeDark: '#22303c',
  hudPanel: 'rgba(7, 18, 30, 0.72)',
  hudText: '#8dffb0',
  hudAmber: '#ffcf5c',
  hudRed: '#ff6b5e',
  hudWhite: '#eef4f8',
  overlay: 'rgba(6, 14, 24, 0.55)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const FONT_MONO = '"SF Mono", "Cascadia Mono", Consolas, monospace';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'skyline-courier.best';

/** The game's own name, shown on the title screen and in the HUD. */
export const GAME_TITLE = 'SKYLINE COURIER';
export const GAME_SUBTITLE = 'a bush-plane courier run over the Alder Valley';
