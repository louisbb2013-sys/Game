import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';
import { useQuality } from '../hooks/useQuality';
import { site } from '../content/site';
import { creatureBySlug, formatNumber, sortedCreatures } from '../content/creatures';
import { collections } from '../content/collections';
import { Wordmark } from '../components/Wordmark';
import { Arrow, ButtonLink } from '../components/Button';
import { OrbitRings } from '../components/OrbitRings';
import { CreatureOrb } from '../components/CreatureOrb';
import { CreatureCard } from '../components/CreatureCard';
import { Reveal, RevealGroup, RevealItem } from '../components/Reveal';
import styles from './Home.module.css';

const HeroScene = lazy(() => import('../three/HeroScene'));
const CollectionScene = lazy(() => import('../three/CollectionScene'));

const EASE = [0.22, 1, 0.36, 1] as const;

export default function Home() {
  usePageMeta(site.name, site.description, '/');
  return (
    <>
      <Hero />
      <Featured />
      <Concept />
      <CollectionFlight />
      <Latest />
      <Closing />
    </>
  );
}

/* ------------------------------------------------------------------ */

function Hero() {
  const q = useQuality();
  const reduced = useReducedMotion();
  const [ready, setReady] = useState(false);
  const hero = creatureBySlug('brume')!;
  const satellites = ['praline', 'comete', 'pistache'].map((s) => creatureBySlug(s)!);
  const rise = (delay: number) =>
    reduced
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.6, delay: delay * 0.3 } }
      : { initial: { opacity: 0, y: 28 }, animate: { opacity: 1, y: 0 }, transition: { duration: 1.1, delay, ease: EASE } };

  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.heroGlow} aria-hidden="true" />
      <div className={`container ${styles.heroGrid}`}>
        <div className={styles.heroCopy}>
          <motion.p className="eyebrow" {...rise(0.2)}>
            Catalogue 2026 · {formatNumber(1)} à {formatNumber(sortedCreatures.length)}
          </motion.p>
          <h1 id="hero-title" className={styles.heroTitle}>
            <Wordmark animate delay={0.25} className={styles.heroMark} />
            <span className="visually-hidden"> — </span>
            <motion.span className={styles.heroLine} {...rise(1.05)}>
              De petites créatures <em>venues de très loin.</em>
            </motion.span>
          </h1>
          <motion.p className={`lede ${styles.heroLede}`} {...rise(1.25)}>
            Rondes, douces, un peu mystérieuses. Elles n’ont pas de visage : à vous d’imaginer ce qu’elles pensent.
          </motion.p>
          <motion.div className={styles.heroActions} {...rise(1.45)}>
            <ButtonLink to="/creatures" size="lg" icon={<Arrow />}>
              Découvrir les créatures
            </ButtonLink>
            <ButtonLink to="/boutique" size="lg" variant="ghost">
              Boutique
            </ButtonLink>
          </motion.div>
        </div>

        <div className={styles.heroStage}>
          <OrbitRings className={styles.heroRings} />
          {q.tier === 'static' ? (
            <StaticHero hero={hero} satellites={satellites} />
          ) : (
            <Suspense fallback={null}>
              <HeroScene
                hero={hero}
                satellites={satellites}
                onReady={() => setReady(true)}
                className={styles.heroCanvas}
              />
            </Suspense>
          )}
          {q.tier !== 'static' && <div className={styles.heroPlaceholder} data-hidden={ready || undefined} aria-hidden="true" />}
          <motion.p className={styles.heroCaption} {...rise(1.8)}>
            <span className="num">{formatNumber(hero.number)}</span>
            <span>
              <Link to={`/creatures/${hero.slug}`}>{hero.name}</Link> · Nébuleuse
            </span>
            {q.tier !== 'static' && <span className={styles.hint}>Faites-la tourner</span>}
          </motion.p>
        </div>
      </div>
      <motion.div className={styles.scrollCue} aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.2, duration: 1 }}>
        <span>Défiler</span>
        <i />
      </motion.div>
    </section>
  );
}

function StaticHero({ hero, satellites }: { hero: ReturnType<typeof creatureBySlug> & object; satellites: NonNullable<ReturnType<typeof creatureBySlug>>[] }) {
  return (
    <div className={styles.staticHero}>
      <CreatureOrb creature={hero} priority className={styles.staticMain} />
      {satellites.map((c, i) => (
        <CreatureOrb key={c.slug} creature={c} alt="" shadow={false} className={styles[`sat${i}`]} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Featured() {
  const featured = sortedCreatures.filter((c) => c.featured).slice(0, 4);
  return (
    <section className={`container ${styles.section}`} aria-labelledby="featured-title">
      <div className={styles.sectionHead}>
        <div>
          <Reveal kind="fade">
            <p className="eyebrow">À la une</p>
          </Reveal>
          <h2 id="featured-title" className={styles.h2}>
            <Reveal kind="mask">Quelques visages…</Reveal>
            <Reveal kind="mask" delay={0.08}>
              <em>enfin, pas tout à fait.</em>
            </Reveal>
          </h2>
        </div>
        <Reveal kind="rise" delay={0.2} className={styles.sectionAside}>
          <p>Chaque créature est unique : sa couleur, sa fourrure et ses petits détails suffisent à la reconnaître.</p>
          <Link to="/creatures" className={styles.more}>
            Tout le catalogue <Arrow />
          </Link>
        </Reveal>
      </div>
      <RevealGroup className={styles.featuredGrid} stagger={0.1}>
        {featured.map((c, i) => (
          <RevealItem key={c.slug} kind="scale" className={styles[`f${i}`]}>
            <CreatureCard creature={c} />
          </RevealItem>
        ))}
      </RevealGroup>
    </section>
  );
}

/* ------------------------------------------------------------------ */

const PRINCIPLES = [
  {
    n: '01',
    title: 'Sans visage',
    text: 'Ni yeux, ni bouche. Leur humeur se lit dans la lumière, la posture, la façon dont la fourrure bouge.',
    art: 'plain',
  },
  {
    n: '02',
    title: 'Une fourrure douce',
    text: 'Un pelage court et dense, floqué à la main, qui accroche la lumière comme un nuage au soleil couchant.',
    art: 'fur',
  },
  {
    n: '03',
    title: 'Numérotées',
    text: 'Chaque créature reçoit un numéro, dans l’ordre de son arrivée. Le catalogue grandit lentement, sans se presser.',
    art: 'number',
  },
  {
    n: '04',
    title: 'À collectionner',
    text: 'Réunies par constellations, elles aiment la compagnie. Une étagère, trois créatures, et la pièce change d’humeur.',
    art: 'shelf',
  },
];

function Concept() {
  const trio = ['brume', 'abricot', 'lagune'].map((s) => creatureBySlug(s)!);
  return (
    <section className={`${styles.concept} night`} data-tone="night" aria-labelledby="concept-title">
      <div className={styles.conceptStars} aria-hidden="true" />
      <div className="container">
        <div className={styles.conceptHead}>
          <Reveal kind="fade">
            <p className="eyebrow">Le concept</p>
          </Reveal>
          <h2 id="concept-title" className={styles.statement}>
            <Reveal kind="mask">Pas de visage.</Reveal>
            <Reveal kind="mask" delay={0.1}>
              <em>Tout le reste</em> est dans la fourrure.
            </Reveal>
          </h2>
        </div>
        <ol className={styles.principles}>
          {PRINCIPLES.map((p, i) => (
            <Reveal as="li" key={p.n} kind={i % 2 ? 'blur' : 'rise'} delay={i * 0.08} className={styles.principle}>
              <div className={styles.art} data-art={p.art} aria-hidden="true">
                {p.art === 'plain' && <CreatureOrb creature={trio[0]} alt="" shadow={false} />}
                {p.art === 'fur' && <CreatureOrb creature={trio[1]} alt="" shadow={false} className={styles.zoom} />}
                {p.art === 'number' && (
                  <div className={styles.labels}>
                    <span>N° 001</span>
                    <span>N° 002</span>
                    <span>N° 003</span>
                  </div>
                )}
                {p.art === 'shelf' && (
                  <div className={styles.shelf}>
                    {trio.map((c) => (
                      <CreatureOrb key={c.slug} creature={c} alt="" shadow={false} />
                    ))}
                  </div>
                )}
              </div>
              <span className={`${styles.pn} num`}>{p.n}</span>
              <h3 className={styles.ptitle}>{p.title}</h3>
              <p className={styles.ptext}>{p.text}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function CollectionFlight() {
  const q = useQuality();
  const groups = useMemo(
    () =>
      collections.map((collection) => ({
        collection,
        creatures: sortedCreatures.filter((c) => c.collection === collection.slug),
      })),
    [],
  );

  if (q.tier === 'static') return <CollectionStatic groups={groups} />;
  return <CollectionPinned groups={groups} />;
}

type Groups = { collection: (typeof collections)[number]; creatures: typeof sortedCreatures }[];

function CollectionPinned({ groups }: { groups: Groups }) {
  const section = useRef<HTMLElement>(null);
  const progress = useRef(0);
  const [active, setActive] = useState(0);
  const bar = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let kill: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')]);
      if (cancelled || !section.current) return;
      gsap.registerPlugin(ScrollTrigger);
      const st = ScrollTrigger.create({
        trigger: section.current,
        start: 'top top',
        end: () => `+=${window.innerHeight * (groups.length - 0.4)}`,
        pin: true,
        scrub: true,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          progress.current = self.progress;
          const idx = Math.min(groups.length - 1, Math.floor(self.progress * groups.length * 0.999));
          setActive(idx);
          if (bar.current) bar.current.style.transform = `scaleX(${self.progress})`;
        },
      });
      // Layout may shift once fonts/images land.
      const t = window.setTimeout(() => ScrollTrigger.refresh(), 600);
      kill = () => {
        window.clearTimeout(t);
        st.kill();
      };
    })();
    return () => {
      cancelled = true;
      kill?.();
    };
  }, [groups.length]);

  return (
    <section ref={section} className={`${styles.flight} night`} data-tone="night" aria-labelledby="flight-title">
      <Suspense fallback={null}>
        <CollectionScene groups={groups} progress={progress} className={styles.flightCanvas} />
      </Suspense>
      <div className={styles.flightVeil} aria-hidden="true" />
      <div className={`container ${styles.flightInner}`}>
        <div className={styles.flightHead}>
          <p className="eyebrow">Constellations</p>
          <h2 id="flight-title" className={styles.flightTitle}>
            Quatre collections, <em>une même nuit.</em>
          </h2>
        </div>

        <div className={styles.captions}>
          {groups.map((g, i) => (
            <div key={g.collection.slug} className={styles.caption} data-active={i === active || undefined} aria-hidden={i !== active}>
              <span className={styles.capIndex}>
                {String(i + 1).padStart(2, '0')} / {String(groups.length).padStart(2, '0')}
              </span>
              <h3 className={styles.capName}>{g.collection.name}</h3>
              <p className={styles.capSub}>{g.collection.subtitle}</p>
              <p className={styles.capText}>{g.collection.description}</p>
              <p className={styles.capList}>
                {g.creatures.map((c) => c.name).join(' · ')}
              </p>
              <Link to={`/boutique?collection=${g.collection.slug}`} className={styles.capLink} tabIndex={i === active ? 0 : -1}>
                Voir la collection <Arrow />
              </Link>
            </div>
          ))}
        </div>

        <div className={styles.progress} aria-hidden="true">
          <span ref={bar} className={styles.progressBar} />
          {groups.map((g, i) => (
            <span key={g.collection.slug} className={styles.tick} data-on={i <= active || undefined} style={{ left: `${(i / groups.length) * 100}%` }}>
              {g.collection.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function CollectionStatic({ groups }: { groups: Groups }) {
  return (
    <section className={`${styles.flightStatic} night`} data-tone="night" aria-labelledby="flight-title">
      <div className="container">
        <p className="eyebrow">Constellations</p>
        <h2 id="flight-title" className={styles.flightTitle}>
          Quatre collections, <em>une même nuit.</em>
        </h2>
        <div className={styles.staticGroups}>
          {groups.map((g) => (
            <Reveal key={g.collection.slug} kind="fade" className={styles.staticGroup}>
              <div className={styles.staticOrbs}>
                {g.creatures.slice(0, 3).map((c) => (
                  <CreatureOrb key={c.slug} creature={c} alt="" shadow={false} />
                ))}
              </div>
              <h3 className={styles.capName}>{g.collection.name}</h3>
              <p className={styles.capSub}>{g.collection.subtitle}</p>
              <p className={styles.capText}>{g.collection.description}</p>
              <Link to={`/boutique?collection=${g.collection.slug}`} className={styles.capLink}>
                Voir la collection <Arrow />
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Latest() {
  const latest = sortedCreatures.filter((c) => c.isNew).slice(-4).reverse();
  return (
    <section className={`container ${styles.section}`} aria-labelledby="latest-title">
      <div className={styles.sectionHead}>
        <div>
          <Reveal kind="fade">
            <p className="eyebrow">Dernières créations</p>
          </Reveal>
          <h2 id="latest-title" className={styles.h2}>
            <Reveal kind="mask">Arrivées cette saison</Reveal>
          </h2>
        </div>
        <Reveal kind="drift" delay={0.15} className={styles.sectionAside}>
          <p>Elles sont apparues ces dernières semaines, une par une, sans prévenir. Comme d’habitude.</p>
        </Reveal>
      </div>
      <RevealGroup className={styles.latestGrid} stagger={0.09}>
        {latest.map((c) => (
          <RevealItem key={c.slug} kind="rise">
            <CreatureCard creature={c} />
          </RevealItem>
        ))}
      </RevealGroup>
    </section>
  );
}

function Closing() {
  return (
    <section className={`container ${styles.closing}`} aria-labelledby="closing-title">
      <Reveal kind="blur" className={styles.quote}>
        <h2 id="closing-title" className={styles.quoteText}>
          « On ne sait pas d’où elles viennent. On sait seulement qu’elles aiment <em>les étagères.</em> »
        </h2>
      </Reveal>
      <Reveal kind="rise" delay={0.2} className={styles.closingActions}>
        <ButtonLink to="/a-propos" variant="ghost" icon={<Arrow />}>
          Lire leur histoire
        </ButtonLink>
      </Reveal>
    </section>
  );
}
