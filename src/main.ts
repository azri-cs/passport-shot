/**
 * Application entry point.
 *
 * Bootstraps the FSM, wires DOM events, and implements the single
 * `render(state)` function that drives all UI from the FSM state.
 */

import { createFSM, type AppState } from "./state";
import { PRESETS } from "./presets";
import { tile4R } from "./sheet";

// ── DOM references ───────────────────────────────────────────────────────

const $ = (id: string) => document.getElementById(id)!;

const dom = {
  // Sections
  statePickSpec: $("state-pick-spec"),
  stateLive: $("state-live"),
  statePreview: $("state-preview"),

  // State 1
  presetButtons: $("preset-buttons"),
  btnStartCamera: $("start-camera") as HTMLButtonElement,
  state1Error: $("state1-error"),
  httpsWarning: $("https-warning"),

  // State 2
  cameraContainer: $("camera-container"),
  video: $("video") as HTMLVideoElement,
  ovalGuide: $("oval-guide"),
  framingHint: $("framing-hint"),
  btnCapture: $("btn-capture") as HTMLButtonElement,
  btnSwitchCamera: $("btn-switch-camera") as HTMLButtonElement,
  btnCancelLive: $("btn-cancel-live") as HTMLButtonElement,
  segmenterStatus: $("segmenter-status"),

  // State 3
  previewProcessing: $("preview-processing"),
  previewSingle: $("preview-canvas-single") as HTMLCanvasElement,
  previewSheet: $("preview-canvas-sheet") as HTMLCanvasElement,
  bgUnavailableBanner: $("bg-unavailable-banner"),
  btnDownloadSingle: $("btn-download-single") as HTMLButtonElement,
  btnDownloadSheet: $("btn-download-sheet") as HTMLButtonElement,
  btnRetake: $("btn-retake") as HTMLButtonElement,
  btnNewPreset: $("btn-new-preset") as HTMLButtonElement,

  // Screenshot reader
  statusAnnouncer: $("status-announcer"),
};

// ── Render ───────────────────────────────────────────────────────────────

function render(state: AppState): void {
  // Hide all sections first
  dom.statePickSpec.classList.add("hidden");
  dom.stateLive.classList.add("hidden");
  dom.statePreview.classList.add("hidden");

  switch (state.name) {
    case "pick-spec":
      renderPickSpec(state);
      break;
    case "live":
      renderLive(state);
      break;
    case "preview":
      renderPreview(state);
      break;
  }
}

function renderPickSpec(_state: AppState): void {
  dom.statePickSpec.classList.remove("hidden");

  // Populate preset buttons (idempotent — only builds once)
  if (dom.presetButtons.children.length === 0) {
    PRESETS.forEach((spec) => {
      const btn = document.createElement("button");
      btn.textContent = spec.label;
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", "false");
      btn.dataset.presetId = spec.id;
      btn.addEventListener("click", () => {
        // Update visual selection
        dom.presetButtons.querySelectorAll("button").forEach((b) =>
          b.setAttribute("aria-checked", "false")
        );
        btn.setAttribute("aria-checked", "true");
        fsm.selectPreset(spec.id);
      });
      dom.presetButtons.appendChild(btn);
    });
  }

  // Check HTTPS
  if (location.protocol !== "https:" && location.hostname !== "localhost") {
    dom.httpsWarning.textContent = "Camera access requires HTTPS.";
    dom.btnStartCamera.disabled = true;
  } else {
    dom.httpsWarning.textContent = "";
    dom.btnStartCamera.disabled = false;
  }
}

function renderLive(state: AppState): void {
  dom.stateLive.classList.remove("hidden");
  dom.segmenterStatus.textContent = state.bgUnavailable
    ? "Background replacement unavailable — using original background."
    : "";
}

function renderPreview(state: AppState): void {
  dom.statePreview.classList.remove("hidden");

  // Show BG-unavailable banner
  dom.bgUnavailableBanner.classList.toggle("hidden", !state.bgUnavailable);
  dom.bgUnavailableBanner.textContent = state.bgUnavailable
    ? "Background replacement unavailable — using original background."
    : "";

  // Draw preview canvases
  if (state.processedPhoto) {
    // Single photo preview
    const singleCtx = dom.previewSingle.getContext("2d")!;
    dom.previewSingle.width = state.processedPhoto.width;
    dom.previewSingle.height = state.processedPhoto.height;
    singleCtx.drawImage(state.processedPhoto, 0, 0);

    // Sheet preview (drawn as small preview — not a full-quality render)
    if (state.lastSpec) {
      const sheetCanvas = tile4R(state.processedPhoto, state.lastSpec);
      const sheetCtx = dom.previewSheet.getContext("2d")!;
      dom.previewSheet.width = sheetCanvas.width;
      dom.previewSheet.height = sheetCanvas.height;
      sheetCtx.drawImage(sheetCanvas, 0, 0);
    }

    // Update aria-label
    dom.previewSingle.setAttribute(
      "aria-label",
      `Your ${state.lastSpec?.label ?? "passport"} photo with ${state.bgUnavailable ? "original" : "white"} background`,
    );
  }
}

// ── Event wiring ─────────────────────────────────────────────────────────

function wireEvents(fsm: ReturnType<typeof createFSM>): void {
  // State 1: Start camera
  dom.btnStartCamera.addEventListener("click", async () => {
    dom.btnStartCamera.disabled = true;
    dom.state1Error.textContent = "";
    try {
      await fsm.startCamera();
    } catch (err: any) {
      dom.state1Error.textContent = err?.message ?? "Failed to start camera.";
    } finally {
      dom.btnStartCamera.disabled = false;
    }
  });

  // State 2: Capture
  dom.btnCapture.addEventListener("click", async () => {
    dom.btnCapture.disabled = true;
    try {
      await fsm.capture();
    } catch (err: any) {
      console.error("Capture failed:", err);
    } finally {
      dom.btnCapture.disabled = false;
    }
  });

  // State 2: Switch camera
  dom.btnSwitchCamera.addEventListener("click", async () => {
    const state = fsm.getState();
    if (state.camera) {
      dom.btnSwitchCamera.disabled = true;
      try {
        await state.camera.switchFacing();
      } catch {
        // If switching fails, try to restart the camera
      } finally {
        dom.btnSwitchCamera.disabled = false;
      }
    }
  });

  // State 2: Cancel
  dom.btnCancelLive.addEventListener("click", () => {
    fsm.newPreset();
  });

  // State 3: Retake
  dom.btnRetake.addEventListener("click", async () => {
    dom.btnRetake.disabled = true;
    try {
      await fsm.retake();
    } catch {
      // Fallback to new preset
      fsm.newPreset();
    } finally {
      dom.btnRetake.disabled = false;
    }
  });

  // State 3: New preset
  dom.btnNewPreset.addEventListener("click", () => {
    fsm.newPreset();
  });

  // State 3: Download single
  dom.btnDownloadSingle.addEventListener("click", async () => {
    dom.btnDownloadSingle.disabled = true;
    const ok = await fsm.downloadSingle();
    if (!ok) {
      dom.state1Error.textContent = "Couldn't generate the photo — try again.";
    }
    dom.btnDownloadSingle.disabled = false;
  });

  // State 3: Download sheet
  dom.btnDownloadSheet.addEventListener("click", async () => {
    dom.btnDownloadSheet.disabled = true;
    const ok = await fsm.downloadSheet();
    if (!ok) {
      dom.state1Error.textContent = "Couldn't generate the print sheet — try again.";
    }
    dom.btnDownloadSheet.disabled = false;
  });

  // Visibility change: stop camera when tab is hidden (Q8)
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      const state = fsm.getState();
      if (state.name === "live" && state.camera) {
        state.camera.stop();
      }
    }
  });

  // Keyboard: Escape returns from live to pick-spec
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const state = fsm.getState();
      if (state.name === "live") {
        fsm.newPreset();
      }
    }
  });
}

// ── Bootstrap ────────────────────────────────────────────────────────────

const fsm = createFSM(render);

// Render the initial state
render(fsm.getState());

// Wire up events after initial render
wireEvents(fsm);

// Select the first preset by default
const defaultPreset = PRESETS[0].id;
fsm.selectPreset(defaultPreset);
