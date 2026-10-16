/**
 * The little key/value store behind the standalone site: Netlify Blobs in production (nothing to set
 * up), a Map in tests and on the local test server. Values are JSON strings; every write can be made
 * conditional on the version (etag) last read, so two writers never silently overwrite each other.
 */
export interface KV {
  get(key: string): Promise<{ value: string; etag: string } | null>;
  /** Just the version, without downloading the value (for "has it changed?" checks). */
  etag(key: string): Promise<string | null>;
  /** Returns false when the condition failed (someone else wrote first / it already exists). */
  set(key: string, value: string, cond?: { ifMatch?: string; ifNew?: boolean }): Promise<boolean>;
  del(key: string): Promise<void>;
  list(prefix: string): Promise<{ key: string; etag: string }[]>;
}

/** In-memory store (tests, local test server). */
export function memoryKV(): KV & { dump(): Map<string, string> } {
  const m = new Map<string, { value: string; etag: string }>();
  let n = 0;
  return {
    dump: () => new Map([...m].map(([k, v]) => [k, v.value])),
    async get(key) {
      const v = m.get(key);
      return v ? { ...v } : null;
    },
    async etag(key) {
      return m.get(key)?.etag ?? null;
    },
    async set(key, value, cond) {
      const cur = m.get(key);
      if (cond?.ifNew && cur) return false;
      if (cond?.ifMatch && cur?.etag !== cond.ifMatch) return false;
      m.set(key, { value, etag: `"${++n}"` });
      return true;
    },
    async del(key) {
      m.delete(key);
    },
    async list(prefix) {
      return [...m].filter(([k]) => k.startsWith(prefix)).map(([key, v]) => ({ key, etag: v.etag }));
    },
  };
}

/** Minimal shape of a Netlify Blobs store (so this file doesn't import the package itself). */
export interface BlobStoreLike {
  getWithMetadata(key: string, o: { type: 'text' }): Promise<{ data: string; etag?: string } | null>;
  getMetadata(key: string): Promise<{ etag?: string } | null>;
  set(key: string, value: string, o?: { onlyIfMatch?: string; onlyIfNew?: boolean }): Promise<{ modified: boolean; etag?: string } | void>;
  delete(key: string): Promise<void>;
  list(o: { prefix: string }): Promise<{ blobs: { key: string; etag: string }[] }>;
}

export function blobsKV(store: BlobStoreLike): KV {
  return {
    async get(key) {
      const r = await store.getWithMetadata(key, { type: 'text' });
      return r ? { value: r.data, etag: r.etag ?? '' } : null;
    },
    async etag(key) {
      return (await store.getMetadata(key))?.etag ?? null;
    },
    async set(key, value, cond) {
      const r = await store.set(key, value, cond?.ifMatch ? { onlyIfMatch: cond.ifMatch } : cond?.ifNew ? { onlyIfNew: true } : undefined);
      return r ? r.modified !== false : true;
    },
    async del(key) {
      await store.delete(key);
    },
    async list(prefix) {
      return (await store.list({ prefix })).blobs.map((b) => ({ key: b.key, etag: b.etag }));
    },
  };
}
