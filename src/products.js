'use strict';
const cfg = require('./config');
const { db } = require('./db');
const { bad, clean, toPaise, toInt, likeEscape, HttpError } = require('./util');
const { saveImage, removeImages } = require('./uploads');

const json = (s, d) => {
  try { return JSON.parse(s); } catch { return d; }
};

// Row -> API object
function shape(r) {
  if (!r) return r;
  const images = json(r.images, []);
  return {
    id: r.id,
    shop_id: r.shop_id,
    shop_name: r.shop_name,
    shop_area: r.shop_area,
    name: r.name,
    description: r.description,
    category: r.category,
    brand: r.brand,
    sku: r.sku,
    hsn: r.hsn,
    price_paise: r.price_paise,
    mrp_paise: r.mrp_paise,
    discount_pct: r.mrp_paise > r.price_paise ? Math.round(((r.mrp_paise - r.price_paise) / r.mrp_paise) * 100) : 0,
    gst_rate: r.gst_rate,
    stock: r.stock,
    warranty: r.warranty,
    returnable_days: r.returnable_days,
    highlights: json(r.highlights, []),
    specs: json(r.specs, []),
    images,
    image: images[0] || '',
    active: !!r.active,
    rating: r.rating ? Math.round(r.rating * 10) / 10 : 0,
    rating_count: r.rating_count || 0,
    created_at: r.created_at,
  };
}

const SELECT = `
  SELECT p.*, s.name AS shop_name, s.area AS shop_area,
    (SELECT AVG(rating) FROM reviews r WHERE r.product_id = p.id) AS rating,
    (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) AS rating_count
  FROM products p JOIN shops s ON s.id = p.shop_id`;

const SORTS = {
  newest: 'p.id DESC',
  price_asc: 'p.price_paise ASC',
  price_desc: 'p.price_paise DESC',
  rating: 'COALESCE(rating, 0) DESC, rating_count DESC',
  discount: '(p.mrp_paise - p.price_paise) * 1.0 / p.mrp_paise DESC',
};

function query(o = {}) {
  const where = [];
  const params = [];
  if (o.publicOnly) where.push("p.active = 1 AND s.status = 'approved'");
  if (o.shopId) { where.push('p.shop_id = ?'); params.push(o.shopId); }
  if (o.category) { where.push('p.category = ?'); params.push(String(o.category)); }
  if (o.active !== undefined && o.active !== '') { where.push('p.active = ?'); params.push(o.active ? 1 : 0); }
  const min = toPaise(o.min);
  const max = toPaise(o.max);
  if (min !== null) { where.push('p.price_paise >= ?'); params.push(min); }
  if (max !== null) { where.push('p.price_paise <= ?'); params.push(max); }
  const minRating = Number(o.rating);
  if (minRating >= 1 && minRating <= 5) {
    where.push('(SELECT AVG(rating) FROM reviews r WHERE r.product_id = p.id) >= ?');
    params.push(minRating);
  }
  const tokens = clean(o.q, 100).split(/\s+/).filter(Boolean).slice(0, 5);
  for (const t of tokens) {
    const like = '%' + likeEscape(t) + '%';
    where.push(
      "(p.name LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\' OR p.brand LIKE ? ESCAPE '\\' OR p.category LIKE ? ESCAPE '\\' OR p.specs LIKE ? ESCAPE '\\')"
    );
    params.push(like, like, like, like, like);
  }
  const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const limit = Math.min(Math.max(parseInt(o.limit, 10) || 24, 1), 100);
  const page = Math.max(parseInt(o.page, 10) || 1, 1);
  const order = SORTS[o.sort] || SORTS.newest;

  const total = db.prepare(`SELECT COUNT(*) AS n FROM products p JOIN shops s ON s.id = p.shop_id${w}`).get(...params).n;
  const rows = db.prepare(`${SELECT}${w} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params, limit, (page - 1) * limit);
  return { items: rows.map(shape), total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

function get(id) {
  return shape(db.prepare(`${SELECT} WHERE p.id = ?`).get(id));
}

// Validate and normalise form fields (multipart or JSON)
function fields(body) {
  const name = clean(body.name, 120);
  if (name.length < 3) throw bad('Product name must be at least 3 characters.');
  const description = clean(body.description, 4000);
  if (description.length < 10) throw bad('Please add a description (at least 10 characters).');
  const category = clean(body.category, 60);
  if (!cfg.CATEGORIES.includes(category)) throw bad('Please choose a category.');

  const price = toPaise(body.price);
  if (price === null || price <= 0 || price > 10000000 * 100) throw bad('Enter a valid selling price in rupees.');
  let mrp = body.mrp === undefined || body.mrp === '' ? price : toPaise(body.mrp);
  if (mrp === null) throw bad('Enter a valid MRP in rupees.');
  if (mrp < price) throw bad('MRP cannot be lower than the selling price.');

  const stock = toInt(body.stock, 0, 1000000);
  if (stock === null) throw bad('Stock must be a whole number (0 or more).');
  const gst = toInt(body.gst_rate, 0, 28);
  if (gst === null || !cfg.GST_RATES.includes(gst)) throw bad('Choose a valid GST rate.');
  const returnable = body.returnable_days === undefined || body.returnable_days === '' ? 0 : toInt(body.returnable_days, 0, 60);
  if (returnable === null) throw bad('Return window must be between 0 and 60 days.');
  const hsn = clean(body.hsn, 8);
  if (hsn && !/^\d{4,8}$/.test(hsn)) throw bad('HSN code must be 4 to 8 digits.');

  const highlights = String(body.highlights || '')
    .split('\n')
    .map((l) => clean(l, 160))
    .filter(Boolean)
    .slice(0, 8);

  let specsIn = body.specs;
  if (typeof specsIn === 'string') specsIn = json(specsIn, []);
  if (!Array.isArray(specsIn)) specsIn = [];
  const specs = specsIn
    .map((s) => ({ k: clean(s && s.k, 40), v: clean(s && s.v, 120) }))
    .filter((s) => s.k && s.v)
    .slice(0, 12);

  return {
    name, description, category,
    brand: clean(body.brand, 60),
    sku: clean(body.sku, 40),
    hsn,
    price_paise: price,
    mrp_paise: mrp,
    gst_rate: gst,
    stock,
    warranty: clean(body.warranty, 200),
    returnable_days: returnable,
    highlights: JSON.stringify(highlights),
    specs: JSON.stringify(specs),
    active: body.active === undefined ? 1 : body.active === true || body.active === 'true' || body.active === '1' || body.active === 1 ? 1 : 0,
  };
}

function buildImages(existing, body, files) {
  let keep = existing;
  if (body.keep_images !== undefined) {
    const wanted = json(body.keep_images, []);
    keep = existing.filter((p) => Array.isArray(wanted) && wanted.includes(p));
  }
  if (keep.length + (files || []).length > cfg.MAX_IMAGES) throw bad(`You can add up to ${cfg.MAX_IMAGES} photos per product.`);
  const added = (files || []).map(saveImage);
  return { images: [...keep, ...added], removed: existing.filter((p) => !keep.includes(p)) };
}

function create(shopId, body, files) {
  const f = fields(body);
  const { images } = buildImages([], body, files);
  const r = db
    .prepare(
      `INSERT INTO products (shop_id, name, description, category, brand, sku, hsn, price_paise, mrp_paise, gst_rate, stock, warranty, returnable_days, highlights, specs, images, active)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(shopId, f.name, f.description, f.category, f.brand, f.sku, f.hsn, f.price_paise, f.mrp_paise, f.gst_rate, f.stock, f.warranty, f.returnable_days, f.highlights, f.specs, JSON.stringify(images), f.active);
  return get(Number(r.lastInsertRowid));
}

function update(id, body, files) {
  const cur = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!cur) throw new HttpError(404, 'Product not found.');
  const f = fields(body);
  const { images, removed } = buildImages(json(cur.images, []), body, files);
  db.prepare(
    `UPDATE products SET name=?, description=?, category=?, brand=?, sku=?, hsn=?, price_paise=?, mrp_paise=?, gst_rate=?, stock=?, warranty=?, returnable_days=?, highlights=?, specs=?, images=?, active=?, updated_at=datetime('now') WHERE id=?`
  ).run(f.name, f.description, f.category, f.brand, f.sku, f.hsn, f.price_paise, f.mrp_paise, f.gst_rate, f.stock, f.warranty, f.returnable_days, f.highlights, f.specs, JSON.stringify(images), f.active, id);
  removeImages(removed);
  return get(id);
}

function remove(id) {
  const cur = db.prepare('SELECT images FROM products WHERE id = ?').get(id);
  if (!cur) throw new HttpError(404, 'Product not found.');
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  removeImages(json(cur.images, []));
}

module.exports = { shape, query, get, create, update, remove, SELECT, json };
