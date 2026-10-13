import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import nodemailer from 'nodemailer';
import type { Db } from '../db/pool.ts';

const CODE_TTL_MS = 10 * 60_000;
export const MAX_CODE_ATTEMPTS = 5;

export class EmailCodes {
  private transport: nodemailer.Transporter | null;

  constructor(
    private db: Db,
    private secret: string,
    smtpUrl: string,
    private from: string,
    private log: (msg: string) => void,
  ) {
    this.transport = smtpUrl ? nodemailer.createTransport(smtpUrl) : null;
  }

  private hash(email: string, code: string) {
    return createHmac('sha256', this.secret).update(`${email}:${code}`).digest('hex');
  }

  /** Creates a fresh 6-digit code. Returns it only so tests/dev can use it; never sent to the client. */
  async start(email: string, locale: 'en' | 'fr'): Promise<string> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.db.query(
      `INSERT INTO email_codes (email, code_hash, expires_at, attempts) VALUES ($1, $2, $3, 0)
       ON CONFLICT (email) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0`,
      [email, this.hash(email, code), new Date(Date.now() + CODE_TTL_MS)],
    );
    const subject = locale === 'fr' ? `Ton code Lumo : ${code}` : `Your Lumo code: ${code}`;
    const text =
      locale === 'fr'
        ? `Ton code de connexion est ${code}. Il expire dans 10 minutes.`
        : `Your sign-in code is ${code}. It expires in 10 minutes.`;
    if (this.transport) await this.transport.sendMail({ from: this.from, to: email, subject, text });
    else this.log(`[dev] sign-in code for ${email}: ${code}`);
    return code;
  }

  async verify(email: string, code: string): Promise<boolean> {
    const { rows } = await this.db.query<{ code_hash: string; expires_at: Date; attempts: number }>(
      'UPDATE email_codes SET attempts = attempts + 1 WHERE email = $1 RETURNING code_hash, expires_at, attempts',
      [email],
    );
    const row = rows[0];
    if (!row || row.expires_at.getTime() < Date.now() || row.attempts > MAX_CODE_ATTEMPTS) return false;
    const a = Buffer.from(row.code_hash, 'hex');
    const b = Buffer.from(this.hash(email, code), 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    await this.db.query('DELETE FROM email_codes WHERE email = $1', [email]);
    return true;
  }
}
