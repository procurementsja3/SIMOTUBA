/**
 * Format nomor tiket tampilan agar awalan lama "WB-" otomatis tampil sebagai "SJA-"
 * tanpa mengubah kunci pencocokan data historis di backend / Google Sheets.
 */
export const formatDisplayTicketNumber = (ticketNumber?: string | null): string => {
  if (!ticketNumber) return '';
  return ticketNumber.replace(/^WB-/i, 'SJA-');
};
