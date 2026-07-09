/**
 * Camera management: start/stop/switch, getUserMedia with iOS-critical
 * attributes, and device enumeration.
 */

/** Video-only constraints with 1280×720 ideal resolution */
function getConstraints(facing: "user" | "environment"): MediaStreamConstraints {
  return {
    audio: false,
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: facing,
    },
  };
}

/**
 * Create and configure the <video> element for camera preview.
 * The element's attributes MUST be set before assigning srcObject
 * (especially for iOS Safari — playsinline, muted, autoplay).
 */
export function createVideoElement(): HTMLVideoElement {
  const video = document.createElement("video");
  video.setAttribute("playsinline", "");
  video.setAttribute("muted", "");
  video.setAttribute("autoplay", "");
  video.setAttribute("tabindex", "-1"); // not keyboard-focusable
  return video;
}

export type CameraState = "idle" | "starting" | "started" | "stopped" | "error";

export interface CameraController {
  /** The <video> element */
  video: HTMLVideoElement;
  /** Current facing mode */
  facing: "user" | "environment";
  /** Start the camera stream */
  start: () => Promise<void>;
  /** Stop the camera stream */
  stop: () => void;
  /** Switch between front (user) and back (environment) facing */
  switchFacing: () => Promise<void>;
  /** Get the actual sensor resolution from the active track */
  getSensorResolution: () => { w: number; h: number } | null;
  /** Current state */
  state: CameraState;
}

export function createCameraController(): CameraController {
  const video = createVideoElement();
  let stream: MediaStream | null = null;
  let state: CameraState = "idle";
  let facing: "user" | "environment" = "user";

  async function start(): Promise<void> {
    if (state === "started" || state === "starting") return;
    state = "starting";

    try {
      const constraints = getConstraints(facing);
      stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Set srcObject AFTER attributes are already set (done in createVideoElement)
      video.srcObject = stream;
      state = "started";
    } catch (err) {
      state = "error";
      throw err; // caller handles classification
    }
  }

  function stop(): void {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    video.srcObject = null;
    state = "stopped";
  }

  async function switchFacing(): Promise<void> {
    const newFacing = facing === "user" ? "environment" : "user";
    // Stop current stream
    stop();
    // Change facing mode
    facing = newFacing;
    // Restart with new facing
    state = "idle";
    await start();
  }

  function getSensorResolution(): { w: number; h: number } | null {
    if (!stream) return null;
    const track = stream.getVideoTracks()[0];
    if (!track) return null;
    const settings = track.getSettings();
    if (settings.width && settings.height) {
      return { w: settings.width, h: settings.height };
    }
    return null;
  }

  return { video, facing, start, stop, switchFacing, getSensorResolution, get state() { return state; } };
}
