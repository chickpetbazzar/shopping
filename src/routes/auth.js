'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const auth = require('../auth');
const { bad, clean, normPhone, EMAIL_RE, wrap, HttpError } = require('../util');

const router = express.Router();
const DUMMY = bcrypt.hashSync('not-a-real-password', 10);

function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8 || pw.length > 100) throw bad('Password must be at least 8 characters.');
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw bad('Password needs at least one letter and one number.');
}

router.post('/signup', wrap(async (req, res) => {
  const name = clean(req.body.name, 60);
  const email = clean(req.body.email, 120).toLowerCase();
  const phone = normPhone(req.body.phone);
  const role = req.body.role === 'seller' ? 'seller' : 'customer';
  if (name.length < 2) throw bad('Enter your name.');
  if (!EMAIL_RE.test(email)) throw bad('Enter a valid email address.');
  if (!phone) throw bad('Enter a valid 10-digit mobile number (used for WhatsApp updates).');
  checkPassword(req.body.password);

  const hash = await bcrypt.hash(req.body.password, 10);
  try {
    const r = db.prepare('INSERT INTO users (name, email, phone, password_hash, role) VALUES (?,?,?,?,?)').run(name, email, phone, hash, role);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(r.lastInsertRowid));
    auth.issue(res, user);
    res.status(201).json({ user: auth.publicUser(user) });
  } catch (e) {
    if (/UNIQUE/i.test(e.message)) throw new HttpError(409, 'An account with this email already exists. Try logging in.');
    throw e;
  }
}));

router.post('/login', wrap(async (req, res) => {
  const email = clean(req.body.email, 120).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY);
  if (!user || !ok) throw new HttpError(401, 'Email or password is incorrect.');
  if (!user.active) throw new HttpError(403, 'This account has been disabled. Please contact support.');
  auth.issue(res, user);
  res.json({ user: auth.publicUser(user) });
}));

router.post('/logout', (_req, res) => {
  auth.clear(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ user: req.user ? auth.publicUser(req.user) : null });
});

router.put('/me', auth.requireAuth, wrap(async (req, res) => {
  const name = clean(req.body.name, 60);
  const phone = normPhone(req.body.phone);
  if (name.length < 2) throw bad('Enter your name.');
  if (!phone) throw bad('Enter a valid 10-digit mobile number.');
  db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?').run(name, phone, req.user.id);
  res.json({ user: auth.publicUser({ ...req.user, name, phone }) });
}));

router.post('/password', auth.requireAuth, wrap(async (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!(await bcrypt.compare(String(req.body.current || ''), row.password_hash))) throw new HttpError(400, 'Your current password is incorrect.');
  checkPassword(req.body.next);
  db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?').run(await bcrypt.hash(req.body.next, 10), row.id);
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(row.id);
  auth.issue(res, fresh); // other devices are signed out
  res.json({ ok: true });
}));

module.exports = router;
