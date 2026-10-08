# Model catalog acceptance

Failure modes defined before implementation:

- Missing, negative, fractional, unsafe or string capacity becomes null; default and maximum stay separate.
- Concurrent requests duplicate discovery; hidden-list option pollutes visible results.
- Accounts share catalog or caller mutation changes cached results.
- TTL expiry, disabled caching, explicit refresh fail to refetch.
- Discovery errors become cached failures instead of allowing retries.
- One cancelled waiter aborts other callers; pre-aborted signal performs a request.
- Cache bypasses account-store validation after external credential deletion.
- Disconnect/start/dispose leaves in-flight discovery able to repopulate stale entries.
- Unbounded account growth; evicting active work silently cancels another caller.

The repeatable HTTPS fixture harness uses the exported capsule, real transport,
synthetic unexpired accounts and temporary self-signed certificates restricted to
its exact local origin. It is not a live OpenAI capacity or entitlement check.

## Result — 2026-10-08

- `npm run verify:models`: 16 checks passed; machine-readable result at
  `.artifacts/models-e2e.json` (generated, ignored by Git).
- `npm run verify`: TypeScript, consumer examples, exports and package contents passed.
- `npm run verify:auth`: all 11 existing HTTPS authentication/browser checks passed,
  including independent accounts, token-refresh races, approval/disconnect and mobile UI.
- `git diff --check`: passed.

No real ChatGPT login, model inference, provider entitlement or production deployment
was exercised. No user credentials were accessed or changed. Fast/Standard transport
mapping was unchanged. Layers remains pinned to its previous capsule commit until
its dependency and now-redundant wrapper are updated separately.

Cache limits count stored or in-flight catalog entries. With TTL zero, each call
performs its own discovery; normal caller cancellation detaches from the read-only
request rather than cancelling shared transport. Discovery is bounded to 20 seconds.
