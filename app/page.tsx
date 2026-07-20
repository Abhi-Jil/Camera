"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Header } from "@/components/Header";
import { VideoStage } from "@/components/VideoStage";
import { StatusPanel } from "@/components/StatusPanel";
import { EventTable } from "@/components/EventTable";
import { CalibrationPanel } from "@/components/CalibrationPanel";

import { useScreenCapture } from "@/hooks/useScreenCapture";
import { useGateMonitor } from "@/hooks/useGateMonitor";

import {
  clearCalibration,
  isCalibrationComplete,
  loadCalibration,
  saveCalibration,
} from "@/lib/ROI";
import { exportGateReport } from "@/lib/ExcelExporter";

import type {
  Calibration,
  CalibrationStep,
  CycleRecord,
  MonitorPhase,
  NormalizedRect,
  PlaybackSpeed,
} from "@/types";

const CALIBRATION_ORDER: CalibrationStep[] = ["bigGate", "smallGate", "timestamp"];

const EMPTY_CALIBRATION: Calibration = {
  bigGate: null,
  smallGate: null,
  timestamp: null,
  savedAt: "",
};

export default function Page(): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { stream, isSharing, error: shareError, requestShare } = useScreenCapture();

  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  const [draft, setDraft] = useState<Calibration>(EMPTY_CALIBRATION);
  const [stepIndex, setStepIndex] = useState(0);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);

  const [phase, setPhase] = useState<MonitorPhase>("idle");
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const [exporting, setExporting] = useState(false);

  const running = phase === "monitoring";
  const calibrated = isCalibrationComplete(calibration);
  const currentStep: CalibrationStep | null = calibrating
    ? CALIBRATION_ORDER[stepIndex] ?? null
    : null;

  const { engineStatus, engineError, snapshot, events, cycles, reset } = useGateMonitor({
    videoRef,
    calibration,
    running,
  });

  // Load saved calibration on first mount.
  useEffect(() => {
    setCalibration(loadCalibration());
  }, []);

  // Bind the shared stream to the video element.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) {
      video.play().catch(() => {
        /* autoplay may require a gesture; the video is muted so this is rare */
      });
      if (phase === "idle") setPhase("sharing");
    }
  }, [stream, phase]);

  // Mirror the chosen playback speed onto the video element.
  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = playbackSpeed;
  }, [playbackSpeed, stream]);

  // ---- Calibration ----
  const captureSnapshot = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  }, []);

  const startCalibration = useCallback(() => {
    const url = captureSnapshot();
    if (!url) return;
    setSnapshotUrl(url);
    setDraft(calibration ? { ...calibration } : { ...EMPTY_CALIBRATION });
    setStepIndex(0);
    setCalibrating(true);
    if (phase === "monitoring" || phase === "paused") setPhase("sharing");
  }, [captureSnapshot, calibration, phase]);

  const handleRectDrawn = useCallback(
    (rect: NormalizedRect) => {
      const step = CALIBRATION_ORDER[stepIndex];
      if (!step) return;
      const updated: Calibration = { ...draft, [step]: rect };
      setDraft(updated);

      const next = stepIndex + 1;
      if (next >= CALIBRATION_ORDER.length) {
        // Finished — persist and exit calibration.
        const finalCal: Calibration = { ...updated, savedAt: new Date().toISOString() };
        saveCalibration(finalCal);
        setCalibration(finalCal);
        setCalibrating(false);
        setSnapshotUrl(null);
        setStepIndex(0);
      } else {
        setStepIndex(next);
      }
    },
    [draft, stepIndex],
  );

  const cancelCalibration = useCallback(() => {
    setCalibrating(false);
    setSnapshotUrl(null);
    setStepIndex(0);
    setDraft(EMPTY_CALIBRATION);
  }, []);

  const handleClearCalibration = useCallback(() => {
    clearCalibration();
    setCalibration(null);
  }, []);

  // ---- Monitoring controls ----
  const handleStart = useCallback(() => {
    reset();
    setPhase("monitoring");
  }, [reset]);

  const handlePause = useCallback(() => setPhase("paused"), []);
  const handleResume = useCallback(() => setPhase("monitoring"), []);

  // Derive still-open cycles (a gate open at the moment Done is pressed).
  const buildFinalCycles = useCallback((): CycleRecord[] => {
    const openRecords: CycleRecord[] = [];
    (["big", "small"] as const).forEach((gate) => {
      const status = gate === "big" ? snapshot.bigStatus : snapshot.smallStatus;
      if (status !== "open") return;
      // events are newest-first; find the current open event.
      const openEvent = events.find((e) => e.gate === gate && e.status === "Open");
      if (openEvent) {
        openRecords.push({
          gate,
          gateLabel: openEvent.gateLabel,
          openTime: openEvent.timestamp,
          closeTime: null,
          durationSeconds: null,
        });
      }
    });
    return [...cycles, ...openRecords];
  }, [cycles, events, snapshot.bigStatus, snapshot.smallStatus]);

  const handleDone = useCallback(async () => {
    setPhase("done");
    setExporting(true);
    try {
      await exportGateReport(buildFinalCycles());
    } catch {
      // Export failure is surfaced via the button state resetting.
    } finally {
      setExporting(false);
    }
  }, [buildFinalCycles]);

  const headerPhase: MonitorPhase = phase;

  const banner = useMemo(() => {
    if (shareError) return { tone: "error" as const, text: shareError };
    if (engineError) return { tone: "error" as const, text: engineError };
    if (isSharing && !calibrated && !calibrating)
      return {
        tone: "warn" as const,
        text: "Screen shared. Now click Calibrate to mark the two gates and the timestamp.",
      };
    if (phase === "done")
      return { tone: "ok" as const, text: "Report exported. You can keep monitoring or start over." };
    return null;
  }, [shareError, engineError, isSharing, calibrated, calibrating, phase]);

  return (
    <div className="min-h-screen">
      <Header
        phase={headerPhase}
        isSharing={isSharing}
        calibrated={calibrated}
        playbackSpeed={playbackSpeed}
        onShare={requestShare}
        onCalibrate={startCalibration}
        onStart={handleStart}
        onPause={handlePause}
        onResume={handleResume}
        onDone={handleDone}
        onSpeedChange={setPlaybackSpeed}
      />

      <main className="mx-auto max-w-[1600px] px-4 py-5">
        {banner && (
          <div
            className={`mb-4 rounded-lg border px-4 py-2.5 text-sm ${
              banner.tone === "error"
                ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                : banner.tone === "warn"
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                  : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
            }`}
          >
            {exporting ? "Generating Gate_Report.xlsx…" : banner.text}
          </div>
        )}

        <StatusPanel
          snapshot={snapshot}
          engineStatus={engineStatus}
          engineError={engineError}
          running={running}
        />

        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[1fr_340px]">
          <div className="space-y-5">
            <VideoStage
              videoRef={videoRef}
              isSharing={isSharing}
              calibrating={calibrating}
              currentStep={currentStep}
              calibration={calibrating ? draft : calibration}
              snapshotUrl={snapshotUrl}
              showRois={running || phase === "paused"}
              onRectDrawn={handleRectDrawn}
            />
            <EventTable events={events} />
          </div>

          <div className="space-y-5">
            <CalibrationPanel
              calibrating={calibrating}
              currentStep={currentStep}
              calibration={calibrating ? draft : calibration}
              onCancel={cancelCalibration}
              onClear={handleClearCalibration}
            />

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
              <h2 className="mb-2 text-sm font-semibold text-slate-100">How it works</h2>
              <ol className="list-decimal space-y-1.5 pl-4">
                <li>Share only the SmartPSS Lite playback window.</li>
                <li>Calibrate the two gate ROIs + the timestamp ROI once.</li>
                <li>Play footage in SmartPSS at 1×–10× and Start Monitoring.</li>
                <li>Open/close events are logged with OCR timestamps.</li>
                <li>Click Done to download <span className="font-mono">Gate_Report.xlsx</span>.</li>
              </ol>
              <p className="mt-3 text-xs text-slate-500">
                All processing is local. No frame is ever uploaded, and the timestamp always comes
                from the video — never the system clock.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
