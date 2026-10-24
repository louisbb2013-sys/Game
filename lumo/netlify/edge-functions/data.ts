import { getStore } from '@netlify/blobs';
import { blobsKV, freshKV } from '../lib/kv.ts';
import { makeDataHandler } from '../lib/data.ts';

/** Shared data and live rooms for the standalone site (see netlify/lib/data.ts). */

const env = (name: string) => (globalThis as { Netlify?: { env: { get(k: string): string | undefined } } }).Netlify?.env.get(name);

let handler: ((req: Request) => Promise<Response>) | null = null;

export default (req: Request) => {
  handler ??= makeDataHandler({ kv: freshKV(() => blobsKV(getStore({ name: 'lumo', consistency: 'strong' }) as never)), env });
  return handler(req);
};

export const config = { path: ['/api/data', '/api/room', '/api/gifts'] };
