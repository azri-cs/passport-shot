/**
 * Alpha-composite a source ImageData onto a solid white background using
 * a per-pixel alpha mask.
 *
 * `out = alpha · src + (1 − alpha) · 255`
 *
 * Pure function — creates a new ImageData.
 *
 * @param src     Source ImageData at full resolution (RGBA)
 * @param alpha   Float32Array of length w × h, values [0..1]
 * @returns       New ImageData (identical dimensions to src), alpha=255 everywhere
 */
export function compositeOntoWhite(
  src: ImageData,
  alpha: Float32Array,
): ImageData {
  const w = src.width;
  const h = src.height;
  if (alpha.length !== w * h) {
    throw new Error(
      `compositeOntoWhite: alpha length ${alpha.length} != w×h ${w}×${h}`,
    );
  }

  const dst = new Uint8ClampedArray(src.data.length);
  const srcData = src.data;

  for (let i = 0; i < w * h; i++) {
    const a = alpha[i];
    const pi = i * 4;

    // Clamp alpha to valid range (jic)
    const clamped = Math.max(0, Math.min(1, a));

    // Composite each RGB channel onto white, keep source alpha
    dst[pi]     = clamped * srcData[pi]     + (1 - clamped) * 255; // R
    dst[pi + 1] = clamped * srcData[pi + 1] + (1 - clamped) * 255; // G
    dst[pi + 2] = clamped * srcData[pi + 2] + (1 - clamped) * 255; // B
    dst[pi + 3] = 255; // opaque
  }

  return new ImageData(dst, w, h);
}
