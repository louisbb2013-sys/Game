import type { CartLine } from './cart';

/**
 * ─── CHECKOUT INTEGRATION POINT ───────────────────────────────────────────
 * Replace the body of this function to connect a real payment provider
 * (Stripe Checkout, Shopify Storefront, Snipcart, …). It receives the cart
 * lines (product slug + quantity) and should redirect or resolve with a URL.
 *
 * Example (Stripe Checkout via your own serverless endpoint):
 *   const res = await fetch('/api/checkout', { method: 'POST', body: JSON.stringify({ lines }) });
 *   const { url } = await res.json();
 *   window.location.assign(url);
 * ──────────────────────────────────────────────────────────────────────────
 */
export async function startCheckout(lines: CartLine[]): Promise<{ ok: boolean; message: string }> {
  await new Promise((r) => setTimeout(r, 700));
  return {
    ok: false,
    message:
      lines.length > 0
        ? 'La boutique ouvre bientôt. Votre sélection reste gardée ici, bien au chaud.'
        : 'Votre panier est vide.',
  };
}
