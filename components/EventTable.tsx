"use client";

import type React from "react";
import type { GateEvent } from "@/types";

interface EventTableProps {
  events: GateEvent[];
}

export function EventTable({ events }: EventTableProps): React.JSX.Element {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-100">Live Event Log</h2>
        <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-400">
          {events.length} events
        </span>
      </div>

      <div className="max-h-[420px] overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-900 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">#</th>
              <th className="px-4 py-2 font-medium">Gate</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Timestamp</th>
              <th className="px-4 py-2 font-medium">Duration</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  No gate events yet. Start monitoring to populate the log.
                </td>
              </tr>
            ) : (
              events.map((event, idx) => (
                <tr
                  key={event.id}
                  className="border-t border-slate-800/70 transition-colors hover:bg-slate-800/40"
                >
                  <td className="px-4 py-2 text-slate-500">{events.length - idx}</td>
                  <td className="px-4 py-2 text-slate-200">{event.gateLabel}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        event.status === "Open"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-rose-500/15 text-rose-400"
                      }`}
                    >
                      {event.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-slate-300">{event.timestamp}</td>
                  <td className="px-4 py-2 font-mono text-slate-400">{event.duration}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
