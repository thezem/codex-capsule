# Contributing

```bash
npm ci
npm run verify
npm run verify:auth
```

Use Node 22+. Auth verification uses a local HTTPS protocol harness and browser E2E. It requires OpenSSL plus either a system Chrome (`CODEX_BROWSER_PATH`) or Playwright Chromium (`npx playwright install chromium`). Harness accounts are temporary and contain no real credentials. Read `docs/RELIABILITY.md` before changing lifecycle behavior.

For real backend verification, provide an independent account file/key as documented in `docs/VERIFY.md`; never commit credentials or paste them into issues. Live checks use subscription usage and must stay opt-in.

Preserve the small backend/browser boundary, normal AI SDK tool objects, and typed public exports. Prefer end-to-end behavior checks with repeatable artifacts. Explain the failure mode before changing code; avoid tests that merely mirror implementation. Keep OpenAI live evidence distinct from protocol-harness results. Preserve license and notices.
