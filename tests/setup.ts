/**
 * Minimal canvas mock for unit tests.
 * happy-dom does not implement canvas 2D context, so we provide
 * enough of a mock for the pure-function tests to run.
 *
 * Tests only check pixel dimensions and basic operations (fill, drawImage),
 * not actual rendering fidelity — that's covered by the manual checklist.
 */

// Polyfill ImageData for environments that lack it (happy-dom)
if (typeof globalThis.ImageData !== "function") {
  (globalThis as any).ImageData = class ImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(data: Uint8ClampedArray | number, width: number, height?: number) {
      if (typeof data === "number") {
        this.width = data;
        this.height = height ?? data;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else {
        this.data = data;
        this.width = width;
        this.height = height ?? data.length / (width * 4);
      }
    }
  } as any;
}

// Mock canvas 2D context
const mockCanvasCtx: Partial<CanvasRenderingContext2D> = {
  _fillStyle: "#000000",
  _imageData: new Uint8ClampedArray(0),

  get fillStyle() { return this._fillStyle; },
  set fillStyle(v: string | CanvasGradient | CanvasPattern) { this._fillStyle = String(v); },

  imageSmoothingEnabled: true,
  imageSmoothingQuality: "high" as ImageSmoothingQuality,

  fillRect() {
    // no-op for tests
  },

  drawImage() {
    // no-op for tests
  },

  createImageData(w: number, h: number): ImageData {
    return new ImageData(w, h);
  },

  getImageData(x: number, y: number, w: number, h: number): ImageData {
    // Return white-filled ImageData by default
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = 255;
      data[i * 4 + 1] = 255;
      data[i * 4 + 2] = 255;
      data[i * 4 + 3] = 255;
    }
    return new ImageData(data, w, h);
  },

  beginPath() {},
  moveTo() {},
  lineTo() {},
  stroke() {},
};

// Save original createElement
const origCreateElement = document.createElement.bind(document);

// Patch createElement to return mocked canvas
document.createElement = function (tagName: string, options?: ElementCreationOptions): HTMLElement {
  if (tagName.toLowerCase() === "canvas") {
    const el = origCreateElement("canvas", options) as HTMLCanvasElement;
    // Override getContext to return our mock
    el.getContext = (() => {
      let ctx: any = null;
      return function (contextId: string) {
        if (contextId === "2d") {
          if (!ctx) {
            ctx = Object.create(mockCanvasCtx as any);
          }
          return ctx;
        }
        return null;
      };
    })() as any;
    return el;
  }
  return origCreateElement(tagName, options);
} as any;
