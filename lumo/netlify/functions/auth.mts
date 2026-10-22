import { getStore } from '@netlify/blobs';
import { blobsKV, freshKV } from '../lib/kv.ts';
import { makeAuthHandler } from '../lib/auth.ts';

/** Sign up / log in for the standalone site (see netlify/lib/auth.ts). */

let handler: ((req: Request) => Promise<Response>) | null = null;

export default (req: Request) => {
  handler ??= makeAuthHandler({ kv: freshKV(() => blobsKV(getStore({ name: 'lumo', consistency: 'strong' }) as never)), env: (k) => process.env[k] });
  return handler(req);
};

export const config = { path: ['/api/auth/signup', '/api/auth/login', '/api/auth/google', '/api/auth/delete'] };
