import { test, expect } from "@playwright/test";

/**
 * E2E walkthrough of the three FSM states with a fake webcam:
 *   pick-spec → live → preview.
 *
 * The MediaPipe library is vendored same-origin; the selfie-segmenter model
 * is fetched from Google's model host at camera start. These tests require
 * network access to that host. In headless the warmup gate may report
 * background replacement as unavailable (no GPU) — the app falls back to the
 * original background, which the preview test asserts.
 *
 * Preset buttons are radios (role="radio"), so they are queried with
 * getByRole("radio").
 */

// The preset radio buttons
const presetPassport = "Malaysia Passport";
const presetMyKad = "MyKad Photo Window";

test("pick-spec renders both presets and a working Start Camera", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "My Passport Photo" })).toBeVisible();
  await expect(page.getByRole("radio", { name: presetPassport })).toBeVisible();
  await expect(page.getByRole("radio", { name: presetMyKad })).toBeVisible();

  // Malaysia Passport is pre-selected by default
  await expect(page.getByRole("radio", { name: presetPassport })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: presetMyKad })).toHaveAttribute("aria-checked", "false");

  // The start button is the only visible primary action
  await expect(page.getByRole("button", { name: "Start Camera" })).toBeVisible();
});

test("selecting a preset updates the armed selection", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("radio", { name: presetMyKad }).click();
  await expect(page.getByRole("radio", { name: presetMyKad })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: presetPassport })).toHaveAttribute("aria-checked", "false");
});

test("live state shows the video feed, oval guide, and capture controls", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start Camera" }).click();

  // Live section becomes visible with a camera feed
  await expect(page.locator("#state-live")).toBeVisible();
  await expect(page.locator("#camera-container video")).toBeVisible();

  // Oval framing guide is present
  await expect(page.locator("#oval-guide")).toBeVisible();

  // Capture + switch + cancel controls
  await expect(page.getByRole("button", { name: "Capture photo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Switch front/back camera" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
});

test("Escape returns from live to pick-spec", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start Camera" }).click();
  await expect(page.locator("#state-live")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator("#state-pick-spec")).toBeVisible();
  await expect(page.locator("#state-live")).toBeHidden();
});

test("cancel returns from live to pick-spec", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start Camera" }).click();
  await expect(page.locator("#state-live")).toBeVisible();

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator("#state-pick-spec")).toBeVisible();
  await expect(page.locator("#state-live")).toBeHidden();
});

test("capture produces a preview with download actions", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start Camera" }).click();
  await expect(page.locator("#state-live")).toBeVisible();

  await page.getByRole("button", { name: "Capture photo" }).click();

  // Preview state appears with the two preview canvases
  await expect(page.locator("#state-preview")).toBeVisible();
  await expect(page.locator("#preview-canvas-single")).toBeVisible();
  await expect(page.locator("#preview-canvas-sheet")).toBeVisible();

  // Download + retake + new preset controls
  await expect(page.getByRole("button", { name: "Download Photo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download 4R Sheet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retake" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New Preset" })).toBeVisible();

  // Background-replacement availability: the app reports it either in the
  // live-state segmenter-status note or (once the capture pipeline runs) in
  // the preview banner. Assert on the live-state message that the app
  // actually writes, and confirm the banner is either filled or hidden.
  const statusText = (await page.locator("#segmenter-status").textContent()) ?? "";
  const banner = page.locator("#bg-unavailable-banner");
  const bannerText = (await banner.textContent()) ?? "";
  const bgUnavailable = statusText.includes("unavailable") || bannerText.includes("unavailable");

  if (bgUnavailable) {
    await expect(
      page.getByText("Background replacement unavailable", { exact: false }).first(),
    ).toBeVisible();
  } else {
    await expect(banner).toBeHidden();
  }
});

test("capture from MyKad preset shows MyKad preview", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("radio", { name: presetMyKad }).click();
  await page.getByRole("button", { name: "Start Camera" }).click();
  await expect(page.locator("#state-live")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Capture photo" }).click();
  await expect(page.locator("#state-preview")).toBeVisible({ timeout: 30_000 });

  // The preview aria-label reflects the preset + background state. The
  // label is exposed via the role="img" region.
  await expect(page.locator('[role="img"][aria-label*="MyKad"]')).toBeVisible();
});

test("retake returns to the live state without reloading the model", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start Camera" }).click();
  await expect(page.locator("#state-live")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Capture photo" }).click();
  await expect(page.locator("#state-preview")).toBeVisible({ timeout: 30_000 });

  // Retake keeps the segmenter (worker + model) alive and only restarts the
  // camera, so it must return to live quickly.
  await page.getByRole("button", { name: "Retake" }).click();
  await expect(page.locator("#state-live")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("#state-preview")).toBeHidden();
});

test("retake does not re-fetch the MediaPipe model", async ({ page }) => {
  await page.goto("/");

  // Count fetches to the model endpoint (the library is vendored same-origin,
  // only the selfie-segmenter model is fetched from Google's model host)
  const modelRequests: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("selfie_segmenter")) {
      modelRequests.push(url);
    }
  });

  await page.getByRole("button", { name: "Start Camera" }).click();
  await expect(page.locator("#state-live")).toBeVisible({ timeout: 30_000 });

  // The model fetch is async — wait for the first request before counting.
  await expect
    .poll(() => modelRequests.length, { timeout: 30_000 })
    .toBeGreaterThan(0);
  const firstLoad = modelRequests.length;

  await page.getByRole("button", { name: "Capture photo" }).click();
  await expect(page.locator("#state-preview")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Retake" }).click();
  await expect(page.locator("#state-live")).toBeVisible({ timeout: 10_000 });

  // The session-scoped segmenter must not re-fetch the model on retake
  expect(modelRequests.length).toBe(firstLoad);
});

test("new preset returns to pick-spec", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start Camera" }).click();
  await expect(page.locator("#state-live")).toBeVisible();

  await page.getByRole("button", { name: "Capture photo" }).click();
  await expect(page.locator("#state-preview")).toBeVisible();

  await page.getByRole("button", { name: "New Preset" }).click();
  await expect(page.locator("#state-pick-spec")).toBeVisible();
  await expect(page.locator("#state-preview")).toBeHidden();
});
