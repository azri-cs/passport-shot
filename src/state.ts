/**
 * Finite-state machine for the app.
 *
 * States: pick-spec | live | preview (plus implicit error sub-states).
 * Named transitions are the ONLY place DOM/camera/worker/URL state mutates.
 *
 * Read the current state via `getState()` and subscribe with `onChange()`.
 * All transitions call `render()` internally.
 */

import { getPreset, computeOutputPx, type PhotoSpec } from "./presets";
import { createCameraController, type CameraController } from "./camera";
import { createSegmenterClient, type SegmenterClient } from "./segmenter-client";
import { cropToOutput } from "./crop";
import { tile4R } from "./sheet";
import { downloadCanvas, singleFilename, sheetFilename } from "./download";
import { classifyCameraError, classifyModelError } from "./errors";
import { computeCropRect, type Rect } from "./geometry";

// ── State shape ──────────────────────────────────────────────────────────

export type AppStateName = "pick-spec" | "live" | "preview";

export interface AppState {
  name: AppStateName;
  selectedPresetId: string | null;
  /** For the live state: the camera controller */
  camera: CameraController | null;
  /** For the live state: the segmenter client */
  segmenter: SegmenterClient | null;
  /** BG-Replacement-Unavailable flag (set by warmup gate) */
  bgUnavailable: boolean;
  /** Captured canvases (from main thread processing) */
  rawCapture: HTMLCanvasElement | null;
  /** Composited crop result canvas (for preview/download) — after BG replacement + crop */
  processedPhoto: HTMLCanvasElement | null;
  /** Sensor rect used for this capture (stored so retake knows resolution) */
  lastSensorRect: Rect | null;
  /** The container bounding rect at the time of capture (for geometry recomputation) */
  lastContainerRect: DOMRect | null;
  /** The preset used for this capture */
  lastSpec: PhotoSpec | null;
}

function initialState(): AppState {
  return {
    name: "pick-spec",
    selectedPresetId: null,
    camera: null,
    segmenter: null,
    bgUnavailable: false,
    rawCapture: null,
    processedPhoto: null,
    lastSensorRect: null,
    lastContainerRect: null,
    lastSpec: null,
  };
}

// ── FSM ──────────────────────────────────────────────────────────────────

export type FSMListener = (state: AppState) => void;

export interface FSM {
  getState(): AppState;
  onChange(listener: FSMListener): void;
  selectPreset(id: string): void;
  startCamera(): Promise<void>;
  capture(): Promise<void>;
  retake(): Promise<void>;
  newPreset(): void;
  downloadSingle(): Promise<boolean>;
  downloadSheet(): Promise<boolean>;
}

export function createFSM(render: (state: AppState) => void): FSM {
  let state = initialState();
  const listeners: FSMListener[] = [];

  function notify() {
    render(state);
    listeners.forEach((l) => l(state));
  }

  function getState() { return state; }
  function onChange(l: FSMListener) { listeners.push(l); }

  // ── Helpers ────────────────────────────────────────────────────────────

  function getPopulatedPreset(): PhotoSpec {
    const spec = getPreset(state.selectedPresetId ?? "");
    if (!spec) throw new Error(`Preset "${state.selectedPresetId}" not found`);
    return spec;
  }

  function getContainerElement(): HTMLElement {
    return document.getElementById("camera-container")!;
  }

  function getVideoElement(): HTMLVideoElement {
    return document.getElementById("video") as HTMLVideoElement;
  }

  // ── Cleanup helpers ────────────────────────────────────────────────────

  function stopCameraAndSegmenter(): void {
    state.camera?.stop();
    state.camera = null;
    state.segmenter?.destroy();
    state.segmenter = null;
  }

  function releaseCaptures(): void {
    state.rawCapture = null;
    state.processedPhoto = null;
    state.lastSensorRect = null;
    state.lastContainerRect = null;
    state.lastSpec = null;
  }

  // ── Transitions ─────────────────────────────────────────────────────────

  function selectPreset(id: string): void {
    const spec = getPreset(id);
    if (!spec) return;
    state = { ...state, selectedPresetId: id, name: "pick-spec" };
    notify();
  }

  async function startCamera(): Promise<void> {
    const preset = getPopulatedPreset();
    state = { ...state, name: "live", bgUnavailable: false, camera: null, segmenter: null };

    // Set up camera container aspect ratio
    const container = getContainerElement();
    const { widthPx, heightPx } = computeOutputPx(preset);
    const presetAspect = widthPx / heightPx;

    // Container aspect ratio: outer = preset (object-fit cover will clip overflow)
    container.style.aspectRatio = `${presetAspect}`;

    // Create camera controller
    const camera = createCameraController();
    state = { ...state, camera };
    notify();

    // Create segmenter client and start init in parallel with camera
    const segmenter = createSegmenterClient();
    state = { ...state, segmenter };
    notify();

    // Start camera and segmenter init in parallel
    try {
      await Promise.all([
        camera.start(),
        segmenter.init(),
      ]);
    } catch (err: any) {
      camera.stop();
      segmenter.destroy();
      state = {
        ...state,
        name: "pick-spec",
        camera: null,
        segmenter: null,
      };

      // Determine error message
      // If camera failed:
      const cameraInfo = classifyCameraError(err);
      if (cameraInfo) {
        document.getElementById("state1-error")!.textContent = cameraInfo.message;
      } else {
        const modelInfo = classifyModelError(err);
        document.getElementById("state1-error")!.textContent = modelInfo.message;
      }
      notify();
      return;
    }

    // Attach video to DOM (the video element from camera)
    const existingVideo = container.querySelector("video");
    if (existingVideo) existingVideo.remove();
    container.prepend(camera.video);

    // Run warmup gate (after init, before user can capture)
    try {
      const warmupResult = await segmenter.warmup();
      if (warmupResult === "unavailable") {
        state = { ...state, bgUnavailable: true };
        document.getElementById("segmenter-status")!.textContent =
          "Background replacement unavailable — using original background.";
      } else {
        document.getElementById("segmenter-status")!.textContent = "";
      }
    } catch {
      // Warmup failed — mark as unavailable, keep going
      state = { ...state, bgUnavailable: true };
      document.getElementById("segmenter-status")!.textContent =
        "Background replacement unavailable — using original background.";
    }

    notify();
  }

  async function capture(): Promise<void> {
    const camera = state.camera;
    if (!camera) return;
    const spec = getPopulatedPreset();
    const video = getVideoElement();
    const container = getContainerElement();

    // Get sensor resolution
    const sensor = camera.getSensorResolution();
    if (!sensor) return;

    // Compute crop rect in sensor space
    const containerRect = container.getBoundingClientRect();
    const isMirrored = camera.facing === "user";
    const cropRect = computeCropRect(
      sensor.w, sensor.h,
      containerRect.width, containerRect.height,
      isMirrored,
    );

    // Capture the current video frame to a canvas
    const captureCanvas = document.createElement("canvas");
    captureCanvas.width = sensor.w;
    captureCanvas.height = sensor.h;
    const ctx = captureCanvas.getContext("2d")!;

    // Draw the video frame. The video is mirrored (front camera):
    // we need to un-mirror it before processing.
    if (isMirrored) {
      ctx.translate(sensor.w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, sensor.w, sensor.h);

    state = { ...state, rawCapture: captureCanvas, lastSensorRect: cropRect, lastContainerRect: containerRect, lastSpec: spec };
    notify();

    // Show processing overlay
    document.getElementById("preview-processing")!.classList.remove("hidden");

    // Process: extract sensor rect → optionally segment+composite → crop to output
    try {
      // Extract sensor region from raw capture
      const regionCanvas = document.createElement("canvas");
      regionCanvas.width = cropRect.w;
      regionCanvas.height = cropRect.h;
      const regionCtx = regionCanvas.getContext("2d")!;
      regionCtx.drawImage(
        captureCanvas,
        cropRect.x, cropRect.y, cropRect.w, cropRect.h,
        0, 0, cropRect.w, cropRect.h,
      );

      if (state.segmenter && !state.bgUnavailable) {
        // Get ImageData from the sensor region
        const regionImageData = regionCtx.getImageData(0, 0, cropRect.w, cropRect.h);

        // Segment + composite in worker, draw result back to region canvas
        const composited = await state.segmenter.segment(regionImageData);
        regionCtx.putImageData(composited, 0, 0);
      }

      // Crop to output dimensions
      const outputCanvas = cropToOutput(regionCanvas, { x: 0, y: 0, w: cropRect.w, h: cropRect.h }, spec);
      state = { ...state, processedPhoto: outputCanvas, name: "preview" };

    } catch (err: any) {
      console.error("Capture processing failed:", err);
      // Fall back: crop the raw capture without BG replacement
      const regionCanvas = document.createElement("canvas");
      regionCanvas.width = cropRect.w;
      regionCanvas.height = cropRect.h;
      const regionCtx = regionCanvas.getContext("2d")!;
      regionCtx.drawImage(captureCanvas, cropRect.x, cropRect.y, cropRect.w, cropRect.h, 0, 0, cropRect.w, cropRect.h);
      const outputCanvas = cropToOutput(regionCanvas, { x: 0, y: 0, w: cropRect.w, h: cropRect.h }, spec);
      state = { ...state, processedPhoto: outputCanvas, name: "preview" };
    }

    // Stop the camera now (per Q8)
    camera.stop();

    // Hide processing
    document.getElementById("preview-processing")!.classList.add("hidden");
    notify();
  }

  async function retake(): Promise<void> {
    stopCameraAndSegmenter();
    releaseCaptures();
    state = { ...state, name: "pick-spec", bgUnavailable: false };
    notify();

    // Re-enter live state
    await startCamera();
  }

  function newPreset(): void {
    stopCameraAndSegmenter();
    releaseCaptures();
    state = { ...state, name: "pick-spec", bgUnavailable: false, lastSpec: null };
    notify();
  }

  async function downloadSingle(): Promise<boolean> {
    if (!state.processedPhoto || !state.lastSpec) return false;
    const spec = state.lastSpec;
    return await downloadCanvas(
      state.processedPhoto,
      singleFilename(spec.id),
      spec.dpi,
    );
  }

  async function downloadSheet(): Promise<boolean> {
    if (!state.processedPhoto || !state.lastSpec) return false;
    const spec = state.lastSpec;
    const sheetCanvas = tile4R(state.processedPhoto, spec);
    return await downloadCanvas(
      sheetCanvas,
      sheetFilename(spec.id),
      spec.dpi,
    );
  }

  return {
    getState,
    onChange,
    selectPreset,
    startCamera,
    capture,
    retake,
    newPreset,
    downloadSingle,
    downloadSheet,
  };
}
