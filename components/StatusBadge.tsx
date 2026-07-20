"use client";

import type React from "react";
import type { GateStatus } from "@/types";

interface StatusBadgeProps {
  status: GateStatus;
}

const STYLES: Record<GateStatus, { label: string; className: string; dot: string }> = {
  open: {
    label: "OPEN",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
    dot: "bg-emerald-400",
  },
  closed: {
    label: "CLOSED",
    className: "bg-rose-500/15 text-rose-400 border-rose-500/40",
    dot: "bg-rose-400",
  },
  unknown: {
    label: "UNKNOWN",
    className: "bg-slate-500/15 text-slate-400 border-slate-500/40",
    dot: "bg-slate-400",
  },
};

export function StatusBadge({ status }: StatusBadgeProps): React.JSX.Element {
  const style = STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${style.className}`}
    >
      <span className={`h-2 w-2 rounded-full ${style.dot} ${status === "open" ? "animate-pulse" : ""}`} />
      {style.label}
    </span>
  );
}
