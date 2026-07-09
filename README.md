# My Passport Photo

A client-side web app that captures a camera frame and converts it into a
best-effort Malaysia passport or MyKad-format photo, plus a printable 4R
tiled sheet.

**All image processing happens in the browser — no photo data ever leaves your
device.** This is enforced by Content Security Policy (CSP) and verified by
the app's architecture (no backend, no storage, no analytics, no error
reporting). The only external network fetches are the one-time load of the
MediaPipe ML model and wasm runtime; these carry no image data.

## ⚠️ Important disclaimer

This is a **best-effort guided photo tool**, not a compliance guarantee.
Output should be verified against official requirements before submission.

## Features

- Two presets: **Malaysia Passport** (35×50mm) and **MyKad Photo Window**
  (23×30mm).
- Live framing guide with a dashed oval (head-height ~56% of frame for
  passport, ~58% for MyKad — the MyKad window includes shoulder area).
- Automatic background replacement (MediaPipe selfie segmentation → white).
  Falls back to original background if the ML model fails on your device.
- Download as a single JPEG (with correct DPI metadata) or a 4R (4×6″)
  tiled print sheet (1200×1800px, photos edge-to-edge with thin cut guides).
- **No data leaves your device** — everything runs in-browser; CSP blocks
  all outbound connections except the one-time MediaPipe model load.
- Front camera support with automatic mirror correction.
- Keyboard-operable with screen-reader announcements.

## Accessibility note

This app requires sight for framing a photo against the on-screen guide.
All other functionality (preset selection, capture trigger, preview review,
downloads) is keyboard-operable and screen-reader accessible. The live framing
limitation is irreducible with current technology.

## How to build and run

```bash
npm install
npm run build     # tsc + vite → dist/
npm run dev       # Vite dev server
npm test          # Vitest unit tests
```

## Deploy

The app is a pure static build (`dist/`) with no backend. Two supported hosts;
both reproduce the ADR 0008 security-header baseline. HTTPS is **required** —
`getUserMedia` (camera access) does not work over plain HTTP except on
`localhost`. Both hosts terminate TLS automatically.

### Option A — Cloudflare Pages (recommended if you manage DNS on Cloudflare)

The security headers ship via `public/_headers`, which Vite copies verbatim
into `dist/`. No server config to maintain.

1. Build: `npm run build`
2. Deploy one of:
   - **Git integration** — Dashboard → Workers & Pages → Create → Pages →
     Connect to Git; build command `npm run build`, output dir `dist`.
   - **Wrangler** — `npx wrangler pages deploy dist --project-name=passport-shot`.
3. Attach your custom domain under the project's *Custom domains* tab. Because
   the domain's DNS is already on Cloudflare, the CNAME and TLS cert are
   provisioned automatically.
4. Verify the headers landed at the edge (HTTP→HTTPS redirect and TLS are
   automatic):
   ```bash
   curl -sI https://<your-domain>/ | grep -iE 'content-security|strict-transport|x-frame|x-content|referrer|permissions'
   ```
5. **Disable Rocket Loader** on the zone (Speed → Optimization). It rewrites
   `<script>` tags and can conflict with the module worker + CSP.

### Option B — self-hosted nginx (see `nginx.conf`)

1. Build: `npm run build`
2. Copy `dist/` to your server
3. Configure nginx: adjust `server_name`, `ssl_certificate`, `ssl_certificate_key`
   in `nginx.conf`, then `nginx -c /path/to/nginx.conf`

## Printing the 4R sheet

- Upload the sheet JPEG to a photo lab / kiosk and order as **4R (4×6″)**.
- **Do not scale.** Print at actual size. The JPEG contains correct 300 DPI
  metadata so the tiles reproduce at the preset's exact physical mm dimensions.
- For home printing: open the JPEG, set the paper size to 4×6″ (10×15cm) or
  A6, and print at 100% scale (no fit-to-page).

## Presets

| Preset | Photo size | Output px (@300 DPI) | Tiles on 4R sheet |
|---|---|---|---|
| Malaysia Passport | 35×50mm | 413×591 | 2×3 = 6 |
| MyKad Photo Window | 23×30mm | 272×354 | 4×5 = 20 |

## Technical overview

Built with:
- **Vite** + **TypeScript** — no framework, no runtime dependencies beyond
  the CDN-loaded MediaPipe library.
- **MediaPipe Tasks Vision** (`@mediapipe/tasks-vision@0.10.34`) — selfie
  segmentation in a Web Worker.
- **Explicit FSM** — 3-state machine (`pick-spec | live | preview`) with
  guarded transitions that own all cleanup (camera stop, stream release,
  URL revocation).
- **Pure-function pipeline** — mask processing (erosion + threshold/feather +
  alpha-composite), geometric crop, and 4R tiling are pure, independently
  unit-tested functions.
- **Self-hosted nginx** — CSP + HSTS + security headers enforce the privacy
  promise and harden the deployment.

## Design record

All design decisions (40+ structured questions and their resolutions) are
captured as architecture decision records in `docs/adr/`. The original spec
is at `docs/superpowers/specs/` with amendments in `docs/SPEC-AMENDMENTS.md`.

## License

MIT
