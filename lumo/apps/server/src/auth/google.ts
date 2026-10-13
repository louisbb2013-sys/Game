import { createRemoteJWKSet, jwtVerify } from 'jose';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export interface GoogleOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function googleAuthUrl(o: GoogleOptions, state: string, locale?: string): string {
  const p = new URLSearchParams({
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    response_type: 'code',
    scope: 'openid email',
    state,
    prompt: 'select_account',
  });
  if (locale) p.set('hl', locale);
  return `${AUTH_URL}?${p}`;
}

export interface GoogleIdentity {
  sub: string;
  email: string | null; // only set when Google says it is verified
}

/** Exchanges the authorization code and verifies the ID token signature, issuer and audience. */
export async function exchangeGoogleCode(o: GoogleOptions, code: string): Promise<GoogleIdentity> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: o.clientId,
      client_secret: o.clientSecret,
      redirect_uri: o.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`google token exchange failed: ${res.status}`);
  const { id_token } = (await res.json()) as { id_token?: string };
  if (!id_token) throw new Error('google returned no id_token');
  const { payload } = await jwtVerify(id_token, jwks, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: o.clientId,
  });
  if (!payload.sub) throw new Error('google id_token has no sub');
  const email = payload.email_verified === true && typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
  return { sub: payload.sub, email };
}
