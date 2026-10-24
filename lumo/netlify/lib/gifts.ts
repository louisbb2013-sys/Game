import type { KV } from './kv.ts';
import { json, randomId, type Session } from './session.ts';

/**
 * Gifts from the game's creator: Lumo-rarity pets nobody can hatch or upgrade to. Only a creator can
 * give one (by the receiver's Lumo name); the receiver's page picks it up and claims it once.
 *
 *   g/<uid>/<giftId>   { id, species, tier, from, at, claimed? }
 *
 * Creators: the learners listed in LUMO_CREATORS (comma-separated ids), and the creator's own
 * accounts from before gifts existed: those named Louis made before CREATOR_CUTOFF (each also gets
 * one Lumo pet the first time it looks).
 */

const CREATOR_NAME = 'louis';
const CREATOR_CUTOFF = Date.UTC(2026, 9, 24); // accounts made before 24 Oct 2026
const FIRST_GIFT = 'creator-lumo';
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

/** When this learner's account was made (name-and-password or Google), or null if unknown. */
async function createdAt(kv: KV, uid: string, name: string, kind: Session['k']): Promise<number | null> {
  if (kind === 'pw') {
    const rec = await read(kv, `a/n/${encodeURIComponent(name.toLowerCase())}`);
    return rec?.v.uid === uid ? Number(rec.v.created) || null : null;
  }
  for (const { key } of await kv.list('a/g/')) {
    const rec = await read(kv, key);
    if (rec?.v.uid === uid) return Number(rec.v.created) || null;
  }
  return null;
}

export async function isCreator(kv: KV, env: Env, me: Session): Promise<boolean> {
  const listed = (env('LUMO_CREATORS') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  if (listed.includes(me.u)) return true;
  const name = me.k === 'pw' ? me.n : await nameOf(kv, me.u);
  if (name.toLowerCase() !== CREATOR_NAME) return false;
  const made = await createdAt(kv, me.u, me.k === 'pw' ? me.n : name, me.k);
  return made !== null && made < CREATOR_CUTOFF;
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
