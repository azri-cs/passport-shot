# ADR 0005 — CSP-enforced "photos never leave the device"

**Date:** 2026-06-26
**Status:** Accepted

## Context

The app's headline promise is "all image processing happens in the browser, so
photos never leave the device." This is the product's main selling point. As a
stated principle alone it is only as strong as developer discipline; a future
mistake (an error-reporter that logs a canvas data URL, an analytics script, a
fetch to `/api/upload`) could exfiltrate captured pixels silently.

Two parts of the architecture touch the network:

1. **MediaPipe wasm + JS glue** are **vendored in-repo** (`public/vendor/
   mediapipe/`) and served same-origin. This was a deliberate change from
   CDN-loading: the wasm glue loader needs `importScripts`/`document`, which
   module workers lack, and jsDelivr's `vision_bundle.js` path 404s for
   `tasks-vision@0.10.34` (the file is `vision_bundle.mjs`). Vendoring makes
   the app work and reduces third-party trust to the model host alone.
   Segmentation runs fully client-side. Safe for the promise.
2. **The selfie-segmenter model** (`selfie_segmenter.tflite`) is fetched from
   `storage.googleapis.com/mediapipe-models/`. This carries model bytes only —
   no image data — and must be allow-listed in the CSP.
3. **Everything else:** no backend, no storage, no accounts.

## Decision

Make the privacy promise **enforceable by Content Security Policy**, not merely
verbal.

- A CSP is applied (HTTP response header from the self-hosted nginx — see
  ADR 0008, and `public/_headers` for Cloudflare Pages) with `connect-src`
  restricted to `'self'` and the Google Storage model host (the `.tflite`
  model file). `script-src` includes `'wasm-unsafe-eval'`, which browsers
  require to compile/instantiate the vendored wasm under CSP.
- No analytics, telemetry, or error-reporting of any kind is included.
- README states the enforceable claim: the only network fetch is the
  one-time model load (no image data); CSP blocks all other outbound
  connections, so even a future bug cannot exfiltrate a canvas pixel.

Rejected alternative — keep MediaPipe CDN-loaded: the ESM bundle cannot be
cross-origin-`import()`ed from a module worker, and the wasm loader's
`importScripts` fallback needs a document context, so a worker-based CDN setup
cannot work in modern browsers.

## Consequences

- The privacy claim is verifiable and machine-enforced, not aspirational.
- Adding any analytics or future backend requires an explicit CSP change — a
  visible, reviewable action, not a silent slip.
- Observability is limited by design (no error reporting); errors must be
  diagnosed from local browser state.
- The model host (`storage.googleapis.com`) must be allow-listed precisely in
  `connect-src`. If the model distribution URL ever changes, the CSP must be
  updated to match.
- `public/vendor/mediapipe/` (~23 MB of wasm + JS) is tracked in-repo so the
  app has no runtime dependency on a JS CDN.
