// Customer-facing views: home, search, product, cart, checkout, UPI payment, orders, invoice.
import { html, raw, inr, img, stars, when, linkWith, parseHash, statusChip, payChip, safeHref, STATUS_LABEL } from './util.js';
import { get, post, put, del } from './api.js';
import {
  state, mount, loading, newRoute, onLeave, go, reload, toast, confirmBox, copyText, hooks,
  onClick, onSubmit, onChange,
} from './core.js';

// ---------- shared pieces ----------------------------------------------------
export async function refreshCart() {
  if (!state.user) { state.cartCount = 0; hooks.header(); return; }
  try { state.cartCount = (await get('/cart')).count; } catch { /* ignore */ }
  hooks.header();
}

export function needLogin(msg = 'Please log in to continue.') {
  sessionStorage.setItem('cb_next', location.hash.slice(1) || '/');
  toast(msg);
  go('/login');
}

export function productCard(p, { cta = false } = {}) {
  return html`<article class="pcard">
    <a class="pimg" href="#/product/${p.id}" tabindex="-1" aria-hidden="true">
      ${img(p.image, p.name)}
      ${p.discount_pct >= 5 ? html`<span class="off">${p.discount_pct}% off</span>` : ''}
      ${p.stock <= 0 ? html`<span class="sold">Sold out</span>` : ''}
    </a>
    <div class="pbody">
      <a class="ptitle" href="#/product/${p.id}">${p.name}</a>
      ${p.rating_count ? html`<div class="rate">${stars(p.rating)}<span>${p.rating_count}</span></div>` : ''}
      <div class="price"><b>${inr(p.price_paise)}</b>${p.mrp_paise > p.price_paise ? html`<s>${inr(p.mrp_paise)}</s>` : ''}</div>
      <div class="pshop">${p.shop_name}</div>
      ${cta && p.stock > 0 ? html`<button class="btn sm" data-act="add-cart" data-id="${p.id}">Add to cart</button>` : ''}
    </div>
  </article>`;
}

const band = (title, items, href) =>
  html`<section class="band"><div class="band-h"><h2>${title}</h2>${href ? html`<a href="${href}">See all</a>` : ''}</div>
    <div class="hscroll">${items.map((p) => html`<div class="hitem">${productCard(p)}</div>`)}</div></section>`;

const addrLine = (s) => `${s.address}, ${s.city} ${s.pincode}`;

// ---------- home -------------------------------------------------------------
export async function homeView(alive) {
  loading();
  const [all, deals, top, shops] = await Promise.all([
    get('/products?limit=100&sort=newest'), get('/products?sort=discount&limit=12'),
    get('/products?sort=rating&limit=12'), get('/shops'),
  ]);
  if (!alive()) return;

  const withImg = all.items.filter((p) => p.image).slice(0, 3);
  const groups = new Map();
  for (const p of all.items) {
    if (!groups.has(p.category)) groups.set(p.category, []);
    groups.get(p.category).push(p);
  }
  const cats = [...groups.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 8);
  const rated = top.items.filter((p) => p.rating_count > 0);
  const dealItems = deals.items.filter((p) => p.discount_pct >= 10);

  mount(html`
  <section class="hero">
    <div class="hero-in">
      <div class="hero-copy">
        <h1>Chickpet's silks and sarees, straight from the shop counter.</h1>
        <p>Real shops from Bengaluru's oldest textile market, now a tap away. Pay with any UPI app and get every order update on WhatsApp.</p>
        <div class="hero-cta">
          <a class="btn big" href="#/search?category=Silk%20Sarees">Shop silk sarees</a>
          <a class="btn big ghost-light" href="#/search">Browse everything</a>
        </div>
      </div>
      <div class="swatches">
        ${withImg.map((p, i) => html`<a class="swatch s${i}" href="#/product/${p.id}">${img(p.image, p.name)}<span>${inr(p.price_paise)}</span></a>`)}
      </div>
    </div>
    <div class="temple"></div>
  </section>

  <div class="page">
    <ul class="trust">
      <li><b>Sold by the shops themselves</b><span>You buy from the counter you know, not a middleman</span></li>
      <li><b>Pay with any UPI app</b><span>GPay, PhonePe, Paytm. The money goes straight to the shop</span></li>
      <li><b>WhatsApp updates</b><span>Confirmation, packing and delivery messages</span></li>
      <li><b>An invoice for every order</b><span>Print it or save it as a PDF</span></li>
    </ul>

    ${all.total === 0 ? html`<div class="empty"><h2>The shelves are being stocked</h2><p>No products are live yet. If you run a shop in Chickpet, you can be the first.</p><a class="btn" href="#/signup?role=seller">Open your shop</a></div>` : ''}

    ${cats.length ? html`<section class="catgrid">${cats.map(([c, items]) => html`
      <article class="catcard"><h2>${c}</h2>
        <div class="cat4">${[0, 1, 2, 3].map((i) => items[i] ? html`<a href="#/product/${items[i].id}">${img(items[i].image, items[i].name)}</a>` : html`<span class="ph-empty"></span>`)}</div>
        <a class="more" href="#/search?category=${encodeURIComponent(c)}">See all in ${c}</a></article>`)}</section>` : ''}

    ${dealItems.length ? band('Best savings today', dealItems, '#/search?sort=discount') : ''}
    ${rated.length ? band('Top rated by customers', rated, '#/search?sort=rating') : ''}
    ${all.items.length > 4 ? band('New on ChickpetBaazar', all.items.slice(0, 12), '#/search?sort=newest') : ''}

    ${shops.items.length ? html`<section class="band"><div class="band-h"><h2>Shops of Chickpet</h2></div>
      <div class="shopgrid">${shops.items.map((s) => html`<a class="shopcard" href="#/search?shop=${s.id}">
        <div class="shoplogo">${img(s.logo, s.name)}</div>
        <div><b>${s.name}</b><span>${s.area}, ${s.city}</span><span>${s.product_count} products${s.gst_registered ? ' · GST registered' : ''}</span></div></a>`)}</div></section>` : ''}

    <section class="sellband">
      <div><h2>Own a shop in Chickpet?</h2><p>List your sarees and fabrics, take UPI payments straight to your account and manage orders from your phone.</p></div>
      <a class="btn big" href="#/signup?role=seller">Sell on ChickpetBaazar</a>
    </section>
  </div>`);
}

// ---------- search -----------------------------------------------------------
const BANDS = [
  ['Under ₹500', '', '500'], ['₹500 to ₹1,000', '500', '1000'], ['₹1,000 to ₹5,000', '1000', '5000'],
  ['₹5,000 to ₹15,000', '5000', '15000'], ['Over ₹15,000', '15000', ''],
];

export async function searchView(alive, query) {
  loading();
  const q = query.get('q') || '';
  const category = query.get('category') || '';
  const shopId = query.get('shop') || '';
  const page = Math.max(1, parseInt(query.get('page'), 10) || 1);
  const params = new URLSearchParams(query);
  params.set('limit', '20');
  const [res, shop] = await Promise.all([get('/products?' + params), shopId ? get('/shops/' + encodeURIComponent(shopId)).catch(() => null) : null]);
  if (!alive()) return;

  const L = (changes) => linkWith('/search', query, { page: '', ...changes });
  const min = query.get('min') || '', max = query.get('max') || '', rating = query.get('rating') || '';
  const chips = [];
  if (q) chips.push(['Search: ' + q, L({ q: '' })]);
  if (category) chips.push([category, L({ category: '' })]);
  if (shop) chips.push(['Shop: ' + shop.shop.name, L({ shop: '' })]);
  if (min || max) chips.push([`Price ${min ? '₹' + min : ''} - ${max ? '₹' + max : 'any'}`, L({ min: '', max: '' })]);
  if (rating) chips.push([rating + ' stars & up', L({ rating: '' })]);

  mount(html`<div class="page">
  ${shop ? html`<div class="shophead"><div class="shoplogo">${img(shop.shop.logo, shop.shop.name)}</div>
    <div><h1>${shop.shop.name}</h1><p>${shop.shop.area}, ${shop.shop.city}${shop.shop.gst_registered ? ' · GST registered' : ''}</p>${shop.shop.description ? html`<p class="muted">${shop.shop.description}</p>` : ''}</div></div>` : ''}
  <div class="results">
    <aside class="filters" aria-label="Filters">
      <h3>Category</h3>
      <ul class="flist"><li><a class="${!category ? 'on' : ''}" href="${L({ category: '' })}">All categories</a></li>
        ${state.meta.categories.map((c) => html`<li><a class="${category === c ? 'on' : ''}" href="${L({ category: c })}">${c}</a></li>`)}</ul>
      <h3>Price</h3>
      <ul class="flist">${BANDS.map(([label, a, b]) => html`<li><a class="${min === a && max === b ? 'on' : ''}" href="${L({ min: a, max: b })}">${label}</a></li>`)}</ul>
      <form class="pf" data-form="price-filter"><input name="min" inputmode="numeric" placeholder="Min ₹" value="${min}" aria-label="Minimum price"><span>to</span><input name="max" inputmode="numeric" placeholder="Max ₹" value="${max}" aria-label="Maximum price"><button class="btn sm">Go</button></form>
      <h3>Customer rating</h3>
      <ul class="flist">${[4, 3].map((r) => html`<li><a class="${rating === String(r) ? 'on' : ''}" href="${L({ rating: r })}">${stars(r)} &amp; up</a></li>`)}</ul>
    </aside>
    <section>
      <div class="resbar">
        <p><b>${res.total}</b> ${res.total === 1 ? 'result' : 'results'}${q ? html` for <b>"${q}"</b>` : ''}</p>
        <label class="sortsel">Sort by
          <select data-change="sort">${[['newest', 'Newest first'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['rating', 'Customer rating'], ['discount', 'Biggest discount']].map(([v, l]) => html`<option value="${v}" ${query.get('sort') === v || (!query.get('sort') && v === 'newest') ? raw('selected') : ''}>${l}</option>`)}</select></label>
      </div>
      ${chips.length ? html`<div class="chips">${chips.map(([t, h]) => html`<a class="fchip" href="${h}" aria-label="Remove filter ${t}">${t} <span aria-hidden="true">&times;</span></a>`)}</div>` : ''}
      ${res.items.length ? html`<div class="pgrid">${res.items.map((p) => productCard(p, { cta: true }))}</div>` : html`<div class="empty"><h2>No products match</h2><p>Try a different word, or remove some filters.</p><a class="btn" href="#/search">Clear all filters</a></div>`}
      ${res.pages > 1 ? html`<nav class="pager" aria-label="Pages">
        ${page > 1 ? html`<a class="btn ghost sm" href="${L({ page: page - 1 })}">Previous</a>` : ''}
        <span>Page ${page} of ${res.pages}</span>
        ${page < res.pages ? html`<a class="btn ghost sm" href="${L({ page: page + 1 })}">Next</a>` : ''}</nav>` : ''}
    </section>
  </div></div>`);
}

onSubmit('price-filter', (f) => {
  const d = Object.fromEntries(new FormData(f));
  const clean = (v) => String(v || '').replace(/[^\d.]/g, '');
  go(linkWith('/search', parseHash().query, { min: clean(d.min), max: clean(d.max), page: '' }).slice(1));
});
onChange('sort', (el) => go(linkWith('/search', parseHash().query, { sort: el.value, page: '' }).slice(1)));

// ---------- product ----------------------------------------------------------
const distBar = (n, total) => html`<span class="bar"><i style="width:${total ? Math.round((n / total) * 100) : 0}%"></i></span>`;

export async function productView(alive, id) {
  loading();
  const d = await get('/products/' + encodeURIComponent(id));
  if (!alive()) return;
  const { product: p, shop, reviews, distribution, more, can_review } = d;
  document.title = `${p.name} | ChickpetBaazar`;
  const total = p.rating_count;
  const maxQty = Math.min(10, p.stock);
  const delivery = shop.free_ship_above_paise > 0
    ? `Free delivery on orders above ${inr(shop.free_ship_above_paise)}${shop.shipping_fee_paise ? ', otherwise ' + inr(shop.shipping_fee_paise) : ''}`
    : shop.shipping_fee_paise ? `Delivery ${inr(shop.shipping_fee_paise)}` : 'Free delivery';
  const stockMsg = p.stock <= 0 ? html`<p class="stock out">Currently unavailable</p>`
    : p.stock <= 5 ? html`<p class="stock low">Only ${p.stock} left, order soon</p>` : html`<p class="stock in">In stock</p>`;

  mount(html`<div class="page">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Home</a> / <a href="#/search?category=${encodeURIComponent(p.category)}">${p.category}</a></nav>
  <div class="pdp">
    <div class="gallery">
      ${p.images.length > 1 ? html`<div class="thumbs">${p.images.map((s, i) => html`<button class="thumb ${i === 0 ? 'on' : ''}" data-act="gallery" data-src="${s}" aria-label="Show photo ${i + 1}">${img(s, p.name)}</button>`)}</div>` : ''}
      <div class="gmain" id="gmain">${img(p.images[0], p.name)}</div>
    </div>

    <div class="pinfo">
      <h1>${p.name}</h1>
      ${p.brand ? html`<p class="brand">Brand: ${p.brand}</p>` : ''}
      <div class="rate big">${total ? html`<b>${p.rating}</b>${stars(p.rating)}<a href="#/product/${p.id}" data-act="to-reviews">${total} ${total === 1 ? 'rating' : 'ratings'}</a>` : html`<span class="muted">No ratings yet</span>`}</div>
      <hr>
      <div class="pdp-price">
        ${p.discount_pct ? html`<span class="pct">-${p.discount_pct}%</span>` : ''}<b>${inr(p.price_paise)}</b>
        ${p.mrp_paise > p.price_paise ? html`<p class="mrp">M.R.P.: <s>${inr(p.mrp_paise)}</s></p>` : ''}
        <p class="muted">Inclusive of all taxes (GST ${p.gst_rate}%)</p>
      </div>
      <ul class="facts">
        <li><b>Warranty</b><span>${p.warranty || 'No warranty from the seller'}</span></li>
        <li><b>Returns</b><span>${p.returnable_days > 0 ? `${p.returnable_days}-day return` : 'Not returnable'}</span></li>
        <li><b>Delivery</b><span>${delivery}</span></li>
      </ul>
      ${p.highlights.length ? html`<h2 class="h3">About this item</h2><ul class="bullets">${p.highlights.map((h) => html`<li>${h}</li>`)}</ul>` : ''}
      ${p.specs.length ? html`<h2 class="h3">Details</h2><table class="spec"><tbody>${p.specs.map((s) => html`<tr><th>${s.k}</th><td>${s.v}</td></tr>`)}</tbody></table>` : ''}
      <h2 class="h3">Description</h2>
      <p class="desc">${p.description}</p>
    </div>

    <aside class="buybox" aria-label="Buy this item">
      <div class="pdp-price small"><b>${inr(p.price_paise)}</b></div>
      <p class="muted">${delivery}</p>
      ${stockMsg}
      ${p.stock > 0 ? html`
        <label class="field inline"><span>Quantity</span>
          <select id="qty" aria-label="Quantity">${Array.from({ length: maxQty }, (_, i) => html`<option>${i + 1}</option>`)}</select></label>
        <button class="btn block" data-act="add-cart" data-id="${p.id}" data-qty="select">Add to cart</button>
        <button class="btn buy block" data-act="buy-now" data-id="${p.id}">Buy now</button>` : ''}
      <p class="secure">Pay securely with UPI, or cash on delivery</p>
      <div class="sold-by"><span>Sold by</span><a href="#/search?shop=${shop.id}"><b>${shop.name}</b></a>
        <small>${shop.area}, ${shop.city}${shop.gst_registered ? ' · GST registered' : ''}</small></div>
    </aside>
  </div>

  <section class="reviews" id="reviews">
    <h2>Customer reviews</h2>
    <div class="rv-grid">
      <div class="rv-sum">
        ${total ? html`<div class="rate big"><b>${p.rating}</b>${stars(p.rating)}</div><p class="muted">${total} ${total === 1 ? 'rating' : 'ratings'}</p>
          ${[5, 4, 3, 2, 1].map((s) => html`<div class="dist"><span>${s} star</span>${distBar(distribution[s], total)}<span>${distribution[s]}</span></div>`)}`
          : html`<p class="muted">Be the first to review this product.</p>`}
        ${can_review ? html`<form class="rv-form" data-form="review" data-id="${p.id}">
          <h3>Write a review</h3>
          <fieldset class="starpick"><legend class="sr">Your rating</legend>
            ${[5, 4, 3, 2, 1].map((n) => html`<input type="radio" name="rating" id="rt${n}" value="${n}" ${n === 5 ? raw('required') : ''}><label for="rt${n}" title="${n} stars">&#9733;</label>`)}</fieldset>
          <label class="field"><span>Headline</span><input name="title" maxlength="100"></label>
          <label class="field"><span>Your review</span><textarea name="body" rows="4" maxlength="2000"></textarea></label>
          <p class="form-error" hidden></p>
          <button class="btn" type="submit">Submit review</button></form>`
          : html`<p class="hint">${state.user ? 'You can review this product after you have ordered it.' : 'Log in to review this product after you order it.'}</p>`}
      </div>
      <div class="rv-list">
        ${reviews.length ? reviews.map((r) => html`<article class="rv"><div class="rv-head"><b>${r.name}</b><span class="verified">Verified buyer</span></div>
          <div>${stars(r.rating)} <b>${r.title}</b></div><small class="muted">Reviewed ${when(r.created_at, false)}</small>
          <p>${r.body}</p></article>`) : ''}
      </div>
    </div>
  </section>

  ${more.length ? band('More from ' + shop.name, more, '#/search?shop=' + shop.id) : ''}
  </div>`);
}

onClick('gallery', (el) => {
  const main = document.querySelector('#gmain img');
  if (main) main.src = el.dataset.src;
  document.querySelectorAll('.thumb').forEach((t) => t.classList.toggle('on', t === el));
});
onClick('to-reviews', () => document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth' }));

onSubmit('review', async (f) => {
  const d = Object.fromEntries(new FormData(f));
  await post(`/products/${f.dataset.id}/reviews`, { rating: Number(d.rating), title: d.title, body: d.body });
  toast('Thanks for your review');
  reload();
});

async function addToCart(el) {
  if (!state.user) return needLogin('Log in to add items to your cart.');
  const sel = el.dataset.qty === 'select' ? document.getElementById('qty') : null;
  const c = await post('/cart', { productId: Number(el.dataset.id), qty: sel ? Number(sel.value) : 1 });
  state.cartCount = c.count;
  hooks.header();
  return c;
}
onClick('add-cart', async (el) => {
  const c = await addToCart(el);
  if (c) toast('Added to your cart');
});
onClick('buy-now', async (el) => {
  const c = await addToCart(el);
  if (c) go('/checkout');
});

// ---------- cart -------------------------------------------------------------
export async function cartView(alive) {
  if (!state.user) {
    mount(html`<div class="page narrow"><div class="empty"><h1>Your cart</h1><p>Log in to see the items in your cart.</p><a class="btn" href="#/login" data-act="login-next">Log in</a></div></div>`);
    return;
  }
  loading();
  const c = await get('/cart');
  if (!alive()) return;
  state.cartCount = c.count;
  hooks.header();
  if (!c.groups.length) {
    mount(html`<div class="page narrow"><div class="empty"><h1>Your cart is empty</h1><p>Browse the shops and add what you like.</p><a class="btn" href="#/">Start shopping</a></div></div>`);
    return;
  }
  mount(html`<div class="page"><h1 class="ptitle-h">Shopping cart</h1>
  <div class="cartwrap">
    <div>
      ${c.groups.map((g) => html`<section class="cgroup">
        <header><h2>From ${g.shop.name}</h2></header>
        ${g.items.map((i) => html`<article class="citem">
          <a class="cimg" href="#/product/${i.product_id}">${img(i.image, i.name)}</a>
          <div class="cinfo">
            <a class="ctitle" href="#/product/${i.product_id}">${i.name}</a>
            ${i.issue ? html`<p class="issue">${i.issue}</p>` : html`<p class="stock in">In stock</p>`}
            <div class="crow">
              <label class="field inline"><span class="sr">Quantity</span>
                <select data-change="cart-qty" data-id="${i.product_id}" aria-label="Quantity for ${i.name}">${Array.from({ length: Math.min(10, Math.max(i.stock, i.qty)) }, (_, k) => html`<option ${k + 1 === i.qty ? raw('selected') : ''}>${k + 1}</option>`)}</select></label>
              <button class="link" data-act="cart-remove" data-id="${i.product_id}">Delete</button>
            </div>
          </div>
          <div class="cprice"><b>${inr(i.price_paise * i.qty)}</b>${i.qty > 1 ? html`<small>${inr(i.price_paise)} each</small>` : ''}</div>
        </article>`)}
        <footer><span>Items ${inr(g.subtotal_paise)}</span><span>Delivery ${g.shipping_paise ? inr(g.shipping_paise) : 'Free'}</span><b>Order total ${inr(g.total_paise)}</b></footer>
      </section>`)}
    </div>
    <aside class="summary">
      <p>Subtotal (${c.count} ${c.count === 1 ? 'item' : 'items'}): <b class="big">${inr(c.total_paise)}</b></p>
      ${c.groups.length > 1 ? html`<p class="hint">Your items are from ${c.groups.length} shops. Each shop gets its own order and is paid separately.</p>` : ''}
      ${c.has_issues ? html`<p class="issue">Fix the items marked above to continue.</p>` : ''}
      <a class="btn block ${c.has_issues ? 'disabled' : ''}" href="#/checkout" ${c.has_issues ? raw('aria-disabled="true" tabindex="-1"') : ''}>Proceed to checkout</a>
    </aside>
  </div></div>`);
}

onClick('login-next', () => { sessionStorage.setItem('cb_next', '/cart'); go('/login'); });
onChange('cart-qty', async (el) => {
  const c = await put('/cart/' + el.dataset.id, { qty: Number(el.value) });
  state.cartCount = c.count; hooks.header(); reload();
});
onClick('cart-remove', async (el) => {
  const c = await del('/cart/' + el.dataset.id);
  state.cartCount = c.count; hooks.header(); reload();
});

// ---------- checkout ---------------------------------------------------------
export async function checkoutView(alive) {
  if (!state.user) return needLogin('Log in to check out.');
  loading();
  const c = await get('/cart');
  if (!alive()) return;
  if (!c.groups.length) return go('/cart', true);
  if (c.has_issues) { toast('Please fix the items in your cart first.', 'error'); return go('/cart', true); }
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('cb_addr') || '{}'); } catch { /* ignore */ }
  const v = { name: saved.name || state.user.name, phone: saved.phone || state.user.phone.replace(/^91/, ''), address: saved.address || '', city: saved.city || 'Bengaluru', pincode: saved.pincode || '' };

  mount(html`<div class="page"><h1 class="ptitle-h">Checkout</h1>
  <form class="cartwrap" data-form="checkout" novalidate>
    <div>
      <section class="cbox"><h2><span class="n">1</span> Delivery address</h2>
        <div class="grid2">
          <label class="field"><span>Full name</span><input name="name" value="${v.name}" required autocomplete="name"></label>
          <label class="field"><span>Mobile number</span><input name="phone" value="${v.phone}" inputmode="numeric" required autocomplete="tel-national" maxlength="14"></label>
        </div>
        <label class="field"><span>Address (house no, street, area)</span><textarea name="address" rows="3" required autocomplete="street-address">${v.address}</textarea></label>
        <div class="grid2">
          <label class="field"><span>City</span><input name="city" value="${v.city}" required autocomplete="address-level2"></label>
          <label class="field"><span>Pincode</span><input name="pincode" value="${v.pincode}" inputmode="numeric" maxlength="6" required autocomplete="postal-code"></label>
        </div>
        <label class="field"><span>Note for the shop (optional)</span><input name="note" maxlength="300" placeholder="For example: blouse stitching colour"></label>
      </section>
      <section class="cbox"><h2><span class="n">2</span> Payment method</h2>
        <label class="radio"><input type="radio" name="payment_method" value="UPI" checked><span><b>UPI</b> (GPay, PhonePe, Paytm and others)<small>Pay straight to the shop on the next screen. The shop confirms and we message you on WhatsApp.</small></span></label>
        <label class="radio"><input type="radio" name="payment_method" value="COD"><span><b>Cash on delivery</b><small>Pay when your order arrives.</small></span></label>
      </section>
      <section class="cbox"><h2><span class="n">3</span> Review items</h2>
        ${c.groups.map((g) => html`<div class="rgroup"><h3>${g.shop.name}</h3>
          ${g.items.map((i) => html`<div class="ritem">${img(i.image, i.name, 'thumb')}<span>${i.name}<small>Qty ${i.qty}</small></span><b>${inr(i.price_paise * i.qty)}</b></div>`)}
          <p class="muted">Delivery: ${g.shipping_paise ? inr(g.shipping_paise) : 'Free'}</p></div>`)}
      </section>
    </div>
    <aside class="summary">
      <h2>Order summary</h2>
      <dl class="sumlist">${c.groups.map((g) => html`<div><dt>${g.shop.name}</dt><dd>${inr(g.total_paise)}</dd></div>`)}</dl>
      <p class="tot">Order total <b>${inr(c.total_paise)}</b></p>
      ${c.groups.length > 1 ? html`<p class="hint">${c.groups.length} separate orders will be created, one per shop.</p>` : ''}
      <p class="form-error" hidden></p>
      <button class="btn block" type="submit">Place order</button>
      <p class="hint">Prices include GST. You will get a GST invoice for each order.</p>
    </aside>
  </form></div>`);
}

onSubmit('checkout', async (f) => {
  const d = Object.fromEntries(new FormData(f));
  const { orders } = await post('/orders/checkout', d);
  localStorage.setItem('cb_addr', JSON.stringify({ name: d.name, phone: d.phone, address: d.address, city: d.city, pincode: d.pincode }));
  state.cartCount = 0;
  hooks.header();
  const upi = orders.filter((o) => o.payment_method === 'UPI');
  if (upi.length) {
    const rest = upi.slice(1).map((o) => o.id).join(',');
    go(`/pay/${upi[0].id}${rest ? '?then=' + rest : ''}`);
  } else if (orders.length === 1) go(`/order/${orders[0].id}?placed=1`);
  else go('/orders');
});

// ---------- UPI payment ------------------------------------------------------
export async function payView(alive, id, query) {
  if (!state.user) return needLogin('Log in to pay for your order.');
  loading();
  const { order: o } = await get('/orders/' + id);
  if (!alive()) return;
  const then = (query.get('then') || '').split(',').filter((x) => /^\d+$/.test(x));
  const nextLink = then.length ? html`<a class="btn" href="#/pay/${then[0]}${then.length > 1 ? '?then=' + then.slice(1).join(',') : ''}">Pay for your next order</a>` : '';

  if (o.payment_method !== 'UPI' || o.status === 'cancelled') {
    mount(html`<div class="page narrow"><div class="empty"><h1>Nothing to pay</h1><p>${o.status === 'cancelled' ? 'This order was cancelled.' : 'This order is cash on delivery.'}</p><a class="btn" href="#/order/${o.id}">View order</a></div></div>`);
    return;
  }

  if (o.payment_status === 'paid') {
    mount(html`<div class="page narrow"><div class="paycard center"><div class="temple"></div>
      <div class="tick" aria-hidden="true">&#10003;</div><h1>Payment received</h1>
      <p>${o.shop_name} confirmed your payment of <b>${inr(o.total_paise)}</b>. Your order is confirmed.</p>
      <div class="btnrow"><a class="btn ghost" href="#/order/${o.id}">View order</a>${nextLink}</div></div></div>`);
    return;
  }

  if (o.payment_status === 'submitted') {
    mount(html`<div class="page narrow"><div class="paycard center"><div class="temple"></div>
      <div class="spinner" aria-hidden="true"></div>
      <h1>Waiting for ${o.shop_name} to confirm</h1>
      <p>You submitted UPI reference <code>${o.upi_txn_ref}</code> for <b>${inr(o.total_paise)}</b>. The shop checks its UPI app and confirms. This page updates by itself.</p>
      <p class="hint">To speed things up, send the shop your payment details on WhatsApp.</p>
      <div class="btnrow"><a class="btn wa" href="${safeHref(o.seller_whatsapp_link)}" target="_blank" rel="noopener">Message the shop on WhatsApp</a>
        <a class="btn ghost" href="#/order/${o.id}">View order</a>${nextLink}</div></div></div>`);
    const t = setInterval(async () => {
      try { const r = await get('/orders/' + id); if (r.order.payment_status !== 'submitted') reload(); } catch { /* keep trying */ }
    }, 8000);
    onLeave(() => clearInterval(t));
    return;
  }

  const upi = await get(`/orders/${id}/upi`);
  if (!alive()) return;
  mount(html`<div class="page narrow"><div class="paycard"><div class="temple"></div>
    <h1>Pay ${inr(o.total_paise)} to ${o.shop_name}</h1>
    <p class="muted">Order ${o.order_no}</p>
    ${o.payment_status === 'failed' ? html`<p class="issue">The shop could not find your last payment. Check the reference number below, or pay again.</p>` : ''}
    <ol class="steps">
      <li><h2>Pay with any UPI app</h2>
        <div class="pay-grid">
          <div><a class="btn big block" href="${safeHref(upi.link)}">Open UPI app</a>
            <p class="hint">On your phone this opens GPay, PhonePe, Paytm or another UPI app with the amount already filled in.</p></div>
          <div class="qrbox"><img src="${upi.qr}" width="200" height="200" alt="UPI QR code to pay ${o.shop_name}"><p>On a computer, scan this with any UPI app</p></div>
        </div>
        <div class="upi-id"><span>UPI ID</span><code>${upi.upi_id}</code><button class="btn ghost sm" type="button" data-act="copy" data-text="${upi.upi_id}">Copy</button></div>
        <p class="hint">Pay exactly <b>${inr(o.total_paise)}</b>. The UPI app shows the name the shop registered with its bank, which may be different from the shop name.</p>
      </li>
      <li><h2>Tell us you have paid</h2>
        <form data-form="pay" data-id="${o.id}" data-then="${then.join(',')}">
          <label class="field"><span>UPI reference number (UTR)</span>
            <input name="utr" required minlength="8" maxlength="30" inputmode="text" autocomplete="off" placeholder="12-digit number from your payment app" value="${o.upi_txn_ref}"></label>
          <p class="hint">You can find it in your UPI app under the payment details, often called UTR, UPI Ref No or Transaction ID.</p>
          <p class="form-error" hidden></p>
          <button class="btn big" type="submit">I have paid</button>
        </form>
      </li>
    </ol>
    <p class="hint">Not ready to pay? <a href="#/order/${o.id}">View your order</a>. You can pay later from My orders.</p>
  </div></div>`);
}

onClick('copy', (el) => copyText(el.dataset.text));
onSubmit('pay', async (f) => {
  const { utr } = Object.fromEntries(new FormData(f));
  await post(`/orders/${f.dataset.id}/pay`, { utr });
  toast('Payment sent to the shop for confirmation');
  reload();
});

// ---------- orders -----------------------------------------------------------
export async function ordersView(alive) {
  if (!state.user) return needLogin('Log in to see your orders.');
  loading();
  const { items } = await get('/orders');
  if (!alive()) return;
  mount(html`<div class="page"><h1 class="ptitle-h">Your orders</h1>
  ${items.length ? items.map((o) => html`<article class="ocard">
    <header>
      <div><small>Order placed</small><b>${when(o.created_at, false)}</b></div>
      <div><small>Total</small><b>${inr(o.total_paise)}</b></div>
      <div><small>Ship to</small><b>${o.ship.name}</b></div>
      <div class="oid"><small>Order</small><b>${o.order_no}</b></div>
    </header>
    <div class="obody">
      <div class="ostat">${statusChip(o.status)} ${payChip(o.payment_status)}<p class="muted">Sold by ${o.shop_name}</p></div>
      <div class="oitems">${o.items.map((i) => html`<div class="ritem">${img(i.image, i.name, 'thumb')}<span>${i.product_id ? html`<a href="#/product/${i.product_id}">${i.name}</a>` : i.name}<small>Qty ${i.qty}</small></span></div>`)}</div>
      <div class="oact">
        ${o.payment_method === 'UPI' && ['unpaid', 'failed'].includes(o.payment_status) && o.status !== 'cancelled' ? html`<a class="btn" href="#/pay/${o.id}">Pay now</a>` : ''}
        ${o.payment_method === 'UPI' && o.payment_status === 'submitted' ? html`<a class="btn" href="#/pay/${o.id}">Check payment</a>` : ''}
        <a class="btn ghost" href="#/order/${o.id}">View order</a>
        <a class="btn ghost" href="#/invoice/${o.id}">Invoice</a>
      </div>
    </div></article>`) : html`<div class="empty"><h2>No orders yet</h2><p>When you place an order it will show up here.</p><a class="btn" href="#/">Start shopping</a></div>`}
  </div>`);
}

const STEPS = ['placed', 'confirmed', 'packed', 'shipped', 'delivered'];

export async function orderView(alive, id, query) {
  if (!state.user) return needLogin('Log in to see your order.');
  loading();
  const { order: o } = await get('/orders/' + id);
  if (!alive()) return;
  const at = STEPS.indexOf(o.status);
  mount(html`<div class="page narrow-wide">
  ${query.get('placed') ? html`<div class="banner ok"><b>Order placed.</b> ${o.payment_method === 'COD' ? 'The shop will see your order in its dashboard and confirm soon.' : ''}</div>` : ''}
  <div class="ohead"><div><h1>Order ${o.order_no}</h1><p class="muted">Placed ${when(o.created_at)} · Sold by <b>${o.shop.name}</b></p></div>
    <div class="btnrow"><a class="btn ghost" href="#/invoice/${o.id}">Invoice</a><a class="btn wa" href="${safeHref(o.seller_whatsapp_link)}" target="_blank" rel="noopener">WhatsApp the shop</a></div></div>

  ${o.status === 'cancelled' ? html`<div class="banner bad">This order was cancelled.</div>` : html`
    <ol class="track" aria-label="Order progress">${STEPS.map((s, i) => html`<li class="${i <= at ? 'done' : ''} ${i === at ? 'now' : ''}"><span>${STATUS_LABEL[s]}</span></li>`)}</ol>`}

  ${o.payment_method === 'UPI' && ['unpaid', 'failed'].includes(o.payment_status) && o.status !== 'cancelled' ? html`<div class="banner warn"><b>${o.payment_status === 'failed' ? 'The shop could not find your payment.' : 'Payment pending.'}</b> <a class="btn sm" href="#/pay/${o.id}">Pay ${inr(o.total_paise)} now</a></div>` : ''}
  ${o.payment_status === 'submitted' ? html`<div class="banner warn"><b>Waiting for the shop to confirm your payment.</b> <a href="#/pay/${o.id}">See status</a></div>` : ''}

  <div class="ogrid">
    <section class="cbox"><h2>Items</h2>
      ${o.items.map((i) => html`<div class="ritem">${img(i.image, i.name, 'thumb')}<span>${i.product_id ? html`<a href="#/product/${i.product_id}">${i.name}</a>` : i.name}<small>Qty ${i.qty} · ${inr(i.price_paise)} each</small></span><b>${inr(i.price_paise * i.qty)}</b></div>
        ${o.status === 'delivered' && i.product_id ? html`<p class="rvlink"><a href="#/product/${i.product_id}" data-act="review-link" data-id="${i.product_id}">Write a review for this item</a></p>` : ''}`)}
    </section>
    <section class="cbox"><h2>Delivery address</h2><p><b>${o.ship.name}</b><br>${o.ship.address}<br>${o.ship.city} ${o.ship.pincode}<br>Phone ${o.ship.phone.replace(/^91/, '')}</p>
      ${o.note ? html`<p class="muted">Note: ${o.note}</p>` : ''}</section>
    <section class="cbox"><h2>Payment</h2>
      <dl class="sumlist"><div><dt>Items</dt><dd>${inr(o.subtotal_paise)}</dd></div><div><dt>Delivery</dt><dd>${o.shipping_paise ? inr(o.shipping_paise) : 'Free'}</dd></div><div class="tot"><dt>Total</dt><dd>${inr(o.total_paise)}</dd></div></dl>
      <p>${o.payment_method === 'COD' ? 'Cash on delivery' : 'UPI'} ${payChip(o.payment_status)}</p>
      ${o.upi_txn_ref ? html`<p class="muted">UPI reference: <code>${o.upi_txn_ref}</code></p>` : ''}
      ${o.cancellable ? html`<button class="btn danger ghost sm" data-act="cancel-order" data-id="${o.id}">Cancel order</button>` : ''}
    </section>
  </div></div>`);
}

onClick('review-link', (el) => { go('/product/' + el.dataset.id); setTimeout(() => document.getElementById('reviews')?.scrollIntoView(), 700); });
onClick('cancel-order', async (el) => {
  if (!(await confirmBox({ title: 'Cancel this order?', text: 'The items go back to the shop and the order will be marked cancelled.', ok: 'Cancel order', danger: true }))) return;
  await post(`/orders/${el.dataset.id}/cancel`);
  toast('Order cancelled');
  reload();
});

// ---------- invoice ----------------------------------------------------------
export async function invoiceView(alive, id) {
  if (!state.user) return needLogin('Log in to see your invoice.');
  loading();
  const { order: o } = await get('/orders/' + id);
  if (!alive()) return;
  const gst = !!o.shop.gst_number;
  let taxable = 0, taxTotal = 0;
  const rows = o.items.map((i) => {
    const line = i.price_paise * i.qty;
    const base = gst ? Math.round(line / (1 + i.gst_rate / 100)) : line;
    const tax = gst ? line - base : 0;
    taxable += base; taxTotal += tax;
    return { i, line, base, tax };
  });
  mount(html`<div class="page narrow-wide"><div class="noprint btnrow"><button class="btn" data-act="print">Print or save as PDF</button><a class="btn ghost" href="#/order/${o.id}">Back to order</a></div>
  <article class="invoice">
    <header><div><h1>${gst ? 'Tax invoice' : 'Bill of supply'}</h1><p>Invoice no. <b>${o.order_no}</b><br>Date ${when(o.created_at, false)}</p></div>
      <div class="inv-shop"><b>${o.shop.name}</b><br>${o.shop.address}<br>${o.shop.area}, ${o.shop.city} ${o.shop.pincode}<br>${gst ? html`GSTIN <b>${o.shop.gst_number}</b>` : 'Not registered under GST'}</div></header>
    <div class="inv-to"><small>Bill to / ship to</small><br><b>${o.ship.name}</b><br>${o.ship.address}, ${o.ship.city} ${o.ship.pincode}<br>Phone ${o.ship.phone.replace(/^91/, '')}</div>
    <table class="tbl"><thead><tr><th>Item</th><th>HSN</th><th class="r">Qty</th><th class="r">Rate</th>${gst ? html`<th class="r">Taxable value</th><th class="r">GST</th>` : ''}<th class="r">Amount</th></tr></thead>
      <tbody>${rows.map(({ i, line, base, tax }) => html`<tr><td>${i.name}</td><td>${i.hsn || '-'}</td><td class="r">${i.qty}</td><td class="r">${inr(i.price_paise)}</td>${gst ? html`<td class="r">${inr(base)}</td><td class="r">${i.gst_rate}% (${inr(tax)})</td>` : ''}<td class="r">${inr(line)}</td></tr>`)}
        ${o.shipping_paise ? html`<tr><td colspan="${gst ? 6 : 4}">Delivery charges</td><td class="r">${inr(o.shipping_paise)}</td></tr>` : ''}</tbody>
      <tfoot>${gst ? html`<tr><td colspan="6" class="r">Taxable value</td><td class="r">${inr(taxable)}</td></tr><tr><td colspan="6" class="r">GST included</td><td class="r">${inr(taxTotal)}</td></tr>` : ''}
        <tr class="grand"><td colspan="${gst ? 6 : 4}" class="r">Total ${o.payment_method === 'COD' ? '(cash on delivery)' : '(paid by UPI)'}</td><td class="r">${inr(o.total_paise)}</td></tr></tfoot></table>
    <p class="muted">${gst ? 'Prices are inclusive of GST at the rates shown.' : ''} This is a computer-generated invoice from ChickpetBaazar on behalf of ${o.shop.name}.</p>
  </article></div>`);
}
onClick('print', () => window.print());
