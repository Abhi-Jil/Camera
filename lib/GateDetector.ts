// Gate movement detection + per-gate state machine.
//
// Detection compares the current ROI against an adaptive reference frame (the
// most recent CONFIRMED-closed frame). The pipeline follows the spec:
//
//   Crop ROI → Grayscale → Gaussian Blur → SSIM + Pixel Difference →
//   Morphological Opening → Decision
//
// Robustness notes (false-positive suppression):
//  * The reference refreshes only while a gate is confirmed closed, so slow
//    lighting / day-night drift is absorbed without triggering an "open".
//  * A change is committed only after N consecutive frames agree
//    (stabilization), so a car/truck/person crossing the ROI for a frame or two
//    does not flip the state.
//  * Both a structural (SSIM) AND a pixel-ratio condition must hold, which
//    rejects most brightness-only and small-object changes.

import type { CvScalar, Mat, OpenCV } from "@/types/opencv";
import type { DetectionConfig, DetectionResult, GateId, GateStatus } from "@/types";

export const DEFAULT_CONFIG: DetectionConfig = {
  pixelDiffThreshold: 30,
  changedRatioThreshold: 0.08,
  edgeChangedThreshold: 0.05,
  ssimThreshold: 0.85,
  cannyLow: 50,
  cannyHigh: 150,
  blurKernel: 5,
  morphKernel: 3,
  stabilizationFrames: 3,
  ocrIntervalMs: 1000,
  ocrMinConfidence: 55,
};

const C1 = (0.01 * 255) ** 2;
const C2 = (0.03 * 255) ** 2;

/** Convert an RGBA ImageData crop into a grayscale + blurred single-channel Mat. */
export function toGrayBlur(cv: OpenCV, imageData: ImageData, blurKernel: number): Mat {
  const rgba = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY, 0);
  rgba.delete();
  const k = blurKernel % 2 === 0 ? blurKernel + 1 : blurKernel;
  const blurred = new cv.Mat();
  cv.GaussianBlur(gray, blurred, new cv.Size(k, k), 0);
  gray.delete();
  return blurred;
}

/** Global SSIM between two equally-sized single-channel Mats (1 = identical). */
function computeSSIM(cv: OpenCV, a: Mat, b: Mat): number {
  const fa = new cv.Mat();
  const fb = new cv.Mat();
  a.convertTo(fa, cv.CV_32F);
  b.convertTo(fb, cv.CV_32F);

  const meanOf = (m: Mat): number => (cv.mean(m) as CvScalar)[0] ?? 0;

  const muA = meanOf(fa);
  const muB = meanOf(fb);

  const aa = fa.mul(fa);
  const bb = fb.mul(fb);
  const ab = fa.mul(fb);

  const eAA = meanOf(aa);
  const eBB = meanOf(bb);
  const eAB = meanOf(ab);

  const varA = Math.max(0, eAA - muA * muA);
  const varB = Math.max(0, eBB - muB * muB);
  const covAB = eAB - muA * muB;

  aa.delete();
  bb.delete();
  ab.delete();
  fa.delete();
  fb.delete();

  const numerator = (2 * muA * muB + C1) * (2 * covAB + C2);
  const denominator = (muA * muA + muB * muB + C1) * (varA + varB + C2);
  if (denominator === 0) return 1;
  return numerator / denominator;
}

/**
 * Analyse a current ROI against its reference. Both Mats must be grayscale+blur
 * single-channel and identically sized. Neither Mat is deleted here.
 *
 * Accuracy strategy — distinguish a MOVING GATE from distractors:
 *  1. Brightness-normalize `current` to the reference's mean so uniform
 *     lighting / shadow / day↔night shifts cancel out (spec: ignore brightness
 *     and shadows).
 *  2. Edge-structural difference (Canny) is the PRIMARY signal: a gate is a
 *     rigid high-contrast edge pattern; when it moves the edges change a lot,
 *     whereas rain, shadows and brightness barely affect edges (spec: ignore
 *     rain / trees / shadows).
 *  3. An intensity-difference magnitude confirms the change is substantial.
 * Transient distractors (vehicles, people crossing) are rejected downstream by
 * the state machine's consecutive-frame stabilization.
 */
export function analyzeROI(
  cv: OpenCV,
  current: Mat,
  reference: Mat,
  config: DetectionConfig,
): DetectionResult {
  const totalPixels = current.rows * current.cols || 1;
  const k = config.morphKernel % 2 === 0 ? config.morphKernel + 1 : config.morphKernel;
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(k, k));

  // --- 1. Brightness normalization (illumination invariance) ---
  const muRef = (cv.mean(reference) as CvScalar)[0] ?? 0;
  const muCur = (cv.mean(current) as CvScalar)[0] ?? 0;
  const norm = new cv.Mat();
  // saturate_cast(1 * current + (muRef - muCur)) — shift current to ref brightness.
  current.convertTo(norm, -1, 1, muRef - muCur);

  // --- 2. Intensity difference (magnitude) ---
  const diff = new cv.Mat();
  cv.absdiff(norm, reference, diff);
  const thresh = new cv.Mat();
  cv.threshold(diff, thresh, config.pixelDiffThreshold, 255, cv.THRESH_BINARY);
  diff.delete();
  const openedDiff = new cv.Mat();
  cv.morphologyEx(thresh, openedDiff, cv.MORPH_OPEN, kernel);
  thresh.delete();
  const changedRatio = cv.countNonZero(openedDiff) / totalPixels;
  openedDiff.delete();

  // --- 3. Edge-structural difference (primary signal) ---
  const edgeCur = new cv.Mat();
  const edgeRef = new cv.Mat();
  cv.Canny(norm, edgeCur, config.cannyLow, config.cannyHigh);
  cv.Canny(reference, edgeRef, config.cannyLow, config.cannyHigh);
  const edgeDiff = new cv.Mat();
  cv.absdiff(edgeCur, edgeRef, edgeDiff);
  edgeCur.delete();
  edgeRef.delete();
  const openedEdge = new cv.Mat();
  cv.morphologyEx(edgeDiff, openedEdge, cv.MORPH_OPEN, kernel);
  edgeDiff.delete();
  const edgeChangedRatio = cv.countNonZero(openedEdge) / totalPixels;
  openedEdge.delete();

  // --- 4. SSIM (diagnostic / secondary structural measure) ---
  const ssim = computeSSIM(cv, norm, reference);

  norm.delete();
  kernel.delete();

  // A real gate movement changes BOTH the edge structure AND a substantial
  // area of the ROI. Requiring both rejects lighting-only and fine-texture
  // (rain/leaf) changes that trip only one metric.
  const changed =
    edgeChangedRatio >= config.edgeChangedThreshold &&
    changedRatio >= config.changedRatioThreshold;

  return { ssim, changedRatio, edgeChangedRatio, changed };
}

/** Emitted when a gate commits a new confirmed state. */
export interface StateTransition {
  gate: GateId;
  status: GateStatus;
  /** Timestamp of the transition (OCR string). */
  timestamp: string;
}

/**
 * Independent state machine for a single gate. Requires `stabilizationFrames`
 * consecutive agreeing observations before committing a transition.
 */
export class GateStateMachine {
  readonly gate: GateId;
  private status: GateStatus = "unknown";
  private candidate: GateStatus = "unknown";
  private candidateCount = 0;

  constructor(gate: GateId, private readonly stabilizationFrames: number) {
    this.gate = gate;
  }

  get current(): GateStatus {
    return this.status;
  }

  /**
   * Feed one processed observation. `isOpen` is the raw per-frame signal.
   * Returns a transition when the state actually changes, else null.
   */
  observe(isOpen: boolean, timestamp: string): StateTransition | null {
    const observed: GateStatus = isOpen ? "open" : "closed";

    // First ever observation seeds the state without a logged transition.
    if (this.status === "unknown") {
      this.status = observed;
      this.candidate = observed;
      this.candidateCount = 0;
      return null;
    }

    if (observed === this.status) {
      // Reinforces the current state; reset any pending candidate.
      this.candidate = this.status;
      this.candidateCount = 0;
      return null;
    }

    // Observation differs from the committed state — build confidence.
    if (observed === this.candidate) {
      this.candidateCount += 1;
    } else {
      this.candidate = observed;
      this.candidateCount = 1;
    }

    if (this.candidateCount >= this.stabilizationFrames) {
      this.status = observed;
      this.candidateCount = 0;
      return { gate: this.gate, status: observed, timestamp };
    }

    return null;
  }
}
