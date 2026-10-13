'use strict';
const jwt = require('jsonwebtoken');
const cfg = require('./config');
const { db } = require('./db');

const COOKIE = 'cb_token';
const WEEK = 7 * 24 * 60 * 60 * 1000;

function issue(res, user) {
  const token = jwt.sign({ uid: user.id, tv: user.token_version }, cfg.JWT_SECRET, { expiresIn: '7d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cfg.COOKIE_SECURE,
    maxAge: WEEK,
    path: '/',
  });
}

function clear(res) {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: cfg.COOKIE_SECURE, path: '/' });
}

// Attach req.user when a valid session cookie is present
function loadUser(req, _res, next) {
  const t = req.cookies && req.cookies[COOKIE];
  if (t) {
    try {
      const p = jwt.verify(t, cfg.JWT_SECRET);
      const u = db
        .prepare('SELECT id, name, email, phone, role, active, token_version FROM users WHERE id = ?')
        .get(p.uid);
      if (u && u.active && u.token_version === p.tv) req.user = u;
    } catch {
      /* invalid or expired token: treat as logged out */
    }
  }
  next();
}

const requireAuth = (req, res, next) =>
  req.user ? next() : res.status(401).json({ error: 'Please log in to continue.' });

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Please log in to continue.' });
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'You do not have access to this.' });
  next();
};

// Cookies are SameSite=Lax; additionally require a custom header on state-changing calls.
function csrfGuard(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (req.get('x-requested-with') !== 'ChickpetBaazar') return res.status(403).json({ error: 'Request blocked.' });
  next();
}

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role });

module.exports = { issue, clear, loadUser, requireAuth, requireRole, csrfGuard, publicUser };
