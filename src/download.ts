import { patchJfifDensity } from "./dpi";

/** JPEG quality for output files (0.98 per Q21) */
export const JPEG_QUALITY = 0.98;

/**
 * Generate a Blob from a canvas at JPEG quality 0.98, patch DPI metadata,
 * and trigger a download via a programmatically-clicked <a> element.
 *
 * @param canvas    The source canvas
 * @param filename  Suggested download filename (e.g. "passport-photo.jpg")
 * @param dpi       DPI value to embed in the JPEG
 * @param quality   JPEG quality (default 0.98)
 * @returns         true if download was triggered, false on failure
 */
export async function downloadCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  filename: string,
  dpi: number,
  quality: number = JPEG_QUALITY,
): Promise<boolean> {
  try {
    const blob = await new Promise<Blob | null>((resolve) => {
      (canvas as HTMLCanvasElement).toBlob(
        (b) => resolve(b),
        "image/jpeg",
        quality,
      );
    });

    if (!blob) {
      console.error("downloadCanvas: toBlob returned null");
      return false;
    }

    // Patch DPI metadata
    const patched = await patchJfifDensity(blob, dpi);

    // Trigger download
    triggerDownload(patched, filename);
    return true;
  } catch (err) {
    // Catch SecurityError (tainted canvas) or other unexpected errors
    if (err instanceof DOMException && err.name === "SecurityError") {
      console.error("downloadCanvas: tainted canvas — cannot export");
    } else {
      console.error("downloadCanvas: failed", err);
    }
    return false;
  }
}

/**
 * Trigger a file download by creating a temporary <a> element.
 * The object URL is revoked on the next tick after the click.
 */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();

  // Revoke after the browser has had time to initiate the download
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Generate the filename for a single photo download.
 */
export function singleFilename(specId: string): string {
  return `${specId}-photo.jpg`;
}

/**
 * Generate the filename for a 4R sheet download.
 */
export function sheetFilename(specId: string): string {
  return `${specId}-4r-sheet.jpg`;
}
