/**
 * Synthesized sound (no audio files to download): glassy chimes for right answers that climb a scale
 * as the streak grows, a soft wooden "bonk" for mistakes, sparkles for chests, and optional lounge
 * music during rounds. Everything goes through one bus with a gentle compressor and a little reverb,
 * which is what makes it sound polished rather than beepy. Respects the user's sound settings.
 */
let ctx: AudioContext | null = null;
let bus: GainNode | null = null; // effects, dry
let verb: GainNode | null = null; // reverb input
let musicBus: GainNode | null = null;
let enabled = true;
let musicWanted = true;

export function setSoundEnabled(v: boolean) {
  enabled = v;
  if (!v) stopMusic();
}

/** Background music in rounds (on by default, quiet). */
export function setMusicEnabled(v: boolean) {
  musicWanted = v;
  if (!v) stopMusic();
}

function impulse(c: AudioContext, seconds: number, decay: number) {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function audio(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ctx) {
      const c = new AudioContext();
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.knee.value = 14;
      comp.ratio.value = 3;
      comp.attack.value = 0.004;
      comp.release.value = 0.25;
      const master = c.createGain();
      master.gain.value = 0.9;
      master.connect(comp).connect(c.destination);
      bus = c.createGain();
      bus.connect(master);
      const conv = c.createConvolver();
      conv.buffer = impulse(c, 1.8, 3);
      verb = c.createGain();
      verb.connect(conv).connect(master);
      musicBus = c.createGain();
      musicBus.gain.value = 0;
      musicBus.connect(master);
      ctx = c;
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    return null;
  }
  return ctx;
}

// Browsers only start audio after a tap: wake it on the first one so the first sound isn't lost.
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => void audio(), { capture: true, passive: true });
}

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** Send a voice to the dry bus (or the music bus) plus some reverb. */
function route(node: AudioNode, wet: number, dest?: AudioNode | null) {
  node.connect(dest ?? bus!);
  if (wet > 0) {
    const s = ctx!.createGain();
    s.gain.value = wet;
    node.connect(s).connect(verb!);
  }
}

function env(g: GainNode, t: number, peak: number, attack: number, dur: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

/** A glassy FM bell (the "luxury" chime). */
function bell(f: number, at: number, dur: number, gain = 0.08, o: { ratio?: number; index?: number; wet?: number; dest?: AudioNode | null; attack?: number } = {}) {
  const c = ctx!;
  const t = c.currentTime + Math.max(0, at);
  const car = c.createOscillator();
  car.frequency.value = f;
  const mod = c.createOscillator();
  mod.frequency.value = f * (o.ratio ?? 3.5);
  const mg = c.createGain();
  const idx = (o.index ?? 1.4) * f;
  mg.gain.setValueAtTime(idx, t);
  mg.gain.exponentialRampToValueAtTime(Math.max(1, idx * 0.04), t + dur);
  mod.connect(mg).connect(car.frequency);
  const g = c.createGain();
  env(g, t, gain, o.attack ?? 0.005, dur);
  car.connect(g);
  route(g, o.wet ?? 0.28, o.dest);
  car.start(t);
  mod.start(t);
  car.stop(t + dur + 0.05);
  mod.stop(t + dur + 0.05);
}

/** A warm wooden mallet (marimba-like): soft, never harsh. */
function mallet(f: number, at: number, dur: number, gain = 0.09, wet = 0.12) {
  const c = ctx!;
  const t = c.currentTime + Math.max(0, at);
  for (const [ratio, level, decay] of [
    [1, 1, 1],
    [3.99, 0.22, 0.35],
    [10.65, 0.06, 0.12],
  ] as const) {
    const o = c.createOscillator();
    o.frequency.value = f * ratio;
    const g = c.createGain();
    env(g, t, gain * level, 0.004, dur * decay);
    o.connect(g);
    route(g, wet);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

/** A soft sustained chord. */
function pad(freqs: number[], at: number, dur: number, gain = 0.03, dest?: AudioNode | null) {
  const c = ctx!;
  const t = c.currentTime + Math.max(0, at);
  for (const f of freqs) {
    for (const detune of [-6, 6]) {
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      o.detune.value = detune;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1800;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain / freqs.length, t + Math.min(0.4, dur / 3));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(lp).connect(g);
      route(g, 0.35, dest);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }
}

/** Filtered noise, optionally sweeping (a whoosh, a crack, a shaker). */
function noise(at: number, dur: number, gain: number, type: BiquadFilterType, f0: number, f1?: number, wet = 0.1, dest?: AudioNode | null) {
  const c = ctx!;
  const t = c.currentTime + Math.max(0, at);
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.Q.value = type === 'bandpass' ? 1.2 : 0.7;
  f.frequency.setValueAtTime(f0, t);
  if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain();
  env(g, t, gain, Math.min(0.03, dur / 4), dur);
  src.connect(f).connect(g);
  route(g, wet, dest);
  src.start(t);
}

/** A soft low thump (a hit on the boss). */
function thump(at: number, gain = 0.25, f0 = 150, f1 = 45, dur = 0.25) {
  const c = ctx!;
  const t = c.currentTime + Math.max(0, at);
  const o = c.createOscillator();
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain();
  env(g, t, gain, 0.004, dur);
  o.connect(g);
  route(g, 0.05);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export type Sound = 'correct' | 'wrong' | 'combo' | 'finish' | 'tap' | 'hit' | 'crit' | 'shield' | 'heal' | 'tick' | 'go' | 'chest' | 'reveal' | 'whoosh' | 'lightning' | 'star' | 'win' | 'lose';

// A major scale: each right answer in a streak rings one step higher.
const SCALE = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19];
const PENTA = [0, 2, 4, 7, 9];

/** `level` = the streak: the chime climbs a scale as it grows. */
export function play(kind: Sound, level = 0) {
  try {
    if (!audio()) return;
    playUnsafe(kind, level);
  } catch {
    /* sound is a bonus: never break a tap */
  }
}

function playUnsafe(kind: Sound, level: number) {
  const step = SCALE[Math.max(0, Math.min(level, SCALE.length - 1))]!;
  switch (kind) {
    case 'tap':
      mallet(hz(91), 0, 0.08, 0.035, 0.02);
      break;
    case 'correct': {
      const root = 84 + step; // C6 and up
      bell(hz(root), 0, 0.55, 0.085);
      bell(hz(root + 7), 0.075, 0.8, 0.07);
      break;
    }
    case 'wrong':
      mallet(hz(57), 0, 0.45, 0.12, 0.08);
      mallet(hz(53), 0.12, 0.6, 0.1, 0.1);
      break;
    case 'combo':
      [0, 4, 7, 12, 16].forEach((n, i) => bell(hz(84 + Math.min(step, 7) + n), i * 0.045, 0.6, 0.05, { wet: 0.35 }));
      break;
    case 'finish':
      pad([hz(60), hz(64), hz(67), hz(71)], 0, 1.8, 0.06);
      [72, 76, 79, 84].forEach((n, i) => bell(hz(n + 12), 0.1 + i * 0.12, 1, 0.06));
      break;
    case 'tick':
      mallet(hz(88), 0, 0.06, 0.05, 0);
      break;
    case 'go':
      noise(0, 0.35, 0.05, 'bandpass', 600, 5000, 0.2);
      [84, 91, 96].forEach((n) => bell(hz(n), 0.05, 1, 0.055));
      break;
    case 'chest':
      noise(0, 0.3, 0.06, 'bandpass', 900, 7000, 0.25);
      pad([hz(72), hz(76), hz(79)], 0.05, 1.2, 0.04);
      for (let i = 0; i < 8; i++) bell(hz(96 + PENTA[Math.floor(Math.random() * PENTA.length)]! + (i % 2) * 12), 0.08 + i * 0.045, 0.7, 0.035, { wet: 0.45 });
      break;
    case 'reveal':
      bell(hz(84), 0, 0.9, 0.06, { ratio: 2, index: 2.4 });
      bell(hz(91), 0.09, 1.1, 0.05, { ratio: 2 });
      break;
    case 'whoosh':
      noise(0, 0.3, 0.06, 'bandpass', 400, 3200, 0.15);
      break;
    case 'lightning':
      noise(0, 0.14, 0.09, 'highpass', 3500, 9000, 0.2);
      bell(hz(100), 0, 0.4, 0.05, { ratio: 1.41, index: 4 });
      break;
    case 'star':
      bell(hz(88 + Math.min(level, 5) * 2), 0, 1.1, 0.07, { wet: 0.4 });
      bell(hz(95 + Math.min(level, 5) * 2), 0.06, 1.2, 0.04, { wet: 0.45 });
      break;
    case 'win':
      [72, 76, 79, 84, 88, 91].forEach((n, i) => bell(hz(n + 12), i * 0.1, 1.1, 0.06));
      pad([hz(60), hz(64), hz(67), hz(74)], 0.5, 2.2, 0.07);
      noise(0.45, 0.6, 0.03, 'highpass', 6000, 9000, 0.4);
      break;
    case 'lose':
      [67, 65, 63, 60].forEach((n, i) => mallet(hz(n), i * 0.18, 0.7, 0.09));
      pad([hz(48), hz(51), hz(55)], 0.5, 1.6, 0.04);
      break;
    case 'hit':
      thump(0, 0.28);
      noise(0, 0.12, 0.09, 'lowpass', 2400, 600, 0.05);
      break;
    case 'crit':
      thump(0, 0.32, 180, 40, 0.3);
      noise(0, 0.18, 0.11, 'bandpass', 3000, 900, 0.1);
      bell(hz(96), 0.04, 0.8, 0.05, { wet: 0.4 });
      break;
    case 'shield':
      noise(0, 0.28, 0.08, 'highpass', 2500, 7000, 0.25);
      [100, 96, 91].forEach((n, i) => bell(hz(n), i * 0.05, 0.5, 0.035, { ratio: 2.7, index: 3 }));
      break;
    case 'heal':
      [88, 92, 95].forEach((n, i) => bell(hz(n), i * 0.08, 0.9, 0.05, { wet: 0.4 }));
      break;
  }
}

// ------------------------------------------------------------------ lounge music for rounds

export type MusicMood = 'calm' | 'speed' | 'boss';

/** Chords as [bass, ...voicing] in MIDI notes, one per bar. */
const SONGS: Record<MusicMood, { bpm: number; bars: number[][]; swing: number; shaker: number; melody: number }> = {
  // Cmaj9 · Am9 · Dm9 · G9sus: a warm, slow lounge loop.
  calm: { bpm: 74, bars: [[48, 64, 67, 71, 74], [45, 60, 64, 67, 71], [50, 65, 69, 72, 76], [43, 65, 69, 74, 77]], swing: 0.12, shaker: 0.006, melody: 0.22 },
  // Same colours, quicker, with a busier shaker.
  speed: { bpm: 112, bars: [[48, 64, 67, 71, 74], [53, 64, 69, 72, 76], [45, 64, 67, 72, 76], [43, 62, 65, 71, 74]], swing: 0.05, shaker: 0.01, melody: 0.18 },
  // Am9 · Fmaj7 · Dm9 · E7(b9): darker for the boss.
  boss: { bpm: 92, bars: [[45, 60, 64, 67, 71], [41, 60, 64, 65, 69], [38, 60, 65, 69, 72], [40, 59, 62, 65, 68]], swing: 0.05, shaker: 0.008, melody: 0.12 },
};

let musicTimer: ReturnType<typeof setInterval> | null = null;
let musicMood: MusicMood = 'calm';
let nextBeat = 0;
let beat = 0;

function scheduleMusic() {
  const c = ctx;
  if (!c || !musicBus || document.hidden) return;
  const song = SONGS[musicMood];
  const spb = 60 / song.bpm;
  if (nextBeat < c.currentTime) nextBeat = c.currentTime + 0.05;
  while (nextBeat < c.currentTime + 0.6) {
    const at = nextBeat - c.currentTime;
    const bar = song.bars[Math.floor(beat / 4) % song.bars.length]!;
    const inBar = beat % 4;
    if (inBar === 0) {
      // Bass on the one, and an electric-piano chord.
      bell(hz(bar[0]!), at, spb * 3.5, 0.05, { ratio: 1, index: 0.35, wet: 0.08, dest: musicBus, attack: 0.02 });
      for (const n of bar.slice(1)) bell(hz(n), at + 0.01, spb * 3.2, 0.018, { ratio: 1, index: 0.9, wet: 0.3, dest: musicBus, attack: 0.012 });
    }
    if (inBar === 2) {
      bell(hz(bar[0]! + 7), at, spb * 1.8, 0.035, { ratio: 1, index: 0.3, wet: 0.08, dest: musicBus, attack: 0.02 });
      // A lighter comp on the "and" of three.
      for (const n of bar.slice(2)) bell(hz(n), at + spb * (0.5 + song.swing), spb * 1.4, 0.011, { ratio: 1, index: 0.8, wet: 0.3, dest: musicBus, attack: 0.012 });
    }
    // Shaker on the off-beats.
    noise(at + spb * (0.5 + song.swing), 0.05, song.shaker, 'highpass', 7000, undefined, 0.05, musicBus);
    if (musicMood === 'speed') noise(at, 0.04, song.shaker * 0.7, 'highpass', 8000, undefined, 0.03, musicBus);
    // Now and then a melody note from the pentatonic scale.
    if (Math.random() < song.melody) {
      const n = 72 + (musicMood === 'boss' ? [0, 3, 5, 7, 10] : PENTA)[Math.floor(Math.random() * 5)]! + (Math.random() < 0.3 ? 12 : 0);
      bell(hz(n), at + (Math.random() < 0.5 ? 0 : spb / 2), spb * 2.5, 0.02, { wet: 0.5, dest: musicBus });
    }
    nextBeat += spb;
    beat++;
  }
}

/** Start (or switch) the round's music; fades in. Only after a tap has allowed sound. */
export function startMusic(mood: MusicMood = 'calm') {
  if (!enabled || !musicWanted) return;
  const c = audio();
  if (!c || !musicBus) return;
  musicMood = mood;
  musicBus.gain.cancelScheduledValues(c.currentTime);
  musicBus.gain.setTargetAtTime(0.55, c.currentTime, 0.6);
  if (musicTimer) return;
  beat = 0;
  nextBeat = c.currentTime + 0.1;
  scheduleMusic();
  musicTimer = setInterval(scheduleMusic, 200);
}

/** Fade the music out. */
export function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
  if (ctx && musicBus) {
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
  }
}
