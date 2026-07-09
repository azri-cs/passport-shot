# ADR 0001 — Position as "best-effort guided", not "compliant"

**Date:** 2026-06-26
**Status:** Accepted

## Context

The app produces Malaysia passport/MyKad-format photos, but its pipeline has no
face detection and no validation: framing is guided only by a static overlay,
head-height is a preset constant (not measured), and the crop is a geometric
extraction of the on-screen overlay region. The app therefore **cannot
guarantee** that any given output is government-acceptable.

Calling the output "compliant" or "spec-compliant" would over-promise: a user
who frames badly, tilts their head, or stands too far receives a non-compliant
JPEG with no warning.

## Decision

Position the app honestly as a **best-effort guided photo tool**: a framing
helper, background whiten-er, and print-sheet generator. We make no claim that
output is government-acceptable.

State this explicitly in:
- The UI ("guide only — verify against official requirements before submission").
- The README.

The existing MyKad "convenience approximation" footnote is already in this
spirit; the passport preset follows the same tone.

## Consequences

- No compliance guarantee in copy or docs.
- Users retain responsibility for verifying output against official requirements.
- Lowers (does not eliminate) the risk of users submitting rejected photos and
  blaming the tool.
