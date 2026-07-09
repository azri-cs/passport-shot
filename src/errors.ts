/**
 * Classify a camera getUserMedia error into a user-facing message and
 * retry policy (based on err.name).
 */
export interface CameraErrorInfo {
  /** User-facing message */
  message: string;
  /** Whether a Retry button will be useful */
  canRetry: boolean;
}

export function classifyCameraError(err: Error): CameraErrorInfo {
  const name = err.name || "UnknownError";

  switch (name) {
    case "NotFoundError":
      return {
        message: "No camera found on this device.",
        canRetry: false,
      };
    case "NotAllowedError":
      return {
        message:
          "Camera permission blocked — check your browser's site permissions.",
        canRetry: false,
      };
    case "NotReadableError":
      return {
        message: "Camera is in use by another application.",
        canRetry: true,
      };
    case "OverconstrainedError":
      return {
        message: "Camera does not support the requested resolution.",
        canRetry: true,
      };
    default:
      return {
        message: "Couldn't start the camera. Please try again.",
        canRetry: true,
      };
  }
}

/**
 * Model error classification: distinguish load failure (network/CDN)
 * from execution failure (wasm/SIMD won't run on this device).
 */
export type ModelErrorKind = "load" | "execution";

export interface ModelErrorInfo {
  kind: ModelErrorKind;
  message: string;
  canRetry: boolean;
}

export function classifyModelError(err: Error): ModelErrorInfo {
  const msg = err.message ?? String(err);

  // Execution failures typically involve wasm, SIMD, or GPU errors.
  // Load failures involve network errors, fetch failures, 404s.
  const isExecution =
    msg.includes("wasm") ||
    msg.includes("simd") ||
    msg.includes("SIMD") ||
    msg.includes("backend") ||
    msg.includes("GPU") ||
    msg.includes("Compilation") ||
    msg.includes("Runtime");

  if (isExecution) {
    return {
      kind: "execution",
      message:
        "This device or browser can't run the AI model. " +
        "Try a modern Chromium, Firefox, or Safari browser.",
      canRetry: false,
    };
  }

  return {
    kind: "load",
    message:
      "Couldn't load the AI model — check your internet connection and try again.",
    canRetry: true,
  };
}
