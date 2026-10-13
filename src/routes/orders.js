'use strict';
// Customer orders: checkout, list, detail, UPI payment, cancel
const express = require('express');
const { db, tx } = require('../db');
const auth = require('../auth');
const orders = require('../orders');
const wa = require('../whatsapp');
const cart = require('./cart');
const products = require('../products');
const { bad, clean, normPhone, orderNo, toInt, inr, UTR_RE, PIN_RE, wrap, HttpError } = require('../util');

const router = express.Router();
router.use(auth.requireAuth);

function ownOrder(req) {
  const id = toInt(req.params.id, 1, 1e9);
  const o = id && orders.get(id);
  if (!o || o.user_id !== req.user.id) throw new HttpError(404, 'Order not found.');
  return o;
}

router.post('/checkout', wrap(async (req, res) => {
  const b = req.body || {};
  const name = clean(b.name, 60);
  const phone = normPhone(b.phone);
  const address = clean(b.address, 300);
  const city = clean(b.city, 60);
  const pincode = clean(b.pincode, 6);
  const method = b.payment_method === 'COD' ? 'COD' : b.payment_method === 'UPI' ? 'UPI' : '';
  if (name.length < 2) throw bad('Enter the name of the person receiving the order.');
  if (!phone) throw bad('Enter a valid 10-digit mobile number for delivery.');
  if (address.length < 8) throw bad('Enter the full delivery address.');
  if (city.length < 2) throw bad('Enter the city.');
  if (!PIN_RE.test(pincode)) throw bad('Enter a valid 6-digit pincode.');
  if (!method) throw bad('Choose how you want to pay.');

  const created = tx(() => {
    const rows = cart.rows(req.user.id);
    if (!rows.length) throw bad('Your cart is empty.');
    for (const r of rows) {
      const issue = cart.issueOf(r);
      if (issue) throw bad(`"${r.name}": ${issue.toLowerCase()}. Update your cart and try again.`);
      if (r.owner_id === req.user.id) throw bad('You cannot buy from your own shop.');
    }
    const byShop = new Map();
    for (const r of rows) {
      if (!byShop.has(r.shop_id)) byShop.set(r.shop_id, []);
      byShop.get(r.shop_id).push(r);
    }
    const ids = [];
    for (const [shopId, items] of byShop) {
      const first = items[0];
      const subtotal = items.reduce((a, i) => a + i.price_paise * i.qty, 0);
      const free = first.free_ship_above_paise > 0 && subtotal >= first.free_ship_above_paise;
      const shipping = free ? 0 : first.shipping_fee_paise;
      let no = orderNo();
      while (db.prepare('SELECT 1 FROM orders WHERE order_no = ?').get(no)) no = orderNo();
      const r = db
        .prepare(
          `INSERT INTO orders (order_no, user_id, shop_id, subtotal_paise, shipping_paise, total_paise, payment_method, payment_status, ship_name, ship_phone, ship_address, ship_city, ship_pincode, note)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(no, req.user.id, shopId, subtotal, shipping, subtotal + shipping, method, method === 'COD' ? 'cod' : 'unpaid', name, phone, address, city, pincode, clean(b.note, 300));
      const oid = Number(r.lastInsertRowid);
      for (const i of items) {
        const upd = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?').run(i.qty, i.product_id, i.qty);
        if (Number(upd.changes) !== 1) throw bad(`"${i.name}" just went out of stock.`);
        const img = products.json(i.images, [])[0] || '';
        db.prepare('INSERT INTO order_items (order_id, product_id, name, image, price_paise, qty, gst_rate, hsn) VALUES (?,?,?,?,?,?,?,?)').run(oid, i.product_id, i.name, img, i.price_paise, i.qty, i.gst_rate, i.hsn);
      }
      ids.push(oid);
    }
    db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(req.user.id);
    return ids;
  });

  const list = created.map((id) => orders.shape(orders.get(id)));
  for (const o of list) orders.notifySellerNewOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id));
  res.status(201).json({ orders: list });
}));

router.get('/', (req, res) => {
  res.json({ items: orders.list({ userId: req.user.id }) });
});

router.get('/:id', wrap(async (req, res) => {
  const o = ownOrder(req);
  const shop = orders.shopOf(o);
  const data = orders.shape(o);
  data.shop = { id: shop.id, name: shop.name, address: shop.address, area: shop.area, city: shop.city, pincode: shop.pincode, gst_number: shop.gst_number };
  data.seller_whatsapp_link = wa.link(
    shop.whatsapp,
    o.payment_status === 'submitted'
      ? `Hi ${shop.name}, I paid ${inr(o.total_paise)} by UPI for my ChickpetBaazar order ${o.order_no}. UPI reference (UTR): ${o.upi_txn_ref}. Please confirm.`
      : `Hi ${shop.name}, I have a question about my ChickpetBaazar order ${o.order_no}.`
  );
  data.cancellable = o.status === 'placed' && o.payment_status !== 'paid';
  res.json({ order: data });
}));

// UPI deep link + QR for this order's shop
router.get('/:id/upi', wrap(async (req, res) => {
  const o = ownOrder(req);
  if (o.payment_method !== 'UPI') throw bad('This order is cash on delivery.');
  if (o.status === 'cancelled') throw bad('This order was cancelled.');
  if (o.payment_status === 'paid') throw bad('This order is already paid.');
  res.json(await orders.upiDetails(o));
}));

// Customer says "I have paid" and gives the UPI reference (UTR)
router.post('/:id/pay', wrap(async (req, res) => {
  const o = ownOrder(req);
  if (o.payment_method !== 'UPI') throw bad('This order is cash on delivery.');
  if (o.status === 'cancelled') throw bad('This order was cancelled.');
  if (!['unpaid', 'failed'].includes(o.payment_status)) throw bad('Payment for this order is already submitted or confirmed.');
  const utr = clean(req.body.utr, 30).replace(/\s/g, '').toUpperCase();
  if (!UTR_RE.test(utr)) throw bad('Enter the UPI reference number (UTR) from your payment app. It is usually 12 digits.');
  const dup = db.prepare("SELECT 1 FROM orders WHERE upi_txn_ref = ? AND id != ? AND payment_status IN ('submitted','paid')").get(utr, o.id);
  if (dup) throw bad('This reference number was already used on another order.');
  db.prepare("UPDATE orders SET upi_txn_ref = ?, payment_status = 'submitted', updated_at = datetime('now') WHERE id = ?").run(utr, o.id);
  const fresh = orders.get(o.id);
  const sent = await orders.notifySellerPaymentSubmitted(fresh);
  res.json({ order: orders.shape(fresh), whatsapp_status: sent ? sent.status : 'link-only' });
}));

router.post('/:id/cancel', wrap(async (req, res) => {
  const o = ownOrder(req);
  if (!(o.status === 'placed' && o.payment_status !== 'paid')) {
    throw bad('This order can no longer be cancelled here. Please contact the shop on WhatsApp.');
  }
  res.json({ order: orders.shape(orders.setStatus(o.id, 'cancelled')) });
}));

module.exports = router;
