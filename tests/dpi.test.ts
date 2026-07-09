import { describe, it, expect } from "vitest";
import { patchJfifDensity } from "../src/dpi";

/**
 * Create a minimal valid JPEG+JFIF byte array for testing.
 * SOI (0xFFD8) → APP0/JFIF marker → EOI (0xFFD9).
 * We need the marker to have enough content to reach the density fields.
 */
function createMinimalJfif(density: number, unit: number): Uint8Array {
  const buf = new ArrayBuffer(22);
  const bytes = new Uint8Array(buf);

  // SOI marker
  bytes[0] = 0xff;
  bytes[1] = 0xd8;

  // APP0 marker
  bytes[2] = 0xff;
  bytes[3] = 0xe0;
  // APP0 length (big-endian) — 16 bytes including the 2 length bytes
  bytes[4] = 0x00;
  bytes[5] = 0x10;

  // JFIF identifier "JFIF\x00"
  bytes[6] = 0x4a; // J
  bytes[7] = 0x46; // F
  bytes[8] = 0x49; // I
  bytes[9] = 0x46; // F
  bytes[10] = 0x00;

  // Version (2 bytes)
  bytes[11] = 0x01;
  bytes[12] = 0x02;

  // Density unit
  bytes[13] = unit;

  // X density
  bytes[14] = (density >> 8) & 0xff;
  bytes[15] = density & 0xff;

  // Y density
  bytes[16] = (density >> 8) & 0xff;
  bytes[17] = density & 0xff;

  // Thumbnail dimensions (2 bytes of zero)
  bytes[18] = 0x00;
  bytes[19] = 0x00;

  // EOI
  bytes[20] = 0xff;
  bytes[21] = 0xd9;

  return bytes;
}

describe("patchJfifDensity", () => {
  it("patches density values in a valid JFIF JPEG", async () => {
    const original = createMinimalJfif(72, 0); // 72 DPI, no units
    const blob = new Blob([original], { type: "image/jpeg" });

    const patched = await patchJfifDensity(blob, 300);
    const patchedBytes = new Uint8Array(await patched.arrayBuffer());

    // Unit should be 1 (dots per inch)
    expect(patchedBytes[13]).toBe(1);
    // X density = 300
    expect(patchedBytes[14]).toBe((300 >> 8) & 0xff);
    expect(patchedBytes[15]).toBe(300 & 0xff);
    // Y density = 300
    expect(patchedBytes[16]).toBe((300 >> 8) & 0xff);
    expect(patchedBytes[17]).toBe(300 & 0xff);
  });

  it("returns original blob for non-JPEG type", async () => {
    const blob = new Blob(["hello"], { type: "text/plain" });
    const result = await patchJfifDensity(blob, 300);
    expect(result).toBe(blob);
  });

  it("returns original blob for non-JFIF JPEG (no APP0)", async () => {
    // JPEG without JFIF marker: just SOI + EOI
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const blob = new Blob([bytes], { type: "image/jpeg" });
    const result = await patchJfifDensity(blob, 300);
    // Should return same blob unchanged
    const resultBytes = new Uint8Array(await result.arrayBuffer());
    expect(resultBytes.length).toBe(4);
  });

  it("handles density 600 (two-byte value)", async () => {
    const original = createMinimalJfif(72, 0);
    const blob = new Blob([original], { type: "image/jpeg" });

    const patched = await patchJfifDensity(blob, 600);
    const patchedBytes = new Uint8Array(await patched.arrayBuffer());

    expect(patchedBytes[14]).toBe((600 >> 8) & 0xff); // 0x02
    expect(patchedBytes[15]).toBe(600 & 0xff);        // 0x58
    expect(patchedBytes[16]).toBe((600 >> 8) & 0xff);
    expect(patchedBytes[17]).toBe(600 & 0xff);
  });
});
