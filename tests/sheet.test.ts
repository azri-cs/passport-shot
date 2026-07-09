import { describe, it, expect } from "vitest";
import { SHEET_WIDTH, SHEET_HEIGHT, placeBlock, tile4R } from "../src/sheet";
import { getPreset } from "../src/presets";

function makeTestCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

describe("placeBlock", () => {
  it("passport: 2×3 layout within sheet", () => {
    const spec = getPreset("passport")!;
    const tileW = 413;
    const tileH = 591;
    const origins = placeBlock(tileW, tileH, spec.sheetCols, spec.sheetRows);

    expect(origins.length).toBe(6);

    // All origins are integer
    for (const o of origins) {
      expect(Number.isInteger(o.x)).toBe(true);
      expect(Number.isInteger(o.y)).toBe(true);
    }

    // First tile
    expect(origins[0].x).toBeGreaterThanOrEqual(0);
    expect(origins[0].y).toBeGreaterThanOrEqual(0);

    // Last tile fits within sheet
    const last = origins[origins.length - 1];
    expect(last.x + tileW).toBeLessThanOrEqual(SHEET_WIDTH);
    expect(last.y + tileH).toBeLessThanOrEqual(SHEET_HEIGHT);
  });

  it("mykad: 4×5 layout within sheet", () => {
    const spec = getPreset("mykad")!;
    const tileW = 272;
    const tileH = 354;
    const origins = placeBlock(tileW, tileH, spec.sheetCols, spec.sheetRows);

    expect(origins.length).toBe(20);
    for (const o of origins) {
      expect(Number.isInteger(o.x)).toBe(true);
      expect(Number.isInteger(o.y)).toBe(true);
    }

    const last = origins[origins.length - 1];
    expect(last.x + tileW).toBeLessThanOrEqual(SHEET_WIDTH);
    expect(last.y + tileH).toBeLessThanOrEqual(SHEET_HEIGHT);
  });

  it("block is centered (equal-ish margins on both sides)", () => {
    const origins = placeBlock(413, 591, 2, 3);
    const first = origins[0];
    const lastRow = 2; // index of first tile in row 1 (col 0)
    const last = origins[origins.length - 1];

    const leftMargin = first.x;
    const rightMargin = SHEET_WIDTH - (last.x + 413);
    expect(Math.abs(leftMargin - rightMargin)).toBeLessThanOrEqual(1);

    const topMargin = first.y;
    const bottomMargin = SHEET_HEIGHT - (origins[origins.length - 1].y + 591);
    expect(Math.abs(topMargin - bottomMargin)).toBeLessThanOrEqual(1);
  });
});

describe("tile4R", () => {
  it("produces a 1200×1800 canvas", () => {
    const spec = getPreset("passport")!;
    const single = makeTestCanvas(413, 591);
    const sheet = tile4R(single, spec);
    expect(sheet.width).toBe(SHEET_WIDTH);
    expect(sheet.height).toBe(SHEET_HEIGHT);
  });

  it("draws the correct number of tiles for passport", () => {
    const spec = getPreset("passport")!;
    const single = makeTestCanvas(413, 591);
    // Draw a recognizable pattern so tiles are non-empty
    const ctx = single.getContext("2d")!;
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, 413, 591);

    const sheet = tile4R(single, spec);
    const sheetCtx = sheet.getContext("2d")!;
    const data = sheetCtx.getImageData(0, 0, SHEET_WIDTH, SHEET_HEIGHT).data;

    // Count non-white pixels somewhere inside the expected tile positions
    const origins = placeBlock(413, 591, spec.sheetCols, spec.sheetRows);
    let redPixels = 0;
    for (let t = 0; t < origins.length; t++) {
      const cx = origins[t].x + 200; // center-ish of tile
      const cy = origins[t].y + 200;
      const idx = (cy * SHEET_WIDTH + cx) * 4;
      if (data[idx] > 200) redPixels++; // red from our pattern
    }
    // All 6 tile centers should be red
    expect(redPixels).toBe(6);
  });
});
