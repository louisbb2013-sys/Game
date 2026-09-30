import { Link } from 'react-router-dom';
import { nav, site } from '../content/site';
import { collections } from '../content/collections';
import { Wordmark } from './Wordmark';
import styles from './Footer.module.css';

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className={`${styles.footer} night`} data-tone="night">
      <div className={styles.arc} aria-hidden="true" />
      <div className="container">
        <div className={styles.top}>
          <div className={styles.intro}>
            <Wordmark className={styles.mark} />
            <p className={styles.tag}>{site.tagline}</p>
          </div>

          <nav aria-label="Pied de page" className={styles.cols}>
            <div>
              <h2 className={styles.h}>Explorer</h2>
              <ul>
                {nav.map((n) => (
                  <li key={n.to}>
                    <Link to={n.to}>{n.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className={styles.h}>Collections</h2>
              <ul>
                {collections.map((c) => (
                  <li key={c.slug}>
                    <Link to={`/boutique?collection=${c.slug}`}>
                      <span className={styles.dot} style={{ background: c.accent }} aria-hidden="true" />
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className={styles.h}>Suivre</h2>
              <ul>
                {site.social.map((s) => (
                  <li key={s.label}>
                    <a href={s.href} target="_blank" rel="noreferrer">
                      {s.label}
                      <span className="visually-hidden"> (nouvel onglet)</span>
                    </a>
                  </li>
                ))}
                <li>
                  <a href={`mailto:${site.email}`}>{site.email}</a>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <div className={styles.bottom}>
          <p>© {year} Minitaure. Créatures imaginées et numérotées avec soin.</p>
          <p className={styles.small}>Aucune créature n’a de visage. C’est voulu.</p>
        </div>
      </div>
    </footer>
  );
}
