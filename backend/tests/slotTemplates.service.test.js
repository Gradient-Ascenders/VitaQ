jest.mock('../src/lib/supabaseClient', () => ({
  from: jest.fn()
}));

const supabase = require('../src/lib/supabaseClient');
const {
  createSlotTemplateForStaff,
  generateUpcomingSlotsForStaff,
  listSlotTemplatesForStaff,
  updateSlotTemplateForStaff
} = require('../src/modules/staff/slotTemplates.service');

function createMockQuery(result) {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    gte: jest.fn(() => query),
    lte: jest.fn(() => query),
    order: jest.fn(() => query),
    insert: jest.fn(() => query),
    update: jest.fn(() => query),
    single: jest.fn(() => Promise.resolve(result)),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  };

  return query;
}

describe('slotTemplates.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('lists slot templates for the approved staff clinic', async () => {
    supabase.from
      .mockReturnValueOnce(
        createMockQuery({
          data: {
            id: 'staff-request-1',
            user_id: 'staff-1',
            clinic_id: 'clinic-1',
            status: 'approved'
          },
          error: null
        })
      )
      .mockReturnValueOnce(
        createMockQuery({
          data: [
            {
              id: 'template-1',
              clinic_id: 'clinic-1',
              day_of_week: 1,
              start_time: '08:00:00',
              end_time: '08:30:00',
              capacity: 5,
              status: 'active'
            }
          ],
          error: null
        })
      );

    const result = await listSlotTemplatesForStaff({ staffUserId: 'staff-1' });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('template-1');
  });

  test('creates a normalized slot template for the staff clinic', async () => {
    supabase.from
      .mockReturnValueOnce(
        createMockQuery({
          data: {
            id: 'staff-request-1',
            user_id: 'staff-1',
            clinic_id: 'clinic-1',
            status: 'approved'
          },
          error: null
        })
      )
      .mockReturnValueOnce(createMockQuery({ data: [], error: null }))
      .mockReturnValueOnce(
        createMockQuery({
          data: {
            id: 'template-1',
            clinic_id: 'clinic-1',
            day_of_week: 1,
            start_time: '08:00:00',
            end_time: '08:30:00',
            capacity: 5,
            status: 'active'
          },
          error: null
        })
      );

    const result = await createSlotTemplateForStaff({
      staffUserId: 'staff-1',
      dayOfWeek: 1,
      startTime: '08:00',
      endTime: '08:30',
      capacity: 5,
      status: 'active'
    });

    expect(result).toMatchObject({
      id: 'template-1',
      clinic_id: 'clinic-1',
      start_time: '08:00:00',
      end_time: '08:30:00'
    });
  });

  test('rejects overlapping slot templates for the same clinic day', async () => {
    supabase.from
      .mockReturnValueOnce(
        createMockQuery({
          data: {
            id: 'staff-request-1',
            user_id: 'staff-1',
            clinic_id: 'clinic-1',
            status: 'approved'
          },
          error: null
        })
      )
      .mockReturnValueOnce(
        createMockQuery({
          data: [
            {
              id: 'template-existing',
              start_time: '08:00:00',
              end_time: '09:00:00'
            }
          ],
          error: null
        })
      );

    await expect(
      createSlotTemplateForStaff({
        staffUserId: 'staff-1',
        dayOfWeek: 1,
        startTime: '08:30',
        endTime: '09:30',
        capacity: 5,
        status: 'active'
      })
    ).rejects.toMatchObject({
      message: 'This slot template overlaps with an existing template for the same day.',
      statusCode: 409
    });
  });

  test('blocks template updates for a different clinic', async () => {
    supabase.from
      .mockReturnValueOnce(
        createMockQuery({
          data: {
            id: 'staff-request-1',
            user_id: 'staff-1',
            clinic_id: 'clinic-1',
            status: 'approved'
          },
          error: null
        })
      )
      .mockReturnValueOnce(
        createMockQuery({
          data: {
            id: 'template-1',
            clinic_id: 'clinic-2',
            day_of_week: 1,
            start_time: '08:00:00',
            end_time: '08:30:00',
            capacity: 5,
            status: 'active'
          },
          error: null
        })
      );

    await expect(
      updateSlotTemplateForStaff({
        staffUserId: 'staff-1',
        templateId: 'template-1',
        capacity: 6
      })
    ).rejects.toMatchObject({
      message: 'You can only manage slot templates for your assigned clinic.',
      statusCode: 403
    });
  });

  test('generates missing slots and skips existing ones for the next horizon', async () => {
    const dayOfWeekToday = new Date(Date.UTC(2026, 3, 20)).getUTCDay();

    supabase.from
      .mockReturnValueOnce(
        createMockQuery({
          data: {
            id: 'staff-request-1',
            user_id: 'staff-1',
            clinic_id: 'clinic-1',
            status: 'approved'
          },
          error: null
        })
      )
      .mockReturnValueOnce(
        createMockQuery({
          data: [
            {
              id: 'template-1',
              clinic_id: 'clinic-1',
              day_of_week: dayOfWeekToday,
              start_time: '08:00:00',
              end_time: '08:30:00',
              capacity: 5,
              status: 'active'
            }
          ],
          error: null
        })
      )
      .mockReturnValueOnce(
        createMockQuery({
          data: [
            {
              clinic_id: 'clinic-1',
              date: '2026-04-20',
              start_time: '08:00:00',
              end_time: '08:30:00'
            }
          ],
          error: null
        })
      )
      .mockReturnValueOnce(
        createMockQuery({
          data: [{ id: 'slot-new' }],
          error: null
        })
      );

    const result = await generateUpcomingSlotsForStaff({
      staffUserId: 'staff-1',
      daysAhead: 8,
      now: new Date('2026-04-20T06:00:00.000Z')
    });

    expect(result).toMatchObject({
      clinic_id: 'clinic-1',
      template_count: 1,
      created: 1,
      skipped_existing: 1
    });
  });
});
