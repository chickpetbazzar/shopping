'use strict';

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
// 15-char GSTIN: 2-digit state, 10-char PAN, entity no., Z, checksum
const GSTIN_RE = /^(0[1-9]|[1-2][0-9]|3[0-8]|97|99)[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const UPI_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;
const PIN_RE = /^[1-9][0-9]{5}$/;
const UTR_RE = /^[0-9A-Za-z]{8,30}$/;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (msg) => new HttpError(400, msg);

function clean(v, max = 200) {
  if (v === undefined || v === null) return '';
  return String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

// "499", "499.5", "1,499.00" -> paise (integer) or null
function toPaise(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).replace(/[,₹\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const p = Math.round(parseFloat(s) * 100);
  return Number.isSafeInteger(p) ? p : null;
}

function toInt(v, min, max) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

// Indian mobile -> "91XXXXXXXXXX" (WhatsApp format) or null
function normPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (!/^[6-9]\d{9}$/.test(d)) return null;
  return '91' + d;
}

function orderNo() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `CB${ymd}${Math.floor(10000 + Math.random() * 90000)}`;
}

const inr = (paise) =>
  '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 });

function likeEscape(s) {
  return s.replace(/[\\%_]/g, (m) => '\\' + m);
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = {
  EMAIL_RE, GSTIN_RE, UPI_RE, PIN_RE, UTR_RE,
  HttpError, bad, clean, toPaise, toInt, normPhone, orderNo, inr, likeEscape, wrap,
};
