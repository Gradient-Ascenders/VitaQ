const {
  DEFAULT_CONSULTATION_MINUTES,
  minutesBetween,
  getTimeBucket,
  roundToNearestFive,
  getValidHistoricalDurations,
  estimateAverageConsultationMinutes,
  calculatePredictedWaitMinutes
} = require('../src/modules/queue/queuePrediction.helper');

describe('queuePrediction.helper', () => {
  describe('minutesBetween', () => {
    test('calculates minutes between two valid timestamps', () => {
      const result = minutesBetween(
        '2026-04-30T08:00:00.000Z',
        '2026-04-30T08:25:00.000Z'
      );

      expect(result).toBe(25);
    });

    test('returns null when a timestamp is missing', () => {
      expect(minutesBetween(null, '2026-04-30T08:25:00.000Z')).toBeNull();
      expect(minutesBetween('2026-04-30T08:00:00.000Z', null)).toBeNull();
    });

    test('returns null when timestamps are invalid', () => {
      expect(minutesBetween('invalid-date', '2026-04-30T08:25:00.000Z')).toBeNull();
    });

    test('returns null when the end timestamp is before the start timestamp', () => {
      expect(
        minutesBetween('2026-04-30T09:00:00.000Z', '2026-04-30T08:00:00.000Z')
      ).toBeNull();
    });
  });

  describe('getTimeBucket', () => {
    test('returns morning before 12:00', () => {
      expect(getTimeBucket('2026-04-30T08:00:00.000Z')).toBe('morning');
    });

    test('returns afternoon from 12:00 to before 17:00', () => {
      expect(getTimeBucket('2026-04-30T13:00:00.000Z')).toBe('afternoon');
    });

    test('returns evening from 17:00 onwards', () => {
      expect(getTimeBucket('2026-04-30T18:00:00.000Z')).toBe('evening');
    });

    test('returns unknown for invalid dates', () => {
      expect(getTimeBucket('not-a-date')).toBe('unknown');
    });
  });

  describe('roundToNearestFive', () => {
    test('rounds wait time to the nearest five minutes', () => {
      expect(roundToNearestFive(12)).toBe(10);
      expect(roundToNearestFive(13)).toBe(15);
      expect(roundToNearestFive(28)).toBe(30);
    });

    test('does not return negative values', () => {
      expect(roundToNearestFive(-10)).toBe(0);
    });
  });

  describe('getValidHistoricalDurations', () => {
    test('keeps only rows with valid consultation durations', () => {
      const rows = [
        {
          id: 'valid-row',
          joined_at: '2026-04-30T08:00:00.000Z',
          consultation_started_at: '2026-04-30T08:15:00.000Z',
          completed_at: '2026-04-30T08:35:00.000Z'
        },
        {
          id: 'missing-completed-at',
          joined_at: '2026-04-30T08:00:00.000Z',
          consultation_started_at: '2026-04-30T08:15:00.000Z',
          completed_at: null
        },
        {
          id: 'unreasonable-duration',
          joined_at: '2026-04-30T08:00:00.000Z',
          consultation_started_at: '2026-04-30T08:15:00.000Z',
          completed_at: '2026-04-30T11:00:00.000Z'
        }
      ];

      const result = getValidHistoricalDurations(rows);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'valid-row',
        consultation_duration_minutes: 20,
        time_bucket: 'morning'
      });
    });
  });

  describe('estimateAverageConsultationMinutes', () => {
    test('uses same day and time bucket history when enough similar rows exist', () => {
        const historyRows = [
            {
            joined_at: '2026-04-16T06:00:00.000Z',
            consultation_started_at: '2026-04-16T06:05:00.000Z',
            completed_at: '2026-04-16T06:25:00.000Z'
            },
            {
            joined_at: '2026-04-16T07:00:00.000Z',
            consultation_started_at: '2026-04-16T07:05:00.000Z',
            completed_at: '2026-04-16T07:35:00.000Z'
            },
            {
            joined_at: '2026-04-16T08:00:00.000Z',
            consultation_started_at: '2026-04-16T08:05:00.000Z',
            completed_at: '2026-04-16T08:45:00.000Z'
            },
            {
            joined_at: '2026-04-16T18:00:00.000Z',
            consultation_started_at: '2026-04-16T18:05:00.000Z',
            completed_at: '2026-04-16T19:05:00.000Z'
            }
        ];

        const result = estimateAverageConsultationMinutes(historyRows, {
            joined_at: '2026-04-30T08:30:00.000Z'
        });

        expect(result).toEqual({
            averageConsultationMinutes: 30,
            basis: 'same_day_and_time_bucket_history',
            sampleSize: 3
        });
    });

    test('uses clinic-wide history when similar history is too small', () => {
      const historyRows = [
        {
          joined_at: '2026-04-28T08:00:00.000Z',
          consultation_started_at: '2026-04-28T08:05:00.000Z',
          completed_at: '2026-04-28T08:25:00.000Z'
        },
        {
          joined_at: '2026-04-29T13:00:00.000Z',
          consultation_started_at: '2026-04-29T13:05:00.000Z',
          completed_at: '2026-04-29T13:45:00.000Z'
        }
      ];

      const result = estimateAverageConsultationMinutes(historyRows, {
        joined_at: '2026-04-30T08:30:00.000Z'
      });

      expect(result).toEqual({
        averageConsultationMinutes: 30,
        basis: 'clinic_history',
        sampleSize: 2
      });
    });

    test('uses the default fallback when no valid history exists', () => {
      const result = estimateAverageConsultationMinutes([], {
        joined_at: '2026-04-30T08:30:00.000Z'
      });

      expect(result).toEqual({
        averageConsultationMinutes: DEFAULT_CONSULTATION_MINUTES,
        basis: 'default_fallback',
        sampleSize: 0
      });
    });
  });

  describe('calculatePredictedWaitMinutes', () => {
    test('returns zero when no patients are ahead', () => {
      const result = calculatePredictedWaitMinutes({
        activeEntriesAhead: [],
        averageConsultationMinutes: 20
      });

      expect(result).toEqual({
        predictedWaitMinutes: 0,
        waitingAhead: 0,
        inConsultationAhead: 0,
        activePatientsAhead: 0
      });
    });

    test('calculates wait time for one waiting patient ahead', () => {
      const result = calculatePredictedWaitMinutes({
        activeEntriesAhead: [{ status: 'waiting' }],
        averageConsultationMinutes: 20
      });

      expect(result).toEqual({
        predictedWaitMinutes: 20,
        waitingAhead: 1,
        inConsultationAhead: 0,
        activePatientsAhead: 1
      });
    });

    test('calculates wait time for waiting and in-consultation patients ahead', () => {
      const result = calculatePredictedWaitMinutes({
        activeEntriesAhead: [
          { status: 'waiting' },
          { status: 'waiting' },
          { status: 'in_consultation' }
        ],
        averageConsultationMinutes: 20
      });

      expect(result).toEqual({
        predictedWaitMinutes: 50,
        waitingAhead: 2,
        inConsultationAhead: 1,
        activePatientsAhead: 3
      });
    });

    test('ignores completed and cancelled entries if they are accidentally passed in', () => {
      const result = calculatePredictedWaitMinutes({
        activeEntriesAhead: [
          { status: 'waiting' },
          { status: 'complete' },
          { status: 'cancelled' }
        ],
        averageConsultationMinutes: 15
      });

      expect(result).toEqual({
        predictedWaitMinutes: 15,
        waitingAhead: 1,
        inConsultationAhead: 0,
        activePatientsAhead: 1
      });
    });
  });
});