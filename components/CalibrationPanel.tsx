"use client";

import type React from "react";
import { Button } from "@/components/Button";
import type { Calibration, CalibrationStep } from "@/types";

interface CalibrationPanelProps {
  calibrating: boolean;
  currentStep: CalibrationStep | null;
  calibration: Calibration | null;
  onCancel: () => void;
  onClear: () => void;
}

const STEPS: { key: CalibrationStep; label: string; color: string }[] = [
  { key: "bigGate", label: "Big Gate ROI", color: "#38bdf8" },
  { key: "smallGate", label: "Small Gate ROI", color: "#f59e0b" },
  { key: "timestamp", label: "Timestamp ROI", color: "#a78bfa" },
];

export function CalibrationPanel({
  calibrating,
  currentStep,
  calibration,
  onCancel,
  onClear,
}: CalibrationPanelProps): React.JSX.Element {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-100">Calibration</h2>
        {calibrating ? (
          <Button variant="ghost" onClick={onCancel} className="px-2 py-1 text-xs">
            Cancel
          </Button>
        ) : (
          <Button variant="ghost" onClick={onClear} className="px-2 py-1 text-xs">
            Clear
          </Button>
        )}
      </div>

      <ul className="space-y-2">
        {STEPS.map((step) => {
          const done = !!calibration?.[step.key];
          const active = calibrating && currentStep === step.key;
          return (
            <li
              key={step.key}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
                active
                  ? "border-slate-600 bg-slate-800/70"
                  : "border-slate-800 bg-slate-950/40"
              }`}
            >
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-slate-900"
                style={{ backgroundColor: done ? step.color : "#334155", color: done ? "#0f172a" : "#94a3b8" }}
              >
                {done ? "✓" : ""}
              </span>
              <span className="flex-1 text-slate-200">{step.label}</span>
              {active && <span className="text-xs font-medium text-sky-400">Drawing…</span>}
              {done && !active && <span className="text-xs text-emerald-400">Set</span>}
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-xs text-slate-500">
        {calibrating
          ? "Draw each rectangle on the frozen frame. ROIs are saved to your browser automatically."
          : calibration?.savedAt
            ? `Saved locally on ${new Date(calibration.savedAt).toLocaleString()}.`
            : "Not calibrated yet. Click Calibrate to freeze a frame and draw the ROIs."}
      </p>
    </div>
  );
}
