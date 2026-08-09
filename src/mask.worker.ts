/**
 * Web Worker: mask post-processing pipeline.
 *
 * Receives a raw MediaPipe confidence mask (computed on the main thread) plus
 * the source ImageData, and runs upscale → erode → feather → composite to
 * produce a white-background photo.
 *
 * Message protocol:
 *   → { type: "process", mask, maskWidth, maskHeight, imagedata, width, height }
 *     (mask.buffer + imagedata.data.buffer transferred in)
 *   ← { type: "result", imagedata: { data, width, height } }
 *     (result.data.buffer transferred back)
 *   ← { type: "error", message }
 */

import { processMask } from "./mask";
import { compositeOntoWhite } from "./composite";

self.onmessage = (e: MessageEvent) => {
  const { type, mask, maskWidth, maskHeight, imagedata, width, height } = e.data;

  try {
    switch (type) {
      case "process": {
        // Reconstruct ImageData from transferred buffers
        const src = new ImageData(
          new Uint8ClampedArray(imagedata.data),
          width,
          height,
        );
        const rawMask = new Float32Array(mask);

        // Process the mask at full source resolution
        const feathered = processMask(rawMask, maskWidth, maskHeight, width, height);

        // Composite onto white
        const result = compositeOntoWhite(src, feathered);

        // Transfer the result buffer back
        (self as unknown as Worker).postMessage(
          {
            type: "result",
            imagedata: {
              data: result.data.buffer,
              width: result.width,
              height: result.height,
            },
          },
          [result.data.buffer],
        );
        break;
      }

      default:
        (self as unknown as Worker).postMessage({
          type: "error",
          message: `Unknown message type: ${type}`,
        });
    }
  } catch (err: any) {
    (self as unknown as Worker).postMessage({
      type: "error",
      message: err?.message ?? String(err),
    });
  }
};
