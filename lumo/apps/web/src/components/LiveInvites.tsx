import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { play } from '../lib/sound';
import { useLiveInvites, useNames } from '../local/together';

/** A friend invited me to a Live game: a pop-up wherever I am in Revio, one tap to join (no code). */
export function LiveInvitePopup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const invites = useLiveInvites();
  const names = useNames(invites.map((i) => i.from));
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(sessionStorage.getItem('lumo.invites.no') ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  });
  const inv = invites.find((i) => !dismissed.has(i.code) && !pathname.startsWith(`/live/${i.code}`));
  if (!inv) return null;
  const dismiss = () => {
    const next = new Set([...dismissed, inv.code]);
    setDismissed(next);
    try {
      sessionStorage.setItem('lumo.invites.no', JSON.stringify([...next]));
    } catch {
      /* fine: it just may show again after a reload */
    }
  };
  return (
    <div role="dialog" aria-labelledby="invite-pop" className="sheet-up fixed inset-x-3 bottom-24 z-50 mx-auto max-w-md rounded-3xl royal p-4 text-white shadow-2xl ring-2 ring-amber-glow lg:bottom-6" data-testid="live-invite">
      <div className="flex items-center gap-3">
        <span className="lumo-bounce text-4xl" aria-hidden>
          ⚡
        </span>
        <div className="min-w-0 flex-1">
          <p id="invite-pop" className="font-black">
            {t('live.invitedBy', { name: names[inv.from]?.name || t('together.someone') })}
          </p>
          <p className="truncate text-sm font-bold opacity-85">{inv.title}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <button
          type="button"
          onClick={() => {
            play('tap');
            dismiss();
            navigate(`/live/${inv.code}`);
          }}
          className="rounded-2xl bg-amber-glow py-3 text-lg font-black text-night"
        >
          {t('live.joinNow')}
        </button>
        <button type="button" onClick={dismiss} className="rounded-2xl bg-white/15 px-4 font-black">
          {t('live.notNow')}
        </button>
      </div>
    </div>
  );
}
