'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const cfg = require('./src/config');
const { ensureAdmin } = require('./src/db');
const auth = require('./src/auth');

ensureAdmin();

const app = express();
if (cfg.TRUST_PROXY) app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'blob:'],
        'connect-src': ["'self'"],
        'font-src': ["'self'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'frame-ancestors': ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: cfg.COOKIE_SECURE,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

// Uploaded photos: served inert (no script execution even if something odd got in)
app.use(
  '/uploads',
  express.static(cfg.UPLOAD_DIR, {
    maxAge: '7d',
    index: false,
    setHeaders: (res) => res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox"),
  })
);
app.use(express.static(cfg.PUBLIC_DIR, { maxAge: cfg.isProd ? '1h' : 0, extensions: ['html'] }));

// ---- API ----
const api = express.Router();
api.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 1500, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests. Please wait a few minutes.' } }));
api.use(auth.csrfGuard);
api.use(auth.loadUser);
api.use('/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, skipSuccessfulRequests: true, message: { error: 'Too many login attempts. Try again in 15 minutes.' } }));
api.use('/auth/signup', rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, message: { error: 'Too many sign-ups from this network. Try again later.' } }));
api.use('/auth', require('./src/routes/auth'));
api.use('/cart', require('./src/routes/cart'));
api.use('/orders', require('./src/routes/orders'));
api.use('/seller', require('./src/routes/seller'));
api.use('/admin', require('./src/routes/admin'));
api.use('/', require('./src/routes/store'));
api.use((_req, res) => res.status(404).json({ error: 'Not found.' }));
app.use('/api', api);

// Every other path -> the single page app
app.get(/^\/(?!api\/|uploads\/).*/, (_req, res) => res.sendFile(path.join(cfg.PUBLIC_DIR, 'index.html')));

// ---- errors ----
app.use((err, _req, res, _next) => {
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request.' });
  if (err && err.name === 'MulterError') {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Each photo must be under 6 MB.' : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE' ? `You can add up to ${cfg.MAX_IMAGES} photos.` : 'Upload failed.';
    return res.status(400).json({ error: msg });
  }
  if (err && err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
});

if (require.main === module) {
  app.listen(cfg.PORT, () => {
    console.log(`ChickpetBaazar running at http://localhost:${cfg.PORT}`);
    if (!cfg.isProd) console.log('Development mode. Set NODE_ENV=production and COOKIE_SECURE=true when deploying behind HTTPS.');
  });
}

module.exports = app;
