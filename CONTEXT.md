# Domain Glossary — My Passport Photo

A client-side web app that captures a camera frame and converts it into a
best-effort Malaysia passport/MyKad-format photo plus a printable tiled sheet.
All image processing runs in the browser; no photo data leaves the device.

This file is a glossary only — no implementation details. Decisions live in
`docs/adr/`.

## Terms

- **Preset** — A named, stored photo specification (size in mm, dpi,
  head-height fraction, background colour, sheet layout). The unit the user
  chooses in State 1. Currently: *Malaysia Passport*, *MyKad Photo Window*.
  Presets are **mm-defined, px-derived**: output px = `Math.round(mm / 25.4 × dpi)`.

- **PhotoSpec** — The data record that defines a Preset. The canonical source of
  output dimensions, head-height fraction, and 4R sheet tiling (cols/rows).

- **Capture** — The act of grabbing one still frame from the live camera feed.
  The captured frame is the input to the rest of the pipeline. The camera stream
  is **stopped** the instant a frame is captured.

- **Overlay Rect** — The on-screen rectangle (containing the dashed oval guide)
  drawn over the live `<video>`. It is the **single source of truth for the crop**:
  the same rect, mapped into sensor space via an explicit mirror transform, is
  what gets cropped. The overlay is a contract, not decoration.

- **Segment** — The ML step that produces a person mask via MediaPipe
  `ImageSegmenter`. Runs entirely in the **Pipeline Worker** on the un-mirrored
  captured frame. Produces a soft (Float32) confidence mask, not a binary one.

- **Mask processing** — The pipeline applied to the raw mask: ~1px erosion
  (trims gray-prone hair fringe) → threshold+feather band (hard keep `> 0.85`,
  hard white `< 0.15`, smooth alpha in between) → alpha-composite onto pure white.

- **Crop** — Extracting the overlay-rect region from the (background-replaced)
  frame and scaling it to the preset's exact pixel dimensions.

- **4R Sheet** — A 1200×1800px (4×6″ @300dpi) print sheet that tiles one cropped
  photo multiple times with thin cut-guide lines. A **photo-lab-printable**
  artefact: each tile reproduces at the preset's nominally-exact physical mm
  size when printed at 4×6″ actual size. Tile counts are fixed per preset
  (passport 2×3 = 6; MyKad 4×5 = 20).

- **Pipeline Worker** — The Web Worker that hosts `initSegmenter`, the warmup
  gate, mask processing, and compositing. Keeps the main thread free so the
  "Processing…" indicator animates and the UI stays responsive during ML work.

- **Warmup Gate** — A probe segmentation run inside the Pipeline Worker during
  `initSegmenter()` on a dummy frame. Its success/failure classifies the device
  for the whole session. Distinct from a *model load failure* (network/CDN/CSP)
  and an *execution failure* (wasm/SIMD won't run) — those are separate failure
  classes with their own messaging.

- **BG-Replacement-Unavailable** — A session-scoped device flag, set when the
  Warmup Gate fails (but the model loaded and executed). When set, all captures
  ship with the **original background** (clearly labelled); segmentation is not
  attempted again that session.

- **State Machine** — The explicit FSM (`pick-spec | live | preview` plus error
  sub-states) that drives all UI. Transition handlers are the sole site of
  camera/stream/DOM/object-URL mutation, enforcing cleanup invariants.

### Note on head-height semantics

`headHeightPct` measures **head height as a fraction of frame height**. For the
passport preset (~0.56) this mirrors the 25–30mm-head-in-50mm-frame biometric
ratio. For the MyKad preset (~0.58) it is *not* a smaller head — the MyKad photo
window includes substantial shoulder area, so head-as-fraction-of-frame is
naturally lower than a naive head-only reading would suggest. This is intentional;
do not "correct" the MyKad value upward.
