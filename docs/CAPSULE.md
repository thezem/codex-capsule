# Plug into an app

## Install

```bash
npm install git+https://github.com/thezem/codex-capsule.git ai@^7 zod
```

Git installs invoke `prepare` to compile the package automatically. While private, authenticate Git using `gh auth setup-git`. Pin a tag/commit using `#v0.3.0` or `#<commit>` when you need a fixed version. Keep Node backend imports separate from `/ui` browser imports.

## 1. Create one backend instance

```ts
import { createCodex } from '@thezem/codex-capsule';
import { createAesEncryption, createEncryptedFileStore } from '@thezem/codex-capsule/storage';

// Supply a stable 32-byte key from your keyring or secret manager.
// Do not regenerate it at each start, put it in frontend env vars, or commit it.
const key = await yourSecretManager.getBytes('codex-credentials');
const store = createEncryptedFileStore({
  directory: './private-accounts',
  encryption: createAesEncryption(key),
});
export const codex = createCodex({ store });
```

For a database, implement the server-only `AccountStore` contract: `get`, `put`, `updateTokens`, `delete`. Encrypt tokens at rest; `updateTokens` must update an existing row only. Every call carries your app's authenticated `userId`; never accept an arbitrary user ID from the browser. ChatGPT connects to that app identity, rather than authenticating the app itself.

## 2. Add authentication routes

```ts
import { createAuthHandler } from '@thezem/codex-capsule/http';
const handle = createAuthHandler({
  codex,
  origin: 'https://your-app.example',
  resolveUser: async request => (await yourAppSession(request))?.userId ?? null,
  authorizeMutation: request => yourCSRFCheck(request), // optional extra check
});
```

Mount `handle` under `/api/codex/*`. It accepts a standard Web `Request` and returns `Response`; Next.js route handlers or a Node Fetch bridge can use it. Exact origin/host checking is built in for mutations; reverse proxies must create the request URL from the configured public origin. Routes:

| Method | Suffix | Result |
| --- | --- | --- |
| GET | session | public auth status |
| GET | models | visible model list |
| POST | start | code + verification URL, polling starts on backend |
| POST | cancel | stop pending sign-in; existing account stays |
| POST | disconnect | cancel pending sign-in and delete local credentials |

Disconnect deletes the local connection. It does not revoke a token at OpenAI or stop a model request already in flight; abort active chats in your app first. `dispose()` cancels pending device logins at shutdown.

## 3. Mount the optional UI

```ts
import { createAuthTransport, mountCodexAuth } from '@thezem/codex-capsule/ui';
const panel = mountCodexAuth(document.querySelector('#auth')!, {
  transport: createAuthTransport({
    baseURL: '/api/codex',
    headers: () => ({ 'X-CSRF-Token': yourPageCSRFToken }),
  }),
  labels: { title: 'Connect your account', connect: 'Sign in with ChatGPT' },
  theme: { accent: '#294331', radius: '24px', font: 'inherit' },
  onChange: session => { if (session.status === 'connected') showChat(); },
});
// On unmount: panel.destroy(). External auth changes: await panel.refresh().
```

This is a vanilla DOM component with Shadow DOM. Use a React `useEffect`/ref, Vue `onMounted`, Svelte `onMount`, or plain JavaScript. It has selectable code, copy/fallback, sign-in link, polling, cancel, retry/error, identity, and disconnect. It opens the OpenAI page only when the user clicks its link.

Theme fields: `accent`, `background`, `surface`, `text`, `muted`, `radius`, `font`. CSS variables also work: `--codex-*`, plus `--codex-button-text` and `--codex-error`. Style individual elements via `::part(panel)`, `title`, `description`, `identity`, `connect-button`, `button`, `code-row`, `code`, `copy-status`, `actions`, `sign-in-link`, `status`, `note`, `error`. All text labels are overridable through `labels`; theme values must be trusted app configuration. With restrictive CSP, permit the component's inline shadow CSS or supply an appropriate host policy.

A custom `AuthTransport` can replace HTTP entirely (e.g. Electron IPC). Only return `AuthSession` to the UI, never account tokens. You can also omit the component and build any auth UI using the same transport.

## 4. Plug in tools and chat

```ts
import { tool } from '@thezem/codex-capsule';
import { z } from 'zod';
const tools = {
  lookupOrder: tool({
    description: 'Look up an order belonging to the current user.',
    inputSchema: z.object({ orderId: z.string() }),
    execute: async ({ orderId }) => yourOrders.getForUser(userId, orderId),
  }),
};
const result = codex.chat({
  userId,
  model: selectedModel,
  messages: [{ role: 'user', content: 'Where is my order?' }],
  instructions: 'Help with orders. Use lookupOrder for order details.',
  tools,
  signal: request.signal,
  maxSteps: 5,
});
for await (const part of result.fullStream) {
  // text-delta, tool-call, tool-result, error, finish...
  sendToYourUI(part);
}
```

Tools are ordinary AI SDK tools, no capsule-specific registration. They run in your backend, with the permissions and dependencies you give them. Capture the authenticated user ID in each handler. Bound the agent with `maxSteps` and use approval logic for tools that need it. Agent definitions can simply be your own `{ instructions, model, tools }` objects passed to `chat`.

`chat` returns a standard AI SDK stream result, including `textStream`, `fullStream`, `steps`, and response helpers. For HTTP UI integration, use the SDK stream response helpers and corresponding AI SDK frontend protocol; the demo uses NDJSON instead. Always handle the error stream and request cancellation. For later turns, persist the full message history including `await result.response`'s `messages` (tool calls/results too), then append the next user message. Persist your own thread IDs and agent definitions; this package doesn't create native Codex threads.

## MCP tools

Use `@ai-sdk/mcp` in your backend and pass `await client.tools()` into `codex.chat({ tools })`. Read [MCP integration](MCP.md) for the complete example and lifecycle/auth guidance.

## Direct AI SDK use

```ts
import { streamText, stepCountIs } from 'ai';
const result = streamText({
  model: codex.model(userId, selectedModel),
  messages,
  tools,
  stopWhen: stepCountIs(5),
  maxRetries: 0,
});
```

Use streaming operations with this backend. `generateText` is not supported by this adapter because Codex requires streaming; consume `textStream` if you need a final string. Public Responses-only features, server-stored response IDs, built-in tools, and structured output modes are not guaranteed. Custom function tools and text/history are verified; other modalities need their own E2E.

## Defaults and ownership

`createCodex({ store, endpoint?, issuer?, clientId?, clientVersion?, fetch?, timeoutMs? })`:

- endpoint: `https://chatgpt.com/backend-api/codex`
- issuer: `https://auth.openai.com`
- OAuth client: observed Codex client `app_EMoamEEZ73f0CkXaXp7hrann`
- model catalog version: `0.159.2` (request metadata, no CLI dependency)
- inference timeout: 180 seconds; auth HTTP timeout: 30 seconds
- chat: Standard speed, low reasoning effort, five steps, no automatic retries
- `models(userId, { includeHidden: true })` can inspect the full catalog; hidden entries are not proof of callable models

Capsule owns OAuth device polling, verified ID-token identity claims, refresh coordination in one process, Codex request normalization, and AI SDK integration. It forces `stream: true` and `store: false`, adds fallback instructions, and removes `max_output_tokens`, which this backend rejects. `store: false` is API response storage behavior, not a zero-retention promise.

Host owns app authentication, persistent encryption key, storage, routes, authorized tools, conversation persistence, and deployment. Node 22+, network egress to auth.openai.com and chatgpt.com, and a long-lived process are needed. Device state and refresh locks are process-local; serverless restarts or multiple replicas require another coordination layer. This doesn't bundle a CLI, desktop app, platform keyring, or Codex workspace engine.

## Reasoning and speed

Control thinking effort and processing speed independently:

```ts
const result = codex.chat({
  userId,
  model: selectedModel,
  messages,
  tools: yourTools,
  reasoningEffort: 'medium',
  speed: 'fast',
});
```

`reasoningEffort`: `none`, `low`, `medium`, `high`, `xhigh`, `max`.
`speed`: `standard` or `fast`. Chat defaults to `low` and `standard`.
The selected model must support the requested effort and tier. Fast availability depends on the account/model and uses more subscription allowance.

Using AI SDK directly:

```ts
const model = codex.model(userId, selectedModel, {
  reasoningEffort: 'high',
  speed: 'standard',
});
const result = streamText({ model, messages, tools: yourTools });
```

Model controls are applied on every request, including tool continuations. Explicit model controls take precedence over conflicting AI SDK provider options. `codex.model()` defaults to Standard; when its effort is omitted, AI SDK provider options/backend defaults determine effort.

Standard sends `service_tier: "default"`; Fast sends `service_tier: "priority"`. A request is not proof of the tier actually served: inspect `await result.providerMetadata` and its `openai.serviceTier` when supplied by the backend. An unavailable tier can be rejected or changed by the backend; the capsule does not retry silently with another tier.

See [OpenAI speed documentation](https://developers.openai.com/codex/speed).

## Personal hosted storage

OAuth itself does not require encrypted storage. You can supply your own `AccountStore`; the bundled file adapter requires encryption. For a personal hosted app, keep that protection: store the encryption key in your hosting provider's secret settings, separately from credential files/backups. Keep credentials server-side and your app access private. Encryption protects copied credential files; it does not protect against an attacker who controls the running server and its key.
