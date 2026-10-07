import { tool } from '../dist/index.js';
import { z } from 'zod';

// Pass this ordinary AI SDK tools object to codex.chat({ ..., tools }).
export const tools = {
  getCurrentTime: tool({
    description: 'Read the server clock in an IANA timezone.',
    inputSchema: z.object({ timezone: z.string() }),
    execute: async ({ timezone }) => ({
      timezone,
      utc: new Date().toISOString(),
      local: new Intl.DateTimeFormat('en-GB', { timeZone: timezone, dateStyle: 'full', timeStyle: 'long' }).format(new Date()),
    }),
  }),
};
