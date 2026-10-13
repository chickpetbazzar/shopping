'use strict';
const cfg = require('./config');
const { db } = require('./db');
const { bad, clean, toPaise, normPhone, GSTIN_RE, UPI_RE, PIN_RE, HttpError } = require('./util');
const { removeImages } = require('./uploads');

// Full shop (private: includes UPI, GSTIN, WhatsApp) - only for owner/admin
function shapePrivate(s) {
  if (!s) return s;
  return {
    id: s.id, owner_id: s.owner_id, name: s.name, description: s.description,
    address: s.address, area: s.area, city: s.city, pincode: s.pincode,
    gst_number: s.gst_number, upi_id: s.upi_id, whatsapp: s.whatsapp, logo: s.logo,
    shipping_fee_paise: s.shipping_fee_paise, free_ship_above_paise: s.free_ship_above_paise,
    status: s.status, created_at: s.created_at,
    owner_name: s.owner_name, owner_email: s.owner_email,
  };
}

// What customers may see
function shapePublic(s) {
  return {
    id: s.id, name: s.name, description: s.description, area: s.area, city: s.city,
    logo: s.logo, gst_registered: !!s.gst_number,
    shipping_fee_paise: s.shipping_fee_paise, free_ship_above_paise: s.free_ship_above_paise,
    product_count: s.product_count,
  };
}

function validate(body) {
  const name = clean(body.name, 80);
  if (name.length < 2) throw bad('Shop name is required.');
  const address = clean(body.address, 250);
  if (address.length < 5) throw bad('Enter the shop address (street, building / market lane).');
  const pincode = clean(body.pincode || '560053', 6);
  if (!PIN_RE.test(pincode)) throw bad('Enter a valid 6-digit pincode.');

  const gst = clean(body.gst_number, 15).toUpperCase();
  if (gst && !GSTIN_RE.test(gst)) throw bad('That GST number looks wrong. A GSTIN has 15 characters, for example 29ABCDE1234F1Z5.');

  const upi = clean(body.upi_id, 100).toLowerCase();
  if (!UPI_RE.test(upi)) throw bad('Enter a valid UPI ID, for example shopname@okicici.');

  const wa = normPhone(body.whatsapp);
  if (!wa) throw bad('Enter a valid 10-digit WhatsApp number.');

  let ship = body.shipping_fee === undefined || body.shipping_fee === '' ? 0 : toPaise(body.shipping_fee);
  let free = body.free_ship_above === undefined || body.free_ship_above === '' ? 0 : toPaise(body.free_ship_above);
  if (ship === null || free === null) throw bad('Delivery charges must be amounts in rupees.');
  if (ship > 500000) throw bad('Delivery charge is too high.');

  return {
    name,
    description: clean(body.description, 1000),
    address,
    area: clean(body.area || 'Chickpet', 60) || 'Chickpet',
    city: clean(body.city || 'Bengaluru', 60) || 'Bengaluru',
    pincode,
    gst_number: gst,
    upi_id: upi,
    whatsapp: wa,
    shipping_fee_paise: ship,
    free_ship_above_paise: free,
  };
}

const BY_ID = `SELECT s.*, u.name AS owner_name, u.email AS owner_email FROM shops s JOIN users u ON u.id = s.owner_id WHERE s.id = ?`;
const getById = (id) => db.prepare(BY_ID).get(id);
const getByOwner = (uid) => {
  const r = db.prepare('SELECT id FROM shops WHERE owner_id = ?').get(uid);
  return r ? getById(r.id) : null;
};

function insert(ownerId, f, status, logo = '') {
  const r = db
    .prepare(
      `INSERT INTO shops (owner_id, name, description, address, area, city, pincode, gst_number, upi_id, whatsapp, logo, shipping_fee_paise, free_ship_above_paise, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(ownerId, f.name, f.description, f.address, f.area, f.city, f.pincode, f.gst_number, f.upi_id, f.whatsapp, logo, f.shipping_fee_paise, f.free_ship_above_paise, status);
  return getById(Number(r.lastInsertRowid));
}

function update(id, f, logo) {
  db.prepare(
    `UPDATE shops SET name=?, description=?, address=?, area=?, city=?, pincode=?, gst_number=?, upi_id=?, whatsapp=?, logo=COALESCE(?, logo), shipping_fee_paise=?, free_ship_above_paise=? WHERE id=?`
  ).run(f.name, f.description, f.address, f.area, f.city, f.pincode, f.gst_number, f.upi_id, f.whatsapp, logo || null, f.shipping_fee_paise, f.free_ship_above_paise, id);
  return getById(id);
}

// Deleting a shop removes its products, orders and reviews (cascade) and their image files
function remove(id) {
  const s = db.prepare('SELECT logo FROM shops WHERE id = ?').get(id);
  if (!s) throw new HttpError(404, 'Shop not found.');
  const imgs = db.prepare('SELECT images FROM products WHERE shop_id = ?').all(id);
  db.prepare('DELETE FROM shops WHERE id = ?').run(id);
  removeImages([s.logo]);
  for (const r of imgs) {
    try { removeImages(JSON.parse(r.images)); } catch {}
  }
}

module.exports = { shapePrivate, shapePublic, validate, getById, getByOwner, insert, update, remove };
