import { CoalTransaction } from '../types/coal';

export interface DurationResult {
  hours: number;
  minutes: number;
  seconds: number;
  totalMinutes: number;
  totalSeconds: number;
  hoursDecimal: number;
  text: string;
  isOngoing: boolean;
}

export interface TimelineCheckpoint {
  id: string;
  stageName: string;
  timestamp?: string;
  formattedDate: string;
  formattedTime: string;
  actor?: string;
  note?: string;
  metric?: string;
  durationFromPrevious?: string;
  durationMinutesFromPrevious?: number;
  durationSecondsFromPrevious?: number;
  hasDirectPrevious?: boolean;
  isInverted?: boolean;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING';
}

/**
 * Extracts literal time-of-day in seconds (0 to 86399) and date (YYYY-MM-DD) from any string.
 * Supports:
 * - ISO with Z: "2026-11-09T10:21:45.000Z"
 * - ISO with offset: "2026-11-09T17:21:45+07:00"
 * - Local ISO: "2026-11-09T15:10:57"
 * - Formatted clock: "15.10.57" or "15:10:57"
 */
export function extractTimeOfDay(ts?: string): {
  dateStr?: string;
  hour: number;
  minute: number;
  second: number;
  totalSeconds: number;
} | null {
  if (!ts || ts === '-') return null;

  // 1. String has 'T' (ISO format)
  if (ts.includes('T')) {
    // If it has timezone offset or 'Z'
    if (ts.endsWith('Z') || ts.includes('+') || /\d{2}-\d{2}$/.test(ts)) {
      const d = new Date(ts);
      if (!isNaN(d.getTime())) {
        const h = d.getHours();
        const m = d.getMinutes();
        const s = d.getSeconds();
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return { dateStr, hour: h, minute: m, second: s, totalSeconds: h * 3600 + m * 60 + s };
      }
    }
    // If it has no timezone, read literal clock numbers directly
    const [dPart, tPart] = ts.split('T');
    const timeMatch = tPart.match(/(\d{1,2})[:.](\d{1,2})(?:[:.](\d{1,2}))?/);
    if (timeMatch) {
      const h = parseInt(timeMatch[1], 10) || 0;
      const m = parseInt(timeMatch[2], 10) || 0;
      const s = parseInt(timeMatch[3] || '0', 10) || 0;
      return { dateStr: dPart, hour: h, minute: m, second: s, totalSeconds: h * 3600 + m * 60 + s };
    }
  }

  // 2. Pure time string e.g. "15.10.57" or "15:10:57"
  const pureTimeMatch = ts.match(/(\d{1,2})[:.](\d{1,2})(?:[:.](\d{1,2}))?/);
  if (pureTimeMatch) {
    const h = parseInt(pureTimeMatch[1], 10) || 0;
    const m = parseInt(pureTimeMatch[2], 10) || 0;
    const s = parseInt(pureTimeMatch[3] || '0', 10) || 0;
    return { hour: h, minute: m, second: s, totalSeconds: h * 3600 + m * 60 + s };
  }

  return null;
}

function buildDurationResult(diffSeconds: number, isOngoing: boolean): DurationResult {
  const safeSec = Math.max(0, Math.floor(diffSeconds));
  const totalMinutes = Math.floor(safeSec / 60);
  const hours = Math.floor(safeSec / 3600);
  const remSec = safeSec % 3600;
  const minutes = Math.floor(remSec / 60);
  const seconds = remSec % 60;
  const hoursDecimal = Number((safeSec / 3600).toFixed(2));

  let text = '';
  if (hours > 0) {
    const minText = minutes > 0 ? ` ${minutes} Menit` : '';
    const secText = seconds > 0 ? ` ${seconds} Detik` : '';
    text = `${hours} Jam${minText}${secText}`;
  } else if (minutes > 0) {
    const secText = seconds > 0 ? ` ${seconds} Detik` : '';
    text = `${minutes} Menit${secText}`;
  } else if (seconds > 0) {
    text = `${seconds} Detik`;
  } else {
    text = '0 Menit';
  }

  if (isOngoing) {
    text = `${text} (Berjalan)`;
  }

  return {
    hours,
    minutes,
    seconds,
    totalMinutes,
    totalSeconds: safeSec,
    hoursDecimal,
    text,
    isOngoing,
  };
}

/**
 * Calculates duration between two formatted clock strings (e.g. "15.10.57" and "17.21.45").
 * Only applies midnight rollover (+24h) for genuine late-night -> early-morning transitions,
 * never turning small negative/inverted timestamps into ~24 hours.
 */
export function calculateFromFormattedTimes(timeInStr?: string, timeOutStr?: string): DurationResult | null {
  if (!timeInStr || !timeOutStr || timeInStr === '-' || timeOutStr === '-') return null;
  const t1 = extractTimeOfDay(timeInStr);
  const t2 = extractTimeOfDay(timeOutStr);
  if (!t1 || !t2) return null;

  let diffSec = t2.totalSeconds - t1.totalSeconds;
  if (diffSec < 0) {
    const overnightSec = diffSec + 86400;
    // Only treat as overnight rollover if start is evening (>= 18:00), end is morning (<= 10:00),
    // and total overnight span is <= 14 hours. Otherwise it is an inverted clock time -> 0.
    if (t1.hour >= 18 && t2.hour <= 10 && overnightSec <= 14 * 3600) {
      diffSec = overnightSec;
    } else {
      diffSec = 0;
    }
  }

  return buildDurationResult(diffSec, false);
}

/**
 * Normalizes any timestamp string into a valid Unix epoch timestamp (ms).
 */
export function getNormalizedTimestampMs(ts?: string): number | null {
  if (!ts || ts === '-') return null;

  // Format: YYYY-MM-DDTHH:mm:ss without 'Z' or timezone offset:
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(ts) && !ts.endsWith('Z') && !ts.includes('+') && !/\d{2}-\d{2}$/.test(ts)) {
    // Treat as Indonesian local time (+07:00 / WIB)
    const withOffset = `${ts}+07:00`;
    const d = new Date(withOffset);
    if (!isNaN(d.getTime())) {
      return d.getTime();
    }
    const [dPart, tPart] = ts.split('T');
    const [y, m, dNum] = dPart.split('-').map(Number);
    const [h, min, s] = tPart.split(':').map(Number);
    if (y && m && dNum) {
      const localDate = new Date(y, m - 1, dNum, h || 0, min || 0, Math.floor(s || 0));
      if (!isNaN(localDate.getTime())) {
        return localDate.getTime();
      }
    }
  }

  const date = new Date(ts);
  const time = date.getTime();
  return isNaN(time) ? null : time;
}

/**
 * Computes safe elapsed seconds between two timestamp strings.
 * Preserves true multi-hour and multi-day positive durations (no 24h truncation)
 * and prevents inverted timestamps from wrapping around to +24 hours.
 */
function computeSafeElapsedSeconds(
  startTs?: string,
  endTs?: string
): { seconds: number; isInverted: boolean } {
  if (!startTs || startTs === '-' || !endTs || endTs === '-') {
    return { seconds: 0, isInverted: false };
  }

  const startMs = getNormalizedTimestampMs(startTs);
  const endMs = getNormalizedTimestampMs(endTs);

  if (startMs !== null && endMs !== null) {
    const rawDiffSec = Math.floor((endMs - startMs) / 1000);
    if (rawDiffSec >= 0) {
      return { seconds: rawDiffSec, isInverted: false };
    }

    // Negative diff: check ONLY for accidental same-date midnight rollover (e.g. 23:30 -> 00:20 on same date string)
    const t1 = extractTimeOfDay(startTs);
    const t2 = extractTimeOfDay(endTs);
    if (t1 && t2 && t1.dateStr && t2.dateStr && t1.dateStr === t2.dateStr) {
      const overnightSec = 86400 - t1.totalSeconds + t2.totalSeconds;
      if (t1.hour >= 20 && t2.hour <= 6 && overnightSec <= 10 * 3600) {
        return { seconds: overnightSec, isInverted: false };
      }
    }

    // Genuine out-of-order / inverted timestamp: clamp to 0 instead of adding +24 hours
    return { seconds: 0, isInverted: true };
  }

  // Fallback for pure clock-only strings without date
  const fromClock = calculateFromFormattedTimes(startTs, endTs);
  return { seconds: fromClock ? fromClock.totalSeconds : 0, isInverted: false };
}

/**
 * Formats a timestamp into a clean HH.mm.ss clock string in Indonesian locale.
 */
export function formatClockTime(ts?: string): string {
  if (!ts || ts === '-') return '-';
  const tod = extractTimeOfDay(ts);
  if (tod) {
    const hh = String(tod.hour).padStart(2, '0');
    const mm = String(tod.minute).padStart(2, '0');
    const ss = String(tod.second).padStart(2, '0');
    return `${hh}.${mm}.${ss}`;
  }
  return new Date(ts).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Formats a timestamp into a clean DD/MM/YYYY date string in Indonesian locale.
 */
export function formatCheckpointDate(ts?: string): string {
  if (!ts || ts === '-') return '-';
  const tod = extractTimeOfDay(ts);
  if (tod?.dateStr) {
    const match = tod.dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      return `${match[3]}/${match[2]}/${match[1]}`;
    }
  }
  const ms = getNormalizedTimestampMs(ts);
  if (ms !== null) {
    return new Date(ms).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }
  return '-';
}

/**
 * Calculates time duration between two date strings (or between start and now if ongoing).
 */
export function calculateDuration(startTime?: string, endTime?: string): DurationResult {
  if (!startTime || startTime === '-') {
    return {
      hours: 0,
      minutes: 0,
      seconds: 0,
      totalMinutes: 0,
      totalSeconds: 0,
      hoursDecimal: 0,
      text: '-',
      isOngoing: false,
    };
  }

  const isOngoing = !endTime;
  let diffSeconds = 0;

  if (endTime) {
    diffSeconds = computeSafeElapsedSeconds(startTime, endTime).seconds;
  } else {
    const startMs = getNormalizedTimestampMs(startTime);
    if (startMs !== null) {
      diffSeconds = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
    }
  }

  return buildDurationResult(diffSeconds, isOngoing);
}

/**
 * Builds step-by-step timeline checkpoints with individual elapsed duration.
 */
export function getOperationalTimeline(tx: CoalTransaction): {
  checkpoints: TimelineCheckpoint[];
  totalDuration: DurationResult;
} {
  const steps: {
    id: string;
    stageName: string;
    timestamp?: string;
    actor?: string;
    metric?: string;
    note?: string;
  }[] = [
    {
      id: 'gate-in',
      stageName: 'Pos Security (Gate In)',
      timestamp: tx.gateInTime,
      actor: tx.securityOfficer,
      note: `Surat Jalan: ${tx.suratJalanNumber} (${(tx.suratJalanWeight / 1000).toFixed(2)} Ton)`,
    },
    {
      id: 'weigh-in',
      stageName: 'Jembatan Timbang Masuk (Gross)',
      timestamp: tx.weighInTime,
      actor: tx.weighInOperator,
      metric: tx.grossWeight > 0 ? `Gross: ${(tx.grossWeight / 1000).toFixed(2)} Ton` : undefined,
      note: tx.weighInScaleId,
    },
    {
      id: 'unloading',
      stageName: `Bongkar (${tx.unloadingStockpile || tx.assignedStockpile || 'Stockpile'})`,
      timestamp: tx.unloadingEndTime,
      actor: tx.unloadingChecker,
      note: tx.cleanDumpVerified ? 'Pembersihan Bak Terverifikasi' : undefined,
    },
    {
      id: 'weigh-out',
      stageName: 'Jembatan Timbang Keluar (Tare & Netto)',
      timestamp: tx.weighOutTime,
      actor: tx.weighOutOperator,
      metric: tx.nettoTons > 0 ? `Netto: ${tx.nettoTons.toFixed(2)} Ton` : undefined,
      note: tx.shrinkagePercentage !== undefined ? `Susut: ${tx.shrinkagePercentage > 0 ? '+' : ''}${tx.shrinkagePercentage.toFixed(2)}%` : undefined,
    },
    {
      id: 'gate-out',
      stageName: 'Pos Security Keluar (Gate Out)',
      timestamp: tx.gateOutTime,
      actor: tx.gateOutOfficer || 'Pos Security Utama',
      note: tx.status === 'COMPLETED' ? 'Penyelesaian Armada Selesai' : 'Menunggu Checkout Gerbang Keluar',
    },
  ];

  let lastAvailableTimestamp: string | undefined;
  const checkpoints: TimelineCheckpoint[] = steps.map((s, index) => {
    let status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING' = 'PENDING';
    let durationText = '';
    let durationMinutes = 0;
    let durationSeconds = 0;
    let isInverted = false;

    const directPrevTimestamp = index > 0 ? steps[index - 1]?.timestamp : undefined;
    const hasDirectPrevious = Boolean(index > 0 && s.timestamp && directPrevTimestamp);
    const formattedDate = formatCheckpointDate(s.timestamp);
    const formattedTime = formatClockTime(s.timestamp);

    if (s.timestamp) {
      status = 'COMPLETED';
      const referencePrevTs = directPrevTimestamp || lastAvailableTimestamp;
      if (index > 0 && referencePrevTs) {
        const elapsed = computeSafeElapsedSeconds(referencePrevTs, s.timestamp);
        durationSeconds = elapsed.seconds;
        isInverted = elapsed.isInverted;
        durationMinutes = Math.floor(durationSeconds / 60);
        const hrs = Math.floor(durationMinutes / 60);
        const mins = durationMinutes % 60;
        if (isInverted) {
          durationText = 'Jam tdk urut';
        } else {
          durationText = hrs > 0 ? `+${hrs}j ${mins}m` : `+${mins} mnt`;
        }
      }
      lastAvailableTimestamp = s.timestamp;
    } else {
      // If previous was completed and this is first without timestamp, it is IN_PROGRESS
      const prevStep = steps[index - 1];
      if (prevStep && prevStep.timestamp && !s.timestamp) {
        status = 'IN_PROGRESS';
      }
    }

    return {
      id: s.id,
      stageName: s.stageName,
      timestamp: s.timestamp,
      formattedDate,
      formattedTime,
      actor: s.actor,
      note: s.note,
      metric: s.metric,
      durationFromPrevious: durationText,
      durationMinutesFromPrevious: durationMinutes,
      durationSecondsFromPrevious: durationSeconds,
      hasDirectPrevious,
      isInverted,
      status,
    };
  });

  // Calculate total duration accurately from Gate In to Gate Out
  const totalDuration = calculateDuration(tx.gateInTime, tx.gateOutTime);

  return {
    checkpoints,
    totalDuration,
  };
}
