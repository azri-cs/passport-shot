/**
 * Web Worker: MediaPipe ImageSegmenter + mask processing pipeline.
 *
 * Loaded as `new Worker(url, { type: "module" })`.
 * Communication protocol:
 *
 *  → { type: "init" }
 *  ← { type: "ready" } | { type: "error", kind: "load"|"execution", message }
 *
 *  → { type: "warmup" }
 *  ← { type: "warmup-ok" } | { type: "warmup-fail", message }
 *
 *  → { type: "segment", imagedata: ImageData, width, height }
 *     (transfers .data.buffer for zero-copy)
 *  ← { type: "result", imagedata: ImageData } | { type: "error", message }
 *     (transfers .data.buffer back)
 */

// These are imported via CDN / dynamic import in the worker.
// We declare them as lazy-initialized module-level globals.
let segmenter: any = null;
let FilesetResolver: any = null;
let ImageSegmenter: any = null;

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

const WASM_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";

/** Dynamic import of MediaPipe tasks-vision */
async function ensureLibraryLoaded(): Promise<void> {
  if (FilesetResolver && ImageSegmenter) return;
  const mod = await import(
    // @ts-expect-error — dynamic import from CDN URL (no local types)
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/vision_bundle.js"
  );
  FilesetResolver = mod.FilesetResolver;
  ImageSegmenter = mod.ImageSegmenter;
}

/** Initialize the segmenter: load library → wasm → model */
async function initSegmenter(): Promise<void> {
  await ensureLibraryLoaded();
  const vision = await FilesetResolver.forVisionTasks(WASM_CDN);

  // Try GPU first, fall back to CPU
  try {
    segmenter = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetUrl: MODEL_URL,
        delegate: "GPU",
      },
      runningMode: "IMAGE",
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    });
  } catch {
    // GPU failed — fall back to CPU
    segmenter = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetUrl: MODEL_URL,
        delegate: "CPU",
      },
      runningMode: "IMAGE",
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    });
  }
}

/** Run a warmup segmentation on a small dummy image to test if the model works */
async function runWarmup(): Promise<boolean> {
  if (!segmenter) return false;
  try {
    const dummy = new ImageData(64, 64);
    segmenter.segment(dummy);
    return true;
  } catch {
    return false;
  }
}

/** Segment an ImageData, return the Float32 confidence mask at model resolution */
function segmentToMask(
  image: ImageData,
): { mask: Float32Array; width: number; height: number } {
  const result = segmenter.segment(image);
  const mpmMask = result.confidenceMasks[0];
  return {
    mask: mpmMask.getAsFloat32Array(),
    width: mpmMask.width,
    height: mpmMask.height,
  };
}

/** Alpha-composite onto white at full source resolution, using the upscaled mask */
function compositeWithMask(
  src: ImageData,
  mask: Float32Array,
  maskW: number,
  maskH: number,
): ImageData {
  // Import mask processing functions inlined to avoid needing them as separate files
  // (workers loaded via module import can import — but for CSP simplicity, inline)
  const upscaled = upscaleMask(mask, maskW, maskH, src.width, src.height);
  const eroded = erodeMask(upscaled, src.width, src.height, 1);
  const feathered = featherBand(eroded, 0.15, 0.85);
  return compositeOntoWhite(src, feathered);
}

// ── Mask processing helpers (inlined for worker self-containment) ──────────

function upscaleMask(
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
    const sy = Math.min(Math.floor(dy * scaleY), srcH - 1);
    for (let dx = 0; dx < dstW; dx++) {
      const sx = Math.min(Math.floor(dx * scaleX), srcW - 1);
      out[dy * dstW + dx] = mask[sy * srcW + sx];
    }
  }
  return out;
}

function erodeMask(
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
      if (alpha[idx] === 0) continue;
      let isEdge = false;
      for (let ky = Math.max(0, y - r); ky <= Math.min(h - 1, y + r) && !isEdge; ky++) {
        for (let kx = Math.max(0, x - r); kx <= Math.min(w - 1, x + r) && !isEdge; kx++) {
          if (alpha[ky * w + kx] === 0) { isEdge = true; }
        }
      }
      if (isEdge) out[idx] = 0;
    }
  }
  return out;
}

function featherBand(alpha: Float32Array, lo: number, hi: number): Float32Array {
  const out = new Float32Array(alpha.length);
  const range = hi - lo;
  if (range <= 0) {
    for (let i = 0; i < alpha.length; i++) out[i] = alpha[i] > hi ? 1 : 0;
    return out;
  }
  for (let i = 0; i < alpha.length; i++) {
    const v = alpha[i];
    if (v >= hi) out[i] = 1;
    else if (v <= lo) out[i] = 0;
    else out[i] = (v - lo) / range;
  }
  return out;
}

function compositeOntoWhite(src: ImageData, alpha: Float32Array): ImageData {
  const w = src.width;
  const h = src.height;
  const dst = new Uint8ClampedArray(src.data.length);
  const srcData = src.data;
  for (let i = 0; i < w * h; i++) {
    const a = Math.max(0, Math.min(1, alpha[i]));
    const pi = i * 4;
    dst[pi]     = a * srcData[pi]     + (1 - a) * 255;
    dst[pi + 1] = a * srcData[pi + 1] + (1 - a) * 255;
    dst[pi + 2] = a * srcData[pi + 2] + (1 - a) * 255;
    dst[pi + 3] = 255;
  }
  return new ImageData(dst, w, h);
}

// ── Message handler ──────────────────────────────────────────────────────

self.onmessage = async (e: MessageEvent) => {
  const { type } = e.data;

  try {
    switch (type) {
      case "init": {
        await initSegmenter();
        (self as unknown as Worker).postMessage({ type: "ready" });
        break;
      }

      case "warmup": {
        const ok = await runWarmup();
        if (ok) {
          (self as unknown as Worker).postMessage({ type: "warmup-ok" });
        } else {
          (self as unknown as Worker).postMessage({
            type: "warmup-fail",
            message: "Warmup segmentation did not return a valid result.",
          });
        }
        break;
      }

      case "segment": {
        const { imagedata, width, height } = e.data;
        // Reconstruct ImageData from transferred buffer
        // imagedata is a transferable { data: Uint8ClampedArray, ... }
        const src = new ImageData(
          new Uint8ClampedArray(imagedata.data),
          width,
          height,
        );

        // Segment → get raw mask at model resolution
        const { mask: rawMask, width: mw, height: mh } = segmentToMask(src);

        // Composite onto white at full resolution
        const result = compositeWithMask(src, rawMask, mw, mh);

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
    const msg = err?.message ?? String(err);
    if (type === "init") {
      const isExecution =
        msg.includes("wasm") || msg.includes("SIMD") ||
        msg.includes("GPU") || msg.includes("Backend") ||
        msg.includes("Runtime");
      (self as unknown as Worker).postMessage({
        type: "error",
        kind: isExecution ? "execution" : "load",
        message: msg,
      });
    } else {
      (self as unknown as Worker).postMessage({
        type: "error",
        message: msg,
      });
    }
  }
};
