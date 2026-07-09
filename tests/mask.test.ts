import { describe, it, expect } from "vitest";
import { upscaleMask, erodeMask, featherBand, processMask } from "../src/mask";

/** Helper: create a Float32Array mask from a 2D string pattern ('.' = 0, 'X' = 1) */
function makeMask2D(pattern: string[]): { data: Float32Array; w: number; h: number } {
  const h = pattern.length;
  const w = pattern[0].length;
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      data[y * w + x] = pattern[y][x] === "X" ? 1.0 : 0.0;
    }
  }
  return { data, w, h };
}

describe("upscaleMask", () => {
  it("preserves values when src === dst resolution", () => {
    const src = new Float32Array([0, 0.5, 1, 0]);
    const out = upscaleMask(src, 2, 2, 2, 2);
    expect(Array.from(out)).toEqual([0, 0.5, 1, 0]);
  });

  it("nearest-neighbour upscales 2×2 → 4×4", () => {
    // 2×2 pattern:
    //  0   1
    //  1   0
    const src = new Float32Array([0, 1, 1, 0]);
    const out = upscaleMask(src, 2, 2, 4, 4);

    expect(out.length).toBe(16);
    // Top-left quad should all be 0 (nearest-neighbour from (0,0))
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0);
    // Bottom-right quad should all be 0 (nearest-neighbour from (1,1))
    expect(out[15]).toBe(0);
  });

  it("handles non-integer scaling ratio", () => {
    const src = new Float32Array([0, 1, 1, 0]); // 2×2
    const out = upscaleMask(src, 2, 2, 3, 3);
    expect(out.length).toBe(9);
  });
});

describe("erodeMask", () => {
  it("shrinks a person-square by 1 px from edges", () => {
    // 7×7 with a 5×5 solid person square in the center, surrounded by 0s
    // Rows 0,6 = all 0; Cols 0,6 = all 0
    const { data, w, h } = makeMask2D([
      "0000000",
      "0XXXXX0",
      "0XXXXX0",
      "0XXXXX0",
      "0XXXXX0",
      "0XXXXX0",
      "0000000",
    ]);
    const eroded = erodeMask(data, w, h, 1);

    // Center is still person
    expect(eroded[3 * w + 3]).toBe(1);
    // Inner ring (distance 1 from background) should now be eroded to 0
    // Pixel at (1,1) — top-left of the square — was next to (0,1) and (1,0) which are 0
    expect(eroded[1 * w + 1]).toBe(0);
    // Pixel at (1,3) — top edge of the square — was next to (0,3) which is 0
    expect(eroded[1 * w + 3]).toBe(0);
    // Core (2,2) should still be 1 (not adjacent to any 0)
    expect(eroded[2 * w + 2]).toBe(1);
  });

  it("erosion with radius 0 is no-op", () => {
    const { data, w, h } = makeMask2D(["XX", "XX"]);
    const eroded = erodeMask(data, w, h, 0);
    expect(Array.from(eroded)).toEqual([1, 1, 1, 1]);
  });

  it("disconnected pixel is eroded away entirely", () => {
    // Single 1 surrounded by 0s — eroded to 0 with radius 1
    const { data, w, h } = makeMask2D([
      "000",
      "0X0",
      "000",
    ]);
    const eroded = erodeMask(data, w, h, 1);
    expect(eroded[1 * w + 1]).toBe(0);
  });
});

describe("featherBand", () => {
  it("passes values above hi as 1", () => {
    const alpha = new Float32Array([0.9, 0.86, 1.0, 0.85]);
    const out = featherBand(alpha, 0.15, 0.85);
    for (let i = 0; i < alpha.length; i++) {
      expect(out[i]).toBe(1);
    }
  });

  it("zeroes values below lo", () => {
    const alpha = new Float32Array([0, 0.1, 0.14, 0.149]);
    const out = featherBand(alpha, 0.15, 0.85);
    for (let i = 0; i < alpha.length; i++) {
      expect(out[i]).toBe(0);
    }
  });

  it("smoothly maps mid-range values", () => {
    const alpha = new Float32Array([0.5]);
    const out = featherBand(alpha, 0.15, 0.85);
    // (0.5 - 0.15) / 0.7 = 0.5
    expect(out[0]).toBeCloseTo(0.5, 5);
  });

  it("handles flat threshold (lo === hi)", () => {
    const alpha = new Float32Array([0.5, 0.5]);
    const out = featherBand(alpha, 0.5, 0.5);
    expect(out[0]).toBe(0); // 0.5 is not > hi, so 0
    expect(out[1]).toBe(0);
  });
});

describe("processMask (full pipeline)", () => {
  it("applies upscale → erode → feather to produce a valid alpha mask", () => {
    // 2×2 mask: top-left=0 (no person), bottom-right=1 (person)
    // This represents a realistic partial-coverage scenario
    const raw = new Float32Array([0, 0.5, 0.5, 1]);
    const out = processMask(raw, 2, 2, 4, 4, 1, 0.15, 0.85);

    expect(out.length).toBe(16);
    // After upscale and erosion, some pixels should be 0 (background)
    // and some should be 1 (person) — the exact shape depends on NN upscale
    const hasZero = Array.from(out).some(v => v === 0);
    const hasOne = Array.from(out).some(v => v === 1);
    expect(hasZero).toBe(true);
    expect(hasOne).toBe(true);

    // All values in [0, 1]
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
