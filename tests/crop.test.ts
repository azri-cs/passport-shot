import { describe, it, expect } from "vitest";
import { cropToOutput } from "../src/crop";
import { getPreset } from "../src/presets";
import type { Rect } from "../src/geometry";

function makeTestCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

describe("cropToOutput", () => {
  it("produces output at the preset's exact pixel dimensions", () => {
    const spec = getPreset("passport")!;
    const src = makeTestCanvas(1280, 720);
    const rect: Rect = { x: 388, y: 0, w: 504, h: 720 };

    const out = cropToOutput(src, rect, spec);

    expect(out.width).toBe(413);
    expect(out.height).toBe(591);
  });

  it("handles mykad preset", () => {
    const spec = getPreset("mykad")!;
    const src = makeTestCanvas(1280, 720);
    const rect: Rect = { x: 388, y: 0, w: 504, h: 720 };

    const out = cropToOutput(src, rect, spec);

    expect(out.width).toBe(272);
    expect(out.height).toBe(354);
  });

  it("downscales when sensor rect is larger than output", () => {
    // Sensor rect 600×800 → output 413×591, so downscale
    const spec = getPreset("passport")!;
    const src = makeTestCanvas(1200, 1600);
    const rect: Rect = { x: 0, y: 0, w: 600, h: 800 };

    const out = cropToOutput(src, rect, spec);
    expect(out.width).toBe(413);
    expect(out.height).toBe(591);
  });

  it("target size gets correct from actual pixel", () => {
    // Integration-level: ensure the canvas has actual pixels to read
    const spec = getPreset("passport")!;
    const src = makeTestCanvas(100, 100);
    const ctx = src.getContext("2d")!;
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, 100, 100);

    // Crop the whole 100×100 source
    const rect: Rect = { x: 0, y: 0, w: 100, h: 100 };
    const out = cropToOutput(src, rect, spec);

    // Output should be 413×591 with red tint (scaled)
    const outCtx = out.getContext("2d")!;
    const data = outCtx.getImageData(0, 0, out.width, out.height).data;
    // Center pixel should be red
    const midIdx = ((out.height / 2) | 0) * out.width + ((out.width / 2) | 0);
    expect(data[midIdx * 4]).toBeGreaterThan(200); // R channel
    expect(data[midIdx * 4 + 3]).toBe(255);       // opaque
  });
});
