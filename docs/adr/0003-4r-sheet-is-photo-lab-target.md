# ADR 0003 — The 4R sheet is a photo-lab-printable target

**Date:** 2026-06-26
**Status:** Accepted

## Context

The app produces a tiled "4R (4×6″) print sheet," but "print sheet" is
ambiguous. Two interpretations have different consequences:

1. A **photo-lab-printable 4R** (send to a kiosk / order as 4×6″ photo paper).
   Labs expect ~300 DPI; cut guides should be subtle (labs may refuse heavy black
   lines, and artifacts shouldn't appear on paid prints).
2. A **home-printer document** (print yourself on A4/Letter, cut with scissors).
   Cut guides can be bold; physical mm size is what matters regardless of DPI.

The preset pixel math (`px = mm / 25.4 × dpi` at 300 DPI) was designed so that
each tile, placed on a 1200×1800px (= 4×6″ @300dpi) sheet, reproduces at the
preset's **exact physical mm size** when commercially printed at 4×6″. For
example, a passport tile of 413×591px = 35×50mm at 300 DPI — exactly the
preset. So the math already assumes interpretation (1).

## Decision

Commit to interpretation **(1): the 4R sheet is a photo-lab-printable target**.

- Sheet dimensions fixed at 1200×1800px (4×6″ @300dpi).
- Cut guides are **subtle** (light gray, ~1px) — photos edge-to-edge, guide line
  bisects the gap between tiles.
- README instructs: "send to a photo lab / kiosk, print as 4R (4×6″), do not
  scale."

Home-printer users can still print the same file (it works at actual size); the
contract is "print at actual size," with the lab as the primary target.

**Refinements:**

- **mm-defined, px-derived presets.** `PhotoSpec` stores exact mm + dpi; output
  px are computed as `Math.round(mm / 25.4 × dpi)`, consistently rounded on both
  axes. The resulting physical size is **nominally exact, within <0.1% rounding
  tolerance** (e.g., a passport tile prints as 35.00 × 50.04mm). Sub-mm drift is
  physically immaterial for any lab or acceptance tolerance.
- **DPI metadata written into both JPEGs.** `canvas.toBlob` produces 72-DPI
  (JFIF default) files; this is patched at encode time — sheet → 300 DPI (so
  1200×1800 reads as 4×6″), single → the preset's `dpi` (so 413×591 reads as
  35×50mm). The files are self-describing; the README's "do not scale" is no
  longer contradicted by the file itself.
- **Block-centered tiling.** The integer tile-grid block is centered in the
  sheet; only the *block origin* is rounded to integer coords. Each tile within
  the block sits at clean integer coords with exact integer size (no per-tile
  distortion, no fractional/anti-aliased edges). Sub-pixel drift is confined to
  the outer margin.

## Consequences

- Cut guides must be visually unobtrusive (won't mar a paid print).
- The mm-correctness of tiles depends on the sheet being printed unscaled; the
  README must make the "do not scale" instruction prominent. DPI metadata makes
  this instruction coherent rather than contradicted.
- Tile counts are fixed per preset (passport 2×3 = 6, MyKad 4×5 = 20), stored in
  the PhotoSpec.
- The "exact mm" claim is honestly "nominally exact, <0.1% tolerance."
