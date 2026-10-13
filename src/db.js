'use strict';
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const cfg = require('./config');

const db = new DatabaseSync(process.env.DB_FILE || path.join(cfg.DATA_DIR, 'chickpetbaazar.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('customer','seller','admin')),
  active        INTEGER NOT NULL DEFAULT 1,
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shops (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id            INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  address             TEXT NOT NULL,
  area                TEXT NOT NULL DEFAULT 'Chickpet',
  city                TEXT NOT NULL DEFAULT 'Bengaluru',
  pincode             TEXT NOT NULL DEFAULT '560053',
  gst_number          TEXT NOT NULL DEFAULT '',
  upi_id              TEXT NOT NULL,
  whatsapp            TEXT NOT NULL,
  logo                TEXT NOT NULL DEFAULT '',
  shipping_fee_paise  INTEGER NOT NULL DEFAULT 0,
  free_ship_above_paise INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','suspended')),
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id         INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL,
  category        TEXT NOT NULL,
  brand           TEXT NOT NULL DEFAULT '',
  sku             TEXT NOT NULL DEFAULT '',
  hsn             TEXT NOT NULL DEFAULT '',
  price_paise     INTEGER NOT NULL CHECK (price_paise > 0),
  mrp_paise       INTEGER NOT NULL CHECK (mrp_paise > 0),
  gst_rate        INTEGER NOT NULL DEFAULT 5,
  stock           INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  warranty        TEXT NOT NULL DEFAULT '',
  returnable_days INTEGER NOT NULL DEFAULT 0,
  highlights      TEXT NOT NULL DEFAULT '[]',
  specs           TEXT NOT NULL DEFAULT '[]',
  images          TEXT NOT NULL DEFAULT '[]',
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_shop ON products(shop_id);
CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category);

CREATE TABLE IF NOT EXISTS reviews (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title      TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (product_id, user_id)
);

CREATE TABLE IF NOT EXISTS cart_items (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty        INTEGER NOT NULL CHECK (qty > 0),
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no       TEXT NOT NULL UNIQUE,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_id        INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  subtotal_paise INTEGER NOT NULL,
  shipping_paise INTEGER NOT NULL DEFAULT 0,
  total_paise    INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'placed',
  payment_method TEXT NOT NULL CHECK (payment_method IN ('UPI','COD')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','submitted','paid','failed','cod')),
  upi_txn_ref    TEXT NOT NULL DEFAULT '',
  ship_name      TEXT NOT NULL,
  ship_phone     TEXT NOT NULL,
  ship_address   TEXT NOT NULL,
  ship_city      TEXT NOT NULL,
  ship_pincode   TEXT NOT NULL,
  note           TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_shop ON orders(shop_id);

CREATE TABLE IF NOT EXISTS order_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  image       TEXT NOT NULL DEFAULT '',
  price_paise INTEGER NOT NULL,
  qty         INTEGER NOT NULL,
  gst_rate    INTEGER NOT NULL DEFAULT 0,
  hsn         TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS whatsapp_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER,
  to_number  TEXT NOT NULL,
  message    TEXT NOT NULL,
  status     TEXT NOT NULL,
  error      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// BEGIN IMMEDIATE ... COMMIT, rolled back on any error
function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    throw e;
  }
}

function ensureAdmin() {
  const has = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (has) return;
  let pw = cfg.ADMIN_PASSWORD;
  let generated = false;
  if (!pw) {
    pw = cfg.isProd ? crypto.randomBytes(9).toString('base64url') : 'Admin@12345';
    generated = true;
  }
  db.prepare(
    "INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, 'admin')"
  ).run('ChickpetBaazar Admin', cfg.ADMIN_EMAIL, '919999999999', bcrypt.hashSync(pw, 10));
  console.log('\n=== Admin account created ===');
  console.log('Email   :', cfg.ADMIN_EMAIL);
  if (generated) console.log('Password:', pw, cfg.isProd ? '(shown once - save it now)' : '(default for development - change it!)');
  else console.log('Password: taken from ADMIN_PASSWORD');
  console.log('=============================\n');
}

module.exports = { db, tx, ensureAdmin };
