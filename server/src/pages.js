// Cloudflare Pages entry (advanced mode). Pages gives a neutral <project>.pages.dev address,
// unlike workers.dev which carries the account's subdomain. The API is the same Worker;
// everything else is a static file from ./public, with the security headers added here
// because Pages does not apply _headers to responses that pass through _worker.js.
import worker from './index.js';

const STATIC_HEADERS = {
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: mediastream:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'permissions-policy': 'camera=(self), microphone=()',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname.startsWith('/api/')) return worker.fetch(request, env, ctx);
    if (url.pathname.startsWith('/_')) return new Response('not found', { status: 404 });
    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(STATIC_HEADERS)) out.headers.set(k, v);
    return out;
  },
};
