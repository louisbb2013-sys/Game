import type { KV } from './kv.ts';
import { json, limiter, randomId, type Session } from './session.ts';

/**
 * Gifts from the game's creator: Lumo-rarity pets nobody can hatch or upgrade to. Only a creator can
 * give one (by the receiver's Lumo name); the receiver's page picks it up and claims it once.
 *
 *   g/<uid>/<giftId>   { id, species, tier, from, at, claimed? }
 *   c/<uid>            { at }   this learner unlocked creator mode with the creator code
 *
 * Creators: the learners listed in LUMO_CREATORS (comma-separated ids), and any account where the
 * creator typed the creator code (only its SHA-256 is here; LUMO_CREATOR_CODE_HASH can replace it).
 * Each creator account also gets one Lumo pet.
 */

const CREATOR_CODE_HASH = '18ca0707ef32b0f8fd4588152e1de8363b61981a3422c0f0ca8b40a21e292793';
const FIRST_GIFT = 'creator-lumo';
const tries = limiter(10, 10 * 60_000);
const GIFT_SPECIES = new Set(['lumo_firefly', 'moss_turtle', 'cloud_sheep', 'pixel_owl', 'comet_fox', 'crystal_cat', 'star_jelly', 'bubble_octo', 'ember_dragon', 'puddle_frog', 'acorn_squirrel', 'snow_penguin', 'lucky_bunny', 'rock_dino', 'mystic_unicorn', 'cosmic_whale', 'aurora_peacock', 'celestial_phoenix', 'galaxy_dragon', 'prism_axolotl', 'nebula_manta']);

type Env = (k: string) => string | undefined;
interface Gift {
  id: string;
  species: string;
  tier: 'lumo';
  from: string;
  at: number;
  claimed?: number;
}

const read = async (kv: KV, key: string) => {
  const got = await kv.get(key);
  if (!got) return null;
  try {
    return { v: JSON.parse(got.value) as Record<string, unknown>, etag: got.etag };
  } catch {
    return null;
  }
};
const nameOf = async (kv: KV, uid: string) => String((await read(kv, `d/profiles/${uid}`))?.v.username ?? '');

export async function isCreator(kv: KV, env: Env, me: Session): Promise<boolean> {
  const listed = (env('LUMO_CREATORS') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  return listed.includes(me.u) || (await kv.etag(`c/${me.u}`)) !== null;
}

/** The creator code as typed ("abcd-efgh …"), boiled down and hashed. */
async function codeHash(code: string): Promise<string> {
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clean));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Who has this Lumo name now (its claim, else any profile using it). */
async function uidForName(kv: KV, name: string): Promise<string | null> {
  const lower = name.trim().toLowerCase();
  if (!lower) return null;
  const claim = await read(kv, `u/name/${encodeURIComponent(lower)}`);
  const owner = typeof claim?.v.uid === 'string' ? claim.v.uid : null;
  if (owner && (await nameOf(kv, owner)).toLowerCase() === lower) return owner;
  for (const { key } of await kv.list('d/profiles/')) {
    const uid = key.slice('d/profiles/'.length);
    if ((await nameOf(kv, uid)).toLowerCase() === lower) return uid;
  }
  return null;
}

/** /api/gifts: list mine (and whether I'm a creator), claim one, or (creators) give one. */
export async function gifts(kv: KV, env: Env, body: Record<string, unknown>, me: Session, now: number): Promise<Response> {
  const op = body.op;
  if (op === 'unlock') {
    // The creator types the creator code once on each of their accounts.
    if (!tries(me.u, now)) return json(429, { error: 'rate_limited' });
    const code = String(body.code ?? '').slice(0, 64);
    if (!code || (await codeHash(code)) !== (env('LUMO_CREATOR_CODE_HASH') ?? CREATOR_CODE_HASH)) return json(403, { error: 'bad_code' });
    await kv.set(`c/${me.u}`, JSON.stringify({ at: now }));
    return json(200, { ok: true });
  }
  if (op === 'list') {
    const creator = await isCreator(kv, env, me);
    // The creator's own accounts get their Lumo pet the first time they look.
    if (creator) {
      const first: Gift = { id: FIRST_GIFT, species: 'lumo_firefly', tier: 'lumo', from: 'creator', at: now };
      await kv.set(`g/${me.u}/${FIRST_GIFT}`, JSON.stringify(first), { ifNew: true });
    }
    const list: Gift[] = [];
    for (const { key } of await kv.list(`g/${me.u}/`)) {
      const g = (await read(kv, key))?.v as Gift | undefined;
      if (g && !g.claimed) list.push(g);
    }
    return json(200, { creator, gifts: list });
  }
  if (op === 'claim') {
    const id = String(body.id ?? '');
    if (!/^[\w-]{1,40}$/.test(id)) return json(400, { error: 'bad_request' });
    const key = `g/${me.u}/${id}`;
    const cur = await read(kv, key);
    if (!cur) return json(404, { error: 'not_found' });
    const g = cur.v as unknown as Gift;
    if (g.claimed) return json(409, { error: 'already_claimed' });
    // Two devices claiming at once: only one gets it.
    if (!(await kv.set(key, JSON.stringify({ ...g, claimed: now }), { ifMatch: cur.etag }))) return json(409, { error: 'already_claimed' });
    return json(200, { gift: g });
  }
  if (op === 'give') {
    if (!(await isCreator(kv, env, me))) return json(403, { error: 'not_creator' });
    const species = String(body.species ?? 'lumo_firefly');
    if (!GIFT_SPECIES.has(species)) return json(400, { error: 'bad_species' });
    const to = await uidForName(kv, String(body.username ?? ''));
    if (!to) return json(404, { error: 'no_such_learner' });
    const gift: Gift = { id: `g${randomId(9)}`, species, tier: 'lumo', from: me.u, at: now };
    await kv.set(`g/${to}/${gift.id}`, JSON.stringify(gift));
    return json(200, { ok: true });
  }
  return json(400, { error: 'bad_request' });
}
