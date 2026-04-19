/**
 * Shared slot date/time helpers.
 * These utilities keep slot filtering and template generation aligned to
 * South African local time instead of the server's timezone.
 */
const SOUTH_AFRICA_TIME_ZONE = 'Africa/Johannesburg';
const SOUTH_AFRICA_UTC_OFFSET = '+02:00';

// Build comparable YYYY-MM-DD and HH:MM:SS strings in the clinic timezone.
function getSouthAfricaDateTimeParts(now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: SOUTH_AFRICA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });

  const parts = formatter.formatToParts(now).reduce((result, part) => {
    if (part.type !== 'literal') {
      result[part.type] = part.value;
    }

    return result;
  }, {});

  return {
    today: `${parts.year}-${parts.month}-${parts.day}`,
    currentTime: `${parts.hour}:${parts.minute}:${parts.second}`
  };
}

// A slot is only bookable when it still has capacity and has not ended locally.
function isBookableSlot(slot, now = new Date()) {
  const remainingCapacity = Number(slot?.capacity || 0) - Number(slot?.booked_count || 0);

  if (remainingCapacity <= 0) {
    return false;
  }

  const { today, currentTime } = getSouthAfricaDateTimeParts(now);
  const slotDate = String(slot?.date || '');
  const slotEndTime = String(slot?.end_time || '');

  if (slotDate < today) {
    return false;
  }

  if (slotDate === today && slotEndTime <= currentTime) {
    return false;
  }

  return true;
}

// Parse YYYY-MM-DD strings explicitly so day arithmetic stays predictable.
function parseDateString(dateString) {
  const [year, month, day] = String(dateString || '')
    .split('-')
    .map((part) => Number(part));

  if (!year || !month || !day) {
    throw new Error('Invalid date string.');
  }

  return { year, month, day };
}

// Use UTC date arithmetic so calendar-day offsets do not drift with local DST logic.
function addDaysToDateString(dateString, dayOffset) {
  const { year, month, day } = parseDateString(dateString);
  const utcDate = new Date(Date.UTC(year, month - 1, day + dayOffset));

  return [
    utcDate.getUTCFullYear(),
    String(utcDate.getUTCMonth() + 1).padStart(2, '0'),
    String(utcDate.getUTCDate()).padStart(2, '0')
  ].join('-');
}

// Slot template generation uses day-of-week matching, so date parsing must stay stable.
function getDayOfWeekFromDateString(dateString) {
  const { year, month, day } = parseDateString(dateString);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

// Build Date objects that represent clinic-local timestamps for comparisons and inserts.
function createSouthAfricaDateTime(dateString, timeString = '00:00:00') {
  return new Date(`${dateString}T${timeString}${SOUTH_AFRICA_UTC_OFFSET}`);
}

module.exports = {
  SOUTH_AFRICA_TIME_ZONE,
  SOUTH_AFRICA_UTC_OFFSET,
  addDaysToDateString,
  createSouthAfricaDateTime,
  getDayOfWeekFromDateString,
  getSouthAfricaDateTimeParts,
  isBookableSlot
};
