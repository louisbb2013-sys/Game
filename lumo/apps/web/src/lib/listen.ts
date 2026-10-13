/** Speech-to-text where the browser has it (Chrome, Edge, Safari). Audio stays with the browser's own service. */
type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

const Ctor = (): (new () => Recognition) | undefined =>
  typeof window === 'undefined' ? undefined : ((window as unknown as Record<string, unknown>).SpeechRecognition ?? (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as (new () => Recognition) | undefined;

export const listenAvailable = () => !!Ctor();

let current: Recognition | null = null;

/** Listen once; resolves with what was said ('' on silence, error or timeout). */
export function listenOnce(lang: 'en' | 'fr', timeoutMs = 7000): Promise<string> {
  const C = Ctor();
  if (!C) return Promise.resolve('');
  stopListening();
  return new Promise((resolve) => {
    const r = new C();
    current = r;
    r.lang = lang === 'fr' ? 'fr-FR' : 'en-US';
    r.interimResults = false;
    r.maxAlternatives = 1;
    let text = '';
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (current === r) current = null;
      resolve(text.trim());
    };
    const timer = setTimeout(() => {
      try {
        r.stop();
      } catch {
        /* ignore */
      }
      done();
    }, timeoutMs);
    r.onresult = (e) => {
      text = Array.from(e.results)
        .map((x) => x[0]?.transcript ?? '')
        .join(' ');
    };
    r.onerror = done;
    r.onend = done;
    try {
      r.start();
    } catch {
      done();
    }
  });
}

export function stopListening() {
  try {
    current?.stop();
  } catch {
    /* ignore */
  }
  current = null;
}
