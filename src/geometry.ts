/** Rect in pixel coordinates */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Compute the sensor-space crop rect from the video's intrinsic dimensions
 * and the visible display area when rendered with `object-fit: cover`
 * inside a container of the given aspect.
 *
 * With `object-fit: cover` the video is scaled so that its shorter dimension
 * fills the container, overflowing on the longer dimension; overflow is
 * centered and clipped. The crop rect is the sensor region visible in the
 * display.
 *
 * @param sensorW - video intrinsic width  (e.g. 1280 from getSettings)
 * @param sensorH - video intrinsic height (e.g. 720)
 * @param containerW - display area width in CSS px
 * @param containerH - display area height in CSS px
 * @param mirrored  - if true, invert X axis (front camera)
 */
export function computeCropRect(
  sensorW: number,
  sensorH: number,
  containerW: number,
  containerH: number,
  mirrored: boolean,
): Rect {
  // Scale so the entire container is covered
  const scale = Math.max(containerW / sensorW, containerH / sensorH);
  const scaledW = sensorW * scale;
  const scaledH = sensorH * scale;

  // Overflow amounts (centered clipping)
  const overflowX = Math.max(0, (scaledW - containerW) / 2);
  const overflowY = Math.max(0, (scaledH - containerH) / 2);

  // Sensor region visible in the display (before mirror)
  const sx = overflowX / scale;
  const sy = overflowY / scale;
  const sw = containerW / scale;
  const sh = containerH / scale;

  if (!mirrored) {
    return { x: sx, y: sy, w: sw, h: sh };
  }

  // Mirror the X axis: sensorX = sensorW - (sx + sw)
  // This ensures the crop contract holds even for asymmetric/misaligned
  // framing (not just the centered-oval happy path).
  const mx = sensorW - (sx + sw);
  return { x: mx, y: sy, w: sw, h: sh };
}

/**
 * Compute oval dimensions within the crop rect for a given head-height fraction.
 *
 * The oval height is `headHeightPct` of the crop-rect height, positioned
 * with a small default crown margin from the top (10% of the crop-rect height).
 * The oval width is derived from the height maintaining a 3:4 portrait oval ratio.
 *
 * Returns center-and-radii in sensor-space coords within the crop rect.
 */
export function computeOvalInCropRect(
  cropRect: Rect,
  headHeightPct: number,
): { cx: number; cy: number; rx: number; ry: number } {
  const crownMargin = 0.10; // 10% of crop height from top
  const ovalPortraitRatio = 3 / 4; // width/height of the oval

  const ovalH = cropRect.h * headHeightPct;
  const ovalW = ovalH * ovalPortraitRatio;

  const cx = cropRect.x + cropRect.w / 2;
  const cy = cropRect.y + cropRect.h * crownMargin + ovalH / 2;
  const rx = ovalW / 2;
  const ry = ovalH / 2;

  return { cx, cy, rx, ry };
}
