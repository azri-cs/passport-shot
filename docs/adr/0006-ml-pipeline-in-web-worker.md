# ADR 0006 — ML pipeline runs in a Web Worker

**Date:** 2026-06-26
**Status:** Accepted

## Context

The capture→preview flow shows a "Processing…" spinner during segmentation and
compositing (the two-stage visual: freeze frame → show raw → swap to processed).
But MediaPipe `ImageSegmenter.segment()` runs synchronously on the calling
thread by default (wasm on the calling thread; GPU delegate offloads to GPU but
the JS orchestration still blocks).

If segmentation takes 200–500ms on a mid-range phone, that is 200–500ms of a
frozen main thread. During the freeze: the "Processing…" spinner cannot animate
(no `requestAnimationFrame` ticks), the frozen frame is unresponsive to taps,
and the CSS swap from raw to processed cannot paint until the synchronous work
returns. The spinner-that-doesn't-spin is a telltale "janky app" signal.

## Decision

Run the entire segment→mask→composite pipeline in a **Web Worker**:

- `initSegmenter()` (model + wasm load from CDN), the warmup-gate probe
  (ADR 0004), mask erosion (pre-composite), threshold+feather, and
  alpha-composite onto white all run inside the worker.
- The main thread posts the captured (un-mirrored, per ADR 0002) `ImageData` in
  and receives a finished mask or composite `ImageData` back.
- The main thread retains crop, sheet tiling, DOM, and downloads — these are
  cheap and benefit from direct DOM access.
- The warmup-gate result (segmentation available vs unavailable) is posted out
  as the session gate signal.

## Consequences

- The main thread stays free during processing; the spinner animates, Retake
  taps register, and the two-stage visual from ADR 0001 is honest.
- Worker messaging overhead is small for one frame per capture.
- CSP `worker-src 'self' blob:` is required (allowed per ADR 0005's policy).
- The worker hosts most of the pure, unit-testable functions (mask generation,
  compositing); these can be tested directly in a worker-aware test harness as
  well as via the main-thread imports.
