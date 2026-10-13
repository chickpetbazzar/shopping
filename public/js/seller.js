// Seller dashboard: overview, shop, products, orders.
import { html, raw, inr, img, safeHref } from './util.js';
import { get, post, del } from './api.js';
import { state, mount, loading, go, toast, confirmBox, reload, onLeave, onClick } from './core.js';
import { layout, stat, barChart, orderCard } from './dash.js';
import { productForm, shopForm } from './forms.js';

function guard() {
  if (!state.user) { sessionStorage.setItem('cb_next', location.hash.slice(1)); go('/login', true); return false; }
  if (state.user.role !== 'seller') {
    mount(html`<div class="page narrow"><div class="empty"><h1>This area is for shop owners</h1><p>Create a shop account to sell on ChickpetBaazar.</p><a class="btn" href="#/signup?role=seller">Open a shop account</a></div></div>`);
    return false;
  }
  return true;
}

const noShop = () => layout('seller', '/seller', html`<div class="empty"><h1>Set up your shop</h1>
  <p>Add your shop name, GST number and UPI ID so customers can find you and pay you directly.</p>
  <a class="btn big" href="#/seller/shop">Create my shop</a></div>`);

// Watch for new orders while the dashboard is open
function watchOrders(alive, start) {
  let known = start;
  const t = setInterval(async () => {
    try {
      const s = await get('/seller/stats');
      if (!alive()) return;
      if (s.orders_total > known) { known = s.orders_total; toast('You have a new order'); reload(); }
    } catch { /* ignore */ }
  }, 30000);
  onLeave(() => clearInterval(t));
}

export async function overviewView(alive) {
  if (!guard()) return;
  loading();
  const { shop } = await get('/seller/shop');
  if (!alive()) return;
  if (!shop) return mount(noShop());
  const s = await get('/seller/stats');
  if (!alive()) return;
  watchOrders(alive, s.orders_total);
  mount(layout('seller', '/seller', html`
    <h1>${shop.name}</h1>
    ${shop.status === 'pending' ? html`<div class="banner warn"><b>Waiting for approval.</b> Customers cannot see your shop yet. You can add products now and they go live once we approve your shop.</div>` : ''}
    ${shop.status === 'suspended' ? html`<div class="banner bad"><b>Your shop is suspended</b> and hidden from customers. Please contact ChickpetBaazar support.</div>` : ''}
    ${s.payments_to_verify ? html`<div class="banner warn"><b>${s.payments_to_verify} UPI ${s.payments_to_verify === 1 ? 'payment' : 'payments'} to verify.</b> Check your UPI app, then confirm. <a class="btn sm" href="#/seller/orders?tab=verify">Review payments</a></div>` : ''}
    ${!state.meta.whatsappAuto ? html`<p class="hint">New orders and payments appear here. Keep this page open, or check back often.</p>` : ''}
    <div class="stats">
      ${stat('Revenue (paid)', inr(s.revenue_paise))}
      ${stat('Orders to handle', s.orders_new, { href: '#/seller/orders?tab=active', tone: s.orders_new ? 'hot' : '' })}
      ${stat('Payments to verify', s.payments_to_verify, { href: '#/seller/orders?tab=verify', tone: s.payments_to_verify ? 'hot' : '' })}
      ${stat('Products', s.products, { href: '#/seller/products' })}
      ${stat('Low on stock', s.low_stock, { href: '#/seller/products', note: '3 or fewer left', tone: s.low_stock ? 'warn' : '' })}
    </div>
    ${barChart(s.by_day)}
    <div class="btnrow"><a class="btn" href="#/seller/products/new">Add a product</a><a class="btn ghost" href="#/seller/shop">Edit shop details</a></div>`));
}

export async function shopView(alive) {
  if (!guard()) return;
  loading();
  const { shop } = await get('/seller/shop');
  if (!alive()) return;
  mount(layout('seller', '/seller/shop', html`<h1>${shop ? 'My shop' : 'Create your shop'}</h1>
    ${shop && shop.status === 'pending' ? html`<div class="banner warn">Your shop is waiting for approval.</div>` : ''}
    ${shopForm({ shop, scope: 'seller' })}`));
}

export async function productsView(alive) {
  if (!guard()) return;
  loading();
  const { shop } = await get('/seller/shop');
  if (!alive()) return;
  if (!shop) return mount(noShop());
  const res = await get('/seller/products');
  if (!alive()) return;
  mount(layout('seller', '/seller/products', html`
    <div class="dhead"><h1>Products</h1><a class="btn" href="#/seller/products/new">Add a product</a></div>
    ${res.items.length ? html`<div class="tblwrap"><table class="tbl"><thead><tr><th>Product</th><th class="r">Price</th><th class="r">Stock</th><th>Status</th><th></th></tr></thead><tbody>
      ${res.items.map((p) => html`<tr>
        <td><div class="pcell">${img(p.image, p.name, 'thumb')}<span><a href="#/product/${p.id}">${p.name}</a><small>${p.category}</small></span></div></td>
        <td class="r">${inr(p.price_paise)}${p.mrp_paise > p.price_paise ? html`<small><s>${inr(p.mrp_paise)}</s></small>` : ''}</td>
        <td class="r ${p.stock <= 3 ? 'lowstock' : ''}">${p.stock}</td>
        <td>${p.active ? html`<span class="chip pay-paid">Live</span>` : html`<span class="chip st-cancelled">Hidden</span>`}</td>
        <td class="acts"><a class="btn ghost sm" href="#/seller/products/${p.id}/edit">Edit</a><button class="btn ghost danger sm" data-act="del-product" data-scope="seller" data-id="${p.id}" data-name="${p.name}">Delete</button></td></tr>`)}
    </tbody></table></div>` : html`<div class="empty"><h2>No products yet</h2><p>Add your first product with photos, price and stock.</p><a class="btn" href="#/seller/products/new">Add a product</a></div>`}`));
}

export async function productFormView(alive, id) {
  if (!guard()) return;
  loading();
  const { shop } = await get('/seller/shop');
  if (!shop) { toast('Create your shop first.'); return go('/seller/shop', true); }
  const product = id ? (await get('/products/' + id)).product : null;
  if (!alive()) return;
  if (product && product.shop_id !== shop.id) return go('/seller/products', true);
  mount(layout('seller', '/seller/products', html`<h1>${product ? 'Edit product' : 'Add a product'}</h1>${productForm({ product, scope: 'seller' })}`));
}

onClick('del-product', async (el) => {
  const { scope, id, name } = el.dataset;
  if (!(await confirmBox({ title: 'Delete this product?', text: `"${name}" will be removed from the store. Past orders keep their record.`, ok: 'Delete product', danger: true }))) return;
  await del(`/${scope}/products/${id}`);
  toast('Product deleted');
  reload();
});

const TABS = [['active', 'To handle'], ['verify', 'Payments to verify'], ['done', 'Delivered'], ['cancelled', 'Cancelled'], ['all', 'All']];
const inTab = (o, t) =>
  t === 'verify' ? o.payment_status === 'submitted' && o.status !== 'cancelled'
  : t === 'active' ? ['placed', 'confirmed', 'packed', 'shipped'].includes(o.status)
  : t === 'done' ? o.status === 'delivered'
  : t === 'cancelled' ? o.status === 'cancelled' : true;

export async function ordersView(alive, query) {
  if (!guard()) return;
  loading();
  const { shop } = await get('/seller/shop');
  if (!alive()) return;
  if (!shop) return mount(noShop());
  const { items } = await get('/seller/orders');
  if (!alive()) return;
  watchOrders(alive, items.length);
  const tab = TABS.some(([k]) => k === query.get('tab')) ? query.get('tab') : 'active';
  const list = items.filter((o) => inTab(o, tab));
  mount(layout('seller', '/seller/orders', html`<h1>Orders</h1>
    <div class="tabs" role="tablist">${TABS.map(([k, l]) => html`<a role="tab" class="${tab === k ? 'on' : ''}" aria-selected="${tab === k}" href="#/seller/orders?tab=${k}">${l} <span>${items.filter((o) => inTab(o, k)).length}</span></a>`)}</div>
    ${list.length ? list.map((o) => orderCard(o, 'seller')) : html`<div class="empty"><h2>Nothing here</h2><p>Orders in this group will show up here.</p></div>`}`));
}
