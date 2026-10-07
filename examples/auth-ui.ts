import { createAuthTransport, mountCodexAuth } from '../dist/ui/index.js';
export function showAuth(element: HTMLElement, csrf: string) {
  return mountCodexAuth(element, {
    transport: createAuthTransport({ baseURL: '/api/codex', headers: { 'X-CSRF-Token': csrf } }),
    labels: { title: 'Your account. Your agents.' },
    theme: { accent: '#294331', radius: '24px', font: 'inherit' },
    onChange: session => console.log('Connection:', session.status),
  });
}
