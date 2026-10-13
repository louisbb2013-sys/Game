import { jwtVerify, SignJWT } from 'jose';
import type { FastifyReply, FastifyRequest } from 'fastify';

export const SESSION_COOKIE = 'lumo_session';
const MAX_AGE_S = 60 * 60 * 24 * 30;

export class Sessions {
  private key: Uint8Array;
  constructor(secret: string, private secure: boolean) {
    this.key = new TextEncoder().encode(secret);
  }

  async sign(userId: string): Promise<string> {
    return new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setIssuedAt().setExpirationTime(`${MAX_AGE_S}s`).sign(this.key);
  }

  async verify(token: string | undefined): Promise<string | null> {
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'] });
      return payload.sub ?? null;
    } catch {
      return null;
    }
  }

  async start(reply: FastifyReply, userId: string) {
    reply.setCookie(SESSION_COOKIE, await this.sign(userId), {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: this.secure,
      maxAge: MAX_AGE_S,
    });
  }

  end(reply: FastifyReply) {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  userIdFrom(req: FastifyRequest) {
    return this.verify(req.cookies[SESSION_COOKIE]);
  }
}
