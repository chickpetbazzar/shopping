// Pieces shared by the seller dashboard and the admin panel.
import { html, raw, inr, img, when, statusChip, payChip, safeHref } from './util.js';
import { post } from './api.js';
import { state, toast, confirmBox, reload, onClick, onChange } from './core.js';

const NAV = {
  seller: [['/seller', 'Overview'], ['/seller/shop', 'My shop'], ['/seller/products', 'Products'], ['/seller/orders', 'Orders']],
  admin: [['/admin', 'Dashboard'], ['/admin/shops', 'Shops'], ['/admin/products', 'Products'], ['/admin/orders', 'Orders'], ['/admin/users', 'Users'], ['/admin/reviews', 'Reviews'], ['/admin/whatsapp', 'WhatsApp log']],
};

export const layout = (kind, active, body) => html`<div class="page dash">
  <nav class="dnav" aria-label="${kind === 'admin' ? 'Admin' : 'Seller'} menu">
    <p class="dnav-t">${kind === 'admin' ? 'Admin panel' : 'Seller dashboard'}</p>
    ${NAV[kind].map(([h, l]) => html`<a class="${active === h ? 'on' : ''}" href="#${h}" ${active === h ? raw('aria-current="page"') : ''}>${l}</a>`)}
  </nav><div class="dmain">${body}</div></div>`;

export const stat = (label, value, { tone = '', href = '', note = '' } = {}) => {
  const inner = html`<span>${label}</span><b>${value}</b>${note ? html`<small>${note}</small>` : ''}`;
  return href ? html`<a class="stat ${tone}" href="${href}">${inner}</a>` : html`<div class="stat ${tone}">${inner}</div>`;
};

export function barChart(byDay, title = 'Revenue, last 14 days') {
  const days = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) days.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i)).toISOString().slice(0, 10));
  const map = new Map(byDay.map((r) => [r.d, r]));
  const max = Math.max(1, ...days.map((d) => (map.get(d) ? map.get(d).v : 0)));
  const total = days.reduce((a, d) => a + (map.get(d) ? map.get(d).v : 0), 0);
  return html`<figure class="chart"><figcaption>${title}: <b>${inr(total)}</b></figcaption>
    <div class="bars" role="img" aria-label="${title}, total ${inr(total)}">${days.map((d) => {
      const v = map.get(d) ? map.get(d).v : 0;
      return html`<div class="bar-col" title="${d}: ${inr(v)}"><i style="height:${Math.max(2, Math.round((v / max) * 100))}%"></i><span>${d.slice(8)}</span></div>`;
    })}</div></figure>`;
}

const STATUS_BTN = { confirmed: 'Confirm order', packed: 'Mark as packed', shipped: 'Mark as shipped', delivered: 'Mark as delivered', cancelled: 'Cancel order' };
export const ALL_STATUSES = ['placed', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];

// Order card used by both dashboards. scope = 'seller' | 'admin'
export function orderCard(o, scope) {
  const waCustomer = `https://wa.me/${o.ship.phone}?text=${encodeURIComponent(`Hi ${o.ship.name}, this is ${o.shop_name} about your ChickpetBaazar order ${o.order_no}.`)}`;
  const needsPay = o.payment_method === 'UPI' && o.payment_status !== 'paid' && o.status !== 'cancelled';
  return html`<article class="ocard">
    <header>
      <div><small>Order</small><b>${o.order_no}</b></div>
      <div><small>Placed</small><b>${when(o.created_at)}</b></div>
      <div><small>Total</small><b>${inr(o.total_paise)}</b></div>
      <div><small>${scope === 'admin' ? 'Shop' : 'Customer'}</small><b>${scope === 'admin' ? o.shop_name : o.ship.name}</b></div>
    </header>
    <div class="obody">
      <div class="oitems">${o.items.map((i) => html`<div class="ritem">${img(i.image, i.name, 'thumb')}<span>${i.name}<small>Qty ${i.qty} · ${inr(i.price_paise)} each</small></span></div>`)}</div>
      <div class="ostat">
        <p>${statusChip(o.status)} ${payChip(o.payment_status)}</p>
        <p class="muted">${o.payment_method === 'COD' ? 'Cash on delivery' : 'UPI'}${o.upi_txn_ref ? html` · UTR <code>${o.upi_txn_ref}</code>` : ''}</p>
        <p class="addr"><b>${o.ship.name}</b>, ${o.ship.phone.replace(/^91/, '')}<br>${o.ship.address}, ${o.ship.city} ${o.ship.pincode}</p>
        ${o.note ? html`<p class="muted">Note: ${o.note}</p>` : ''}
        ${scope === 'admin' ? html`<p class="muted">Customer account: ${o.customer_name}</p>` : ''}
      </div>
      <div class="oact">
        ${o.payment_status === 'submitted' && o.status !== 'cancelled' ? html`
          <p class="hint"><b>Check your UPI app</b> for ${inr(o.total_paise)} with reference <code>${o.upi_txn_ref}</code>.</p>
          <button class="btn ok" data-act="ord-pay" data-scope="${scope}" data-id="${o.id}" data-action="confirm">Payment received</button>
          <button class="btn ghost danger sm" data-act="ord-pay" data-scope="${scope}" data-id="${o.id}" data-action="reject">Not received</button>` : ''}
        ${o.payment_status === 'unpaid' && needsPay ? html`<p class="hint">Waiting for the customer to pay by UPI.</p>` : ''}
        ${scope === 'seller' ? o.next_statuses.map((s) => html`<button class="btn ${s === 'cancelled' ? 'ghost danger sm' : ''}" data-act="ord-status" data-scope="seller" data-id="${o.id}" data-status="${s}" ${needsPay && s !== 'cancelled' ? raw('disabled title="Confirm the payment first"') : ''}>${STATUS_BTN[s]}</button>`) : html`
          <label class="field inline"><span>Status</span><select data-change="ord-status-select" data-id="${o.id}">${ALL_STATUSES.map((s) => html`<option value="${s}" ${s === o.status ? raw('selected') : ''}>${s}</option>`)}</select></label>
          <button class="btn ghost danger sm" data-act="ord-delete" data-id="${o.id}">Delete order</button>`}
        <a class="btn ghost sm wa-ghost" href="${safeHref(waCustomer)}" target="_blank" rel="noopener">WhatsApp customer</a>
      </div>
    </div>
  </article>`;
}

const notified = () => (state.meta.whatsappAuto ? 'The customer was notified on WhatsApp.' : 'Tap "WhatsApp customer" to let them know.');

onClick('ord-pay', async (el) => {
  const { scope, id, action } = el.dataset;
  if (action === 'reject' && !(await confirmBox({ title: 'Payment not received?', text: 'The customer will be asked to check the reference number and submit it again.', ok: 'Not received', danger: true }))) return;
  await post(`/${scope}/orders/${id}/payment`, { action });
  toast(action === 'confirm' ? `Payment confirmed. ${notified()}` : 'Marked as not received.');
  reload();
});

onClick('ord-status', async (el) => {
  const { scope, id, status } = el.dataset;
  if (status === 'cancelled' && !(await confirmBox({ title: 'Cancel this order?', text: 'The items go back into stock. If the customer already paid, you must refund them yourself.', ok: 'Cancel order', danger: true }))) return;
  await post(`/${scope}/orders/${id}/status`, { status });
  toast(`Order updated. ${notified()}`);
  reload();
});

onChange('ord-status-select', async (el) => {
  await post(`/admin/orders/${el.dataset.id}/status`, { status: el.value });
  toast('Order status changed');
  reload();
});
