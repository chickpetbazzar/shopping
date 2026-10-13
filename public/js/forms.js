// Product form and shop form, shared by the seller dashboard and the admin panel.
import { html, raw, render, img, compressImage } from './util.js';
import { api } from './api.js';
import { state, toast, go, onClick, onChange, onSubmit } from './core.js';

const rup = (paise) => (paise === '' || paise === null || paise === undefined ? '' : String(paise / 100));
const SPEC_KEYS = ['Fabric', 'Colour', 'Size', 'Length', 'Width', 'Work', 'Occasion', 'Pattern', 'Care', 'Pieces', 'Weight'];

// ---------- product form ----------------------------------------------------
let pf = { keep: [], files: [] };

const specRow = (k = '', v = '') => html`<div class="specrow">
  <input name="spec_k" list="speckeys" value="${k}" placeholder="For example: Fabric" aria-label="Detail name" maxlength="40">
  <input name="spec_v" value="${v}" placeholder="For example: Pure silk" aria-label="Detail value" maxlength="120">
  <button type="button" class="btn ghost sm" data-act="pf-rm-spec" aria-label="Remove this detail">Remove</button></div>`;

function previews() {
  const max = state.meta.maxImages;
  const n = pf.keep.length + pf.files.length;
  return html`<div class="prevs">
    ${pf.keep.map((s) => html`<figure>${img(s, 'Product photo')}<button type="button" class="x" data-act="pf-rm-old" data-src="${s}" aria-label="Remove photo">&times;</button></figure>`)}
    ${pf.files.map((x, i) => html`<figure><img src="${x.url}" alt="New photo ${i + 1}"><button type="button" class="x" data-act="pf-rm-new" data-i="${i}" aria-label="Remove photo">&times;</button></figure>`)}
  </div><p class="hint">${n} of ${max} photos. The first photo is the main one.</p>`;
}
const redrawPreviews = () => { const el = document.getElementById('pf-previews'); if (el) el.innerHTML = render(previews()); };

export function productForm({ product = null, shops = null, scope }) {
  pf = { keep: product ? [...product.images] : [], files: [] };
  const p = product || { name: '', category: '', brand: '', description: '', highlights: [], specs: [], price_paise: '', mrp_paise: '', stock: '', gst_rate: 5, hsn: '', sku: '', warranty: '', returnable_days: 7, active: true };
  const specs = p.specs.length ? p.specs : [{ k: '', v: '' }];
  return html`<form class="pform" data-form="product" data-scope="${scope}" data-id="${product ? product.id : ''}" novalidate>
    <datalist id="speckeys">${SPEC_KEYS.map((k) => html`<option value="${k}"></option>`)}</datalist>
    <section class="cbox"><h2>Basics</h2>
      ${shops ? html`<label class="field"><span>Shop</span><select name="shop_id" required ${product ? raw('disabled') : ''}>
        <option value="">Choose a shop</option>${shops.map((s) => html`<option value="${s.id}" ${product && product.shop_id === s.id ? raw('selected') : ''}>${s.name}</option>`)}</select></label>` : ''}
      <label class="field"><span>Product name</span><input name="name" value="${p.name}" maxlength="120" required placeholder="For example: Kanchipuram silk saree, peacock blue"></label>
      <div class="grid2">
        <label class="field"><span>Category</span><select name="category" required><option value="">Choose a category</option>
          ${state.meta.categories.map((c) => html`<option ${c === p.category ? raw('selected') : ''}>${c}</option>`)}</select></label>
        <label class="field"><span>Brand (optional)</span><input name="brand" value="${p.brand}" maxlength="60"></label>
      </div>
      <label class="field"><span>Description</span><textarea name="description" rows="5" maxlength="4000" required placeholder="Describe the fabric, work, colour, how to care for it and what is included.">${p.description}</textarea></label>
    </section>
    <section class="cbox"><h2>Price and stock</h2>
      <div class="grid3">
        <label class="field"><span>Selling price (₹)</span><input name="price" value="${rup(p.price_paise)}" inputmode="decimal" required></label>
        <label class="field"><span>MRP (₹)</span><input name="mrp" value="${rup(p.mrp_paise)}" inputmode="decimal" placeholder="Same as price if blank"></label>
        <label class="field"><span>Stock (pieces)</span><input name="stock" value="${p.stock}" inputmode="numeric" required></label>
      </div>
      <div class="grid3">
        <label class="field"><span>GST rate</span><select name="gst_rate">${state.meta.gstRates.map((r) => html`<option value="${r}" ${r === p.gst_rate ? raw('selected') : ''}>${r}%</option>`)}</select></label>
        <label class="field"><span>HSN code (optional)</span><input name="hsn" value="${p.hsn}" inputmode="numeric" maxlength="8" placeholder="For example: 5007"></label>
        <label class="field"><span>SKU / your code (optional)</span><input name="sku" value="${p.sku}" maxlength="40"></label>
      </div>
      <p class="hint">The selling price you enter is what the customer pays. It is treated as including GST.</p>
    </section>
    <section class="cbox"><h2>Warranty and returns</h2>
      <div class="grid2">
        <label class="field"><span>Warranty</span><input name="warranty" value="${p.warranty}" maxlength="200" placeholder="For example: 6 months against defects, or leave blank for none"></label>
        <label class="field"><span>Return window (days, 0 for no returns)</span><input name="returnable_days" value="${p.returnable_days}" inputmode="numeric"></label>
      </div>
    </section>
    <section class="cbox"><h2>Highlights and details</h2>
      <label class="field"><span>Highlights (one per line, up to 8)</span><textarea name="highlights" rows="4" placeholder="Handwoven pure silk&#10;Real zari border&#10;Blouse piece included">${p.highlights.join('\n')}</textarea></label>
      <p class="label-like">Details table</p>
      <div id="specs">${specs.map((s) => specRow(s.k, s.v))}</div>
      <button type="button" class="btn ghost sm" data-act="pf-add-spec">Add another detail</button>
    </section>
    <section class="cbox"><h2>Photos</h2>
      <div id="pf-previews">${previews()}</div>
      <label class="btn ghost filebtn">Add photos<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple data-change="pf-files" hidden></label>
      <p class="hint">Use clear daylight photos. Big photos are shrunk automatically before upload.</p>
    </section>
    <label class="check"><input type="checkbox" name="active" ${p.active ? raw('checked') : ''}> Show this product in the store</label>
    <p class="form-error" hidden></p>
    <div class="btnrow"><button class="btn big" type="submit">${product ? 'Save changes' : 'Add product'}</button><a class="btn ghost big" href="#/${scope}/products">Cancel</a></div>
  </form>`;
}

onClick('pf-add-spec', () => {
  const box = document.getElementById('specs');
  if (box.children.length >= 12) return toast('You can add up to 12 details.', 'error');
  box.insertAdjacentHTML('beforeend', render(specRow()));
});
onClick('pf-rm-spec', (el) => el.closest('.specrow').remove());
onClick('pf-rm-old', (el) => { pf.keep = pf.keep.filter((s) => s !== el.dataset.src); redrawPreviews(); });
onClick('pf-rm-new', (el) => {
  const [x] = pf.files.splice(Number(el.dataset.i), 1);
  if (x) URL.revokeObjectURL(x.url);
  redrawPreviews();
});
onChange('pf-files', async (el) => {
  const max = state.meta.maxImages;
  for (const f of [...el.files]) {
    if (pf.keep.length + pf.files.length >= max) { toast(`You can add up to ${max} photos.`, 'error'); break; }
    if (!/^image\/(jpeg|png|webp|gif)$/.test(f.type)) { toast(`"${f.name}" is not a JPG, PNG, WebP or GIF image.`, 'error'); continue; }
    const small = await compressImage(f);
    pf.files.push({ file: small, url: URL.createObjectURL(small) });
  }
  el.value = '';
  redrawPreviews();
});

onSubmit('product', async (f) => {
  const { scope, id } = f.dataset;
  const el = f.elements;
  const fd = new FormData();
  for (const n of ['name', 'category', 'brand', 'description', 'highlights', 'price', 'mrp', 'stock', 'gst_rate', 'hsn', 'sku', 'warranty', 'returnable_days']) fd.append(n, el[n].value);
  if (scope === 'admin' && !id) fd.append('shop_id', el.shop_id.value);
  fd.append('active', el.active.checked ? 'true' : 'false');
  const specs = [...f.querySelectorAll('.specrow')].map((r) => ({ k: r.querySelector('[name=spec_k]').value, v: r.querySelector('[name=spec_v]').value }));
  fd.append('specs', JSON.stringify(specs));
  fd.append('keep_images', JSON.stringify(pf.keep));
  for (const x of pf.files) fd.append('images', x.file, x.file.name);
  await api(id ? 'PUT' : 'POST', `/${scope}/products${id ? '/' + id : ''}`, undefined, { form: fd });
  toast(id ? 'Product saved' : 'Product added');
  go(`/${scope}/products`);
});

// ---------- shop form -------------------------------------------------------
export function shopForm({ shop = null, scope }) {
  const s = shop || { name: '', description: '', address: '', area: 'Chickpet', city: 'Bengaluru', pincode: '560053', gst_number: '', upi_id: '', whatsapp: '', shipping_fee_paise: 0, free_ship_above_paise: 0, logo: '', status: 'approved' };
  const admin = scope === 'admin';
  return html`<form class="pform" data-form="shop" data-scope="${scope}" data-id="${shop ? shop.id : ''}" novalidate>
    <section class="cbox"><h2>Shop details</h2>
      <label class="field"><span>Shop name</span><input name="name" value="${s.name}" maxlength="80" required></label>
      <label class="field"><span>About the shop (optional)</span><textarea name="description" rows="3" maxlength="1000" placeholder="What you sell and how long you have been in Chickpet.">${s.description}</textarea></label>
      <label class="field"><span>Shop address</span><input name="address" value="${s.address}" maxlength="250" required placeholder="Shop number, lane, building"></label>
      <div class="grid3">
        <label class="field"><span>Area</span><input name="area" value="${s.area}" maxlength="60"></label>
        <label class="field"><span>City</span><input name="city" value="${s.city}" maxlength="60"></label>
        <label class="field"><span>Pincode</span><input name="pincode" value="${s.pincode}" inputmode="numeric" maxlength="6" required></label>
      </div>
      <div class="logorow">${s.logo ? html`<div class="shoplogo">${img(s.logo, s.name)}</div>` : ''}
        <label class="field"><span>Shop logo (optional)</span><input type="file" name="logo" accept="image/jpeg,image/png,image/webp"></label></div>
    </section>
    <section class="cbox"><h2>GST and payments</h2>
      <label class="field"><span>GST number (GSTIN, optional)</span><input name="gst_number" value="${s.gst_number}" maxlength="15" autocapitalize="characters" placeholder="For example: 29ABCDE1234F1Z5">
        <small>15 characters. We check the format only. Leave blank if you are not registered, and your invoices will say "Bill of supply".</small></label>
      <label class="field"><span>UPI ID for payments</span><input name="upi_id" value="${s.upi_id}" maxlength="100" required autocapitalize="none" placeholder="shopname@okicici">
        <small>Customers pay to this UPI ID. Check every letter. Payments go straight to you, not through us.</small></label>
      ${!admin && shop ? html`<label class="field"><span>Your account password</span><input type="password" name="password" autocomplete="current-password"><small>Only needed when you change the UPI ID. This protects your payments.</small></label>` : ''}
      <label class="field"><span>WhatsApp number for order alerts</span><input name="whatsapp" value="${s.whatsapp.replace(/^91/, '')}" inputmode="numeric" maxlength="14" required placeholder="10-digit mobile number"></label>
    </section>
    <section class="cbox"><h2>Delivery charges</h2>
      <div class="grid2">
        <label class="field"><span>Delivery charge per order (₹)</span><input name="shipping_fee" value="${rup(s.shipping_fee_paise)}" inputmode="decimal" placeholder="0 for free delivery"></label>
        <label class="field"><span>Free delivery above (₹)</span><input name="free_ship_above" value="${rup(s.free_ship_above_paise)}" inputmode="decimal" placeholder="Leave 0 to always charge"></label>
      </div>
    </section>
    ${admin ? html`<section class="cbox"><h2>${shop ? 'Owner and status' : 'Shop owner account'}</h2>
      ${shop ? html`<p>Owner: <b>${s.owner_name}</b> (${s.owner_email})</p>` : html`
        <p class="hint">Enter the owner's email. If they already have a seller account it is linked, otherwise a new account is created with the details below.</p>
        <div class="grid2"><label class="field"><span>Owner email</span><input name="owner_email" type="email" required></label>
        <label class="field"><span>Owner name</span><input name="owner_name" maxlength="60"></label></div>
        <div class="grid2"><label class="field"><span>Owner mobile</span><input name="owner_phone" inputmode="numeric" maxlength="14"></label>
        <label class="field"><span>Temporary password</span><input name="owner_password" type="text" autocomplete="off" placeholder="8+ characters, letters and numbers"></label></div>`}
      <label class="field"><span>Status</span><select name="status">${[['approved', 'Approved (visible to customers)'], ['pending', 'Pending approval'], ['suspended', 'Suspended (hidden)']].map(([v, l]) => html`<option value="${v}" ${s.status === v ? raw('selected') : ''}>${l}</option>`)}</select></label>
    </section>` : ''}
    <p class="form-error" hidden></p>
    <div class="btnrow"><button class="btn big" type="submit">${shop ? 'Save shop' : admin ? 'Add shop' : 'Create my shop'}</button>
      <a class="btn ghost big" href="#/${admin ? 'admin/shops' : 'seller'}">Cancel</a></div>
  </form>`;
}

onSubmit('shop', async (f) => {
  const { scope, id } = f.dataset;
  const fd = new FormData(f);
  const logo = fd.get('logo');
  if (logo && logo.size === 0) fd.delete('logo');
  else if (logo && logo.size) fd.set('logo', await compressImage(logo, 600), logo.name);
  const url = scope === 'seller' ? '/seller/shop' : id ? `/admin/shops/${id}` : '/admin/shops';
  await api(id ? 'PUT' : 'POST', url, undefined, { form: fd });
  toast(id ? 'Shop saved' : scope === 'seller' ? 'Shop created. We will review it shortly.' : 'Shop added');
  go(scope === 'seller' ? '/seller' : '/admin/shops');
});
