"use client";

// Manages the getDisplayMedia screen-share lifecycle. The user is expected to
// share ONLY the SmartPSS Lite window.

import { useCallback, useEffect, useRef, useState } from "react";

export interface ScreenCaptureState {
  stream: MediaStream | null;
  isSharing: boolean;
  error: string | null;
  requestShare: () => Promise<void>;
  stopShare: () => void;
}

export function useScreenCapture(): ScreenCaptureState {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopShare = useCallback((): void => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStream(null);
  }, []);

  const requestShare = useCallback(async (): Promise<void> => {
    setError(null);
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError("Screen capture is not supported in this browser.");
      return;
    }
    try {
      const media = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 60 } },
        audio: false,
      });
      // Clean up any previous stream before adopting the new one.
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      streamRef.current = media;
      setStream(media);

      // If the user stops sharing from the browser chrome, reflect it.
      const [videoTrack] = media.getVideoTracks();
      if (videoTrack) {
        videoTrack.addEventListener("ended", () => {
          stopShare();
        });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("Screen share was cancelled.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to start screen capture.");
      }
    }
  }, [stopShare]);

  // Ensure tracks are released on unmount.
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return {
    stream,
    isSharing: stream !== null,
    error,
    requestShare,
    stopShare,
  };
}
