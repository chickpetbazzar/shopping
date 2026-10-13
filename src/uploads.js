'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const cfg = require('./config');
const { bad } = require('./util');

// Detect real image type from the file's first bytes (never trust the client's mimetype/filename)
function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  const head = buf.slice(0, 6).toString('latin1');
  if (head === 'GIF87a' || head === 'GIF89a') return 'gif';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

function saveImage(file) {
  const ext = sniff(file.buffer);
  if (!ext) throw bad('Only JPG, PNG, WebP or GIF images are allowed.');
  const name = crypto.randomBytes(16).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(cfg.UPLOAD_DIR, name), file.buffer, { mode: 0o644 });
  return '/uploads/' + name;
}

// Delete files we previously saved (only inside the uploads folder, only safe names)
function removeImages(list) {
  for (const p of list || []) {
    if (typeof p !== 'string' || !p.startsWith('/uploads/')) continue;
    const base = path.basename(p);
    if (!/^[\w.-]+$/.test(base) || base.startsWith('demo-')) continue;
    fs.unlink(path.join(cfg.UPLOAD_DIR, base), () => {});
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024, files: cfg.MAX_IMAGES, fields: 60, fieldSize: 20000 },
});

// Express middleware: product images (field "images") and shop logo (field "logo")
const productImages = upload.array('images', cfg.MAX_IMAGES);
const shopLogo = upload.single('logo');

module.exports = { saveImage, removeImages, productImages, shopLogo };
