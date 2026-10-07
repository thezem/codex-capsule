# Security

Keep account tokens and encryption keys on the backend. The UI must receive only `AuthSession` and a one-time device code. Resolve app user IDs from trusted sessions, scope tools to that user, and bind auth mutations to the configured public origin.

Store a persistent 32-byte encryption key in your keyring or secret manager, separate from encrypted account files. The file adapter and refresh coordination assume one process; distributed deployments need shared locking and storage. Disconnect deletes the saved local connection, not a provider-wide token revocation.

Do not put tokens, account files, device codes, or private HTTP traces in public issues. Use GitHub's private vulnerability reporting if enabled; otherwise contact the repository owner privately before sharing details. No private reporting channel is promised by this document.

This package is unaffiliated with OpenAI. The direct backend can change; review service terms for your deployment.
