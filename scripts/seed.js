'use strict';
/**
 * Demo data: 4 shops, ~24 products with generated product images, a few customers and reviews.
 * All shop names, GST numbers and UPI IDs below are FAKE and for demonstration only.
 * Run:  npm run seed
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const cfg = require('../src/config');
const { db, ensureAdmin } = require('../src/db');
const shops = require('../src/shops');
const products = require('../src/products');

ensureAdmin();

// ---------- generated product art (woven textile look) ----------
function art({ c1, c2, accent, kind, seed }) {
  const gold = '#e0a526';
  const defs = `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <pattern id="weave" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0 0H5M0 2.5H5" stroke="#000" stroke-opacity=".07" stroke-width="1"/><path d="M0 0V5M2.5 0V5" stroke="#fff" stroke-opacity=".08" stroke-width="1"/></pattern>
    <pattern id="butta" width="54" height="54" patternUnits="userSpaceOnUse" patternTransform="rotate(${(seed % 3) * 15 - 15})"><path d="M27 8L38 27L27 46L16 27Z" fill="${gold}" fill-opacity=".9"/><circle cx="27" cy="27" r="4" fill="${c1}"/><circle cx="0" cy="0" r="3" fill="${gold}"/><circle cx="54" cy="54" r="3" fill="${gold}"/></pattern>
    <pattern id="temple" width="30" height="24" patternUnits="userSpaceOnUse"><path d="M0 24L15 2L30 24Z" fill="${gold}"/><path d="M7 24L15 11L23 24Z" fill="${accent}"/></pattern>
    <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="3" fill="${gold}" fill-opacity=".85"/></pattern>
  </defs>`;
  const bands = (y, h) => `
    <rect x="0" y="${y}" width="600" height="${h}" fill="${accent}"/>
    <rect x="0" y="${y + 6}" width="600" height="6" fill="${gold}"/>
    <rect x="0" y="${y + h - 12}" width="600" height="6" fill="${gold}"/>
    <rect x="0" y="${y + 18}" width="600" height="${h - 36}" fill="url(#dots)"/>`;
  let body;
  if (kind === 'saree') {
    body = `<rect width="600" height="600" fill="url(#g)"/><rect width="600" height="600" fill="url(#weave)"/>
      <rect y="70" width="600" height="400" fill="url(#butta)" opacity=".75"/>
      ${bands(0, 70)}
      <rect y="470" width="600" height="130" fill="${accent}"/>
      <rect y="478" width="600" height="7" fill="${gold}"/>
      <rect y="490" width="600" height="46" fill="url(#temple)"/>
      <rect y="540" width="600" height="7" fill="${gold}"/>
      <rect y="552" width="600" height="48" fill="url(#dots)"/>
      <rect width="600" height="600" fill="url(#sheen)"/>`;
  } else if (kind === 'fabric') {
    body = `<rect width="600" height="600" fill="url(#g)"/><rect width="600" height="600" fill="url(#weave)"/>
      <path d="M0 140C150 90 300 190 600 120V220C300 290 150 190 0 240Z" fill="#fff" fill-opacity=".10"/>
      <path d="M0 380C160 330 330 430 600 360V450C330 520 160 420 0 470Z" fill="#000" fill-opacity=".09"/>
      <rect y="40" width="600" height="14" fill="${gold}"/><rect y="546" width="600" height="14" fill="${gold}"/>
      <rect width="600" height="600" fill="url(#sheen)"/>`;
  } else if (kind === 'garment') {
    body = `<rect width="600" height="600" fill="#f2eef5"/>
      <path d="M210 70L260 52Q300 98 340 52L390 70L470 150L420 205L395 180V540H205V180L180 205L130 150Z" fill="url(#g)"/>
      <path d="M210 70L260 52Q300 98 340 52L390 70L470 150L420 205L395 180V540H205V180L180 205L130 150Z" fill="url(#weave)"/>
      <rect x="205" y="470" width="190" height="70" fill="${accent}"/><rect x="205" y="478" width="190" height="6" fill="${gold}"/>
      <rect x="205" y="200" width="190" height="260" fill="url(#butta)" opacity=".55"/>
      <path d="M260 52Q300 98 340 52L330 48Q300 82 270 48Z" fill="${accent}"/>`;
  } else {
    body = `<rect width="600" height="600" fill="#f2eef5"/>
      <rect x="90" y="90" width="420" height="420" rx="26" fill="url(#g)"/>
      <rect x="90" y="90" width="420" height="420" rx="26" fill="url(#weave)"/>
      <rect x="90" y="90" width="420" height="420" rx="26" fill="url(#butta)" opacity=".6"/>
      <rect x="112" y="112" width="376" height="376" rx="14" fill="none" stroke="${gold}" stroke-width="5"/>
      <rect x="90" y="90" width="420" height="420" rx="26" fill="url(#sheen)"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">${defs}${body}</svg>`;
}

function image(slug, opts) {
  const file = `demo-${slug}.svg`;
  fs.writeFileSync(path.join(cfg.UPLOAD_DIR, file), art(opts));
  return '/uploads/' + file;
}

// ---------- demo shops & products ----------
const PW = { seller: 'Seller@123', customer: 'Customer@123' };

const DATA = [
  {
    owner: { name: 'Lakshmi Narayan', email: 'lakshmi@demo.chickpetbaazar.com', phone: '9845012301' },
    shop: { name: 'Sri Lakshmi Silks', description: 'Pure silk sarees from Kanchipuram, Mysore and Dharmavaram. Family-run on Chickpet main road for three generations.', address: '12, Avenue Road Cross, Chickpet', area: 'Chickpet', city: 'Bengaluru', pincode: '560053', gst_number: '29AAAAA1111A1Z5', upi_id: 'srilakshmisilks@okicici', whatsapp: '9845012301', shipping_fee: '60', free_ship_above: '3000' },
    products: [
      { n: 'Kanchipuram Pure Silk Saree with Zari Border', c: 'Silk Sarees', b: 'Sri Lakshmi', p: 12499, m: 15999, s: 6, w: 'Silk Mark certified. 1 year free zari re-polishing by the shop.', r: 7, k: 'saree', c1: '#7b1230', c2: '#b3173d', a: '#0f5c6b', hl: 'Handwoven pure mulberry silk\nContrast temple border with real zari\nSilk Mark certified\nIncludes unstitched blouse piece', sp: { Fabric: 'Pure silk', Colour: 'Maroon with peacock-blue border', Length: '6.3 m with blouse piece', Occasion: 'Wedding, festival' }, d: 'A classic Kanchipuram saree woven on a traditional handloom with a rich contrast border and a woven pallu. Ideal for weddings and festive occasions. Dry clean only. Slight variations in weave are a sign of handloom work.' },
      { n: 'Mysore Crepe Silk Saree - Emerald Green', c: 'Silk Sarees', b: 'Sri Lakshmi', p: 6799, m: 8499, s: 9, w: 'Silk Mark certified.', r: 7, k: 'saree', c1: '#0e6b4a', c2: '#17a06b', a: '#c4155a', hl: 'Soft Mysore crepe silk, light to drape\nGolden zari border\nBlouse piece included', sp: { Fabric: 'Mysore crepe silk', Colour: 'Emerald green', Length: '5.5 m + 0.8 m blouse' }, d: 'Lightweight Mysore silk that drapes beautifully and does not crease easily. A good everyday-festive saree for office functions and family gatherings.' },
      { n: 'Dharmavaram Silk Saree - Mustard and Magenta', c: 'Silk Sarees', b: 'Sri Lakshmi', p: 8999, m: 11999, s: 4, w: 'Silk Mark certified.', r: 7, k: 'saree', c1: '#d99b16', c2: '#f0bb3a', a: '#a8125a', hl: 'Broad contrast border\nPallu with traditional motifs\nBlouse piece included', sp: { Fabric: 'Dharmavaram silk', Colour: 'Mustard with magenta border' }, d: 'A Dharmavaram silk saree with bold colour contrast and a heavy pallu. Wedding guest favourite.' },
      { n: 'Banarasi Georgette Saree - Wine', c: 'Designer Sarees', b: 'Sri Lakshmi', p: 4299, m: 6999, s: 12, w: '', r: 3, k: 'saree', c1: '#4a0e2e', c2: '#7d1b4d', a: '#e0a526', hl: 'Banarasi weave georgette\nGold zari butta all over\nBlouse piece included', sp: { Fabric: 'Georgette', Colour: 'Wine', Length: '5.5 m + 0.8 m blouse' }, d: 'Flowy georgette saree with Banarasi-style gold buttas. Light enough for all-day wear at a function.' },
      { n: 'Pure Silk Blouse Piece - Gold Zari (0.8 m)', c: 'Blouse Pieces', b: 'Sri Lakshmi', p: 549, m: 799, s: 40, w: '', r: 0, k: 'fabric', c1: '#c98a0e', c2: '#f2c04a', a: '#7b1230', hl: 'Matches most silk sarees\nReady to stitch', sp: { Fabric: 'Silk blend', Length: '0.8 m' }, d: 'Ready-to-stitch silk blouse piece with fine zari weave.' },
    ],
  },
  {
    owner: { name: 'Imran Pasha', email: 'imran@demo.chickpetbaazar.com', phone: '9880123402' },
    shop: { name: 'Chickpet Cotton House', description: 'Everyday cotton sarees, dress materials and fabrics by the metre at wholesale-market prices.', address: '45, Nagarthpet Main Road, Chickpet', area: 'Chickpet', city: 'Bengaluru', pincode: '560002', gst_number: '29BBBBB2222B1Z6', upi_id: 'cottonhouse@ybl', whatsapp: '9880123402', shipping_fee: '50', free_ship_above: '1500' },
    products: [
      { n: 'Pure Cotton Saree - Indigo Block Print', c: 'Cotton Sarees', b: 'Cotton House', p: 899, m: 1499, s: 25, w: 'Colour-fastness guarantee for 30 days.', r: 7, k: 'saree', c1: '#1c2d6b', c2: '#2f4aa8', a: '#e0a526', hl: 'Soft 100% cotton\nHand block printed\nFree blouse piece', sp: { Fabric: '100% cotton', Colour: 'Indigo', Wash: 'Machine wash cold' }, d: 'A breathable block-printed cotton saree for daily wear. Softens with every wash.' },
      { n: 'Kota Doria Cotton Saree - Peach', c: 'Cotton Sarees', b: 'Cotton House', p: 1299, m: 1999, s: 14, w: '', r: 7, k: 'saree', c1: '#e8967a', c2: '#f4b99f', a: '#8a2d4a', hl: 'Lightweight checks weave\nIdeal for summer', sp: { Fabric: 'Kota Doria', Colour: 'Peach' }, d: 'Kota Doria is famous for its airy square-checked weave. Perfect for hot weather.' },
      { n: 'Cotton Dress Material - 3 piece set (Teal)', c: 'Dress Materials', b: 'Cotton House', p: 749, m: 1199, s: 30, w: '', r: 7, k: 'fabric', c1: '#0f6b73', c2: '#2aa0a8', a: '#e0a526', hl: 'Top 2.5 m, bottom 2.5 m, dupatta 2.25 m\nUnstitched', sp: { Fabric: 'Cotton', Colour: 'Teal', Pieces: 'Top, bottom, dupatta' }, d: 'Unstitched three-piece cotton set. Get it stitched to your size at any tailor.' },
      { n: 'Plain Cotton Fabric by the Metre - Rani Pink', c: 'Fabrics by the Metre', b: 'Cotton House', p: 140, m: 180, s: 300, w: '', r: 0, k: 'fabric', c1: '#c4155a', c2: '#e24a85', a: '#ffffff', hl: 'Price is per metre\n44 inch width', sp: { Fabric: 'Cotton', Width: '44 inches', 'Sold by': 'Per metre' }, d: 'Pre-washed plain cotton. Quantity selected is the number of metres (cut as one piece).' },
      { n: "Men's Cotton Shirt Piece - Pinstripe", c: "Men's Wear", b: 'Cotton House', p: 649, m: 999, s: 18, w: '', r: 7, k: 'fabric', c1: '#34415f', c2: '#566187', a: '#ffffff', hl: '2.4 m shirt length\nWrinkle-resistant finish', sp: { Fabric: 'Cotton blend', Length: '2.4 m' }, d: 'Shirt-length pinstripe fabric for a custom stitched formal shirt.' },
      { n: 'Cotton Kurti - Mustard Printed (M, L, XL)', c: 'Kurtis & Suits', b: 'Cotton House', p: 599, m: 999, s: 22, w: '', r: 7, k: 'garment', c1: '#d9a21b', c2: '#f0c55a', a: '#0f5c6b', hl: 'Straight cut, knee length\nRoomy fit', sp: { Fabric: 'Cotton', Sizes: 'M, L, XL', Care: 'Hand wash' }, d: 'Comfortable everyday kurti with a printed yoke and border.' },
    ],
  },
  {
    owner: { name: 'Meenakshi Devi', email: 'meenakshi@demo.chickpetbaazar.com', phone: '9741234503' },
    shop: { name: 'Meenakshi Fabrics & Home', description: 'Fabrics, home textiles and ready-made kurtis. Bedsheets, curtains and cushion covers in bulk or single pieces.', address: '8, 2nd Cross, Tank Bund Road, Chickpet', area: 'Chickpet', city: 'Bengaluru', pincode: '560053', gst_number: '29CCCCC3333C1Z7', upi_id: 'meenakshifab@oksbi', whatsapp: '9741234503', shipping_fee: '70', free_ship_above: '2000' },
    products: [
      { n: 'Double Bedsheet Set - Jaipur Floral (2 pillow covers)', c: 'Home Textiles', b: 'Meenakshi', p: 999, m: 1799, s: 20, w: '6 months against stitching defects.', r: 7, k: 'home', c1: '#7a3b8f', c2: '#b05fc4', a: '#e0a526', hl: '100% cotton, 160 TC\nFits queen and king beds\nFast-colour print', sp: { Fabric: 'Cotton 160 TC', Size: '90 x 100 inches', Includes: '1 bedsheet, 2 pillow covers' }, d: 'A fresh floral print double bedsheet with two matching pillow covers. Machine washable.' },
      { n: 'Cushion Cover Set of 5 - Ikat', c: 'Home Textiles', b: 'Meenakshi', p: 449, m: 799, s: 35, w: '', r: 7, k: 'home', c1: '#0f5c6b', c2: '#2c93a3', a: '#c4155a', hl: 'Set of 5, 16 x 16 inches\nZip closure', sp: { Fabric: 'Cotton', Size: '16 x 16 inches', Pieces: '5' }, d: 'Brighten your sofa with five ikat cushion covers. Fillers not included.' },
      { n: 'Anarkali Kurti Set - Rani Pink (M, L, XL)', c: 'Kurtis & Suits', b: 'Meenakshi', p: 1599, m: 2599, s: 10, w: '', r: 7, k: 'garment', c1: '#c4155a', c2: '#e24a85', a: '#e0a526', hl: 'Kurti, pants and dupatta\nFlared Anarkali cut', sp: { Fabric: 'Rayon', Sizes: 'M, L, XL', Pieces: 'Kurti, pant, dupatta' }, d: 'A festive Anarkali set with gold print detailing. Comes with matching pants and dupatta.' },
      { n: 'Kids Pattu Pavadai Set (2-8 years)', c: "Kids' Wear", b: 'Meenakshi', p: 1199, m: 1899, s: 8, w: '', r: 7, k: 'garment', c1: '#b3173d', c2: '#e04a6a', a: '#e0a526', hl: 'Silk blend, lined\nElastic waist', sp: { Fabric: 'Silk blend', Ages: '2 to 8 years' }, d: 'Traditional pattu pavadai with gold border for festivals and functions.' },
      { n: 'Zari Border Silk Curtain Cloth - per metre', c: 'Fabrics by the Metre', b: 'Meenakshi', p: 320, m: 450, s: 120, w: '', r: 0, k: 'fabric', c1: '#8a1c3c', c2: '#c0395f', a: '#e0a526', hl: 'Price per metre\n48 inch width', sp: { Fabric: 'Silk blend', Width: '48 inches' }, d: 'Rich curtain fabric with a zari border line. Cut to the length you choose.' },
    ],
  },
  {
    owner: { name: 'Farida Khan', email: 'farida@demo.chickpetbaazar.com', phone: '9611234604' },
    shop: { name: 'Royal Bridal Collections', description: 'Bridal sarees, lehengas and wedding trousseau. Appointment-friendly showroom with alterations on request.', address: '101, Balepet Circle, Chickpet', area: 'Chickpet', city: 'Bengaluru', pincode: '560053', gst_number: '29DDDDD4444D1Z8', upi_id: 'royalbridal@okaxis', whatsapp: '9611234604', shipping_fee: '120', free_ship_above: '5000' },
    products: [
      { n: 'Bridal Lehenga - Ruby Red with Heavy Zari Work', c: 'Lehengas & Ghagras', b: 'Royal Bridal', p: 18999, m: 26999, s: 3, w: '3 months stitching and finishing warranty.', r: 3, k: 'garment', c1: '#9e0f2e', c2: '#d1244a', a: '#e0a526', hl: 'Heavy zari and sequin work\nSemi-stitched, adjustable up to 44\nDupatta and blouse piece included', sp: { Fabric: 'Velvet and net', Colour: 'Ruby red', Pieces: 'Lehenga, blouse, 2 dupattas' }, d: 'A statement bridal lehenga with heavy embroidery. Semi-stitched so your tailor can fit the blouse. Dry clean only.' },
      { n: 'Bridal Kanchipuram Saree - Pink and Gold Temple Border', c: 'Bridal Collection', b: 'Royal Bridal', p: 24999, m: 32999, s: 2, w: 'Silk Mark certified. Free pico and fall.', r: 3, k: 'saree', c1: '#c4155a', c2: '#e24a85', a: '#b8860b', hl: 'Pure silk with real zari\nTemple border and rich pallu\nSilk Mark certified', sp: { Fabric: 'Pure silk', Colour: 'Pink and gold', Length: '6.3 m + blouse piece' }, d: 'A showpiece bridal saree for the muhurtham. Heavy pallu and temple border in real zari.' },
      { n: 'Designer Organza Saree - Powder Blue', c: 'Designer Sarees', b: 'Royal Bridal', p: 3499, m: 5499, s: 11, w: '', r: 3, k: 'saree', c1: '#6e9bd1', c2: '#a7c3e6', a: '#355c92', hl: 'Sheer organza\nSequin border\nBlouse piece included', sp: { Fabric: 'Organza', Colour: 'Powder blue' }, d: 'Light, airy organza saree with a sequin border. Great for receptions and parties.' },
      { n: 'Kundan Bridal Necklace Set with Earrings', c: 'Jewellery & Accessories', b: 'Royal Bridal', p: 1899, m: 3299, s: 15, w: '3 months plating warranty.', r: 7, k: 'home', c1: '#b8860b', c2: '#f0c55a', a: '#8a1c3c', hl: 'Kundan stones with pearl drops\nAdjustable thread back', sp: { Material: 'Alloy with gold plating', Includes: 'Necklace, 2 earrings, maang tikka' }, d: 'Traditional kundan set to complete a bridal look. Store in the box provided, away from water and perfume.' },
    ],
  },
];

const REVIEWS = [
  [5, 'Beautiful weave', 'The colour is exactly like the photo and the zari is heavy. Packed very well.'],
  [4, 'Good quality for the price', 'Fabric is good. Delivery took a day more than expected but the shop kept me updated on WhatsApp.'],
  [5, 'Perfect for the function', 'Got so many compliments. Will order again from this shop.'],
  [3, 'Decent', 'Colour is slightly lighter than shown. Quality is fine.'],
];

async function main() {
  const hash = await bcrypt.hash(PW.seller, 10);
  const chash = await bcrypt.hash(PW.customer, 10);

  // customers (for reviews)
  const customers = [
    ['Anita Rao', 'anita@demo.chickpetbaazar.com', '9900112233'],
    ['Ravi Kumar', 'ravi@demo.chickpetbaazar.com', '9900112244'],
    ['Sneha Iyer', 'sneha@demo.chickpetbaazar.com', '9900112255'],
    ['Demo Customer', 'customer@demo.chickpetbaazar.com', '9900112266'],
  ].map(([name, email, p]) => {
    const ex = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (ex) return ex.id;
    return Number(db.prepare("INSERT INTO users (name, email, phone, password_hash, role) VALUES (?,?,?,?, 'customer')").run(name, email, '91' + p, chash).lastInsertRowid);
  });

  let n = 0;
  for (const entry of DATA) {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(entry.owner.email);
    if (existing) continue;
    const uid = Number(db.prepare("INSERT INTO users (name, email, phone, password_hash, role) VALUES (?,?,?,?, 'seller')").run(entry.owner.name, entry.owner.email, '91' + entry.owner.phone, hash).lastInsertRowid);
    const shop = shops.insert(uid, shops.validate(entry.shop), 'approved');
    for (const [i, d] of entry.products.entries()) {
      const slug = `${shop.id}-${i + 1}`;
      const p = products.create(shop.id, {
        name: d.n, description: d.d, category: d.c, brand: d.b, price: d.p, mrp: d.m, stock: d.s, gst_rate: d.c === 'Jewellery & Accessories' ? 3 : d.p > 2500 ? 18 : 5,
        warranty: d.w, returnable_days: d.r, highlights: d.hl, specs: Object.entries(d.sp).map(([k, v]) => ({ k, v })),
      }, []);
      const img = image(slug, { c1: d.c1, c2: d.c2, accent: d.a, kind: d.k, seed: n });
      db.prepare('UPDATE products SET images = ? WHERE id = ?').run(JSON.stringify([img]), p.id);
      // a few reviews on the first product(s)
      if (i < 3) {
        for (let r = 0; r < 3 - i + (n % 2); r++) {
          const rv = REVIEWS[(n + r) % REVIEWS.length];
          try { db.prepare('INSERT INTO reviews (product_id, user_id, rating, title, body) VALUES (?,?,?,?,?)').run(p.id, customers[r % 3], rv[0], rv[1], rv[2]); } catch {}
        }
      }
      n++;
    }
  }

  console.log(`\nDemo data ready (${n} products added).`);
  console.log('\nLogins (all demo accounts use fake data):');
  console.log('  Admin    :', cfg.ADMIN_EMAIL, '/', cfg.ADMIN_PASSWORD || 'Admin@12345 (or the generated one)');
  for (const e of DATA) console.log('  Seller   :', e.owner.email, '/', PW.seller, ' (' + e.shop.name + ')');
  console.log('  Customer :', 'customer@demo.chickpetbaazar.com', '/', PW.customer, '\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
