# Changelog

## Unreleased

- Preserve default and maximum catalog context-window metadata with nullable validated counts.
- Add configurable, bounded per-account model catalog caching and concurrent discovery coalescing.
- Support explicit catalog refresh, independent caller cancellation and auth/dispose invalidation.
- Add repeatable HTTPS model-catalog verification; no live OpenAI entitlement claims.

## 0.3.0

- Expose independent reasoning effort and Standard/Fast controls for chat and direct AI SDK models.
- Apply controls on every transport request, including tool continuations, regardless of SDK model capability tables.
- Validate control values before inference; document defaults, precedence, and backend tier reporting.
- Extend live tool/follow-up verification to capture requested controls and effective tier metadata.

## 0.2.0

- Install directly from GitHub; `prepare` builds ESM and TypeScript declarations automatically.
- Package scope is now `@thezem/codex-capsule`; public function names remain the same.
- Added independent branding, GitHub-first installation docs, contributor/security guides, and repeatable verification scripts.
- Sign-in cancellation no longer invalidates an unrelated refresh; refresh commits check the stored credential generation.
- Device polling tolerates temporary network/server failures and bounds the polling interval.
- Aborted model calls are checked before and after token resolution.
- Added credential-envelope/catalog validation and clearer configuration errors.
- Auth UI starts with disabled controls, clears recovered errors, and exposes accessibility/copy fallback labels.

## 0.1.0

Initial private package: ChatGPT device authentication, encrypted storage adapter, Codex Responses integration, AI SDK tools, and customizable browser auth UI.
