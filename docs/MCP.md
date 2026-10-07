# Plug in MCP servers

Use AI SDK's MCP client on your backend. It discovers a server's tools and converts them into ordinary AI SDK tools; pass those directly to `codex.chat({ tools })`. No capsule-specific MCP registration or Codex CLI/app-server is needed.

## Install in the consuming app

```bash
npm install @ai-sdk/mcp
```

Choose a release compatible with the consuming app's AI SDK version (this package uses AI SDK 7). This is an optional host dependency, not bundled in Codex Capsule.

## Connect and chat

This example assumes your backend already has `codex`, an authenticated `userId`, a selected `model`, and `messages`.

```ts
import { createMCPClient } from '@ai-sdk/mcp';

const mcp = await createMCPClient({
  transport: {
    type: 'http',
    url: 'https://your-mcp-server.com/mcp',
    // If required, use this MCP server's credentials:
    // headers: { Authorization: `Bearer ${process.env.MCP_TOKEN}` },
  },
});

try {
  const tools = await mcp.tools();
  const result = codex.chat({
    userId,
    model,
    messages,
    tools,
    maxSteps: 5,
  });

  for await (const part of result.fullStream) {
    if (part.type === 'error') throw part.error;
    if (part.type === 'text-delta') process.stdout.write(part.text);
    // Forward tool-call/tool-result events to your UI if desired.
  }

  // Save complete assistant/tool messages for the next turn.
  const response = await result.response;
  await saveMessages([...messages, ...response.messages]); // Your app's persistence.
} finally {
  await mcp.close();
}
```

The model requests a function tool, AI SDK invokes the MCP server, and the tool result returns to the model for its next step. The connection must stay open until streaming and tool execution finish. For a shared long-lived client, close it on backend shutdown instead; keep credentials and clients scoped to the correct app user.

## Combine servers and custom tools

```ts
const tools = {
  ...await mcp.tools(),
  ...yourTools,
};
```

You can connect several MCP clients and combine their tool sets the same way. Check tool names first: object spreading silently replaces duplicate names. Keep names unique or explicitly select/rename tools before combining them.

The same `tools` object works with AI SDK's `streamText({ model: codex.model(userId, model), tools, ... })`. Set an appropriate multi-step stop condition when using AI SDK directly; `codex.chat()` already supplies one.

## Integration notes for agents

- Prefer Streamable HTTP for remote/hosted MCP servers. A stdio server requires launching its process on the backend host; it does not provide access to programs on a remote user's computer. SSE is available for servers that require it.
- ChatGPT authentication connects the model. MCP authentication is separate: supply the MCP service's token or its OAuth configuration. Never send ChatGPT account tokens to an MCP server.
- Pass only tools intended for the current user. MCP annotations do not automatically enforce permissions or approvals. Preserve the host app's authorization and approval policy.
- This approach uses client-side tool execution. Do not substitute the OpenAI provider's built-in remote MCP tool: support for that feature on this private Codex endpoint has not been verified.
- `mcp.tools()` supplies tools. Resources and prompts require their own client calls and app logic; they are not automatically added to model context.
- Handle tool/transport errors and cancellation in the host. Close request-scoped clients after the stream ends or fails, not immediately after `codex.chat()` returns.

## Evidence and references

This integration pattern is documented by AI SDK and fits the capsule's existing `tools` API. Live custom function tools have been verified with the capsule; a real MCP server connection has not yet been exercised with it. This documentation update adds no dependency or runtime behavior.

- [AI SDK MCP guide](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools)
- [createMCPClient reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/create-mcp-client)
- [AI SDK tool calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
- [Capsule integration guide](CAPSULE.md)
