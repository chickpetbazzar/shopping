'use strict';
const QRCode = require('qrcode');
const { db, tx } = require('./db');
const { HttpError, bad, inr } = require('./util');
const wa = require('./whatsapp');

const STATUS_TEXT = {
  confirmed: 'has been confirmed by the shop and is being prepared.',
  packed: 'has been packed and will be handed to the courier soon.',
  shipped: 'is on its way to you.',
  delivered: 'has been delivered. Thank you for shopping on ChickpetBaazar! You can now rate your items.',
  cancelled: 'has been cancelled.',
};

// next steps a shop may take
const NEXT = {
  placed: ['confirmed', 'cancelled'],
  confirmed: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

function shape(o, withItems = true) {
  if (!o) return o;
  const out = {
    id: o.id, order_no: o.order_no, user_id: o.user_id, shop_id: o.shop_id,
    shop_name: o.shop_name, customer_name: o.customer_name,
    subtotal_paise: o.subtotal_paise, shipping_paise: o.shipping_paise, total_paise: o.total_paise,
    status: o.status, payment_method: o.payment_method, payment_status: o.payment_status,
    upi_txn_ref: o.upi_txn_ref,
    ship: { name: o.ship_name, phone: o.ship_phone, address: o.ship_address, city: o.ship_city, pincode: o.ship_pincode },
    note: o.note, created_at: o.created_at, updated_at: o.updated_at,
    next_statuses: NEXT[o.status] || [],
  };
  if (withItems) {
    out.items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(o.id);
  }
  return out;
}

const SEL = `SELECT o.*, s.name AS shop_name, u.name AS customer_name
  FROM orders o JOIN shops s ON s.id = o.shop_id JOIN users u ON u.id = o.user_id`;

const get = (id) => db.prepare(`${SEL} WHERE o.id = ?`).get(id);

function list({ userId, shopId, status, payment, limit = 100 } = {}) {
  const where = [];
  const p = [];
  if (userId) { where.push('o.user_id = ?'); p.push(userId); }
  if (shopId) { where.push('o.shop_id = ?'); p.push(shopId); }
  if (status) { where.push('o.status = ?'); p.push(status); }
  if (payment) { where.push('o.payment_status = ?'); p.push(payment); }
  const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
  return db.prepare(`${SEL}${w} ORDER BY o.id DESC LIMIT ?`).all(...p, limit).map((o) => shape(o));
}

function shopOf(o) {
  return db.prepare('SELECT s.*, u.phone AS owner_phone FROM shops s JOIN users u ON u.id = s.owner_id WHERE s.id = ?').get(o.shop_id);
}
const customerOf = (o) => db.prepare('SELECT id, name, phone FROM users WHERE id = ?').get(o.user_id);

function itemsLine(orderId) {
  const items = db.prepare('SELECT name, qty FROM order_items WHERE order_id = ?').all(orderId);
  const txt = items.slice(0, 3).map((i) => `${i.name} x${i.qty}`).join(', ');
  return items.length > 3 ? `${txt} +${items.length - 3} more` : txt;
}

// ---- notifications ---------------------------------------------------------
function notifySellerNewOrder(o) {
  const s = shopOf(o);
  wa.notify(
    s.whatsapp,
    `🛍️ New order ${o.order_no} on ChickpetBaazar\n${itemsLine(o.id)}\nTotal: ${inr(o.total_paise)}\nPayment: ${o.payment_method === 'COD' ? 'Cash on delivery' : 'UPI (waiting for customer to pay)'}\nDeliver to: ${o.ship_name}, ${o.ship_city} ${o.ship_pincode}\nOpen your ChickpetBaazar seller dashboard to confirm.`,
    o.id
  );
}

function notifySellerPaymentSubmitted(o) {
  const s = shopOf(o);
  return wa.send(
    s.whatsapp,
    `💰 Payment submitted for order ${o.order_no}\nAmount: ${inr(o.total_paise)}\nUPI ref (UTR): ${o.upi_txn_ref}\nPlease check your UPI app for this credit, then confirm the payment in your seller dashboard.`,
    o.id
  ).catch(() => null);
}

function notifyCustomer(o, text) {
  const c = customerOf(o);
  if (c) wa.notify(c.phone, text, o.id);
}

// ---- state changes ---------------------------------------------------------
function restoreStock(orderId) {
  const items = db.prepare('SELECT product_id, qty FROM order_items WHERE order_id = ?').all(orderId);
  for (const i of items) {
    if (i.product_id) db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(i.qty, i.product_id);
  }
}

function setStatus(orderId, next, { force = false } = {}) {
  const o = tx(() => {
    const cur = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!cur) throw new HttpError(404, 'Order not found.');
    if (!force && !(NEXT[cur.status] || []).includes(next)) {
      throw bad(`An order that is "${cur.status}" cannot be moved to "${next}".`);
    }
    if (!force && cur.payment_method === 'UPI' && cur.payment_status !== 'paid' && next !== 'cancelled') {
      throw bad('Confirm the UPI payment first, then update the order.');
    }
    if (next === 'cancelled' && cur.status !== 'cancelled') restoreStock(cur.id);
    let pay = cur.payment_status;
    if (next === 'delivered' && cur.payment_method === 'COD') pay = 'paid';
    db.prepare("UPDATE orders SET status = ?, payment_status = ?, updated_at = datetime('now') WHERE id = ?").run(next, pay, cur.id);
    return db.prepare('SELECT * FROM orders WHERE id = ?').get(cur.id);
  });
  const text = STATUS_TEXT[next];
  if (text) notifyCustomer(o, `📦 Your order ${o.order_no} ${text}`);
  return get(orderId);
}

// action: 'confirm' | 'reject'
function decidePayment(orderId, action) {
  const o = tx(() => {
    const cur = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!cur) throw new HttpError(404, 'Order not found.');
    if (cur.payment_method !== 'UPI') throw bad('This is a cash on delivery order.');
    if (cur.status === 'cancelled') throw bad('This order is cancelled.');
    if (action === 'confirm') {
      if (cur.payment_status === 'paid') throw bad('Payment is already confirmed.');
      db.prepare("UPDATE orders SET payment_status = 'paid', status = CASE WHEN status = 'placed' THEN 'confirmed' ELSE status END, updated_at = datetime('now') WHERE id = ?").run(cur.id);
    } else if (action === 'reject') {
      if (cur.payment_status === 'paid') throw bad('Payment is already confirmed.');
      db.prepare("UPDATE orders SET payment_status = 'failed', updated_at = datetime('now') WHERE id = ?").run(cur.id);
    } else throw bad('Unknown action.');
    return db.prepare('SELECT * FROM orders WHERE id = ?').get(cur.id);
  });
  const s = shopOf(o);
  if (action === 'confirm') {
    notifyCustomer(o, `✅ Payment of ${inr(o.total_paise)} received by ${s.name} for order ${o.order_no}. Your order is confirmed. Thank you for shopping on ChickpetBaazar!`);
  } else {
    notifyCustomer(o, `⚠️ ${s.name} could not find your payment for order ${o.order_no}. Please check the UPI reference number and submit it again, or contact the shop.`);
  }
  return get(orderId);
}

// ---- UPI payment details ---------------------------------------------------
async function upiDetails(o) {
  const s = shopOf(o);
  const amount = (o.total_paise / 100).toFixed(2);
  const pa = encodeURIComponent(s.upi_id).replace('%40', '@');
  const link = `upi://pay?pa=${pa}&pn=${encodeURIComponent(s.name.slice(0, 50))}&am=${amount}&cu=INR&tn=${encodeURIComponent('Order ' + o.order_no)}`;
  const qr = await QRCode.toDataURL(link, { margin: 1, width: 280, errorCorrectionLevel: 'M' });
  return { upi_id: s.upi_id, payee: s.name, amount_paise: o.total_paise, link, qr };
}

module.exports = {
  shape, get, list, shopOf, setStatus, decidePayment, upiDetails,
  notifySellerNewOrder, notifySellerPaymentSubmitted, notifyCustomer, itemsLine, NEXT,
};
