// Login, sign up, logout and the account page.
import { html, raw } from './util.js';
import { get, post, put } from './api.js';
import { state, mount, go, toast, onClick, onSubmit, hooks } from './core.js';
import { refreshCart } from './shop.js';

const homeFor = (u) => (u.role === 'admin' ? '/admin' : u.role === 'seller' ? '/seller' : '/');

async function afterAuth(user) {
  state.user = user;
  await refreshCart();
  hooks.header();
  const next = sessionStorage.getItem('cb_next');
  sessionStorage.removeItem('cb_next');
  go(next && next.startsWith('/') && !/^\/(login|signup)/.test(next) ? next : homeFor(user));
}

export function loginView() {
  if (state.user) return go(homeFor(state.user), true);
  mount(html`<div class="page narrow"><div class="authcard"><div class="temple"></div>
    <h1>Log in</h1>
    <form data-form="login" novalidate>
      <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required autofocus></label>
      <label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>
      <p class="form-error" hidden></p>
      <button class="btn block big" type="submit">Log in</button>
    </form>
    <p class="authalt">New to ChickpetBaazar?</p>
    <a class="btn ghost block" href="#/signup">Create your account</a>
    <a class="btn ghost block" href="#/signup?role=seller">Open a shop account</a>
  </div></div>`);
}

onSubmit('login', async (f) => {
  const d = Object.fromEntries(new FormData(f));
  const { user } = await post('/auth/login', { email: d.email, password: d.password });
  toast(`Welcome back, ${user.name.split(' ')[0]}`);
  await afterAuth(user);
});

export function signupView(query) {
  if (state.user) return go(homeFor(state.user), true);
  const seller = query.get('role') === 'seller';
  mount(html`<div class="page narrow"><div class="authcard"><div class="temple"></div>
    <h1>Create your account</h1>
    <form data-form="signup" novalidate>
      <fieldset class="seg"><legend class="sr">I want to</legend>
        <label><input type="radio" name="role" value="customer" ${seller ? '' : raw('checked')}><span>Shop for fabrics</span></label>
        <label><input type="radio" name="role" value="seller" ${seller ? raw('checked') : ''}><span>Sell from my shop</span></label></fieldset>
      <label class="field"><span>Your name</span><input name="name" autocomplete="name" required maxlength="60"></label>
      <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>
      <label class="field"><span>Mobile number</span><input name="phone" inputmode="numeric" autocomplete="tel-national" required maxlength="14" placeholder="10-digit number">
        <small>We send order updates to this number on WhatsApp.</small></label>
      <label class="field"><span>Password</span><input name="password" type="password" autocomplete="new-password" required minlength="8">
        <small>At least 8 characters with a letter and a number.</small></label>
      <p class="form-error" hidden></p>
      <button class="btn block big" type="submit">Create account</button>
    </form>
    <p class="authalt">Already have an account? <a href="#/login">Log in</a></p>
  </div></div>`);
}

onSubmit('signup', async (f) => {
  const d = Object.fromEntries(new FormData(f));
  const { user } = await post('/auth/signup', d);
  toast('Account created');
  if (user.role === 'seller') sessionStorage.setItem('cb_next', '/seller/shop');
  await afterAuth(user);
});

onClick('logout', async () => {
  await post('/auth/logout');
  state.user = null;
  state.cartCount = 0;
  hooks.header();
  toast('You have been logged out');
  go('/');
});

export async function accountView() {
  if (!state.user) { sessionStorage.setItem('cb_next', '/account'); return go('/login', true); }
  const u = state.user;
  mount(html`<div class="page narrow-wide"><h1 class="ptitle-h">Your account</h1>
    <div class="ogrid">
      <section class="cbox"><h2>Profile</h2>
        <form data-form="profile" novalidate>
          <label class="field"><span>Name</span><input name="name" value="${u.name}" required maxlength="60"></label>
          <label class="field"><span>Email</span><input value="${u.email}" disabled></label>
          <label class="field"><span>Mobile number (WhatsApp)</span><input name="phone" value="${u.phone.replace(/^91/, '')}" inputmode="numeric" required maxlength="14"></label>
          <p class="form-error" hidden></p><button class="btn" type="submit">Save profile</button></form>
      </section>
      <section class="cbox"><h2>Change password</h2>
        <form data-form="password" novalidate>
          <label class="field"><span>Current password</span><input type="password" name="current" autocomplete="current-password" required></label>
          <label class="field"><span>New password</span><input type="password" name="next" autocomplete="new-password" required minlength="8"><small>At least 8 characters with a letter and a number. You will be signed out on other devices.</small></label>
          <p class="form-error" hidden></p><button class="btn" type="submit">Change password</button></form>
      </section>
      <section class="cbox"><h2>Quick links</h2>
        <p><a href="#/orders">Your orders</a></p>
        ${u.role === 'seller' ? html`<p><a href="#/seller">Seller dashboard</a></p>` : ''}
        ${u.role === 'admin' ? html`<p><a href="#/admin">Admin panel</a></p>` : ''}
        <button class="btn ghost" data-act="logout">Log out</button>
      </section>
    </div></div>`);
}

onSubmit('profile', async (f) => {
  const d = Object.fromEntries(new FormData(f));
  const { user } = await put('/auth/me', { name: d.name, phone: d.phone });
  state.user = user;
  hooks.header();
  toast('Profile saved');
});

onSubmit('password', async (f) => {
  const d = Object.fromEntries(new FormData(f));
  await post('/auth/password', { current: d.current, next: d.next });
  f.reset();
  toast('Password changed');
});

export async function loadSession() {
  const [{ user }, meta] = await Promise.all([get('/auth/me'), get('/meta')]);
  state.user = user;
  state.meta = meta;
  await refreshCart();
}
