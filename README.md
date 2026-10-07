# Codex Capsule

**Connect a ChatGPT account. Choose a Codex model. Pass in your tools.**

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

## Install

This repository is private. Authenticate with GitHub before cloning.

```bash
gh repo clone thezem/codex-capsule
cd codex-capsule
npm ci
npm run build
npm pack
```

Then install the archive in your app:

```bash
npm install /path/to/codex-capsule/hazem-codex-capsule-0.1.0.tgz ai@^7 zod
```

Requires **Node.js 22+** and **AI SDK 7**. `zod` is used in the examples for tool inputs; you can use another schema format supported by AI SDK.

## Create the backend connection

```ts
import { createCodex } from '@hazem/codex-capsule';
import {
  createAesEncryption,
  createEncryptedFileStore,
} from '@hazem/codex-capsule/storage';

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

## Plug in your tools

Tools are ordinary AI SDK tools. No extra registration layer.

```ts
import { tool } from '@hazem/codex-capsule';
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
import { createAuthHandler } from '@hazem/codex-capsule/http';

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
} from '@hazem/codex-capsule/ui';

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
| `@hazem/codex-capsule` | `createCodex`, `tool`, `stepCountIs`, public types |
| `@hazem/codex-capsule/storage` | `createEncryptedFileStore`, `createAesEncryption` |
| `@hazem/codex-capsule/http` | `createAuthHandler` |
| `@hazem/codex-capsule/ui` | `mountCodexAuth`, `createAuthTransport` |

Keep the root, storage, and HTTP imports on the backend. Import only `/ui` in browser code.

## Documentation

- [Integration guide and configuration](docs/CAPSULE.md)
- [Source provenance and references](docs/SOURCE_NOTES.md)
- [Verification steps and failure modes](docs/VERIFY.md)
- [Prompt for integrating into another app](docs/APPLY_PROMPT.md)
- [Tool example](examples/tools.ts), [backend example](examples/backend.ts), [auth UI example](examples/auth-ui.ts)

## Verification and current limits

The package built and installed in a separate consumer folder. Live checks exercised model discovery, streaming chat, a supplied function tool, and a follow-up using full tool history. Browser checks exercised the actual device code, copy button, cancellation, and customizable auth component.

**Fresh sign-in completion after the auth rewrite and actual token rotation remain unverified.** The acceptance checks are documented in [VERIFY.md](docs/VERIFY.md).

The included file store and auth coordination are designed for a single long-lived backend process. Multiple replicas or serverless restarts require shared coordination. Conversations and agent definitions belong to your app; this package does not create native Codex threads.

The adapter uses the direct internal Codex backend, which can change. It enforces `stream: true` and `store: false`; the latter controls API response storage and is not a zero-retention guarantee. This is not the official Sign in with ChatGPT devkit or a guarantee of support for hosted subscription services.

## License

**AGPL-3.0-only**, retained from the Doop-derived source. See [LICENSE](LICENSE), [NOTICE](NOTICE), and [source notes](docs/SOURCE_NOTES.md). AI SDK dependencies carry their own licenses. The code license does not grant permission to use OpenAI services outside their terms.
