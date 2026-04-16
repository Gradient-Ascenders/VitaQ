const supabase = require('../../lib/supabaseClient');

/**
 * Creates a standard service error with an HTTP status code.
 * The controller can use statusCode to return the correct HTTP response.
 */
function createServiceError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * Keeps text fields safe and consistent before saving.
 */
function cleanText(value) {
  return typeof value === 'string' ? value.trim() : value;
}

/**
 * Creates a staff registration request for a logged-in user.
 *
 * Important rule:
 * This does NOT make the user staff immediately.
 * It only creates a pending request that an admin must approve later.
 */
async function createStaffRequest({ userId, fullName, clinicId, staffId }) {
  const cleanedFullName = cleanText(fullName);
  const cleanedStaffId = cleanText(staffId);

  // Validate the minimum fields needed for a staff onboarding request.
  if (!userId || !cleanedFullName || !clinicId || !cleanedStaffId) {
    throw createServiceError(
      'user_id, full_name, clinic_id, and staff_id are required.',
      400
    );
  }

  // Check for active requests before inserting a new one.
  // Pending means the admin has not reviewed it yet.
  // Approved means the user is already accepted as staff.
  const { data: existingRequests, error: existingError } = await supabase
    .from('staff_requests')
    .select('id, user_id, status')
    .eq('user_id', userId)
    .in('status', ['pending', 'approved'])
    .limit(1);

  if (existingError) {
    throw createServiceError('Failed to check existing staff request.', 500);
  }

  if (existingRequests && existingRequests.length > 0) {
    const existingRequest = existingRequests[0];

    if (existingRequest.status === 'pending') {
      throw createServiceError(
        'A staff registration request is already pending approval.',
        409
      );
    }

    if (existingRequest.status === 'approved') {
      throw createServiceError(
        'This user is already approved as staff.',
        409
      );
    }
  }

  // Insert the request as pending. Admin approval will happen in a separate flow.
  const { data: staffRequest, error: insertError } = await supabase
    .from('staff_requests')
    .insert([
      {
        user_id: userId,
        full_name: cleanedFullName,
        clinic_id: clinicId,
        staff_id: cleanedStaffId,
        status: 'pending'
      }
    ])
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

  if (insertError || !staffRequest) {
    throw createServiceError('Failed to create staff registration request.', 500);
  }

  return staffRequest;
}

module.exports = {
  createStaffRequest
};