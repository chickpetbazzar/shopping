// Small helpers shared by every view.
// html`...` escapes every interpolated value unless it is wrapped with raw() or is itself html``.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const raw = (s) => ({ __raw: String(s) });

export function render(v) {
  if (v === null || v === undefined || v === false || v === true) return '';
  if (Array.isArray(v)) return v.map(render).join('');
  if (typeof v === 'object' && '__raw' in v) return v.__raw;
  return esc(v);
}

export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) out += render(vals[i]);
  });
  return raw(out);
}

export const inr = (paise) => {
  const n = Number(paise) || 0;
  return '₹' + (n / 100).toLocaleString('en-IN', { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 });
};

// SQLite timestamps are UTC "YYYY-MM-DD HH:MM:SS"
export function when(ts, withTime = true) {
  if (!ts) return '';
  const d = new Date(String(ts).replace(' ', 'T') + 'Z');
  if (isNaN(d)) return '';
  return d.toLocaleString('en-IN', withTime
    ? { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}

const safeSrc = (s) => (typeof s === 'string' && /^\/(uploads|img)\/[\w.\-]+$/.test(s) ? s : '');

// Allow only the link types the app creates itself
export function safeHref(u) {
  u = String(u || '');
  if (/^(#|\/)/.test(u) || /^https:\/\/wa\.me\/\d+/.test(u) || /^upi:\/\/pay\?/.test(u)) return u;
  return '#';
}

const hue = (name) => {
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
};

export function img(src, alt = '', cls = '') {
  const s = safeSrc(src);
  if (s) return html`<img class="${cls}" src="${s}" alt="${alt}" loading="lazy" decoding="async">`;
  return html`<div class="ph ${cls}" style="--h:${hue(alt)}" role="img" aria-label="${alt}"><span>${String(alt).trim().charAt(0).toUpperCase() || 'C'}</span></div>`;
}

export const stars = (r) =>
  html`<span class="stars" style="--r:${Number(r) || 0}" role="img" aria-label="${Number(r) || 0} out of 5 stars"></span>`;

export const STATUS_LABEL = {
  placed: 'Order placed', confirmed: 'Confirmed', packed: 'Packed', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled',
};
export const PAY_LABEL = {
  unpaid: 'Payment pending', submitted: 'Payment to verify', paid: 'Paid', failed: 'Payment not found', cod: 'Pay on delivery',
};
export const statusChip = (s) => html`<span class="chip st-${s}">${STATUS_LABEL[s] || s}</span>`;
export const payChip = (s) => html`<span class="chip pay-${s}">${PAY_LABEL[s] || s}</span>`;

export function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const i = raw.indexOf('?');
  const path = i >= 0 ? raw.slice(0, i) : raw;
  return { path: path || '/', query: new URLSearchParams(i >= 0 ? raw.slice(i + 1) : '') };
}

// Build "#/search?..." keeping current query but applying changes ('' removes a key)
export function linkWith(path, query, changes = {}) {
  const q = new URLSearchParams(query);
  for (const [k, v] of Object.entries(changes)) {
    if (v === '' || v === null || v === undefined) q.delete(k);
    else q.set(k, v);
  }
  const s = q.toString();
  return '#' + path + (s ? '?' + s : '');
}

// Shrink big phone photos before upload (keeps small files as they are)
export async function compressImage(file, max = 1400, quality = 0.82) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  if (file.size < 250 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export const debounce = (fn, ms = 300) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};
