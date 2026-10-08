export interface Account {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  accountId?: string;
  email?: string;
  plan?: string;
}
/** Server-only storage. updateTokens must not recreate a deleted account. */
export interface AccountStore {
  get(userId: string): Promise<Account | null>;
  put(account: Account): Promise<void>;
  updateTokens(userId: string, account: Account): Promise<void>;
  delete(userId: string): Promise<void>;
}
export interface AuthSession {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  identity?: { email?: string; plan?: string };
  code?: string;
  url?: string;
  error?: string;
}
export interface CodexModel {
  slug: string;
  displayName: string;
  /** Default context window reported by the catalog; unknown is null. */
  contextWindow: number | null;
  /** Advertised maximum, which may require opt-in; unknown is null. */
  maxContextWindow: number | null;
}
export interface CodexConfig {
  store: AccountStore;
  /** Per-account catalog TTL. Default 60000 ms; 0 disables caching/coalescing. */
  modelCatalogCacheTtlMs?: number;
  /** Maximum cached or in-flight account catalogs. Default 100. */
  modelCatalogCacheMaxAccounts?: number;
  /** Default https://chatgpt.com/backend-api/codex; includes /responses and /models. */
  endpoint?: string;
  clientVersion?: string;
  clientId?: string;
  issuer?: string;
  fetch?: typeof fetch;
  /** Overall inference timeout, including tool execution. Default 180000. */
  timeoutMs?: number;
}
export interface Encryption {
  encrypt(plaintext: string): Promise<Uint8Array>;
  decrypt(ciphertext: Uint8Array): Promise<string>;
}
