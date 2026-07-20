# CCTV Gate Monitor

A **100% browser-based** web app that watches CCTV footage played inside
**SmartPSS Lite** and automatically logs when the **Big Main Gate** and the
**Small Pedestrian Gate** open and close — then exports an Excel report.

- No backend. No cloud APIs. No database. No uploads.
- All computer vision (OpenCV.js), OCR (Tesseract.js) and Excel generation
  (ExcelJS) run **locally in the browser**.
- Deploys directly from GitHub to **Vercel** as a static site.

Built with **Next.js 15 · React 19 · TypeScript · Tailwind CSS 4**.

---

## How it works

1. **Share Screen** – uses `navigator.mediaDevices.getDisplayMedia()`. Select
   only the SmartPSS Lite playback window.
2. **Calibrate** – freezes one frame and lets you draw three rectangles:
   - Big Gate ROI
   - Small Gate ROI
   - Timestamp ROI (top-right corner clock)

   Calibration is saved in **LocalStorage** and reloaded automatically next time.
3. **Start Monitoring** – play the footage in SmartPSS at 1×–10×. For each
   processed frame the app:
   - Reads the timestamp with OCR (once per second; low-confidence reads reuse
     the previous timestamp — the system clock is **never** used).
   - Runs the detection pipeline per gate:
     `Crop ROI → Grayscale → Gaussian Blur → SSIM + Pixel Difference →
     Morphological Opening → Decision`.
   - Feeds two **independent state machines**. A state change is committed only
     after **3 consecutive** agreeing frames (stabilization), which — together
     with the adaptive reference frame and the combined SSIM + pixel-ratio test —
     rejects transient changes from cars, people, trees, rain, shadows and
     brightness shifts.
4. **Done** – downloads `Gate_Report.xlsx` with one row per open/close cycle.

## Detection notes & tuning

The detector compares each gate ROI against an **adaptive reference** (the most
recent confirmed-closed frame), so slow day/night lighting drift is absorbed
rather than mistaken for movement. Thresholds live in `lib/GateDetector.ts`
(`DEFAULT_CONFIG`) and can be tuned for your specific camera:

| Parameter | Meaning |
| --- | --- |
| `pixelDiffThreshold` | Intensity delta for a pixel to count as changed |
| `changedRatioThreshold` | Fraction of ROI pixels that must change |
| `ssimThreshold` | SSIM below this = structural change |
| `stabilizationFrames` | Consecutive frames required before a state flip |
| `ocrIntervalMs` | OCR cadence (ms) |
| `ocrMinConfidence` | Minimum OCR confidence to accept a timestamp |

> No purely pixel-based detector is perfect against a busy scene. Draw the gate
> ROIs as tightly as possible around each gate to minimise interference from
> passing vehicles and foliage, and tune the thresholds above if needed.

## Project structure

```
app/
  layout.tsx          Root layout, dark theme, metadata
  page.tsx            Dashboard orchestration
  globals.css         Tailwind + base styles
components/
  Button.tsx          Reusable button
  Header.tsx          Title + controls + speed selector
  VideoStage.tsx      Shared video + ROI drawing/overlay
  StatusPanel.tsx     OCR timestamp + gate status cards
  StatusBadge.tsx     Open/Closed/Unknown badge
  EventTable.tsx      Live event log
  CalibrationPanel.tsx Calibration checklist
hooks/
  useScreenCapture.ts getDisplayMedia lifecycle
  useFrameLoop.ts     requestVideoFrameCallback / rAF driver
  useGateMonitor.ts   CV + OCR + state machines + logging
lib/
  opencv.ts           OpenCV.js CDN loader
  ROI.ts              Calibration storage + frame cropping
  OCR.ts              Tesseract.js timestamp OCR
  GateDetector.ts     Detection pipeline + state machine
  ExcelExporter.ts    ExcelJS report + download
  time.ts             Duration helpers
types/
  index.ts            Domain types
  opencv.d.ts         Typed OpenCV.js facade + global augmentations
```

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Use a Chromium-based browser for the best
`getDisplayMedia` + `requestVideoFrameCallback` support.

## Deploy to Vercel

1. Push this repository to GitHub.
2. In Vercel, **Import Project** and select the repo.
3. Framework preset is **Next.js**; no environment variables are required.
4. Deploy. The app is exported as static output (`out/`) — no server runtime.

Build command: `next build` · Output directory: `out` (configured in
`vercel.json` and `next.config.mjs`).

## Privacy

Every frame is processed in memory in your browser. Nothing is ever sent to a
server. OpenCV.js and the Tesseract language model are the only external
downloads (from their official CDNs) and contain no user data.
