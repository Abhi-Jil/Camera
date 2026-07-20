// Builds and downloads Gate_Report.xlsx entirely in the browser with ExcelJS.

import ExcelJS from "exceljs";
import type { CycleRecord } from "@/types";
import { formatDuration } from "@/lib/time";

/**
 * Generate the workbook and trigger a browser download. No server involved —
 * the file is assembled in memory and offered via an object URL.
 */
export async function exportGateReport(
  records: CycleRecord[],
  fileName = "Gate_Report.xlsx",
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CCTV Gate Monitor";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Gate Events", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "Serial", key: "serial", width: 10 },
    { header: "Gate", key: "gate", width: 22 },
    { header: "Opening Time", key: "opening", width: 24 },
    { header: "Closing Time", key: "closing", width: 24 },
    { header: "Duration", key: "duration", width: 16 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E293B" },
    };
    cell.border = thinBorder();
  });

  records.forEach((record, index) => {
    const row = sheet.addRow({
      serial: index + 1,
      gate: record.gateLabel,
      opening: record.openTime || "—",
      closing: record.closeTime ?? "Still open",
      duration: formatDuration(record.durationSeconds),
    });
    row.alignment = { vertical: "middle", horizontal: "center" };
    row.eachCell((cell) => {
      cell.border = thinBorder();
    });
    if (index % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF1F5F9" },
        };
      });
    }
  });

  if (records.length === 0) {
    const row = sheet.addRow({ serial: "", gate: "No events recorded", opening: "", closing: "", duration: "" });
    row.alignment = { vertical: "middle", horizontal: "center" };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    fileName,
  );
}

function thinBorder(): ExcelJS.Borders {
  const side: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFCBD5E1" } };
  return {
    top: side,
    left: side,
    bottom: side,
    right: side,
    diagonal: { style: undefined },
  } as ExcelJS.Borders;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoke on the next tick so the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
