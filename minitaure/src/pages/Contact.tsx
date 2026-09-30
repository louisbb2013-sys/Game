import { useId, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { usePageMeta } from '../hooks/usePageMeta';
import { sendContactMessage, type ContactPayload } from '../lib/contact';
import { site } from '../content/site';
import { creatureBySlug } from '../content/creatures';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { CreatureOrb } from '../components/CreatureOrb';
import styles from './Contact.module.css';

type Field = keyof ContactPayload;
type Errors = Partial<Record<Field, string>>;

const SUBJECTS = ['Une question sur une créature', 'Une commande', 'Une collaboration', 'Autre chose'];

function validate(v: ContactPayload): Errors {
  const e: Errors = {};
  if (v.name.trim().length < 2) e.name = 'Indiquez votre nom (deux lettres au moins).';
  if (!v.email.trim()) e.email = 'Indiquez votre adresse e-mail.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email.trim())) e.email = 'Cette adresse ne semble pas valide. Exemple : prenom@domaine.fr';
  if (!v.subject) e.subject = 'Choisissez un sujet.';
  if (v.message.trim().length < 10) e.message = 'Votre message est un peu court (dix caractères au moins).';
  return e;
}

const LABELS: Record<Field, string> = { name: 'Nom', email: 'E-mail', subject: 'Sujet', message: 'Message' };

export default function Contact() {
  usePageMeta('Contact', 'Écrire à Minitaure : une question sur une créature, une commande ou une collaboration.', '/contact');
  const [values, setValues] = useState<ContactPayload>({ name: '', email: '', subject: '', message: '' });
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [submitted, setSubmitted] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const uid = useId();

  const errors = validate(values);
  const shown = (f: Field) => (touched[f] || submitted) && errors[f];
  const errorList = (Object.keys(errors) as Field[]).filter((f) => errors[f]);

  const update = (f: Field) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [f]: e.target.value }));
  const blur = (f: Field) => () => setTouched((t) => ({ ...t, [f]: true }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (errorList.length) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setStatus('sending');
    try {
      await sendContactMessage(values);
      setStatus('sent');
      requestAnimationFrame(() => successRef.current?.focus());
    } catch {
      setStatus('error');
    }
  };

  const reset = () => {
    setValues({ name: '', email: '', subject: '', message: '' });
    setTouched({});
    setSubmitted(false);
    setStatus('idle');
  };

  const fid = (f: Field) => `${uid}-${f}`;
  const describedBy = (f: Field, hint?: boolean) =>
    [hint ? `${fid(f)}-hint` : '', shown(f) ? `${fid(f)}-err` : ''].filter(Boolean).join(' ') || undefined;

  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title={
          <>
            Écrivez-nous, <em>doucement.</em>
          </>
        }
        lede="Une question sur une créature, une commande, une idée ? Nous lisons chaque message et répondons en général sous deux jours ouvrés."
      />

      <section className={`container ${styles.layout}`} aria-label="Formulaire de contact">
        <aside className={styles.aside}>
          <div className={styles.asideOrb} aria-hidden="true">
            <CreatureOrb creature={creatureBySlug('ecume')!} alt="" />
          </div>
          <dl className={styles.details}>
            <div>
              <dt>E-mail</dt>
              <dd>
                <a href={`mailto:${site.email}`}>{site.email}</a>
              </dd>
            </div>
            <div>
              <dt>Atelier</dt>
              <dd>Quelque part en Bretagne, près de la mer.</dd>
            </div>
            <div>
              <dt>Réponse</dt>
              <dd>Sous deux jours ouvrés, sans robot.</dd>
            </div>
          </dl>
        </aside>

        <div className={styles.card}>
          <AnimatePresence mode="wait" initial={false}>
            {status === 'sent' ? (
              <motion.div
                key="sent"
                ref={successRef}
                tabIndex={-1}
                className={styles.success}
                role="status"
                initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <motion.div
                  className={styles.successOrb}
                  aria-hidden="true"
                  initial={reduced ? false : { y: 30, scale: 0.6 }}
                  animate={{ y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 160, damping: 12, delay: 0.1 }}
                >
                  <CreatureOrb creature={creatureBySlug('brume')!} alt="" />
                </motion.div>
                <h2 className={styles.successTitle}>Message bien reçu.</h2>
                <p>
                  Merci {values.name.trim().split(' ')[0]}. Brume l’a déposé sur notre bureau ; nous vous répondrons à{' '}
                  <strong>{values.email.trim()}</strong> très bientôt.
                </p>
                <Button variant="ghost" onClick={reset}>
                  Écrire un autre message
                </Button>
              </motion.div>
            ) : (
              <motion.form key="form" noValidate onSubmit={onSubmit} className={styles.form} exit={{ opacity: 0 }}>
                {submitted && errorList.length > 0 && (
                  <div ref={summaryRef} tabIndex={-1} className={styles.summary} role="alert" aria-labelledby={`${uid}-sum`}>
                    <p id={`${uid}-sum`} className={styles.summaryTitle}>
                      {errorList.length === 1 ? 'Un champ demande votre attention :' : `${errorList.length} champs demandent votre attention :`}
                    </p>
                    <ul>
                      {errorList.map((f) => (
                        <li key={f}>
                          <a href={`#${fid(f)}`} onClick={(e) => { e.preventDefault(); document.getElementById(fid(f))?.focus(); }}>
                            {LABELS[f]} : {errors[f]}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className={styles.row}>
                  <div className={styles.field} data-invalid={!!shown('name') || undefined}>
                    <label htmlFor={fid('name')}>Nom</label>
                    <input
                      id={fid('name')}
                      name="name"
                      autoComplete="name"
                      value={values.name}
                      onChange={update('name')}
                      onBlur={blur('name')}
                      aria-invalid={!!shown('name')}
                      aria-describedby={describedBy('name')}
                      required
                    />
                    <FieldError id={`${fid('name')}-err`} msg={shown('name') || undefined} />
                  </div>
                  <div className={styles.field} data-invalid={!!shown('email') || undefined}>
                    <label htmlFor={fid('email')}>E-mail</label>
                    <input
                      id={fid('email')}
                      name="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={values.email}
                      onChange={update('email')}
                      onBlur={blur('email')}
                      aria-invalid={!!shown('email')}
                      aria-describedby={describedBy('email')}
                      required
                    />
                    <FieldError id={`${fid('email')}-err`} msg={shown('email') || undefined} />
                  </div>
                </div>

                <div className={styles.field} data-invalid={!!shown('subject') || undefined}>
                  <label htmlFor={fid('subject')}>Sujet</label>
                  <div className={styles.selectWrap}>
                    <select
                      id={fid('subject')}
                      name="subject"
                      value={values.subject}
                      onChange={update('subject')}
                      onBlur={blur('subject')}
                      aria-invalid={!!shown('subject')}
                      aria-describedby={describedBy('subject')}
                      required
                    >
                      <option value="" disabled>
                        Choisir un sujet…
                      </option>
                      {SUBJECTS.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <FieldError id={`${fid('subject')}-err`} msg={shown('subject') || undefined} />
                </div>

                <div className={styles.field} data-invalid={!!shown('message') || undefined}>
                  <label htmlFor={fid('message')}>Message</label>
                  <textarea
                    id={fid('message')}
                    name="message"
                    rows={6}
                    value={values.message}
                    onChange={update('message')}
                    onBlur={blur('message')}
                    aria-invalid={!!shown('message')}
                    aria-describedby={describedBy('message', true)}
                    maxLength={2000}
                    required
                  />
                  <p id={`${fid('message')}-hint`} className={styles.hint}>
                    {values.message.length} / 2000 caractères
                  </p>
                  <FieldError id={`${fid('message')}-err`} msg={shown('message') || undefined} />
                </div>

                <div className={styles.submitRow}>
                  <Button type="submit" size="lg" disabled={status === 'sending'}>
                    {status === 'sending' ? 'Envoi en cours…' : 'Envoyer le message'}
                  </Button>
                  <p className={styles.fine}>Vos informations servent uniquement à vous répondre.</p>
                </div>
                {status === 'error' && (
                  <p className={styles.sendError} role="alert">
                    L’envoi n’a pas abouti. Vérifiez votre connexion et réessayez, ou écrivez-nous directement à {site.email}.
                  </p>
                )}
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </section>
    </>
  );
}

function FieldError({ id, msg }: { id: string; msg?: string }) {
  return (
    <AnimatePresence initial={false}>
      {msg && (
        <motion.p
          id={id}
          className={styles.error}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.25 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5v5.5M12 16.5v.01" />
          </svg>
          {msg}
        </motion.p>
      )}
    </AnimatePresence>
  );
}
