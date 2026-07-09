# ADR 0007 — Explicit finite-state machine drives the UI

**Date:** 2026-06-26
**Status:** Accepted

## Context

The app is specified as a "3-state machine" (Spec picker → Live capture →
Preview + Download). But after resolving failure handling, the state space has
several orthogonal session flags and per-transition cleanup obligations:

- BG-Replacement-Unavailable (session flag).
- Camera-error type (not-found / permission-denied / other).
- Model state (load failure vs execution failure).
- Mandatory cleanup on every transition: stop camera stream on capture;
  re-acquire on Retake; release everything on New preset; revoke object URLs on
  download; tear down on tab visibility-hide.

Implementing this as implicit DOM show/hide driven by ad-hoc flags is where
vanilla-TS apps rot into ghost-state bugs — a flag half-set, a section visible
that shouldn't be, the camera stream not released because a transition didn't
fire its cleanup.

## Decision

Drive the UI with an **explicit finite-state machine** in a `state.ts` module:

- Named states: `pick-spec | live | preview` (plus error sub-states reachable
  from each).
- Named, guarded transitions: `capture()`, `retake()`, `newPreset()`,
  `cameraFailed(reason)`, `modelFailed(kind)`, `visibilityHidden()`, etc.
- A single `render(state)` function performs all DOM mutation.
- Transition handlers are the **only** place camera/model/DOM/object-URL state
  mutates. Entry/exit cleanup (camera stop, stream release, URL revocation) is
  owned by the transition, so it cannot be forgotten.

This is a switch statement over ~3 states and ~7 events, not a framework.

## Consequences

- Cleanup invariants (camera released on capture, object URLs revoked) are
  mechanically enforced — no ghost state.
- Transition logic is pure and unit-testable independent of the DOM.
- Adding a state or transition is a localized change to the transition table,
  not a scatter of flag toggles.
- `render()` is the single point of DOM mutation, making the UI deterministic
  from state.
