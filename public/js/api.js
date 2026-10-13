// Thin wrapper around fetch for the JSON API. Cookies carry the login session.
export async function api(method, url, body, opts = {}) {
  const init = { method, credentials: 'same-origin', headers: { 'X-Requested-With': 'ChickpetBaazar' } };
  if (opts.form) {
    init.body = opts.form; // multipart (photos)
  } else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch('/api' + url, init);
  } catch {
    throw new Error('Could not reach the server. Check your internet connection and try again.');
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || 'Something went wrong. Please try again.');
    err.status = res.status;
    throw err;
  }
  return data;
}

export const get = (u) => api('GET', u);
export const post = (u, b) => api('POST', u, b);
export const put = (u, b) => api('PUT', u, b);
export const del = (u) => api('DELETE', u);
