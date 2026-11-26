# Skyline Courier

[![Best Flight Game](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![Rank](https://make.fun/badge/best-flight-game-20261126-0057/zelucian/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![Reward](https://make.fun/badge/best-flight-game-20261126-0057/zelucian/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

A bush-plane courier game for the [best flight game bounty](https://make.fun/bounty/best-flight-game-20261126-0057). Fly the little courier plane "77" down the Alder Valley: thread six golden rings, mind your fuel, then bring her home to the grass strip for the delivery bonus.

## How to play

Serve the game (`node serve.ts`, then open http://localhost:8080) or open `game/index.html` from any static server. No network is needed — everything is local files, and the sound is synthesised in the browser.

| Input | Does |
| --- | --- |
| W / ↑ | Climb (nose up) |
| S / ↓ | Dive (nose down) |
| A D / ← → | Bank and turn |
| Shift / Ctrl | Throttle up / down |
| Mouse | Steer toward the pointer (move it off-centre) |
| Wheel | Throttle |
| Space / click | Take off, restart after landing or crashing |
| P / Esc | Pause |
| M | Mute |

## The sortie

1. **Take off** from the grass runway — full throttle, rotate once the wing bites.
2. **Fly the six golden rings** down the valley (+250 points each). The next ring is marked in gold, with its distance; the compass and the mission line point the way.
3. **Mind the fuel gauge.** Full throttle burns it fast; a gentle throttle hand leaves a bigger delivery bonus. Run dry and you glide — find the runway.
4. **Land on the runway.** Come in slow, wings level, sink rate gentle. A hard or fast touchdown in the fields ends the sortie.
5. **Delivery bonus:** all six rings plus a landing pays +500, plus fuel and time bonuses.

Watch the instruments: altitude, airspeed and heading across the top, the compass strip, the artificial horizon at bottom left, and the stall warning if you pull up too slow. A crash, a missed ring and a low-fuel warning each tell you what happened, and R flies the next sortie.

## The game behind the screenshots

- `game/src/config.js` — every tuning number, colour and the valley course
- `game/src/random.js` — the seeded random source and smooth noise the valley is built from
- `game/src/terrain.js` — the Alder Valley: heightfield, river, fields, runway and rings
- `game/src/flight.js` — the flight model (throttle, pitch, banked turns, stall, fuel) and the ring, landing and crash rules, plus the autopilot that stages the screenshots
- `game/src/render.js` — the pseudo-3D chase view: sky, mountains, terrain, runway, rings, the plane, and the lit HUD
- `game/src/audio.js` — synthesised engine hum, wind, ring chimes, landing and crash sounds (WebAudio, no files)
- `game/src/input.js` — keyboard and mouse steering
- `game/src/shots.js` — the deterministic `?shot=start|play|end` scenes (real gameplay, steered by the autopilot)
- `game/src/main.js` — boot, the fixed-step loop and the title / play / pause / landed / game-over screens

Screenshots are real renders of this code in a headless browser (`?shot=start|play|end&seed=1`).

## License

MIT — see [LICENSE](LICENSE).
