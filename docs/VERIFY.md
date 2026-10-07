# Verification

## Package and GitHub install

```bash
npm ci
npm run verify
npm pack
```

`verify` checks types, compiled package exports, examples, browser/backend separation, and the packed file list. GitHub installation invokes `prepare` to build exports. For a clean consumer:

```bash
mkdir capsule-consumer
cd capsule-consumer
npm init -y
npm install git+https://github.com/thezem/codex-capsule.git ai@^7 zod
node --input-type=module -e "import('@thezem/codex-capsule').then(m => console.log(typeof m.createCodex))"
```

While the repo is private, Git must be authenticated. `gh auth setup-git` configures the GitHub CLI credential helper. Never put access tokens in the URL. Once public, this same URL works without private-repository access.

## Auth and UI E2E

```bash
npm run verify:auth
```

Uses a temporary HTTPS provider/app harness with signed identity tokens, actual HTTP routes, encrypted on-disk credentials, and an isolated headless browser. Requires OpenSSL and system Chrome or Playwright Chromium. It covers login/approval, expired-token refresh, concurrent refresh, cancellation, disconnect races, origin protection, two-user isolation, and the browser auth component. Temporary accounts are deleted at completion. Reports/screenshots go to `.artifacts/` and are ignored by Git.

**This harness proves lifecycle behavior against the exercised protocol, not fresh approval or rotation at OpenAI.**

## Live model and tool E2E

Use an independently connected account in the included encrypted store format. Put the 32-byte key in a file readable only by you, or adapt the script to your keyring. Paths are configuration; credentials are not printed.

```bash
CODEX_ACCOUNT_DIRECTORY=/absolute/private-accounts \
CODEX_KEY_FILE=/absolute/private-key \
CODEX_USER_ID=your-app-user \
npm run verify:live
```

Optional migration settings: `CODEX_ACCOUNT_FILENAME` for a single existing file; `CODEX_MODEL` to select a catalog model. The default picks the first visible model. The script lists models, asks the model to call a supplied multiply tool, then passes full tool history into a follow-up. It saves `.artifacts/live.json` with outputs and events, never tokens. This consumes real account usage.

## Release acceptance

Before claiming a production-ready release, also exercise:

- Fresh ChatGPT approval and identity verification on the real issuer.
- Actual expired-token rotation and reconnection after provider errors.
- Restart with the same store/key and an independent second real account.
- Stream cancellation and authorized tools in the target app/deployment.

Distributed/serverless execution and non-text capabilities are not certified by these checks. Current release evidence is documented in `RELIABILITY.md`; passing type checks is not live authentication proof.
