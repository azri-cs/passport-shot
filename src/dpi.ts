/**
 * Patch the JFIF APP0 marker in a JPEG Blob to set the density (DPI).
 *
 * The JFIF header contains a two-byte density unit field followed by
 * four bytes for X and Y density (each two bytes, big-endian).  This
 * function locates the JFIF marker (bytes 6–9: "JFIF\x00") and patches
 * the density values in-place.  If the JFIF marker is not found the blob
 * is returned unchanged.
 *
 * @param blob   JPEG Blob from canvas.toBlob('image/jpeg')
 * @param dpi    Desired DPI value (e.g. 300)
 * @returns      A new Blob with the density set (or the original if not JPEG/JFIF)
 */
export async function patchJfifDensity(blob: Blob, dpi: number): Promise<Blob> {
  // Only process JPEG blobs
  if (blob.type !== "image/jpeg") return blob;

  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Check for SOI marker (0xFFD8) followed by JFIF (APP0)
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return blob; // not JPEG
  if (bytes.length < 16) return blob; // too small

  // Check for JFIF identifier at offset 6
  if (
    bytes[6] !== 0x4a || bytes[7] !== 0x46 ||
    bytes[8] !== 0x49 || bytes[9] !== 0x46 ||
    bytes[10] !== 0x00
  ) {
    return blob; // not JFIF (maybe EXIF-based JPEG)
  }

  // JFIF structure at offset 11:
  //   bytes 11–12: APP0 length (big-endian)
  //   byte  13:    density unit (0 = no units, 1 = dots/inch, 2 = dots/cm)
  //   bytes 14–15: X density (big-endian)
  //   bytes 16–17: Y density (big-endian)
  const densityOffset = 13;

  // Set density unit to 1 = dots per inch
  bytes[densityOffset] = 1;

  // Set X density (big-endian)
  bytes[densityOffset + 1] = (dpi >> 8) & 0xff;
  bytes[densityOffset + 2] = dpi & 0xff;

  // Set Y density (big-endian)
  bytes[densityOffset + 3] = (dpi >> 8) & 0xff;
  bytes[densityOffset + 4] = dpi & 0xff;

  return new Blob([bytes], { type: "image/jpeg" });
}
