import type { Account, CodexModel } from './types.js';

type ListedModel = CodexModel & { visible: boolean };
type Entry = { accountId?: string; expires: number; models?: ListedModel[]; pending?: Promise<ListedModel[]> };
export interface CatalogOptions { includeHidden?: boolean; signal?: AbortSignal; refresh?: boolean }

// Each caller may detach from shared read-only discovery without cancelling other waiters.
function wait<T>(task: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return task;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const aborted = () => { signal.removeEventListener('abort', aborted); reject(signal.reason); };
    signal.addEventListener('abort', aborted, { once: true });
    task.then(value => { signal.removeEventListener('abort', aborted); if (!signal.aborted) resolve(value); }, error => { signal.removeEventListener('abort', aborted); reject(error); });
  });
}
export function createCatalog(options: { fresh: (userId: string) => Promise<Account>; fetcher: typeof fetch; endpoint: string; clientVersion: string; headers: (account: Account) => Record<string, string>; ttlMs: number; maxAccounts: number }) {
  const entries = new Map<string, Entry>();
  const active = new Map<string, Set<AbortController>>();
  let disposed = false;
  function invalidate(userId: string) {
    entries.delete(userId);
    for (const controller of active.get(userId) ?? []) controller.abort(new Error('Account connection changed. Try again.'));
  }
  async function models(userId: string, request: CatalogOptions = {}): Promise<CodexModel[]> {
    if (disposed) throw new Error('Codex connection disposed.');
    request.signal?.throwIfAborted();
    // Register before the asynchronous account read, so disconnect also fences that gap.
    const controller = new AbortController();
    const controllers = active.get(userId) ?? new Set<AbortController>();
    controllers.add(controller); active.set(userId, controllers);
    let ownsTask = false;
    const detach = () => { controllers.delete(controller); if (!controllers.size && active.get(userId) === controllers) active.delete(userId); };
    const callerSignal = request.signal ? AbortSignal.any([request.signal, controller.signal]) : controller.signal;
    try {
      // Never let a cached catalog bypass missing/disconnected credentials.
      const account = await wait(options.fresh(userId), callerSignal);
      if (disposed) throw new Error('Codex connection disposed.');
      callerSignal.throwIfAborted();
      let entry = entries.get(userId);
      if (entry && entry.accountId !== account.accountId) { entries.delete(userId); entry = undefined; }
      const result = (list: ListedModel[]) => list.filter(m => request.includeHidden || m.visible).map(({ visible, ...m }) => ({ ...m }));
      if (entry?.pending) return result(await wait(entry.pending, callerSignal));
      if (entry?.models && entry.expires > Date.now() && !request.refresh) return result(entry.models);
      if (options.ttlMs > 0 && !entry && entries.size >= options.maxAccounts) {
        // Evict settled entries, never another account's in-flight request.
        const oldest = [...entries].find(([, candidate]) => !candidate.pending);
        if (!oldest) throw new Error('Model catalog discovery is busy. Try again.');
        entries.delete(oldest[0]);
      }
      entry = { accountId: account.accountId, expires: 0 };
      if (options.ttlMs > 0) entries.set(userId, entry);
      const current = entry; ownsTask = true;
      const task = (async () => {
        const url = new URL(`${options.endpoint}/models`); url.searchParams.set('client_version', options.clientVersion);
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]);
        const res = await options.fetcher(url, { headers: options.headers(account), redirect: 'error', signal });
        if (!res.ok) { await res.body?.cancel(); throw new Error(`Could not list Codex models (${res.status}).`); }
        const data = await res.json() as { models?: { slug: string; display_name: string; visibility?: string; context_window?: unknown; max_context_window?: unknown }[] };
        if (!Array.isArray(data?.models) || data.models.some(m => !m || typeof m.slug !== 'string' || typeof m.display_name !== 'string')) throw new Error('Codex returned an invalid model catalog.');
        const capacity = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
        const list = data.models.map(m => ({ slug: m.slug, displayName: m.display_name, contextWindow: capacity(m.context_window), maxContextWindow: capacity(m.max_context_window), visible: m.visibility === 'list' }));
        signal.throwIfAborted();
        if (entries.get(userId) === current) { current.models = list; current.expires = Date.now() + options.ttlMs; }
        return list;
      })();
      current.pending = task;
      // Attach cleanup before caller cancellation can detach; failures never become cache hits.
      void task.then(() => { current.pending = undefined; }, () => { if (entries.get(userId) === current) entries.delete(userId); }).finally(() => {
        detach();
      });
      return result(await wait(task, callerSignal));
    } finally { if (!ownsTask) detach(); }
  }
  return { models, invalidate, dispose() { disposed = true; for (const id of active.keys()) invalidate(id); entries.clear(); } };
}
