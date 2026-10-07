# Verify the package

Before isolated checks, the relevant failure modes are: package omits exports; browser entry imports Node code; account or key leaks into distribution; code/URL does not render or copy; stale polling overwrites a newer sign-in; cancellation still saves a token; expired credentials fail refresh; one user's calls select another account; assistant/tool history serializes incorrectly; tool output never reaches a second step; a broken/aborted stream reports success; wrong-origin writes work.

## Build and distribution

```bash
npm install
npm run check
npm pack
```

Install the tarball into a separate empty folder with `ai@^7` and `zod`. Import the root, `/storage`, `/http`, and `/ui` entries. The `/ui` entry may be imported in Node without accessing DOM until mount; it contains no backend imports. Inspect tar contents: no credentials, environment files, keyring values, parent vendor directories, or node_modules.

## Historical demo integration (demo host not included)

The extraction was verified in a separate demo workspace using the commands below. These are provenance for the original live checks, not commands runnable in this standalone repository. For a new app, follow the acceptance steps in the next section.

In the original parent demo workspace:

```bash
npm run build --prefix packages/codex-capsule
npm run start:doop
node verification/ai-sdk-e2e.mjs
```

Expected: real plain reply; assistant history remembers apricot; `getCurrentTime` tool-call and tool-result events; final reply uses the clock output. Evidence is written to `verification/ai-sdk-e2e.json`. This consumes the package API through the HTTP demo, not a mock provider.

Open `http://127.0.0.1:4398/capsule.html` to inspect the package UI. Switch Warm/Dark/Plain. When disconnected, start sign-in, copy the code, open the verification link, approve, and confirm connected state. Cancelling before approval should leave any existing connection untouched. To avoid disturbing your main account, use a dedicated temporary user/store for disconnect checks.

## New-app acceptance

Use the same actual installed tarball and a real backend account store. Verify:

1. Device sign-in and approval; connected identity; no token in browser HTTP replies.
2. Restart with the same encryption key and stored account; list models and chat.
3. Live function-tool execution followed by a model reply using its output; save full tool history and ask a follow-up.
4. Abort an active stream; completion isn't claimed; backend becomes available for a new request.
5. Expired account refreshes once; refresh failure asks for reconnection. Don't force-expire or rotate a shared production account just for a check.
6. Cancel/disconnect while approval/refresh is in progress; no late reconnection.
7. Two independent accounts don't share credentials, conversations, or tools; wrong-origin mutation receives 403 and unauthenticated request receives 401.

Checks 1, 5, 6, and 7 need explicit live evidence for the target deployment. The included package's current verification report identifies what was exercised and what remains untested. Type checking is not E2E proof.

## Debugging

- Device start refused: enable device-code authorization in ChatGPT security settings; server egress may also be blocked.
- Credential file won't unlock: restore the exact persistent key/keyring and directory; don't silently overwrite it.
- 401/403 inference: reconnect that account.
- 429: wait for account usage limits; don't retry automatically in a tool loop.
- Missing models: inspect the actual live catalog; the package does not hardcode model names.
- Invalid history: pass AI SDK `ModelMessage[]`, keeping full tool call/result messages.
- UI mutation 403: verify public origin, app session, and any CSRF header.
