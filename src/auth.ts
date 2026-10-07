import { setTimeout as delay } from 'node:timers/promises';
import { createRemoteJWKSet, jwtVerify, customFetch } from 'jose';
import type { Account, AccountStore, AuthSession } from './types.js';

interface Device { controller: AbortController; session: AuthSession }
interface TokenBody { access_token?: string; refresh_token?: string; id_token?: string; expires_in?: number }

/** Authentication state is owned by one process. No browser sees a token. */
export class Auth {
  private devices = new Map<string, Device>();
  private refreshes = new Map<string, Promise<Account>>();
  private writes = new Map<string, Promise<unknown>>();
  private jwks: ReturnType<typeof createRemoteJWKSet>;
  constructor(private store: AccountStore, private fetcher: typeof fetch, private issuer: string, private clientId: string) {
    this.jwks = createRemoteJWKSet(new URL('/.well-known/jwks.json', issuer), { [customFetch]: fetcher });
  }
  private async write<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const before = this.writes.get(userId) ?? Promise.resolve();
    const next = before.catch(() => {}).then(fn); this.writes.set(userId, next);
    try { return await next; } finally { if (this.writes.get(userId) === next) this.writes.delete(userId); }
  }
  async session(userId: string): Promise<AuthSession> {
    const device = this.devices.get(userId);
    if (device) return { ...device.session };
    const account = await this.store.get(userId);
    return account ? { status: 'connected', identity: { email: account.email, plan: account.plan } } : { status: 'disconnected' };
  }
  cancel(userId: string) {
    this.devices.get(userId)?.controller.abort(); this.devices.delete(userId);
  }
  async disconnect(userId: string) { this.cancel(userId); await this.write(userId, () => this.store.delete(userId)); }
  async start(userId: string): Promise<AuthSession> {
    this.cancel(userId);
    const device: Device = { controller: new AbortController(), session: { status: 'connecting' } };
    this.devices.set(userId, device);
    try {
      const res = await this.deviceRequest('/deviceauth/usercode', { client_id: this.clientId }, device.controller.signal);
      if (!res.ok) { await res.body?.cancel(); throw new Error(`Could not start ChatGPT sign-in (${res.status}). Enable device-code authorization in ChatGPT security settings.`); }
      const body = await res.json() as { device_auth_id?: string; user_code?: string; usercode?: string; interval?: number };
      const code = body.user_code || body.usercode;
      if (!code || !body.device_auth_id) throw new Error('ChatGPT returned no device code.');
      if (!this.live(userId, device)) throw new Error('Sign-in cancelled.');
      device.session = { status: 'connecting', code, url: `${this.issuer}/codex/device` };
      void this.poll(userId, device, body.device_auth_id, code, Math.min(60, Math.max(1, Number.isFinite(body.interval) ? Number(body.interval) : 5)) * 1000);
      return { ...device.session };
    } catch (e) {
      if (this.live(userId, device)) this.devices.delete(userId);
      throw e;
    }
  }
  private live(userId: string, device: Device) { return !device.controller.signal.aborted && this.devices.get(userId) === device; }
  private async poll(userId: string, device: Device, id: string, code: string, interval: number) {
    const until = Date.now() + 15 * 60_000;
    try {
      while (this.live(userId, device) && Date.now() < until) {
        await delay(interval, undefined, { signal: device.controller.signal });
        let res: Response;
        try { res = await this.deviceRequest('/deviceauth/token', { device_auth_id: id, user_code: code }, device.controller.signal); }
        catch (error) { if (!this.live(userId, device)) return; continue; }
        if (res.status === 429 || res.status >= 500) { await res.body?.cancel(); continue; }
        if (!this.live(userId, device)) return;
        if (res.status === 403 || res.status === 404) { await res.body?.cancel(); continue; }
        if (!res.ok) { await res.body?.cancel(); throw new Error(`ChatGPT rejected sign-in (${res.status}).`); }
        const granted = await res.json() as { authorization_code?: string; code_verifier?: string };
        if (!granted.authorization_code || !granted.code_verifier) throw new Error('ChatGPT returned incomplete approval.');
        const token = await this.token({ grant_type: 'authorization_code', client_id: this.clientId, code: granted.authorization_code,
          code_verifier: granted.code_verifier, redirect_uri: `${this.issuer}/deviceauth/callback` }, device.controller.signal);
        const account = await this.accountFromToken(userId, token);
        await this.write(userId, async () => { if (this.live(userId, device)) await this.store.put(account); });
        if (this.live(userId, device)) this.devices.delete(userId);
        return;
      }
      if (this.live(userId, device)) throw new Error('Device code expired. Start sign-in again.');
    } catch (e) {
      if (this.live(userId, device)) device.session = { status: 'error', error: e instanceof Error ? e.message : 'Sign-in failed.' };
    }
  }
  async fresh(userId: string): Promise<Account> {
    const saved = await this.store.get(userId);
    if (!saved) throw new Error('Sign in with ChatGPT first.');
    if (saved.expiresAt > Date.now() + 120_000) return saved;
    const pending = this.refreshes.get(userId); if (pending) return pending;
    const task = (async () => {
      const token = await this.token({ grant_type: 'refresh_token', client_id: this.clientId, refresh_token: saved.refreshToken, scope: 'openid profile email' });
      const next = await this.accountFromToken(userId, token, saved);
      await this.write(userId, async () => {
        const current = await this.store.get(userId);
        if (!current || current.refreshToken !== saved.refreshToken || current.accessToken !== saved.accessToken) throw new Error('Connection changed. Try again.');
        await this.store.updateTokens(userId, next);
      });
      return next;
    })().finally(() => this.refreshes.delete(userId));
    this.refreshes.set(userId, task); return task;
  }
  private async accountFromToken(userId: string, token: TokenBody, saved?: Account): Promise<Account> {
    if (!token.access_token || !(token.refresh_token || saved?.refreshToken)) throw new Error('ChatGPT returned no usable token pair.');
    // Verify identity tokens from the issuer; never use an unverified JWT as identity.
    let claims: Record<string, unknown> = {};
    if (token.id_token) claims = (await jwtVerify(token.id_token, this.jwks, { issuer: this.issuer, audience: this.clientId })).payload;
    const identity = claims['https://api.openai.com/auth'] as { chatgpt_account_id?: string; chatgpt_plan_type?: string } | undefined;
    const accountId = identity?.chatgpt_account_id ?? saved?.accountId;
    if (!accountId) throw new Error('ChatGPT returned no account ID.');
    const lifetime = token.expires_in ?? 3600;
    if (!Number.isFinite(lifetime) || lifetime <= 0) throw new Error('ChatGPT returned an invalid token lifetime.');
    return { userId, accessToken: token.access_token, refreshToken: token.refresh_token ?? saved!.refreshToken,
      expiresAt: Date.now() + lifetime * 1000, accountId,
      email: typeof claims.email === 'string' ? claims.email : saved?.email, plan: identity?.chatgpt_plan_type ?? saved?.plan };
  }
  private deviceRequest(path: string, body: Record<string, string>, signal?: AbortSignal) {
    return this.fetcher(`${this.issuer}/api/accounts${path}`, { method: 'POST', redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
  }
  private async token(form: Record<string, string>, signal?: AbortSignal): Promise<TokenBody> {
    const res = await this.fetcher(`${this.issuer}/oauth/token`, { method: 'POST', redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams(form) });
    if (!res.ok) { await res.body?.cancel(); throw new Error(`ChatGPT token request failed (${res.status}); reconnect if it persists.`); }
    return await res.json() as TokenBody;
  }
  dispose() { for (const userId of this.devices.keys()) this.cancel(userId); }
}
