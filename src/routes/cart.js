'use strict';
const express = require('express');
const { db } = require('../db');
const auth = require('../auth');
const { bad, toInt, wrap, HttpError } = require('../util');
const products = require('../products');

const router = express.Router();
router.use(auth.requireAuth);

const MAX_QTY = 10;

// Shared with checkout: current cart rows with product + shop info
function rows(userId) {
  return db
    .prepare(
      `SELECT c.qty, p.id AS product_id, p.name, p.images, p.price_paise, p.mrp_paise, p.stock, p.active, p.gst_rate, p.hsn,
              s.id AS shop_id, s.name AS shop_name, s.status AS shop_status, s.owner_id,
              s.shipping_fee_paise, s.free_ship_above_paise
       FROM cart_items c JOIN products p ON p.id = c.product_id JOIN shops s ON s.id = p.shop_id
       WHERE c.user_id = ? ORDER BY s.id, p.id`
    )
    .all(userId);
}

function issueOf(r) {
  if (!r.active || r.shop_status !== 'approved') return 'No longer available';
  if (r.stock <= 0) return 'Out of stock';
  if (r.qty > r.stock) return `Only ${r.stock} left`;
  return '';
}

function view(userId) {
  const groups = new Map();
  let count = 0;
  for (const r of rows(userId)) {
    if (!groups.has(r.shop_id)) {
      groups.set(r.shop_id, {
        shop: { id: r.shop_id, name: r.shop_name, shipping_fee_paise: r.shipping_fee_paise, free_ship_above_paise: r.free_ship_above_paise },
        items: [], subtotal_paise: 0, shipping_paise: 0, total_paise: 0,
      });
    }
    const g = groups.get(r.shop_id);
    const images = products.json(r.images, []);
    const issue = issueOf(r);
    g.items.push({
      product_id: r.product_id, name: r.name, image: images[0] || '', qty: r.qty,
      price_paise: r.price_paise, mrp_paise: r.mrp_paise, stock: r.stock, issue,
    });
    g.subtotal_paise += r.price_paise * r.qty;
    count += r.qty;
  }
  let total = 0;
  for (const g of groups.values()) {
    const free = g.shop.free_ship_above_paise > 0 && g.subtotal_paise >= g.shop.free_ship_above_paise;
    g.shipping_paise = free ? 0 : g.shop.shipping_fee_paise;
    g.total_paise = g.subtotal_paise + g.shipping_paise;
    total += g.total_paise;
  }
  const list = [...groups.values()];
  return {
    groups: list, count, total_paise: total,
    has_issues: list.some((g) => g.items.some((i) => i.issue)),
  };
}

router.get('/', (req, res) => res.json(view(req.user.id)));

// Add to cart (adds to existing quantity)
router.post('/', wrap(async (req, res) => {
  const pid = toInt(req.body.productId, 1, 1e9);
  const qty = toInt(req.body.qty ?? 1, 1, MAX_QTY);
  if (!pid || !qty) throw bad('Choose a quantity between 1 and 10.');
  const p = db.prepare("SELECT p.id, p.stock, p.active, s.status, s.owner_id FROM products p JOIN shops s ON s.id = p.shop_id WHERE p.id = ?").get(pid);
  if (!p || !p.active || p.status !== 'approved') throw new HttpError(404, 'This product is not available.');
  if (p.owner_id === req.user.id) throw bad('You cannot buy from your own shop.');
  if (p.stock <= 0) throw bad('This product is out of stock.');
  const cur = db.prepare('SELECT qty FROM cart_items WHERE user_id = ? AND product_id = ?').get(req.user.id, pid);
  const next = Math.min((cur ? cur.qty : 0) + qty, MAX_QTY, p.stock);
  db.prepare('INSERT INTO cart_items (user_id, product_id, qty) VALUES (?,?,?) ON CONFLICT(user_id, product_id) DO UPDATE SET qty = excluded.qty').run(req.user.id, pid, next);
  res.status(201).json(view(req.user.id));
}));

// Set exact quantity (0 removes)
router.put('/:productId', wrap(async (req, res) => {
  const pid = toInt(req.params.productId, 1, 1e9);
  const qty = toInt(req.body.qty, 0, MAX_QTY);
  if (!pid || qty === null) throw bad('Choose a quantity between 1 and 10.');
  if (qty === 0) {
    db.prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?').run(req.user.id, pid);
  } else {
    const p = db.prepare('SELECT stock FROM products WHERE id = ?').get(pid);
    if (!p) throw new HttpError(404, 'This product is not available.');
    db.prepare('UPDATE cart_items SET qty = ? WHERE user_id = ? AND product_id = ?').run(Math.min(qty, Math.max(p.stock, 1)), req.user.id, pid);
  }
  res.json(view(req.user.id));
}));

router.delete('/:productId', wrap(async (req, res) => {
  const pid = toInt(req.params.productId, 1, 1e9);
  db.prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?').run(req.user.id, pid || 0);
  res.json(view(req.user.id));
}));

module.exports = router;
module.exports.rows = rows;
module.exports.issueOf = issueOf;
