// Mock the Supabase client before importing the admin service.
// This avoids real database calls during unit tests.
jest.mock('../src/lib/supabaseClient', () => ({
  from: jest.fn()
}));

const supabase = require('../src/lib/supabaseClient');

const {
  fetchPendingStaffRequests,
  reviewStaffRequest
} = require('../src/modules/admin/admin.service');

/**
 * Creates a fake Supabase query builder.
 * The methods return the same object to support Supabase-style chaining.
 */
function createMockQuery(result) {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    order: jest.fn(() => query),
    update: jest.fn(() => query),
    upsert: jest.fn(() => query),
    single: jest.fn(() => Promise.resolve(result)),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  };

  return query;
}

describe('fetchPendingStaffRequests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns pending staff requests', async () => {
    const pendingRequests = [
      {
        id: 'request-1',
        user_id: 'user-1',
        full_name: 'Tyron Test',
        clinic_id: 'clinic-1',
        clinic: {
          id: 'clinic-1',
          name: 'Khayelitsha Community Day Centre'
        },
        staff_id: 'STAFF-001',
        status: 'pending',
        reviewed_by: null,
        reviewed_at: null
      }
    ];

    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: pendingRequests,
        error: null
      })
    );

    const result = await fetchPendingStaffRequests();

    expect(result).toEqual(pendingRequests);
    expect(supabase.from).toHaveBeenCalledWith('staff_requests');
  });

  test('returns an empty array when there are no pending staff requests', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: null,
        error: null
      })
    );

    const result = await fetchPendingStaffRequests();

    expect(result).toEqual([]);
  });

  test('throws an error when the pending requests query fails', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: null,
        error: { message: 'Database unavailable' }
      })
    );

    await expect(fetchPendingStaffRequests()).rejects.toMatchObject({
      message: 'Failed to fetch pending staff requests.',
      statusCode: 500
    });
  });
});

describe('reviewStaffRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('throws an error when required fields are missing', async () => {
    await expect(
      reviewStaffRequest({
        requestId: 'request-1',
        adminId: 'admin-1'
      })
    ).rejects.toMatchObject({
      message: 'request_id, admin_id, and status are required.',
      statusCode: 400
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('throws an error when review status is invalid', async () => {
    await expect(
      reviewStaffRequest({
        requestId: 'request-1',
        adminId: 'admin-1',
        status: 'paused'
      })
    ).rejects.toMatchObject({
      message: 'Invalid staff request review status.',
      statusCode: 400
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('throws an error when the staff request does not exist', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: null,
        error: { message: 'No rows found' }
      })
    );

    await expect(
      reviewStaffRequest({
        requestId: 'request-1',
        adminId: 'admin-1',
        status: 'approved'
      })
    ).rejects.toMatchObject({
      message: 'Staff registration request not found.',
      statusCode: 404
    });
  });

  test('blocks review when the staff request is not pending', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: {
          id: 'request-1',
          user_id: 'user-1',
          clinic_id: 'clinic-1',
          staff_id: 'STAFF-001',
          status: 'approved'
        },
        error: null
      })
    );

    await expect(
      reviewStaffRequest({
        requestId: 'request-1',
        adminId: 'admin-1',
        status: 'rejected'
      })
    ).rejects.toMatchObject({
      message: 'Only pending staff requests can be reviewed.',
      statusCode: 409
    });
  });

  test('approves a pending request and updates the user profile to staff', async () => {
    const pendingRequest = {
      id: 'request-1',
      user_id: 'user-1',
      full_name: 'Tyron Test',
      clinic_id: 'clinic-1',
      staff_id: 'STAFF-001',
      status: 'pending',
      reviewed_by: null,
      reviewed_at: null
    };

    const approvedProfile = {
      user_id: 'user-1',
      role: 'staff',
      clinic_id: 'clinic-1',
      created_at: '2026-04-16T09:00:00Z',
      updated_at: '2026-04-16T10:00:00Z'
    };

    const approvedRequest = {
      ...pendingRequest,
      status: 'approved',
      reviewed_by: 'admin-1',
      reviewed_at: '2026-04-16T10:00:00Z'
    };

    supabase.from
      .mockReturnValueOnce(createMockQuery({ data: pendingRequest, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: approvedRequest, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: approvedProfile, error: null }));

    const result = await reviewStaffRequest({
      requestId: 'request-1',
      adminId: 'admin-1',
      status: 'approved'
    });

    expect(result.staff_request).toMatchObject({
      id: 'request-1',
      status: 'approved',
      reviewed_by: 'admin-1'
    });

    expect(result.profile).toMatchObject({
      user_id: 'user-1',
      role: 'staff',
      clinic_id: 'clinic-1'
    });

    expect(supabase.from).toHaveBeenCalledWith('staff_requests');
    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(supabase.from).toHaveBeenCalledTimes(3);
  });

  test('rejects a pending request without updating the user profile', async () => {
    const pendingRequest = {
      id: 'request-2',
      user_id: 'user-2',
      full_name: 'Rejected User',
      clinic_id: 'clinic-1',
      staff_id: 'STAFF-002',
      status: 'pending',
      reviewed_by: null,
      reviewed_at: null
    };

    const rejectedRequest = {
      ...pendingRequest,
      status: 'rejected',
      reviewed_by: 'admin-1',
      reviewed_at: '2026-04-16T10:00:00Z'
    };

    supabase.from
      .mockReturnValueOnce(createMockQuery({ data: pendingRequest, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: rejectedRequest, error: null }));

    const result = await reviewStaffRequest({
      requestId: 'request-2',
      adminId: 'admin-1',
      status: 'rejected'
    });

    expect(result.staff_request).toMatchObject({
      id: 'request-2',
      status: 'rejected',
      reviewed_by: 'admin-1'
    });

    expect(result.profile).toBeNull();
    expect(supabase.from).not.toHaveBeenCalledWith('profiles');
    expect(supabase.from).toHaveBeenCalledTimes(2);
  });

  test('throws an error when approval profile update fails', async () => {
    const pendingRequest = {
      id: 'request-1',
      user_id: 'user-1',
      clinic_id: 'clinic-1',
      staff_id: 'STAFF-001',
      status: 'pending'
    };

    const approvedRequest = {
      ...pendingRequest,
      status: 'approved',
      reviewed_by: 'admin-1',
      reviewed_at: '2026-04-16T10:00:00Z'
    };

    const approvedUpdateQuery = createMockQuery({ data: approvedRequest, error: null });
    const failedProfileQuery = createMockQuery({
      data: null,
      error: { message: 'Profile update failed' }
    });
    const rollbackQuery = createMockQuery({ data: null, error: null });

    supabase.from
      .mockReturnValueOnce(createMockQuery({ data: pendingRequest, error: null }))
      .mockReturnValueOnce(approvedUpdateQuery)
      .mockReturnValueOnce(failedProfileQuery)
      .mockReturnValueOnce(rollbackQuery);

    await expect(
      reviewStaffRequest({
        requestId: 'request-1',
        adminId: 'admin-1',
        status: 'approved'
      })
    ).rejects.toMatchObject({
      message: 'Failed to update approved staff profile.',
      statusCode: 500
    });

    expect(rollbackQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'pending',
        reviewed_by: null,
        reviewed_at: null
      })
    );
  });

  test('throws an error when approving the staff request row fails', async () => {
    const pendingRequest = {
      id: 'request-1',
      user_id: 'user-1',
      clinic_id: 'clinic-1',
      staff_id: 'STAFF-001',
      status: 'pending'
    };

    supabase.from
      .mockReturnValueOnce(createMockQuery({ data: pendingRequest, error: null }))
      .mockReturnValueOnce(
        createMockQuery({
          data: null,
          error: { message: 'Request update failed' }
        })
      );

    await expect(
      reviewStaffRequest({
        requestId: 'request-1',
        adminId: 'admin-1',
        status: 'approved'
      })
    ).rejects.toMatchObject({
      message: 'Failed to update staff registration request.',
      statusCode: 500
    });

    expect(supabase.from).not.toHaveBeenCalledWith('profiles');
    expect(supabase.from).toHaveBeenCalledTimes(2);
  });

  test('throws a combined error when profile update and rollback both fail', async () => {
    const pendingRequest = {
      id: 'request-1',
      user_id: 'user-1',
      clinic_id: 'clinic-1',
      staff_id: 'STAFF-001',
      status: 'pending'
    };

    const approvedRequest = {
      ...pendingRequest,
      status: 'approved',
      reviewed_by: 'admin-1',
      reviewed_at: '2026-04-16T10:00:00Z'
    };

    supabase.from
      .mockReturnValueOnce(createMockQuery({ data: pendingRequest, error: null }))
      .mockReturnValueOnce(createMockQuery({ data: approvedRequest, error: null }))
      .mockReturnValueOnce(
        createMockQuery({
          data: null,
          error: { message: 'Profile update failed' }
        })
      )
      .mockReturnValueOnce(
        createMockQuery({
          data: null,
          error: { message: 'Rollback update failed' }
        })
      );

    await expect(
      reviewStaffRequest({
        requestId: 'request-1',
        adminId: 'admin-1',
        status: 'approved'
      })
    ).rejects.toMatchObject({
      message:
        'Failed to update approved staff profile. Rollback also failed: Failed to restore the staff registration request after approval failed.',
      statusCode: 500
    });
  });
});
