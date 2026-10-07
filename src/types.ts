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
export interface CodexModel { slug: string; displayName: string }
export interface CodexConfig {
  store: AccountStore;
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
