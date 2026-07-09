import { describe, it, expect } from "vitest";
import { PRESETS, getPreset, computeOutputPx, outputAspect } from "../src/presets";

describe("presets", () => {
  it("has passport and mykad presets", () => {
    expect(PRESETS.length).toBe(2);
    expect(PRESETS[0].id).toBe("passport");
    expect(PRESETS[1].id).toBe("mykad");
  });

  it("looks up preset by id", () => {
    expect(getPreset("passport")?.label).toContain("Passport");
    expect(getPreset("mykad")?.label).toContain("MyKad");
    expect(getPreset("nonexistent")).toBeUndefined();
  });

  it("computes px from mm at 300 dpi", () => {
    const passport = getPreset("passport")!;
    const { widthPx, heightPx } = computeOutputPx(passport);

    // 35mm → Math.round(35/25.4×300) = Math.round(413.39) = 413
    expect(widthPx).toBe(413);
    // 50mm → Math.round(50/25.4×300) = Math.round(590.55) = 591
    expect(heightPx).toBe(591);
  });

  it("computes mykad px", () => {
    const mykad = getPreset("mykad")!;
    const { widthPx, heightPx } = computeOutputPx(mykad);

    // 23mm → Math.round(23/25.4×300) = Math.round(271.65) = 272
    expect(widthPx).toBe(272);
    // 30mm → Math.round(30/25.4×300) = Math.round(354.33) = 354
    expect(heightPx).toBe(354);
  });

  it("output aspect matches width/height ratio", () => {
    const passport = getPreset("passport")!;
    const { widthPx, heightPx } = computeOutputPx(passport);
    expect(outputAspect(passport)).toBeCloseTo(widthPx / heightPx, 10);
  });

  it("headHeightPct is reasonable", () => {
    expect(getPreset("passport")!.headHeightPct).toBeCloseTo(0.56);
    // MyKad 0.58 is intentional (includes shoulder area) — not a "correction" target
    expect(getPreset("mykad")!.headHeightPct).toBeCloseTo(0.58);
  });
});
