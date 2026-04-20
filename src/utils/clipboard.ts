/** Parses tab-separated clipboard data (from Excel/LibreOffice) into a 2D array.
 *  Supports both nl-NL numbers (comma decimal, dot thousands) and en-US numbers
 *  (dot decimal). Non-numeric cells collapse to 0. Empty or whitespace-only
 *  input returns an empty array. */
export function parseClipboard(text: string): number[][] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return trimmed
    .split(/\r?\n/)
    .map((row) =>
      row.split("\t").map((cell) => {
        const t = cell.trim();
        // nl-NL detection: presence of a comma means it's the decimal mark,
        // and any dots in the same cell are thousands separators to strip.
        // Pure-dot strings are treated as US-locale (our own toClipboardText
        // output, or a copy from an en-US spreadsheet).
        const normalized = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
        const val = parseFloat(normalized);
        return Number.isNaN(val) ? 0 : val;
      }),
    );
}

/** Inverse of parseClipboard. Zero cells become empty strings so Excel
 *  round-trip doesn't turn blanks into 0s. */
export function toClipboardText(data: number[][]): string {
  return data
    .map((row) => row.map((v) => (v === 0 ? "" : String(v))).join("\t"))
    .join("\n");
}

export interface CellRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export function normalizeRange(range: CellRange): CellRange {
  return {
    startRow: Math.min(range.startRow, range.endRow),
    startCol: Math.min(range.startCol, range.endCol),
    endRow: Math.max(range.startRow, range.endRow),
    endCol: Math.max(range.startCol, range.endCol),
  };
}

export function rangeContains(range: CellRange, row: number, col: number): boolean {
  const n = normalizeRange(range);
  return row >= n.startRow && row <= n.endRow && col >= n.startCol && col <= n.endCol;
}
