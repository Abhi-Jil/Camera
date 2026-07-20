// Loads OpenCV.js (WASM) from the official CDN exactly once and resolves when
// the runtime is ready. Everything runs client-side; no image ever leaves the
// browser.

import type { OpenCV } from "@/types/opencv";

const OPENCV_CDN_URL = "https://docs.opencv.org/4.10.0/opencv.js";

let loadPromise: Promise<OpenCV> | null = null;

/**
 * Returns a ready-to-use OpenCV module. Safe to call repeatedly — the script is
 * injected only once and the same promise is shared by all callers.
 */
export function loadOpenCV(): Promise<OpenCV> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("OpenCV.js can only load in the browser."));
  }

  if (loadPromise) return loadPromise;

  loadPromise = new Promise<OpenCV>((resolve, reject) => {
    // Already fully initialised (e.g. hot reload).
    if (window.cv && typeof window.cv.matFromImageData === "function") {
      resolve(window.cv);
      return;
    }

    const finish = (): void => {
      if (window.cv) resolve(window.cv);
      else reject(new Error("OpenCV.js loaded but window.cv is undefined."));
    };

    // The script may already be on the page from a previous mount.
    if (window.__cvScriptAppended__) {
      const existing = window.cv;
      if (existing) {
        existing.onRuntimeInitialized = finish;
      }
      return;
    }

    const script = document.createElement("script");
    script.src = OPENCV_CDN_URL;
    script.async = true;
    script.onload = (): void => {
      const cv = window.cv;
      if (!cv) {
        reject(new Error("OpenCV.js failed to attach to window."));
        return;
      }
      // OpenCV.js may already be initialised, or may call the hook later.
      if (typeof cv.matFromImageData === "function") {
        finish();
      } else {
        cv.onRuntimeInitialized = finish;
      }
    };
    script.onerror = (): void => {
      loadPromise = null;
      reject(new Error("Failed to download OpenCV.js from the CDN."));
    };

    window.__cvScriptAppended__ = true;
    document.body.appendChild(script);
  });

  return loadPromise;
}
