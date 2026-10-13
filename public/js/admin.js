// Admin panel: dashboard, shops, products, orders, users, reviews, WhatsApp log.
import { html, raw, inr, img, when, statusChip, payChip, linkWith, parseHash, safeHref } from './util.js';
import { get, post, put, del } from './api.js';
import { state, mount, loading, go, toast, confirmBox, promptBox, reload, onClick, onSubmit } from './core.js';
import { layout, stat, barChart, orderCard } from './dash.js';
import { productForm, shopForm } from './forms.js';

function guard() {
  if (!state.user) { sessionStorage.setItem('cb_next', location.hash.slice(1)); go('/login', true); return false; }
  if (state.user.role !== 'admin') {
    mount(html`<div class="page narrow"><div class="empty"><h1>Admins only</h1><p>You do not have access to this page.</p><a class="btn" href="#/">Back to the store</a></div></div>`);
    return false;
  }
  return true;
}
const shopChip = (s) => html`<span class="chip sh-${s}">${s === 'approved' ? 'Approved' : s === 'pending' ? 'Pending' : 'Suspended'}</span>`;

// ---- dashboard ----
export async function dashView(alive) {
  if (!guard()) return;
  loading();
  const [s, pending] = await Promise.all([get('/admin/stats'), get('/admin/shops?status=pending')]);
  if (!alive()) return;
  mount(layout('admin', '/admin', html`<h1>Dashboard</h1>
    <div class="stats">
      ${stat('Revenue (paid orders)', inr(s.revenue_paise))}
      ${stat('Orders', s.orders, { href: '#/admin/orders' })}
      ${stat('Payments to verify', s.payments_to_verify, { href: '#/admin/orders?payment=submitted', tone: s.payments_to_verify ? 'hot' : '' })}
      ${stat('Shops', s.shops, { href: '#/admin/shops', note: s.shops_pending ? `${s.shops_pending} waiting for approval` : '', tone: s.shops_pending ? 'warn' : '' })}
      ${stat('Products', s.products, { href: '#/admin/products' })}
      ${stat('Customers', s.customers, { href: '#/admin/users?role=customer' })}
      ${stat('Sellers', s.sellers, { href: '#/admin/users?role=seller' })}
    </div>
    ${barChart(s.by_day)}
    <section class="cbox"><h2>Shops waiting for approval</h2>
      ${pending.items.length ? pending.items.map((sh) => html`<div class="prow"><div><b>${sh.name}</b><small>${sh.owner_name} · ${sh.owner_email}${sh.gst_number ? ' · GSTIN ' + sh.gst_number : ' · no GSTIN'} · UPI ${sh.upi_id}</small></div>
        <div class="acts"><button class="btn sm" data-act="shop-status" data-id="${sh.id}" data-status="approved">Approve</button><a class="btn ghost sm" href="#/admin/shops/${sh.id}/edit">Review</a></div></div>`)
        : html`<p class="muted">No shops are waiting.</p>`}
    </section>`));
}

// ---- shops ----
export async function shopsView(alive, query) {
  if (!guard()) return;
  loading();
  const status = query.get('status') || '';
  const { items } = await get('/admin/shops' + (status ? '?status=' + status : ''));
  if (!alive()) return;
  mount(layout('admin', '/admin/shops', html`<div class="dhead"><h1>Shops</h1><a class="btn" href="#/admin/shops/new">Add a shop</a></div>
    <div class="tabs">${[['', 'All'], ['pending', 'Pending'], ['approved', 'Approved'], ['suspended', 'Suspended']].map(([k, l]) => html`<a class="${status === k ? 'on' : ''}" href="#/admin/shops${k ? '?status=' + k : ''}">${l}</a>`)}</div>
    ${items.length ? html`<div class="tblwrap"><table class="tbl"><thead><tr><th>Shop</th><th>Owner</th><th>GSTIN / UPI</th><th class="r">Products</th><th class="r">Orders</th><th>Status</th><th></th></tr></thead><tbody>
      ${items.map((s) => html`<tr>
        <td><div class="pcell"><div class="shoplogo sm">${img(s.logo, s.name)}</div><span><b>${s.name}</b><small>${s.area}, ${s.city}</small></span></div></td>
        <td>${s.owner_name}<small>${s.owner_email}</small></td>
        <td>${s.gst_number || html`<span class="muted">no GSTIN</span>`}<small>${s.upi_id}</small></td>
        <td class="r">${s.product_count}</td><td class="r">${s.order_count}</td><td>${shopChip(s.status)}</td>
        <td class="acts">
          ${s.status !== 'approved' ? html`<button class="btn sm" data-act="shop-status" data-id="${s.id}" data-status="approved">${s.status === 'pending' ? 'Approve' : 'Reinstate'}</button>` : html`<button class="btn ghost sm" data-act="shop-status" data-id="${s.id}" data-status="suspended">Suspend</button>`}
          <a class="btn ghost sm" href="#/admin/shops/${s.id}/edit">Edit</a>
          <button class="btn ghost danger sm" data-act="del-shop" data-id="${s.id}" data-name="${s.name}" data-products="${s.product_count}" data-orders="${s.order_count}">Delete</button></td></tr>`)}
    </tbody></table></div>` : html`<div class="empty"><h2>No shops here</h2></div>`}`));
}

export async function shopFormView(alive, id) {
  if (!guard()) return;
  loading();
  let shop = null;
  if (id) shop = (await get('/admin/shops')).items.find((s) => String(s.id) === String(id)) || null;
  if (!alive()) return;
  if (id && !shop) return go('/admin/shops', true);
  mount(layout('admin', '/admin/shops', html`<h1>${shop ? 'Edit shop' : 'Add a shop'}</h1>${shopForm({ shop, scope: 'admin' })}`));
}

onClick('shop-status', async (el) => {
  await post(`/admin/shops/${el.dataset.id}/status`, { status: el.dataset.status });
  toast(el.dataset.status === 'approved' ? 'Shop approved. It is now visible to customers.' : 'Shop suspended');
  reload();
});
onClick('del-shop', async (el) => {
  const { name, products, orders } = el.dataset;
  if (!(await confirmBox({ title: `Delete "${name}"?`, text: `This permanently deletes the shop, its ${products} products and ${orders} orders, and cannot be undone. To hide a shop without deleting it, use Suspend instead.`, ok: 'Delete shop', danger: true }))) return;
  await del('/admin/shops/' + el.dataset.id);
  toast('Shop deleted');
  reload();
});

// ---- products ----
export async function productsView(alive, query) {
  if (!guard()) return;
  loading();
  const q = query.get('q') || '', shop = query.get('shop') || '', active = query.get('active') || '';
  const params = new URLSearchParams({ ...(q && { q }), ...(shop && { shop }), ...(active && { active }), ...(query.get('page') && { page: query.get('page') }) });
  const [res, shops] = await Promise.all([get('/admin/products?' + params), get('/admin/shops')]);
  if (!alive()) return;
  mount(layout('admin', '/admin/products', html`<div class="dhead"><h1>Products</h1><a class="btn" href="#/admin/products/new">Add a product</a></div>
    <form class="filterbar" data-form="admin-filter" data-path="/admin/products">
      <label class="field"><span class="sr">Search</span><input name="q" value="${q}" placeholder="Search products"></label>
      <label class="field"><span class="sr">Shop</span><select name="shop"><option value="">All shops</option>${shops.items.map((s) => html`<option value="${s.id}" ${String(s.id) === shop ? raw('selected') : ''}>${s.name}</option>`)}</select></label>
      <label class="field"><span class="sr">Visibility</span><select name="active"><option value="">Live and hidden</option><option value="1" ${active === '1' ? raw('selected') : ''}>Live</option><option value="0" ${active === '0' ? raw('selected') : ''}>Hidden</option></select></label>
      <button class="btn" type="submit">Filter</button></form>
    <p class="muted">${res.total} products${res.pages > 1 ? ` · page ${res.page} of ${res.pages}` : ''}</p>
    ${res.items.length ? html`<div class="tblwrap"><table class="tbl"><thead><tr><th>Product</th><th>Shop</th><th class="r">Price</th><th class="r">Stock</th><th>Status</th><th></th></tr></thead><tbody>
      ${res.items.map((p) => html`<tr>
        <td><div class="pcell">${img(p.image, p.name, 'thumb')}<span><a href="#/product/${p.id}">${p.name}</a><small>${p.category}</small></span></div></td>
        <td>${p.shop_name}</td><td class="r">${inr(p.price_paise)}</td><td class="r ${p.stock <= 3 ? 'lowstock' : ''}">${p.stock}</td>
        <td>${p.active ? html`<span class="chip pay-paid">Live</span>` : html`<span class="chip st-cancelled">Hidden</span>`}</td>
        <td class="acts"><button class="btn ghost sm" data-act="toggle-product" data-id="${p.id}" data-active="${p.active ? '0' : '1'}">${p.active ? 'Hide' : 'Show'}</button>
          <a class="btn ghost sm" href="#/admin/products/${p.id}/edit">Edit</a>
          <button class="btn ghost danger sm" data-act="del-product" data-scope="admin" data-id="${p.id}" data-name="${p.name}">Delete</button></td></tr>`)}
    </tbody></table></div>
    ${res.pages > 1 ? html`<nav class="pager">${res.page > 1 ? html`<a class="btn ghost sm" href="${linkWith('/admin/products', query, { page: res.page - 1 })}">Previous</a>` : ''}${res.page < res.pages ? html`<a class="btn ghost sm" href="${linkWith('/admin/products', query, { page: res.page + 1 })}">Next</a>` : ''}</nav>` : ''}`
    : html`<div class="empty"><h2>No products found</h2></div>`}`));
}

export async function productFormView(alive, id) {
  if (!guard()) return;
  loading();
  const [shops, product] = await Promise.all([get('/admin/shops'), id ? get('/products/' + id).then((d) => d.product) : null]);
  if (!alive()) return;
  mount(layout('admin', '/admin/products', html`<h1>${product ? 'Edit product' : 'Add a product'}</h1>${productForm({ product, shops: shops.items, scope: 'admin' })}`));
}

onClick('toggle-product', async (el) => {
  await post(`/admin/products/${el.dataset.id}/active`, { active: el.dataset.active === '1' });
  toast(el.dataset.active === '1' ? 'Product is live' : 'Product hidden');
  reload();
});

// generic filter bar -> route query
onSubmit('admin-filter', (f) => {
  const d = Object.fromEntries(new FormData(f));
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(d)) if (v) q.set(k, v);
  go(f.dataset.path + (q.toString() ? '?' + q : ''));
});

// ---- orders ----
export async function ordersView(alive, query) {
  if (!guard()) return;
  loading();
  const status = query.get('status') || '', payment = query.get('payment') || '';
  const params = new URLSearchParams({ ...(status && { status }), ...(payment && { payment }) });
  const { items } = await get('/admin/orders?' + params);
  if (!alive()) return;
  const opt = (cur, list) => list.map(([v, l]) => html`<option value="${v}" ${cur === v ? raw('selected') : ''}>${l}</option>`);
  mount(layout('admin', '/admin/orders', html`<h1>Orders</h1>
    <form class="filterbar" data-form="admin-filter" data-path="/admin/orders">
      <label class="field"><span class="sr">Order status</span><select name="status">${opt(status, [['', 'Any status'], ['placed', 'Placed'], ['confirmed', 'Confirmed'], ['packed', 'Packed'], ['shipped', 'Shipped'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled']])}</select></label>
      <label class="field"><span class="sr">Payment</span><select name="payment">${opt(payment, [['', 'Any payment'], ['unpaid', 'Unpaid'], ['submitted', 'To verify'], ['paid', 'Paid'], ['failed', 'Not found'], ['cod', 'Cash on delivery']])}</select></label>
      <button class="btn" type="submit">Filter</button></form>
    <p class="muted">${items.length} orders</p>
    ${items.length ? items.map((o) => orderCard(o, 'admin')) : html`<div class="empty"><h2>No orders found</h2></div>`}`));
}

onClick('ord-delete', async (el) => {
  if (!(await confirmBox({ title: 'Delete this order?', text: 'The order is removed for good. If it was not delivered or cancelled, its items go back into stock.', ok: 'Delete order', danger: true }))) return;
  await del('/admin/orders/' + el.dataset.id);
  toast('Order deleted');
  reload();
});

// ---- users ----
export async function usersView(alive, query) {
  if (!guard()) return;
  loading();
  const q = query.get('q') || '', role = query.get('role') || '';
  const params = new URLSearchParams({ ...(q && { q }), ...(role && { role }) });
  const { items } = await get('/admin/users?' + params);
  if (!alive()) return;
  mount(layout('admin', '/admin/users', html`<h1>Users</h1>
    <form class="filterbar" data-form="admin-filter" data-path="/admin/users">
      <label class="field"><span class="sr">Search</span><input name="q" value="${q}" placeholder="Name, email or phone"></label>
      <label class="field"><span class="sr">Role</span><select name="role">${[['', 'All roles'], ['customer', 'Customers'], ['seller', 'Sellers'], ['admin', 'Admins']].map(([v, l]) => html`<option value="${v}" ${role === v ? raw('selected') : ''}>${l}</option>`)}</select></label>
      <button class="btn" type="submit">Filter</button></form>
    <div class="tblwrap"><table class="tbl"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Joined</th><th>Status</th><th></th></tr></thead><tbody>
      ${items.map((u) => html`<tr><td>${u.name}</td><td>${u.email}</td><td>${u.phone.replace(/^91/, '')}</td><td><span class="chip role-${u.role}">${u.role}</span></td><td>${when(u.created_at, false)}</td>
        <td>${u.active ? html`<span class="chip pay-paid">Active</span>` : html`<span class="chip st-cancelled">Disabled</span>`}</td>
        <td class="acts">
          ${u.id !== state.user.id ? html`<button class="btn ghost sm" data-act="user-active" data-id="${u.id}" data-active="${u.active ? '0' : '1'}">${u.active ? 'Disable' : 'Enable'}</button>` : ''}
          <button class="btn ghost sm" data-act="user-pw" data-id="${u.id}" data-name="${u.name}">Reset password</button>
          ${u.role !== 'admin' ? html`<button class="btn ghost danger sm" data-act="user-del" data-id="${u.id}" data-name="${u.name}" data-role="${u.role}">Delete</button>` : ''}</td></tr>`)}
    </tbody></table></div>`));
}

onClick('user-active', async (el) => {
  const on = el.dataset.active === '1';
  if (!on && !(await confirmBox({ title: 'Disable this account?', text: 'They are signed out and cannot log in until you enable the account again.', ok: 'Disable', danger: true }))) return;
  await put('/admin/users/' + el.dataset.id, { active: on });
  toast(on ? 'Account enabled' : 'Account disabled');
  reload();
});
onClick('user-pw', async (el) => {
  const pw = await promptBox({ title: `New password for ${el.dataset.name}`, label: 'New password', type: 'text', ok: 'Set password', hint: 'At least 8 characters with a letter and a number. Share it with them privately. They are signed out everywhere.' });
  if (!pw) return;
  await post(`/admin/users/${el.dataset.id}/password`, { password: pw });
  toast('Password changed');
});
onClick('user-del', async (el) => {
  const extra = el.dataset.role === 'seller' ? ' Their shop, products and orders are deleted too.' : ' Their orders and reviews are deleted too.';
  if (!(await confirmBox({ title: `Delete ${el.dataset.name}?`, text: 'This permanently deletes the account.' + extra, ok: 'Delete account', danger: true }))) return;
  await del('/admin/users/' + el.dataset.id);
  toast('Account deleted');
  reload();
});

// ---- reviews ----
export async function reviewsView(alive) {
  if (!guard()) return;
  loading();
  const { items } = await get('/admin/reviews');
  if (!alive()) return;
  mount(layout('admin', '/admin/reviews', html`<h1>Reviews</h1>
    ${items.length ? items.map((r) => html`<article class="cbox"><div class="prow"><div><b>${r.product_name}</b><small>${r.user_name} · ${when(r.created_at, false)} · ${r.rating} of 5 stars</small>
      <p><b>${r.title}</b> ${r.body}</p></div><div class="acts"><button class="btn ghost danger sm" data-act="rev-del" data-id="${r.id}">Delete</button></div></div></article>`) : html`<div class="empty"><h2>No reviews yet</h2></div>`}`));
}
onClick('rev-del', async (el) => {
  if (!(await confirmBox({ title: 'Delete this review?', text: 'It is removed from the product page.', ok: 'Delete review', danger: true }))) return;
  await del('/admin/reviews/' + el.dataset.id);
  toast('Review deleted');
  reload();
});

// ---- WhatsApp log ----
export async function whatsappView(alive) {
  if (!guard()) return;
  loading();
  const { items, automatic } = await get('/admin/whatsapp');
  if (!alive()) return;
  mount(layout('admin', '/admin/whatsapp', html`<h1>WhatsApp messages</h1>
    ${automatic ? html`<div class="banner ok">Automatic sending is <b>on</b> through the WhatsApp Business Cloud API.</div>`
      : html`<div class="banner warn"><b>Automatic sending is off.</b> Messages are saved here and can be sent with one tap. See the README to connect the WhatsApp Business Cloud API.</div>`}
    ${items.length ? html`<div class="tblwrap"><table class="tbl"><thead><tr><th>Time</th><th>To</th><th>Message</th><th>Status</th><th></th></tr></thead><tbody>
      ${items.map((m) => html`<tr><td>${when(m.created_at)}</td><td>${m.to_number.replace(/^91/, '')}</td><td class="msg">${m.message}</td>
        <td><span class="chip wa-${m.status}">${m.status === 'link-only' ? 'Not sent' : m.status}</span>${m.error ? html`<small>${m.error}</small>` : ''}</td>
        <td><a class="btn ghost sm" target="_blank" rel="noopener" href="${safeHref('https://wa.me/' + m.to_number + '?text=' + encodeURIComponent(m.message))}">Open in WhatsApp</a></td></tr>`)}
    </tbody></table></div>` : html`<div class="empty"><h2>No messages yet</h2></div>`}`));
}
