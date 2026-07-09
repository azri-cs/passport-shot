import type { PhotoSpec } from "./presets";
import { computeOutputPx } from "./presets";

/** 4R sheet dimensions at 300 DPI: 4×6″ */
export const SHEET_WIDTH = 1200;
export const SHEET_HEIGHT = 1800;

/**
 * Compute tile origins for a block-centered layout on the 4R sheet.
 *
 * The integer tile-grid block is centered as a whole; only the block origin
 * is rounded (to integer). Each tile within the block sits at clean integer
 * coordinates with the exact tile pixel size, avoiding sub-pixel edge
 * anti-aliasing between adjacent tiles.
 *
 * @param tileW   Tile width in px
 * @param tileH   Tile height in px
 * @param cols    Number of tile columns
 * @param rows    Number of tile rows
 * @returns Array of { x, y } tile origins
 */
export function placeBlock(
  tileW: number,
  tileH: number,
  cols: number,
  rows: number,
): { x: number; y: number }[] {
  const blockW = tileW * cols;
  const blockH = tileH * rows;

  // Round the block origin to integer
  const originX = Math.round((SHEET_WIDTH - blockW) / 2);
  const originY = Math.round((SHEET_HEIGHT - blockH) / 2);

  const origins: { x: number; y: number }[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      origins.push({
        x: originX + col * tileW,
        y: originY + row * tileH,
      });
    }
  }
  return origins;
}

/**
 * Tile a single photo onto a 4R sheet with cut-guide lines.
 *
 * @param singleCanvas  The single cropped photo canvas at preset output px
 * @param spec          The preset (provides tile counts)
 * @returns             A new canvas (1200×1800) with tiled photos
 */
export function tile4R(
  singleCanvas: HTMLCanvasElement | OffscreenCanvas,
  spec: PhotoSpec,
): HTMLCanvasElement {
  const { widthPx, heightPx } = computeOutputPx(spec);

  const canvas = document.createElement("canvas");
  canvas.width = SHEET_WIDTH;
  canvas.height = SHEET_HEIGHT;
  const ctx = canvas.getContext("2d")!;

  // Fill white background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, SHEET_WIDTH, SHEET_HEIGHT);

  const origins = placeBlock(widthPx, heightPx, spec.sheetCols, spec.sheetRows);

  // Draw tiles edge-to-edge
  for (const o of origins) {
    ctx.drawImage(singleCanvas, o.x, o.y, widthPx, heightPx);
  }

  // Draw cut-guide lines: thin light gray lines bisecting gaps between tiles
  ctx.strokeStyle = "rgba(180,180,180,0.6)";
  ctx.lineWidth = 1;

  // Vertical cut lines (between columns)
  for (let col = 1; col < spec.sheetCols; col++) {
    const x = origins[0].x + col * widthPx;
    const yTop = origins[0].y;
    const yBot = origins[0].y + spec.sheetRows * heightPx;
    ctx.beginPath();
    ctx.moveTo(x, yTop);
    ctx.lineTo(x, yBot);
    ctx.stroke();
  }

  // Horizontal cut lines (between rows)
  for (let row = 1; row < spec.sheetRows; row++) {
    const y = origins[0].y + row * heightPx;
    const xLeft = origins[0].x;
    const xRight = origins[0].x + spec.sheetCols * widthPx;
    ctx.beginPath();
    ctx.moveTo(xLeft, y);
    ctx.lineTo(xRight, y);
    ctx.stroke();
  }

  return canvas;
}
