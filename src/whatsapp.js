'use strict';
/**
 * WhatsApp notifications.
 *
 * - If WHATSAPP_TOKEN + WHATSAPP_PHONE_ID are set (Meta WhatsApp Business Cloud API),
 *   messages are sent automatically.
 * - Otherwise nothing is sent automatically, but every message is logged and a
 *   click-to-chat link (wa.me) is returned so the person can send it with one tap.
 *
 * Note: Meta only allows free-text messages inside a 24-hour customer-service window.
 * For business-initiated alerts (new order to a shop) set WHATSAPP_TEMPLATE to an
 * approved template that has ONE body variable ({{1}}) - the message text is passed in it.
 */
const cfg = require('./config');
const { db } = require('./db');

const enabled = () => Boolean(cfg.WHATSAPP.token && cfg.WHATSAPP.phoneId);
const link = (to, text) => `https://wa.me/${to}?text=${encodeURIComponent(text)}`;

async function send(to, text, orderId = null) {
  let status = enabled() ? 'sending' : 'link-only';
  let error = '';
  if (enabled()) {
    const body = cfg.WHATSAPP.template
      ? {
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: cfg.WHATSAPP.template,
            language: { code: cfg.WHATSAPP.templateLang },
            components: [{ type: 'body', parameters: [{ type: 'text', text: text.replace(/\s*\n+\s*/g, ' | ').slice(0, 1000) }] }],
          },
        }
      : { messaging_product: 'whatsapp', to, type: 'text', text: { preview_url: false, body: text } };
    try {
      const r = await fetch(`https://graph.facebook.com/${cfg.WHATSAPP.version}/${cfg.WHATSAPP.phoneId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.WHATSAPP.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) status = 'sent';
      else {
        status = 'failed';
        const j = await r.json().catch(() => ({}));
        error = JSON.stringify(j.error || j).slice(0, 300);
      }
    } catch (e) {
      status = 'failed';
      error = String(e.message || e).slice(0, 300);
    }
  }
  try {
    db.prepare('INSERT INTO whatsapp_log (order_id, to_number, message, status, error) VALUES (?,?,?,?,?)').run(
      orderId, to, text, status, error
    );
  } catch (e) {
    console.error('whatsapp_log insert failed:', e.message);
  }
  return { status, link: link(to, text) };
}

// Fire and forget: never let a notification failure break an order
function notify(to, text, orderId) {
  if (!to) return;
  send(to, text, orderId).catch((e) => console.error('WhatsApp notify error:', e.message));
}

module.exports = { send, notify, link, enabled };
