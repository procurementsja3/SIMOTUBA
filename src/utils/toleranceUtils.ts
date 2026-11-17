export type ToleranceStatus = 'WITHIN_TOLERANCE' | 'EXCESS_SHRINKAGE' | 'SURPLUS';

export interface ToleranceMetricsInput {
  grossWeight: number;
  tareWeight: number;
  suratJalanWeight: number;
  tolerancePercentage?: number;
}

export interface ToleranceMetricsResult {
  nettoWeight: number;
  nettoTons: number;
  initialDiscrepancy: number;
  weightDifference: number;
  shrinkagePercentage: number;
  toleranceStatus: ToleranceStatus;
  claimPenaltyKg: number;
}

/**
 * Single source of truth for coal weighbridge reconciliation, shrinkage %, and claim penalty.
 */
export function calculateToleranceMetrics({
  grossWeight,
  tareWeight,
  suratJalanWeight,
  tolerancePercentage = 5,
}: ToleranceMetricsInput): ToleranceMetricsResult {
  const gross = Number(grossWeight) || 0;
  const tare = Number(tareWeight) || 0;
  const sj = Number(suratJalanWeight) || 0;
  const tol = Number(tolerancePercentage) > 0 ? Number(tolerancePercentage) : 5;

  const nettoWeight = gross > 0 && tare > 0 ? Math.max(0, gross - tare) : 0;
  const nettoTons = nettoWeight / 1000;
  const initialDiscrepancy = gross > 0 && sj > 0 ? gross - sj : 0;
  const weightDifference = nettoWeight > 0 && sj > 0 ? nettoWeight - sj : 0;
  const shrinkagePercentage =
    nettoWeight > 0 && sj > 0 ? (weightDifference / sj) * 100 : 0;

  let toleranceStatus: ToleranceStatus = 'WITHIN_TOLERANCE';
  if (shrinkagePercentage < -tol) {
    toleranceStatus = 'EXCESS_SHRINKAGE';
  } else if (shrinkagePercentage > tol) {
    toleranceStatus = 'SURPLUS';
  }

  const claimPenaltyKg =
    toleranceStatus === 'EXCESS_SHRINKAGE' && sj > 0
      ? Math.max(0, Math.abs(weightDifference) - sj * (tol / 100))
      : 0;

  return {
    nettoWeight,
    nettoTons,
    initialDiscrepancy,
    weightDifference,
    shrinkagePercentage,
    toleranceStatus,
    claimPenaltyKg,
  };
}

export function validateWeighOutWeights(
  grossWeight: number,
  tareWeight: number
): { valid: boolean; error?: string } {
  const gross = Number(grossWeight) || 0;
  const tare = Number(tareWeight) || 0;

  if (gross <= 0) {
    return {
      valid: false,
      error: 'Berat Gross (Timbang Masuk) belum tercatat atau bernilai 0 kg.',
    };
  }
  if (tare <= 0) {
    return {
      valid: false,
      error: 'Berat Tare (Timbang Keluar) harus lebih besar dari 0 kg.',
    };
  }
  if (tare >= gross) {
    return {
      valid: false,
      error: `Berat Tare (${tare.toLocaleString('id-ID')} kg) tidak valid karena lebih besar atau sama dengan Gross (${gross.toLocaleString('id-ID')} kg).`,
    };
  }
  return { valid: true };
}

export function validateTransactionChronology(timestamps: {
  gateInTime?: string;
  weighInTime?: string;
  unloadingEndTime?: string;
  weighOutTime?: string;
  gateOutTime?: string;
}): { valid: boolean; error?: string } {
  const orderedStages: Array<{ label: string; iso?: string }> = [
    { label: 'Gate In Pos Security', iso: timestamps.gateInTime },
    { label: 'Timbang Masuk (Gross)', iso: timestamps.weighInTime },
    { label: 'Bongkar Muatan', iso: timestamps.unloadingEndTime },
    { label: 'Timbang Keluar (Tare)', iso: timestamps.weighOutTime },
    { label: 'Gate Out Pos Security', iso: timestamps.gateOutTime },
  ];

  let prevStageLabel = '';
  let prevMs = -Infinity;

  for (const stage of orderedStages) {
    if (!stage.iso) continue;
    const ms = new Date(stage.iso).getTime();
    if (Number.isNaN(ms)) {
      return {
        valid: false,
        error: `Format waktu pada tahap "${stage.label}" tidak valid.`,
      };
    }
    if (prevStageLabel && ms < prevMs) {
      return {
        valid: false,
        error: `Urutan waktu tidak logis: "${stage.label}" lebih awal daripada "${prevStageLabel}".`,
      };
    }
    prevStageLabel = stage.label;
    prevMs = ms;
  }

  return { valid: true };
}
