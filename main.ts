// Skyline Courier — the entrypoint for this make.fun best-game-01 entry.
//
// The playable game is the static site in game/ (game/index.html is the page
// a desktop browser loads offline, no network requests, no build step) and
// the showcase images are the PNG/JPEG renders in screenshots/ (the first
// by name is the cover). This program is only the packager: it copies both
// folders into the output directory and writes dossier.json there, the
// summary the judge reads, using the vendored make.fun library in
// vendor/makefun-game.ts.
//
// Run it locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// then serve the `out` folder the same way serve.ts serves this repo. Inside
// the grader's container the output directory is /output, unless
// MAKEFUN_OUTPUT_DIR says otherwise.

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

/** The caps the scorer's own gate applies to this bounty (its gate.json). */
const DOSSIER_CAPS = {
  /** The most UTF-8 bytes the dossier's text may hold. */
  text_max_bytes: 163840,
  /** At most this many screenshots, each at most this many bytes. */
  screenshots: { max: 4, max_bytes: 262144 },
  /** game/ may hold at most this many files and directories, in all. */
  game_max_files: 993,
  /** game/'s files may come to at most this many bytes, in all. */
  game_max_bytes: 50331648,
  /** No path under game/ may be longer than this many UTF-8 bytes. */
  game_path_max_bytes: 1000,
} as const;

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const gameDir = join(repoRoot, 'game');
const shotsDir = join(repoRoot, 'screenshots');

// The game is nothing without its entry page: refuse early, with a plain
// message, when game/index.html is missing, rather than copying a broken
// game and letting buildDossier fail on it further down.
if (!existsSync(join(gameDir, 'index.html'))) {
  throw new Error('game/index.html: no such file — Skyline Courier needs its entry page at game/index.html');
}

// A dossier needs at least one screenshot, so refuse early with a plain
// message when screenshots/ is missing or empty, instead of letting
// buildDossier fail on an empty folder further down.
if (!existsSync(shotsDir) || readdirSync(shotsDir).length === 0) {
  throw new Error('screenshots/: no screenshots — Skyline Courier needs 3 or 4 PNG or JPEG renders');
}

mkdirSync(outputDir, { recursive: true });
cpSync(gameDir, join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });

writeFileSync(join(outputDir, 'dossier.json'), buildDossier(outputDir, DOSSIER_CAPS));
