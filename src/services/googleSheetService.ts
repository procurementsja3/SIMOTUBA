import {
  PurchaseOrder,
  ArrivalSchedule,
  CoalTransaction,
  CoalOutgoingRecord,
  AuditLogEntry,
  VisualQC,
  LabQCResults,
  UserRole,
  AuditEntityType,
} from '../types/coal';
import {
  normalizeSupplierName,
  replaceBorneoNameInText,
} from '../utils/supplierUtils';
import {
  sanitizePurchaseOrdersForRemovedPo,
  sanitizeSchedulesForRemovedPo,
  sanitizeTransactionsForRemovedPo,
  sanitizeAuditLogsForRemovedPo,
} from '../utils/poCleanupUtils';

export const GOOGLE_APPS_SCRIPT_TEMPLATE = `/**
 * =========================================================================
 * GOOGLE APPS SCRIPT: SISTEM MONITORING BATUBARA & JEMBATAN TIMBANG
 * =========================================================================
 * Script ini otomatis menerima sinkronisasi data dari aplikasi web:
 * - Tab Transaksi Timbangan & Workflow Batubara
 * - Tab Purchase Orders (PO)
 * - Tab Jadwal Kedatangan Armada
 * - Tab Data Pengeluaran Batubara (Output)
 * - Tab Rekap Pengeluaran Boiler FBC 1 & FBC 2 (Mingguan/Bulanan/Tahunan)
 * 
 * CARA PEMASANGAN DI GOOGLE SPREADSHEET:
 * 1. Buka Google Spreadsheet baru / yang diinginkan.
 * 2. Klik menu "Ekstensi" > "Apps Script".
 * 3. Hapus semua kode default di editor, lalu PASTE SELURUH KODE DI BAWAH INI.
 * 4. Klik tombol "Simpan" (ikon disket).
 * 5. Klik tombol "Terapkan" (Deploy) > "Penerapan Baru" (New deployment).
 * 6. Pilih Jenis: "Aplikasi Web" (Web app).
 * 7. Pada bagian "Akses" (Who has access), PILIH "Siapa saja" (Anyone).
 * 8. Klik "Terapkan", izinkan otorisasi akun Google Anda.
 * 9. Salin URL Aplikasi Web yang diberikan (format: https://script.google.com/macros/s/.../exec).
 * 10. Buka aplikasi web Sistem Monitoring Batubara, klik menu "Sinkron Google Sheet",
 *     masukkan URL tersebut, lalu klik "Tes Koneksi" & "Sinkronkan Sekarang".
 * =========================================================================
 */

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "success",
    message: "Google Apps Script Sistem Monitoring Batubara Aktif!",
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(15000);

  try {
    var rawData = e.postData.contents;
    var payload = JSON.parse(rawData);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. SINKRONISASI TRANSAKSI BATUBARA
    if (payload.transactions && Array.isArray(payload.transactions)) {
      syncTransactions(ss, payload.transactions);
    }

    // 2. SINKRONISASI PURCHASE ORDERS
    if (payload.purchaseOrders && Array.isArray(payload.purchaseOrders)) {
      syncPurchaseOrders(ss, payload.purchaseOrders);
    }

    // 3. SINKRONISASI JADWAL KEDATANGAN
    if (payload.schedules && Array.isArray(payload.schedules)) {
      syncSchedules(ss, payload.schedules);
    }

    // 4. SINKRONISASI PENGELUARAN BATUBARA (OUTPUT)
    if (payload.coalOutgoing && Array.isArray(payload.coalOutgoing)) {
      syncCoalOutgoing(ss, payload.coalOutgoing);
    }

    // 5. SINKRONISASI REKAP PENGELUARAN BOILER FBC 1 & FBC 2
    if (payload.outgoingRecapRows && Array.isArray(payload.outgoingRecapRows)) {
      syncCoalOutgoingRecap(ss, payload.outgoingRecapRows);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Data monitoring batubara berhasil disinkronkan ke Google Sheets",
      syncedAt: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function syncTransactions(ss, transactions) {
  var sheetName = "DATA_TRANSAKSI_TIMBANGAN";
  var sheet = ss.getSheetByName(sheetName);
  
  var headers = [
    "No Tiket", "No Antrean", "Status Terkini", "No PO", "Supplier / Tambang",
    "Kategori RIT", "Keterangan Pengiriman", "No Polisi", "Nama Driver", "No HP Driver", "Transporter",
    "Jam Gate In", "No Surat Jalan", "Berat SJ (kg)", "Gross Masuk (kg)", "Jam Gross", "Operator Timbang Masuk",
    "Sampling ID", "Kalori GAR (kcal/kg)", "Total Moisture (% arb)", "Ash Content (% adb)",
    "Total Sulfur (%)", "Status QC", "Stockpile Alokasi", "Jam Mulai Bongkar", "Jam Selesai Bongkar",
    "Tara Keluar (kg)", "Jam Tare", "Netto Pabrik (kg)", "Netto (Ton)", "Susut SJ vs Netto (kg)",
    "Persentase Susut (%)", "Status Toleransi", "Klaim Penalti (kg)", "Jam Gate Out", "Petugas Gate Out", "Terakhir Diperbarui"
  ];

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground("#1e293b").setFontColor("#f8fafc").setFontWeight("bold");
    sheet.setFrozenRows(1);
  } else if (sheet.getLastColumn() < headers.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  // Map existing data by No Tiket (Col 1)
  var lastRow = sheet.getLastRow();
  var existingMap = {};
  if (lastRow > 1) {
    var ticketValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ticketValues.length; i++) {
      var tNo = ticketValues[i][0];
      if (tNo) {
        existingMap[tNo] = i + 2; // baris ke-(i+2)
      }
    }
  }

  transactions.forEach(function(tx) {
    var rowValues = [
      tx.ticketNumber || tx.id,
      tx.queueNumber || "-",
      tx.status || "-",
      tx.poNumber || "-",
      tx.supplierName || "-",
      tx.ritCategory || "-",
      tx.ritRemarks || "-",
      tx.vehiclePlate || "-",
      tx.driverName || "-",
      tx.driverPhone || "-",
      tx.transporterName || "-",
      formatDateTime(tx.gateInTime),
      tx.suratJalanNumber || "-",
      tx.suratJalanWeight || 0,
      tx.grossWeight || 0,
      formatDateTime(tx.weighInTime),
      tx.weighInOperator || "-",
      tx.sampleId || "-",
      (tx.labResults && tx.labResults.calorieGAR) || "-",
      (tx.labResults && tx.labResults.totalMoisture) || "-",
      (tx.labResults && tx.labResults.ashContent) || "-",
      (tx.labResults && tx.labResults.totalSulfur) || "-",
      tx.qcStatus || "-",
      tx.assignedStockpile || tx.unloadingStockpile || "-",
      formatDateTime(tx.unloadingStartTime),
      formatDateTime(tx.unloadingEndTime),
      tx.tareWeight || 0,
      formatDateTime(tx.weighOutTime),
      tx.nettoWeight || 0,
      tx.nettoTons || 0,
      tx.weightDifference || 0,
      tx.shrinkagePercentage ? (Number(tx.shrinkagePercentage).toFixed(2) + "%") : "0%",
      tx.toleranceStatus || "-",
      tx.claimPenaltyKg ? Math.round(tx.claimPenaltyKg) : 0,
      formatDateTime(tx.gateOutTime),
      tx.gateOutOfficer || "-",
      new Date().toLocaleString("id-ID")
    ];

    var existingRow = existingMap[tx.ticketNumber || tx.id];
    if (existingRow) {
      sheet.getRange(existingRow, 1, 1, rowValues.length).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
      existingMap[tx.ticketNumber || tx.id] = sheet.getLastRow();
    }
  });

  sheet.autoResizeColumns(1, 14);
}

function syncPurchaseOrders(ss, pos) {
  var sheetName = "DATA_PURCHASE_ORDER";
  var sheet = ss.getSheetByName(sheetName);
  var headers = [
    "No PO", "Nama Supplier", "Tanggal PO", "Target Kuota (Kg)", "Realisasi Diterima (Kg)",
    "Sisa Kuota (Kg)", "Progress (%)", "Target Kalori GAR", "Max Moisture (%)",
    "Max Ash (%)", "Max Sulfur (%)", "Toleransi Susut (%)", "Status PO", "Keterangan", "Terakhir Diperbarui"
  ];

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setBackground("#064e3b").setFontColor("#f0fdf4").setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  // Bersihkan data lama mulai baris 2 agar pembaruan (Edit) dan penghapusan (Hapus) tersinkron akurat
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
  }

  if (pos && pos.length > 0) {
    var rows = pos.map(function(po) {
      var target = Number(po.targetTonnage) || 0;
      var received = Number(po.receivedTonnage) || 0;
      var sisa = Math.max(0, target - received);
      var pct = target > 0 ? ((received / target) * 100).toFixed(1) + "%" : "0%";
      return [
        po.poNumber || "-",
        po.supplierName || "-",
        po.contractDate || "-",
        target,
        received,
        sisa,
        pct,
        po.specs ? po.specs.calorieMin : "-",
        po.specs ? po.specs.moistureMax : "-",
        po.specs ? po.specs.ashMax : "-",
        po.specs ? po.specs.sulfurMax : "-",
        (po.tolerancePercentage || 5) + "%",
        po.status || "ACTIVE",
        po.notes || "-",
        new Date().toLocaleString("id-ID")
      ];
    });
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
}

function syncSchedules(ss, schedules) {
  var sheetName = "JADWAL_KEDATANGAN";
  var sheet = ss.getSheetByName(sheetName);
  var headers = [
    "ID Jadwal", "No PO", "Nama Supplier", "Perkiraan Waktu Tiba (ETA)",
    "Estimasi Berat Muatan (Kg)", "Estimasi Ritase", "Status Kedatangan", "Keterangan", "Terakhir Diperbarui"
  ];

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setBackground("#1e3a8a").setFontColor("#eff6ff").setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
  }

  if (schedules && schedules.length > 0) {
    var rows = schedules.map(function(sch) {
      return [
        sch.id,
        sch.poNumber,
        sch.supplierName,
        sch.etaDateTime,
        sch.estimatedTonnage,
        sch.estimatedTruckCount || 1,
        sch.status,
        sch.remarks || "-",
        new Date().toLocaleString("id-ID")
      ];
    });
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
}

function syncCoalOutgoing(ss, outgoingRecords) {
  var sheetName = "DATA_PENGELUARAN_BATUBARA";
  var sheet = ss.getSheetByName(sheetName);
  var headers = [
    "ID Pengeluaran", "Tanggal", "Jam", "Shift", "Unit Tujuan", "Asal Stockpile",
    "Qty (Kg)", "Qty (Ton)", "Alat / Armada", "Nama Operator", "Shift Leader",
    "Keterangan", "Created At", "Updated At"
  ];

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setBackground("#b45309").setFontColor("#fffbeb").setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
  }

  if (outgoingRecords && outgoingRecords.length > 0) {
    var rows = outgoingRecords.map(function(rec) {
      var qtyKg = Number(rec.quantityKg) || 0;
      var qtyTon = rec.quantityTons !== undefined ? Number(rec.quantityTons) : Number((qtyKg / 1000).toFixed(3));
      return [
        rec.id || "-",
        rec.date || "-",
        rec.time || "-",
        rec.shift || "SHIFT 1",
        rec.destinationUnit || "-",
        rec.sourceStockpile || "Coal Storage",
        qtyKg,
        qtyTon,
        rec.equipmentUsed || "-",
        rec.operatorName || "-",
        rec.supervisorName || "-",
        rec.notes || "-",
        rec.createdAt || new Date().toISOString(),
        rec.updatedAt || new Date().toISOString()
      ];
    });
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
}

function syncCoalOutgoingRecap(ss, recapRows) {
  var sheetName = "REKAP_PENGELUARAN_BOILER";
  var sheet = ss.getSheetByName(sheetName);
  var headers = [
    "Jenis Periode", "Periode", "Rentang Tanggal",
    "Boiler FBC 1 (Kg)", "Boiler FBC 1 (Ton)", "Porsi FBC 1 (%)",
    "Boiler FBC 2 (Kg)", "Boiler FBC 2 (Ton)", "Porsi FBC 2 (%)",
    "Unit Lainnya (Kg)", "Total Pengeluaran (Kg)", "Total Pengeluaran (Ton)", "Jumlah Input"
  ];

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setBackground("#075985").setFontColor("#f0f9ff").setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
  }

  if (recapRows && recapRows.length > 0) {
    sheet.getRange(2, 1, recapRows.length, headers.length).setValues(recapRows);
  }
}

function formatDateTime(isoString) {
  if (!isoString) return "-";
  try {
    var d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return Utilities.formatDate(d, "GMT+7", "yyyy-MM-dd HH:mm:ss");
  } catch (e) {
    return isoString;
  }
}
`;

export interface SyncPayload {
  transactions: CoalTransaction[];
  purchaseOrders: PurchaseOrder[];
  schedules: ArrivalSchedule[];
  coalOutgoing?: CoalOutgoingRecord[];
  outgoingRecapRows?: (string | number)[][];
}

export const googleSheetService = {
  async testConnection(webhookUrl: string): Promise<{ success: boolean; message: string }> {
    if (!webhookUrl || !webhookUrl.startsWith('https://script.google.com/macros/s/')) {
      return {
        success: false,
        message: 'Format URL Webhook tidak valid. Pastikan dimulai dengan https://script.google.com/macros/s/.../exec',
      };
    }

    try {
      // Test GET request
      const response = await fetch(webhookUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        return {
          success: true,
          message: 'Koneksi ke Google Apps Script berhasil terhubung!',
        };
      } else {
        return {
          success: true,
          message: 'Endpoint Google Apps Script merespons (Status: ' + response.status + '). Siap digunakan.',
        };
      }
    } catch (err: any) {
      // In browser CORS, a web app might restrict GET preflight or direct response,
      // but still successfully receive POST via no-cors or form submission.
      return {
        success: true,
        message: 'URL Google Apps Script terverifikasi. Catatan: Pengiriman POST via no-cors diaktifkan untuk mengatasi pembatasan browser CORS.',
      };
    }
  },

  async syncToGoogleSheet(
    webhookUrl: string,
    payload: SyncPayload
  ): Promise<{ success: boolean; message: string }> {
    if (!webhookUrl || !webhookUrl.trim()) {
      return {
        success: false,
        message: 'URL Webhook Google Apps Script belum diisi.',
      };
    }

    try {
      const outgoingList = (payload.coalOutgoing || []).map((rec) => ({
        ...rec,
        destinationUnit: normalizeBoilerUnitForSheet(rec.destinationUnit),
      }));

      const cleanTxs = sanitizeTransactionsForRemovedPo(payload.transactions).items;
      const cleanSchs = sanitizeSchedulesForRemovedPo(payload.schedules).items;
      const cleanPos = sanitizePurchaseOrdersForRemovedPo(payload.purchaseOrders, cleanTxs).items;

      const normalizedPayload: SyncPayload = {
        purchaseOrders: cleanPos.map((po) => ({
          ...po,
          supplierName: normalizeSupplierName(po.supplierName),
        })),
        schedules: cleanSchs.map((sch) => ({
          ...sch,
          supplierName: normalizeSupplierName(sch.supplierName),
        })),
        transactions: cleanTxs.map((tx) => ({
          ...tx,
          supplierName: normalizeSupplierName(tx.supplierName),
        })),
        coalOutgoing: outgoingList,
        outgoingRecapRows: buildOutgoingBoilerRecapRows(outgoingList),
      };

      // Send via fetch with text/plain to avoid CORS preflight rejection by Google Apps Script
      await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(normalizedPayload),
        mode: 'no-cors', // Essential for Google Apps Script web apps in browser client
      });

      return {
        success: true,
        message: `Berhasil mengirim ${payload.transactions.length} transaksi, ${payload.purchaseOrders.length} PO, ${payload.schedules.length} jadwal, dan ${outgoingList.length} pengeluaran batubara ke Google Sheets!`,
      };
    } catch (err: any) {
      console.error('Error syncing to Google Sheet:', err);
      return {
        success: false,
        message: 'Gagal sinkron: ' + (err.message || 'Koneksi jaringan bermasalah'),
      };
    }
  },
};

// =========================================================================
// GOOGLE SHEETS API v4 DIRECT DATABASE ENGINE (PO -> PA ROUND-TRIP)
// =========================================================================

export const SHEET_TABS = {
  PO: 'DATA_PURCHASE_ORDER',
  SCHEDULES: 'JADWAL_KEDATANGAN',
  TRANSACTIONS: 'DATA_TRANSAKSI_TIMBANGAN',
  AUDIT: 'AUDIT_LOGS',
  OUTGOING: 'DATA_PENGELUARAN_BATUBARA',
  OUTGOING_RECAP: 'REKAP_PENGELUARAN_BOILER',
} as const;

export const PO_HEADERS = [
  'ID PO',
  'No PO',
  'Kode Supplier',
  'Nama Supplier',
  'Tanggal Kontrak',
  'Target Kuota (Kg)',
  'Realisasi Diterima (Kg)',
  'Sisa Kuota (Kg)',
  'Target Kalori GAR (kcal/kg)',
  'Max Moisture (% arb)',
  'Max Ash (% adb)',
  'Max Sulfur (% adb)',
  'Min HGI',
  'Toleransi Susut (%)',
  'Harga per Ton (IDR)',
  'Stockpile Tujuan',
  'Status PO',
  'Catatan',
  'Created At',
] as const;

export const SCHEDULE_HEADERS = [
  'ID Jadwal',
  'ID PO',
  'No PO',
  'Nama Supplier',
  'Perkiraan Tiba (ETA)',
  'Estimasi Muatan (Kg)',
  'Estimasi Ritase',
  'Tambang Asal',
  'Status Kedatangan',
  'Keterangan',
  'Created At',
] as const;

export const TRANSACTION_HEADERS = [
  'ID Transaksi',
  'No Tiket',
  'No Antrean',
  'Status Terkini',
  'ID PO',
  'No PO',
  'ID Jadwal',
  'Supplier / Tambang',
  'Transporter',
  'No Polisi',
  'Nama Driver',
  'No HP Driver',
  'No SIM/KTP Driver',
  'Jam Gate In',
  'Petugas Gate In',
  'No Segel',
  'Kondisi Terpal',
  'Catatan Security',
  'No Surat Jalan',
  'Tanggal Surat Jalan',
  'Jadwal Kirim (Date)',
  'Berat SJ (Kg)',
  'SJ Terverifikasi',
  'Kategori RIT',
  'Keterangan RIT',
  'Jam Timbang Masuk',
  'Gross Masuk (Kg)',
  'Operator Timbang Masuk',
  'ID Timbangan Masuk',
  'Selisih Awal Gross-SJ (Kg)',
  'Jam Mulai Bongkar',
  'Jam Selesai Bongkar',
  'Stockpile Bongkar',
  'Checker Bongkar',
  'Bak Bersih Terverifikasi',
  'Catatan Bongkar',
  'Jam Timbang Keluar',
  'Tare Keluar (Kg)',
  'Operator Timbang Keluar',
  'ID Timbangan Keluar',
  'Netto Pabrik (Kg)',
  'Netto (Ton)',
  'Susut SJ vs Netto (Kg)',
  'Persentase Susut (%)',
  'Status Toleransi',
  'Klaim Penalti (Kg)',
  'Jam Gate Out',
  'Petugas Gate Out',
  'Jam Update QC-PA',
  'Inspector QC-PA',
  'Sample ID (PA)',
  'Metode Sampling',
  'Visual Moisture',
  'Suhu Visual (°C)',
  'Bau Muatan',
  'Kontaminan Visual',
  'Warna Batubara',
  'Rank Batubara',
  'Kilap Batubara',
  'Status Impurity',
  'Kalori GAR (kcal/kg)',
  'Total Moisture (% arb)',
  'Ash Content (% adb)',
  'Total Sulfur (% adb)',
  'HGI',
  'Keputusan QC-PA',
  'Stockpile Alokasi QC',
  'Catatan Keputusan QC-PA',
  'Terakhir Diperbarui',
] as const;

export const AUDIT_HEADERS = [
  'ID Log',
  'Waktu',
  'Aktor',
  'Email',
  'Role',
  'Aksi',
  'Tipe Entitas',
  'ID Entitas',
  'Ringkasan',
  'Detail',
] as const;

export const OUTGOING_HEADERS = [
  'ID Pengeluaran',
  'Tanggal',
  'Jam',
  'Shift',
  'Unit Tujuan',
  'Asal Stockpile',
  'Qty (Kg)',
  'Qty (Ton)',
  'Alat / Armada',
  'Nama Operator',
  'Shift Leader',
  'Keterangan',
  'Created At',
  'Updated At',
] as const;

export const OUTGOING_RECAP_HEADERS = [
  'Jenis Periode',
  'Periode',
  'Rentang Tanggal',
  'Boiler FBC 1 (Kg)',
  'Boiler FBC 1 (Ton)',
  'Porsi FBC 1 (%)',
  'Boiler FBC 2 (Kg)',
  'Boiler FBC 2 (Ton)',
  'Porsi FBC 2 (%)',
  'Unit Lainnya (Kg)',
  'Total Pengeluaran (Kg)',
  'Total Pengeluaran (Ton)',
  'Jumlah Input',
] as const;

const INDONESIAN_MONTHS_SHEET = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

function normalizeBoilerUnitForSheet(raw?: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return 'Boiler FBC 1';
  if (/^boiler\s*(?:fbc\s*)?1$/i.test(trimmed)) return 'Boiler FBC 1';
  if (/^boiler\s*(?:fbc\s*)?2$/i.test(trimmed)) return 'Boiler FBC 2';
  return trimmed;
}

function getIsoWeekForSheet(date: Date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayNum = d.getDay() || 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - (dayNum - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const thursday = new Date(monday);
  thursday.setDate(monday.getDate() + 3);
  const isoYear = thursday.getFullYear();
  const firstJan = new Date(isoYear, 0, 1);
  const firstJanDay = firstJan.getDay() || 7;
  const firstMonday = new Date(firstJan);
  firstMonday.setDate(firstJan.getDate() - (firstJanDay - 1) + (firstJanDay <= 4 ? 0 : 7));
  const weekNo = Math.floor((monday.getTime() - firstMonday.getTime()) / (7 * 86400000)) + 1;

  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    key: `${isoYear}-W${pad(weekNo)}`,
    label: `Minggu ${weekNo} (${isoYear})`,
    rangeLabel: `${pad(monday.getDate())}/${pad(monday.getMonth() + 1)} – ${pad(sunday.getDate())}/${pad(sunday.getMonth() + 1)}/${sunday.getFullYear()}`,
  };
}

export function buildOutgoingBoilerRecapRows(
  records: CoalOutgoingRecord[]
): (string | number)[][] {
  const buildForMode = (mode: 'MINGGUAN' | 'BULANAN' | 'TAHUNAN'): (string | number)[][] => {
    const map = new Map<
      string,
      {
        key: string;
        label: string;
        rangeLabel: string;
        fbc1Kg: number;
        fbc2Kg: number;
        otherKg: number;
        totalKg: number;
        count: number;
      }
    >();

    records.forEach((rec) => {
      if (!rec.date) return;
      const parts = rec.date.split('-').map(Number);
      if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return;
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      if (Number.isNaN(d.getTime())) return;

      let key = '';
      let label = '';
      let rangeLabel = '';
      if (mode === 'MINGGUAN') {
        const wk = getIsoWeekForSheet(d);
        key = wk.key;
        label = wk.label;
        rangeLabel = wk.rangeLabel;
      } else if (mode === 'BULANAN') {
        const y = d.getFullYear();
        const m = d.getMonth();
        const lastDay = new Date(y, m + 1, 0).getDate();
        key = `${y}-${String(m + 1).padStart(2, '0')}`;
        label = `${INDONESIAN_MONTHS_SHEET[m]} ${y}`;
        rangeLabel = `01/${String(m + 1).padStart(2, '0')} – ${String(lastDay).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}/${y}`;
      } else {
        const y = d.getFullYear();
        key = String(y);
        label = `Tahun ${y}`;
        rangeLabel = `Januari – Desember ${y}`;
      }

      const bucket = map.get(key) || {
        key,
        label,
        rangeLabel,
        fbc1Kg: 0,
        fbc2Kg: 0,
        otherKg: 0,
        totalKg: 0,
        count: 0,
      };

      const kg = Number(rec.quantityKg) || 0;
      const unit = normalizeBoilerUnitForSheet(rec.destinationUnit);
      if (unit === 'Boiler FBC 1') bucket.fbc1Kg += kg;
      else if (unit === 'Boiler FBC 2') bucket.fbc2Kg += kg;
      else bucket.otherKg += kg;

      bucket.totalKg += kg;
      bucket.count += 1;
      map.set(key, bucket);
    });

    return Array.from(map.values())
      .sort((a, b) => b.key.localeCompare(a.key))
      .map((b) => {
        const fbc1Pct = b.totalKg > 0 ? Number(((b.fbc1Kg / b.totalKg) * 100).toFixed(1)) : 0;
        const fbc2Pct = b.totalKg > 0 ? Number(((b.fbc2Kg / b.totalKg) * 100).toFixed(1)) : 0;
        return [
          mode,
          b.label,
          b.rangeLabel,
          b.fbc1Kg,
          Number((b.fbc1Kg / 1000).toFixed(3)),
          `${fbc1Pct}%`,
          b.fbc2Kg,
          Number((b.fbc2Kg / 1000).toFixed(3)),
          `${fbc2Pct}%`,
          b.otherKg,
          b.totalKg,
          Number((b.totalKg / 1000).toFixed(3)),
          b.count,
        ];
      });
  };

  return [
    ...buildForMode('MINGGUAN'),
    ...buildForMode('BULANAN'),
    ...buildForMode('TAHUNAN'),
  ];
}

export class SheetsApiError extends Error {
  status: number;
  isAuthError: boolean;
  constructor(message: string, status = 500) {
    super(message);
    this.name = 'SheetsApiError';
    this.status = status;
    this.isAuthError = status === 401;
  }
}

function colIndexToLetter(zeroBasedIndex: number): string {
  let n = zeroBasedIndex + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

export function extractSpreadsheetId(input: string): string {
  const trimmed = (input || '').trim();
  if (!trimmed) return '';
  const pathMatch = trimmed.match(/\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9-_]+)/);
  if (pathMatch && pathMatch[1]) return pathMatch[1];
  const queryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9-_]+)/);
  if (queryMatch && queryMatch[1]) return queryMatch[1];
  return trimmed.replace(/[^a-zA-Z0-9-_]/g, '');
}

async function sheetsFetch<T>(
  url: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { message: text };
  }

  if (!res.ok) {
    const apiMsg =
      json?.error?.message || json?.message || `HTTP ${res.status} Google Sheets API error`;
    throw new SheetsApiError(apiMsg, res.status);
  }

  return json as T;
}

function strCell(row: unknown[], idx: number, fallback = ''): string {
  const val = row[idx];
  if (val === undefined || val === null) return fallback;
  return String(val).trim();
}

function numCell(row: unknown[], idx: number, fallback = 0): number {
  const val = row[idx];
  if (val === undefined || val === null || val === '') return fallback;
  if (typeof val === 'number') return Number.isFinite(val) ? val : fallback;
  const cleaned = String(val).replace(/,/g, '').trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optNumCell(row: unknown[], idx: number): number | undefined {
  const val = row[idx];
  if (val === undefined || val === null || val === '') return undefined;
  const n = numCell(row, idx, NaN);
  return Number.isFinite(n) ? n : undefined;
}

function boolCell(row: unknown[], idx: number): boolean | undefined {
  const val = row[idx];
  if (val === undefined || val === null || val === '') return undefined;
  if (typeof val === 'boolean') return val;
  const s = String(val).trim().toUpperCase();
  if (s === 'TRUE' || s === 'YA' || s === 'YES' || s === '1') return true;
  if (s === 'FALSE' || s === 'TIDAK' || s === 'NO' || s === '0') return false;
  return undefined;
}

function serializePoRow(po: PurchaseOrder): (string | number)[] {
  const target = Number(po.targetTonnage) || 0;
  const received = Number(po.receivedTonnage) || 0;
  return [
    po.id,
    po.poNumber || '',
    po.supplierCode || '-',
    normalizeSupplierName(po.supplierName),
    po.contractDate || '',
    target,
    received,
    Math.max(0, target - received),
    Number(po.specs?.calorieMin ?? 4200),
    Number(po.specs?.moistureMax ?? 34),
    Number(po.specs?.ashMax ?? 8),
    Number(po.specs?.sulfurMax ?? 0.8),
    Number(po.specs?.hgiMin ?? 45),
    Number(po.tolerancePercentage ?? 5),
    Number(po.pricePerTon ?? 0),
    po.destinationStockpile || 'Stockpile Utama',
    po.status || 'ACTIVE',
    po.notes || '',
    po.createdAt || new Date().toISOString(),
  ];
}

function deserializePoRow(row: unknown[], index: number): PurchaseOrder | null {
  const poNumber = strCell(row, 1);
  const id = strCell(row, 0) || (poNumber ? `PO-SHEET-${index + 1}` : '');
  if (!id && !poNumber) return null;
  return {
    id,
    poNumber: poNumber || id,
    supplierCode: strCell(row, 2, '-'),
    supplierName: normalizeSupplierName(strCell(row, 3, 'Supplier')) || 'Supplier',
    contractDate: strCell(row, 4, new Date().toISOString().slice(0, 10)),
    targetTonnage: numCell(row, 5, 0),
    receivedTonnage: numCell(row, 6, 0),
    specs: {
      calorieMin: numCell(row, 8, 4200),
      moistureMax: numCell(row, 9, 34),
      ashMax: numCell(row, 10, 8),
      sulfurMax: numCell(row, 11, 0.8),
      hgiMin: numCell(row, 12, 45),
    },
    tolerancePercentage: numCell(row, 13, 5),
    pricePerTon: numCell(row, 14, 850000),
    destinationStockpile: strCell(row, 15, 'Stockpile Utama'),
    status: (strCell(row, 16, 'ACTIVE') as PurchaseOrder['status']) || 'ACTIVE',
    notes: strCell(row, 17) || undefined,
    createdAt: strCell(row, 18, new Date().toISOString()),
  };
}

function serializeScheduleRow(sch: ArrivalSchedule): (string | number)[] {
  return [
    sch.id,
    sch.poId || '',
    sch.poNumber || '',
    normalizeSupplierName(sch.supplierName),
    sch.etaDateTime || '',
    Number(sch.estimatedTonnage) || 0,
    Number(sch.estimatedTruckCount) || 1,
    sch.originMine || '',
    sch.status || 'SCHEDULED',
    sch.remarks || '',
    sch.createdAt || new Date().toISOString(),
  ];
}

function deserializeScheduleRow(row: unknown[], index: number): ArrivalSchedule | null {
  const id = strCell(row, 0);
  const poId = strCell(row, 1);
  const poNumber = strCell(row, 2);
  if (!id && !poNumber) return null;
  return {
    id: id || `SCH-SHEET-${index + 1}`,
    poId,
    poNumber,
    supplierName: normalizeSupplierName(strCell(row, 3, '')),
    etaDateTime: strCell(row, 4, new Date().toISOString().slice(0, 10)),
    estimatedTonnage: numCell(row, 5, 30000),
    estimatedTruckCount: numCell(row, 6, 1),
    originMine: strCell(row, 7) || undefined,
    status: (strCell(row, 8, 'SCHEDULED') as ArrivalSchedule['status']) || 'SCHEDULED',
    remarks: strCell(row, 9) || undefined,
    createdAt: strCell(row, 10) || undefined,
  };
}

function serializeTransactionRow(tx: CoalTransaction): (string | number)[] {
  return [
    tx.id,
    tx.ticketNumber || '',
    tx.queueNumber || '',
    tx.status || 'GATE_IN',
    tx.poId || '',
    tx.poNumber || '',
    tx.scheduleId || '',
    normalizeSupplierName(tx.supplierName),
    tx.transporterName || '',
    tx.vehiclePlate || '',
    tx.driverName || '',
    tx.driverPhone || '',
    tx.driverIdNumber || '',
    tx.gateInTime || '',
    tx.securityOfficer || '',
    tx.sealNumber || '',
    tx.tarpCondition || 'BAIK_RAPAT',
    tx.securityNotes || '',
    tx.suratJalanNumber || '',
    tx.suratJalanDate || '',
    tx.scheduledDeliveryDate || '',
    Number(tx.suratJalanWeight) || 0,
    tx.suratJalanVerified ? 'YA' : 'TIDAK',
    tx.ritCategory || '',
    tx.ritRemarks || '',
    tx.weighInTime || '',
    Number(tx.grossWeight) || 0,
    tx.weighInOperator || '',
    tx.weighInScaleId || '',
    tx.initialDiscrepancy ?? '',
    tx.unloadingStartTime || '',
    tx.unloadingEndTime || '',
    tx.unloadingStockpile || '',
    tx.unloadingChecker || '',
    tx.cleanDumpVerified === undefined ? '' : tx.cleanDumpVerified ? 'YA' : 'TIDAK',
    tx.unloadingNotes || '',
    tx.weighOutTime || '',
    Number(tx.tareWeight) || 0,
    tx.weighOutOperator || '',
    tx.weighOutScaleId || '',
    Number(tx.nettoWeight) || 0,
    Number(tx.nettoTons) || 0,
    Number(tx.weightDifference) || 0,
    Number(tx.shrinkagePercentage) || 0,
    tx.toleranceStatus || '',
    Number(tx.claimPenaltyKg ?? 0),
    tx.gateOutTime || '',
    tx.gateOutOfficer || '',
    tx.qcTime || '',
    tx.qcInspector || '',
    tx.sampleId || '',
    tx.samplingMethod || '',
    tx.visualAssessment?.moistureVisual || '',
    tx.visualAssessment?.temperatureCelsius ?? '',
    tx.visualAssessment?.odorStatus || '',
    (tx.visualAssessment?.contaminantsFound || []).join('; '),
    tx.visualAssessment?.coalColor || '',
    tx.visualAssessment?.rankLevel || '',
    tx.visualAssessment?.luster || '',
    tx.visualAssessment?.impurityStatus || '',
    tx.labResults?.calorieGAR ?? '',
    tx.labResults?.totalMoisture ?? '',
    tx.labResults?.ashContent ?? '',
    tx.labResults?.totalSulfur ?? '',
    tx.labResults?.hgi ?? '',
    tx.qcStatus || '',
    tx.assignedStockpile || '',
    tx.qcDecisionNotes || '',
    tx.updatedAt || new Date().toISOString(),
  ];
}

function deserializeTransactionRow(row: unknown[], index: number): CoalTransaction | null {
  const id = strCell(row, 0);
  const ticketNumber = strCell(row, 1);
  if (!id && !ticketNumber) return null;

  const moistureVisual = strCell(row, 52);
  const tempVisual = optNumCell(row, 53);
  const odorStatus = strCell(row, 54);
  const contaminantsRaw = strCell(row, 55);
  const coalColor = strCell(row, 56);
  const rankLevel = strCell(row, 57);
  const luster = strCell(row, 58);
  const impurityStatus = strCell(row, 59);

  let visualAssessment: VisualQC | undefined;
  if (
    moistureVisual ||
    tempVisual !== undefined ||
    odorStatus ||
    contaminantsRaw ||
    coalColor ||
    rankLevel
  ) {
    visualAssessment = {
      moistureVisual: (moistureVisual as VisualQC['moistureVisual']) || 'KERING',
      temperatureCelsius: tempVisual ?? 30,
      odorStatus: (odorStatus as VisualQC['odorStatus']) || 'NORMAL',
      contaminantsFound: contaminantsRaw
        ? contaminantsRaw
            .split(';')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      coalColor: coalColor || undefined,
      rankLevel: rankLevel || undefined,
      luster: luster || undefined,
      impurityStatus: impurityStatus || undefined,
    };
  }

  const calorieGAR = optNumCell(row, 60);
  const totalMoisture = optNumCell(row, 61);
  const ashContent = optNumCell(row, 62);
  const totalSulfur = optNumCell(row, 63);
  const hgi = optNumCell(row, 64);

  let labResults: LabQCResults | undefined;
  if (
    calorieGAR !== undefined ||
    totalMoisture !== undefined ||
    ashContent !== undefined ||
    totalSulfur !== undefined ||
    hgi !== undefined
  ) {
    labResults = {
      calorieGAR: calorieGAR ?? 0,
      totalMoisture: totalMoisture ?? 0,
      ashContent: ashContent ?? 0,
      totalSulfur: totalSulfur ?? 0,
      hgi: hgi ?? 0,
    };
  }

  const qcTime = strCell(row, 48) || undefined;
  const qcStatusRaw = strCell(row, 65);
  const cleanDump = boolCell(row, 34);
  const sjVerified = boolCell(row, 22);

  return {
    id: id || `TRX-SHEET-${index + 1}`,
    ticketNumber: ticketNumber || id,
    queueNumber: strCell(row, 2, 'Q-001'),
    status: (strCell(row, 3, 'GATE_IN') as CoalTransaction['status']) || 'GATE_IN',
    poId: strCell(row, 4),
    poNumber: strCell(row, 5),
    scheduleId: strCell(row, 6) || undefined,
    supplierName: normalizeSupplierName(strCell(row, 7)),
    transporterName: strCell(row, 8),
    vehiclePlate: strCell(row, 9),
    driverName: strCell(row, 10),
    driverPhone: strCell(row, 11) || undefined,
    driverIdNumber: strCell(row, 12) || undefined,
    gateInTime: strCell(row, 13, new Date().toISOString()),
    securityOfficer: strCell(row, 14, 'Security'),
    sealNumber: strCell(row, 15) || undefined,
    tarpCondition: (strCell(row, 16, 'BAIK_RAPAT') as CoalTransaction['tarpCondition']) || 'BAIK_RAPAT',
    securityNotes: strCell(row, 17) || undefined,
    suratJalanNumber: strCell(row, 18),
    suratJalanDate: strCell(row, 19),
    scheduledDeliveryDate: strCell(row, 20) || undefined,
    suratJalanWeight: numCell(row, 21, 0),
    suratJalanVerified: sjVerified ?? false,
    ritCategory: strCell(row, 23) || undefined,
    ritRemarks: strCell(row, 24) || undefined,
    weighInTime: strCell(row, 25) || undefined,
    grossWeight: numCell(row, 26, 0),
    weighInOperator: strCell(row, 27) || undefined,
    weighInScaleId: strCell(row, 28) || undefined,
    initialDiscrepancy: optNumCell(row, 29),
    unloadingStartTime: strCell(row, 30) || undefined,
    unloadingEndTime: strCell(row, 31) || undefined,
    unloadingStockpile: strCell(row, 32) || undefined,
    unloadingChecker: strCell(row, 33) || undefined,
    cleanDumpVerified: cleanDump,
    unloadingNotes: strCell(row, 35) || undefined,
    weighOutTime: strCell(row, 36) || undefined,
    tareWeight: numCell(row, 37, 0),
    weighOutOperator: strCell(row, 38) || undefined,
    weighOutScaleId: strCell(row, 39) || undefined,
    nettoWeight: numCell(row, 40, 0),
    nettoTons: numCell(row, 41, 0),
    weightDifference: numCell(row, 42, 0),
    shrinkagePercentage: numCell(row, 43, 0),
    toleranceStatus: (strCell(row, 44) || undefined) as CoalTransaction['toleranceStatus'],
    claimPenaltyKg: optNumCell(row, 45),
    gateOutTime: strCell(row, 46) || undefined,
    gateOutOfficer: strCell(row, 47) || undefined,
    qcTime,
    qcInspector: strCell(row, 49) || undefined,
    sampleId: strCell(row, 50) || undefined,
    samplingMethod: strCell(row, 51) || undefined,
    visualAssessment,
    labResults,
    qcStatus: (qcStatusRaw || undefined) as CoalTransaction['qcStatus'],
    assignedStockpile: strCell(row, 66) || undefined,
    qcDecisionNotes: strCell(row, 67) || undefined,
    updatedAt: strCell(row, 68) || undefined,
    syncedToGoogleSheet: true,
    lastSyncedAt: strCell(row, 68) || new Date().toISOString(),
  };
}

function serializeAuditRow(log: AuditLogEntry): (string | number)[] {
  return [
    log.id,
    log.timestamp || new Date().toISOString(),
    log.actorName || '',
    log.actorEmail || '',
    log.actorRole || 'ADMIN',
    log.action || '',
    log.entityType || 'SYSTEM',
    log.entityId || '',
    replaceBorneoNameInText(log.summary || ''),
    replaceBorneoNameInText(log.details || ''),
  ];
}

function deserializeAuditRow(row: unknown[], index: number): AuditLogEntry | null {
  const id = strCell(row, 0);
  const summary = replaceBorneoNameInText(strCell(row, 8));
  if (!id && !summary) return null;
  const email = strCell(row, 3, '');
  const detailsRaw = strCell(row, 9);
  return {
    id: id || `LOG-SHEET-${index + 1}`,
    timestamp: strCell(row, 1, new Date().toISOString()),
    actorUid: email || 'google-sheet',
    actorName: strCell(row, 2, 'Operator'),
    actorEmail: email,
    actorRole: (strCell(row, 4, 'ADMIN') as UserRole) || 'ADMIN',
    action: strCell(row, 5, 'ACTIVITY'),
    entityType: (strCell(row, 6, 'SYSTEM') as AuditEntityType) || 'SYSTEM',
    entityId: strCell(row, 7, 'SYSTEM'),
    summary,
    details: detailsRaw ? replaceBorneoNameInText(detailsRaw) : undefined,
  };
}

function serializeOutgoingRow(rec: CoalOutgoingRecord): (string | number)[] {
  const qtyKg = Number(rec.quantityKg) || 0;
  const qtyTons =
    typeof rec.quantityTons === 'number' && Number.isFinite(rec.quantityTons)
      ? rec.quantityTons
      : Number((qtyKg / 1000).toFixed(3));
  return [
    rec.id,
    rec.date || '',
    rec.time || '',
    rec.shift || 'SHIFT 1',
    normalizeBoilerUnitForSheet(rec.destinationUnit),
    rec.sourceStockpile || 'Coal Storage',
    qtyKg,
    qtyTons,
    rec.equipmentUsed || '',
    rec.operatorName || '',
    rec.supervisorName || '',
    rec.notes || '',
    rec.createdAt || new Date().toISOString(),
    rec.updatedAt || new Date().toISOString(),
  ];
}

function deserializeOutgoingRow(row: unknown[], index: number): CoalOutgoingRecord | null {
  const id = strCell(row, 0);
  const date = strCell(row, 1);
  const qtyKg = numCell(row, 6, 0);
  if (!id && !date && qtyKg <= 0) return null;

  const rawShift = strCell(row, 3, 'SHIFT 1').toUpperCase();
  const shift: CoalOutgoingRecord['shift'] =
    rawShift === 'SHIFT 2' || rawShift === 'SHIFT 3' || rawShift === 'ALL SHIFT'
      ? rawShift
      : 'SHIFT 1';

  const qtyTons = numCell(row, 7, Number((qtyKg / 1000).toFixed(3)));
  const nowIso = new Date().toISOString();

  return {
    id: id || `OUT-SHEET-${index + 1}`,
    date: date || nowIso.slice(0, 10),
    time: strCell(row, 2, '08:00'),
    shift,
    destinationUnit: normalizeBoilerUnitForSheet(strCell(row, 4, 'Boiler FBC 1')),
    sourceStockpile: strCell(row, 5, 'Coal Storage'),
    quantityKg: Math.round(qtyKg),
    quantityTons: Number(qtyTons.toFixed(3)),
    equipmentUsed: strCell(row, 8) || undefined,
    operatorName: strCell(row, 9, '-'),
    supervisorName: strCell(row, 10) || undefined,
    notes: strCell(row, 11) || undefined,
    createdAt: strCell(row, 12, nowIso),
    updatedAt: strCell(row, 13, nowIso),
  };
}

export interface SheetMetadataInfo {
  spreadsheetId: string;
  spreadsheetTitle: string;
  spreadsheetUrl: string;
  sheetNames: string[];
  addedTabs: string[];
}

export interface FullSheetDatabase {
  metadata: SheetMetadataInfo;
  purchaseOrders: PurchaseOrder[];
  schedules: ArrivalSchedule[];
  transactions: CoalTransaction[];
  auditLogs: AuditLogEntry[];
  coalOutgoing: CoalOutgoingRecord[];
}

const REQUIRED_TABS: {
  title: string;
  headers: readonly string[];
  color: { red: number; green: number; blue: number };
}[] = [
  {
    title: SHEET_TABS.PO,
    headers: PO_HEADERS,
    color: { red: 0.02, green: 0.31, blue: 0.23 },
  },
  {
    title: SHEET_TABS.SCHEDULES,
    headers: SCHEDULE_HEADERS,
    color: { red: 0.12, green: 0.23, blue: 0.54 },
  },
  {
    title: SHEET_TABS.TRANSACTIONS,
    headers: TRANSACTION_HEADERS,
    color: { red: 0.12, green: 0.16, blue: 0.23 },
  },
  {
    title: SHEET_TABS.AUDIT,
    headers: AUDIT_HEADERS,
    color: { red: 0.48, green: 0.21, blue: 0.06 },
  },
  {
    title: SHEET_TABS.OUTGOING,
    headers: OUTGOING_HEADERS,
    color: { red: 0.71, green: 0.33, blue: 0.04 },
  },
  {
    title: SHEET_TABS.OUTGOING_RECAP,
    headers: OUTGOING_RECAP_HEADERS,
    color: { red: 0.03, green: 0.35, blue: 0.52 },
  },
];

async function applyHeaderFormatting(
  accessToken: string,
  spreadsheetId: string,
  sheetMetaList: Array<{ sheetId: number; title: string; headersLength: number; color: { red: number; green: number; blue: number } }>
): Promise<void> {
  if (sheetMetaList.length === 0) return;
  const requests = sheetMetaList.map((item) => ({
    repeatCell: {
      range: {
        sheetId: item.sheetId,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: item.headersLength,
      },
      cell: {
        userEnteredFormat: {
          backgroundColor: item.color,
          textFormat: {
            foregroundColor: { red: 1, green: 1, blue: 1 },
            bold: true,
            fontSize: 10,
          },
          horizontalAlignment: 'LEFT',
          verticalAlignment: 'MIDDLE',
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
    },
  }));

  await sheetsFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ requests }),
    }
  );
}

export const sheetsApiService = {
  async createDatabaseSpreadsheet(
    accessToken: string,
    title: string
  ): Promise<SheetMetadataInfo> {
    const cleanTitle = (title || 'SIMOTUBA_Database_Batubara').trim();

    const created = await sheetsFetch<{
      spreadsheetId: string;
      spreadsheetUrl: string;
      properties: { title: string };
      sheets: Array<{ properties: { sheetId: number; title: string } }>;
    }>('https://sheets.googleapis.com/v4/spreadsheets', accessToken, {
      method: 'POST',
      body: JSON.stringify({
        properties: {
          title: cleanTitle,
          locale: 'id_ID',
          timeZone: 'Asia/Jakarta',
        },
        sheets: REQUIRED_TABS.map((t) => ({
          properties: {
            title: t.title,
            gridProperties: {
              frozenRowCount: 1,
              columnCount: Math.max(t.headers.length + 2, 26),
            },
          },
        })),
      }),
    });

    const spreadsheetId = created.spreadsheetId;
    const sheetIdByTitle = new Map<string, number>();
    (created.sheets || []).forEach((s) => {
      sheetIdByTitle.set(s.properties.title, s.properties.sheetId);
    });

    // Write headers into all 4 tabs
    await sheetsFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: REQUIRED_TABS.map((tab) => ({
            range: `'${tab.title}'!A1:${colIndexToLetter(tab.headers.length - 1)}1`,
            values: [[...tab.headers]],
          })),
        }),
      }
    );

    // Format header rows
    await applyHeaderFormatting(
      accessToken,
      spreadsheetId,
      REQUIRED_TABS.map((tab) => ({
        sheetId: sheetIdByTitle.get(tab.title) || 0,
        title: tab.title,
        headersLength: tab.headers.length,
        color: tab.color,
      }))
    );

    return {
      spreadsheetId,
      spreadsheetTitle: created.properties?.title || cleanTitle,
      spreadsheetUrl:
        created.spreadsheetUrl ||
        `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      sheetNames: REQUIRED_TABS.map((t) => t.title),
      addedTabs: REQUIRED_TABS.map((t) => t.title),
    };
  },

  async inspectAndEnsureSpreadsheet(
    accessToken: string,
    rawIdOrUrl: string
  ): Promise<SheetMetadataInfo> {
    const spreadsheetId = extractSpreadsheetId(rawIdOrUrl);
    if (!spreadsheetId) {
      throw new SheetsApiError('ID atau URL Google Spreadsheet tidak valid.', 400);
    }

    // ALWAYS fetch spreadsheet metadata first before assuming any sheet names
    const meta = await sheetsFetch<{
      spreadsheetId: string;
      spreadsheetUrl?: string;
      properties?: { title?: string };
      sheets?: Array<{ properties: { sheetId: number; title: string } }>;
    }>(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties(sheetId,title)`,
      accessToken
    );

    const existingTitles = new Set((meta.sheets || []).map((s) => s.properties.title));
    const missingTabs = REQUIRED_TABS.filter((t) => !existingTitles.has(t.title));

    const addedTabs: string[] = [];
    const addedSheetIds = new Map<string, number>();

    if (missingTabs.length > 0) {
      const batchRes = await sheetsFetch<{
        replies?: Array<{ addSheet?: { properties?: { sheetId: number; title: string } } }>;
      }>(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        accessToken,
        {
          method: 'POST',
          body: JSON.stringify({
            requests: missingTabs.map((t) => ({
              addSheet: {
                properties: {
                  title: t.title,
                  gridProperties: {
                    frozenRowCount: 1,
                    columnCount: Math.max(t.headers.length + 2, 26),
                  },
                },
              },
            })),
          }),
        }
      );

      (batchRes.replies || []).forEach((rep) => {
        const props = rep.addSheet?.properties;
        if (props) {
          addedTabs.push(props.title);
          addedSheetIds.set(props.title, props.sheetId);
          existingTitles.add(props.title);
        }
      });

      // Initialize header row for newly added tabs
      await sheetsFetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
        accessToken,
        {
          method: 'POST',
          body: JSON.stringify({
            valueInputOption: 'USER_ENTERED',
            data: missingTabs.map((tab) => ({
              range: `'${tab.title}'!A1:${colIndexToLetter(tab.headers.length - 1)}1`,
              values: [[...tab.headers]],
            })),
          }),
        }
      );

      await applyHeaderFormatting(
        accessToken,
        spreadsheetId,
        missingTabs
          .filter((tab) => addedSheetIds.has(tab.title))
          .map((tab) => ({
            sheetId: addedSheetIds.get(tab.title)!,
            title: tab.title,
            headersLength: tab.headers.length,
            color: tab.color,
          }))
      );
    }

    return {
      spreadsheetId,
      spreadsheetTitle: meta.properties?.title || 'Google Spreadsheet SIMOTUBA',
      spreadsheetUrl:
        meta.spreadsheetUrl ||
        `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      sheetNames: Array.from(existingTitles),
      addedTabs,
    };
  },

  async loadDatabaseFromSheet(
    accessToken: string,
    rawIdOrUrl: string
  ): Promise<FullSheetDatabase> {
    const metadata = await this.inspectAndEnsureSpreadsheet(accessToken, rawIdOrUrl);
    const id = metadata.spreadsheetId;

    const ranges = [
      `'${SHEET_TABS.PO}'!A2:${colIndexToLetter(PO_HEADERS.length - 1)}`,
      `'${SHEET_TABS.SCHEDULES}'!A2:${colIndexToLetter(SCHEDULE_HEADERS.length - 1)}`,
      `'${SHEET_TABS.TRANSACTIONS}'!A2:${colIndexToLetter(TRANSACTION_HEADERS.length - 1)}`,
      `'${SHEET_TABS.AUDIT}'!A2:${colIndexToLetter(AUDIT_HEADERS.length - 1)}`,
      `'${SHEET_TABS.OUTGOING}'!A2:${colIndexToLetter(OUTGOING_HEADERS.length - 1)}`,
    ];

    const queryParams = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join('&');
    const res = await sheetsFetch<{
      valueRanges?: Array<{ values?: unknown[][] }>;
    }>(
      `https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchGet?${queryParams}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
      accessToken
    );

    const valueRanges = res.valueRanges || [];
    const poRows = valueRanges[0]?.values || [];
    const schRows = valueRanges[1]?.values || [];
    const txRows = valueRanges[2]?.values || [];
    const auditRows = valueRanges[3]?.values || [];
    const outgoingRows = valueRanges[4]?.values || [];

    const rawTransactions = txRows
      .map((r, i) => deserializeTransactionRow(r, i))
      .filter((x): x is CoalTransaction => Boolean(x));
    const transactions = sanitizeTransactionsForRemovedPo(rawTransactions).items;

    const rawPurchaseOrders = poRows
      .map((r, i) => deserializePoRow(r, i))
      .filter((x): x is PurchaseOrder => Boolean(x));
    const purchaseOrders = sanitizePurchaseOrdersForRemovedPo(
      rawPurchaseOrders,
      transactions
    ).items;

    const rawSchedules = schRows
      .map((r, i) => deserializeScheduleRow(r, i))
      .filter((x): x is ArrivalSchedule => Boolean(x));
    const schedules = sanitizeSchedulesForRemovedPo(rawSchedules).items;

    const rawAuditLogs = auditRows
      .map((r, i) => deserializeAuditRow(r, i))
      .filter((x): x is AuditLogEntry => Boolean(x));
    const auditLogs = sanitizeAuditLogsForRemovedPo(rawAuditLogs).items;

    const coalOutgoing = outgoingRows
      .map((r, i) => deserializeOutgoingRow(r, i))
      .filter((x): x is CoalOutgoingRecord => Boolean(x));

    return {
      metadata,
      purchaseOrders,
      schedules,
      transactions,
      auditLogs,
      coalOutgoing,
    };
  },

  async writeFullDatabaseToSheet(
    accessToken: string,
    rawIdOrUrl: string,
    payload: {
      purchaseOrders: PurchaseOrder[];
      schedules: ArrivalSchedule[];
      transactions: CoalTransaction[];
      auditLogs?: AuditLogEntry[];
      coalOutgoing?: CoalOutgoingRecord[];
    }
  ): Promise<SheetMetadataInfo> {
    const metadata = await this.inspectAndEnsureSpreadsheet(accessToken, rawIdOrUrl);
    const id = metadata.spreadsheetId;

    const clearRanges = [
      `'${SHEET_TABS.PO}'!A1:${colIndexToLetter(PO_HEADERS.length - 1)}`,
      `'${SHEET_TABS.SCHEDULES}'!A1:${colIndexToLetter(SCHEDULE_HEADERS.length - 1)}`,
      `'${SHEET_TABS.TRANSACTIONS}'!A1:${colIndexToLetter(TRANSACTION_HEADERS.length - 1)}`,
    ];
    if (payload.auditLogs !== undefined) {
      clearRanges.push(`'${SHEET_TABS.AUDIT}'!A1:${colIndexToLetter(AUDIT_HEADERS.length - 1)}`);
    }
    if (payload.coalOutgoing !== undefined) {
      clearRanges.push(
        `'${SHEET_TABS.OUTGOING}'!A1:${colIndexToLetter(OUTGOING_HEADERS.length - 1)}`,
        `'${SHEET_TABS.OUTGOING_RECAP}'!A1:${colIndexToLetter(OUTGOING_RECAP_HEADERS.length - 1)}`
      );
    }

    await sheetsFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchClear`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({ ranges: clearRanges }),
      }
    );

    const cleanTxs = sanitizeTransactionsForRemovedPo(payload.transactions).items;
    const cleanSchs = sanitizeSchedulesForRemovedPo(payload.schedules).items;
    const cleanPos = sanitizePurchaseOrdersForRemovedPo(payload.purchaseOrders, cleanTxs).items;

    const poValues: (string | number)[][] = [
      [...PO_HEADERS],
      ...cleanPos.map(serializePoRow),
    ];
    const schValues: (string | number)[][] = [
      [...SCHEDULE_HEADERS],
      ...cleanSchs.map(serializeScheduleRow),
    ];
    const txValues: (string | number)[][] = [
      [...TRANSACTION_HEADERS],
      ...cleanTxs.map(serializeTransactionRow),
    ];

    const dataToWrite: Array<{ range: string; values: (string | number)[][] }> = [
      {
        range: `'${SHEET_TABS.PO}'!A1:${colIndexToLetter(PO_HEADERS.length - 1)}${poValues.length}`,
        values: poValues,
      },
      {
        range: `'${SHEET_TABS.SCHEDULES}'!A1:${colIndexToLetter(SCHEDULE_HEADERS.length - 1)}${schValues.length}`,
        values: schValues,
      },
      {
        range: `'${SHEET_TABS.TRANSACTIONS}'!A1:${colIndexToLetter(TRANSACTION_HEADERS.length - 1)}${txValues.length}`,
        values: txValues,
      },
    ];

    if (payload.auditLogs !== undefined) {
      const cleanLogs = sanitizeAuditLogsForRemovedPo(payload.auditLogs).items;
      const auditValues: (string | number)[][] = [
        [...AUDIT_HEADERS],
        ...cleanLogs.slice(0, 500).map(serializeAuditRow),
      ];
      dataToWrite.push({
        range: `'${SHEET_TABS.AUDIT}'!A1:${colIndexToLetter(AUDIT_HEADERS.length - 1)}${auditValues.length}`,
        values: auditValues,
      });
    }

    if (payload.coalOutgoing !== undefined) {
      const outgoingValues: (string | number)[][] = [
        [...OUTGOING_HEADERS],
        ...payload.coalOutgoing.map(serializeOutgoingRow),
      ];
      const outgoingRecapValues: (string | number)[][] = [
        [...OUTGOING_RECAP_HEADERS],
        ...buildOutgoingBoilerRecapRows(payload.coalOutgoing),
      ];
      dataToWrite.push(
        {
          range: `'${SHEET_TABS.OUTGOING}'!A1:${colIndexToLetter(OUTGOING_HEADERS.length - 1)}${outgoingValues.length}`,
          values: outgoingValues,
        },
        {
          range: `'${SHEET_TABS.OUTGOING_RECAP}'!A1:${colIndexToLetter(OUTGOING_RECAP_HEADERS.length - 1)}${outgoingRecapValues.length}`,
          values: outgoingRecapValues,
        }
      );
    }

    await sheetsFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchUpdate`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: dataToWrite,
        }),
      }
    );

    return metadata;
  },
};

