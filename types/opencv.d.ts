// Minimal, strongly-typed facade over the subset of the OpenCV.js API this
// application uses. OpenCV.js ships without types; declaring only what we call
// lets the rest of the codebase stay free of `any`.

/** A rectangle in pixel coordinates. */
export interface CvRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Opaque size object. */
export interface CvSize {
  width: number;
  height: number;
}

/** Opaque point object. */
export interface CvPoint {
  x: number;
  y: number;
}

/** An OpenCV matrix. Only the members we touch are declared. */
export interface Mat {
  rows: number;
  cols: number;
  data: Uint8Array;
  data32F: Float32Array;
  delete(): void;
  clone(): Mat;
  roi(rect: CvRect): Mat;
  convertTo(dst: Mat, rtype: number, alpha?: number, beta?: number): void;
  mul(other: Mat): Mat;
}

/** A 4-element scalar returned by cv.mean(). */
export type CvScalar = number[];

/** The OpenCV.js module surface used by this app. */
export interface OpenCV {
  Mat: {
    new (): Mat;
    new (rows: number, cols: number, type: number): Mat;
  };
  Size: new (width: number, height: number) => CvSize;
  Point: new (x: number, y: number) => CvPoint;
  Rect: new (x: number, y: number, width: number, height: number) => CvRect;

  matFromImageData(imageData: ImageData): Mat;

  cvtColor(src: Mat, dst: Mat, code: number, dstCn?: number): void;
  GaussianBlur(src: Mat, dst: Mat, ksize: CvSize, sigmaX: number, sigmaY?: number): void;
  absdiff(src1: Mat, src2: Mat, dst: Mat): void;
  threshold(src: Mat, dst: Mat, thresh: number, maxval: number, type: number): number;
  morphologyEx(src: Mat, dst: Mat, op: number, kernel: Mat): void;
  getStructuringElement(shape: number, ksize: CvSize): Mat;
  Canny(image: Mat, edges: Mat, threshold1: number, threshold2: number): void;
  countNonZero(src: Mat): number;
  mean(src: Mat): CvScalar;

  // Constants (numeric enums in OpenCV.js).
  COLOR_RGBA2GRAY: number;
  THRESH_BINARY: number;
  MORPH_OPEN: number;
  MORPH_RECT: number;
  CV_32F: number;

  /** Set by the loader script when the WASM runtime has finished init. */
  onRuntimeInitialized?: () => void;
}

declare global {
  interface Window {
    cv?: OpenCV;
    /** Guard flag the loader sets once the script tag has been appended. */
    __cvScriptAppended__?: boolean;
  }

  interface HTMLVideoElement {
    requestVideoFrameCallback?(callback: VideoFrameRequestCallback): number;
    cancelVideoFrameCallback?(handle: number): void;
  }

  type VideoFrameRequestCallback = (
    now: DOMHighResTimeStamp,
    metadata: VideoFrameCallbackMetadata,
  ) => void;

  interface VideoFrameCallbackMetadata {
    presentationTime: DOMHighResTimeStamp;
    expectedDisplayTime: DOMHighResTimeStamp;
    width: number;
    height: number;
    mediaTime: number;
    presentedFrames: number;
    processingDuration?: number;
  }
}

export {};
