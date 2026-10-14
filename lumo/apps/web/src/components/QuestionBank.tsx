import type { Concept, Locale } from '@lumo/core';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { buildBank } from '../local/bank';
import { canAskClaude } from '../local/reader';
import { Lumo } from './Lumo';

const started = new Set<string>(); // one automatic build per deck per visit

/**
 * Website: the deck's bank of real test questions written by Claude. Built automatically when
 * Claude can already be asked without a pop-up; otherwise one tap.
 */
export function QuestionBank({ deckId, bankSize, onBuilt }: { deckId: string; bankSize: number; onBuilt: () => void }) {
  const { t } = useTranslation();
  const [ai, setAi] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ctl = useRef<AbortController | null>(null);

  const build = async () => {
    setError(null);
    ctl.current = new AbortController();
    try {
      const d = await api<{ deck: { id: string; title: string; subject: string; language: Locale }; concepts: Concept[] }>(`/api/decks/${deckId}/offline`);
      const questions = await buildBank({ ...d.deck, concepts: d.concepts }, { signal: ctl.current.signal, onProgress: (done, total) => setProgress({ done, total }) });
      await api(`/api/local/decks/${deckId}/bank`, { method: 'PUT', body: { questions } });
      setProgress(null);
      onBuilt();
    } catch (e) {
      setProgress(null);
      const code = (e as { code?: string }).code ?? 'upstream_error';
      if (code !== 'cancelled') setError(t(`bank.errors.${code}`, { defaultValue: t('bank.errors.upstream_error') }));
    }
  };

  useEffect(() => {
    let alive = true;
    void (async () => {
      const ok = await canAskClaude();
      if (!alive) return;
      setAi(ok);
      if (!ok || bankSize > 0 || started.has(deckId)) return;
      // Start on its own only when it won't pop up a permission sheet.
      const perms = await (window as unknown as { claude?: { use?: (n: string) => Promise<{ state?: (n: string) => Promise<string> } | null> } }).claude?.use?.('permissions').catch(() => null);
      const state = perms?.state ? await perms.state('sample').catch(() => 'prompt') : 'granted';
      if (alive && state === 'granted') {
        started.add(deckId);
        void build();
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId, bankSize]);

  useEffect(() => () => ctl.current?.abort(), []);

  if (!ai) return null;
  if (progress) {
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <section role="status" className="space-y-2 rounded-3xl bg-gradient-to-br from-brand/20 to-fuchsia-400/15 p-4 ring-1 ring-brand/40">
        <div className="flex items-center gap-3">
          <Lumo size={44} mood="thinking" />
          <div className="min-w-0 flex-1">
            <p className="font-black">{t('bank.writing')}</p>
            <p className="text-xs text-muted">{t('bank.writingBody')}</p>
          </div>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-surface-2" aria-hidden>
          <div className="h-full rounded-full bg-gradient-to-r from-brand to-fuchsia-500 transition-[width] duration-700" style={{ width: `${Math.max(6, pct)}%` }} />
        </div>
      </section>
    );
  }
  return (
    <section className="flex items-center gap-3 rounded-3xl bg-surface p-3.5 ring-1 ring-line">
      <span className="text-2xl" aria-hidden>
        {bankSize ? '🎓' : '✨'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-black">{bankSize ? t('bank.ready', { count: bankSize }) : t('bank.cta')}</p>
        <p className="text-xs text-muted">{error ?? (bankSize ? t('bank.readyBody') : t('bank.ctaBody'))}</p>
      </div>
      <button type="button" onClick={() => void build()} className="shrink-0 rounded-xl bg-brand px-3 py-2 text-sm font-black text-brand-ink">
        {bankSize ? t('bank.redo') : t('bank.make')}
      </button>
    </section>
  );
}
