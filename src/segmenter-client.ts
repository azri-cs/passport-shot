/**
 * Main-thread segmenter client.
 *
 * MediaPipe Tasks (vision_bundle) must run on the main thread: its wasm glue
 * loader needs `importScripts`/`document` which module workers lack, and
 * cross-origin `import()` from a module worker is blocked by the browser.
 * The library is vendored locally (public/vendor/mediapipe) so it loads from
 * the same origin.
 *
 * The heavy per-pixel mask math (upscale → erode → feather → composite) runs
 * in a Web Worker to keep the UI thread responsive.
 */

export type SegmenterState = "uninitialized" | "loading" | "ready" | "error";
export type WarmupResult = "ok" | "unavailable";

// Vendored MediaPipe Tasks (same-origin). `FilesetResolver` / `ImageSegmenter`
// are imported lazily so the 130 KB library isn't loaded unless needed.
let FilesetResolver: any = null;
let ImageSegmenter: any = null;

async function ensureLibraryLoaded(): Promise<void> {
  if (FilesetResolver && ImageSegmenter) return;
  // Vendored in public/ and served same-origin at /vendor/mediapipe/...
  // Vite forbids statically importing JS from public/, so we fetch the module
  // text at runtime and import it from a Blob URL. Works in dev and prod.
  const VENDOR_URL = "/vendor/mediapipe/vision_bundle.mjs";
  const res = await fetch(VENDOR_URL);
  if (!res.ok) throw new Error(`Failed to load ${VENDOR_URL}: HTTP ${res.status}`);
  const code = await res.text();
  const blobUrl = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
  try {
    const mod: any = await import(blobUrl);
    FilesetResolver = mod.FilesetResolver;
    ImageSegmenter = mod.ImageSegmenter;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

const WASM_DIR = "/vendor/mediapipe";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

function createMaskWorker(): Worker {
  return new Worker(
    new URL("./mask.worker.ts", import.meta.url),
    { type: "module" },
  );
}

export interface SegmenterClient {
  /** Current state of the segmenter */
  state: SegmenterState;

  /** Initialize the segmenter (load model + wasm). Rejects on failure. */
  init(): Promise<void>;

  /**
   * Run the warmup gate. Must be called after init().
   * Returns "ok" if segmentation works, "unavailable" if it doesn't.
   */
  warmup(): Promise<WarmupResult>;

  /**
   * Segment an ImageData and return the composited (white-background) result.
   */
  segment(src: ImageData): Promise<ImageData>;

  /** Shut down the worker */
  destroy(): void;

  /** Get any stored error info */
  errorInfo(): { kind: string; message: string } | null;
}

export function createSegmenterClient(): SegmenterClient {
  let worker: Worker | null = null;
  let segmenter: any = null;
  let state: SegmenterState = "uninitialized";
  let errorInfo: { kind: string; message: string } | null = null;

  // Pending promises keyed by message type (there's at most one of each in flight)
  let pendingInit: { resolve: () => void; reject: (err: Error) => void } | null = null;
  let pendingSegment: { resolve: (r: ImageData) => void; reject: (err: Error) => void } | null = null;

  function handleMessage(e: MessageEvent): void {
    const { type, kind, message, imagedata } = e.data;

    switch (type) {
      case "ready":
        state = "ready";
        pendingInit?.resolve();
        pendingInit = null;
        break;

      case "result":
        if (pendingSegment) {
          const img = new ImageData(
            new Uint8ClampedArray(imagedata.data),
            imagedata.width,
            imagedata.height,
          );
          pendingSegment.resolve(img);
          pendingSegment = null;
        }
        break;

      case "error":
        const info = { kind: kind ?? "unknown", message: message ?? "Unknown error" };
        errorInfo = info;

        if (pendingInit) {
          state = "error";
          pendingInit.reject(
            new Error(
              kind === "execution"
                ? "This device or browser can't run the AI model. " +
                  "Try a modern Chromium, Firefox, or Safari browser."
                : "Couldn't load the AI model — check your internet connection.",
            ),
          );
          pendingInit = null;
        } else if (pendingSegment) {
          pendingSegment.reject(new Error(info.message));
          pendingSegment = null;
        }
        break;
    }
  }

  function handleError(err: ErrorEvent): void {
    errorInfo = { kind: "worker-error", message: err.message ?? "Worker crashed" };
    state = "error";

    pendingInit?.reject(new Error("Worker crashed during init"));
    pendingInit = null;
    pendingSegment?.reject(new Error("Worker crashed during segmentation"));
    pendingSegment = null;
  }

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

  return {
    get state() { return state; },

    async init(): Promise<void> {
      if (state === "loading") throw new Error("Already initializing");
      if (state === "ready") return; // already initialized

      state = "loading";
      try {
        await ensureLibraryLoaded();
        const vision = await FilesetResolver.forVisionTasks(WASM_DIR);

        // Try GPU first, fall back to CPU
        try {
          segmenter = await ImageSegmenter.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: MODEL_URL,
              delegate: "GPU",
            },
            runningMode: "IMAGE",
            outputCategoryMask: false,
            outputConfidenceMasks: true,
          });
        } catch {
          segmenter = await ImageSegmenter.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: MODEL_URL,
              delegate: "CPU",
            },
            runningMode: "IMAGE",
            outputCategoryMask: false,
            outputConfidenceMasks: true,
          });
        }

        // Start the mask-processing worker
        worker = createMaskWorker();
        worker.onmessage = handleMessage;
        worker.onerror = handleError as any;
        state = "ready";
      } catch (err: any) {
        state = "error";
        errorInfo = {
          kind: "load",
          message: String(err?.message ?? err),
        };
        throw new Error(
          "Couldn't load the AI model — check your internet connection.",
        );
      }
    },

    async warmup(): Promise<WarmupResult> {
      if (!segmenter || state !== "ready") {
        throw new Error("Segmenter not initialized");
      }
      try {
        const dummy = new ImageData(64, 64);
        segmenter.segment(dummy);
        return "ok";
      } catch {
        return "unavailable";
      }
    },

    async segment(src: ImageData): Promise<ImageData> {
      if (!segmenter || !worker || state !== "ready") {
        throw new Error("Segmenter not initialized");
      }

      // 1. Run MediaPipe on the main thread → raw confidence mask
      const { mask, width: mw, height: mh } = segmentToMask(src);

      // 2. Send raw mask to the worker for upscale → erode → feather → composite
      return new Promise((resolve, reject) => {
        pendingSegment = { resolve, reject };
        worker!.postMessage(
          {
            type: "process",
            mask,
            maskWidth: mw,
            maskHeight: mh,
            imagedata: { data: src.data, width: src.width, height: src.height },
            width: src.width,
            height: src.height,
          },
          [mask.buffer, src.data.buffer],
        );
      });
    },

    destroy(): void {
      worker?.terminate();
      worker = null;
      segmenter = null;
      state = "uninitialized";

      pendingInit?.reject(new Error("Segmenter destroyed"));
      pendingInit = null;
      pendingSegment?.reject(new Error("Segmenter destroyed"));
      pendingSegment = null;
      errorInfo = null;
    },

    errorInfo(): { kind: string; message: string } | null {
      return errorInfo;
    },
  };
}
