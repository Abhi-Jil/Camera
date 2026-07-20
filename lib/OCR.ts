// Timestamp OCR using Tesseract.js. Runs entirely in the browser (worker + WASM
// are fetched from the Tesseract CDN). We never read the system clock — the
// authoritative time always comes from the pixels burned into the CCTV frame.

import { createWorker, PSM, type Worker } from "tesseract.js";

/** Parsed OCR outcome for one timestamp crop. */
export interface OcrReading {
  /** Cleaned timestamp text, e.g. "18-07-2026 15:16:24". */
  text: string;
  /** Tesseract confidence (0..100). */
  confidence: number;
}

export class TimestampOCR {
  private worker: Worker | null = null;
  private initializing: Promise<void> | null = null;
  private readonly scratch: HTMLCanvasElement;

  constructor() {
    this.scratch = document.createElement("canvas");
  }

  /** Lazily create and configure the Tesseract worker. */
  async init(): Promise<void> {
    if (this.worker) return;
    if (this.initializing) return this.initializing;

    this.initializing = (async () => {
      // Self-hosted assets (served from this app's own origin) so nothing is
      // fetched from a third-party CDN — works behind restrictive firewalls.
      const worker = await createWorker("eng", 1, {
        workerPath: "/vendor/ocrdata/worker.min.js",
        corePath: "/vendor/ocrdata",
        langPath: "/vendor/ocrdata",
      });
      await worker.setParameters({
        // Timestamps only ever contain these characters.
        tessedit_char_whitelist: "0123456789-: ",
        // A single line of text.
        tessedit_pageseg_mode: PSM.SINGLE_LINE,
      });
      this.worker = worker;
    })();

    return this.initializing;
  }

  /**
   * Recognise the timestamp from an ImageData crop. Upscales small crops and
   * boosts contrast to help Tesseract with the small overlay font.
   */
  async read(imageData: ImageData): Promise<OcrReading> {
    await this.init();
    if (!this.worker) return { text: "", confidence: 0 };

    const prepared = this.preprocess(imageData);
    const result = await this.worker.recognize(prepared);
    const rawText = result.data.text ?? "";
    const confidence = result.data.confidence ?? 0;
    return { text: cleanTimestamp(rawText), confidence };
  }

  /** Terminate the worker and free its memory. */
  async dispose(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
    this.initializing = null;
  }

  /** Upscale ×3 and apply a grayscale + threshold pass to sharpen the digits. */
  private preprocess(imageData: ImageData): HTMLCanvasElement {
    const scale = 3;
    const w = imageData.width;
    const h = imageData.height;

    this.scratch.width = w * scale;
    this.scratch.height = h * scale;
    const ctx = this.scratch.getContext("2d");
    if (!ctx) return this.scratch;

    // Put the raw crop on a temp canvas, then draw it scaled up.
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    const tctx = tmp.getContext("2d");
    if (!tctx) return this.scratch;
    tctx.putImageData(imageData, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, this.scratch.width, this.scratch.height);

    // Binarise for a cleaner OCR target.
    const scaled = ctx.getImageData(0, 0, this.scratch.width, this.scratch.height);
    const px = scaled.data;
    for (let i = 0; i < px.length; i += 4) {
      const lum = 0.299 * px[i]! + 0.587 * px[i + 1]! + 0.114 * px[i + 2]!;
      const v = lum > 140 ? 255 : 0;
      px[i] = v;
      px[i + 1] = v;
      px[i + 2] = v;
    }
    ctx.putImageData(scaled, 0, 0);
    return this.scratch;
  }
}

/** Strip noise and normalise separators from raw OCR output. */
export function cleanTimestamp(raw: string): string {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  // Prefer a strict DD-MM-YYYY HH:MM:SS match if present.
  const match = collapsed.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}`;
  }
  return collapsed;
}

/** Parse "DD-MM-YYYY HH:MM:SS" into a Date, or null when malformed. */
export function parseTimestamp(text: string): Date | null {
  const m = text.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, min, ss] = m;
  const date = new Date(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(min),
    Number(ss),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/** True when the text is a well-formed timestamp. */
export function isValidTimestamp(text: string): boolean {
  return parseTimestamp(text) !== null;
}
