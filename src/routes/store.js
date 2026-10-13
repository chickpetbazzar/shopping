'use strict';
// Public storefront: meta, products, shops, reviews
const express = require('express');
const cfg = require('../config');
const { db } = require('../db');
const auth = require('../auth');
const wa = require('../whatsapp');
const products = require('../products');
const shops = require('../shops');
const { bad, clean, toInt, wrap, HttpError } = require('../util');

const router = express.Router();

router.get('/meta', (_req, res) => {
  res.json({
    categories: cfg.CATEGORIES,
    gstRates: cfg.GST_RATES,
    maxImages: cfg.MAX_IMAGES,
    whatsappAuto: wa.enabled(),
  });
});

router.get('/products', (req, res) => {
  res.json(products.query({ ...req.query, publicOnly: true }));
});

router.get('/products/:id', wrap(async (req, res) => {
  const id = toInt(req.params.id, 1, 1e9);
  const p = id && products.get(id);
  const shop = p && db.prepare('SELECT s.*, (SELECT COUNT(*) FROM products WHERE shop_id = s.id AND active = 1) AS product_count FROM shops s WHERE s.id = ?').get(p.shop_id);
  if (!p || !shop) throw new HttpError(404, 'This product is not available.');
  // the shop owner and admins may preview hidden products (inactive or awaiting approval)
  const privileged = req.user && (req.user.role === 'admin' || req.user.id === shop.owner_id);
  if (!privileged && (!p.active || shop.status !== 'approved')) throw new HttpError(404, 'This product is not available.');

  const reviews = db
    .prepare('SELECT r.id, r.rating, r.title, r.body, r.created_at, u.name FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.product_id = ? ORDER BY r.id DESC LIMIT 30')
    .all(id)
    .map((r) => ({ ...r, name: r.name.split(' ')[0] + (r.name.split(' ')[1] ? ' ' + r.name.split(' ')[1][0] + '.' : '') }));
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const d of db.prepare('SELECT rating, COUNT(*) AS n FROM reviews WHERE product_id = ? GROUP BY rating').all(id)) dist[d.rating] = d.n;
  const more = products.query({ publicOnly: true, shopId: p.shop_id, limit: 7 }).items.filter((x) => x.id !== id).slice(0, 6);

  let can_review = false;
  if (req.user) {
    can_review = !!db.prepare("SELECT 1 FROM orders o JOIN order_items i ON i.order_id = o.id WHERE o.user_id = ? AND i.product_id = ? AND o.status != 'cancelled' LIMIT 1").get(req.user.id, id);
  }
  res.json({ product: p, shop: shops.shapePublic(shop), reviews, distribution: dist, more, can_review });
}));

router.post('/products/:id/reviews', auth.requireAuth, wrap(async (req, res) => {
  const id = toInt(req.params.id, 1, 1e9);
  if (!id || !products.get(id)) throw new HttpError(404, 'Product not found.');
  const bought = db.prepare("SELECT 1 FROM orders o JOIN order_items i ON i.order_id = o.id WHERE o.user_id = ? AND i.product_id = ? AND o.status != 'cancelled' LIMIT 1").get(req.user.id, id);
  if (!bought) throw new HttpError(403, 'You can review a product after you have ordered it.');
  const rating = toInt(req.body.rating, 1, 5);
  if (!rating) throw bad('Choose a rating from 1 to 5 stars.');
  db.prepare(
    `INSERT INTO reviews (product_id, user_id, rating, title, body) VALUES (?,?,?,?,?)
     ON CONFLICT(product_id, user_id) DO UPDATE SET rating = excluded.rating, title = excluded.title, body = excluded.body, created_at = datetime('now')`
  ).run(id, req.user.id, rating, clean(req.body.title, 100), clean(req.body.body, 2000));
  res.status(201).json({ ok: true });
}));

router.get('/shops', (_req, res) => {
  const rows = db
    .prepare("SELECT s.*, (SELECT COUNT(*) FROM products WHERE shop_id = s.id AND active = 1) AS product_count FROM shops s WHERE s.status = 'approved' ORDER BY product_count DESC, s.id DESC")
    .all();
  res.json({ items: rows.map(shops.shapePublic) });
});

router.get('/shops/:id', wrap(async (req, res) => {
  const id = toInt(req.params.id, 1, 1e9);
  const s = id && db.prepare("SELECT s.*, (SELECT COUNT(*) FROM products WHERE shop_id = s.id AND active = 1) AS product_count FROM shops s WHERE s.id = ? AND s.status = 'approved'").get(id);
  if (!s) throw new HttpError(404, 'Shop not found.');
  res.json({ shop: shops.shapePublic(s) });
}));

module.exports = router;
