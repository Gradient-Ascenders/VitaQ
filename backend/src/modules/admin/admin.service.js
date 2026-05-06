const supabase = require('../../lib/supabaseClient');

const STAFF_REQUEST_STATUSES = ['approved', 'rejected'];
const ADMIN_CLINIC_LIST_FIELDS = `
  id,
  name,
  province,
  district,
  area,
  municipality,
  region,
  facility_type,
  is_active,
  updated_at
`;
const ADMIN_CLINIC_DETAIL_FIELDS = `
  id,
  name,
  province,
  district,
  area,
  municipality,
  region,
  facility_type,
  services_offered,
  latitude,
  longitude,
  contact_website,
  is_active,
  source_dataset,
  source_record_id,
  source_last_updated,
  created_at,
  updated_at
`;
const STAFF_REQUEST_SELECT_FIELDS = `
  id,
  user_id,
  full_name,
  clinic_id,
  staff_id,
  status,
  reviewed_by,
  reviewed_at,
  created_at,
  updated_at,
  clinic:clinics (
    id,
    name
  )
`;

/**
 * Creates a standard service error with an HTTP status code.
 * This keeps controller responses consistent.
 */
function createServiceError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeClinicRecord(clinic) {
  return {
    id: clinic?.id || '',
    name: clinic?.name || '',
    province: clinic?.province || '',
    district: clinic?.district || '',
    area: clinic?.area || '',
    municipality: clinic?.municipality || '',
    region: clinic?.region || '',
    facility_type: clinic?.facility_type || '',
    services_offered: clinic?.services_offered || '',
    latitude: clinic?.latitude ?? null,
    longitude: clinic?.longitude ?? null,
    contact_website: clinic?.contact_website || '',
    is_active: clinic?.is_active ?? true,
    source_dataset: clinic?.source_dataset || '',
    source_record_id: clinic?.source_record_id || '',
    source_last_updated: clinic?.source_last_updated || null,
    created_at: clinic?.created_at || null,
    updated_at: clinic?.updated_at || null
  };
}

function normalizeClinicSummary(clinic) {
  return {
    id: clinic?.id || '',
    name: clinic?.name || '',
    province: clinic?.province || '',
    district: clinic?.district || '',
    area: clinic?.area || '',
    municipality: clinic?.municipality || '',
    region: clinic?.region || '',
    facility_type: clinic?.facility_type || '',
    is_active: clinic?.is_active ?? true,
    updated_at: clinic?.updated_at || null
  };
}

function cleanOptionalClinicText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeClinicUpdatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw createServiceError('Clinic update payload is required.', 400);
  }

  const allowedFields = [
    'name',
    'province',
    'district',
    'area',
    'municipality',
    'region',
    'facility_type',
    'services_offered',
    'contact_website',
    'is_active'
  ];
  const payloadKeys = Object.keys(payload);
  const invalidFields = payloadKeys.filter((key) => !allowedFields.includes(key));

  if (invalidFields.length > 0) {
    throw createServiceError(
      `Unsupported clinic field(s): ${invalidFields.join(', ')}`,
      400
    );
  }

  const name = cleanOptionalClinicText(payload.name);

  if (!name) {
    throw createServiceError('Clinic name is required.', 400);
  }

  return {
    name,
    province: cleanOptionalClinicText(payload.province),
    district: cleanOptionalClinicText(payload.district),
    area: cleanOptionalClinicText(payload.area),
    municipality: cleanOptionalClinicText(payload.municipality),
    region: cleanOptionalClinicText(payload.region),
    facility_type: cleanOptionalClinicText(payload.facility_type),
    services_offered: cleanOptionalClinicText(payload.services_offered),
    contact_website: cleanOptionalClinicText(payload.contact_website)
  };
}

/**
 * Fetches all pending staff registration requests for the admin dashboard.
 *
 * Admins use this list to decide whether each requester should become
 * approved clinic staff or be rejected.
 */
async function fetchPendingStaffRequests() {
  const { data, error } = await supabase
    .from('staff_requests')
    .select(STAFF_REQUEST_SELECT_FIELDS)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    throw createServiceError('Failed to fetch pending staff requests.', 500);
  }

  return Array.isArray(data) ? data : [];
}

async function fetchAdminClinics() {
  const { data, error } = await supabase
    .from('clinics')
    .select(ADMIN_CLINIC_LIST_FIELDS)
    .order('name', { ascending: true });

  if (error) {
    throw createServiceError('Failed to fetch clinics for admin management.', 500);
  }

  return Array.isArray(data) ? data.map(normalizeClinicSummary) : [];
}

async function fetchAdminClinicById(clinicId) {
  if (!clinicId) {
    throw createServiceError('Clinic ID is required.', 400);
  }

  const { data, error } = await supabase
    .from('clinics')
    .select(ADMIN_CLINIC_DETAIL_FIELDS)
    .eq('id', clinicId)
    .single();

  if (error || !data) {
    if (error?.code === 'PGRST116') {
      throw createServiceError('Clinic not found.', 404);
    }

    throw createServiceError('Failed to load clinic details.', 500);
  }

  return normalizeClinicRecord(data);
}

async function updateAdminClinic({ clinicId, updates }) {
  if (!clinicId) {
    throw createServiceError('Clinic ID is required.', 400);
  }

  const normalizedUpdates = normalizeClinicUpdatePayload(updates);
  const updatedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from('clinics')
    .update({
      ...normalizedUpdates,
      updated_at: updatedAt
    })
    .eq('id', clinicId)
    .select(ADMIN_CLINIC_DETAIL_FIELDS)
    .single();

  if (error || !data) {
    if (error?.code === 'PGRST116') {
      throw createServiceError('Clinic not found.', 404);
    }

    throw createServiceError('Failed to update clinic details.', 500);
  }

  return normalizeClinicRecord(data);
}

/**
 * Fetches one staff request before review.
 * The admin service uses this to check that the request exists and is still pending.
 */
async function fetchStaffRequestById(requestId) {
  const { data, error } = await supabase
    .from('staff_requests')
    .select(STAFF_REQUEST_SELECT_FIELDS)
    .eq('id', requestId)
    .single();

  if (error || !data) {
    throw createServiceError('Staff registration request not found.', 404);
  }

  return data;
}

/**
 * Updates the user's profile after approval.
 *
 * Approval must update profiles.role to staff, otherwise the user would still
 * be blocked by staff-only route protection even though the request was approved.
 */
async function approveUserProfile(staffRequest) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      {
        user_id: staffRequest.user_id,
        role: 'staff',
        clinic_id: staffRequest.clinic_id,
        updated_at: new Date().toISOString()
      },
      {
        onConflict: 'user_id'
      }
    )
    .select(`
      user_id,
      role,
      clinic_id,
      created_at,
      updated_at
    `)
    .single();

  if (error || !data) {
    throw createServiceError('Failed to update approved staff profile.', 500);
  }

  return data;
}

/**
 * Updates one staff request to the reviewed status selected by the admin.
 * This is used for both approve and reject actions.
 */
async function updateReviewedStaffRequest({ requestId, adminId, status, reviewedAt }) {
  const { data: updatedRequest, error: updateError } = await supabase
    .from('staff_requests')
    .update({
      status,
      reviewed_by: adminId,
      reviewed_at: reviewedAt,
      updated_at: reviewedAt
    })
    .eq('id', requestId)
    .select(STAFF_REQUEST_SELECT_FIELDS)
    .single();

  if (updateError || !updatedRequest) {
    throw createServiceError('Failed to update staff registration request.', 500);
  }

  return updatedRequest;
}

/**
 * Restores a request back to pending if approval cannot finish safely.
 * This keeps the request and profile data aligned for the current sprint.
 */
async function rollbackStaffRequestToPending(requestId) {
  const rollbackTime = new Date().toISOString();
  const { error } = await supabase
    .from('staff_requests')
    .update({
      status: 'pending',
      reviewed_by: null,
      reviewed_at: null,
      updated_at: rollbackTime
    })
    .eq('id', requestId);

  if (error) {
    throw createServiceError(
      'Failed to restore the staff registration request after approval failed.',
      500
    );
  }
}

/**
 * Approves or rejects a staff registration request.
 *
 * On approval:
 * - the user's profile role is changed to staff
 * - the request is marked approved
 *
 * On rejection:
 * - only the request status changes
 * - the user remains a normal non-staff user
 */
async function reviewStaffRequest({ requestId, adminId, status }) {
  if (!requestId || !adminId || !status) {
    throw createServiceError('request_id, admin_id, and status are required.', 400);
  }

  if (!STAFF_REQUEST_STATUSES.includes(status)) {
    throw createServiceError('Invalid staff request review status.', 400);
  }

  const staffRequest = await fetchStaffRequestById(requestId);

  if (staffRequest.status !== 'pending') {
    throw createServiceError('Only pending staff requests can be reviewed.', 409);
  }

  let approvedProfile = null;
  const reviewedAt = new Date().toISOString();

  if (status === 'rejected') {
    const rejectedRequest = await updateReviewedStaffRequest({
      requestId,
      adminId,
      status,
      reviewedAt
    });

    return {
      staff_request: rejectedRequest,
      profile: null
    };
  }

  const approvedRequest = await updateReviewedStaffRequest({
    requestId,
    adminId,
    status,
    reviewedAt
  });

  try {
    // Only approval changes the user role.
    approvedProfile = await approveUserProfile(staffRequest);
  } catch (error) {
    try {
      await rollbackStaffRequestToPending(requestId);
    } catch (rollbackError) {
      throw createServiceError(
        `${error.message} Rollback also failed: ${rollbackError.message}`,
        500
      );
    }

    throw error;
  }

  return {
    staff_request: approvedRequest,
    profile: approvedProfile
  };
}

module.exports = {
  fetchPendingStaffRequests,
  reviewStaffRequest,
  fetchAdminClinics,
  fetchAdminClinicById,
  updateAdminClinic
};
