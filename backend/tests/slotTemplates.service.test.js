// Mock the Supabase client before importing the slot template service.
// These tests exercise template validation plus slot generation from weekly patterns.
jest.mock('../src/lib/supabaseClient', () => ({
  from: jest.fn()
}));

const supabase = require('../src/lib/supabaseClient');
const {
  createSlotTemplateForStaff,
  deleteSlotTemplateForStaff,
  generateUpcomingSlotsForStaff,
  listSlotTemplatesForStaff,
  updateSlotTemplateForStaff
} = require('../src/modules/staff/slotTemplates.service');

// The service uses chained selects, updates, deletes, and inserts,
// so tests share one fake Supabase query builder shape.
function createMockQuery(result) {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    gte: jest.fn(() => query),
    lte: jest.fn(() => query),
    order: jest.fn(() => query),
    insert: jest.fn(() => query),
    update: jest.fn(() => query),
    delete: jest.fn(() => query),
    single: jest.fn(() => Promise.resolve(result)),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  };

  return query;
}

// Approved staff access now comes from the profiles table,
// so every successful staff-access mock must include role: 'staff' and clinic_id.
function createApprovedStaffProfile(overrides = {}) {
  return {
    user_id: 'staff-1',
    role: 'staff',
    clinic_id: 'clinic-1',
    ...overrides
  };
}

describe('slotTemplates.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('lists slot templates for the approved staff clinic', async () => {
    supabase.from
      .mockReturnValueOnce(
        createMockQuery({
          data: createApprovedStaffProfile(),
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
          data: createApprovedStaffProfile(),
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
          data: createApprovedStaffProfile(),
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
          data: createApprovedStaffProfile(),
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
          data: createApprovedStaffProfile(),
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

  test('rejects staff without an assigned staff profile', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: {
          user_id: 'staff-1',
          role: 'patient',
          clinic_id: null
        },
        error: null
      })
    );

    await expect(
      listSlotTemplatesForStaff({ staffUserId: 'staff-1' })
    ).rejects.toMatchObject({
      message: 'Approved staff access with an assigned clinic is required.',
      statusCode: 403
    });
  });

  test('rejects invalid slot template input values', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: createApprovedStaffProfile(),
        error: null
      })
    );

    await expect(
      createSlotTemplateForStaff({
        staffUserId: 'staff-1',
        dayOfWeek: 9,
        startTime: '08:00',
        endTime: '08:30',
        capacity: 5,
        status: 'active'
      })
    ).rejects.toMatchObject({
      message: 'day_of_week, start_time, end_time, capacity, and status must be valid values.',
      statusCode: 400
    });
  });

  test('rejects slot template where start time is not before end time', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: createApprovedStaffProfile(),
        error: null
      })
    );

    await expect(
      createSlotTemplateForStaff({
        staffUserId: 'staff-1',
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '08:30',
        capacity: 5,
        status: 'active'
      })
    ).rejects.toMatchObject({
      message: 'start_time must be earlier than end_time.',
      statusCode: 400
    });
  });

  test('updates a slot template for the staff clinic', async () => {
    supabase.from
      .mockReturnValueOnce(
        createMockQuery({
          data: createApprovedStaffProfile(),
          error: null
        })
      )
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
      )
      .mockReturnValueOnce(createMockQuery({ data: [], error: null }))
      .mockReturnValueOnce(
        createMockQuery({
          data: {
            id: 'template-1',
            clinic_id: 'clinic-1',
            day_of_week: 1,
            start_time: '08:00:00',
            end_time: '09:00:00',
            capacity: 6,
            status: 'active'
          },
          error: null
        })
      );

    const result = await updateSlotTemplateForStaff({
      staffUserId: 'staff-1',
      templateId: 'template-1',
      endTime: '09:00',
      capacity: 6
    });

    expect(result).toMatchObject({
      id: 'template-1',
      end_time: '09:00:00',
      capacity: 6
    });
  });

  test('rejects slot template updates with no fields', async () => {
    await expect(
      updateSlotTemplateForStaff({
        staffUserId: 'staff-1',
        templateId: 'template-1'
      })
    ).rejects.toMatchObject({
      message: 'At least one slot template field must be provided.',
      statusCode: 400
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('deletes a slot template for the staff clinic', async () => {
    supabase.from
      .mockReturnValueOnce(
        createMockQuery({
          data: createApprovedStaffProfile(),
          error: null
        })
      )
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
      )
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

    const result = await deleteSlotTemplateForStaff({
      staffUserId: 'staff-1',
      templateId: 'template-1'
    });

    expect(result).toMatchObject({
      id: 'template-1',
      clinic_id: 'clinic-1'
    });
  });

  test('blocks deleting a slot template from another clinic', async () => {
    supabase.from
      .mockReturnValueOnce(
        createMockQuery({
          data: createApprovedStaffProfile(),
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
      deleteSlotTemplateForStaff({
        staffUserId: 'staff-1',
        templateId: 'template-1'
      })
    ).rejects.toMatchObject({
      message: 'You can only manage slot templates for your assigned clinic.',
      statusCode: 403
    });
  });

  test('returns zero generated slots when there are no active templates', async () => {
    supabase.from
      .mockReturnValueOnce(
        createMockQuery({
          data: createApprovedStaffProfile(),
          error: null
        })
      )
      .mockReturnValueOnce(
        createMockQuery({
          data: [],
          error: null
        })
      );

    const result = await generateUpcomingSlotsForStaff({
      staffUserId: 'staff-1',
      daysAhead: 7,
      now: new Date('2026-04-20T06:00:00.000Z')
    });

    expect(result).toMatchObject({
      clinic_id: 'clinic-1',
      template_count: 0,
      created: 0,
      skipped_existing: 0
    });
  });

  test('rejects invalid slot generation horizon', async () => {
    await expect(
      generateUpcomingSlotsForStaff({
        staffUserId: 'staff-1',
        daysAhead: 40
      })
    ).rejects.toMatchObject({
      message: 'days_ahead must be an integer between 1 and 31.',
      statusCode: 400
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('throws when generated slot insert fails', async () => {
    const dayOfWeekToday = new Date(Date.UTC(2026, 3, 20)).getUTCDay();

    supabase.from
      .mockReturnValueOnce(
        createMockQuery({
          data: createApprovedStaffProfile(),
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
          data: [],
          error: null
        })
      )
      .mockReturnValueOnce(
        createMockQuery({
          data: null,
          error: { message: 'Insert failed' }
        })
      );

    await expect(
      generateUpcomingSlotsForStaff({
        staffUserId: 'staff-1',
        daysAhead: 1,
        now: new Date('2026-04-20T06:00:00.000Z')
      })
    ).rejects.toMatchObject({
      message: 'Failed to generate appointment slots.',
      statusCode: 500
    });
  });
});