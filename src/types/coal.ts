export type ActiveTab =
  | 'dashboard'
  | 'po'
  | 'schedules'
  | 'security'
  | 'weigh-in'
  | 'qc'
  | 'unloading'
  | 'weigh-out'
  | 'transactions'
  | 'googlesheet';

export type UserRole =
  | 'ADMIN'
  | 'SECURITY'
  | 'TIMBANG_MASUK'
  | 'BONGKAR'
  | 'TIMBANG_KELUAR'
  | 'QC_LAB'
  | 'VIEWER';

export interface AppUserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
}

export type AuditEntityType = 'PO' | 'SCHEDULE' | 'TRANSACTION' | 'SYSTEM' | 'USER';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorUid: string;
  actorEmail: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  entityType: AuditEntityType;
  entityId: string;
  summary: string;
  details?: string;
}

export type CoalStatus =
  | 'SCHEDULED'        // Terjadwal dalam perjalanan
  | 'GATE_IN'          // Masuk Pos Security & Mendapat Antrean
  | 'TIMBANG_MASUK'    // Verifikasi Surat Jalan & Timbang Gross
  | 'QC_CHECK'         // Pengambilan Sampel & Uji Kualitas Lab
  | 'BONGKAR'          // Pembongkaran di Stockpile / Dome
  | 'TIMBANG_KELUAR'   // Timbang Tare & Hitung Netto Akhir
  | 'GATE_OUT'         // Menunggu Checkout di Pos Security Keluar
  | 'COMPLETED'        // Selesai & Keluar Pabrik (Gate Out Selesai)
  | 'REJECTED';        // Ditolak QC (Return)

export interface ContractSpecs {
  calorieMin: number;      // kcal/kg GAR (e.g. 4200)
  moistureMax: number;     // % arb (e.g. 34.0)
  ashMax: number;          // % adb (e.g. 8.0)
  sulfurMax: number;       // % adb (e.g. 0.8)
  hgiMin: number;          // Hardgrove Grindability Index (e.g. 45)
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierName: string;
  supplierCode: string;
  contractDate: string;
  targetTonnage: number;      // Kg
  receivedTonnage: number;    // Kg
  specs: ContractSpecs;
  tolerancePercentage: number;// e.g. 5%
  pricePerTon: number;        // IDR
  destinationStockpile: string;
  status: 'ACTIVE' | 'CLOSED' | 'HOLD';
  notes?: string;
  createdAt: string;
  updatedAt?: string;
  createdBy?: string;
  allowedUids?: string[];
}

export interface ArrivalSchedule {
  id: string;
  poId: string;
  poNumber: string;
  supplierName: string;
  etaDateTime: string;        // ISO string or YYYY-MM-DD
  estimatedTonnage: number;   // Kg
  estimatedTruckCount?: number; // Estimasi ritase / truk
  originMine?: string;
  status:
    | 'SCHEDULED'
    | 'ON_WAY'
    | 'ARRIVED_GATE'
    | 'TIMBANG_MASUK'
    | 'BONGKAR'
    | 'TIMBANG_KELUAR'
    | 'GATE_OUT'
    | 'COMPLETED'
    | 'REJECTED'
    | 'OVERDUE'
    | 'CANCELLED';
  remarks?: string;
  createdBy?: string;
  allowedUids?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface VisualQC {
  moistureVisual: 'KERING' | 'LEMBAB' | 'BASAH_BECEK';
  contaminantsFound: string[]; // e.g. Batu Lempung, Kayu, Pirit, Plastik
  temperatureCelsius: number;  // Suhu muatan (°C)
  odorStatus: 'NORMAL' | 'BAU_BELERANG_TINGGI' | 'BERASAP_PANAS';
  coalColor?: 'Hitam' | 'Hitam Kecoklatan' | string;
  rankLevel?: 'High Rank Coal' | 'Medium Rank' | string;
  luster?: 'Hitam Mengkilap' | 'Hitam' | string;
  impurityStatus?: 'Tidak ada Kontaminasi' | 'Ada Kontaminasi' | string;
}

export interface LabQCResults {
  calorieGAR: number;      // kcal/kg
  totalMoisture: number;   // % arb
  ashContent: number;      // % adb
  totalSulfur: number;     // % adb
  hgi: number;             // HGI
}

export interface CoalTransaction {
  id: string;
  ticketNumber: string;
  queueNumber: string;
  scheduleId?: string;
  poId: string;
  poNumber: string;
  supplierName: string;
  transporterName: string;
  vehiclePlate: string;
  driverName: string;
  driverPhone?: string;
  driverIdNumber?: string; // SIM/KTP

  // Pos Security (Gate In)
  gateInTime: string;
  securityOfficer: string;
  sealNumber?: string;
  tarpCondition: 'BAIK_RAPAT' | 'RUSAK_ROBEK' | 'TANPA_TERPAL';
  securityNotes?: string;

  // Verifikasi Surat Jalan (SJ) & Jadwal Kirim
  suratJalanNumber: string;
  suratJalanDate: string;
  scheduledDeliveryDate?: string;
  suratJalanWeight: number; // kg
  suratJalanVerified: boolean;
  ritCategory?: string; // e.g., "RIT 1", "RIT 2"
  ritRemarks?: string;  // e.g., "PENGIRIMAN BATUBARA RIT KE-1"

  // Jembatan Timbang Masuk (Gross)
  weighInTime?: string;
  grossWeight: number;     // kg
  weighInOperator?: string;
  weighInScaleId?: string;
  initialDiscrepancy?: number; // kg

  // QC & Sampling
  qcTime?: string;
  qcInspector?: string;
  sampleId?: string;
  samplingMethod?: 'KADAR_AIR' | 'AUGUR_SAMPLER' | 'MANUAL_CORING' | 'CROSS_BELT' | 'GRAB' | 'RAPID_MOISTURE' | string;
  visualAssessment?: VisualQC;
  labResults?: LabQCResults;
  qcStatus?: 'APPROVED' | 'CONDITIONAL_PENALTY' | 'REJECTED';
  qcDecisionNotes?: string;
  assignedStockpile?: string;

  // Bongkar (Unloading)
  unloadingStartTime?: string;
  unloadingEndTime?: string;
  unloadingStockpile?: string;
  unloadingChecker?: string;
  cleanDumpVerified?: boolean;
  unloadingNotes?: string;

  // Jembatan Timbang Keluar (Tare)
  weighOutTime?: string;
  tareWeight: number;      // kg
  weighOutOperator?: string;
  weighOutScaleId?: string;
  nettoWeight: number;     // kg = gross - tare
  nettoTons: number;       // Ton
  weightDifference: number;// kg = netto - suratJalan
  shrinkagePercentage: number; // %
  toleranceStatus?: 'WITHIN_TOLERANCE' | 'EXCESS_SHRINKAGE' | 'SURPLUS';
  claimPenaltyKg?: number;

  // Pos Security (Gate Out)
  gateOutTime?: string;
  gateOutOfficer?: string;

  // Overall Status
  status: CoalStatus;
  syncedToGoogleSheet: boolean;
  lastSyncedAt?: string;

  // Cloud RBAC Metadata
  createdBy?: string;
  allowedUids?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface GoogleSheetConfig {
  mode?: 'SHEETS_API' | 'APPS_SCRIPT';
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  spreadsheetTitle?: string;
  databaseEnabled?: boolean;
  webhookUrl: string;
  sheetName: string;
  autoSyncEnabled: boolean;
  lastSyncTime?: string;
  syncStatus: 'IDLE' | 'SYNCING' | 'SUCCESS' | 'ERROR';
  lastErrorMessage?: string;
}
