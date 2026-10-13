import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cookieFrom, setupTestApp } from './helpers.ts';

let t: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => { t = await setupTestApp(); });
afterAll(async () => { await t.close(); });

describe('auth', () => {
  it('rejects /api/me without a session', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/me' });
    expect(res.statusCode).toBe(401);
  });

  it('reports providers (google off without keys)', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/auth/providers' });
    expect(res.json()).toEqual({ google: false, email: true, dev: true });
  });

  it('dev login creates a safe profile and a session', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/auth/dev', payload: { name: 'alice' } });
    expect(res.statusCode).toBe(200);
    const me = await t.app.inject({ method: 'GET', url: '/api/me', headers: { cookie: cookieFrom(res) } });
    const user = me.json().user;
    expect(user.username).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+\d{2}$/);
    expect(user.level.level).toBe(1);
    expect(user.hearts.current).toBe(5);
    expect(user.streak.status).toBe('none');
  });

  it('email code sign-in: wrong code rejected, right code works once', async () => {
    const code = await t.ctx.emailCodes.start('bob@example.com', 'en');
    const wrong = code === '000000' ? '111111' : '000000';
    const bad = await t.app.inject({ method: 'POST', url: '/api/auth/email/verify', payload: { email: 'bob@example.com', code: wrong } });
    expect(bad.statusCode).toBe(401);
    const ok = await t.app.inject({ method: 'POST', url: '/api/auth/email/verify', payload: { email: 'BOB@example.com', code, locale: 'fr', timezone: 'Europe/Paris' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user.locale).toBe('fr');
    expect(ok.json().user.timezone).toBe('Europe/Paris');
    const reuse = await t.app.inject({ method: 'POST', url: '/api/auth/email/verify', payload: { email: 'bob@example.com', code } });
    expect(reuse.statusCode).toBe(401);
  });

  it('locks a code after too many attempts', async () => {
    const code = await t.ctx.emailCodes.start('carol@example.com', 'en');
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await t.app.inject({ method: 'POST', url: '/api/auth/email/verify', payload: { email: 'carol@example.com', code: wrong } });
    const res = await t.app.inject({ method: 'POST', url: '/api/auth/email/verify', payload: { email: 'carol@example.com', code } });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a forged session cookie', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/me', headers: { cookie: 'lumo_session=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.bad' } });
    expect(res.statusCode).toBe(401);
  });
});

describe('profile', () => {
  it('updates settings and username with safety checks, then deletes data', async () => {
    const login = await t.app.inject({ method: 'POST', url: '/api/auth/dev', payload: { name: 'dave' } });
    const cookie = cookieFrom(login);
    const bad = await t.app.inject({ method: 'PATCH', url: '/api/me', headers: { cookie }, payload: { username: 'sh1tlord' } });
    expect(bad.json().error).toBe('username_blocked');
    const extra = await t.app.inject({ method: 'PATCH', url: '/api/me', headers: { cookie }, payload: { isAdmin: true } });
    expect(extra.statusCode).toBe(400);
    const ok = await t.app.inject({ method: 'PATCH', url: '/api/me', headers: { cookie }, payload: { username: 'StarDave', settings: { theme: 'dark', dyslexiaFont: true } } });
    expect(ok.json().user.username).toBe('StarDave');
    expect(ok.json().user.settings).toEqual({ theme: 'dark', dyslexiaFont: true });
    const other = await t.app.inject({ method: 'POST', url: '/api/auth/dev', payload: { name: 'erin' } });
    const taken = await t.app.inject({ method: 'PATCH', url: '/api/me', headers: { cookie: cookieFrom(other) }, payload: { username: 'StarDave' } });
    expect(taken.statusCode).toBe(409);
    const del = await t.app.inject({ method: 'DELETE', url: '/api/me', headers: { cookie } });
    expect(del.statusCode).toBe(200);
    const gone = await t.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(gone.statusCode).toBe(401);
  });
});
