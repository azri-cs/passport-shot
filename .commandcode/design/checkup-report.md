# Checkup Report — My Passport Photo

**Date:** 2026-08-08
**Mode:** `/design checkup`
**Score:** **34 / 60**

A focused, privacy-first single-page camera tool. Three states (pick-spec → live → preview). No framework; Vite + TS + vanilla DOM. All processing in-browser. This is a fast vital-sign read, not a deep critique.

---

## Vitals

| Vital | Status | Score |
|---|---|---|
| Intentionality | Watch | 5 / 10 |
| Readability | Healthy | 10 / 10 |
| Usability | Critical | 0 / 10 |
| Responsiveness | Watch | 5 / 10 |
| Speed | Watch | 5 / 10 |
| Accessibility | Critical | 0 / 10 |

**Total: 34 / 60**

---

## 1. Intentionality — Watch (5/10)

**What's good:** The oval framing guide is a real domain artifact. The guide-only disclaimer is honest. The camera container's aspect-ratio adapts to the chosen preset — the crop contract is architecture, not decoration.

**What's weak:** The visual design is unmarked — a centered blue button on near-white, no rhythm or hierarchy beyond the default. It reads "assembled from defaults," not "chosen." The blue `#2563eb` is the generic tech hue with no reason tied to this product. The layout is a stacked column with no visual story.

**Prescription:** A light `refine`/`recolor` pass — pick a hue with a reason (e.g., document/white-space reference, a warm neutral for a photo tool), build a real scale, and give the primary action a considered shape. The composition (3 clear states) is sound; it needs character, not a rebuild.

## 2. Readability — Healthy (10/10)

- Clear hierarchy: title (1.6rem), note (0.85rem), buttons (1rem), primary (1.1rem).
- Contrast: dark `#222` on `#fafafa` body passes; `#666` note on `#fafafa` is ~4.8:1 — fine for the large-ish secondary text. White on blue primary passes (~4.5:1). The `#dc2626` error on white is ~4.5:1.
- No overflow or clipping observed at 375px or 1280px. The note line under the title is long ("guide only — verify against official requirements") but fits on mobile.
- All labels are visible, not placeholder-dependent.

## 3. Usability — Critical (0/10)

- **Capture-error feedback is missing.** In `main.ts` the `btnCapture` handler catches errors and only `console.error`s them. If capture fails, the user sees nothing — the FSM can be stuck in `live` with a dead camera. This is a core-task blocker.
- **Selected preset has no visual state.** The preset buttons set `aria-checked` and are announced to screen readers, but the CSS selector targets `[aria-pressed="true"]` (`style.css:23`), which never matches. The selected preset looks identical to the unselected one. The user cannot tell which spec is armed before pressing Start Camera.
- **`bg-unavailable-banner` cannot be hidden.** `main.ts` toggles `.hidden` on the banner, but no CSS rule ever hides it (`style.css` has `.state.hidden` and `.processing-overlay.hidden`, but no bare `.hidden`). When background replacement is unavailable, the banner is permanently visible in the preview — a broken state.
- **No loading indicator during camera start.** The Start Camera click disables the button but gives no spinner or progress. The model load can take several seconds on a cold connection (fetching ~10MB wasm + model). The user stares at a frozen screen with no feedback.
- **No in-flow error retry.** Camera permission errors render a message into `#state1-error`, but there's no retry affordance in the live state; the user must go back via Esc/Cancel. `canRetry` from `classifyCameraError` is never used.

**Prescription:** Wire the capture error into a visible `role="alert"`; fix the preset selected-state selector; add a bare `.hidden` rule; add a start-camera loading state. The FSM is well-structured — this is mostly missing UI wiring, not architecture.

## 4. Responsiveness — Watch (5/10)

- **Tested:** 375px and 1280px rendered. The pick-spec state is clean at both. The live state uses `max-height: 75vh` on the camera container; on very short landscape screens the controls can be pushed below the fold — a contained issue, but the capture button is the primary action and should stay reachable.
- **Buttons:** `font-size: 1rem` on all controls — good, no iOS auto-zoom risk. Touch targets are adequate (≥44px) in the live/preview rows.
- **Untested widths:** 320px, 768px, 1024px, 2560px were not rendered (headless camera could not engage the live state). The pick-spec is a 640px centered column so it will hold, but the live/preview states are unverified.
- **Thumb zone:** On phones the primary capture button is mid-screen under the camera, not in the bottom thumb zone. Acceptable for a camera app (the camera occupies the screen), but the preview controls at 480px collapse to a full-width column, pushing download actions low — that's the right call.

**Prescription:** Verify the live and preview states across the viewport gauntlet once a real camera is available. Short-viewport landscape: ensure the capture control stays visible.

## 5. Speed — Watch (5/10)

- **Payload:** ~10MB of MediaPipe wasm + a ~5MB tflite model fetched from CDN at first camera start. This is the dominant cost and it's paid on the critical path (before the user can capture).
- **Mitigations present:** Model load runs in a worker (main thread stays responsive); the warmup gate runs once; the GPU→CPU fallback is sensible; the model is only fetched when the user actually starts the camera (good — not on page load).
- **Missing:** No loading UI during this multi-second window (see Usability), no caching hint for the CDN assets beyond browser default, no pre-connect/preload for the model endpoints.
- **Layout:** No layout shift observed in the pick-spec state. Processing overlay is a fixed full-screen veil — clear.

**Prescription:** Surface the warm-up phase in the UI ("Preparing camera…"), and consider `<link rel="preconnect">` to the two CDN origins. If the model load dominates, a cached-first strategy (service worker or local model copy) would remove the cold-start stall entirely.

## 6. Accessibility — Critical (0/10)

- **ARIA mismatch:** preset buttons set `aria-checked` but the CSS and semantics expect `role="radio"` with `aria-checked` — the attribute itself is correct for a radio, but the **visual selected state selector is wrong** (`aria-pressed`), so the state is invisible to sighted users (also a usability failure). For screen readers the radio role + checked state is acceptable.
- **Capture button is announced as `◉ Capture`** — the icon glyph may be read aloud awkwardly or skipped; the `aria-label="Capture photo"` is present and correct.
- **Focus styles:** `:focus-visible` has a clear 3px blue ring. Good.
- **`sr-only` announcer exists** for live regions. Good.
- **Camera permission error** has `role="alert"` — good, but the **live-state errors** (capture failure) have no live region and are invisible (see Usability).
- **Keyboard path:** Tab order is sensible; Esc from live returns to pick-spec; all primary actions are buttons. The camera itself is `tabindex="-1"` (correct — it's not a control). **But** the selected preset cannot be *perceived* by sighted keyboard users because the selected state doesn't render.
- **`prefers-reduced-motion` is handled** (transitions disabled) — minimal motion overall, fine.

**Prescription:** Fix the selected-state selector to `[aria-checked="true"]`; surface capture errors in a live region; keep the strong focus ring. The screen-reader path is largely built — the visible-state gap is the main defect.

---

## Evidence notes

- Rendered at 375×812 and 1280×900 via headless Chrome against the Vite dev server (v6.4.3). Pick-spec state verified visually.
- Live/preview states could not be engaged headlessly (no Playwright installed; the fake-media flags do not auto-click). Their DOM structure is verified from source; their rendered behavior is **unverified**.
- Files read: `index.html`, `src/style.css`, `src/main.ts`, `src/state.ts`, `src/camera.ts`, `src/presets.ts`, `src/composite.ts`, `src/crop.ts`, `src/download.ts`, `src/dpi.ts`, `src/errors.ts`, `src/geometry.ts`, `src/mask.ts`, `src/segmenter-client.ts`, `src/segmenter.worker.ts`, `src/sheet.ts`, `README.md`, `CONTEXT.md`.

## Verdict

**The bones are honest and well-built.** The FSM, the privacy architecture, the pure-function pipeline, and the oval-crop contract are all deliberate. The surface fails on three concrete, fixable defects: no visible preset selection, no capture-error feedback, and an un-hideable warning banner. These are wiring fixes, not redesigns — a `refine`/`interaction` pass plus one small CSS fix would move this from "critical" to "healthy" on the two failing vitals.
