const {
  SOUTH_AFRICA_UTC_OFFSET,
  addDaysToDateString,
  createSouthAfricaDateTime,
  getDayOfWeekFromDateString,
  getSouthAfricaDateTimeParts,
  isBookableSlot
} = require('../src/modules/slots/slotAvailability');

describe('slotAvailability helpers', () => {
  test('gets South Africa date and time parts from a UTC date', () => {
    const result = getSouthAfricaDateTimeParts(
      new Date('2026-04-20T06:30:15.000Z')
    );

    expect(result).toEqual({
      today: '2026-04-20',
      currentTime: '08:30:15'
    });
  });

  test('returns false when a slot has no remaining capacity', () => {
    const result = isBookableSlot(
      {
        date: '2026-04-20',
        end_time: '10:00:00',
        capacity: 2,
        booked_count: 2
      },
      new Date('2026-04-20T06:00:00.000Z')
    );

    expect(result).toBe(false);
  });

  test('returns false when a slot date is in the past', () => {
    const result = isBookableSlot(
      {
        date: '2026-04-19',
        end_time: '10:00:00',
        capacity: 2,
        booked_count: 0
      },
      new Date('2026-04-20T06:00:00.000Z')
    );

    expect(result).toBe(false);
  });

  test('returns false when a same-day slot has already ended', () => {
    const result = isBookableSlot(
      {
        date: '2026-04-20',
        end_time: '07:30:00',
        capacity: 2,
        booked_count: 0
      },
      new Date('2026-04-20T06:00:00.000Z') // 08:00 in South Africa
    );

    expect(result).toBe(false);
  });

  test('returns true when a slot is still available and has capacity', () => {
    const result = isBookableSlot(
      {
        date: '2026-04-20',
        end_time: '09:30:00',
        capacity: 2,
        booked_count: 1
      },
      new Date('2026-04-20T06:00:00.000Z') // 08:00 in South Africa
    );

    expect(result).toBe(true);
  });

  test('adds days to a date string without timezone drift', () => {
    expect(addDaysToDateString('2026-04-20', 10)).toBe('2026-04-30');
    expect(addDaysToDateString('2026-12-30', 3)).toBe('2027-01-02');
  });

  test('gets the correct day of week from a date string', () => {
    // 2026-04-20 is a Monday, and JavaScript getUTCDay() returns Monday as 1.
    expect(getDayOfWeekFromDateString('2026-04-20')).toBe(1);
  });

  test('throws when date string is invalid', () => {
    expect(() => addDaysToDateString('bad-date', 1)).toThrow('Invalid date string.');
    expect(() => getDayOfWeekFromDateString('', 1)).toThrow('Invalid date string.');
  });

  test('creates a South Africa local datetime using the expected UTC offset', () => {
    const result = createSouthAfricaDateTime('2026-04-20', '08:30:00');

    expect(SOUTH_AFRICA_UTC_OFFSET).toBe('+02:00');
    expect(result.toISOString()).toBe('2026-04-20T06:30:00.000Z');
  });
});