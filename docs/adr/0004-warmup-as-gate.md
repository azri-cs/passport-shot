# ADR 0004 — Warmup-as-gate for background-replacement failure

**Date:** 2026-06-26
**Status:** Accepted

## Context

The spec defines two segmentation failure modes that aren't cleanly separable:

- **Model won't load at all** (offline / blocked CDN) → hard stop, no photo.
- **`segment()` times out on a capture** → degrade gracefully, ship the crop
  without background replacement.

The problem: a timeout on the *first* real frame looks identical to "the model
is systemically broken on this device." If the model never works here, every
subsequent capture also times out, and the user repeatedly hits the
slow-timeout-then-degrade loop with no indication that the device is
broken-by-design rather than a fluke.

## Decision

Promote the existing `initSegmenter()` warmup to a **gate**. During init, run
one probe segmentation on a dummy/black frame.

- **Probe succeeds** → segmentation is available for the session; per-capture
  timeouts in normal operation degrade that single capture only (ship
  original-background crop, labelled).
- **Probe fails or times out** → set the session-scoped
  **BG-Replacement-Unavailable** flag. Segmentation is not attempted again this
  session; all captures ship with the original background, clearly labelled.

## Consequences

- Failure is detected up front; the user knows immediately rather than after
  repeated slow timeouts.
- Avoids repeated slow timeout-then-degrade cycles on devices where the model
  never loads.
- Per-capture transient failures still degrade gracefully without poisoning the
  session.
- The init path now has a defined, testable outcome (segmentation available vs
  unavailable) rather than a fire-and-forget warmup.
