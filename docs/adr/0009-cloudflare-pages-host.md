# ADR 0009 — Cloudflare Pages as an alternative static host

**Date:** 2026-07-09
**Status:** Accepted
**Supersedes:** none (ADR 0008 stays valid; this is an alternative host)

## Context

ADR 0008 chose self-hosted nginx as the delivery surface for the ADR 0005
privacy promise, specifically because it lets the CSP ship as an HTTP response
header (parsed before any HTML) rather than a weaker `<meta>` tag. That
requirement — "CSP delivered as a response header" — is the constraint that
drove the host choice, not nginx itself.

The domain's DNS is managed on Cloudflare. For an operator already on
Cloudflare, Cloudflare Pages offers:

- Automatic TLS termination (satisfies the `getUserMedia` HTTPS requirement).
- Automatic HTTP→HTTPS redirect (no port-80 server block to maintain).
- Native static-file serving from `dist/`, with hashed-asset caching.
- A `_headers` file mechanism that delivers CSP and the full ADR 0008
  security-header set as **HTTP response headers** — exactly the robustness
  property ADR 0008 required.
- Zero server to patch, back up, or harden at the OS level.

## Decision

Add **Cloudflare Pages** as a supported host, equal in status to nginx.
Delivery hardening is reproduced via `public/_headers`, which Vite copies into
`dist/` verbatim so Cloudflare Pages picks it up at the edge.

`public/_headers` is now the source of truth for the security-header baseline
when deploying to Cloudflare Pages; `nginx.conf` remains the source of truth
for the nginx path. The two are kept in lockstep: any change to the CSP or
security headers must be reflected in both.

Header semantics are preserved unchanged from ADR 0008:

- CSP allow-lists `'self'` + `https://cdn.jsdelivr.net` (MediaPipe JS/wasm) +
  `https://storage.googleapis.com` (the `.tflite` model) — moving host does
  not alter which third-party hosts are trusted.
- HSTS without `preload` (domain stays portable, per ADR 0008).
- `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
  `X-Content-Type-Options: nosniff`, and the `Permissions-Policy`
  blast-radius limit all carry over.
- Hashed assets under `/assets/*` get `Cache-Control: public, max-age=31536000,
  immutable` (the Pages equivalent of nginx's `expires 1y`).

Because a Cloudflare Pages `_headers` block applies only the headers from the
most specific matching path (a less-specific `/*` block does not cascade
down), the `/assets/*` block repeats the full security-header set explicitly
rather than relying on inheritance.

## Consequences

- ADR 0005's privacy claim remains header-enforced on both hosts — no
  weakening to a `<meta>` CSP on Cloudflare.
- Two delivery configs must be kept in sync (`public/_headers` and
  `nginx.conf`). This is a small maintenance cost for host portability.
- Operator guidance: disable **Rocket Loader** on the Cloudflare zone — it
  rewrites `<script>` tags and can interfere with the module worker and CSP.
- TLS, HSTS, and HTTP→HTTPS redirect are managed by Cloudflare, removing
  those concerns from the operator's plate (and removing the corresponding
  nginx server blocks from needing maintenance on the Pages path).
- The choice between nginx and Cloudflare Pages is operational, not
  architectural: both satisfy ADRs 0005 and 0008.
