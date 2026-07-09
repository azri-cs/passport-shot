import { describe, it, expect } from "vitest";
import { computeCropRect } from "../src/geometry";

describe("computeCropRect", () => {
  // Typical front-facing camera: 1280×720 sensor
  // Displayed in a passport-aspect container: 400×571 (0.7)
  const sensorW = 1280;
  const sensorH = 720;
  const containerW = 400;
  const containerH = 571;

  it("returns centered crop for object-fit cover (no mirror)", () => {
    const r = computeCropRect(sensorW, sensorH, containerW, containerH, false);

    // Scale = max(400/1280, 571/720) = max(0.3125, 0.793) = 0.793
    // Scaled video: 1280×0.793=1015, 720×0.793=571
    // Container: 400×571 — vertical fits, horizontal overflows
    // OverflowX = (1015 - 400) / 2 = 307.5
    // Sensor X = 307.5 / 0.793 ≈ 387.8
    expect(r.x).toBeCloseTo(387.8, 0);
    expect(r.y).toBeCloseTo(0, 0);                // no vertical overflow
    expect(r.w).toBeCloseTo(400 / 0.793, 0);       // ≈ 504.4
    expect(r.h).toBeCloseTo(571 / 0.793, 0);       // ≈ 720 (= full height)
  });

  it("mirrors the X axis when mirrored=true", () => {
    const r = computeCropRect(sensorW, sensorH, containerW, containerH, true);

    // Mirror: sensorX = sensorW - (nonMirrored.x + nonMirrored.w)
    // non-mirrored:  x≈387.8, w≈504.4
    // mirrored x = 1280 - (387.8 + 504.4) = 1280 - 892.2 = 387.8
    // For symmetric centered crop, x is the same — but the transform is
    // explicit so any future off-center oval is handled correctly.
    const nm = computeCropRect(sensorW, sensorH, containerW, containerH, false);
    const expectedX = sensorW - (nm.x + nm.w);
    expect(r.x).toBeCloseTo(expectedX, 1);
    expect(r.y).toBeCloseTo(nm.y, 1);
    expect(r.w).toBeCloseTo(nm.w, 1);
    expect(r.h).toBeCloseTo(nm.h, 1);
  });

  it("handles a 16:9 container (landscape) and 16:9 sensor", () => {
    const r = computeCropRect(1280, 720, 640, 360, false);
    // Same aspect — no overflow
    expect(r.x).toBeCloseTo(0, 1);
    expect(r.y).toBeCloseTo(0, 1);
    expect(r.w).toBeCloseTo(640 / (640 / 1280), 1); // = 1280
    expect(r.h).toBeCloseTo(360 / (360 / 720), 1);  // = 720
  });

  it("handles a very tall container (portrait sensor in portrait box)", () => {
    // 4:3 sensor in a 3:4 container (phone portrait)
    const r = computeCropRect(640, 480, 300, 400, false);
    // scale = max(0.46875, 0.8333) = 0.8333
    // scaledW = 533.3, scaledH = 400
    // overflowX = (533.3 - 300) / 2 = 116.7
    expect(r.x).toBeGreaterThan(0);
    expect(r.y).toBeCloseTo(0, 1);
  });
});
