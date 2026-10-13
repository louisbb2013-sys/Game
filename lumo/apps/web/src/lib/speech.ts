/** Text-to-speech for videos and podcasts (browser voices; works offline on most devices). */
export const speechAvailable = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

function pickVoice(lang: 'en' | 'fr', variant: 0 | 1): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang));
  return voices[variant % Math.max(1, voices.length)] ?? voices[0];
}

let token = 0;

/** Speak and resolve when finished (or immediately if speech is off/unavailable). */
export function speak(text: string, lang: 'en' | 'fr', opts: { variant?: 0 | 1; rate?: number; muted?: boolean } = {}): Promise<void> {
  const my = ++token;
  if (!speechAvailable() || opts.muted) {
    // Give readers time to read the captions.
    return new Promise((r) => setTimeout(r, Math.min(9000, 1200 + text.length * 45)));
  }
  window.speechSynthesis.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'fr' ? 'fr-FR' : 'en-US';
    const v = pickVoice(lang, opts.variant ?? 0);
    if (v) u.voice = v;
    u.pitch = opts.variant === 1 ? 1.25 : 1;
    u.rate = opts.rate ?? 1;
    const done = () => my === token && resolve();
    u.onend = done;
    u.onerror = done;
    // Some browsers never fire onend: fall back to a generous timer.
    setTimeout(done, 2000 + text.length * 90);
    window.speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  token++;
  if (speechAvailable()) window.speechSynthesis.cancel();
}
