// Mock the Supabase client before importing the slot service.
// The tests cover slot filtering, availability calculation, and timezone-sensitive expiry rules.
jest.mock('../src/lib/supabaseClient', () => ({
  from: jest.fn()
}));

const supabase = require('../src/lib/supabaseClient');
const { getAvailableSlotsByClinicId } = require('../src/modules/slots/slot.service');

// Minimal chainable query builder for the slot service's select/eq/order flow.
function createMockQuery(result) {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    order: jest.fn(() => query),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  };

  return query;
}

describe('getAvailableSlotsByClinicId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('throws when the clinic id is missing', async () => {
    await expect(getAvailableSlotsByClinicId()).rejects.toThrow('Clinic ID is required.');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('returns only bookable available slots with availability', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: [
          {
            id: 'slot-1',
            clinic_id: 'clinic-1',
            date: '2026-04-21',
            start_time: '08:00:00',
            end_time: '08:30:00',
            capacity: 5,
            booked_count: 2,
            status: 'available'
          },
          {
            id: 'slot-2',
            clinic_id: 'clinic-1',
            date: '2026-04-21',
            start_time: '09:00:00',
            end_time: '09:30:00',
            capacity: 2,
            booked_count: 2,
            status: 'available'
          }
        ],
        error: null
      })
    );

    const result = await getAvailableSlotsByClinicId(
      'clinic-1',
      new Date('2026-04-20T08:00:00.000Z')
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: 'slot-1',
        availability: 3
      })
    ]);
  });

  test('uses South Africa time consistently for same-day slot filtering', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: [
          {
            id: 'expired-slot',
            clinic_id: 'clinic-1',
            date: '2026-04-18',
            start_time: '00:00:00',
            end_time: '00:15:00',
            capacity: 3,
            booked_count: 0,
            status: 'available'
          },
          {
            id: 'upcoming-slot',
            clinic_id: 'clinic-1',
            date: '2026-04-18',
            start_time: '00:45:00',
            end_time: '01:15:00',
            capacity: 3,
            booked_count: 0,
            status: 'available'
          }
        ],
        error: null
      })
    );

    const result = await getAvailableSlotsByClinicId(
      'clinic-1',
      new Date('2026-04-17T22:30:00.000Z')
    );

    expect(result.map((slot) => slot.id)).toEqual(['upcoming-slot']);
  });

  test('throws when the slot query fails', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: null,
        error: { message: 'db failed' }
      })
    );

    await expect(
      getAvailableSlotsByClinicId('clinic-1', new Date('2026-04-20T08:00:00.000Z'))
    ).rejects.toThrow('db failed');
  });
});
