const { createStaffRequest } = require('./staff.service');

/**
 * Handles POST /api/staff/requests.
 *
 * A logged-in user submits their staff registration details.
 * The service creates a pending staff_requests row, but does not
 * give the user staff access yet. Admin approval happens later.
 */
async function submitStaffRequest(req, res) {
  try {
    // authMiddleware attaches the logged-in Supabase user to req.user.
    const userId = req.user.id;

    // The frontend should send these fields using the database-style names.
    const {
      full_name: fullName,
      clinic_id: clinicId,
      staff_id: staffId
    } = req.body;

    const staffRequest = await createStaffRequest({
      userId,
      fullName,
      clinicId,
      staffId
    });

    return res.status(201).json({
      success: true,
      message: 'Staff registration request submitted and is pending admin approval.',
      data: staffRequest
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to submit staff registration request.'
    });
  }
}

module.exports = {
  submitStaffRequest
};