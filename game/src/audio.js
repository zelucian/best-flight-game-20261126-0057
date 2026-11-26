// Synthesised sound, no audio files: a propeller engine hum that follows the throttle, wind
// that rises with speed, and short cues for rings, landings and crashes. Everything is
// guarded, so a browser without audio — or a screenshot run — simply stays silent.

export function createAudioEngine() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineFilter = null;
  let engineGain = null;
  let windSource = null;
  let windFilter = null;
  let windGain = null;
  let muted = false;
  let started = false;

  /** Start the engine and wind loops. Call once, from a user gesture. */
  function ensure() {
    if (started) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      context = new AudioContextClass();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);

      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = context.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 28;
      engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = context.createGain();
      engineGain.gain.value = 0.0;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();

      const noiseLength = context.sampleRate * 2;
      const noiseBuffer = context.createBuffer(1, noiseLength, context.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      for (let index = 0; index < noiseLength; index += 1) noiseData[index] = Math.random() * 2 - 1;
      windSource = context.createBufferSource();
      windSource.buffer = noiseBuffer;
      windSource.loop = true;
      windFilter = context.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windGain = context.createGain();
      windGain.gain.value = 0.0;
      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      windSource.start();
      started = true;
    } catch {
      context = null;
    }
  }

  /** Follow the throttle and the airspeed: the hum rises, the wind swells. */
  function setFlight(throttle, speed, airborne) {
    if (!started || !context) return;
    try {
      const time = context.currentTime;
      const hum = 52 + throttle * 78 + speed * 0.12;
      engineOsc.frequency.setTargetAtTime(hum, time, 0.08);
      engineOsc2.frequency.setTargetAtTime(hum / 2, time, 0.08);
      engineFilter.frequency.setTargetAtTime(240 + throttle * 620, time, 0.1);
      engineGain.gain.setTargetAtTime(airborne ? 0.05 + throttle * 0.075 : 0.045 + throttle * 0.05, time, 0.1);
      windGain.gain.setTargetAtTime(airborne ? Math.min(0.16, speed * 0.0006) : 0, time, 0.15);
      windFilter.frequency.setTargetAtTime(420 + speed * 2.4, time, 0.15);
    } catch {
      // A hiccup in the audio graph never stops the game.
    }
  }

  function tone(frequency, startAt, duration, type, volume) {
    if (!started || !context) return;
    try {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0, context.currentTime + startAt);
      gain.gain.linearRampToValueAtTime(volume, context.currentTime + startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + startAt + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start(context.currentTime + startAt);
      osc.stop(context.currentTime + startAt + duration + 0.05);
    } catch {
      // Silent is fine.
    }
  }

  /** Two bright notes when a ring is flown through. */
  function ring() {
    tone(880, 0, 0.22, 'sine', 0.22);
    tone(1318, 0.09, 0.3, 'sine', 0.2);
  }

  /** A soft thud and a low note for a landing. */
  function land() {
    tone(140, 0, 0.3, 'sine', 0.3);
    tone(523, 0.05, 0.4, 'triangle', 0.16);
  }

  /** A burst of noise for a crash. */
  function crash() {
    if (!started || !context) return;
    try {
      const noiseLength = context.sampleRate * 0.7;
      const buffer = context.createBuffer(1, noiseLength, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < noiseLength; index += 1) {
        data[index] = (Math.random() * 2 - 1) * (1 - index / noiseLength);
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      const gain = context.createGain();
      gain.gain.value = 0.5;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start();
      tone(70, 0, 0.5, 'sine', 0.3);
    } catch {
      // Silent is fine.
    }
  }

  /** A short click for menu actions. */
  function click() {
    tone(660, 0, 0.07, 'triangle', 0.12);
  }

  function setMuted(value) {
    muted = value;
    if (master && context) {
      try {
        master.gain.setTargetAtTime(value ? 0 : 0.5, context.currentTime, 0.05);
      } catch {
        // Silent is fine.
      }
    }
  }

  return { ensure, setFlight, ring, land, crash, click, setMuted };
}
