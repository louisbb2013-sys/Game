/** Synthesized sound effects (no audio files to download). Respect the user's sound setting. */
let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(v: boolean) {
  enabled = v;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.12) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, ctx.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.05);
}

export function play(kind: 'correct' | 'wrong' | 'combo' | 'finish' | 'tap') {
  try {
    playUnsafe(kind);
  } catch {
    /* sound is a bonus: never break a tap */
  }
}

function playUnsafe(kind: 'correct' | 'wrong' | 'combo' | 'finish' | 'tap') {
  if (!enabled) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    return;
  }
  switch (kind) {
    case 'correct':
      tone(660, 0, 0.12, 'triangle');
      tone(990, 0.09, 0.18, 'triangle');
      break;
    case 'wrong':
      tone(300, 0, 0.18, 'sine', 0.08);
      tone(240, 0.12, 0.22, 'sine', 0.08);
      break;
    case 'combo':
      [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.06, 0.14, 'triangle', 0.1));
      break;
    case 'finish':
      [523, 659, 784, 659, 1046].forEach((f, i) => tone(f, i * 0.1, 0.2, 'triangle', 0.1));
      break;
    case 'tap':
      tone(880, 0, 0.04, 'sine', 0.04);
      break;
  }
}
