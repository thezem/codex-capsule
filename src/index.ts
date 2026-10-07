import { randomUUID } from 'node:crypto';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText, stepCountIs, type ToolSet, type ModelMessage } from 'ai';
import { Auth } from './auth.js';
import type { CodexConfig, CodexModel } from './types.js';
export type { Account, AccountStore, AuthSession, CodexConfig, CodexModel, Encryption } from './types.js';
export { tool, stepCountIs } from 'ai';

export interface ChatOptions<T extends ToolSet> {
  userId: string;
  model: string;
  messages: ModelMessage[];
  tools?: T;
  instructions?: string;
  signal?: AbortSignal;
  maxSteps?: number;
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}

export function createCodex(config: CodexConfig) {
  if (!config?.store) throw new Error('Provide a server-side AccountStore.');
  const endpoint = (config.endpoint ?? 'https://chatgpt.com/backend-api/codex').replace(/\/$/, '');
  const issuer = (config.issuer ?? 'https://auth.openai.com').replace(/\/$/, '');
  for (const url of [endpoint, issuer]) if (new URL(url).protocol !== 'https:') throw new Error('Codex and auth endpoints must use HTTPS.');
  const timeoutMs = config.timeoutMs ?? 180000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs must be positive.');
  const fetcher = config.fetch ?? globalThis.fetch.bind(globalThis);
  const auth = new Auth(config.store, fetcher, issuer, config.clientId ?? 'app_EMoamEEZ73f0CkXaXp7hrann');
  const authHeaders = (account: Awaited<ReturnType<typeof auth.fresh>>) => ({
    Authorization: `Bearer ${account.accessToken}`,
    ...(account.accountId ? { 'chatgpt-account-id': account.accountId } : {}),
    originator: 'codex_cli_rs',
  });
  function model(userId: string, slug: string) {
    if (!userId || !slug) throw new Error('userId and model are required.');
    return createOpenAI({ baseURL: endpoint, apiKey: 'provided-by-capsule', fetch: async (_url, init) => {
      const account = await auth.fresh(userId);
      const request = JSON.parse(String(init?.body));
      // Codex accepts streaming Responses with client-supplied history only.
      request.instructions ||= 'Answer clearly and helpfully.';
      request.store = false; request.stream = true;
      delete request.max_output_tokens;
      const signal = init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
      const response = await fetcher(`${endpoint}/responses`, {
        method: 'POST', redirect: 'error', signal,
        headers: { ...authHeaders(account), 'Content-Type': 'application/json', Accept: 'text/event-stream',
          'OpenAI-Beta': 'responses=experimental', session_id: randomUUID() },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        // Never reflect request headers or tokens in an error.
        await response.body?.cancel();
        throw new Error(`Codex request failed (${response.status})${response.status === 401 || response.status === 403 ? '; reconnect your account' : ''}.`);
      }
      return response;
    } }).responses(slug);
  }
  return {
    auth: {
      start: (userId: string) => auth.start(userId),
      session: (userId: string) => auth.session(userId),
      cancel: (userId: string) => auth.cancel(userId),
      disconnect: (userId: string) => auth.disconnect(userId),
    },
    async models(userId: string, options: { includeHidden?: boolean; signal?: AbortSignal } = {}): Promise<CodexModel[]> {
      const account = await auth.fresh(userId);
      const url = new URL(`${endpoint}/models`); url.searchParams.set('client_version', config.clientVersion ?? '0.159.2');
      const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000);
      const res = await fetcher(url, { headers: authHeaders(account), redirect: 'error', signal });
      if (!res.ok) { await res.body?.cancel(); throw new Error(`Could not list Codex models (${res.status}).`); }
      const data = await res.json() as { models: { slug: string; display_name: string; visibility: string }[] };
      return data.models.filter(m => options.includeHidden || m.visibility === 'list').map(m => ({ slug: m.slug, displayName: m.display_name }));
    },
    model,
    chat<T extends ToolSet>(options: ChatOptions<T>) {
      const maxSteps = options.maxSteps ?? 5;
      if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 100) throw new Error('maxSteps must be 1–100.');
      return streamText({
        model: model(options.userId, options.model), messages: options.messages,
        system: options.instructions ?? 'Answer clearly and helpfully.', tools: options.tools,
        abortSignal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
        stopWhen: stepCountIs(maxSteps), maxRetries: 0,
        providerOptions: { openai: { store: false, reasoningEffort: options.reasoningEffort ?? 'low' } },
      });
    },
    dispose: () => auth.dispose(),
  };
}
export type Codex = ReturnType<typeof createCodex>;
