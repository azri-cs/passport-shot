import type { PhotoSpec } from "./presets";
import type { Rect } from "./geometry";
import { computeOutputPx } from "./presets";

/**
 * Crop a region from a source canvas and scale to the preset's exact output
 * pixel dimensions.  Pure function (no side effects — creates a new canvas).
 *
 * @param src     Source canvas containing the captured (un-mirrored) frame
 * @param rect    Sensor-space region to crop (from geometry.computeCropRect)
 * @param spec    Target preset (provides output px)
 * @returns       A new canvas at the preset's exact output resolution
 */
export function cropToOutput(
  src: HTMLCanvasElement | OffscreenCanvas,
  rect: Rect,
  spec: PhotoSpec,
): HTMLCanvasElement {
  const { widthPx, heightPx } = computeOutputPx(spec);

  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = heightPx;

  const ctx = canvas.getContext("2d")!;
  // Use the best-quality down/up-scale available
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.drawImage(src, rect.x, rect.y, rect.w, rect.h, 0, 0, widthPx, heightPx);

  return canvas;
}
