'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(ROOT, 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// JWT secret: from env, otherwise generated once and kept in data/jwt.secret
function loadSecret() {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 24) return process.env.JWT_SECRET;
  const f = path.join(DATA_DIR, 'jwt.secret');
  try {
    return fs.readFileSync(f, 'utf8').trim();
  } catch {
    const s = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(f, s, { mode: 0o600 });
    return s;
  }
}

const isProd = process.env.NODE_ENV === 'production';

module.exports = {
  ROOT,
  DATA_DIR,
  UPLOAD_DIR,
  PUBLIC_DIR: path.join(ROOT, 'public'),
  PORT: Number(process.env.PORT) || 3000,
  isProd,
  JWT_SECRET: loadSecret(),
  // Set COOKIE_SECURE=true when the site is served over HTTPS
  COOKIE_SECURE: process.env.COOKIE_SECURE === 'true',
  TRUST_PROXY: process.env.TRUST_PROXY === 'true',
  ADMIN_EMAIL: (process.env.ADMIN_EMAIL || 'admin@chickpetbaazar.com').toLowerCase(),
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
  // New shops need admin approval before they appear to customers (recommended)
  AUTO_APPROVE_SHOPS: process.env.AUTO_APPROVE_SHOPS === 'true',
  WHATSAPP: {
    token: process.env.WHATSAPP_TOKEN || '',
    phoneId: process.env.WHATSAPP_PHONE_ID || '',
    template: process.env.WHATSAPP_TEMPLATE || '',
    templateLang: process.env.WHATSAPP_TEMPLATE_LANG || 'en',
    version: process.env.WHATSAPP_API_VERSION || 'v21.0',
  },
  CATEGORIES: [
    'Silk Sarees',
    'Cotton Sarees',
    'Designer Sarees',
    'Bridal Collection',
    'Dress Materials',
    'Fabrics by the Metre',
    'Blouse Pieces',
    'Lehengas & Ghagras',
    'Kurtis & Suits',
    "Men's Wear",
    "Kids' Wear",
    'Home Textiles',
    'Jewellery & Accessories',
    'Other',
  ],
  GST_RATES: [0, 3, 5, 12, 18, 28],
  ORDER_STATUSES: ['placed', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'],
  MAX_IMAGES: 5,
};
