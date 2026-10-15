/**
 * Text-to-speech for audio mode, videos and podcasts, with the device's own voices (works offline on
 * most devices). Devices ship several voices per language and the first one is often the robotic
 * one, so we rank them: natural / neural / premium voices first, Québec French for French, and the
 * novelty voices (Bubbles, Zarvox…) never. Long text is read sentence by sentence: some browsers
 * silently stop a long utterance after about 15 seconds.
 */
export const speechAvailable = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

type Lang = 'en' | 'fr';

const NATURAL = /natural|neural|premium|enhanced|wavenet|studio/i;
const ONLINE = /online|google|siri|cloud/i;
/** Voices that sound good across platforms (Apple, Microsoft, Google, Samsung). */
const NICE: Record<Lang, RegExp> = {
  en: /\b(samantha|ava|allison|susan|zoe|evan|nathan|tom|aria|jenny|guy|michelle|emma|brian|andrew|libby|sonia|ryan|serena|daniel|karen|moira|tessa)\b/i,
  fr: /\b(am[ée]lie|chantal|nicolas|sylvie|antoine|jean|caroline|thomas|audrey|aur[ée]lie|marie|denise|henri|eloise|vivienne|remy|r[ée]my|jacqueline|thierry)\b/i,
};
const NOVELTY = /espeak|compact|\b(bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|pipe organ|organ|superstar|trinoids|whisper|wobble|zarvox|albert|fred|junior|ralph|kathy|princess|grandma|grandpa|rocko|shelley|flo|eddy|reed|sandy)\b/i;

function score(v: SpeechSynthesisVoice, lang: Lang): number {
  const l = v.lang.toLowerCase().replace('_', '-');
  if (!l.startsWith(lang)) return -1;
  let s = 0;
  if (lang === 'fr') s += l === 'fr-ca' ? 30 : l === 'fr-fr' ? 20 : 10;
  else s += l === 'en-us' ? 20 : l === 'en-ca' ? 19 : l === 'en-gb' ? 16 : 10;
  if (NATURAL.test(v.name)) s += 45;
  if (ONLINE.test(v.name)) s += 25;
  if (NICE[lang].test(v.name)) s += 20;
  if (!v.localService) s += 4; // network voices are usually the better-sounding ones
  if (v.default) s += 2;
  if (NOVELTY.test(v.name)) s -= 200;
  return s;
}

let cached: SpeechSynthesisVoice[] = [];
/** The device's voices; some browsers only list them a moment after the page loads. */
function voices(): Promise<SpeechSynthesisVoice[]> {
  if (!speechAvailable()) return Promise.resolve([]);
  const now = window.speechSynthesis.getVoices();
  if (now.length) return Promise.resolve((cached = now));
  if (cached.length) return Promise.resolve(cached);
  return new Promise((resolve) => {
    const done = () => {
      cached = window.speechSynthesis.getVoices();
      resolve(cached);
    };
    window.speechSynthesis.addEventListener?.('voiceschanged', done, { once: true });
    setTimeout(done, 1200);
  });
}

/** The best voice for this language; `variant` 1 is a different voice (a second podcast host). */
export async function bestVoice(lang: Lang, variant: 0 | 1 = 0): Promise<SpeechSynthesisVoice | undefined> {
  const ranked = (await voices())
    .map((v) => ({ v, s: score(v, lang) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.v);
  return ranked[variant] ?? ranked[0];
}

/** Sentences (or shorter pieces of very long ones) to read one after another. */
export function chunks(text: string, max = 180): string[] {
  const parts = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?…;:])\s+/);
  const out: string[] = [];
  for (const p of parts) {
    if (!p) continue;
    if (p.length <= max) {
      out.push(p);
      continue;
    }
    let rest = p;
    while (rest.length > max) {
      const cut = Math.max(rest.lastIndexOf(', ', max), rest.lastIndexOf(' ', max));
      const at = cut > max / 3 ? cut + 1 : max;
      out.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest) out.push(rest);
  }
  return out;
}

let token = 0;

function sayOne(text: string, voice: SpeechSynthesisVoice | undefined, lang: Lang, rate: number, my: number): Promise<void> {
  return new Promise((resolve) => {
    if (my !== token) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voice?.lang ?? (lang === 'fr' ? 'fr-CA' : 'en-US');
    if (voice) u.voice = voice;
    u.rate = rate;
    u.pitch = 1;
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      resolve();
    };
    u.onend = done;
    u.onerror = done;
    // Some browsers never fire onend: fall back to a generous timer.
    setTimeout(done, 1500 + (text.length * 85) / rate);
    window.speechSynthesis.speak(u);
  });
}

/** Speak and resolve when finished (or after a reading pause if speech is off/unavailable). */
export async function speak(text: string, lang: Lang, opts: { variant?: 0 | 1; rate?: number; muted?: boolean } = {}): Promise<void> {
  const my = ++token;
  if (!speechAvailable() || opts.muted) {
    // Give readers time to read the captions.
    return new Promise((r) => setTimeout(r, Math.min(9000, 1200 + text.length * 45)));
  }
  window.speechSynthesis.cancel();
  const voice = await bestVoice(lang, opts.variant ?? 0);
  // Right after cancel(), some phones drop the next utterance: give it a beat.
  await new Promise((r) => setTimeout(r, 60));
  // A natural voice reads well at its normal speed; a robotic one is easier to follow a bit slower.
  const rate = (opts.rate ?? 1) * (voice && (NATURAL.test(voice.name) || ONLINE.test(voice.name)) ? 1 : 0.94);
  for (const piece of chunks(text)) {
    if (my !== token) return;
    await sayOne(piece, voice, lang, rate, my);
  }
}

export function stopSpeaking() {
  token++;
  if (speechAvailable()) window.speechSynthesis.cancel();
}
