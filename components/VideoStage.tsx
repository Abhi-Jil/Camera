"use client";

// Displays the shared SmartPSS window and hosts the calibration drawing surface.
// During calibration the user draws three ROIs on a frozen snapshot; during
// monitoring the saved ROIs are overlaid on the live video.

import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toNormalizedRect } from "@/lib/ROI";
import type { Calibration, CalibrationStep, NormalizedRect } from "@/types";

interface RoiStyle {
  color: string;
  label: string;
}

const ROI_STYLES: Record<CalibrationStep, RoiStyle> = {
  bigGate: { color: "#38bdf8", label: "Big Gate" },
  smallGate: { color: "#f59e0b", label: "Small Gate" },
  timestamp: { color: "#a78bfa", label: "Timestamp" },
};

interface VideoStageProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isSharing: boolean;
  calibrating: boolean;
  currentStep: CalibrationStep | null;
  calibration: Calibration | null;
  snapshotUrl: string | null;
  showRois: boolean;
  onRectDrawn: (rect: NormalizedRect) => void;
}

interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function VideoStage({
  videoRef,
  isSharing,
  calibrating,
  currentStep,
  calibration,
  snapshotUrl,
  showRois,
  onRectDrawn,
}: VideoStageProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [preview, setPreview] = useState<PixelRect | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const { clientWidth: w, clientHeight: h } = container;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    const drawRect = (rect: NormalizedRect, style: RoiStyle): void => {
      const x = rect.x * w;
      const y = rect.y * h;
      const rw = rect.width * w;
      const rh = rect.height * h;
      ctx.lineWidth = 2;
      ctx.strokeStyle = style.color;
      ctx.fillStyle = `${style.color}22`;
      ctx.fillRect(x, y, rw, rh);
      ctx.strokeRect(x, y, rw, rh);
      ctx.fillStyle = style.color;
      ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
      const labelY = y > 16 ? y - 5 : y + rh + 14;
      ctx.fillText(style.label, x + 2, labelY);
    };

    // Persisted ROIs (visible during calibration and, if requested, monitoring).
    if (calibration && (calibrating || showRois)) {
      if (calibration.bigGate) drawRect(calibration.bigGate, ROI_STYLES.bigGate);
      if (calibration.smallGate) drawRect(calibration.smallGate, ROI_STYLES.smallGate);
      if (calibration.timestamp) drawRect(calibration.timestamp, ROI_STYLES.timestamp);
    }

    // In-progress drag preview.
    if (preview && currentStep) {
      const style = ROI_STYLES[currentStep];
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = style.color;
      ctx.strokeRect(preview.x, preview.y, preview.width, preview.height);
      ctx.setLineDash([]);
    }
  }, [calibration, calibrating, showRois, preview, currentStep]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(container);
    return () => observer.disconnect();
  }, [draw]);

  const localPoint = (e: React.PointerEvent): { x: number; y: number } => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent): void => {
    if (!calibrating || !currentStep) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    dragStartRef.current = localPoint(e);
    setPreview({ x: dragStartRef.current.x, y: dragStartRef.current.y, width: 0, height: 0 });
  };

  const onPointerMove = (e: React.PointerEvent): void => {
    if (!calibrating || !dragStartRef.current) return;
    const p = localPoint(e);
    const start = dragStartRef.current;
    setPreview({
      x: Math.min(start.x, p.x),
      y: Math.min(start.y, p.y),
      width: Math.abs(p.x - start.x),
      height: Math.abs(p.y - start.y),
    });
  };

  const onPointerUp = (): void => {
    if (!calibrating || !preview || !containerRef.current) {
      dragStartRef.current = null;
      return;
    }
    const { clientWidth: w, clientHeight: h } = containerRef.current;
    if (preview.width > 6 && preview.height > 6) {
      onRectDrawn(toNormalizedRect(preview, w, h));
    }
    dragStartRef.current = null;
    setPreview(null);
  };

  return (
    <div
      ref={containerRef}
      className="relative aspect-video w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950"
    >
      {/* Live shared video */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={`h-full w-full object-contain ${calibrating && snapshotUrl ? "invisible" : ""}`}
      />

      {/* Frozen snapshot shown while calibrating */}
      {calibrating && snapshotUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={snapshotUrl}
          alt="Calibration snapshot"
          className="absolute inset-0 h-full w-full object-contain"
        />
      )}

      {/* Drawing / ROI overlay */}
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className={`absolute inset-0 h-full w-full ${
          calibrating ? "cursor-crosshair" : "pointer-events-none"
        }`}
      />

      {/* Empty state */}
      {!isSharing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
          <div className="text-4xl">🖥️</div>
          <p className="max-w-sm text-sm text-slate-400">
            Click <span className="font-semibold text-slate-200">Share Screen</span> and select the
            SmartPSS Lite playback window to begin.
          </p>
        </div>
      )}

      {/* Calibration hint */}
      {calibrating && currentStep && (
        <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-slate-700 bg-slate-900/90 px-4 py-1.5 text-xs text-slate-200 shadow-lg">
          Draw a rectangle around the{" "}
          <span className="font-semibold" style={{ color: ROI_STYLES[currentStep].color }}>
            {ROI_STYLES[currentStep].label}
          </span>
        </div>
      )}
    </div>
  );
}
