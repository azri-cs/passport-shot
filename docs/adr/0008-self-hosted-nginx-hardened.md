# ADR 0008 — Self-hosted on nginx with a hardened security-header baseline

**Date:** 2026-06-26
**Status:** Accepted

## Context

The app is client-side only (no login, no storage, no backend). The "server"'s
only job is: serve static built files, terminate HTTPS (`getUserMedia` requires
it), and deliver the CSP header that enforces ADR 0005's privacy promise.
Where and how it is hosted constrains whether the CSP can be delivered as a
header (robust, parsed before any HTML) vs a meta tag (weaker, parsed with the
HTML).

Beyond CSP, a self-hosted browser app is missing baseline security headers that
reinforce ADR 0005's privacy posture and cost nothing to add.

## Decision

**Host on a self-managed nginx** serving static `dist/`, with TLS (Let's Encrypt
or supplied cert) and a tracked `nginx.conf`.

**Deliver CSP as an HTTP response header** (not a meta tag) so it is in effect
before the first byte of HTML parses — maximally robust enforcement of ADR 0005.

**Ship the full baseline security-header set** in the nginx config:

- `Content-Security-Policy` — per ADR 0005 / Q34 (amended for MediaPipe model
  host): `default-src 'none'`; `script-src` allow `'self'` + `https://cdn.jsdelivr.net`
  (JS glue + wasm); `connect-src` allow `'self'` + `https://cdn.jsdelivr.net`
  (wasm/JS fetch) + `https://storage.googleapis.com` (`.tflite` model);
  `img-src 'self' blob:`; `worker-src 'self' blob:`; `style-src 'self'`;
  `frame-ancestors 'none'`.
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` — **without
  `preload`** (keeps the domain portable for an MVP).
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: no-referrer` — strongest; leaks nothing to the CDN on
  MediaPipe fetches.
- `X-Frame-Options: DENY` (defense in depth alongside CSP `frame-ancestors`) —
  prevents camera-permission clickjacking.
- `Permissions-Policy: camera=(self), microphone=(), geolocation=(), ...` —
  blast-radius limit; `microphone=()` is belt-and-suspenders to the video-only
  `getUserMedia` constraint.

## Consequences

- ADR 0005's privacy claim is header-enforced and version-controlled in the repo.
- Each header addresses a concrete threat: HSTS → camera-silently-fails on
  downgrade; frame-options → camera clickjacking; Permissions-Policy → feature
  blast radius; Referrer-Policy → no leakage to CDN.
- HSTS without `preload` means the domain can still be changed at MVP stage.
- The nginx config is the single source of truth for delivery hardening —
  changing any of it is a visible, reviewable commit.
