import type { AuthSession } from '../types.js';
export type { AuthSession } from '../types.js';
export interface AuthTransport {
  session(): Promise<AuthSession>;
  start(): Promise<AuthSession>;
  cancel(): Promise<AuthSession>;
  disconnect(): Promise<AuthSession>;
}
export function createAuthTransport(options: {
  baseURL: string;
  headers?: Record<string, string> | (() => Record<string, string>);
  fetch?: typeof fetch;
}): AuthTransport {
  const request = async (action: string, method = 'GET'): Promise<AuthSession> => {
    const headers = typeof options.headers === 'function' ? options.headers() : options.headers;
    const res = await (options.fetch ?? fetch)(`${options.baseURL.replace(/\/$/, '')}/${action}`, { method, headers, credentials: 'same-origin' });
    const data = await res.json() as AuthSession & { error?: string };
    if (!res.ok) throw new Error(data.error || `Connection failed (${res.status}).`);
    return data;
  };
  return { session: () => request('session'), start: () => request('start', 'POST'), cancel: () => request('cancel', 'POST'), disconnect: () => request('disconnect', 'POST') };
}
export interface AuthUIOptions {
  transport: AuthTransport;
  labels?: Partial<Record<'title' | 'description' | 'connect' | 'waiting' | 'open' | 'copy' | 'copied' | 'cancel' | 'disconnect' | 'connected' | 'retry' | 'settings' | 'copyFallback' | 'codeLabel', string>>;
  theme?: Partial<Record<'accent' | 'background' | 'surface' | 'text' | 'muted' | 'radius' | 'font', string>>;
  pollMs?: number;
  onChange?: (session: AuthSession) => void;
}
const defaults = {
  title: 'Connect your ChatGPT account', description: 'Sign in to choose a model and start chatting.',
  connect: 'Continue with ChatGPT', waiting: 'Waiting for sign-in…', open: 'Open sign-in page',
  copy: 'Copy code', copied: 'Copied', cancel: 'Cancel', disconnect: 'Disconnect', connected: 'ChatGPT connected',
  copyFallback: 'Selected — press Ctrl+C or ⌘C', codeLabel: 'Sign-in code',
  retry: 'Try again', settings: 'Device-code authorization must be enabled in your ChatGPT security settings.',
};

/** Vanilla DOM mount: works in React/Vue/Svelte or a plain page. No secrets enter this component. */
export function mountCodexAuth(element: HTMLElement, options: AuthUIOptions) {
  const root = element.shadowRoot ?? element.attachShadow({ mode: 'open' });
  const labels = { ...defaults, ...options.labels };
  const style = document.createElement('style');
  style.textContent = `
    :host { display:block; color:var(--codex-text,#252623); font-family:var(--codex-font,system-ui,sans-serif) }
    * { box-sizing:border-box } section { background:var(--codex-background,transparent); padding:24px; border-radius:var(--codex-radius,24px) }
    h2 { margin:0 0 10px; font-size:24px; line-height:1.25 } p { line-height:1.5; margin:0 0 20px; color:var(--codex-muted,#686d65) }
    button,a { font:inherit; font-size:15px } button { cursor:pointer; border:0; padding:12px 18px; border-radius:var(--codex-radius,24px); min-height:44px }
    button:focus-visible,a:focus-visible { outline:2px solid var(--codex-accent,#294331); outline-offset:3px }
    button:disabled { cursor:wait; opacity:.6 } .primary { background:var(--codex-accent,#294331); color:var(--codex-button-text,#fff) }
    .secondary { background:var(--codex-surface,#eeece5); color:inherit } a { color:var(--codex-accent,#294331); text-underline-offset:4px }
    .actions,.code { display:flex; gap:12px; flex-wrap:wrap; align-items:center; margin-top:16px }
    input { font:inherit; width:180px; min-width:0; max-width:100%; letter-spacing:1px; padding:12px; border:0; outline:0; border-radius:12px; background:var(--codex-surface,#eeece5); color:inherit }
    .note { font-size:13px; margin:20px 0 0 } .error { color:var(--codex-error,#a43123); margin:16px 0; overflow-wrap:anywhere }
    @media(max-width:380px) { section { padding:16px } .code input { flex:1; width:140px } }
  `;
  root.replaceChildren(style);
  for (const [name, value] of Object.entries(options.theme ?? {})) element.style.setProperty(`--codex-${name}`, value!);
  const section = document.createElement('section'); section.setAttribute('part', 'panel'); root.append(section);
  let disposed = false, busy = true, timer: ReturnType<typeof setTimeout> | undefined;
  let revision = 0;
  let session: AuthSession = { status: 'disconnected' }, error = '', signature = '';
  const append = (tag: string, text: string, parent: HTMLElement = section, part?: string) => {
    const node = document.createElement(tag); node.textContent = text; if (part) node.setAttribute('part', part); parent.append(node); return node;
  };
  const button = (text: string, run: () => void, parent: HTMLElement = section, primary = false) => {
    const node = append('button', text, parent, primary ? 'connect-button' : 'button') as HTMLButtonElement;
    node.type = 'button'; node.className = primary ? 'primary' : 'secondary'; node.disabled = busy; node.onclick = run; return node;
  };
  const schedule = () => {
    clearTimeout(timer);
    if (!disposed && session.status === 'connecting') timer = setTimeout(() => void refresh(), Math.max(1000, options.pollMs ?? 1500));
  };
  const render = () => {
    const key = JSON.stringify({ session, error, busy }); if (key === signature) return; signature = key;
    section.replaceChildren();
    if (session.status === 'connected') {
      append('h2', labels.connected, section, 'title');
      if (session.identity?.email) append('p', session.identity.email, section, 'identity');
      button(labels.disconnect, () => void act(() => options.transport.disconnect()));
    } else {
      append('h2', labels.title, section, 'title'); append('p', labels.description, section, 'description');
      if (session.status === 'connecting') {
        const status = append('p', labels.waiting, section, 'status'); status.setAttribute('role', 'status');
        if (session.code) {
          const row = append('div', '', section, 'code-row'); row.className = 'code';
          const input = append('input', '', row, 'code') as HTMLInputElement;
          input.readOnly = true; input.value = session.code; input.setAttribute('aria-label', labels.codeLabel); input.onclick = () => input.select();
          button(labels.copy, async () => {
            try { await navigator.clipboard.writeText(session.code!); copied.textContent = labels.copied; }
            catch { input.focus(); input.select(); copied.textContent = labels.copyFallback; }
          }, row);
          const copied = append('span', '', row, 'copy-status'); copied.setAttribute('role', 'status');
        }
        const actions = append('div', '', section, 'actions'); actions.className = 'actions';
        if (session.url) {
          try {
            const url = new URL(session.url);
            if (url.protocol === 'https:') { const link = append('a', labels.open, actions, 'sign-in-link') as HTMLAnchorElement; link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; }
          } catch { /* Ignore invalid URLs from a custom transport. */ }
        }
        button(labels.cancel, () => void act(() => options.transport.cancel()), actions);
        const note = append('p', labels.settings, section, 'note'); note.className = 'note';
      } else button(session.status === 'error' ? labels.retry : labels.connect, () => void act(() => options.transport.start()), section, true);
    }
    const message = error || session.error;
    if (message) { const alert = append('p', message, section, 'error'); alert.className = 'error'; alert.setAttribute('role', 'alert'); }
  };
  const accept = (next: AuthSession) => {
    if (disposed) return;
    error = '';
    const changed = JSON.stringify(session) !== JSON.stringify(next); session = next;
    render(); if (changed) options.onChange?.(session); schedule();
  };
  const act = async (operation: () => Promise<AuthSession>) => {
    if (busy || disposed) return; revision++; clearTimeout(timer); busy = true; error = ''; render();
    try { accept(await operation()); } catch (e) { error = e instanceof Error ? e.message : 'Connection failed.'; }
    finally { busy = false; if (!disposed) { render(); schedule(); } }
  };
  async function refresh() {
    if (disposed || busy) return;
    const ownRevision = ++revision;
    try { const next = await options.transport.session(); if (ownRevision === revision) accept(next); } catch (e) { if (ownRevision === revision && !disposed) { error = e instanceof Error ? e.message : 'Could not check connection.'; render(); schedule(); } }
  }
  render(); busy = false; void act(() => options.transport.session());
  return { refresh, destroy() { disposed = true; clearTimeout(timer); root.replaceChildren(); } };
}
