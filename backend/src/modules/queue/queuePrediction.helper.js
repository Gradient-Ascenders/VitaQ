const DEFAULT_CONSULTATION_MINUTES = 15;
const MIN_HISTORY_ROWS_FOR_SIMILAR_BUCKET = 3;
const MAX_REASONABLE_CONSULTATION_MINUTES = 120;

/**
 * Calculates the number of full minutes between two timestamp values.
 * Returns null when either timestamp is missing, invalid, or backwards.
 */
function minutesBetween(start, end) {
  if (!start || !end) {
    return null;
  }

  const startDate = new Date(start);
  const endDate = new Date(end);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null;
  }

  const minutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);

  return minutes > 0 ? minutes : null;
}

/**
 * Groups a queue entry into a simple time-of-day bucket.
 * This keeps the prediction explainable for Sprint 3.
 */
function getTimeBucket(dateValue) {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return 'unknown';
  }

  const hour = date.getHours();

  if (hour < 12) {
    return 'morning';
  }

  if (hour < 17) {
    return 'afternoon';
  }

  return 'evening';
}

/**
 * Returns the day of the week for a timestamp.
 * Sunday = 0, Monday = 1, etc.
 */
function getDayOfWeek(dateValue) {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.getDay();
}

/**
 * Rounds to the nearest 5 minutes so the prediction does not look falsely exact.
 */
function roundToNearestFive(minutes) {
  return Math.max(0, Math.round(minutes / 5) * 5);
}

/**
 * Converts completed queue entries into valid historical consultation-duration rows.
 * Bad rows are ignored so one broken timestamp does not distort the estimate.
 */
function getValidHistoricalDurations(historyRows = []) {
  return historyRows
    .map((row) => {
      const consultationDurationMinutes = minutesBetween(
        row.consultation_started_at,
        row.completed_at
      );

      const referenceDate = row.joined_at || row.created_at || row.queue_date;

      return {
        ...row,
        consultation_duration_minutes: consultationDurationMinutes,
        day_of_week: getDayOfWeek(referenceDate),
        time_bucket: getTimeBucket(referenceDate)
      };
    })
    .filter((row) => {
      return (
        row.consultation_duration_minutes &&
        row.consultation_duration_minutes <= MAX_REASONABLE_CONSULTATION_MINUTES
      );
    });
}

/**
 * Calculates the rounded average of a numeric list.
 */
function average(values) {
  if (!values.length) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);

  return Math.round(total / values.length);
}

/**
 * Chooses the best available historical average.
 *
 * Priority:
 * 1. Same day-of-week and same time bucket history
 * 2. General clinic history
 * 3. Default fallback
 */
function estimateAverageConsultationMinutes(historyRows = [], targetQueueEntry = {}) {
  const validRows = getValidHistoricalDurations(historyRows);

  const targetDate =
    targetQueueEntry.joined_at ||
    targetQueueEntry.created_at ||
    targetQueueEntry.queue_date;

  const targetDayOfWeek = getDayOfWeek(targetDate);
  const targetTimeBucket = getTimeBucket(targetDate);

  const similarRows = validRows.filter((row) => {
    return row.day_of_week === targetDayOfWeek && row.time_bucket === targetTimeBucket;
  });

  if (similarRows.length >= MIN_HISTORY_ROWS_FOR_SIMILAR_BUCKET) {
    return {
      averageConsultationMinutes: average(
        similarRows.map((row) => row.consultation_duration_minutes)
      ),
      basis: 'same_day_and_time_bucket_history',
      sampleSize: similarRows.length
    };
  }

  if (validRows.length > 0) {
    return {
      averageConsultationMinutes: average(
        validRows.map((row) => row.consultation_duration_minutes)
      ),
      basis: 'clinic_history',
      sampleSize: validRows.length
    };
  }

  return {
    averageConsultationMinutes: DEFAULT_CONSULTATION_MINUTES,
    basis: 'default_fallback',
    sampleSize: 0
  };
}

/**
 * Main Sprint 3 prediction formula.
 *
 * Waiting patients ahead count as a full average consultation.
 * Patients already in consultation count as half, because part of their visit may already be done.
 */
function calculatePredictedWaitMinutes({
  activeEntriesAhead = [],
  averageConsultationMinutes = DEFAULT_CONSULTATION_MINUTES
}) {
  const waitingAhead = activeEntriesAhead.filter((entry) => entry.status === 'waiting').length;

  const inConsultationAhead = activeEntriesAhead.filter(
    (entry) => entry.status === 'in_consultation'
  ).length;

  const rawEstimate =
    waitingAhead * averageConsultationMinutes +
    inConsultationAhead * averageConsultationMinutes * 0.5;

  return {
    predictedWaitMinutes: roundToNearestFive(rawEstimate),
    waitingAhead,
    inConsultationAhead,
    activePatientsAhead: waitingAhead + inConsultationAhead
  };
}

module.exports = {
  DEFAULT_CONSULTATION_MINUTES,
  minutesBetween,
  getTimeBucket,
  getDayOfWeek,
  roundToNearestFive,
  getValidHistoricalDurations,
  estimateAverageConsultationMinutes,
  calculatePredictedWaitMinutes
};