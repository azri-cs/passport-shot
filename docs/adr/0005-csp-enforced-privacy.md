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

1. **MediaPipe wasm + JS glue** are fetched from jsDelivr CDN on first load.
   This carries wasm/JS bytes only — no image data. Segmentation runs fully
   client-side. Safe for the promise.
2. **The selfie-segmenter model** (`selfie_segmenter.tflite`) is fetched from
   `storage.googleapis.com/mediapipe-models/`. This also carries model bytes
   only — no image data — but it is a **separate host** from the JS/wasm CDN
   and must be allow-listed independently in the CSP.
3. **Everything else:** no backend, no storage, no accounts.

## Decision

Make the privacy promise **enforceable by Content Security Policy**, not merely
verbal.

- A CSP is applied (HTTP response header from the self-hosted nginx — see
  ADR 0008) with `connect-src` restricted to `'self'`, the jsDelivr CDN host
  (wasm + JS), and the Google Storage model host (the `.tflite` model file).
- No analytics, telemetry, or error-reporting of any kind is included.
- README states the enforceable claim: the only network fetches are the
  one-time model/wasm load (no image data); CSP blocks all other outbound
  connections, so even a future bug cannot exfiltrate a canvas pixel.

Rejected alternative — self-host the model/wasm (same-origin only, `connect-src
'self'`): purer, but ships several MB of wasm in-repo at MVP for marginal gain
over a locked-down CSP.

## Consequences

- The privacy claim is verifiable and machine-enforced, not aspirational.
- Adding any analytics or future backend requires an explicit CSP change — a
  visible, reviewable action, not a silent slip.
- Observability is limited by design (no error reporting); errors must be
  diagnosed from local browser state.
- The MediaPipe CDN host (`cdn.jsdelivr.net`) and the model host
  (`storage.googleapis.com`) must both be allow-listed precisely in
  `connect-src`. If the model distribution URL ever changes, the CSP must be
  updated to match.
