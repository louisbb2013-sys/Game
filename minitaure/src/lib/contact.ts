export interface ContactPayload {
  name: string;
  email: string;
  subject: string;
  message: string;
}

/**
 * ─── CONTACT FORM INTEGRATION POINT ───────────────────────────────────────
 * Replace this simulated request with your backend or form service, e.g.
 *   Formspree:  fetch('https://formspree.io/f/<id>', { method: 'POST', headers: { Accept: 'application/json' }, body: JSON.stringify(payload) })
 *   Netlify:    POST an URL-encoded body with `form-name=contact` to '/'
 *   Your API:   fetch('/api/contact', { method: 'POST', body: JSON.stringify(payload) })
 * Resolve on success, throw an Error with a French message on failure.
 * ──────────────────────────────────────────────────────────────────────────
 */
export async function sendContactMessage(payload: ContactPayload): Promise<void> {
  await new Promise((r) => setTimeout(r, 900));
  if (import.meta.env.DEV) console.info('[contact] simulated send', payload);
}
