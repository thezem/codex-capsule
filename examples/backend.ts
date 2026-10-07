import { createCodex, type AccountStore } from '../dist/index.js';
import { tools } from './tools.js';

// Call once when your server starts. Keep this instance across requests.
export function createBackend(store: AccountStore) {
  const codex = createCodex({ store });
  return {
    codex,
    async chat(userId: string, model: string) {
      const result = codex.chat({ userId, model, messages: [{ role: 'user', content: 'What time is it in Cairo? Use the tool.' }], tools });
      let text = '';
      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') text += part.text;
        if (part.type === 'error') throw part.error;
      }
      return { text, messages: (await result.response).messages };
    },
    shutdown: () => codex.dispose(),
  };
}
