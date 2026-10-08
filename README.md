![Codex Capsule — Your account. Your tools. Your agents.](assets/wordmark.svg)

# Codex Capsule

**ChatGPT sign-in and Codex models for the agents you build.**

A small TypeScript package that connects your app to the Codex model backend using ChatGPT sign-in, with Vercel AI SDK handling streaming and tool execution. Includes a customizable authentication UI for plain JavaScript, React, Vue, or Svelte.

No Codex CLI or app-server is required.

```text
Your app + your tools
        ↓
Vercel AI SDK
        ↓
Codex Capsule — sign-in, token refresh, account headers
        ↓
Codex model backend
```

## What's included

- Device-code sign-in with ChatGPT, connection status, cancellation, and disconnect.
- Token refresh and live model discovery per account.
- Encrypted file storage, or your own database through a small storage interface.
- AI SDK streaming and multi-step execution of the tools you supply.
- Optional auth UI with a selectable code, copy button, verification link, and configurable appearance and text.
- TypeScript types, examples, integration docs, and source references.

Your app owns its users, conversation history, agent configurations, and the code each tool executes. Credentials stay on the backend.

## Install from GitHub

```bash
npm install git+https://github.com/thezem/codex-capsule.git ai@^7 zod
```

The package builds automatically during installation. No manual clone, build, or archive step.

While this repository is private, authenticate Git first (`gh auth setup-git`). Once public, the same command works without private-repo access. You can pin a release or commit by appending `#v0.3.0` or `#<commit>` to the Git URL.

Requires **Node.js 22+** and **AI SDK 7**. `zod` is used for tool schemas in the examples; another AI SDK-compatible schema format also works. The package has not been published to the npm registry.

## Create the backend connection

```ts
import { createCodex } from '@thezem/codex-capsule';
import {
  createAesEncryption,
  createEncryptedFileStore,
} from '@thezem/codex-capsule/storage';

// Load a stable 32-byte key from your keyring or secret manager.
const key = await yourSecretManager.getBytes('codex-credentials');

const codex = createCodex({
  store: createEncryptedFileStore({
    directory: './private-accounts',
    encryption: createAesEncryption(key),
  }),
});
```

`yourSecretManager` represents your app's existing secret storage. Keep the key stable across restarts and separate from the credential files. For database storage, implement the exported `AccountStore` interface instead.

Create one `codex` instance when your backend starts and reuse it across requests. Use your app's authenticated user ID for every account operation.

## Sign in and list models

```ts
const login = await codex.auth.start(userId);

// Show these to the user, or use the included auth UI.
console.log(login.code);
console.log(login.url);

// The backend polls for approval. Check connection status from your UI.
const session = await codex.auth.session(userId);

if (session.status === 'connected') {
  const models = await codex.models(userId);
}
```

The user opens the verification page and enters the code. Device-code authorization must be enabled in their ChatGPT security settings. Browser responses contain public connection information, never access or refresh tokens.

## Model capacity and catalog caching

`models()` returns `{ slug, displayName, contextWindow, maxContextWindow }`.
Capacity fields are positive safe integer token counts, or `null` when the backend
omits them or supplies invalid values. `contextWindow` is the default reported
window; `maxContextWindow` is an advertised maximum and does not establish that an
experimental larger window is enabled. The capsule does not enforce a context budget.

Catalogs are cached per app user/account for 60 seconds and concurrent discovery
calls share one request. Reuse your backend's capsule instance to benefit from this
process-local cache; it is not shared between workers or persisted to storage.

```ts
const codex = createCodex({
  store,
  modelCatalogCacheTtlMs: 60_000,       // 0 disables cache and request coalescing
  modelCatalogCacheMaxAccounts: 100,   // bounds settled and in-flight catalogs
});
const visible = await codex.models(userId);
const all = await codex.models(userId, { includeHidden: true });
const fresh = await codex.models(userId, { refresh: true, signal });
```

Visible/hidden lists share a full catalog but are filtered independently. Returned
objects are copies. `refresh: true` bypasses a settled cache entry and still joins
an already-running discovery. Every call checks account credentials even on cache
hits. Starting sign-in, disconnecting or disposing invalidates relevant entries
and aborts their pending discovery. Discovery failures are never cached.

Cancelling one caller detaches that caller without aborting other waiters. A shared
read-only request may continue until its 20-second timeout and populate the cache
even if all callers detach. At the account limit, settled entries are evicted first;
if every slot is in flight, a new account receives a retryable busy error. Existing
Fast/Standard and reasoning controls are unchanged.

## Plug in MCP servers

Connect an MCP server with `@ai-sdk/mcp`, call `await client.tools()`, then pass the result to `codex.chat({ tools })`. See the [MCP integration guide](docs/MCP.md) for connection, authentication, cleanup, and combining tools.

## Plug in your tools

Tools are ordinary AI SDK tools. No extra registration layer.

```ts
import { tool } from '@thezem/codex-capsule';
import { z } from 'zod';

const tools = {
  multiply: tool({
    description: 'Multiply two numbers.',
    inputSchema: z.object({ a: z.number(), b: z.number() }),
    execute: async ({ a, b }) => ({ answer: a * b }),
  }),
};

const result = codex.chat({
  userId,
  model: selectedModel,
  messages: [{ role: 'user', content: 'What is 17 times 23? Use the tool.' }],
  instructions: 'Use your tools when they help answer the question.',
  tools,
  maxSteps: 5,
  signal: request.signal,
});

for await (const part of result.fullStream) {
  if (part.type === 'text-delta') sendToYourUI(part.text);
  if (part.type === 'error') throw part.error;
  // tool-call and tool-result events are available here too.
}
```

`selectedModel`, `userId`, `request`, and `sendToYourUI` come from your app. The capsule returns the normal AI SDK streaming result. To continue a conversation, save the full input history plus `(await result.response).messages`, including tool calls/results.

If you prefer to call AI SDK directly:

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

Use streaming operations with this backend; `generateText` is not supported by the adapter.

## Add the auth UI

First mount the included Fetch handler on your backend:

```ts
import { createAuthHandler } from '@thezem/codex-capsule/http';

const handleAuth = createAuthHandler({
  codex,
  origin: 'https://your-app.example',
  resolveUser: async request => (await yourAppSession(request))?.userId ?? null,
});
```

Route `/api/codex/*` requests to `handleAuth`. It accepts a standard Web `Request` and returns a `Response`; your app supplies the session resolver. Then mount the browser component:

```ts
import {
  createAuthTransport,
  mountCodexAuth,
} from '@thezem/codex-capsule/ui';

const panel = mountCodexAuth(document.querySelector('#auth')!, {
  transport: createAuthTransport({ baseURL: '/api/codex' }),
  labels: {
    title: 'Your account. Your agents.',
    connect: 'Sign in with ChatGPT',
  },
  theme: {
    accent: '#294331',
    background: '#f7f5ee',
    radius: '24px',
    font: 'inherit',
  },
  onChange: session => {
    if (session.status === 'connected') showChat();
  },
});

// When the host component unmounts:
// panel.destroy();
```

The component uses Shadow DOM and works with any framework that can mount a DOM element. Customize labels, theme variables, or CSS `::part` selectors. A custom transport can use Electron IPC or another bridge. You can also build your own UI around the same auth methods.

## Public API

| Entry point | Exports |
| --- | --- |
| `@thezem/codex-capsule` | `createCodex`, `tool`, `stepCountIs`, public types |
| `@thezem/codex-capsule/storage` | `createEncryptedFileStore`, `createAesEncryption` |
| `@thezem/codex-capsule/http` | `createAuthHandler` |
| `@thezem/codex-capsule/ui` | `mountCodexAuth`, `createAuthTransport` |

Keep the root, storage, and HTTP imports on the backend. Import only `/ui` in browser code.

## Documentation

- [Integration guide and configuration](docs/CAPSULE.md)
- [Source provenance and references](docs/SOURCE_NOTES.md)
- [Verification steps and failure modes](docs/VERIFY.md)
- [Prompt for integrating into another app](docs/APPLY_PROMPT.md)
- [Tool example](examples/tools.ts), [backend example](examples/backend.ts), [auth UI example](examples/auth-ui.ts)

## Reliability and limits

```bash
npm ci
npm run verify
npm run verify:auth
```

The auth suite exercises HTTP authentication and the browser UI against an isolated protocol harness; the opt-in live suite exercises a real model and tools. See [verification instructions](docs/VERIFY.md) and [reliability notes](docs/RELIABILITY.md).

Live checks have exercised model discovery, streaming, caller-supplied tools, and tool-history follow-ups. Fresh approval and real token rotation after the auth implementation changes still need verification with OpenAI. The protocol harness is not a substitute for that evidence.

The included file store and auth coordination target a single long-lived backend process. Multiple replicas or serverless restarts require shared coordination. Your app saves conversations and agent definitions; native Codex threads are outside this package.

This adapter uses the direct internal Codex backend, which can change. It enforces `stream: true` and `store: false`; the latter controls API response storage, not zero retention. It is unaffiliated with OpenAI and Vercel.

## License

**AGPL-3.0-only**. See [LICENSE](LICENSE), [NOTICE](NOTICE), and [source notes](docs/SOURCE_NOTES.md). AI SDK dependencies carry their own licenses. The code license does not grant permission to use OpenAI services outside their terms.

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

Live control verification (2026-10-07): GPT-6 Luna and GPT-6.1 Sol accepted priority requests and executed tools, but reported effective `default` tier. The Fast control requests priority routing; accelerated processing for the tested account remains unconfirmed.
