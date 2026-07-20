"use client";

// Central monitoring engine. Loads OpenCV + OCR, processes frames from the
// shared video, runs the detection pipeline per gate, drives two independent
// state machines, and accumulates the event log + open/close cycles used for
// the Excel export.

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { loadOpenCV } from "@/lib/opencv";
import { FrameGrabber } from "@/lib/ROI";
import { TimestampOCR, isValidTimestamp } from "@/lib/OCR";
import {
  DEFAULT_CONFIG,
  GateStateMachine,
  analyzeROI,
  toGrayBlur,
} from "@/lib/GateDetector";
import { durationSeconds, formatDuration } from "@/lib/time";
import { useFrameLoop } from "@/hooks/useFrameLoop";
import type { Mat, OpenCV } from "@/types/opencv";
import type {
  Calibration,
  CycleRecord,
  DetectionConfig,
  GateEvent,
  GateId,
  GateStatus,
  MonitorSnapshot,
} from "@/types";

const GATE_LABELS: Record<GateId, string> = {
  big: "Big Main Gate",
  small: "Small Pedestrian Gate",
};

// Process ~4 frames/second regardless of playback speed. Stabilization of 3
// frames therefore commits after ~0.75s of real time.
const PROCESS_INTERVAL_MS = 250;

export type EngineStatus = "uninitialized" | "loading" | "ready" | "error";

export interface UseGateMonitorArgs {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  calibration: Calibration | null;
  running: boolean;
  config?: DetectionConfig;
}

export interface UseGateMonitorResult {
  engineStatus: EngineStatus;
  engineError: string | null;
  snapshot: MonitorSnapshot;
  events: GateEvent[];
  cycles: CycleRecord[];
  reset: () => void;
}

interface OpenCycle {
  gate: GateId;
  openTime: string;
}

export function useGateMonitor({
  videoRef,
  calibration,
  running,
  config = DEFAULT_CONFIG,
}: UseGateMonitorArgs): UseGateMonitorResult {
  const [engineStatus, setEngineStatus] = useState<EngineStatus>("uninitialized");
  const [engineError, setEngineError] = useState<string | null>(null);
  const [events, setEvents] = useState<GateEvent[]>([]);
  const [cycles, setCycles] = useState<CycleRecord[]>([]);
  const [snapshot, setSnapshot] = useState<MonitorSnapshot>({
    bigStatus: "unknown",
    smallStatus: "unknown",
    timestamp: "—",
    ocrConfidence: 0,
    framesProcessed: 0,
  });

  // --- Engine singletons held across renders ---
  const cvRef = useRef<OpenCV | null>(null);
  const ocrRef = useRef<TimestampOCR | null>(null);
  const grabberRef = useRef<FrameGrabber | null>(null);
  const machinesRef = useRef<Record<GateId, GateStateMachine> | null>(null);
  const referenceRef = useRef<Record<GateId, Mat | null>>({ big: null, small: null });
  const openCyclesRef = useRef<Record<GateId, OpenCycle | null>>({ big: null, small: null });

  // Live values read inside the frame loop without re-subscribing.
  const lastTimestampRef = useRef<string>("—");
  const lastOcrAtRef = useRef<number>(0);
  const ocrBusyRef = useRef<boolean>(false);
  const eventIdRef = useRef<number>(0);
  const framesRef = useRef<number>(0);
  const configRef = useRef<DetectionConfig>(config);
  configRef.current = config;
  const calibrationRef = useRef<Calibration | null>(calibration);
  calibrationRef.current = calibration;

  // Initialise heavy dependencies once, the first time monitoring is requested.
  useEffect(() => {
    if (!running || engineStatus === "ready" || engineStatus === "loading") return;
    let cancelled = false;

    setEngineStatus("loading");
    setEngineError(null);

    const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, rej) =>
          window.setTimeout(() => rej(new Error(label)), ms),
        ),
      ]);

    (async () => {
      try {
        if (!ocrRef.current) ocrRef.current = new TimestampOCR();
        // Load OpenCV (CV pipeline) and Tesseract (OCR) in parallel so the
        // slower download does not serialise behind the other. A hard timeout
        // guarantees the UI surfaces an error instead of spinning forever if a
        // CDN is unreachable (e.g. blocked by a corporate firewall).
        const [cv] = await withTimeout(
          Promise.all([loadOpenCV(), ocrRef.current.init()]),
          100_000,
          "Loading the CV/OCR models timed out. Please reload the page.",
        );
        if (cancelled) return;
        cvRef.current = cv;

        if (!grabberRef.current) grabberRef.current = new FrameGrabber();
        if (!machinesRef.current) {
          machinesRef.current = {
            big: new GateStateMachine("big", configRef.current.stabilizationFrames),
            small: new GateStateMachine("small", configRef.current.stabilizationFrames),
          };
        }
        setEngineStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setEngineError(err instanceof Error ? err.message : "Failed to initialise engine.");
        setEngineStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [running, engineStatus]);

  const logTransition = useCallback(
    (gate: GateId, status: GateStatus, timestamp: string): void => {
      const label = GATE_LABELS[gate];

      if (status === "open") {
        openCyclesRef.current[gate] = { gate, openTime: timestamp };
        eventIdRef.current += 1;
        setEvents((prev) => [
          {
            id: eventIdRef.current,
            gate,
            gateLabel: label,
            status: "Open",
            timestamp,
            duration: "—",
          },
          ...prev,
        ]);
      } else if (status === "closed") {
        const open = openCyclesRef.current[gate];
        openCyclesRef.current[gate] = null;
        const secs = open ? durationSeconds(open.openTime, timestamp) : null;
        const durationText = formatDuration(secs);

        eventIdRef.current += 1;
        setEvents((prev) => [
          {
            id: eventIdRef.current,
            gate,
            gateLabel: label,
            status: "Closed",
            timestamp,
            duration: durationText,
          },
          ...prev,
        ]);

        if (open) {
          setCycles((prev) => [
            ...prev,
            {
              gate,
              gateLabel: label,
              openTime: open.openTime,
              closeTime: timestamp,
              durationSeconds: secs,
            },
          ]);
        }
      }
    },
    [],
  );

  // Process one gate ROI: update its reference and state machine.
  const processGate = useCallback(
    (cv: OpenCV, grabber: FrameGrabber, gate: GateId, timestamp: string): GateStatus => {
      const cal = calibrationRef.current;
      const rect = gate === "big" ? cal?.bigGate : cal?.smallGate;
      const machine = machinesRef.current?.[gate];
      if (!rect || !machine) return machine?.current ?? "unknown";

      const imageData = grabber.region(rect);
      if (!imageData) return machine.current;

      const current = toGrayBlur(cv, imageData, configRef.current.blurKernel);
      const reference = referenceRef.current[gate];

      if (!reference) {
        // Seed the reference from the first frame (gates assumed closed at start).
        referenceRef.current[gate] = current.clone();
        current.delete();
        return machine.current;
      }

      const result = analyzeROI(cv, current, reference, configRef.current);
      const transition = machine.observe(result.changed, timestamp);
      if (transition) logTransition(transition.gate, transition.status, transition.timestamp);

      // Adaptive reference: refresh ONLY when the gate is confirmed closed AND
      // this frame shows no change. Freezing the reference the moment a change
      // appears is critical — otherwise the reference would drift to track the
      // opening gate and the change could never accumulate to a state flip.
      if (machine.current === "closed" && !result.changed) {
        reference.delete();
        referenceRef.current[gate] = current.clone();
      }
      current.delete();

      return machine.current;
    },
    [logTransition],
  );

  const onFrame = useCallback(
    (nowMs: number): void => {
      const cv = cvRef.current;
      const grabber = grabberRef.current;
      const video = videoRef.current;
      const cal = calibrationRef.current;
      if (!cv || !grabber || !video || !cal) return;
      if (!grabber.capture(video)) return;

      // --- OCR (throttled, timestamp from pixels only) ---
      const ocr = ocrRef.current;
      if (
        ocr &&
        cal.timestamp &&
        !ocrBusyRef.current &&
        nowMs - lastOcrAtRef.current >= configRef.current.ocrIntervalMs
      ) {
        lastOcrAtRef.current = nowMs;
        const tsCrop = grabber.region(cal.timestamp);
        if (tsCrop) {
          ocrBusyRef.current = true;
          void ocr
            .read(tsCrop)
            .then((reading) => {
              const accept =
                reading.confidence >= configRef.current.ocrMinConfidence &&
                isValidTimestamp(reading.text);
              if (accept) {
                lastTimestampRef.current = reading.text;
                setSnapshot((prev) => ({
                  ...prev,
                  timestamp: reading.text,
                  ocrConfidence: Math.round(reading.confidence),
                }));
              }
            })
            .catch(() => {
              /* keep previous timestamp on OCR failure */
            })
            .finally(() => {
              ocrBusyRef.current = false;
            });
        }
      }

      const timestamp = lastTimestampRef.current;

      // --- Detection for both gates ---
      const bigStatus = processGate(cv, grabber, "big", timestamp);
      const smallStatus = processGate(cv, grabber, "small", timestamp);

      framesRef.current += 1;
      setSnapshot((prev) => ({
        ...prev,
        bigStatus,
        smallStatus,
        framesProcessed: framesRef.current,
      }));
    },
    [processGate, videoRef],
  );

  useFrameLoop({
    videoRef,
    active: running && engineStatus === "ready",
    minIntervalMs: PROCESS_INTERVAL_MS,
    onFrame,
  });

  const reset = useCallback((): void => {
    setEvents([]);
    setCycles([]);
    eventIdRef.current = 0;
    framesRef.current = 0;
    openCyclesRef.current = { big: null, small: null };
    lastTimestampRef.current = "—";
    lastOcrAtRef.current = 0;
    referenceRef.current.big?.delete();
    referenceRef.current.small?.delete();
    referenceRef.current = { big: null, small: null };
    machinesRef.current = {
      big: new GateStateMachine("big", configRef.current.stabilizationFrames),
      small: new GateStateMachine("small", configRef.current.stabilizationFrames),
    };
    setSnapshot({
      bigStatus: "unknown",
      smallStatus: "unknown",
      timestamp: "—",
      ocrConfidence: 0,
      framesProcessed: 0,
    });
  }, []);

  // Tear down references and OCR worker on unmount.
  useEffect(() => {
    return () => {
      referenceRef.current.big?.delete();
      referenceRef.current.small?.delete();
      referenceRef.current = { big: null, small: null };
      void ocrRef.current?.dispose();
    };
  }, []);

  return useMemo(
    () => ({ engineStatus, engineError, snapshot, events, cycles, reset }),
    [engineStatus, engineError, snapshot, events, cycles, reset],
  );
}
