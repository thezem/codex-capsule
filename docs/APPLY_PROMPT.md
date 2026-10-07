Integrate the supplied Codex Capsule package into this app. First inspect the app's framework, backend routes, authentication, storage, and UI conventions. Read the package README, docs/CAPSULE.md, docs/SOURCE_NOTES.md, docs/VERIFY.md, src/index.ts and src/types.ts before editing.

Install the package from its GitHub URL and supported dependencies. Keep backend/root, /storage, and /http imports server-only; use /ui in the frontend. Use one createCodex instance per long-lived backend process, an encrypted AccountStore, and the app's authenticated user ID. Wire the auth Fetch handler with the actual public origin and session resolution. Mount the customizable auth UI in the app's existing design, or use its headless transport. Never send account tokens to the browser.

Use codex.chat with ordinary AI SDK tools; bind tool authorization to the current app user. Preserve complete conversation/tool history and the app's cancellation/error behavior. Don't add Codex CLI or app-server. Don't pretend the private backend is a supported public API; preserve source attribution and AGPL license.

Preserve app conventions and expose only intended capsule exports. Run package build and the real target-app sign-in/model/tool-loop E2E; save repeatable evidence and report each unverified path separately. Do not publish or deploy unless requested.
