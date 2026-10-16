import { ITEMS, type ItemId } from '@lumo/core';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { CoinIcon } from '../components/icons';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useRewards } from '../lib/rewards';
import { play } from '../lib/sound';

interface Inventory {
  coins: number;
  items: { id: ItemId; qty: number; emoji: string }[];
  chests: { id: string; kind: 'common' | 'rare' | 'epic'; source: string }[];
  boostUntil: string | null;
  theme: string;
}
interface Loot {
  kind: string;
  loot: { coins: number; items: { id: ItemId; qty: number }[] };
  badges: string[];
}

const CHEST_EMOJI = { common: '🎁', rare: '💼', epic: '👑' };
const SHOP_ORDER: ItemId[] = ['streak_freeze', 'heart_refill', 'xp_boost', 'pet_food', 'egg_common', 'egg_rare', 'chest_common', 'theme_sunset', 'theme_ocean', 'theme_forest'];

export function Shop() {
  const { t } = useTranslation();
  const { refresh } = useAuth();
  const showRewards = useRewards();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'mine' ? 'mine' : 'shop';
  const [inv, setInv] = useState<Inventory | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [opening, setOpening] = useState<{ kind: string; result: Loot | null } | null>(null);

  const load = useCallback(() => api<Inventory>('/api/game/inventory').then(setInv), []);
  useEffect(() => void load(), [load]);

  const act = async (fn: () => Promise<unknown>, okText: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: okText });
      play('correct');
    } catch (e) {
      setMsg({ ok: false, text: t(`shop.errors.${e instanceof ApiError ? e.code : 'network'}`, { defaultValue: t('signin.errors.network') }) });
      play('wrong');
    }
    await load();
    void refresh();
  };

  const open = async (chest: Inventory['chests'][number]) => {
    setOpening({ kind: chest.kind, result: null });
    const [r] = await Promise.all([api<Loot>(`/api/game/chests/${chest.id}/open`, { method: 'POST' }), new Promise((res) => setTimeout(res, 1300))]);
    setOpening({ kind: chest.kind, result: r });
    play('finish');
    showRewards({ xp: 0, levelUp: null, badges: r.badges, questsCompleted: [] });
    await load();
    void refresh();
  };

  if (!inv) return <p className="pt-10 text-center font-bold text-muted">{t('common.loading')}</p>;
  const owned = new Map(inv.items.map((i) => [i.id, i.qty]));

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-black">{t('shop.title')}</h1>
        <span className="flex items-center gap-1 rounded-full bg-surface px-3 py-1 text-lg font-black ring-1 ring-line">
          <CoinIcon size={22} /> {inv.coins}
        </span>
      </header>
      <div role="tablist" className="grid grid-cols-2 rounded-2xl bg-surface p-1 ring-1 ring-line">
        {(['shop', 'mine'] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setParams(k === 'mine' ? { tab: 'mine' } : {})} className={`rounded-xl py-2 font-black ${tab === k ? 'bg-brand text-brand-ink' : 'text-muted'}`}>
            {t(`shop.tab_${k}`)}
            {k === 'mine' && inv.chests.length > 0 && <span className="ml-1 rounded-full bg-amber-glow px-1.5 text-xs text-night">{inv.chests.length}</span>}
          </button>
        ))}
      </div>
      {msg && (
        <p role="status" className={`rounded-xl px-3 py-2 text-sm font-bold ${msg.ok ? 'bg-good/10 text-good' : 'bg-bad/10 text-bad'}`}>
          {msg.text}
        </p>
      )}

      {tab === 'shop' ? (
        <div className="grid grid-cols-2 gap-3">
          {SHOP_ORDER.map((id) => {
            const def = ITEMS[id];
            const isTheme = def.kind === 'cosmetic';
            const have = owned.get(id) ?? 0;
            return (
              <div key={id} className="flex flex-col gap-1.5 rounded-3xl bg-surface p-3.5 ring-1 ring-line">
                <span className="text-4xl">{def.emoji}</span>
                <span className="font-black">{t(`items.${id}.name`)}</span>
                <span className="flex-1 text-xs text-muted">{t(`items.${id}.desc`)}</span>
                {have > 0 && <span className="text-xs font-bold text-brand">{t('shop.owned', { n: have })}</span>}
                <button
                  disabled={(isTheme && have > 0) || inv.coins < (def.price ?? 0)}
                  onClick={() => void act(() => api('/api/game/shop/buy', { method: 'POST', body: { itemId: id } }), t('shop.bought', { item: t(`items.${id}.name`) }))}
                  className="flex items-center justify-center gap-1 rounded-xl bg-brand py-2 font-black text-brand-ink disabled:opacity-40"
                  aria-label={t('shop.buyFor', { item: t(`items.${id}.name`), price: def.price })}
                >
                  <CoinIcon size={18} /> {def.price}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          <section>
            <h2 className="mb-2 font-black">{t('shop.chests')}</h2>
            {inv.chests.length === 0 ? (
              <p className="text-sm text-muted">{t('shop.noChests')}</p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {inv.chests.map((c) => (
                  <button key={c.id} onClick={() => void open(c)} className="flex flex-col items-center gap-1 rounded-3xl bg-surface p-3 ring-2 ring-amber-glow/50 hover:ring-amber-glow" aria-label={t('shop.openChest', { kind: t(`chests.${c.kind}`) })}>
                    <span className="lumo-float text-5xl">{CHEST_EMOJI[c.kind]}</span>
                    <span className="text-xs font-black">{t(`chests.${c.kind}`)}</span>
                    <span className="text-[0.65rem] font-bold text-brand">{t('shop.tapToOpen')}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
          <section>
            <h2 className="mb-2 font-black">{t('shop.items')}</h2>
            {inv.boostUntil && <p className="mb-2 rounded-xl bg-amber-glow/20 px-3 py-2 text-sm font-bold">⚡ {t('shop.boostActive', { time: new Date(inv.boostUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}</p>}
            {inv.items.length === 0 ? (
              <p className="text-sm text-muted">{t('shop.noItems')}</p>
            ) : (
              <ul className="space-y-2">
                {inv.items.map((i) => {
                  const def = ITEMS[i.id];
                  const isTheme = def.kind === 'cosmetic';
                  return (
                    <li key={i.id} className="flex items-center gap-3 rounded-2xl bg-surface p-3 ring-1 ring-line">
                      <span className="text-3xl">{def.emoji}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-black">
                          {t(`items.${i.id}.name`)} {!isTheme && <span className="text-muted">×{i.qty}</span>}
                        </span>
                        <span className="block text-xs text-muted">{t(`items.${i.id}.desc`)}</span>
                      </span>
                      {i.id === 'pet_food' ? (
                        <Link to="/pets" className="rounded-xl bg-surface-2 px-3 py-2 text-sm font-black">
                          {t('shop.feedPet')}
                        </Link>
                      ) : isTheme ? (
                        <button
                          disabled={inv.theme === i.id}
                          onClick={() => void act(() => api('/api/game/items/use', { method: 'POST', body: { itemId: i.id } }), t('shop.themeOn'))}
                          className="rounded-xl bg-brand px-3 py-2 text-sm font-black text-brand-ink disabled:opacity-40"
                        >
                          {inv.theme === i.id ? t('shop.wearing') : t('shop.wear')}
                        </button>
                      ) : (
                        <button
                            onClick={() => void act(() => api('/api/game/items/use', { method: 'POST', body: { itemId: i.id } }), t(`shop.used_${def.kind === 'egg' ? 'egg' : i.id}`, { defaultValue: t('shop.used') }))}
                            className="rounded-xl bg-brand px-3 py-2 text-sm font-black text-brand-ink"
                          >
                            {def.kind === 'egg' ? t('shop.hatch') : t('shop.use')}
                          </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {opening && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={t('shop.opening')}>
          <div className="w-full max-w-sm space-y-4 rounded-3xl royal p-6 text-center text-white shadow-2xl ring-2 ring-amber-glow">
            {!opening.result ? (
              <>
                <span className="shake inline-block text-8xl" style={{ animationIterationCount: 'infinite' }}>
                  {CHEST_EMOJI[opening.kind as keyof typeof CHEST_EMOJI]}
                </span>
                <p className="font-black">{t('shop.opening')}</p>
              </>
            ) : (
              <>
                <span className="combo-pop inline-block text-7xl">✨</span>
                <h2 className="text-2xl font-black">{t('shop.youGot')}</h2>
                <ul className="space-y-2">
                  <li className="pop-in flex items-center justify-center gap-2 rounded-2xl bg-white/15 p-3 text-xl font-black">
                    <CoinIcon size={28} /> +{opening.result.loot.coins}
                  </li>
                  {opening.result.loot.items.map((i, k) => (
                    <li key={i.id} className="pop-in flex items-center justify-center gap-2 rounded-2xl bg-white/15 p-3 text-lg font-black" style={{ animationDelay: `${0.2 * (k + 1)}s` }}>
                      <span className="text-3xl">{ITEMS[i.id].emoji}</span> {t(`items.${i.id}.name`)} ×{i.qty}
                    </li>
                  ))}
                </ul>
                <button onClick={() => setOpening(null)} className="w-full rounded-2xl bg-amber-glow py-3 font-black text-night">
                  {t('shop.awesome')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
