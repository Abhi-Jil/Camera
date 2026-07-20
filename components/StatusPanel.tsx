"use client";

import type React from "react";
import { StatusBadge } from "@/components/StatusBadge";
import type { EngineStatus } from "@/hooks/useGateMonitor";
import type { MonitorSnapshot } from "@/types";

interface StatusPanelProps {
  snapshot: MonitorSnapshot;
  engineStatus: EngineStatus;
  engineError: string | null;
  running: boolean;
}

export function StatusPanel({
  snapshot,
  engineStatus,
  engineError,
  running,
}: StatusPanelProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card title="Current Timestamp (OCR)">
        <div className="font-mono text-lg font-semibold text-slate-100">{snapshot.timestamp}</div>
        <div className="mt-1 text-xs text-slate-500">
          Confidence: {snapshot.ocrConfidence}% · from video pixels
        </div>
      </Card>

      <Card title="Big Main Gate">
        <StatusBadge status={snapshot.bigStatus} />
      </Card>

      <Card title="Small Pedestrian Gate">
        <StatusBadge status={snapshot.smallStatus} />
      </Card>

      <Card title="Engine">
        <EngineIndicator engineStatus={engineStatus} running={running} />
        <div className="mt-1 text-xs text-slate-500">
          {snapshot.framesProcessed.toLocaleString()} frames processed
        </div>
        {engineError && <div className="mt-1 text-xs text-rose-400">{engineError}</div>}
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{title}</div>
      {children}
    </div>
  );
}

function EngineIndicator({
  engineStatus,
  running,
}: {
  engineStatus: EngineStatus;
  running: boolean;
}): React.JSX.Element {
  const map: Record<EngineStatus, { label: string; color: string }> = {
    uninitialized: { label: "Idle", color: "text-slate-400" },
    loading: { label: "Loading models…", color: "text-amber-400" },
    ready: { label: running ? "Monitoring" : "Ready", color: "text-emerald-400" },
    error: { label: "Error", color: "text-rose-400" },
  };
  const info = map[engineStatus];
  return (
    <div className={`flex items-center gap-2 text-sm font-semibold ${info.color}`}>
      {engineStatus === "loading" && (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {info.label}
    </div>
  );
}
