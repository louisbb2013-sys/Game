import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { usePageMeta } from '../hooks/usePageMeta';
import { products } from '../content/products';
import { collections } from '../content/collections';
import { Chips } from '../components/Chips';
import { ProductCard } from '../components/ProductCard';
import { Reveal } from '../components/Reveal';
import { PageHeader } from '../components/PageHeader';
import styles from './Shop.module.css';

export default function Shop() {
  usePageMeta(
    'Boutique',
    'La boutique Minitaure : figurines de créatures à fourrure douce, numérotées, et coffrets de trois. De 22 à 58 €.',
    '/boutique',
  );
  const [params, setParams] = useSearchParams();
  const reduced = useReducedMotion();
  const filter = params.get('collection') ?? 'tout';

  const options = useMemo(
    () => [
      { value: 'tout', label: 'Tout', count: products.length },
      ...collections.map((c) => ({
        value: c.slug,
        label: c.name,
        color: c.accent,
        count: products.filter((p) => p.collection === c.slug).length,
      })),
      { value: 'coffrets', label: 'Coffrets', count: products.filter((p) => p.kind === 'coffret').length },
    ],
    [],
  );

  const list = products.filter((p) =>
    filter === 'tout' ? true : filter === 'coffrets' ? p.kind === 'coffret' : p.collection === filter,
  );

  const setFilter = (v: string) => {
    const next = new URLSearchParams(params);
    if (v === 'tout') next.delete('collection');
    else next.set('collection', v);
    setParams(next, { replace: true, preventScrollReset: true });
  };

  const active = collections.find((c) => c.slug === filter);

  return (
    <>
      <PageHeader
        eyebrow="Boutique"
        title={
          <>
            Des créatures à <em>accueillir</em>
          </>
        }
        lede="Chaque figurine est coulée, floquée et numérotée à la main. Elles voyagent dans du papier de soie, bien calées, sans bruit."
      />

      <section className="container" aria-labelledby="shop-grid-title">
        <h2 id="shop-grid-title" className="visually-hidden">
          Produits
        </h2>
        <div className={styles.toolbar}>
          <Chips id="shop-filter" label="Filtrer par collection" options={options} value={filter} onChange={setFilter} />
          <p className={styles.count} role="status" aria-live="polite">
            {list.length} {list.length > 1 ? 'pièces' : 'pièce'}
            {active ? ` · ${active.subtitle}` : ''}
          </p>
        </div>

        <motion.ul className={styles.grid} layout={!reduced}>
          <AnimatePresence mode="popLayout" initial={false}>
            {list.map((p, i) => (
              <motion.li
                key={p.slug}
                layout={!reduced}
                initial={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              >
                <Reveal kind="scale" amount={0.15} delay={(i % 4) * 0.06}>
                  <ProductCard product={p} priority={i < 2} />
                </Reveal>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>

        <aside className={styles.promise} aria-label="Nos engagements">
          <p>
            <strong>Livraison offerte</strong> dès deux créatures
          </p>
          <p>
            <strong>Emballage</strong> papier de soie, carton recyclé
          </p>
          <p>
            <strong>Numérotation</strong> gravée sous chaque socle
          </p>
        </aside>
      </section>
    </>
  );
}
