'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const cfg = require('../config');
const { db, tx } = require('../db');
const auth = require('../auth');
const shops = require('../shops');
const products = require('../products');
const orders = require('../orders');
const { saveImage, removeImages, productImages, shopLogo } = require('../uploads');
const { bad, clean, normPhone, toInt, EMAIL_RE, likeEscape, wrap, HttpError } = require('../util');

const router = express.Router();
router.use(auth.requireRole('admin'));

const id = (req, name = 'id') => {
  const v = toInt(req.params[name], 1, 1e9);
  if (!v) throw new HttpError(404, 'Not found.');
  return v;
};

// ---- dashboard --------------------------------------------------------------
const PAID = "(payment_status = 'paid' AND status != 'cancelled')";

router.get('/stats', (_req, res) => {
  const n = (sql, ...p) => db.prepare(sql).get(...p).n;
  res.json({
    customers: n("SELECT COUNT(*) AS n FROM users WHERE role = 'customer'"),
    sellers: n("SELECT COUNT(*) AS n FROM users WHERE role = 'seller'"),
    shops: n('SELECT COUNT(*) AS n FROM shops'),
    shops_pending: n("SELECT COUNT(*) AS n FROM shops WHERE status = 'pending'"),
    products: n('SELECT COUNT(*) AS n FROM products'),
    orders: n('SELECT COUNT(*) AS n FROM orders'),
    payments_to_verify: n("SELECT COUNT(*) AS n FROM orders WHERE payment_status = 'submitted' AND status != 'cancelled'"),
    revenue_paise: db.prepare(`SELECT COALESCE(SUM(total_paise),0) AS n FROM orders WHERE ${PAID}`).get().n,
    by_day: db
      .prepare(`SELECT date(created_at) AS d, SUM(total_paise) AS v, COUNT(*) AS n FROM orders WHERE ${PAID} AND created_at >= date('now','-13 days') GROUP BY d ORDER BY d`)
      .all(),
  });
});

// ---- shops ------------------------------------------------------------------
router.get('/shops', (req, res) => {
  const where = [];
  const p = [];
  if (['pending', 'approved', 'suspended'].includes(req.query.status)) { where.push('s.status = ?'); p.push(req.query.status); }
  const q = clean(req.query.q, 60);
  if (q) { where.push("(s.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')"); p.push('%' + likeEscape(q) + '%', '%' + likeEscape(q) + '%'); }
  const rows = db
    .prepare(
      `SELECT s.*, u.name AS owner_name, u.email AS owner_email,
        (SELECT COUNT(*) FROM products WHERE shop_id = s.id) AS product_count,
        (SELECT COUNT(*) FROM orders WHERE shop_id = s.id) AS order_count
       FROM shops s JOIN users u ON u.id = s.owner_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY s.id DESC`
    )
    .all(...p);
  res.json({ items: rows.map((s) => ({ ...shops.shapePrivate(s), product_count: s.product_count, order_count: s.order_count })) });
});

// Add a shop (+ its owner account if it does not exist yet)
router.post('/shops', shopLogo, wrap(async (req, res) => {
  const f = shops.validate(req.body);
  const email = clean(req.body.owner_email, 120).toLowerCase();
  if (!EMAIL_RE.test(email)) throw bad('Enter the shop owner\'s email address.');
  const status = ['pending', 'approved', 'suspended'].includes(req.body.status) ? req.body.status : 'approved';

  let owner = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (owner) {
    if (owner.role !== 'seller') throw bad('That email belongs to a non-seller account.');
    if (shops.getByOwner(owner.id)) throw bad('That seller already has a shop.');
  } else {
    const ownerName = clean(req.body.owner_name, 60);
    const ownerPhone = normPhone(req.body.owner_phone || req.body.whatsapp);
    const pw = String(req.body.owner_password || '');
    if (ownerName.length < 2) throw bad('Enter the owner\'s name.');
    if (!ownerPhone) throw bad('Enter a valid owner mobile number.');
    if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw bad('Owner password needs 8+ characters with a letter and a number.');
    const r = db.prepare("INSERT INTO users (name, email, phone, password_hash, role) VALUES (?,?,?,?, 'seller')").run(ownerName, email, ownerPhone, await bcrypt.hash(pw, 10));
    owner = { id: Number(r.lastInsertRowid) };
  }
  const logo = req.file ? saveImage(req.file) : '';
  res.status(201).json({ shop: shops.shapePrivate(shops.insert(owner.id, f, status, logo)) });
}));

router.put('/shops/:id', shopLogo, wrap(async (req, res) => {
  const sid = id(req);
  const cur = shops.getById(sid);
  if (!cur) throw new HttpError(404, 'Shop not found.');
  const f = shops.validate(req.body);
  const logo = req.file ? saveImage(req.file) : null;
  let s = shops.update(sid, f, logo);
  if (logo) removeImages([cur.logo]);
  if (['pending', 'approved', 'suspended'].includes(req.body.status)) {
    db.prepare('UPDATE shops SET status = ? WHERE id = ?').run(req.body.status, sid);
    s = shops.getById(sid);
  }
  res.json({ shop: shops.shapePrivate(s) });
}));

router.post('/shops/:id/status', wrap(async (req, res) => {
  const sid = id(req);
  if (!['pending', 'approved', 'suspended'].includes(req.body.status)) throw bad('Unknown status.');
  if (!shops.getById(sid)) throw new HttpError(404, 'Shop not found.');
  db.prepare('UPDATE shops SET status = ? WHERE id = ?').run(req.body.status, sid);
  res.json({ shop: shops.shapePrivate(shops.getById(sid)) });
}));

router.delete('/shops/:id', wrap(async (req, res) => {
  shops.remove(id(req));
  res.json({ ok: true });
}));

// ---- products ---------------------------------------------------------------
router.get('/products', (req, res) => {
  const active = req.query.active === '1' ? true : req.query.active === '0' ? false : undefined;
  res.json(
    products.query({
      q: req.query.q, category: req.query.category, active,
      shopId: toInt(req.query.shop, 1, 1e9) || undefined,
      page: req.query.page, limit: 50, sort: 'newest',
    })
  );
});

router.post('/products', productImages, wrap(async (req, res) => {
  const sid = toInt(req.body.shop_id, 1, 1e9);
  if (!sid || !shops.getById(sid)) throw bad('Choose the shop this product belongs to.');
  res.status(201).json({ product: products.create(sid, req.body, req.files) });
}));

router.put('/products/:id', productImages, wrap(async (req, res) => {
  res.json({ product: products.update(id(req), req.body, req.files) });
}));

router.post('/products/:id/active', wrap(async (req, res) => {
  const pid = id(req);
  if (!products.get(pid)) throw new HttpError(404, 'Product not found.');
  db.prepare('UPDATE products SET active = ? WHERE id = ?').run(req.body.active ? 1 : 0, pid);
  res.json({ product: products.get(pid) });
}));

router.delete('/products/:id', wrap(async (req, res) => {
  products.remove(id(req));
  res.json({ ok: true });
}));

// ---- users ------------------------------------------------------------------
router.get('/users', (req, res) => {
  const q = clean(req.query.q, 60);
  const role = ['customer', 'seller', 'admin'].includes(req.query.role) ? req.query.role : '';
  const where = [];
  const p = [];
  if (role) { where.push('role = ?'); p.push(role); }
  if (q) { where.push("(name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\')"); const l = '%' + likeEscape(q) + '%'; p.push(l, l, l); }
  const rows = db
    .prepare(`SELECT id, name, email, phone, role, active, created_at FROM users ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 300`)
    .all(...p);
  res.json({ items: rows.map((u) => ({ ...u, active: !!u.active })) });
});

router.put('/users/:id', wrap(async (req, res) => {
  const uid = id(req);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
  if (!u) throw new HttpError(404, 'User not found.');
  if (u.id === req.user.id && req.body.active === false) throw bad('You cannot disable your own account.');
  const name = req.body.name !== undefined ? clean(req.body.name, 60) : u.name;
  const phone = req.body.phone !== undefined ? normPhone(req.body.phone) : u.phone;
  if (name.length < 2) throw bad('Enter a name.');
  if (!phone) throw bad('Enter a valid 10-digit mobile number.');
  const active = req.body.active === undefined ? u.active : req.body.active ? 1 : 0;
  db.prepare('UPDATE users SET name = ?, phone = ?, active = ?, token_version = token_version + ? WHERE id = ?').run(name, phone, active, active === 0 ? 1 : 0, uid);
  res.json({ ok: true });
}));

router.post('/users/:id/password', wrap(async (req, res) => {
  const uid = id(req);
  const pw = String(req.body.password || '');
  if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw bad('Password needs 8+ characters with a letter and a number.');
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(uid)) throw new HttpError(404, 'User not found.');
  db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?').run(await bcrypt.hash(pw, 10), uid);
  res.json({ ok: true });
}));

router.delete('/users/:id', wrap(async (req, res) => {
  const uid = id(req);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
  if (!u) throw new HttpError(404, 'User not found.');
  if (u.role === 'admin') throw bad('Admin accounts cannot be deleted here.');
  const s = shops.getByOwner(uid);
  if (s) shops.remove(s.id); // also clears the shop's products/orders and image files
  db.prepare('DELETE FROM users WHERE id = ?').run(uid);
  res.json({ ok: true });
}));

// ---- orders -----------------------------------------------------------------
router.get('/orders', (req, res) => {
  const status = cfg.ORDER_STATUSES.includes(req.query.status) ? req.query.status : undefined;
  const payment = ['unpaid', 'submitted', 'paid', 'failed', 'cod'].includes(req.query.payment) ? req.query.payment : undefined;
  res.json({ items: orders.list({ status, payment, limit: 200 }) });
});

router.post('/orders/:id/status', wrap(async (req, res) => {
  const oid = id(req);
  if (!orders.get(oid)) throw new HttpError(404, 'Order not found.');
  if (!cfg.ORDER_STATUSES.includes(req.body.status)) throw bad('Unknown status.');
  res.json({ order: orders.shape(orders.setStatus(oid, req.body.status, { force: true })) });
}));

router.post('/orders/:id/payment', wrap(async (req, res) => {
  const oid = id(req);
  res.json({ order: orders.shape(orders.decidePayment(oid, String(req.body.action || ''))) });
}));

router.delete('/orders/:id', wrap(async (req, res) => {
  const oid = id(req);
  tx(() => {
    const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(oid);
    if (!o) throw new HttpError(404, 'Order not found.');
    if (!['cancelled', 'delivered'].includes(o.status)) {
      for (const i of db.prepare('SELECT product_id, qty FROM order_items WHERE order_id = ?').all(oid)) {
        if (i.product_id) db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(i.qty, i.product_id);
      }
    }
    db.prepare('DELETE FROM orders WHERE id = ?').run(oid);
  });
  res.json({ ok: true });
}));

// ---- reviews & logs ---------------------------------------------------------
router.get('/reviews', (_req, res) => {
  res.json({
    items: db
      .prepare('SELECT r.id, r.rating, r.title, r.body, r.created_at, u.name AS user_name, p.name AS product_name FROM reviews r JOIN users u ON u.id = r.user_id JOIN products p ON p.id = r.product_id ORDER BY r.id DESC LIMIT 200')
      .all(),
  });
});

router.delete('/reviews/:id', wrap(async (req, res) => {
  db.prepare('DELETE FROM reviews WHERE id = ?').run(id(req));
  res.json({ ok: true });
}));

router.get('/whatsapp', (_req, res) => {
  const rows = db.prepare('SELECT * FROM whatsapp_log ORDER BY id DESC LIMIT 200').all();
  res.json({ items: rows, automatic: require('../whatsapp').enabled() });
});

module.exports = router;
