// ChickpetBaazar single-page app: header, footer, routing and event wiring.
import { html, raw, parseHash, esc } from './util.js';
import {
  state, handlers, hooks, newRoute, mount, go, toast, errorPage, onClick, onSubmit,
} from './core.js';
import * as shop from './shop.js';
import * as account from './account.js';
import * as seller from './seller.js';
import * as admin from './admin.js';

const TITLE = 'ChickpetBaazar | Chickpet sarees, silks and fabrics online';

const ICON_SEARCH = raw('<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>');
const ICON_CART = raw('<svg viewBox="0 0 32 32" width="34" height="34" aria-hidden="true"><path d="M3 5h4l3.2 14.2h13.6L27 9H8.4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="25" r="2.2" fill="currentColor"/><circle cx="22.5" cy="25" r="2.2" fill="currentColor"/></svg>');

// ---- header & footer -------------------------------------------------------
function renderHeader() {
  const u = state.user;
  const { path, query } = parseHash();
  const q = path === '/search' ? query.get('q') || '' : '';
  const cat = path === '/search' ? query.get('category') || '' : '';
  const cats = state.meta.categories;
  document.getElementById('hdr').innerHTML = html`
  <div class="hdr-top">
    <a class="logo" href="#/" aria-label="ChickpetBaazar home"><span class="logo-mark" aria-hidden="true"></span><span class="logo-text">ChickpetBaazar<small>Chickpet, Bengaluru</small></span></a>
    <form class="hsearch" data-form="search" role="search">
      <select name="category" aria-label="Search in category"><option value="">All</option>${cats.map((c) => html`<option ${c === cat ? raw('selected') : ''}>${c}</option>`)}</select>
      <input name="q" type="search" value="${q}" placeholder="Search sarees, silks, fabrics" aria-label="Search ChickpetBaazar" autocomplete="off">
      <button type="submit" aria-label="Search">${ICON_SEARCH}</button>
    </form>
    <div class="hmenu">
      ${u ? html`<button class="hlink" type="button" aria-haspopup="true"><small>Hello, ${u.name.split(' ')[0]}</small><b>Account</b></button>`
          : html`<a class="hlink" href="#/login"><small>Hello, log in</small><b>Account</b></a>`}
      <div class="drop">
        ${u ? html`
          <a href="#/account">Your account</a><a href="#/orders">Your orders</a>
          ${u.role === 'seller' ? html`<a href="#/seller">Seller dashboard</a>` : ''}
          ${u.role === 'admin' ? html`<a href="#/admin">Admin panel</a>` : ''}
          <button type="button" data-act="logout">Log out</button>`
        : html`<a class="btn block" href="#/login">Log in</a><p>New customer? <a href="#/signup">Start here</a></p><p><a href="#/signup?role=seller">Open a shop account</a></p>`}
      </div>
    </div>
    <a class="hlink" href="#/orders"><small>Returns and</small><b>Orders</b></a>
    <a class="hcart" href="#/cart" aria-label="Cart, ${state.cartCount} ${state.cartCount === 1 ? 'item' : 'items'}">${ICON_CART}<span class="cnt">${state.cartCount}</span><b>Cart</b></a>
  </div>
  <nav class="hnav" aria-label="Categories">
    <a href="#/search">All products</a>
    ${cats.filter((c) => c !== 'Other').map((c) => html`<a href="#/search?category=${encodeURIComponent(c)}">${c}</a>`)}
    <span class="sp"></span>
    ${u && u.role === 'seller' ? html`<a class="hl" href="#/seller">Seller dashboard</a>` : ''}
    ${u && u.role === 'admin' ? html`<a class="hl" href="#/admin">Admin panel</a>` : ''}
    ${!u || u.role === 'customer' ? html`<a class="hl" href="#/signup?role=seller">Sell on ChickpetBaazar</a>` : ''}
  </nav>`.__raw;
}
hooks.header = renderHeader;

function renderFooter() {
  document.getElementById('ftr').innerHTML = html`
  <div class="temple"></div>
  <button class="totop" type="button" data-act="to-top">Back to top</button>
  <div class="ftr-in">
    <div><b class="ftr-brand">ChickpetBaazar</b><p>An online market for the shops of Chickpet, Bengaluru. Buy sarees, silks and fabrics straight from the counter.</p></div>
    <div><h3>Shop</h3><a href="#/search?category=Silk%20Sarees">Silk sarees</a><a href="#/search?category=Cotton%20Sarees">Cotton sarees</a><a href="#/search?category=Dress%20Materials">Dress materials</a><a href="#/search?category=Fabrics%20by%20the%20Metre">Fabrics by the metre</a></div>
    <div><h3>Your account</h3><a href="#/orders">Your orders</a><a href="#/cart">Cart</a><a href="#/account">Account settings</a></div>
    <div><h3>Sell with us</h3><a href="#/signup?role=seller">Open your shop</a><a href="#/seller">Seller dashboard</a></div>
  </div>
  <p class="ftr-fine">Prices include GST. UPI payments go straight to the shop you buy from. &copy; ${new Date().getFullYear()} ChickpetBaazar</p>`.__raw;
}
onClick('to-top', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

onSubmit('search', (f) => {
  const d = Object.fromEntries(new FormData(f));
  const p = new URLSearchParams();
  if (String(d.q).trim()) p.set('q', String(d.q).trim());
  if (d.category) p.set('category', d.category);
  go('/search' + (p.toString() ? '?' + p : ''));
});

// ---- routes ----------------------------------------------------------------
const routes = [
  [/^\/$/, (a) => shop.homeView(a)],
  [/^\/search$/, (a, m, q) => shop.searchView(a, q)],
  [/^\/product\/(\d+)$/, (a, m) => shop.productView(a, m[1])],
  [/^\/cart$/, (a) => shop.cartView(a)],
  [/^\/checkout$/, (a) => shop.checkoutView(a)],
  [/^\/pay\/(\d+)$/, (a, m, q) => shop.payView(a, m[1], q)],
  [/^\/orders$/, (a) => shop.ordersView(a)],
  [/^\/order\/(\d+)$/, (a, m, q) => shop.orderView(a, m[1], q)],
  [/^\/invoice\/(\d+)$/, (a, m) => shop.invoiceView(a, m[1])],
  [/^\/login$/, () => account.loginView()],
  [/^\/signup$/, (a, m, q) => account.signupView(q)],
  [/^\/account$/, () => account.accountView()],

  [/^\/seller$/, (a) => seller.overviewView(a)],
  [/^\/seller\/shop$/, (a) => seller.shopView(a)],
  [/^\/seller\/products$/, (a) => seller.productsView(a)],
  [/^\/seller\/products\/new$/, (a) => seller.productFormView(a, null)],
  [/^\/seller\/products\/(\d+)\/edit$/, (a, m) => seller.productFormView(a, m[1])],
  [/^\/seller\/orders$/, (a, m, q) => seller.ordersView(a, q)],

  [/^\/admin$/, (a) => admin.dashView(a)],
  [/^\/admin\/shops$/, (a, m, q) => admin.shopsView(a, q)],
  [/^\/admin\/shops\/new$/, (a) => admin.shopFormView(a, null)],
  [/^\/admin\/shops\/(\d+)\/edit$/, (a, m) => admin.shopFormView(a, m[1])],
  [/^\/admin\/products$/, (a, m, q) => admin.productsView(a, q)],
  [/^\/admin\/products\/new$/, (a) => admin.productFormView(a, null)],
  [/^\/admin\/products\/(\d+)\/edit$/, (a, m) => admin.productFormView(a, m[1])],
  [/^\/admin\/orders$/, (a, m, q) => admin.ordersView(a, q)],
  [/^\/admin\/users$/, (a, m, q) => admin.usersView(a, q)],
  [/^\/admin\/reviews$/, (a) => admin.reviewsView(a)],
  [/^\/admin\/whatsapp$/, (a) => admin.whatsappView(a)],
];

let lastPath = null;
async function route() {
  const { path, query } = parseHash();
  const alive = newRoute();
  document.title = TITLE;
  renderHeader();
  const hit = routes.find(([re]) => re.test(path));
  if (!hit) {
    mount(html`<div class="page narrow"><div class="empty"><h1>Page not found</h1><p>That page does not exist.</p><a class="btn" href="#/">Back to ChickpetBaazar</a></div></div>`);
    return;
  }
  try {
    await hit[1](alive, path.match(hit[0]), query);
  } catch (err) {
    if (!alive()) return;
    if (err.status === 401) {
      state.user = null;
      state.cartCount = 0;
      renderHeader();
      sessionStorage.setItem('cb_next', location.hash.slice(1));
      toast('Your session ended. Please log in again.');
      return go('/login', true);
    }
    console.error(err);
    errorPage(err);
  }
  if (path !== lastPath) {
    lastPath = path;
    document.getElementById('app').focus({ preventScroll: true });
  }
}
window.addEventListener('hashchange', route);

// ---- delegated events ------------------------------------------------------
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const fn = handlers.click[t.dataset.act];
  if (!fn) return;
  if (t.tagName === 'A') {
    if (e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (t.getAttribute('target') !== '_blank') e.preventDefault();
  }
  if (t.dataset.busy) return;
  t.dataset.busy = '1';
  if (t.tagName === 'BUTTON') t.disabled = true;
  try { await fn(t, e); } catch (err) {
    if (err.status === 401) { state.user = null; renderHeader(); return go('/login'); }
    toast(err.message, 'error');
  } finally {
    delete t.dataset.busy;
    if (t.isConnected && t.tagName === 'BUTTON') t.disabled = false;
  }
});

document.addEventListener('submit', async (e) => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  const fn = handlers.submit[f.dataset.form];
  if (!fn) return;
  const err = f.querySelector('.form-error');
  if (err) err.hidden = true;
  const btn = f.querySelector('button[type=submit]');
  if (btn) btn.disabled = true;
  try { await fn(f, e); } catch (ex) {
    if (ex.status === 401 && f.dataset.form !== 'login') { state.user = null; renderHeader(); return go('/login'); }
    if (err) { err.textContent = ex.message; err.hidden = false; err.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    else toast(ex.message, 'error');
  } finally {
    if (btn && btn.isConnected) btn.disabled = false;
  }
});

document.addEventListener('change', async (e) => {
  const t = e.target.closest('[data-change]');
  if (!t) return;
  const fn = handlers.change[t.dataset.change];
  if (!fn) return;
  try { await fn(t, e); } catch (err) { toast(err.message, 'error'); }
});

// ---- boot ------------------------------------------------------------------
(async function boot() {
  try {
    await account.loadSession();
  } catch (err) {
    document.getElementById('app').innerHTML = `<div class="page narrow"><div class="empty"><h1>We could not load the store</h1><p>${esc(err.message)}</p><a class="btn" href="/">Try again</a></div></div>`;
    return;
  }
  renderFooter();
  if (!location.hash) location.hash = '#/';
  route();
})();
