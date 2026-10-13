// App core: shared state, event registry, routing helpers, toasts and dialogs.
import { render, esc, html } from './util.js';

export const state = {
  user: null,
  cartCount: 0,
  meta: { categories: [], gstRates: [5], maxImages: 5, whatsappAuto: false },
};

// views register handlers here; app.js wires a single delegated listener per event type
export const handlers = { click: {}, submit: {}, change: {} };
export const onClick = (name, fn) => { handlers.click[name] = fn; };
export const onSubmit = (name, fn) => { handlers.submit[name] = fn; };
export const onChange = (name, fn) => { handlers.change[name] = fn; };

export const hooks = { header: () => {} }; // set by app.js

// ---- routing -----------------------------------------------------------------
let token = 0;
let cleanups = [];

// Call at the start of every view; returns alive() which turns false once the user navigates away
export function newRoute() {
  token++;
  for (const f of cleanups) { try { f(); } catch { /* ignore */ } }
  cleanups = [];
  const mine = token;
  return () => mine === token;
}
export const onLeave = (fn) => cleanups.push(fn);

export const go = (path, replace = false) => {
  const h = '#' + path;
  if (location.hash === h) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else if (replace) location.replace(h);
  else location.hash = h;
};

// reload() re-runs the current route in place without jumping to the top
let keepScroll = false;
export const reload = () => {
  keepScroll = true;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
};

export function mount(content, scroll = true) {
  const el = document.getElementById('app');
  el.innerHTML = render(content);
  if (scroll) {
    if (!keepScroll) window.scrollTo(0, 0);
    keepScroll = false;
  }
}

export const loading = () => keepScroll ? null : mount(html`<div class="page"><div class="skeleton-grid">${[1, 2, 3, 4, 5, 6, 7, 8].map(() => html`<div class="skeleton"></div>`)}</div></div>`, false);

export function errorPage(err) {
  mount(html`<div class="page narrow"><div class="empty"><h1>${err.status === 404 ? 'We could not find that' : 'Something went wrong'}</h1><p>${err.message}</p><a class="btn" href="#/">Back to ChickpetBaazar</a></div></div>`);
}

// ---- toasts & dialogs -----------------------------------------------------------
export function toast(msg, type = 'ok') {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.classList.add('out'), 3800);
  setTimeout(() => el.remove(), 4300);
}

function dialog(inner) {
  return new Promise((resolve) => {
    const d = document.getElementById('dlg');
    d.innerHTML = render(inner);
    const done = (v) => { d.close(); resolve(v); };
    d.onclose = () => resolve(null);
    d.querySelector('[data-no]')?.addEventListener('click', () => done(null));
    d.querySelector('form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      done(new FormData(e.target));
    });
    d.showModal();
    d.querySelector('input,button[type=submit]')?.focus();
  });
}

export async function confirmBox({ title, text, ok = 'Confirm', danger = false }) {
  const r = await dialog(html`<form method="dialog" class="dlg-box">
      <h2>${title}</h2><p>${text}</p>
      <div class="dlg-actions"><button type="button" class="btn ghost" data-no>Cancel</button>
      <button type="submit" class="btn ${danger ? 'danger' : ''}">${ok}</button></div></form>`);
  return !!r;
}

export async function promptBox({ title, label, type = 'text', ok = 'Save', hint = '' }) {
  const r = await dialog(html`<form method="dialog" class="dlg-box">
      <h2>${title}</h2>
      <label class="field"><span>${label}</span><input name="v" type="${type}" required autocomplete="off"></label>
      ${hint ? html`<p class="hint">${hint}</p>` : ''}
      <div class="dlg-actions"><button type="button" class="btn ghost" data-no>Cancel</button>
      <button type="submit" class="btn">${ok}</button></div></form>`);
  return r ? String(r.get('v')) : null;
}

export function formError(form, msg) {
  const el = form.querySelector('.form-error');
  if (el) {
    el.textContent = msg;
    el.hidden = false;
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  } else toast(msg, 'error');
}

export const copyText = async (t) => {
  try { await navigator.clipboard.writeText(t); toast('Copied'); } catch { toast('Could not copy. Select the text and copy it.', 'error'); }
};

export { esc };
