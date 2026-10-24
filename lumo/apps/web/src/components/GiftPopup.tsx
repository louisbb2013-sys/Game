import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useConfetti } from '../lib/confetti';
import { takeGift, useGifts } from '../lib/gifts';
import { play } from '../lib/sound';
import { Creature3D } from './Pet3D';

/** A gift from the creator arrived (a Lumo-rarity pet): a big moment, wherever I am in Lumoly. */
export function GiftPopup() {
  const { t } = useTranslation();
  const { gifts } = useGifts();
  const pet = gifts[0];
  useConfetti(!!pet);
  useEffect(() => {
    if (pet) play('win');
  }, [pet]);
  if (!pet) return null;
  const name = pet.name || t(`pets.species.${pet.species}`);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="gift-title" className="fixed inset-0 z-[85] grid place-items-center bg-night/80 p-6 backdrop-blur-sm" data-testid="creator-gift">
      <div className="pet-screen relative w-full max-w-sm rounded-3xl bg-surface p-6 text-center shadow-2xl ring-2 ring-amber-glow" data-rarity="lumo">
        <p className="text-sm font-black text-amber-glow">🎁 {t('gifts.fromCreator')}</p>
        <div className="pet-stage relative mx-auto mt-3 grid size-52 place-items-center rounded-3xl">
          <span className="hatch-rays absolute inset-2" aria-hidden />
          <Creature3D species={pet.species} rarity="lumo" className="absolute inset-0" label={name}>
            <span className="hatch-pop relative text-8xl">{pet.emoji}</span>
          </Creature3D>
        </div>
        <span className="rarity-lumo mt-3 inline-block rounded-full px-3 py-1 text-xs font-black text-night">{t('pets.rarity.lumo')}</span>
        <h2 id="gift-title" className="mt-2 text-2xl font-black">
          {t('gifts.title', { name })}
        </h2>
        <p className="mt-1 text-sm text-muted">{t('gifts.body')}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link to="/pets" onClick={takeGift} className="rounded-2xl bg-surface-2 py-3 font-black">
            {t('egg.seePets')}
          </Link>
          <button type="button" autoFocus onClick={takeGift} className="rounded-2xl bg-brand py-3 font-black text-brand-ink">
            {t('gifts.thanks')}
          </button>
        </div>
      </div>
    </div>
  );
}
