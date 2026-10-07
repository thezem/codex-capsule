# Source and references

## Implemented source

Extracted from a live local Direct Codex Chat demo on 2026-10-07. The demo host and its account data are not included in this standalone repository. The demo's `doop-client.ts` used `vendor/doop-subscription/internals/oauth.ts` for device OAuth and Vercel AI SDK's Responses provider for streaming and tools.

Upstream behavior came from the [Doop fork](https://github.com/thezem/doop): `server/modelAccounts.ts` (account connection), `server/openaiAgent.ts` (Codex requests), `server/agentModel.ts` (account selection). Their AGPL license is retained in this package.

Authentication was rewritten as a focused device-flow module: start → show code/URL → poll approval → exchange → verify identity token with issuer JWKS → encrypted store. Epoch checks and serialized account writes prevent cancelled or superseded logins from committing credentials. Refresh locks are per account in one process. The browser callback server, paste flow, canvas roles, design agents, and Doop database were excluded.

The model adapter refreshes the user's token, sends ChatGPT account headers, and lets `@ai-sdk/openai` handle message/tool serialization and SSE. AI SDK owns the tool execution loop. The UI is new, framework-neutral code. The demo's Linux keyring implementation remains host code; package encryption accepts a supplied key or encryption implementation.

## Direct sources

- [AI SDK OpenAI provider](https://ai-sdk.dev/providers/ai-sdk-providers/openai): custom URL/fetch/headers and Responses support.
- [AI SDK tools and tool calls](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling): tool schemas, execute callbacks, multi-step execution.
- [AI SDK streaming reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text): streaming result and response helpers.
- [OpenAI Codex source](https://github.com/openai/codex): underlying protocol implementation reference.
- [Codex model endpoint source](https://github.com/openai/codex/blob/main/codex-rs/codex-api/src/endpoint/models.rs): catalog and client-version query.
- [Codex authentication documentation](https://developers.openai.com/codex/auth): ChatGPT login and device-code authorization.
- [OAuth discovery](https://auth.openai.com/.well-known/openid-configuration): issuer and JWKS location; checked live on 2026-10-07.
- [Official SIWC devkit](https://github.com/openai/sign-in-with-chatgpt-devkit): separate integration, not bundled here.
- [SIWC service terms](https://openai.com/policies/sign-in-with-chatgpt-terms/): official route terms, not evidence that this private backend is a supported public API.

The direct Codex endpoints were exercised live with the user's independently connected demo account. Documentation verifies SDK capabilities, not OpenAI support for third-party subscription services. The backend/client identifier is changeable; `endpoint`, `issuer`, `clientId`, and `clientVersion` are configurable. Fresh sign-in completion and actual token rotation in the rewritten auth module require dedicated verification; reused saved credentials do not prove those paths.
