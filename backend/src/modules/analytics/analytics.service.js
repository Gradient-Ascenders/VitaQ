const supabase = require('../../lib/supabaseClient');

/**
 * Creates a service error with an HTTP status code.
 * Controllers use statusCode to return the correct response status.
 */
function createServiceError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * Converts a value into a number, while safely rejecting null/empty values.
 * Supabase numeric values can sometimes come back as strings, so this keeps
 * the calculations consistent.
 */
function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}

/**
 * Rounds dashboard values to two decimals.
 * This matches the analytics SQL view style and keeps frontend cards readable.
 */
function roundToTwo(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Returns an average from a total and count.
 * Empty datasets should show 0 instead of NaN.
 */
function average(total, count) {
  if (!count) {
    return 0;
  }

  return roundToTwo(total / count);
}

/**
 * Validates YYYY-MM-DD date strings.
 * This prevents broken filters from being sent to Supabase queries.
 */
function validateDateFilter(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const trimmedValue = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmedValue);

  if (!match) {
    throw createServiceError(`${fieldName} must be in YYYY-MM-DD format.`, 400);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  const isRealDate =
    parsedDate.getUTCFullYear() === year &&
    parsedDate.getUTCMonth() === month - 1 &&
    parsedDate.getUTCDate() === day;

  if (!isRealDate) {
    throw createServiceError(`${fieldName} must be a valid date.`, 400);
  }

  return trimmedValue;
}

/**
 * Normalizes the optional clinic filter.
 * The frontend can send empty string or "all" when no clinic is selected.
 */
function normalizeClinicId(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmedValue = String(value).trim();

  if (!trimmedValue || trimmedValue.toLowerCase() === 'all') {
    return null;
  }

  return trimmedValue;
}

/**
 * Validates the optional hour filter.
 * joined_hour comes from the SQL view as a clinic-local Johannesburg hour.
 */
function normalizeHourFilter(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const trimmedValue = String(value).trim();

  if (!trimmedValue || trimmedValue.toLowerCase() === 'all') {
    return null;
  }

  const hour = Number(trimmedValue);

  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw createServiceError('hour must be a whole number between 0 and 23.', 400);
  }

  return hour;
}

/**
 * Validates and normalizes all wait-time analytics filters.
 */
function normalizeWaitTimeFilters(filters = {}) {
  const clinicId = normalizeClinicId(filters.clinicId);
  const startDate = validateDateFilter(filters.startDate, 'startDate');
  const endDate = validateDateFilter(filters.endDate, 'endDate');
  const hour = normalizeHourFilter(filters.hour);

  if (startDate && endDate && startDate > endDate) {
    throw createServiceError('startDate cannot be after endDate.', 400);
  }

  return {
    clinicId,
    startDate,
    endDate,
    hour
  };
}

/**
 * Converts a raw analytics view row into a safe calculation row.
 * Invalid rows are ignored defensively, although the SQL view should already
 * filter out incomplete or invalid timing records.
 */
function normalizeAnalyticsRow(row) {
  const waitMinutes = toFiniteNumber(row?.wait_minutes);
  const consultationMinutes = toFiniteNumber(row?.consultation_minutes);
  const joinedHour = toFiniteNumber(row?.joined_hour);

  if (waitMinutes === null || consultationMinutes === null) {
    return null;
  }

  return {
    queueEntryId: row.queue_entry_id,
    clinicId: row.clinic_id,
    clinicName: row.clinic_name || 'Unknown clinic',
    queueDate: row.queue_date,
    joinedHour,
    waitMinutes,
    consultationMinutes
  };
}

/**
 * Adds one row to a grouping bucket.
 * This is reused for clinic, date, and hour grouping.
 */
function addGroupedRow(groupMap, key, seedValues, row) {
  if (key === null || key === undefined || key === '') {
    return;
  }

  if (!groupMap.has(key)) {
    groupMap.set(key, {
      ...seedValues,
      completedQueueCount: 0,
      totalWaitMinutes: 0,
      totalConsultationMinutes: 0
    });
  }

  const group = groupMap.get(key);

  group.completedQueueCount += 1;
  group.totalWaitMinutes += row.waitMinutes;
  group.totalConsultationMinutes += row.consultationMinutes;
}

/**
 * Converts grouped totals into frontend-friendly average values.
 */
function finalizeGroup(group) {
  return {
    ...group,
    averageWaitMinutes: average(group.totalWaitMinutes, group.completedQueueCount),
    averageConsultationMinutes: average(
      group.totalConsultationMinutes,
      group.completedQueueCount
    ),
    totalWaitMinutes: undefined,
    totalConsultationMinutes: undefined
  };
}

/**
 * Builds the full wait-time analytics response.
 * The frontend gets summary cards plus grouped data for tables/charts.
 */
function buildWaitTimeAnalyticsResponse(rows) {
  const clinicGroups = new Map();
  const hourGroups = new Map();
  const dateGroups = new Map();

  let completedQueueCount = 0;
  let totalWaitMinutes = 0;
  let totalConsultationMinutes = 0;

  rows.forEach((row) => {
    completedQueueCount += 1;
    totalWaitMinutes += row.waitMinutes;
    totalConsultationMinutes += row.consultationMinutes;

    addGroupedRow(
      clinicGroups,
      row.clinicId,
      {
        clinicId: row.clinicId,
        clinicName: row.clinicName
      },
      row
    );

    addGroupedRow(
      hourGroups,
      row.joinedHour,
      {
        hour: row.joinedHour
      },
      row
    );

    addGroupedRow(
      dateGroups,
      row.queueDate,
      {
        date: row.queueDate
      },
      row
    );
  });

  return {
    averageWaitMinutes: average(totalWaitMinutes, completedQueueCount),
    averageConsultationMinutes: average(totalConsultationMinutes, completedQueueCount),
    completedQueueCount,
    byClinic: Array.from(clinicGroups.values())
      .map(finalizeGroup)
      .sort((left, right) => String(left.clinicName).localeCompare(String(right.clinicName))),
    byHour: Array.from(hourGroups.values())
      .map(finalizeGroup)
      .sort((left, right) => left.hour - right.hour),
    byDate: Array.from(dateGroups.values())
      .map(finalizeGroup)
      .sort((left, right) => String(left.date).localeCompare(String(right.date)))
  };
}

/**
 * Fetches wait-time analytics from the SQL analytics view.
 * Filters are applied at database query level, then grouping is calculated
 * here so the response stays flexible for frontend dashboard needs.
 */
async function fetchWaitTimeAnalytics(filters = {}) {
  const normalizedFilters = normalizeWaitTimeFilters(filters);

  let query = supabase
    .from('analytics_wait_time_events')
    .select(`
      queue_entry_id,
      clinic_id,
      clinic_name,
      queue_date,
      joined_hour,
      wait_minutes,
      consultation_minutes
    `);

  if (normalizedFilters.clinicId) {
    query = query.eq('clinic_id', normalizedFilters.clinicId);
  }

  if (normalizedFilters.startDate) {
    query = query.gte('queue_date', normalizedFilters.startDate);
  }

  if (normalizedFilters.endDate) {
    query = query.lte('queue_date', normalizedFilters.endDate);
  }

  if (normalizedFilters.hour !== null) {
    query = query.eq('joined_hour', normalizedFilters.hour);
  }

  query = query
    .order('queue_date', { ascending: true })
    .order('joined_hour', { ascending: true });

  const { data, error } = await query;

  if (error) {
    throw createServiceError('Failed to fetch wait-time analytics.', 500);
  }

  const rows = (Array.isArray(data) ? data : [])
    .map(normalizeAnalyticsRow)
    .filter(Boolean);

  return buildWaitTimeAnalyticsResponse(rows);
}

module.exports = {
  fetchWaitTimeAnalytics
};