const SOUTH_AFRICA_TIME_ZONE = 'Africa/Johannesburg';

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

module.exports = {
  getSouthAfricaDateTimeParts,
  isBookableSlot
};
