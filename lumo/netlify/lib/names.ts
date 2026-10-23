import type { KV } from './kv.ts';

/**
 * A Lumoly name belongs to one learner, because friends add each other by it. A name is held by a
 * name-and-password account (a/n/<name>), or claimed by the learner whose profile uses it
 * (u/name/<name>). Names are compared in lower case.
 */

const enc = (lower: string) => encodeURIComponent(lower);
const claimKey = (lower: string) => `u/name/${enc(lower)}`;
const READY = 'u/names-ready';

const field = (v: string | undefined, k: string): string => {
  try {
    const o = JSON.parse(v ?? 'null') as Record<string, unknown> | null;
    return o && typeof o[k] === 'string' ? (o[k] as string) : '';
  } catch {
    return '';
  }
};
const profileName = async (kv: KV, uid: string) => field((await kv.get(`d/profiles/${uid}`))?.value, 'username').toLowerCase();

/** Names chosen before claims existed: claim each for whoever has it (first one wins), once. */
async function backfill(kv: KV) {
  if (await kv.etag(READY)) return;
  const keys = (await kv.list('d/profiles/')).map((x) => x.key);
  for (let i = 0; i < keys.length; i += 20) {
    await Promise.all(
      keys.slice(i, i + 20).map(async (key) => {
        const name = field((await kv.get(key))?.value, 'username').toLowerCase();
        if (name) await kv.set(claimKey(name), JSON.stringify({ uid: key.slice('d/profiles/'.length) }), { ifNew: true });
      }),
    );
  }
  await kv.set(READY, '{}');
}

/** Whether someone else holds this name, whether `uid` already does, and the claim's version. */
async function holder(kv: KV, lower: string, uid: string): Promise<{ other: boolean; mine?: boolean; etag?: string }> {
  const pw = field((await kv.get(`a/n/${enc(lower)}`))?.value, 'uid');
  if (pw && pw !== uid) return { other: true };
  await backfill(kv);
  const cur = await kv.get(claimKey(lower));
  const owner = field(cur?.value, 'uid');
  if (!owner) return { other: false };
  if (owner === uid) return { other: false, mine: true };
  // A claim whose owner has since moved to another name is free again.
  if ((await profileName(kv, owner)) === lower) return { other: true };
  return { other: false, etag: cur!.etag };
}

/** Is this name someone else's? (For a new account, any holder counts.) */
export async function nameTaken(kv: KV, lower: string, uid = ''): Promise<boolean> {
  return (await holder(kv, lower, uid)).other;
}

/** Take a name for `uid`; false when someone else has it. */
export async function claimName(kv: KV, lower: string, uid: string): Promise<boolean> {
  const h = await holder(kv, lower, uid);
  if (h.other) return false;
  if (h.mine) return true;
  const value = JSON.stringify({ uid });
  return h.etag ? kv.set(claimKey(lower), value, { ifMatch: h.etag }) : kv.set(claimKey(lower), value, { ifNew: true });
}

/** Let go of a name `uid` no longer uses. */
export async function releaseName(kv: KV, lower: string, uid: string) {
  if (field((await kv.get(claimKey(lower)))?.value, 'uid') === uid) await kv.del(claimKey(lower));
}
