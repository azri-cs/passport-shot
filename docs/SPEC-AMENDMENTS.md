# Spec Amendments — My Passport Photo

The design spec (`docs/superpowers/specs/2026-06-25-my-passport-photo-design.md`)
is the **frozen, as-approved snapshot** dated 2026-06-25. This file is the
**delta**: every value or decision in the spec that has been superseded by a
later decision, with its authoritative reference. An implementer must read the
spec *plus* this file.

All amendments arose from a design grilling session (Q1–Q41) on 2026-06-26.
Authoritative rationale lives in `docs/adr/`.

## Positioning

| Spec | Amended to | Ref |
|---|---|---|
| Implicitly "spec-compliant" output | **Best-effort guided tool** — no compliance guarantee; UI + README state "guide only — verify against official requirements." | ADR 0001 |

## Geometry / crop

| Spec | Amended to | Ref |
|---|---|---|
| `crop.ts`: "Fixed center crop of the full captured frame" | **Overlay rect is the crop contract.** The on-screen overlay rect, mapped into sensor space via an explicit mirror transform, is what gets cropped. No blind center-crop path exists. | ADR 0002 |
| Overlay drawn "over `<video>` … sized to preset aspect ratio" (imprecise) | Overlay rect computed from sensor↔display mapping; **front-camera sensor rect derived via mirror transform** (`sensorX = sensorWidth − (displayX + displayWidth)`). Captured frame un-mirrored before segmentation. | ADR 0002 |
| `headHeightPct` ~0.56 / ~0.58 (semantics undefined) | Single fraction sizing the oval within the crop rect; anchored with a fixed default crown margin. **MyKad 0.58 is intentional** (window includes shoulder area) — do not "correct" upward. | CONTEXT.md note |

## Sheet / output

| Spec | Amended to | Ref |
|---|---|---|
| `sheet.ts`: "tile N times" (N undefined) | **Fixed per preset**: passport 2×3 = 6, MyKad 4×5 = 20. Stored as `sheetCols`/`sheetRows` in `PhotoSpec`. Photos edge-to-edge; thin bisecting cut-guide lines. | ADR 0003 |
| 4R sheet (target audience undefined) | **Photo-lab-printable 4×6″ @300dpi target.** Cut guides subtle (light gray, ~1px). README: "print as 4R, do not scale." | ADR 0003 |
| "exact physical mm size" | **Nominally exact, <0.1% rounding tolerance.** Presets are mm-defined, px-derived via `Math.round(mm / 25.4 × dpi)`. | ADR 0003 |
| px @300dpi (413×591, 272×354) with mixed rounding | Consistent `Math.round` on both axes. | ADR 0003 |
| JPEG output, quality 0.95 | **JPEG quality 0.98** for both single and sheet (kills white-edge ringing; negligible size cost). | — (Q21) |
| JPEG via `canvas.toBlob` (no DPI) | **DPI metadata written into both JPEGs**: sheet → 300 DPI, single → preset `dpi`. Hand-rolled JFIF density byte-patch, unit-tested. | ADR 0003 |
| Tile layout (placement undefined) | **Block-centered tiling**: integer tile-grid block centered in sheet; only block origin rounded; tiles at clean integer coords with exact integer size. | ADR 0003 |
| Single + sheet previews shown equally | **Single photo is primary** (large, inspectable); sheet is secondary (small, "layout preview"). Quality judgment steered to the single photo. | — (Q20) |

## ML pipeline

| Spec | Amended to | Ref |
|---|---|---|
| `segmenter.ts`: "return person mask" as `ImageData` | MediaPipe returns a **soft Float32 confidence mask**. Pipeline: ~1px erosion → **threshold+feather band** (keep `> 0.85`, white `< 0.15`, smooth alpha between) → alpha-composite onto white. | — (Q17/Q18) |
| `background.ts`: "optional 1px feather for hair edges" | ~1px **mask erosion** before feathering (trims gray-prone hair fringe). Full color decontamination deferred to v2. | — (Q18) |
| Model `selfie_segmenter.tflite` (binary) | **Confirmed binary person mask** (not multiclass). Failure modes (hand, bystander) visible in preview; user Retakes. | — (Q19) |
| Segmentation on main thread (implied) | **Entire ML pipeline runs in a Web Worker** (init + warmup gate + mask processing + composite). Main thread does crop/sheet/DOM. CSP `worker-src 'self' blob:`. | ADR 0006 |
| `background.ts` / `crop.ts` as single modules | **Split pure from impure**: `crop.ts` (pure scaling) + sensor-rect in `main.ts`/`geometry.ts`; `background.ts` → `mask.ts` + `composite.ts`. Each stage independently unit-testable. | — (Q22) |

## Failure handling

| Spec | Amended to | Ref |
|---|---|---|
| "Model load failure" (single bucket) | **Three classes**: (1) load failure (network/CDN/CSP) → Retry; (2) execution failure (wasm/SIMD won't run) → New preset, no Retry; (3) warmup-gate failure → BG-Replacement-Unavailable. | ADR 0004, — (Q26) |
| Warmup "on first capture" (implied) | **Warmup-as-gate**: probe segmentation during `initSegmenter()` classifies the device for the whole session. | ADR 0004 |
| Segmentation timeout → fall back per-capture | Confirmed: per-capture timeout degrades that one capture; **session gate** handles systemic failure. | ADR 0004 |
| "Camera permission denied / no camera" (single message) | **Differentiated by `err.name`**: `NotFoundError` → "no camera"; `NotAllowedError` → "permission blocked, reset in browser settings" (no Retry, just New preset); other/timeout → generic + Retry. | — (Q14) |
| "Processing…" state (implied main-thread) | Two-stage visual: **freeze captured frame, show raw instantly, swap to processed.** Honest spinner requires the Web Worker (ADR 0006). | ADR 0006, — (Q7) |

## Camera lifecycle

| Spec | Amended to | Ref |
|---|---|---|
| Camera stop timing unspecified | **Stop stream on capture**; re-acquire on Retake (~200ms flicker accepted); stop on New preset/Cancel; stop on tab visibility-hide. | — (Q8) |
| `camera.ts` constraints unspecified | Request **1280×720 ideal**; verify actual sensor resolution ≥ overlay-region need; accept or warn on shortfall. | — (Q12) |
| `getUserMedia({ video: true })` (implied) | **Video-only**: `{ video: {...}, audio: false }`. | — (Q32) |
| `<video>` attributes unspecified | **`playsinline`, `muted`, `autoplay`** as HTML attributes, set before `srcObject` (iOS-critical). iPhone Safari + Android Chrome in manual test matrix. | — (Q32) |
| Front/back toggle (mirroring unspecified) | **Front**: mirrored preview, un-mirror captured frame before segmentation. **Back**: no mirror, third-party shooter. | ADR 0002, — (Q13) |
| Model load timing unspecified | **Lazy `initSegmenter()` on entering State 2, in parallel with `getUserMedia()`** (not eager, not on-capture). | — (Q16) |

## State / UI

| Spec | Amended to | Ref |
|---|---|---|
| "3-state machine" (impl unspecified) | **Explicit FSM** in `state.ts`: named states, guarded named transitions, single `render(state)`, transitions own all cleanup (camera stop, URL revocation, stream release). | ADR 0007 |
| Browser gate: "no `getUserMedia` / no `OffscreenCanvas`" | **Gate on `getUserMedia` + HTTPS-context only.** Drop the `OffscreenCanvas` phantom gate (not used). Wasm/SIMD failures surface as execution failures (Q26). | — (Q28) |
| (No accessibility provisions) | **Baseline a11y built in**: full keyboard operability, semantic HTML + ARIA, `aria-live` for transitions/errors, text equivalents for overlay/preview, `prefers-reduced-motion` respected, honest "framing requires sight" README note. | — (Q24) |

## Downloads

| Spec | Amended to | Ref |
|---|---|---|
| Downloads via `<a download>` + object URL (failure path unspecified) | **Generate-on-demand per button**; revoke object URLs after navigation; per-button `toBlob` failure messages; no pre-generation. | — (Q30) |
| (No canvas-taint handling) | **Taint invariant documented** at canvas-draw sites; catch `SecurityError` with a dedicated message; future image-upload features must use `crossorigin="anonymous"` + CORS. | — (Q29) |

## Hosting / privacy / security

| Spec | Amended to | Ref |
|---|---|---|
| "All processing in-browser, photos never leave the device" (principle only) | **CSP-enforced**: `connect-src` limited to `'self'` + jsDelivr (wasm/JS) + `storage.googleapis.com` (model file); no analytics/telemetry/error-reporting. Promise is machine-enforced, not verbal. | ADR 0005 |
| MediaPipe from CDN (unspecified precision) | `script-src` allow `'self'` + `https://cdn.jsdelivr.net`; `connect-src` allow `'self'` + `https://cdn.jsdelivr.net` + `https://storage.googleapis.com` (model file); **`@mediapipe/tasks-vision` version-pinned**; loaded as ESM `FilesetResolver.forVisionTasks` (in Worker, not bundled). `img-src 'self' blob:`; `worker-src 'self' blob:`; `default-src 'none'`. | ADR 0005, — (Q34/Q38) |
| Hosting unspecified | **Self-hosted nginx** serving static `dist/`, TLS (Let's Encrypt/supplied), tracked `nginx.conf`. | ADR 0008 |
| (No security headers) | **Full baseline** via nginx header: CSP + HSTS (`includeSubDomains`, **no preload**) + `nosniff` + `Referrer-Policy: no-referrer` + `X-Frame-Options: DENY` + `Permissions-Policy: camera=(self), microphone=(), …`. | ADR 0008 |

## Build / dependencies

| Spec | Amended to | Ref |
|---|---|---|
| "Only `@mediapipe/tasks-vision` runtime dep" | Confirmed for runtime (CDN-loaded, not bundled). **Build-time**: Vite + Vitest + **happy-dom** (DOM shim for pure-function tests) + TypeScript. Zero bundled runtime deps. | — (Q36) |
| JPEG DPI (none from canvas) | Hand-rolled JFIF density byte-patch (no new dep), unit-tested. | ADR 0003 |
