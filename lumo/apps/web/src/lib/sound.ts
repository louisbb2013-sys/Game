/** Synthesized sound effects (no audio files to download). Respect the user's sound setting. */
let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(v: boolean) {
  enabled = v;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.12, slideTo?: number) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime + start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + start + dur);
  g.gain.setValueAtTime(0, ctx.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.05);
}

/** A short burst of noise (a hit, a whoosh). */
function noise(start: number, dur: number, gain = 0.08, filter = 1200) {
  if (!ctx) return;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filter;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(ctx.currentTime + start);
}

export type Sound = 'correct' | 'wrong' | 'combo' | 'finish' | 'tap' | 'hit' | 'crit' | 'shield' | 'heal' | 'tick' | 'go' | 'chest' | 'reveal' | 'whoosh' | 'lightning' | 'star' | 'win' | 'lose';

/** `level` raises the pitch (a right answer sounds brighter the longer the streak). */
export function play(kind: Sound, level = 0) {
  try {
    playUnsafe(kind, level);
  } catch {
    /* sound is a bonus: never break a tap */
  }
}

function playUnsafe(kind: Sound, level: number) {
  if (!enabled) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    return;
  }
  const up = Math.pow(2, Math.min(level, 10) / 24); // up to ~a third higher on a long streak
  switch (kind) {
    case 'correct':
      tone(660 * up, 0, 0.12, 'triangle');
      tone(990 * up, 0.08, 0.2, 'triangle');
      break;
    case 'wrong':
      tone(300, 0, 0.18, 'sine', 0.08);
      tone(220, 0.12, 0.26, 'sine', 0.08);
      break;
    case 'combo':
      [523, 659, 784, 1046].forEach((f, i) => tone(f * up, i * 0.06, 0.14, 'triangle', 0.1));
      break;
    case 'finish':
      [523, 659, 784, 659, 1046].forEach((f, i) => tone(f, i * 0.1, 0.2, 'triangle', 0.1));
      break;
    case 'tap':
      tone(880, 0, 0.04, 'sine', 0.04);
      break;
    case 'hit':
      noise(0, 0.18, 0.12, 900);
      tone(180, 0, 0.18, 'square', 0.05, 90);
      break;
    case 'crit':
      noise(0, 0.25, 0.16, 1600);
      tone(240, 0, 0.12, 'square', 0.06, 120);
      tone(1200, 0.05, 0.2, 'triangle', 0.08, 1800);
      break;
    case 'shield':
      tone(520, 0, 0.1, 'sawtooth', 0.05, 260);
      noise(0.02, 0.2, 0.08, 3000);
      break;
    case 'heal':
      [784, 988, 1175].forEach((f, i) => tone(f, i * 0.07, 0.18, 'sine', 0.08));
      break;
    case 'tick':
      tone(1400, 0, 0.03, 'square', 0.025);
      break;
    case 'go':
      tone(523, 0, 0.12, 'triangle', 0.1);
      tone(1046, 0.1, 0.3, 'triangle', 0.12);
      break;
    case 'chest':
      [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.05, 0.16, 'triangle', 0.09));
      break;
    case 'reveal':
      tone(880, 0, 0.3, 'sine', 0.08, 1760);
      break;
    case 'whoosh':
      noise(0, 0.22, 0.05, 2400);
      break;
    case 'lightning':
      noise(0, 0.12, 0.1, 5000);
      tone(1600, 0, 0.15, 'sawtooth', 0.04, 400);
      break;
    case 'star':
      tone(1046 * up, 0, 0.22, 'triangle', 0.1);
      tone(1568 * up, 0.06, 0.25, 'sine', 0.06);
      break;
    case 'win':
      [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, i * 0.11, 0.24, 'triangle', 0.1));
      break;
    case 'lose':
      [392, 349, 311, 262].forEach((f, i) => tone(f, i * 0.16, 0.3, 'sine', 0.08));
      break;
  }
}
