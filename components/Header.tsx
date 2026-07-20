"use client";

import type React from "react";
import { Button } from "@/components/Button";
import type { MonitorPhase, PlaybackSpeed } from "@/types";

interface HeaderProps {
  phase: MonitorPhase;
  isSharing: boolean;
  calibrated: boolean;
  playbackSpeed: PlaybackSpeed;
  onShare: () => void;
  onCalibrate: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onDone: () => void;
  onSpeedChange: (speed: PlaybackSpeed) => void;
}

const SPEEDS: PlaybackSpeed[] = [1, 2, 4, 8, 10];

export function Header({
  phase,
  isSharing,
  calibrated,
  playbackSpeed,
  onShare,
  onCalibrate,
  onStart,
  onPause,
  onResume,
  onDone,
  onSpeedChange,
}: HeaderProps): React.JSX.Element {
  const monitoring = phase === "monitoring";
  const paused = phase === "paused";

  return (
    <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-500 text-lg">
            🎥
          </div>
          <div>
            <h1 className="text-base font-semibold leading-tight text-slate-100">
              CCTV Gate Monitor
            </h1>
            <p className="text-xs text-slate-400">SmartPSS Lite · in-browser gate detection</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant={isSharing ? "secondary" : "primary"} onClick={onShare}>
            {isSharing ? "Re-share Screen" : "Share Screen"}
          </Button>

          <Button variant="secondary" onClick={onCalibrate} disabled={!isSharing}>
            Calibrate
          </Button>

          {!monitoring && !paused && (
            <Button variant="success" onClick={onStart} disabled={!isSharing || !calibrated}>
              Start Monitoring
            </Button>
          )}

          {monitoring && (
            <Button variant="warning" onClick={onPause}>
              Pause
            </Button>
          )}

          {paused && (
            <Button variant="success" onClick={onResume}>
              Resume
            </Button>
          )}

          <Button variant="danger" onClick={onDone} disabled={!monitoring && !paused}>
            Done · Export
          </Button>

          <div className="ml-1 flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1">
            {SPEEDS.map((speed) => (
              <button
                key={speed}
                onClick={() => onSpeedChange(speed)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  playbackSpeed === speed
                    ? "bg-sky-500 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {speed}×
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
