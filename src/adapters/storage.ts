import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import type { Account, AccountStore, Encryption } from '../types.js';

/** Keep this key in a keyring/secret manager, never in the package or browser. */
export function createAesEncryption(key: Uint8Array): Encryption {
  if (key.byteLength !== 32) throw new Error('Encryption key must contain exactly 32 bytes.');
  const secret = Buffer.from(key);
  return {
    async encrypt(text) {
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', secret, iv);
      const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
    },
    async decrypt(bytes) {
      const data = Buffer.from(bytes); if (data.length < 28) throw new Error('Invalid encrypted account.');
      const decipher = createDecipheriv('aes-256-gcm', secret, data.subarray(0, 12));
      decipher.setAuthTag(data.subarray(12, 28));
      return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
    },
  };
}

export function createEncryptedFileStore(options: {
  directory: string; encryption: Encryption;
  /** Optional migration of a single existing demo account, otherwise files are hashed per user. */
  singleAccount?: { userId: string; filename: string };
}): AccountStore {
  const path = (userId: string) => {
    if (options.singleAccount) {
      if (userId !== options.singleAccount.userId) throw new Error('This store is configured for one account.');
      if (options.singleAccount.filename !== options.singleAccount.filename.replace(/[/\\]/g, '') || options.singleAccount.filename === '..') throw new Error('Account filename must be a filename only.');
      return join(options.directory, options.singleAccount.filename);
    }
    return join(options.directory, `${createHash('sha256').update(userId).digest('hex')}.json`);
  };
  const queues = new Map<string, Promise<unknown>>();
  const serial = async <T>(id: string, operation: () => Promise<T>): Promise<T> => {
    const task = (queues.get(id) ?? Promise.resolve()).catch(() => {}).then(operation); queues.set(id, task);
    try { return await task; } finally { if (queues.get(id) === task) queues.delete(id); }
  };
  const get = async (userId: string): Promise<Account | null> => {
    try {
      const envelope = JSON.parse(await readFile(path(userId), 'utf8')) as { ciphertext: string };
      const account = JSON.parse(await options.encryption.decrypt(Buffer.from(envelope.ciphertext, 'base64'))) as Account;
      if (account.userId !== userId) throw new Error('Account owner mismatch.');
      return account;
    } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw new Error('Could not unlock the saved account. Check the encryption key or keyring.'); }
  };
  const put = async (account: Account) => {
    await mkdir(options.directory, { recursive: true, mode: 0o700 });
    const ciphertext = Buffer.from(await options.encryption.encrypt(JSON.stringify(account))).toString('base64');
    const target = path(account.userId), temporary = `${target}.${randomUUID()}.tmp`;
    try { await writeFile(temporary, JSON.stringify({ version: 1, ciphertext }), { mode: 0o600, flag: 'wx' }); await rename(temporary, target); }
    finally { await unlink(temporary).catch(() => {}); }
  };
  return {
    get,
    put: account => serial(account.userId, () => put(account)),
    updateTokens: (userId, account) => serial(userId, async () => { if (await get(userId)) await put({ ...account, userId }); }),
    delete: userId => serial(userId, async () => { await unlink(path(userId)).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; }); }),
  };
}
