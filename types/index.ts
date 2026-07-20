// Shared domain types for the CCTV Gate Monitor application.

/** Identifier for one of the two independently-tracked gates. */
export type GateId = "big" | "small";

/** Human-facing status of a gate. */
export type GateStatus = "open" | "closed" | "unknown";

/** Playback speeds the UI advertises for SmartPSS. */
export type PlaybackSpeed = 1 | 2 | 4 | 8 | 10;

/** High-level lifecycle of the monitoring engine. */
export type MonitorPhase = "idle" | "sharing" | "monitoring" | "paused" | "done";

/**
 * A rectangle expressed in NORMALISED coordinates (0..1) relative to the
 * source video frame. Storing normalised coordinates keeps calibration valid
 * regardless of the actual capture resolution.
 */
export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Region-of-interest calibration persisted to LocalStorage. */
export interface Calibration {
  bigGate: NormalizedRect | null;
  smallGate: NormalizedRect | null;
  timestamp: NormalizedRect | null;
  savedAt: string;
}

/** The three ROIs the user draws during calibration, in draw order. */
export type CalibrationStep = "bigGate" | "smallGate" | "timestamp";

/** A single row in the live event table (one per state change). */
export interface GateEvent {
  id: number;
  gate: GateId;
  gateLabel: string;
  status: "Open" | "Closed";
  /** OCR timestamp string, e.g. "18-07-2026 15:16:24". */
  timestamp: string;
  /** Formatted duration (only present on a Closed row). */
  duration: string;
}

/** A completed (or still-open) open→close cycle used for the Excel report. */
export interface CycleRecord {
  gate: GateId;
  gateLabel: string;
  openTime: string;
  closeTime: string | null;
  durationSeconds: number | null;
}

/** Tunable detection parameters shared by both gate detectors. */
export interface DetectionConfig {
  /** Per-pixel intensity delta above which a pixel counts as "changed". */
  pixelDiffThreshold: number;
  /** Fraction of changed pixels (0..1) required to consider the ROI altered. */
  changedRatioThreshold: number;
  /**
   * Fraction of Canny edge pixels (0..1) that must differ from the reference.
   * This is the structural signal — robust to brightness/shadow/rain because
   * those barely affect edges, while a moving gate changes edges drastically.
   */
  edgeChangedThreshold: number;
  /** SSIM below this value indicates significant structural change (diagnostic). */
  ssimThreshold: number;
  /** Lower Canny hysteresis threshold. */
  cannyLow: number;
  /** Upper Canny hysteresis threshold. */
  cannyHigh: number;
  /** Gaussian blur kernel size (odd number). */
  blurKernel: number;
  /** Morphological opening kernel size. */
  morphKernel: number;
  /** Consecutive processed frames required before committing a state change. */
  stabilizationFrames: number;
  /** How often (ms of wall-clock) OCR runs. */
  ocrIntervalMs: number;
  /** Minimum OCR confidence (0..100) to accept a fresh timestamp. */
  ocrMinConfidence: number;
}

/** Result of analysing a single ROI against its reference frame. */
export interface DetectionResult {
  /** Structural Similarity Index (1 = identical). */
  ssim: number;
  /** Fraction of pixels that changed after brightness normalization (0..1). */
  changedRatio: number;
  /** Fraction of edge pixels that differ from the reference (0..1). */
  edgeChangedRatio: number;
  /** True when the ROI is considered "open" relative to reference. */
  changed: boolean;
}

/** Current live status of both gates plus the active OCR timestamp. */
export interface MonitorSnapshot {
  bigStatus: GateStatus;
  smallStatus: GateStatus;
  timestamp: string;
  ocrConfidence: number;
  framesProcessed: number;
}
