import { usePageMeta } from '../hooks/usePageMeta';
import { creatureBySlug } from '../content/creatures';
import { CreatureOrb } from '../components/CreatureOrb';
import { Arrow, ButtonLink } from '../components/Button';
import styles from './NotFound.module.css';

export default function NotFound() {
  usePageMeta('Page introuvable', 'Cette page s’est égarée quelque part entre deux étoiles.', '/404');
  return (
    <section className={`container ${styles.wrap}`}>
      <div className={styles.orb}>
        <CreatureOrb creature={creatureBySlug('galet')!} alt="Galet, une créature grise, posée là, tranquille" />
      </div>
      <p className="eyebrow">Erreur 404</p>
      <h1 className={styles.title}>
        Cette page s’est <em>égarée.</em>
      </h1>
      <p className="lede">Elle a dû suivre une comète. Galet, lui, n’a pas bougé : il vous raccompagne volontiers.</p>
      <ButtonLink to="/" icon={<Arrow />}>
        Retour à l’accueil
      </ButtonLink>
    </section>
  );
}
