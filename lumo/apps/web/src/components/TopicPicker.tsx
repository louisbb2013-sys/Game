import type { ConceptInput } from '@lumo/core';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * After Lumo reads the notes: choose what goes in the deck (whole topics, or single parts of one), so
 * the questions are on what the test covers. ★ = facts the notes stress (highlighted, underlined…).
 */
export function TopicPicker({ concepts, onDone, onCancel }: { concepts: ConceptInput[]; onDone: (kept: ConceptInput[]) => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const [off, setOff] = useState<Set<number>>(() => new Set());
  const topics = useMemo(() => {
    const m = new Map<string, number[]>();
    concepts.forEach((c, i) => m.set(c.topic || '', [...(m.get(c.topic || '') ?? []), i]));
    return [...m.entries()];
  }, [concepts]);
  const facts = (i: number) => Math.max(1, concepts[i]!.keyPoints.length);
  const stars = (i: number) => concepts[i]!.stars?.length ?? 0;
  const kept = concepts.flatMap((c, i) => (off.has(i) ? [] : [c]));
  const keptFacts = concepts.reduce((a, _, i) => a + (off.has(i) ? 0 : facts(i)), 0);
  const flip = (ids: number[], on: boolean) =>
    setOff((o) => {
      const n = new Set(o);
      for (const i of ids) {
        if (on) n.delete(i);
        else n.add(i);
      }
      return n;
    });
  return (
    <div role="dialog" aria-modal="true" aria-label={t('picker.title')} className="fixed inset-0 z-[70] overflow-y-auto bg-bg" data-testid="topic-picker">
      <div className="mx-auto max-w-lg space-y-4 p-4 pb-28">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onCancel} aria-label={t('common.close')} className="grid size-11 place-items-center rounded-full bg-surface-2 text-xl font-black ring-1 ring-line">
            ←
          </button>
          <h2 className="text-2xl font-black">📋 {t('picker.title')}</h2>
        </div>
        <p className="text-sm text-muted">{t('picker.body', { topics: topics.length, facts: concepts.reduce((a, _, i) => a + facts(i), 0) })}</p>
        <div className="flex gap-2 text-sm font-black">
          <button type="button" onClick={() => setOff(new Set())} className="rounded-full bg-surface-2 px-3 py-1 ring-1 ring-line">
            ✅ {t('picker.all')}
          </button>
          <button type="button" onClick={() => setOff(new Set(concepts.map((_, i) => i)))} className="rounded-full bg-surface-2 px-3 py-1 ring-1 ring-line">
            ⬜ {t('picker.none')}
          </button>
        </div>
        {topics.map(([topic, ids]) => {
          const on = ids.filter((i) => !off.has(i)).length;
          const n = ids.reduce((a, i) => a + facts(i), 0);
          const st = ids.reduce((a, i) => a + stars(i), 0);
          return (
            <details key={topic} className="rounded-2xl bg-surface ring-1 ring-line" data-testid="picker-topic">
              <summary className="flex cursor-pointer items-center gap-3 p-3">
                <input
                  type="checkbox"
                  checked={on === ids.length}
                  ref={(el) => {
                    if (el) el.indeterminate = on > 0 && on < ids.length;
                  }}
                  onChange={(e) => flip(ids, e.target.checked)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={topic || t('picker.general')}
                  className="size-5 accent-brand"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-black">{topic || t('picker.general')}</span>
                  <span className="block text-xs text-muted">
                    {t('picker.count', { count: n })}
                    {st ? ` · ★ ${t('picker.stressed', { count: st })}` : ''}
                  </span>
                </span>
                <span className="text-xs font-bold text-muted">▾</span>
              </summary>
              <ul className="space-y-1 px-3 pb-3">
                {ids.map((i) => (
                  <li key={i}>
                    <label className="flex items-start gap-2 rounded-xl px-2 py-1.5 hover:bg-surface-2">
                      <input type="checkbox" checked={!off.has(i)} onChange={(e) => flip([i], e.target.checked)} className="mt-1 size-4 accent-brand" />
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="font-bold">{concepts[i]!.term}</span>
                        <span className="text-muted">
                          {' '}
                          · {t('picker.count', { count: facts(i) })}
                          {stars(i) ? ' ★' : ''}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </div>
      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-bg/95 p-3 backdrop-blur">
        <button type="button" disabled={kept.length === 0} onClick={() => onDone(kept)} className="btn-gold mx-auto block w-full max-w-lg rounded-2xl py-3.5 text-lg font-black disabled:opacity-50" data-testid="picker-done">
          ✨ {t('picker.go', { count: keptFacts })}
        </button>
      </div>
    </div>
  );
}
