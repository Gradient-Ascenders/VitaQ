// Mock the Supabase client before importing the admin service.
// This avoids real database calls during unit tests.
jest.mock('../src/lib/supabaseClient', () => ({
  from: jest.fn()
}));

const supabase = require('../src/lib/supabaseClient');

const {
  fetchPendingStaffRequests,
  reviewStaffRequest,
  fetchAdminClinics,
  fetchAdminClinicById,
  updateAdminClinic
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

describe('fetchAdminClinics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns clinics for admin management, including inactive clinics', async () => {
    const clinics = [
      {
        id: 'clinic-1',
        name: 'Hillbrow Clinic',
        province: 'Gauteng',
        district: 'Johannesburg',
        municipality: 'City of Johannesburg',
        region: 'Johannesburg Metro',
        facility_type: 'Clinic',
        is_active: true,
        updated_at: '2026-04-29T10:00:00.000Z'
      },
      {
        id: 'clinic-2',
        name: 'Orange Farm Clinic',
        province: 'Gauteng',
        district: 'Johannesburg',
        municipality: 'City of Johannesburg',
        region: 'Johannesburg South',
        facility_type: 'Community Health Centre',
        is_active: false,
        updated_at: '2026-04-28T08:00:00.000Z'
      }
    ];

    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: clinics,
        error: null
      })
    );

    const result = await fetchAdminClinics();

    expect(result).toEqual(clinics);
    expect(supabase.from).toHaveBeenCalledWith('clinics');
  });

  test('throws an error when admin clinic list loading fails', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: null,
        error: { message: 'Query failed' }
      })
    );

    await expect(fetchAdminClinics()).rejects.toMatchObject({
      message: 'Failed to fetch clinics for admin management.',
      statusCode: 500
    });
  });
});

describe('fetchAdminClinicById', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns one normalized clinic record', async () => {
    const clinic = {
      id: 'clinic-1',
      name: 'Hillbrow Clinic',
      province: 'Gauteng',
      district: 'Johannesburg',
      area: null,
      municipality: 'City of Johannesburg',
      region: 'Johannesburg Metro',
      facility_type: 'Clinic',
      address: null,
      services_offered: 'Primary Care',
      latitude: -26.2041,
      longitude: 28.0473,
      contact_website: null,
      contact_number: '011 123 4567',
      contact_email: null,
      is_active: false,
      source_dataset: 'dataset.csv',
      source_record_id: 'row-1',
      source_last_updated: null,
      created_at: '2026-04-20T10:00:00.000Z',
      updated_at: '2026-04-25T10:00:00.000Z'
    };

    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: clinic,
        error: null
      })
    );

    const result = await fetchAdminClinicById('clinic-1');

    expect(result).toEqual({
      id: 'clinic-1',
      name: 'Hillbrow Clinic',
      province: 'Gauteng',
      district: 'Johannesburg',
      area: '',
      municipality: 'City of Johannesburg',
      region: 'Johannesburg Metro',
      facility_type: 'Clinic',
      address: '',
      services_offered: 'Primary Care',
      latitude: -26.2041,
      longitude: 28.0473,
      contact_website: '',
      contact_number: '011 123 4567',
      contact_email: '',
      is_active: false,
      source_dataset: 'dataset.csv',
      source_record_id: 'row-1',
      source_last_updated: null,
      created_at: '2026-04-20T10:00:00.000Z',
      updated_at: '2026-04-25T10:00:00.000Z'
    });
  });

  test('returns 404 when the clinic does not exist', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' }
      })
    );

    await expect(fetchAdminClinicById('missing-clinic')).rejects.toMatchObject({
      message: 'Clinic not found.',
      statusCode: 404
    });
  });
});

describe('updateAdminClinic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('updates supported clinic fields and trims optional text values', async () => {
    const updatedClinic = {
      id: 'clinic-1',
      name: 'Updated Clinic',
      province: 'Gauteng',
      district: 'Johannesburg',
      area: 'Hillbrow',
      municipality: 'City of Johannesburg',
      region: 'Johannesburg Metro',
      facility_type: 'Clinic',
      address: '12 Claim Street',
      services_offered: 'Primary Care;Immunisation',
      latitude: -26.2041,
      longitude: 28.0473,
      contact_website: 'https://clinic.example.org',
      contact_number: '011 123 4567',
      contact_email: 'admin@clinic.org',
      is_active: true,
      source_dataset: 'dataset.csv',
      source_record_id: 'row-1',
      source_last_updated: '2026-04-10T00:00:00.000Z',
      created_at: '2026-04-20T10:00:00.000Z',
      updated_at: '2026-04-29T12:00:00.000Z'
    };

    const updateQuery = createMockQuery({
      data: updatedClinic,
      error: null
    });

    supabase.from.mockReturnValueOnce(updateQuery);

    const result = await updateAdminClinic({
      clinicId: 'clinic-1',
      updates: {
        name: '  Updated Clinic  ',
        province: ' Gauteng ',
        district: 'Johannesburg',
        area: 'Hillbrow',
        municipality: 'City of Johannesburg',
        region: 'Johannesburg Metro',
        facility_type: 'Clinic',
        address: '12 Claim Street',
        services_offered: 'Primary Care;Immunisation',
        contact_website: 'https://clinic.example.org'
      }
    });

    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Updated Clinic',
        province: 'Gauteng',
        contact_website: 'https://clinic.example.org',
        updated_at: expect.any(String)
      })
    );

    expect(result).toMatchObject({
      id: 'clinic-1',
      name: 'Updated Clinic',
      is_active: true,
      source_dataset: 'dataset.csv'
    });
  });

  test('rejects an empty clinic name', async () => {
    await expect(
      updateAdminClinic({
        clinicId: 'clinic-1',
        updates: {
          name: '   ',
          province: '',
          district: '',
          area: '',
          municipality: '',
          region: '',
          facility_type: '',
          address: '',
          services_offered: '',
          contact_website: ''
        }
      })
    ).rejects.toMatchObject({
      message: 'Clinic name is required.',
      statusCode: 400
    });
  });

  test('rejects unsupported update fields', async () => {
    await expect(
      updateAdminClinic({
        clinicId: 'clinic-1',
        updates: {
          name: 'Clinic',
          province: '',
          district: '',
          area: '',
          municipality: '',
          region: '',
          facility_type: '',
          address: '',
          services_offered: '',
          contact_website: '',
          latitude: '-26.1'
        }
      })
    ).rejects.toMatchObject({
      message: 'Unsupported clinic field(s): latitude',
      statusCode: 400
    });
  });

  test('returns 404 when updating an unknown clinic', async () => {
    supabase.from.mockReturnValueOnce(
      createMockQuery({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' }
      })
    );

    await expect(
      updateAdminClinic({
        clinicId: 'missing-clinic',
        updates: {
          name: 'Clinic',
          province: '',
          district: '',
          area: '',
          municipality: '',
          region: '',
          facility_type: '',
          address: '',
          services_offered: '',
          contact_website: ''
        }
      })
    ).rejects.toMatchObject({
      message: 'Clinic not found.',
      statusCode: 404
    });
  });
});
