# ChickpetBaazar

An online marketplace for the shops of Chickpet, Bengaluru. Amazon-style storefront for customers, a dashboard for shop owners, and an admin panel that can add, edit and delete everything.

- **Frontend:** plain HTML, CSS and JavaScript (no build step)
- **Backend:** Node.js + Express
- **Database:** SQLite (a single file, `data/chickpetbaazar.db`)
- **Payments:** UPI (opens the customer's UPI app or shows a QR; the money goes straight to the shop)
- **Notifications:** WhatsApp (automatic with the WhatsApp Business Cloud API, otherwise one-tap links)

## Run it

You need **Node.js 22.13 or newer** (https://nodejs.org).

```bash
npm install
npm run seed     # optional: adds 4 demo shops and 20 products (all fake data)
npm start
```

Open http://localhost:3000

Demo logins (after `npm run seed`):

| Role | Email | Password |
|---|---|---|
| Admin | admin@chickpetbaazar.com | Admin@12345 (development default) |
| Shop owner | lakshmi@demo.chickpetbaazar.com | Seller@123 |
| Customer | customer@demo.chickpetbaazar.com | Customer@123 |

Run `npm test` for the automated end-to-end API test (72 checks, uses a throwaway database).

## What is in it

**Customers**
- Sign up, log in, log out, edit profile, change password
- Home page with category cards, deals, top rated, shops
- Search, category / price / rating / shop filters, sorting, pages
- Product page: photo gallery, price, MRP and discount, GST note, highlights, details table, description, warranty, returns, delivery charge, stock, seller, reviews and ratings
- Cart (grouped by shop), checkout with address, UPI or cash on delivery
- UPI payment screen: **Open UPI app** button (phones), **QR code** (computers), copyable UPI ID, then the customer enters the UPI reference (UTR) and taps **I have paid**
- Orders list, order tracking, cancel (before payment), printable GST invoice, reviews

**Shop owners** (`#/seller`)
- Create a shop: name, address, **GST number**, **UPI ID**, WhatsApp number, delivery charges, logo
- Add / edit / delete products: name, category, brand, description, **price**, MRP, stock, GST rate, HSN, **warranty**, return days, highlights, details table, up to 5 photos, show/hide
- Orders: **Payment received** / **Not received**, then Confirm, Packed, Shipped, Delivered, Cancel
- Dashboard with revenue, orders to handle, payments to verify, low stock

**Admin** (`#/admin`)
- Approve, suspend, add, edit and **delete shops** (a shop can be added together with its owner account)
- Add, edit, hide and **delete any product**
- View and change or **delete any order**; confirm payments
- Disable, reset password for, and **delete users**
- Delete reviews; see every WhatsApp message

## How UPI payment works (read this)

There is no payment gateway. The customer pays the shop's UPI ID directly, then enters the UPI reference number. **The shop checks its own UPI app and taps "Payment received".** Only then does the order move forward.

This means the app cannot *automatically* prove that money arrived. That is deliberate: it keeps the money flowing straight to each shop with no fees. Because of that, the UTR is treated as a claim, and the seller must verify it. The app blocks reusing the same UTR on another order.

If you later want automatic confirmation, add a gateway such as Razorpay or Cashfree (they need a registered business). The order and payment states in `src/orders.js` are where it would plug in.

## WhatsApp notifications

Messages are sent for: new order (to the shop), payment submitted (to the shop), payment confirmed or not found (to the customer), and each order status change (to the customer).

- **Without setup:** nothing is sent automatically. Every message is saved under **Admin → WhatsApp log**, and the order screens have **WhatsApp customer / WhatsApp the shop** buttons that open WhatsApp with the message already written.
- **Automatic sending:** create a Meta WhatsApp Business Cloud API app (https://developers.facebook.com/docs/whatsapp/cloud-api), then put `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_ID` in `.env`. WhatsApp only allows free text within 24 hours of the person's last message, so for alerts to shops and customers also create an approved **template with one body variable** and set `WHATSAPP_TEMPLATE`.

## Before you go live

1. Copy `.env.example` to `.env`. Set a strong `ADMIN_PASSWORD`.
2. Serve it over **HTTPS** (for example nginx + Let's Encrypt, or Caddy). Set `NODE_ENV=production`, `COOKIE_SECURE=true`, `TRUST_PROXY=true`.
3. Keep `AUTO_APPROVE_SHOPS=false` so you check each shop (GST number, UPI ID) before customers can pay it.
4. **Back up** `data/` and `uploads/` every day, to a different place. The database is one file.
5. Run it with a process manager (PM2 or systemd) so it restarts after a crash.
6. Replace the demo seed data. Delete the demo accounts from Admin → Users (and shops from Admin → Shops).
7. Get legal basics reviewed: terms, privacy policy (India's DPDP Act), seller agreement, refund policy.

## Security notes

- Passwords are hashed (bcrypt). Login uses an HttpOnly, SameSite cookie. State-changing requests need a custom header (CSRF protection).
- Strict Content-Security-Policy; all user text is escaped before display.
- Uploads are checked by their real file content, not the filename, and are served with scripting disabled.
- A shop owner needs their password to change the shop's **UPI ID** (stops anyone hijacking payments from a left-open session).
- Customers never see a shop's UPI ID or WhatsApp number until they have placed an order with it.
- Login and sign-up are rate limited.
- The GST number is checked for **format only** (15 characters). It is not verified against the GST portal.
- SQLite is perfect for hundreds of shops on one server. If you grow past one server, move to PostgreSQL.

## Project layout

```
server.js            Express app, security headers, routes
src/config.js        settings, categories, GST rates
src/db.js            database tables (created automatically)
src/auth.js          login cookie, roles, CSRF guard
src/products.js      product validation + queries
src/shops.js         shop validation (GST, UPI, WhatsApp)
src/orders.js        order status, UPI link + QR, WhatsApp messages
src/whatsapp.js      WhatsApp Cloud API + one-tap links
src/routes/*.js      auth, store, cart, orders, seller, admin APIs
scripts/seed.js      demo data       scripts/smoke-test.js   API tests
public/index.html    the page        public/css/style.css    all styling
public/js/*.js       app, shop (customer), seller, admin, forms, dashboard pieces
```

Ideas for next: wishlist, coupons, seller payouts report, Kannada / Hindi language, PWA install, PostgreSQL, courier tracking.
