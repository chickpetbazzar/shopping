'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const cfg = require('../config');
const { db } = require('../db');
const auth = require('../auth');
const shops = require('../shops');
const products = require('../products');
const orders = require('../orders');
const { saveImage, removeImages, productImages, shopLogo } = require('../uploads');
const { bad, toInt, wrap, HttpError } = require('../util');

const router = express.Router();
router.use(auth.requireRole('seller'));

// ---- shop -------------------------------------------------------------------
router.get('/shop', (req, res) => {
  const s = shops.getByOwner(req.user.id);
  res.json({ shop: s ? shops.shapePrivate(s) : null });
});

router.post('/shop', shopLogo, wrap(async (req, res) => {
  if (shops.getByOwner(req.user.id)) throw new HttpError(409, 'You already have a shop. Edit it instead.');
  const f = shops.validate(req.body);
  const logo = req.file ? saveImage(req.file) : '';
  const s = shops.insert(req.user.id, f, cfg.AUTO_APPROVE_SHOPS ? 'approved' : 'pending', logo);
  res.status(201).json({ shop: shops.shapePrivate(s) });
}));

router.put('/shop', shopLogo, wrap(async (req, res) => {
  const cur = shops.getByOwner(req.user.id);
  if (!cur) throw new HttpError(404, 'Create your shop first.');
  const f = shops.validate(req.body);
  // Changing where money goes needs the password again
  if (f.upi_id !== cur.upi_id) {
    const u = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!(await bcrypt.compare(String(req.body.password || ''), u.password_hash))) {
      throw bad('Enter your account password to change the UPI ID.');
    }
  }
  const logo = req.file ? saveImage(req.file) : null;
  const s = shops.update(cur.id, f, logo);
  if (logo) removeImages([cur.logo]);
  res.json({ shop: shops.shapePrivate(s) });
}));

// everything below needs a shop
router.use((req, res, next) => {
  const s = shops.getByOwner(req.user.id);
  if (!s) return res.status(409).json({ error: 'Create your shop first.' });
  req.shop = s;
  next();
});

// ---- products ---------------------------------------------------------------
function ownProduct(req) {
  const id = toInt(req.params.id, 1, 1e9);
  const p = id && products.get(id);
  if (!p || p.shop_id !== req.shop.id) throw new HttpError(404, 'Product not found.');
  return p;
}

router.get('/products', (req, res) => {
  res.json(products.query({ q: req.query.q, shopId: req.shop.id, limit: 100, page: req.query.page, sort: 'newest' }));
});

router.post('/products', productImages, wrap(async (req, res) => {
  res.status(201).json({ product: products.create(req.shop.id, req.body, req.files) });
}));

router.put('/products/:id', productImages, wrap(async (req, res) => {
  const p = ownProduct(req);
  res.json({ product: products.update(p.id, req.body, req.files) });
}));

router.delete('/products/:id', wrap(async (req, res) => {
  const p = ownProduct(req);
  products.remove(p.id);
  res.json({ ok: true });
}));

// ---- orders -----------------------------------------------------------------
function ownOrder(req) {
  const id = toInt(req.params.id, 1, 1e9);
  const o = id && orders.get(id);
  if (!o || o.shop_id !== req.shop.id) throw new HttpError(404, 'Order not found.');
  return o;
}

router.get('/orders', (req, res) => {
  const status = cfg.ORDER_STATUSES.includes(req.query.status) ? req.query.status : undefined;
  const payment = ['unpaid', 'submitted', 'paid', 'failed', 'cod'].includes(req.query.payment) ? req.query.payment : undefined;
  res.json({ items: orders.list({ shopId: req.shop.id, status, payment }) });
});

router.post('/orders/:id/status', wrap(async (req, res) => {
  const o = ownOrder(req);
  const next = String(req.body.status || '');
  if (!cfg.ORDER_STATUSES.includes(next)) throw bad('Unknown status.');
  res.json({ order: orders.shape(orders.setStatus(o.id, next)) });
}));

router.post('/orders/:id/payment', wrap(async (req, res) => {
  const o = ownOrder(req);
  res.json({ order: orders.shape(orders.decidePayment(o.id, String(req.body.action || ''))) });
}));

// ---- stats ------------------------------------------------------------------
const PAID = "(payment_status = 'paid' AND status != 'cancelled')";

router.get('/stats', (req, res) => {
  const sid = req.shop.id;
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const revenue = one(`SELECT COALESCE(SUM(total_paise),0) AS v FROM orders WHERE shop_id = ? AND ${PAID}`, sid).v;
  const byDay = db
    .prepare(`SELECT date(created_at) AS d, SUM(total_paise) AS v, COUNT(*) AS n FROM orders WHERE shop_id = ? AND ${PAID} AND created_at >= date('now','-13 days') GROUP BY d ORDER BY d`)
    .all(sid);
  res.json({
    products: one('SELECT COUNT(*) AS n FROM products WHERE shop_id = ?', sid).n,
    low_stock: one('SELECT COUNT(*) AS n FROM products WHERE shop_id = ? AND active = 1 AND stock <= 3', sid).n,
    orders_total: one('SELECT COUNT(*) AS n FROM orders WHERE shop_id = ?', sid).n,
    orders_new: one("SELECT COUNT(*) AS n FROM orders WHERE shop_id = ? AND status IN ('placed','confirmed','packed')", sid).n,
    payments_to_verify: one("SELECT COUNT(*) AS n FROM orders WHERE shop_id = ? AND payment_status = 'submitted' AND status != 'cancelled'", sid).n,
    revenue_paise: revenue,
    by_day: byDay,
  });
});

module.exports = router;
