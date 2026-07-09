/**
 * Upscale a low-res confidence mask (e.g. 256×256) to a target resolution
 * using nearest-neighbour interpolation (acceptable for a spatial structure
 * that will be feathered anyway).
 *
 * @param mask    Source Float32Array of length srcW × srcH, values [0..1]
 * @param srcW    Source mask width
 * @param srcH    Source mask height
 * @param dstW    Target width
 * @param dstH    Target height
 * @returns       New Float32Array of length dstW × dstH
 */
export function upscaleMask(
  mask: Float32Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Float32Array {
  const out = new Float32Array(dstW * dstH);
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;

  for (let dy = 0; dy < dstH; dy++) {
    const sy = Math.floor(dy * scaleY);
    const syClamp = Math.min(sy, srcH - 1);
    for (let dx = 0; dx < dstW; dx++) {
      const sx = Math.min(Math.floor(dx * scaleX), srcW - 1);
      out[dy * dstW + dx] = mask[syClamp * srcW + sx];
    }
  }
  return out;
}

/**
 * Erode a binary-ish mask by `radius` pixels using a rectangular structuring
 * element.  Operates on a Float32Array (0 = background, >0 = person).
 * Pixels within `radius` of a background pixel are set to 0.
 *
 * @param alpha   Float32Array of length w × h (confidence mask, [0..1])
 * @param w       Mask width
 * @param h       Mask height
 * @param radius  Erosion radius in pixels
 * @returns       New Float32Array of length w × h
 */
export function erodeMask(
  alpha: Float32Array,
  w: number,
  h: number,
  radius: number,
): Float32Array {
  if (radius <= 0) return new Float32Array(alpha);

  const out = new Float32Array(alpha);
  const r = Math.round(radius);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (alpha[idx] === 0) continue; // background stays 0

      // Check if any pixel in the neighbourhood is background
      let isEdge = false;
      for (let ky = Math.max(0, y - r); ky <= Math.min(h - 1, y + r) && !isEdge; ky++) {
        for (let kx = Math.max(0, x - r); kx <= Math.min(w - 1, x + r) && !isEdge; kx++) {
          if (alpha[ky * w + kx] === 0) {
            isEdge = true;
          }
        }
      }
      if (isEdge) {
        out[idx] = 0;
      }
    }
  }

  return out;
}

/**
 * Apply a threshold+feather band to a confidence mask.
 *
 * - Values > `hi` (e.g. 0.85): kept as 1 (hard person)
 * - Values < `lo` (e.g. 0.15): set to 0 (hard background)
 * - Values in [lo, hi]: linearly mapped to [0, 1] (soft transition band)
 *
 * @param alpha   Float32Array of length w × h
 * @param lo      Lower threshold (background side)
 * @param hi      Upper threshold (person side)
 * @returns       New Float32Array of length w × h, values [0..1]
 */
export function featherBand(
  alpha: Float32Array,
  lo: number,
  hi: number,
): Float32Array {
  const out = new Float32Array(alpha.length);
  const range = hi - lo;
  if (range <= 0) {
    // Flat threshold: hard cut at hi
    for (let i = 0; i < alpha.length; i++) {
      out[i] = alpha[i] > hi ? 1 : 0;
    }
    return out;
  }

  for (let i = 0; i < alpha.length; i++) {
    const v = alpha[i];
    if (v >= hi) {
      out[i] = 1;
    } else if (v <= lo) {
      out[i] = 0;
    } else {
      out[i] = (v - lo) / range; // smooth 0→1 ramp
    }
  }
  return out;
}

/**
 * Full mask-processing pipeline: upscale → erode → feather.
 * Returns a processed Float32Array of length dstW × dstH.
 */
export function processMask(
  rawMask: Float32Array,
  maskW: number,
  maskH: number,
  dstW: number,
  dstH: number,
  erosionRadius = 1,
  featherLo = 0.15,
  featherHi = 0.85,
): Float32Array {
  const upscaled = upscaleMask(rawMask, maskW, maskH, dstW, dstH);
  const eroded = erodeMask(upscaled, dstW, dstH, erosionRadius);
  return featherBand(eroded, featherLo, featherHi);
}
