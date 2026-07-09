# My Passport Photo — Design Spec

**Date:** 2026-06-25
**Status:** Approved (pending user spec review)
**Scope:** MVP — client-side only

## 1. Purpose

A simple, privacy-friendly web app that lets a user capture a photo with their
front or back camera and convert it into a Malaysia-spec-compliant passport/ID
photo that anyone can download. No login, no storage, no backend — all image
processing happens in the browser, so photos never leave the device.

## 2. Requirements (locked decisions)

| Decision | Choice |
|---|---|
| Document specs targeted | Malaysia Passport + MyKad photo window |
| Background handling | Auto background replacement to white (ML) |
| Face framing guidance | Static overlay guide (no face detection) |
| Output | Single photo (JPEG) **+** 4R (4×6″) tiled print sheet (JPEG) |
| Tech stack | Vite + vanilla TypeScript, no framework |
| BG replacement model | MediaPipe `@mediapipe/tasks-vision` `ImageSegmenter` with `selfie_segmenter.tflite` (current Tasks API; legacy `selfie_segmentation` package is deprecated) |
| MVP scope | Both presets in MVP |

## 3. Out of scope (YAGNI)

Live face detection, manual re-crop panning, brightness/contrast sliders,
multiple-shot gallery, undo, server storage, accounts, payment, printing
fulfilment. Retake = full recapture.

## 4. Presets (data table — `presets.ts`)

```ts
interface PhotoSpec {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
  dpi: number;            // output px = mm / 25.4 * dpi
  headHeightPct: number;  // head height as fraction of frame height
  background: string;     // "#ffffff"
}
```

| id | label | size (mm) | px @ 300dpi | head % |
|---|---|---|---|---|
| `my-passport` | Malaysia Passport | 35 × 50 | 413 × 591 | ~0.56 (≈28mm head) |
| `my-mykad` | MyKad Photo Window | 23 × 30 | 272 × 354 | ~0.58 |

**Source accuracy notes:**
- Passport spec (35×50mm, white background, head 25–30mm) is the authoritative
  Malaysian applicant-supplied format per Imigresen Malaysia and Wisma Putra.
- The MyKad card is ID-1/CR80 (85.60 × 54.00mm); the actual photo printed on
  it is a smaller portrait window. This preset outputs **that photo window**
  (~23×30mm portrait headshot), not a full card mockup. Note: JPN captures
  MyKad photos on-site biometrically and publishes no applicant-supplied spec;
  this preset is a convenience approximation of the embedded photo size.

## 5. Architecture

Single-pipeline, preset-driven (Approach A). One capture → one segmentation
pass → crop to selected preset → render single photo + 4R sheet. Adding a
preset = adding a row to the table.

**Runtime flow:**
Capture (static overlay guides framing) → Segment (BG→white) → Crop to spec →
Preview → Download (single + 4R).

## 6. Modules

Each module has one clear purpose, a well-defined interface, and can be
understood/tested independently.

| Module | Responsibility | Key API |
|---|---|---|
| `presets.ts` | Data table of specs | `PRESETS: PhotoSpec[]`, `getPreset(id)` |
| `camera.ts` | `getUserMedia` management, device enumeration, front/back switching | `startCamera(facing)`, `stopCamera()`, `switchFacing()`, `listDevices()` → emits active `MediaStream` |
| `segmenter.ts` | Lazily load MediaPipe `ImageSegmenter` (CDN wasm + model, GPU delegate); run segmentation on one frame; return person mask. Single shared instance, warm up on first capture | `initSegmenter()`, `segment(videoEl): ImageData` (mask) |
| `background.ts` | Composite person onto pure white using mask; optional 1px feather for hair edges | `applyWhiteBackground(src, mask): ImageData` |
| `crop.ts` | Fixed **center crop of the full captured frame** (after BG replacement) matching the preset's aspect ratio. Input = the entire post-segmentation frame; output = a center sub-region scaled to the preset's exact px. Because the live overlay already constrained framing at capture time, no face-detection-driven re-crop is performed. If the user framed poorly, the remedy is Retake (recapture), not in-app panning. | `cropToSpec(imageData, spec): HTMLCanvasElement` |
| `sheet.ts` | Tile single photo N times onto a 4R (4×6″ → 1200×1800px @300dpi) canvas with thin cut guides | `tile4R(singleCanvas): HTMLCanvasElement` |
| `main.ts` | DOM orchestration, overlay drawing, state machine, pipeline driver, downloads | — |
| `ui.ts` (optional helper) | DOM query/Event helpers if `main.ts` grows | — |

**Dependencies:** Only `@mediapipe/tasks-vision`. Wasm + model loaded from CDN
(jsDelivr). No other runtime deps.

## 7. UI Flow (3-state machine)

```
STATE 1: Spec picker
  [ Malaysia Passport 35×50 ]  ← selected
  [ MyKad Photo Window 23×30 ]
  [ Start camera ]
        │
        ▼
STATE 2: Live capture
  live camera feed with dashed oval overlay positioned for the preset's
  head-height %. Hint: "Align your face inside the frame."
  [⇄ Flip front/back]  [✕ Cancel]  [◉ Capture]
        │ capture frame
        ▼
STATE 3: Preview + Download (brief "Processing…" during segment+composite)
  single photo preview   [Download JPEG (single)]
  4R sheet preview       [Download JPEG (4R sheet)]
  [↻ Retake]  [New preset]
```

**UX decisions:**
- Overlay = semi-transparent dashed oval; head-height region in upper portion,
  correct chin-to-top margin. Drawn over `<video>` via canvas/CSS overlay
  sized to preset aspect ratio.
- Front/back toggle swaps `facingMode`, re-acquires stream. Default `user`
  (front) — passport photos need the subject.
- "Processing…" state shown during segmentation+composite (sub-second on most
  devices) so the freeze isn't confusing.
- Downloads via `<a download>` + object URL. JPEG quality 0.95.

**Environment/browsers:** `getUserMedia` requires HTTPS (localhost for dev).
Graceful error UI if no camera or permission denied.

## 8. Error Handling

- **Camera permission denied / no camera:** friendly message in State 1/2,
  "Retake" stays available; offer "New preset" to restart.
- **Model load failure (offline/blocked CDN):** message in State 2/3; app
  cannot proceed without the segmenter. Detect on `initSegmenter()`.
- **Segmentation timeout:** the single-shot `segment()` call is awaited with a
  timeout; on failure, fall back to offering the photo **without** background
  replacement (clearly labelled) so the user still gets a crop.
- **Unsupported browser (no `getUserMedia` / no OffscreenCanvas):** State 1
  gate message listing requirement (modern Chromium/Firefox/Safari).

## 9. Testing Strategy

- **Pure modules — unit tests (Vitest):** `crop.ts` (aspect/px math, head-%
  placement), `sheet.ts` (tile count, 4R dimensions, cut guides), `presets.ts`
  (px = mm/25.4*dpi, head-% sanity), `background.ts` (given a synthetic
  src+mask → assert white outside mask, original pixels inside).
- `segmenter.ts` / `camera.ts` — thin wrappers over browser APIs; cover with
  a light integration smoke test (mock `getUserMedia` + a static image as
  "video") rather than heavy unit tests.
- **Manual checklist:** front+back capture, both presets, single + 4R output,
  BG replacement on dark and busy backgrounds, mobile + desktop, offline/HTTPS.

## 10. Output Specifications

- **Single photo:** JPEG, quality 0.95, exact preset px (413×591 or 272×354).
- **4R sheet:** JPEG, quality 0.95, 1200×1800px (4×6″ @300dpi), N tiled copies
  with thin cut guides.
- Both downloaded as separate files via `<a download>` + object URL.
