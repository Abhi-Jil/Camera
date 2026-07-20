"use client";

// Drives a per-frame callback from a video element. Prefers
// requestVideoFrameCallback (fires once per decoded frame) and falls back to
// requestAnimationFrame. Callbacks are throttled to `minIntervalMs` so heavy
// CV work does not run on every single frame.

import type React from "react";
import { useEffect, useRef } from "react";

export interface FrameLoopOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  active: boolean;
  /** Minimum wall-clock gap between processed frames, in ms. */
  minIntervalMs: number;
  /** Invoked (throttled) with the current high-res timestamp. */
  onFrame: (nowMs: number) => void;
}

export function useFrameLoop({ videoRef, active, minIntervalMs, onFrame }: FrameLoopOptions): void {
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  const lastProcessedRef = useRef(0);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    const video = videoRef.current;
    if (!video) return;

    let rafId = 0;
    let rvfcId = 0;
    let cancelled = false;

    const tick = (now: number): void => {
      if (cancelled) return;
      const elapsed = now - lastProcessedRef.current;
      if (!busyRef.current && elapsed >= minIntervalMs) {
        lastProcessedRef.current = now;
        busyRef.current = true;
        try {
          onFrameRef.current(now);
        } finally {
          busyRef.current = false;
        }
      }
      schedule();
    };

    const schedule = (): void => {
      if (cancelled) return;
      if (typeof video.requestVideoFrameCallback === "function") {
        rvfcId = video.requestVideoFrameCallback((ts) => tick(ts));
      } else {
        rafId = window.requestAnimationFrame((ts) => tick(ts));
      }
    };

    schedule();

    return () => {
      cancelled = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      if (rvfcId && typeof video.cancelVideoFrameCallback === "function") {
        video.cancelVideoFrameCallback(rvfcId);
      }
    };
  }, [active, minIntervalMs, videoRef]);
}
