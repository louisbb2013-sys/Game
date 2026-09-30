import { lazy, Suspense } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import { useQuality } from '../hooks/useQuality';
import { creatureBySlug, sortedCreatures } from '../content/creatures';
import { collections } from '../content/collections';
import { OrbitRings } from '../components/OrbitRings';
import { CreatureOrb } from '../components/CreatureOrb';
import { Reveal } from '../components/Reveal';
import { Arrow, ButtonLink } from '../components/Button';
import styles from './About.module.css';

const AboutScene = lazy(() => import('../three/AboutScene'));
const EASE = [0.22, 1, 0.36, 1] as const;

const CHAPTERS = [
  {
    n: 'I',
    title: 'La première apparition',
    text: [
      'Tout a commencé un soir d’hiver, sur le rebord d’une fenêtre. Une petite boule de fourrure lavande était là, parfaitement immobile, comme si elle attendait quelqu’un.',
      'Elle ne portait ni étiquette, ni visage. Juste une mèche sur le dessus, qui bougeait quand on ouvrait la fenêtre. Nous l’avons appelée Brume, et nous lui avons donné le numéro 001.',
    ],
    art: 'brume',
  },
  {
    n: 'II',
    title: 'Le choix du silence',
    text: [
      'On nous demande souvent pourquoi elles n’ont pas de visage. La réponse est simple : un visage dit à votre place ce que la créature ressent.',
      'Sans yeux ni bouche, chaque Minitaure devient un peu miroir. Triste un jour, rieuse le lendemain — c’est vous qui décidez, et c’est très bien ainsi.',
    ],
    art: 'minuit',
  },
  {
    n: 'III',
    title: 'L’atelier',
    text: [
      'Chaque créature est coulée en résine teintée, puis recouverte d’un flocage court et dense qui imite la fourrure. Il faut plusieurs passages, et beaucoup de patience, pour que la lumière s’y accroche comme il faut.',
      'Le numéro est gravé sous le socle, à la main. Aucune n’est tout à fait identique à une autre : les fibres se posent toujours un peu à leur façon.',
    ],
    art: 'abricot',
  },
];

export default function About() {
  usePageMeta(
    'À propos',
    'L’histoire des Minitaure : des créatures sans visage venues d’une douce nébuleuse, fabriquées et numérotées à la main.',
    '/a-propos',
  );
  const q = useQuality();
  const reduced = useReducedMotion();
  const drifters = ['comete', 'reglisse', 'ecume'].map((s) => creatureBySlug(s)!);

  return (
    <>
      <section className={`${styles.hero} night`} data-tone="night" aria-labelledby="about-title">
        {q.tier !== 'static' ? (
          <Suspense fallback={null}>
            <AboutScene drifters={drifters} className={styles.heroCanvas} />
          </Suspense>
        ) : (
          <div className={styles.staticSky} aria-hidden="true" />
        )}
        <OrbitRings className={styles.heroRings} tone="night" />
        <div className={`container ${styles.heroInner}`}>
          <motion.p
            className="eyebrow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
          >
            À propos
          </motion.p>
          <h1 id="about-title" className={styles.title}>
            {['Une histoire', 'qui commence', 'la nuit.'].map((line, i) => (
              <span key={line} className={styles.line}>
                <motion.span
                  className={i === 2 ? styles.em : undefined}
                  initial={reduced ? { opacity: 0 } : { y: '110%' }}
                  animate={reduced ? { opacity: 1 } : { y: '0%' }}
                  transition={{ duration: reduced ? 0.5 : 1.2, delay: 0.25 + i * 0.12, ease: EASE }}
                >
                  {line}
                </motion.span>
              </span>
            ))}
          </h1>
          <motion.p
            className={`lede ${styles.heroLede}`}
            initial={{ opacity: 0, y: reduced ? 0 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.8, ease: EASE }}
          >
            Quelque part entre deux étoiles très calmes, il existe une nébuleuse si douce qu’elle fabrique de la fourrure. De temps en temps, un petit morceau s’en détache — et arrive jusqu’à nous.
          </motion.p>
        </div>
      </section>

      <div className={styles.chapters}>
        {CHAPTERS.map((ch, i) => (
          <Chapter key={ch.n} chapter={ch} flip={i % 2 === 1} />
        ))}
      </div>

      <section className={`container ${styles.figures}`} aria-labelledby="figures-title">
        <h2 id="figures-title" className="visually-hidden">
          Quelques chiffres
        </h2>
        <dl className={styles.stats}>
          {[
            [String(sortedCreatures.length), 'créatures au catalogue'],
            [String(collections.length), 'constellations'],
            ['0', 'visage, et c’est voulu'],
            ['∞', 'patience à l’atelier'],
          ].map(([v, l], i) => (
            <Reveal key={l} kind="blur" delay={i * 0.1} className={styles.stat}>
              <dt className="visually-hidden">{l}</dt>
              <dd>
                <span className={styles.statNum} aria-hidden="true">
                  {v}
                </span>
                <span className={styles.statLabel}>
                  <span className="visually-hidden">{v} </span>
                  {l}
                </span>
              </dd>
            </Reveal>
          ))}
        </dl>
      </section>

      <section className={`container ${styles.end}`} aria-labelledby="end-title">
        <Reveal kind="scale" className={styles.endCard}>
          <OrbitRings className={styles.endRings} />
          <h2 id="end-title" className={styles.endTitle}>
            Le catalogue continue de grandir, <em>une créature à la fois.</em>
          </h2>
          <div className={styles.endActions}>
            <ButtonLink to="/creatures" icon={<Arrow />}>
              Rencontrer les créatures
            </ButtonLink>
            <ButtonLink to="/contact" variant="ghost">
              Nous écrire
            </ButtonLink>
          </div>
        </Reveal>
      </section>
    </>
  );
}

function Chapter({ chapter, flip }: { chapter: (typeof CHAPTERS)[number]; flip: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [60, -60]);
  const rot = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [-8, 8]);
  const c = creatureBySlug(chapter.art)!;
  return (
    <section ref={ref} className={`container ${styles.chapter}`} data-flip={flip || undefined} aria-labelledby={`ch-${chapter.n}`}>
      <div className={styles.chArt} aria-hidden="true">
        <motion.div className={styles.chRing} style={{ rotate: rot }} />
        <motion.div style={{ y }} className={styles.chOrb}>
          <CreatureOrb creature={c} alt="" />
        </motion.div>
        <span className={styles.chNum}>{chapter.n}</span>
      </div>
      <div className={styles.chCopy}>
        <Reveal kind="fade">
          <p className="eyebrow">Chapitre {chapter.n}</p>
        </Reveal>
        <h2 id={`ch-${chapter.n}`} className={styles.chTitle}>
          <Reveal kind="mask">{chapter.title}</Reveal>
        </h2>
        {chapter.text.map((p, i) => (
          <Reveal key={i} kind="rise" delay={0.1 + i * 0.1}>
            <p className={styles.chText}>{p}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
