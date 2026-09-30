import { useMemo } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { usePageMeta } from '../hooks/usePageMeta';
import { creatureBySlug, formatNumber, sortedCreatures } from '../content/creatures';
import { collections } from '../content/collections';
import { Chips } from '../components/Chips';
import { CreatureCard } from '../components/CreatureCard';
import { CreatureSheet } from '../components/CreatureSheet';
import { PageHeader } from '../components/PageHeader';
import styles from './Creatures.module.css';

export default function Creatures() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const reduced = useReducedMotion();
  const open = slug ? creatureBySlug(slug) : undefined;

  usePageMeta(
    open ? `${open.name} · ${formatNumber(open.number)}` : 'Les créatures',
    open
      ? `${open.name}, ${formatNumber(open.number)} : ${open.tagline}`
      : 'Le catalogue des créatures Minitaure : chacune numérotée, sans visage, reconnaissable à sa couleur et à sa fourrure.',
    open ? `/creatures/${open.slug}` : '/creatures',
  );

  const filter = params.get('collection') ?? 'tout';
  const options = useMemo(
    () => [
      { value: 'tout', label: 'Toutes', count: sortedCreatures.length },
      ...collections.map((c) => ({
        value: c.slug,
        label: c.name,
        color: c.accent,
        count: sortedCreatures.filter((x) => x.collection === c.slug).length,
      })),
    ],
    [],
  );
  const list = sortedCreatures.filter((c) => filter === 'tout' || c.collection === filter);

  const setFilter = (v: string) => {
    const next = new URLSearchParams(params);
    if (v === 'tout') next.delete('collection');
    else next.set('collection', v);
    setParams(next, { replace: true, preventScrollReset: true });
  };

  const close = () => {
    // Return to the gallery we came from (keeps filters) or to the plain gallery.
    if ((location.state as { fromGallery?: boolean } | null)?.fromGallery) navigate(-1);
    else navigate({ pathname: '/creatures', search: params.toString() }, { preventScrollReset: true });
  };

  return (
    <LayoutGroup>
      <PageHeader
        eyebrow="Les créatures"
        title={
          <>
            Le catalogue, <em>une à une</em>
          </>
        }
        lede="Chaque créature porte un numéro, dans l’ordre de son arrivée. Aucune n’a de visage : on les reconnaît à leur couleur, à leur fourrure, à un détail."
        aside={
          <p className={styles.tally}>
            <span className={styles.tallyNum}>{sortedCreatures.length}</span>
            <span>créatures répertoriées</span>
          </p>
        }
      />

      <section className="container" aria-labelledby="gallery-title">
        <h2 id="gallery-title" className="visually-hidden">
          Galerie
        </h2>
        <div className={styles.toolbar}>
          <Chips id="creature-filter" label="Filtrer par collection" options={options} value={filter} onChange={setFilter} />
        </div>

        <motion.ul className={styles.grid} layout={!reduced}>
          <AnimatePresence mode="popLayout" initial={false}>
            {list.map((c, i) => (
              <motion.li
                key={c.slug}
                layout={!reduced}
                initial={{ opacity: 0, y: reduced ? 0 : 24 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.7, delay: Math.min(i, 8) * 0.04, ease: [0.22, 1, 0.36, 1] } }}
                exit={{ opacity: 0, transition: { duration: 0.25 } }}
                onClickCapture={(e) => {
                  // Remember we opened from the gallery so "close" can go back.
                  const a = (e.target as HTMLElement).closest('a');
                  if (a && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
                    e.preventDefault();
                    navigate(
                      { pathname: `/creatures/${c.slug}`, search: params.toString() },
                      { state: { fromGallery: true }, preventScrollReset: true },
                    );
                  }
                }}
              >
                <CreatureCard creature={c} shared priority={i < 4} headingLevel="h3" />
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      </section>

      <AnimatePresence>
        {open && <CreatureSheet key={open.slug} creature={open} onClose={close} />}
      </AnimatePresence>
    </LayoutGroup>
  );
}
