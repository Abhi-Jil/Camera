// Duration helpers driven purely by OCR timestamps (never the system clock).

import { parseTimestamp } from "@/lib/OCR";

/** Whole seconds between two timestamp strings, or null if either is unparseable. */
export function durationSeconds(openText: string, closeText: string): number | null {
  const a = parseTimestamp(openText);
  const b = parseTimestamp(closeText);
  if (!a || !b) return null;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 1000));
}

/** Format a second count as HH:MM:SS. */
export function formatDuration(totalSeconds: number | null): string {
  if (totalSeconds === null) return "—";
  const s = Math.max(0, totalSeconds);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return [hh, mm, ss].map((n) => String(n).padStart(2, "0")).join(":");
}
