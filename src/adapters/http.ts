import type { Codex } from '../index.js';

/** Mount under any route prefix. The host authenticates requests and supplies a user ID. */
export function createAuthHandler(options: {
  codex: Codex;
  origin: string;
  resolveUser: (request: Request) => string | Promise<string | null> | null;
  /** Additional app CSRF check, if desired. Exact Origin is always checked for writes. */
  authorizeMutation?: (request: Request) => boolean | Promise<boolean>;
}) {
  const origin = new URL(options.origin).origin;
  const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  return async (request: Request): Promise<Response> => {
    try {
      if (new URL(request.url).origin !== origin) return json({ error: 'Invalid host.' }, 403);
      const userId = await options.resolveUser(request);
      if (!userId) return json({ error: 'Sign into the app first.' }, 401);
      if (request.method !== 'GET') {
        if (request.headers.get('origin') !== origin || (options.authorizeMutation && !(await options.authorizeMutation(request)))) return json({ error: 'Request not authorized.' }, 403);
      }
      const action = new URL(request.url).pathname.split('/').filter(Boolean).at(-1);
      if (request.method === 'GET' && action === 'session') return json(await options.codex.auth.session(userId));
      if (request.method === 'GET' && action === 'models') return json(await options.codex.models(userId));
      if (request.method === 'POST' && action === 'start') return json(await options.codex.auth.start(userId));
      if (request.method === 'POST' && action === 'cancel') { options.codex.auth.cancel(userId); return json(await options.codex.auth.session(userId)); }
      if (request.method === 'POST' && action === 'disconnect') { await options.codex.auth.disconnect(userId); return json({ status: 'disconnected' }); }
      return json({ error: 'Unknown auth action or method.' }, 404);
    } catch (e) { return json({ error: e instanceof Error ? e.message : 'Connection failed.' }, 400); }
  };
}
