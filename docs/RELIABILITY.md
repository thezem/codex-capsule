# Reliability checks

Before changing the implementation, these are the failure paths being addressed:

1. Installing from a Git URL produces a package without compiled exports because `prepare` is missing.
2. A cancelled device login is superseded by an older response or commits a credential after disconnect.
3. Cancelling sign-in invalidates an unrelated token refresh, losing a rotated refresh token.
4. A refresh overwrites a newly connected account or recreates a disconnected one.
5. Abort arrives before token resolution but an inference request is still sent.
6. A corrupt model catalog or credential envelope causes an obscure runtime exception.
7. Transient device polling failures terminate an otherwise valid approval flow.
8. Auth UI initially renders the wrong state, a stale status error stays after recovery, or custom labels omit copy fallback/accessibility text.
9. An installed package depends on files outside its repo or imports backend code from the browser entry.

Verification will use an isolated HTTP auth harness with signed identity tokens for lifecycle/race behavior, a real browser against that harness for UI behavior, and the existing independently connected account for live model/tool checks. Harness proof does not establish OpenAI's fresh approval or token-rotation behavior. Reports must state that boundary.

## 0.2.0 evidence

On 2026-10-07:

- A clean consumer installed the GitHub URL and imported all four compiled entry points without a manual build.
- Package/type/example checks and distribution inspection passed.
- The HTTPS auth/browser harness passed 11 lifecycle/UI scenarios, including verified synthetic identity tokens and encrypted store writes.
- A live GPT-6 Luna call executed a supplied multiply tool, returned 391, and remembered the tool result on the next turn.
- The README wordmark was rendered and inspected.

Reports are saved under `.artifacts/` when the verification commands run. Real fresh approval and token rotation at OpenAI remain release acceptance work, not claims made by the synthetic harness.
