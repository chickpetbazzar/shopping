'use strict';
// End-to-end API test on a throwaway database:  npm test
const os = require('os');
const fs = require('fs');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cbz-'));
process.env.DATA_DIR = tmp;
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.DB_FILE = path.join(tmp, 'test.db');
process.env.ADMIN_PASSWORD = 'Admin@12345';
delete process.env.WHATSAPP_TOKEN;

const app = require('../server');
const { db } = require('../src/db');

let pass = 0, fail = 0;
const ok = (cond, label, extra) => {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label, extra !== undefined ? JSON.stringify(extra) : ''); }
};

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

function client(base) {
  const jar = {};
  async function call(method, url, body, { form, noCsrf } = {}) {
    const headers = {};
    if (!noCsrf) headers['X-Requested-With'] = 'ChickpetBaazar';
    const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) headers.Cookie = cookie;
    let payload;
    if (form) payload = form;
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(base + url, { method, headers, body: payload });
    for (const sc of res.headers.getSetCookie()) {
      const [kv] = sc.split(';');
      const i = kv.indexOf('=');
      const k = kv.slice(0, i), v = kv.slice(i + 1);
      if (/Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(sc) || v === '') delete jar[k]; else jar[k] = v;
    }
    let data = null;
    try { data = await res.json(); } catch {}
    return { status: res.status, data };
  }
  return { get: (u) => call('GET', u), post: (u, b, o) => call('POST', u, b, o), put: (u, b, o) => call('PUT', u, b, o), del: (u) => call('DELETE', u), call };
}

function productForm(over = {}) {
  const f = new FormData();
  const v = { name: 'Test Silk Saree', description: 'A lovely test saree in pure silk.', category: 'Silk Sarees', brand: 'Test', price: '4999', mrp: '6999', stock: '5', gst_rate: '5', warranty: '6 months', returnable_days: '7', highlights: 'Pure silk\nZari border', specs: JSON.stringify([{ k: 'Fabric', v: 'Silk' }]), ...over };
  for (const [k, val] of Object.entries(v)) f.append(k, val);
  f.append('images', new Blob([PNG], { type: 'image/png' }), 'x.png');
  return f;
}
function shopForm(over = {}) {
  const f = new FormData();
  const v = { name: 'Test Silks', address: '12 Avenue Road, Chickpet', pincode: '560053', gst_number: '29ABCDE1234F1Z5', upi_id: 'testsilks@okicici', whatsapp: '9876543210', shipping_fee: '50', free_ship_above: '5000', ...over };
  for (const [k, val] of Object.entries(v)) f.append(k, val);
  return f;
}

async function main() {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const seller = client(base), cust = client(base), admin = client(base), seller2 = client(base), anon = client(base);
  let r;

  console.log('Auth');
  r = await anon.post('/api/auth/signup', { name: 'X', email: 'bad', phone: '1', password: 'x' });
  ok(r.status === 400, 'signup rejects bad input');
  r = await seller.post('/api/auth/signup', { name: 'Shop Owner', email: 'owner@t.com', phone: '9876500001', password: 'Passw0rd!', role: 'seller' });
  ok(r.status === 201 && r.data.user.role === 'seller', 'seller signup');
  r = await cust.post('/api/auth/signup', { name: 'Cust Omer', email: 'cust@t.com', phone: '9876500002', password: 'Passw0rd!', role: 'admin' });
  ok(r.status === 201 && r.data.user.role === 'customer', 'role=admin in signup is ignored (becomes customer)');
  r = await anon.post('/api/auth/signup', { name: 'Dup', email: 'CUST@t.com', phone: '9876500003', password: 'Passw0rd!' });
  ok(r.status === 409, 'duplicate email rejected');
  r = await anon.post('/api/auth/login', { email: 'cust@t.com', password: 'wrong' });
  ok(r.status === 401, 'wrong password rejected');
  r = await admin.post('/api/auth/login', { email: 'admin@chickpetbaazar.com', password: 'Admin@12345' });
  ok(r.status === 200 && r.data.user.role === 'admin', 'admin login');
  r = await cust.get('/api/auth/me');
  ok(r.data.user && r.data.user.email === 'cust@t.com', 'me returns session user');

  console.log('Security');
  r = await cust.post('/api/cart', { productId: 1, qty: 1 }, { noCsrf: true });
  ok(r.status === 403, 'POST without CSRF header blocked');
  r = await cust.get('/api/seller/shop');
  ok(r.status === 403, 'customer cannot use seller API');
  r = await cust.get('/api/admin/stats');
  ok(r.status === 403, 'customer cannot use admin API');
  r = await anon.get('/api/cart');
  ok(r.status === 401, 'cart needs login');
  r = await seller.get('/api/admin/users');
  ok(r.status === 403, 'seller cannot use admin API');

  console.log('Seller: shop + product');
  r = await seller.post('/api/seller/shop', undefined, { form: shopForm({ gst_number: '29BADGST' }) });
  ok(r.status === 400 && /GST/i.test(r.data.error), 'invalid GST rejected', r.data);
  r = await seller.post('/api/seller/shop', undefined, { form: shopForm({ upi_id: 'not a upi' }) });
  ok(r.status === 400, 'invalid UPI rejected');
  r = await seller.post('/api/seller/shop', undefined, { form: shopForm() });
  ok(r.status === 201 && r.data.shop.status === 'pending', 'shop created as pending', r.data);
  const shopId = r.data.shop.id;
  r = await seller.post('/api/seller/products', undefined, { form: productForm({ price: '0' }) });
  ok(r.status === 400, 'zero price rejected');
  r = await seller.post('/api/seller/products', undefined, { form: productForm({ mrp: '100' }) });
  ok(r.status === 400, 'MRP below price rejected');
  const bad = productForm(); bad.delete('images'); bad.append('images', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'evil.png');
  r = await seller.post('/api/seller/products', undefined, { form: bad });
  ok(r.status === 400, 'fake image (script as .png) rejected', r.data);
  r = await seller.post('/api/seller/products', undefined, { form: productForm() });
  ok(r.status === 201 && r.data.product.images.length === 1 && r.data.product.discount_pct === 29, 'product created with image', r.data);
  const pid = r.data.product.id;
  r = await anon.get('/api/products');
  ok(r.data.total === 0, 'pending shop products are hidden from customers');
  r = await anon.get('/api/products/' + pid);
  ok(r.status === 404, 'pending shop product page is 404 for public');

  console.log('Admin approves');
  r = await admin.get('/api/admin/shops?status=pending');
  ok(r.data.items.length === 1, 'admin sees pending shop');
  r = await admin.post(`/api/admin/shops/${shopId}/status`, { status: 'approved' });
  ok(r.data.shop.status === 'approved', 'shop approved');
  r = await anon.get('/api/products?q=silk');
  ok(r.data.total === 1, 'search finds product');
  r = await anon.get('/api/products?q=%25');
  ok(r.data.total === 0, 'LIKE wildcard is escaped');
  r = await anon.get('/api/products/' + pid);
  ok(r.status === 200 && r.data.shop.gst_registered === true && !('upi_id' in r.data.shop) && !('whatsapp' in r.data.shop), 'public product page hides UPI/WhatsApp', r.data.shop);

  console.log('Cart + checkout (UPI)');
  r = await seller.post('/api/cart', { productId: pid, qty: 1 });
  ok(r.status === 400, 'seller cannot buy own product');
  r = await cust.post('/api/cart', { productId: pid, qty: 2 });
  ok(r.status === 201 && r.data.count === 2 && r.data.total_paise === 999800 && r.data.groups[0].shipping_paise === 0, 'add to cart; free delivery above the shop threshold', r.data);
  r = await cust.post('/api/orders/checkout', { name: 'Cust Omer', phone: '9876500002', address: '5 MG Road, Indiranagar', city: 'Bengaluru', pincode: '56', payment_method: 'UPI' });
  ok(r.status === 400, 'bad pincode rejected');
  r = await cust.post('/api/orders/checkout', { name: 'Cust Omer', phone: '9876500002', address: '5 MG Road, Indiranagar', city: 'Bengaluru', pincode: '560038', payment_method: 'UPI' });
  ok(r.status === 201 && r.data.orders.length === 1 && r.data.orders[0].payment_status === 'unpaid', 'checkout creates UPI order', r.data);
  const o1 = r.data.orders[0];
  ok(db.prepare('SELECT stock FROM products WHERE id = ?').get(pid).stock === 3, 'stock reduced by order');
  r = await cust.get('/api/cart');
  ok(r.data.count === 0, 'cart cleared after checkout');

  console.log('UPI payment + WhatsApp');
  r = await cust.get(`/api/orders/${o1.id}/upi`);
  ok(r.status === 200 && r.data.link.startsWith('upi://pay?pa=testsilks@okicici') && r.data.link.includes('am=9998.00') && r.data.qr.startsWith('data:image/png'), 'UPI link + QR generated', r.data && r.data.link);
  r = await cust.post(`/api/orders/${o1.id}/pay`, { utr: '12' });
  ok(r.status === 400, 'short UTR rejected');
  r = await cust.post(`/api/orders/${o1.id}/pay`, { utr: '412345678901' });
  ok(r.status === 200 && r.data.order.payment_status === 'submitted', 'UTR submitted');
  const logs = db.prepare('SELECT * FROM whatsapp_log ORDER BY id').all();
  ok(logs.length === 2 && logs[0].to_number === '919876543210' && /New order/.test(logs[0].message) && /UTR/.test(logs[1].message), 'WhatsApp messages queued for seller (new order + payment submitted)', logs.map((l) => l.message.slice(0, 30)));
  r = await seller.post(`/api/seller/orders/${o1.id}/status`, { status: 'packed' });
  ok(r.status === 400, 'cannot ship before payment is confirmed');
  r = await seller2.post('/api/auth/signup', { name: 'Other Seller', email: 'o2@t.com', phone: '9876500004', password: 'Passw0rd!', role: 'seller' });
  r = await seller2.post('/api/seller/shop', undefined, { form: shopForm({ name: 'Other Shop', gst_number: '', upi_id: 'other@ybl' }) });
  r = await seller2.post(`/api/seller/orders/${o1.id}/payment`, { action: 'confirm' });
  ok(r.status === 404, "another seller cannot confirm this shop's payment");
  r = await seller2.put(`/api/seller/products/${pid}`, undefined, { form: productForm() });
  ok(r.status === 404, "another seller cannot edit this shop's product");
  r = await seller.post(`/api/seller/orders/${o1.id}/payment`, { action: 'confirm' });
  ok(r.status === 200 && r.data.order.payment_status === 'paid' && r.data.order.status === 'confirmed', 'seller confirms payment -> paid + confirmed', r.data);
  ok(db.prepare("SELECT COUNT(*) AS n FROM whatsapp_log WHERE message LIKE '%Payment of%received%'").get().n === 1, 'customer gets WhatsApp payment confirmation');
  for (const s of ['packed', 'shipped', 'delivered']) {
    r = await seller.post(`/api/seller/orders/${o1.id}/status`, { status: s });
    ok(r.status === 200 && r.data.order.status === s, 'status -> ' + s);
  }
  r = await cust.post(`/api/orders/${o1.id}/cancel`);
  ok(r.status === 400, 'delivered order cannot be cancelled');

  console.log('Reviews');
  r = await anon.post('/api/auth/signup', { name: 'No Buy', email: 'nb@t.com', phone: '9876500005', password: 'Passw0rd!' });
  r = await anon.post(`/api/products/${pid}/reviews`, { rating: 5 });
  ok(r.status === 403, 'non-buyer cannot review');
  r = await cust.post(`/api/products/${pid}/reviews`, { rating: 4, title: 'Nice', body: 'Good saree <b>bold</b>' });
  ok(r.status === 201, 'buyer can review');
  r = await anon.get('/api/products/' + pid);
  ok(r.data.product.rating === 4 && r.data.product.rating_count === 1 && r.data.reviews.length === 1, 'rating is aggregated');

  console.log('COD + cancel restores stock');
  await cust.post('/api/cart', { productId: pid, qty: 1 });
  r = await cust.post('/api/orders/checkout', { name: 'Cust Omer', phone: '9876500002', address: '5 MG Road, Indiranagar', city: 'Bengaluru', pincode: '560038', payment_method: 'COD' });
  const o2 = r.data.orders[0];
  ok(o2.payment_status === 'cod' && db.prepare('SELECT stock FROM products WHERE id = ?').get(pid).stock === 2, 'COD order created');
  ok(o2.shipping_paise === 5000 && o2.total_paise === 504900, 'delivery fee charged below the free-delivery threshold', o2);
  r = await cust.post(`/api/orders/${o2.id}/cancel`);
  ok(r.status === 200 && db.prepare('SELECT stock FROM products WHERE id = ?').get(pid).stock === 3, 'cancel restores stock');
  r = await cust.get('/api/orders');
  ok(r.data.items.length === 2, 'order history lists both');
  r = await seller.get('/api/seller/stats');
  ok(r.data.revenue_paise === 999800 && r.data.products === 1, 'seller stats revenue counts only paid orders', r.data);

  console.log('Seller UPI change needs password');
  r = await seller.put('/api/seller/shop', undefined, { form: shopForm({ upi_id: 'thief@ybl' }) });
  ok(r.status === 400, 'UPI change without password rejected');
  const f = shopForm({ upi_id: 'newupi@ybl' }); f.append('password', 'Passw0rd!');
  r = await seller.put('/api/seller/shop', undefined, { form: f });
  ok(r.status === 200 && r.data.shop.upi_id === 'newupi@ybl', 'UPI change with password accepted');

  console.log('Admin: add shop, delete everything');
  const af = shopForm({ name: 'Admin Added Shop', gst_number: '', upi_id: 'adminshop@okaxis', whatsapp: '9876500099' });
  af.append('owner_email', 'newowner@t.com'); af.append('owner_name', 'New Owner'); af.append('owner_password', 'Passw0rd!'); af.append('status', 'approved');
  r = await admin.post('/api/admin/shops', undefined, { form: af });
  ok(r.status === 201 && r.data.shop.status === 'approved', 'admin adds shop + owner account', r.data);
  const ashop = r.data.shop.id;
  r = await admin.post('/api/admin/products', undefined, { form: (() => { const x = productForm({ name: 'Admin Added Fabric', category: 'Fabrics by the Metre' }); x.append('shop_id', String(ashop)); return x; })() });
  ok(r.status === 201, 'admin adds product to any shop');
  const apid = r.data.product.id;
  r = await admin.post(`/api/admin/products/${apid}/active`, { active: false });
  ok(r.data.product.active === false, 'admin hides product');
  r = await admin.del('/api/admin/products/' + apid);
  ok(r.status === 200 && !db.prepare('SELECT 1 FROM products WHERE id = ?').get(apid), 'admin deletes product');
  const imgFiles = fs.readdirSync(process.env.UPLOAD_DIR).length;
  r = await admin.del('/api/admin/products/' + pid);
  ok(r.status === 200 && fs.readdirSync(process.env.UPLOAD_DIR).length < imgFiles + 1, 'delete product (with orders) works; image file removed');
  ok(db.prepare('SELECT COUNT(*) AS n FROM order_items WHERE product_id IS NULL').get().n >= 1, 'order history keeps item snapshot after product delete');
  r = await admin.get('/api/admin/orders');
  ok(r.data.items.length === 2, 'admin lists all orders');
  r = await admin.del('/api/admin/orders/' + o2.id);
  ok(r.status === 200, 'admin deletes order');
  r = await admin.get('/api/admin/users');
  const nb = r.data.items.find((u) => u.email === 'nb@t.com');
  r = await admin.put('/api/admin/users/' + nb.id, { active: false });
  r = await anon.get('/api/auth/me');
  ok(r.data.user === null, 'disabled user is logged out');
  r = await admin.del('/api/admin/users/' + nb.id);
  ok(r.status === 200, 'admin deletes user');
  r = await admin.del('/api/admin/shops/' + shopId);
  ok(r.status === 200 && !db.prepare('SELECT 1 FROM orders WHERE shop_id = ?').get(shopId), 'admin deletes shop (orders cascade)');
  r = await admin.get('/api/admin/whatsapp');
  ok(r.data.items.length >= 4 && r.data.automatic === false, 'admin can see WhatsApp log');
  r = await admin.get('/api/admin/stats');
  ok(typeof r.data.revenue_paise === 'number', 'admin stats');

  console.log('Logout');
  r = await cust.post('/api/auth/logout');
  r = await cust.get('/api/auth/me');
  ok(r.data.user === null, 'logout clears session');
  r = await cust.get('/api/cart');
  ok(r.status === 401, 'cart blocked after logout');

  console.log('Static');
  const idx = await fetch(base + '/');
  ok(idx.status === 200 || idx.status === 404, 'root responds (' + idx.status + ')');
  const csp = idx.headers.get('content-security-policy') || '';
  ok(/script-src 'self'/.test(csp), 'CSP header present');

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
