# Architecture and references

Codex Capsule owns device authentication, credential refresh, account headers, model discovery, and the Responses transport adapter. Vercel AI SDK owns message/tool serialization, streamed model events, and the tool execution loop. The browser entry owns only connection UI and its public transport.

The initial connection was exercised in a local chat prototype, then consolidated into this standalone package. Authentication is a focused device-flow implementation: code → approval polling → token exchange → verified identity → encrypted account storage. Credential commit checks protect cancelled or superseded connections. The host supplies its user identity, storage key, routes, tools, and conversation persistence.

## References

- [AI SDK OpenAI provider](https://ai-sdk.dev/providers/ai-sdk-providers/openai): custom fetch/headers and Responses support.
- [AI SDK tool calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling): input schemas, execution callbacks, multi-step loops.
- [AI SDK streaming](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text): result events and HTTP response helpers.
- [OpenAI Codex source](https://github.com/openai/codex): underlying protocol reference.
- [Codex catalog endpoint](https://github.com/openai/codex/blob/main/codex-rs/codex-api/src/endpoint/models.rs): model discovery and client version.
- [Codex authentication](https://developers.openai.com/codex/auth): ChatGPT login and device-code authorization.
- [OAuth discovery](https://auth.openai.com/.well-known/openid-configuration): issuer and JWKS location.

This uses the direct Codex backend, rather than the separate official SIWC devkit. Endpoint behavior is verified separately from SDK documentation; neither implies a supported hosted subscription service. See `NOTICE` for retained third-party attribution and `LICENSE` for licensing.

- [Codex service-tier mapping](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/config_types.rs): Fast maps to request value `priority`; explicit Standard uses `default`. Confirmed by direct requests: literal `fast` was rejected with HTTP 400 on 2026-10-07.
