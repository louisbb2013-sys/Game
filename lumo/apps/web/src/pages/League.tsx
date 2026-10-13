import { LEAGUE_TIERS } from '@lumo/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Lumo } from '../components/Lumo';
import { api } from '../lib/api';
import { TIER_STYLE } from '../lib/rewards';

interface Member {
  username: string;
  avatar: string;
  weeklyXp: number;
  rank: number;
  zone: 'promoted' | 'stayed' | 'demoted';
  me: boolean;
}
interface LeagueView {
  tier: string;
  endsAt: string;
  zones: { promote: number; demote: number };
  members: Member[];
  lastResult: { rank: number; outcome: 'promoted' | 'stayed' | 'demoted'; fromTier: string; toTier: string } | null;
}
interface GlobalRow {
  rank: number;
  username: string;
  tier: string;
  weeklyXp: number;
  me: boolean;
}

function timeLeft(iso: string) {
  const ms = Math.max(0, new Date(iso).getTime() - Date.now());
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  return { d, h };
}

export function League() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'league' | 'global'>('league');
  const [view, setView] = useState<LeagueView | null>(null);
  const [global, setGlobal] = useState<GlobalRow[] | null>(null);
  const [result, setResult] = useState<LeagueView['lastResult']>(null);

  useEffect(() => {
    api<LeagueView>('/api/game/league').then((v) => {
      setView(v);
      setResult(v.lastResult);
    });
  }, []);
  useEffect(() => {
    if (tab === 'global' && !global) api<{ rows: GlobalRow[] }>('/api/game/leaderboard/global').then((r) => setGlobal(r.rows));
  }, [tab, global]);

  if (!view) return <p className="pt-10 text-center font-bold text-muted">{t('common.loading')}</p>;
  const style = TIER_STYLE[view.tier]!;
  const left = timeLeft(view.endsAt);
  const n = view.members.length;

  return (
    <div className="space-y-4">
      {/* tier ladder */}
      <div className="flex justify-center gap-1.5" aria-hidden>
        {LEAGUE_TIERS.map((tier) => (
          <span key={tier} className={`grid size-9 place-items-center rounded-xl text-lg transition ${tier === view.tier ? 'scale-125 bg-surface shadow ring-2 ring-amber-glow' : 'opacity-40 grayscale'}`}>
            {TIER_STYLE[tier]!.emoji}
          </span>
        ))}
      </div>
      <header className="text-center">
        <h1 className="text-2xl font-black" style={{ color: style.color }}>
          {t('league.title', { tier: t(`leagues.${view.tier}`) })}
        </h1>
        <p className="text-sm font-bold text-muted">{t('league.endsIn', { d: left.d, h: left.h })}</p>
      </header>

      <div role="tablist" className="grid grid-cols-2 rounded-2xl bg-surface p-1 ring-1 ring-line">
        {(['league', 'global'] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-xl py-2 font-black ${tab === k ? 'bg-brand text-brand-ink' : 'text-muted'}`}>
            {t(`league.tab_${k}`)}
          </button>
        ))}
      </div>

      {tab === 'league' ? (
        n === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-3xl bg-surface p-6 text-center ring-1 ring-line">
            <Lumo size={90} mood="thinking" />
            <p className="font-black">{t('league.notJoined')}</p>
            <p className="text-sm text-muted">{t('league.notJoinedBody')}</p>
            <Link to="/learn" className="mt-1 rounded-2xl bg-brand px-5 py-2.5 font-black text-brand-ink">
              {t('league.startStudying')}
            </Link>
          </div>
        ) : (
          <ol className="space-y-1.5">
            {view.members.map((m, i) => (
              <li key={m.username}>
                {i === view.zones.promote && view.zones.promote > 0 && <ZoneLine label={t('league.promotionZone')} tone="good" />}
                {i === n - view.zones.demote && view.zones.demote > 0 && <ZoneLine label={t('league.demotionZone')} tone="bad" />}
                <div className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ring-1 ${m.me ? 'bg-amber-glow/20 ring-amber-glow' : 'bg-surface ring-line'}`}>
                  <span className={`w-7 text-center font-black ${m.zone === 'promoted' ? 'text-good' : m.zone === 'demoted' ? 'text-bad' : 'text-muted'}`}>{m.rank}</span>
                  <span className="grid size-9 place-items-center rounded-full bg-night text-lg">✨</span>
                  <span className="min-w-0 flex-1 truncate font-bold">
                    {m.username} {m.me && <span className="text-xs text-muted">({t('league.you')})</span>}
                  </span>
                  <span className="font-black">{m.weeklyXp} XP</span>
                </div>
              </li>
            ))}
          </ol>
        )
      ) : (
        <ol className="space-y-1.5">
          {(global ?? []).map((r) => (
            <li key={r.rank} className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ring-1 ${r.me ? 'bg-amber-glow/20 ring-amber-glow' : 'bg-surface ring-line'}`}>
              <span className="w-7 text-center font-black text-muted">{r.rank}</span>
              <span className="text-lg">{TIER_STYLE[r.tier]?.emoji}</span>
              <span className="min-w-0 flex-1 truncate font-bold">{r.username}</span>
              <span className="font-black">{r.weeklyXp} XP</span>
            </li>
          ))}
          {global && global.length === 0 && <p className="text-center text-muted">{t('league.globalEmpty')}</p>}
        </ol>
      )}
      <p className="text-center text-xs text-muted">{t('league.rules')}</p>

      {result && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="pop-in w-full max-w-sm space-y-3 rounded-3xl bg-surface p-6 text-center">
            <span className="text-6xl">{result.outcome === 'promoted' ? '🎉' : result.outcome === 'demoted' ? '💪' : '👏'}</span>
            <h2 className="text-2xl font-black">{t(`league.result_${result.outcome}`, { tier: t(`leagues.${result.toTier}`) })}</h2>
            <p className="text-muted">{t('league.resultRank', { rank: result.rank })}</p>
            <button onClick={() => setResult(null)} className="w-full rounded-2xl bg-brand py-3 font-black text-brand-ink">
              {t('quiz.continue')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ZoneLine({ label, tone }: { label: string; tone: 'good' | 'bad' }) {
  return (
    <div className={`my-2 flex items-center gap-2 text-xs font-black uppercase ${tone === 'good' ? 'text-good' : 'text-bad'}`}>
      <span className="h-0.5 flex-1 rounded bg-current opacity-40" />
      {tone === 'good' ? '▲' : '▼'} {label}
      <span className="h-0.5 flex-1 rounded bg-current opacity-40" />
    </div>
  );
}
