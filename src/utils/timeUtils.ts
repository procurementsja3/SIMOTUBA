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
  formattedTime: string;
  actor?: string;
  note?: string;
  metric?: string;
  durationFromPrevious?: string;
  durationMinutesFromPrevious?: number;
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

/**
 * Calculates duration between two formatted clock strings (e.g. "15.10.57" and "17.21.45").
 */
export function calculateFromFormattedTimes(timeInStr?: string, timeOutStr?: string): DurationResult | null {
  if (!timeInStr || !timeOutStr || timeInStr === '-' || timeOutStr === '-') return null;
  const t1 = extractTimeOfDay(timeInStr);
  const t2 = extractTimeOfDay(timeOutStr);
  if (!t1 || !t2) return null;

  let diffSec = t2.totalSeconds - t1.totalSeconds;
  if (diffSec < 0) {
    // Overnight turnaround (e.g. 23:00 to 01:00)
    diffSec += 86400;
  }

  const hours = Math.floor(diffSec / 3600);
  const remSec = diffSec % 3600;
  const minutes = Math.floor(remSec / 60);
  const seconds = remSec % 60;
  const totalMinutes = Math.floor(diffSec / 60);
  const hoursDecimal = Number((diffSec / 3600).toFixed(2));

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

  return {
    hours,
    minutes,
    seconds,
    totalMinutes,
    totalSeconds: diffSec,
    hoursDecimal,
    text,
    isOngoing: false,
  };
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

  // Method 1: Normalized epoch timestamp difference
  const startMs = getNormalizedTimestampMs(startTime);
  const endMs = endTime ? (getNormalizedTimestampMs(endTime) ?? Date.now()) : Date.now();

  if (startMs !== null && endMs !== null && endMs > startMs) {
    diffSeconds = Math.floor((endMs - startMs) / 1000);
  }

  // Method 2: If diffSeconds is 0 (or was negative) while endTime is present,
  // extract literal clock components (guarding against timezone & date discrepancies)
  if (diffSeconds <= 0 && endTime) {
    const fromClock = calculateFromFormattedTimes(startTime, endTime);
    if (fromClock && fromClock.totalSeconds > 0) {
      diffSeconds = fromClock.totalSeconds;
    }
  }

  // If ongoing and still 0, check real-time elapsed
  if (isOngoing && diffSeconds <= 0 && startMs) {
    diffSeconds = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
  }

  diffSeconds = Math.max(0, diffSeconds);
  const totalMinutes = Math.floor(diffSeconds / 60);
  const hours = Math.floor(diffSeconds / 3600);
  const remSecondsAfterHours = diffSeconds % 3600;
  const minutes = Math.floor(remSecondsAfterHours / 60);
  const seconds = remSecondsAfterHours % 60;
  const hoursDecimal = Number((diffSeconds / 3600).toFixed(2));

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
    totalSeconds: diffSeconds,
    hoursDecimal,
    text,
    isOngoing,
  };
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

  let prevTime: number | null = null;
  const checkpoints: TimelineCheckpoint[] = steps.map((s, index) => {
    let status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING' = 'PENDING';
    let durationText = '';
    let durationMinutes = 0;

    const formattedTime = formatClockTime(s.timestamp);

    if (s.timestamp) {
      status = 'COMPLETED';
      const currentTime = getNormalizedTimestampMs(s.timestamp) ?? new Date(s.timestamp).getTime();
      if (prevTime !== null) {
        let diffMs = currentTime - prevTime;
        if (diffMs <= 0) {
          const prevFormatted = steps[index - 1]?.timestamp ? formatClockTime(steps[index - 1].timestamp) : undefined;
          if (prevFormatted && prevFormatted !== '-' && formattedTime !== '-') {
            const fb = calculateFromFormattedTimes(prevFormatted, formattedTime);
            if (fb && fb.totalSeconds > 0) {
              diffMs = fb.totalSeconds * 1000;
            }
          }
        }
        durationMinutes = Math.max(0, Math.floor(diffMs / 60000));
        const hrs = Math.floor(durationMinutes / 60);
        const mins = durationMinutes % 60;
        durationText = hrs > 0 ? `+${hrs}j ${mins}m` : `+${mins} mnt`;
      }
      prevTime = currentTime;
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
      formattedTime,
      actor: s.actor,
      note: s.note,
      metric: s.metric,
      durationFromPrevious: durationText,
      durationMinutesFromPrevious: durationMinutes,
      status,
    };
  });

  // Calculate total duration
  let totalDuration = calculateDuration(tx.gateInTime, tx.gateOutTime);

  // Critical safeguard: Check checkpoint formatted times
  const firstCp = checkpoints[0];
  const lastCp = checkpoints[checkpoints.length - 1];
  const isFinished = tx.status === 'COMPLETED' || lastCp.status === 'COMPLETED';

  if (isFinished && firstCp.formattedTime !== '-' && lastCp.formattedTime !== '-') {
    if (totalDuration.totalSeconds <= 0 || totalDuration.totalMinutes === 0) {
      const fallbackDur = calculateFromFormattedTimes(firstCp.formattedTime, lastCp.formattedTime);
      if (fallbackDur && fallbackDur.totalSeconds > 0) {
        totalDuration = fallbackDur;
      }
    }
  }

  return {
    checkpoints,
    totalDuration,
  };
}
