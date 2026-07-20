// Region-of-interest helpers: LocalStorage persistence + frame extraction.

import type { Calibration, NormalizedRect } from "@/types";

const STORAGE_KEY = "cctv-gate-monitor:calibration:v1";

/** Persist calibration to LocalStorage. */
export function saveCalibration(calibration: Calibration): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(calibration));
  } catch {
    // Storage full / disabled — non-fatal, calibration simply won't persist.
  }
}

/** Load previously-saved calibration, or null if none / invalid. */
export function loadCalibration(): Calibration | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Calibration>;
    return {
      bigGate: isRect(parsed.bigGate) ? parsed.bigGate : null,
      smallGate: isRect(parsed.smallGate) ? parsed.smallGate : null,
      timestamp: isRect(parsed.timestamp) ? parsed.timestamp : null,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
    };
  } catch {
    return null;
  }
}

/** Remove saved calibration. */
export function clearCalibration(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

/** True when every ROI has been drawn. */
export function isCalibrationComplete(c: Calibration | null): boolean {
  return !!c && !!c.bigGate && !!c.smallGate && !!c.timestamp;
}

function isRect(value: unknown): value is NormalizedRect {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.x === "number" &&
    typeof r.y === "number" &&
    typeof r.width === "number" &&
    typeof r.height === "number"
  );
}

/**
 * Grabs full video frames onto a reusable canvas so individual ROIs can be
 * cropped as ImageData without allocating a canvas per region per frame.
 */
export class FrameGrabber {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.createElement("canvas");
    const ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Could not obtain a 2D canvas context.");
    this.ctx = ctx;
  }

  /** Draw the current video frame at native resolution. Returns false if the video has no frame yet. */
  capture(video: HTMLVideoElement): boolean {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w === 0 || h === 0) return false;
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.ctx.drawImage(video, 0, 0, w, h);
    return true;
  }

  get width(): number {
    return this.canvas.width;
  }

  get height(): number {
    return this.canvas.height;
  }

  /** Extract a normalised ROI from the last captured frame as ImageData. */
  region(rect: NormalizedRect): ImageData | null {
    const sx = Math.round(rect.x * this.canvas.width);
    const sy = Math.round(rect.y * this.canvas.height);
    const sw = Math.max(1, Math.round(rect.width * this.canvas.width));
    const sh = Math.max(1, Math.round(rect.height * this.canvas.height));
    if (sx < 0 || sy < 0 || sx + sw > this.canvas.width || sy + sh > this.canvas.height) {
      return null;
    }
    try {
      return this.ctx.getImageData(sx, sy, sw, sh);
    } catch {
      return null;
    }
  }

  /** Extract a normalised ROI as a data URL (used to preview the timestamp crop). */
  regionDataURL(rect: NormalizedRect): string | null {
    const data = this.region(rect);
    if (!data) return null;
    const tmp = document.createElement("canvas");
    tmp.width = data.width;
    tmp.height = data.height;
    const tctx = tmp.getContext("2d");
    if (!tctx) return null;
    tctx.putImageData(data, 0, 0);
    return tmp.toDataURL("image/png");
  }
}

/** Normalise a pixel-space rect (relative to a display box) into 0..1 coordinates. */
export function toNormalizedRect(
  px: { x: number; y: number; width: number; height: number },
  displayWidth: number,
  displayHeight: number,
): NormalizedRect {
  const x = clamp01(px.x / displayWidth);
  const y = clamp01(px.y / displayHeight);
  return {
    x,
    y,
    width: clamp01(px.width / displayWidth),
    height: clamp01(px.height / displayHeight),
  };
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
