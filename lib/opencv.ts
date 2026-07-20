// Loads OpenCV.js (WASM) from the official CDN exactly once and resolves when
// the runtime is ready. Everything runs client-side; no image ever leaves the
// browser.
//
// This loader is deliberately defensive: different OpenCV.js builds expose the
// module in different ways —
//   * object style : `window.cv` is an object; `cv.onRuntimeInitialized` fires
//                     when WASM is ready.
//   * promise style : `window.cv` is a thenable that resolves to the module
//                     (4.8+ builds). Attaching `onRuntimeInitialized` here would
//                     hang forever — we must await it instead.
// We handle both, plus a polling fallback and a hard timeout so the UI can
// surface a real error rather than spinning on "Loading models…".

import type { OpenCV } from "@/types/opencv";

const OPENCV_CDN_URL = "https://docs.opencv.org/4.x/opencv.js";
const LOAD_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 150;

let loadPromise: Promise<OpenCV> | null = null;

function isUsable(candidate: unknown): candidate is OpenCV {
  return (
    !!candidate &&
    typeof (candidate as OpenCV).matFromImageData === "function" &&
    typeof (candidate as OpenCV).Mat === "function"
  );
}

function isThenable(value: unknown): value is Promise<OpenCV> {
  return !!value && typeof (value as { then?: unknown }).then === "function";
}

export function loadOpenCV(): Promise<OpenCV> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("OpenCV.js can only load in the browser."));
  }

  if (loadPromise) return loadPromise;

  loadPromise = new Promise<OpenCV>((resolve, reject) => {
    let settled = false;
    const start = performance.now();
    let pollId = 0;

    const finish = (cv: OpenCV): void => {
      if (settled) return;
      settled = true;
      if (pollId) window.clearInterval(pollId);
      window.cv = cv;
      resolve(cv);
    };

    const fail = (message: string): void => {
      if (settled) return;
      settled = true;
      if (pollId) window.clearInterval(pollId);
      loadPromise = null; // allow a retry
      reject(new Error(message));
    };

    // Wire up whatever `window.cv` currently is.
    const attach = (candidate: unknown): void => {
      if (isUsable(candidate)) {
        finish(candidate);
        return;
      }
      if (isThenable(candidate)) {
        candidate
          .then((mod) => finish(mod))
          .catch(() => fail("OpenCV.js failed to initialise (promise rejected)."));
        return;
      }
      // Object style: the runtime hook fires once WASM is ready.
      if (candidate && typeof candidate === "object") {
        try {
          (candidate as OpenCV).onRuntimeInitialized = () => {
            const ready = window.cv;
            if (isUsable(ready)) finish(ready);
          };
        } catch {
          /* ignore — the poller will still catch readiness */
        }
      }
    };

    // Universal fallback: poll until the module becomes usable or we time out.
    pollId = window.setInterval(() => {
      if (settled) return;
      const cv = window.cv;
      if (isUsable(cv)) {
        finish(cv);
        return;
      }
      if (isThenable(cv)) {
        // Attach once; the .then above will resolve us.
        attach(cv);
        return;
      }
      if (performance.now() - start > LOAD_TIMEOUT_MS) {
        fail(
          "OpenCV.js took too long to load. Check that your network/firewall " +
            "allows https://docs.opencv.org, then reload.",
        );
      }
    }, POLL_INTERVAL_MS);

    // Already present (e.g. hot reload / second mount).
    if (isUsable(window.cv) || isThenable(window.cv)) {
      attach(window.cv);
      return;
    }

    if (window.__cvScriptAppended__) {
      attach(window.cv);
      return;
    }

    const script = document.createElement("script");
    script.src = OPENCV_CDN_URL;
    script.async = true;
    script.onload = (): void => attach(window.cv);
    script.onerror = (): void =>
      fail("Failed to download OpenCV.js (blocked by network/firewall or offline?).");

    window.__cvScriptAppended__ = true;
    document.body.appendChild(script);
  });

  return loadPromise;
}
