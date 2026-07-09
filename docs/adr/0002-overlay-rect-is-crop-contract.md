# ADR 0002 — The overlay rect is the crop contract

**Date:** 2026-06-26
**Status:** Accepted

## Context

There are two coordinate systems in play at capture time:

1. The live `<video>` element, displayed at the camera sensor's aspect ratio
   (typically 4:3 or 16:9).
2. The preset's target aspect ratio (e.g., 35:50 = 0.7 for passport).

If the crop is a blind geometric center-crop of the full captured frame, while
the overlay is drawn in *display space* over the video, the cropped region will
not match what the user framed against the on-screen oval. The user aligns to
one rectangle and gets cropped to another. This defeats the entire purpose of
the overlay.

## Decision

The **on-screen overlay rectangle is the single source of truth for the crop**.
The same rect — mapped from display space into sensor-pixel space via the
video's intrinsic dimensions — is what gets cropped. The overlay is a contract,
not decoration.

Concretely: compute the overlay rect once (sensor-px ↔ display-px mapping from
the video's intrinsic dimensions), draw the oval inside it, and crop that exact
sensor rect.

**Mirror handling (refinement).** The front camera displays a mirrored preview
but must store the un-mirrored (real-world) frame. The sensor rect is computed
from the display rect via an **explicit mirror transform**
(`sensorX = sensorWidth − (displayX + displayWidth)`), so the mapping is correct
by construction even for asymmetric ovals. There is no hidden "works because the
oval is symmetric" invariant to violate. The captured frame is un-mirrored
*before* segmentation, so the entire pipeline operates in one consistent
(real-world) coordinate space. The back camera applies no mirroring anywhere.

## Consequences

- What the user framed is what they get; the overlay is honest.
- `headHeightPct` is a single fraction that sizes the oval within the crop rect
  (anchored with a fixed default crown margin); it is a real geometric parameter,
  not a loose hint.
- Requires correct sensor↔display mapping **under mirror**; this mapping is the
  place where framing bugs will live, and must be unit-tested with explicit
  mirror cases.
- A separate "blind center-crop" code path does not exist; there is one crop
  definition.
