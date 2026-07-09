/**
 * Main-thread client for the MediaPipe segmenter Web Worker.
 *
 * Provides a typed Promise-based API around the worker's message protocol.
 * The worker is created on `init()` and shut down when no longer needed.
 */

export type SegmenterState = "uninitialized" | "loading" | "ready" | "error";
export type WarmupResult = "ok" | "unavailable";

function createWorker(): Worker {
  return new Worker(
    new URL("./segmenter.worker.ts", import.meta.url),
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
   * The input ImageData is transferred to the worker (zero-copy).
   */
  segment(src: ImageData): Promise<ImageData>;

  /** Shut down the worker */
  destroy(): void;

  /** Get any stored error info */
  errorInfo(): { kind: string; message: string } | null;
}

export function createSegmenterClient(): SegmenterClient {
  let worker: Worker | null = null;
  let state: SegmenterState = "uninitialized";
  let messageId = 0;
  let errorInfo: { kind: string; message: string } | null = null;

  // Pending promises keyed by message type (there's at most one of each in flight)
  let pendingInit: { resolve: () => void; reject: (err: Error) => void } | null = null;
  let pendingWarmup: { resolve: (r: WarmupResult) => void; reject: (err: Error) => void } | null = null;
  let pendingSegment: { resolve: (r: ImageData) => void; reject: (err: Error) => void } | null = null;

  function handleMessage(e: MessageEvent): void {
    const { type, kind, message, imagedata } = e.data;

    switch (type) {
      case "ready":
        state = "ready";
        pendingInit?.resolve();
        pendingInit = null;
        break;

      case "warmup-ok":
        pendingWarmup?.resolve("ok");
        pendingWarmup = null;
        break;

      case "warmup-fail":
        state = "ready"; // model is loaded, just won't produce good results
        pendingWarmup?.resolve("unavailable");
        pendingWarmup = null;
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

        if (type === "init" && pendingInit) {
          // For init failures, classify based on kind
          if (kind === "execution") {
            state = "error";
            pendingInit.reject(
              new Error(
                "This device or browser can't run the AI model. " +
                "Try a modern Chromium, Firefox, or Safari browser.",
              ),
            );
          } else {
            state = "error";
            pendingInit.reject(
              new Error(
                "Couldn't load the AI model — check your internet connection.",
              ),
            );
          }
          pendingInit = null;
        } else if (pendingWarmup) {
          pendingWarmup.reject(new Error(info.message));
          pendingWarmup = null;
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

    // Reject any pending promise
    pendingInit?.reject(new Error("Worker crashed during init"));
    pendingInit = null;
    pendingWarmup?.reject(new Error("Worker crashed during warmup"));
    pendingWarmup = null;
    pendingSegment?.reject(new Error("Worker crashed during segmentation"));
    pendingSegment = null;
  }

  return {
    get state() { return state; },

    async init(): Promise<void> {
      if (state === "loading") throw new Error("Already initializing");
      if (state === "ready") return; // already initialized

      state = "loading";
      worker = createWorker();
      worker.onmessage = handleMessage;
      worker.onerror = handleError as any;

      return new Promise((resolve, reject) => {
        pendingInit = { resolve, reject };
        worker!.postMessage({ type: "init" });
      });
    },

    async warmup(): Promise<WarmupResult> {
      if (!worker || state !== "ready") {
        throw new Error("Segmenter not initialized");
      }
      return new Promise((resolve, reject) => {
        pendingWarmup = { resolve, reject };
        worker!.postMessage({ type: "warmup" });
      });
    },

    async segment(src: ImageData): Promise<ImageData> {
      if (!worker || state !== "ready") {
        throw new Error("Segmenter not initialized");
      }
      messageId++;

      return new Promise((resolve, reject) => {
        pendingSegment = { resolve, reject };

        // Transfer the underlying buffer for zero-copy
        const transferable = [src.data.buffer as ArrayBuffer];
        worker!.postMessage(
          {
            type: "segment",
            id: messageId,
            imagedata: { data: src.data, width: src.width, height: src.height },
            width: src.width,
            height: src.height,
          },
          transferable,
        );
      });
    },

    destroy(): void {
      worker?.terminate();
      worker = null;
      state = "uninitialized";

      // Reject all pending promises
      pendingInit?.reject(new Error("Segmenter destroyed"));
      pendingInit = null;
      pendingWarmup?.reject(new Error("Segmenter destroyed"));
      pendingWarmup = null;
      pendingSegment?.reject(new Error("Segmenter destroyed"));
      pendingSegment = null;
      errorInfo = null;
    },

    errorInfo(): { kind: string; message: string } | null {
      return errorInfo;
    },
  };
}
