import { describe, it, expect } from "vitest";
import { compositeOntoWhite } from "../src/composite";

describe("compositeOntoWhite", () => {
  it("keeps original pixels where alpha = 1", () => {
    const w = 2;
    const h = 2;
    const src = new ImageData(new Uint8ClampedArray([
      100, 150, 200, 255, 10, 20, 30, 255,
      200, 100, 50, 255,  0,   0, 0, 255,
    ]), w, h);
    const alpha = new Float32Array([1, 1, 1, 1]);
    const out = compositeOntoWhite(src, alpha);

    for (let i = 0; i < w * h; i++) {
      expect(out.data[i * 4]).toBe(src.data[i * 4]);       // R
      expect(out.data[i * 4 + 1]).toBe(src.data[i * 4 + 1]); // G
      expect(out.data[i * 4 + 2]).toBe(src.data[i * 4 + 2]); // B
      expect(out.data[i * 4 + 3]).toBe(255);                  // A opaque
    }
  });

  it("replaces with white where alpha = 0", () => {
    const w = 1;
    const h = 1;
    const src = new ImageData(new Uint8ClampedArray([50, 100, 150, 255]), w, h);
    const alpha = new Float32Array([0]);
    const out = compositeOntoWhite(src, alpha);

    expect(out.data[0]).toBe(255); // R→255
    expect(out.data[1]).toBe(255); // G→255
    expect(out.data[2]).toBe(255); // B→255
    expect(out.data[3]).toBe(255); // A opaque
  });

  it("blends semi-transparent regions", () => {
    const src = new ImageData(new Uint8ClampedArray([100, 100, 100, 255]), 1, 1);
    const alpha = new Float32Array([0.5]);
    const out = compositeOntoWhite(src, alpha);

    // 0.5×100 + 0.5×255 = 50 + 127.5 = 177.5 → 177 or 178
    expect(out.data[0]).toBeCloseTo(177.5, -1); // R
    expect(out.data[1]).toBeCloseTo(177.5, -1); // G
    expect(out.data[2]).toBeCloseTo(177.5, -1); // B
    expect(out.data[3]).toBe(255);               // opaque
  });

  it("throws on mismatched dimensions", () => {
    const src = new ImageData(2, 2);
    const wrong = new Float32Array(3); // 3 ≠ 4
    expect(() => compositeOntoWhite(src, wrong)).toThrow("alpha length");
  });
});
