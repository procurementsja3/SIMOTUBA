/**
 * Neutralize CSV formula injection (CWE-1236) and apply strict RFC-4180 quoting.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let str = String(value);

  // Guard against spreadsheet formula execution when opened in Excel/Sheets
  const trimmed = str.trimStart();
  if (
    trimmed.startsWith('=') ||
    trimmed.startsWith('+') ||
    trimmed.startsWith('-') ||
    trimmed.startsWith('@') ||
    trimmed.startsWith('\t') ||
    trimmed.startsWith('\r')
  ) {
    // Allow plain negative numbers like -12.34 or -500 without breaking numeric columns
    const isPlainNegativeNumber = /^-\d+(\.\d+)?%?$/.test(trimmed);
    if (!isPlainNegativeNumber) {
      str = `'${str}`;
    }
  }

  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Download CSV safely via UTF-8 BOM Blob URL (avoids encodeURI length limits and encoding corruption).
 */
export function downloadCsvFile(
  filename: string,
  headers: string[],
  rows: unknown[][]
): void {
  const headerLine = headers.map((h) => sanitizeCsvCell(h)).join(',');
  const dataLines = rows.map((row) => row.map((cell) => sanitizeCsvCell(cell)).join(','));
  const csvString = `\uFEFF${[headerLine, ...dataLines].join('\r\n')}`;

  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
