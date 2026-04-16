const supabase = require('../../lib/supabaseClient');

const STAFF_REQUEST_STATUSES = ['approved', 'rejected'];

/**
 * Creates a standard service error with an HTTP status code.
 * This keeps controller responses consistent.
 */
function createServiceError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
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
    .select(`
      id,
      user_id,
      full_name,
      clinic_id,
      staff_id,
      status,
      reviewed_by,
      reviewed_at,
      created_at,
      updated_at
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    throw createServiceError('Failed to fetch pending staff requests.', 500);
  }

  return Array.isArray(data) ? data : [];
}

/**
 * Fetches one staff request before review.
 * The admin service uses this to check that the request exists and is still pending.
 */
async function fetchStaffRequestById(requestId) {
  const { data, error } = await supabase
    .from('staff_requests')
    .select(`
      id,
      user_id,
      full_name,
      clinic_id,
      staff_id,
      status,
      reviewed_by,
      reviewed_at,
      created_at,
      updated_at
    `)
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

  // Only approval changes the user role.
  // Rejection should not give the requester staff access.
  if (status === 'approved') {
    approvedProfile = await approveUserProfile(staffRequest);
  }

  const reviewedAt = new Date().toISOString();

  const { data: updatedRequest, error: updateError } = await supabase
    .from('staff_requests')
    .update({
      status,
      reviewed_by: adminId,
      reviewed_at: reviewedAt,
      updated_at: reviewedAt
    })
    .eq('id', requestId)
    .select(`
      id,
      user_id,
      full_name,
      clinic_id,
      staff_id,
      status,
      reviewed_by,
      reviewed_at,
      created_at,
      updated_at
    `)
    .single();

  if (updateError || !updatedRequest) {
    throw createServiceError('Failed to update staff registration request.', 500);
  }

  return {
    staff_request: updatedRequest,
    profile: approvedProfile
  };
}

module.exports = {
  fetchPendingStaffRequests,
  reviewStaffRequest
};